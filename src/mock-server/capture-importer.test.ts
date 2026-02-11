import { WsMessageType } from '../shared/types/message-types';
import { parseCaptureTxt, buildScenario, importCaptureTxt } from './capture-importer';

const MINIMAL_CAPTURE = `
=== SCENARIO: login-test ===
DESCRIPTION: Minimal login flow
SERVER: Shamba / BETA
DATE: 2026-02-11

--- WS CLIENT → SERVER ---
{"type":"REQ_CONNECT_DIRECTORY","wsRequestId":"abc123","username":"SPO_test3","password":"***","zonePath":"Root/Areas/Asia/Worlds"}

--- WS SERVER → CLIENT (response to abc123) ---
{"type":"RESP_CONNECT_SUCCESS","wsRequestId":"abc123","worlds":[{"name":"Shamba","url":"http://example.com","players":5}]}

=== END SCENARIO ===
`;

const FULL_LOGIN_CAPTURE = `
=== SCENARIO: login-select-company ===
DESCRIPTION: Flow complet de login
SERVER: Shamba / BETA zone
DATE: 2026-02-11

--- WS CLIENT → SERVER ---
{"type":"REQ_CONNECT_DIRECTORY","wsRequestId":"m1a2b3","username":"SPO_test3","password":"***","zonePath":"Root/Areas/Asia/Worlds"}

--- WS SERVER → CLIENT (response to m1a2b3) ---
{"type":"RESP_CONNECT_SUCCESS","wsRequestId":"m1a2b3","worlds":[{"name":"Shamba","url":"http://test.com","players":5}]}

--- DELAY 200ms ---

--- WS CLIENT → SERVER ---
{"type":"REQ_LOGIN_WORLD","wsRequestId":"m4d5e6","username":"SPO_test3","password":"***","worldName":"Shamba"}

--- WS SERVER → CLIENT (response to m4d5e6) ---
{"type":"RESP_LOGIN_SUCCESS","wsRequestId":"m4d5e6","tycoonId":"12345","contextId":"67890","companyCount":1,"companies":[{"id":"99","name":"Shamba Corp","ownerRole":"President"}]}

--- WS CLIENT → SERVER ---
{"type":"REQ_SELECT_COMPANY","wsRequestId":"m7g8h9","companyId":"99"}

--- WS SERVER → CLIENT (response to m7g8h9) ---
{"type":"RESP_RDO_RESULT","wsRequestId":"m7g8h9","result":"OK"}

--- NOTE: After company select, server starts pushing tycoon updates ---

--- WS SERVER → CLIENT (event, no request) ---
{"type":"EVENT_TYCOON_UPDATE","cash":"1500000","incomePerHour":"25000","ranking":3,"buildingCount":12,"maxBuildings":50}

=== END SCENARIO ===
`;

const CAPTURE_WITH_HTTP = `
=== SCENARIO: http-test ===
DESCRIPTION: Test HTTP capture
SERVER: Shamba / BETA
DATE: 2026-02-11

--- HTTP GET /api/road-block-classes ---
RESPONSE 200 application/json
{"files":[{"filename":"Road_0.ini","content":"[General]\\nClass=0"}]}

--- HTTP GET /api/terrain-atlas/Earth/2 ---
RESPONSE 200 image/png
FILE: terrain-atlas-earth-2.png

--- HTTP GET /api/object-atlas/road/manifest ---
RESPONSE 200 application/json
{"textures":{"road_0":{"x":0,"y":0,"w":64,"h":49}}}

=== END SCENARIO ===
`;

describe('Capture Importer', () => {
  describe('parseCaptureTxt', () => {
    it('should parse scenario header', () => {
      const result = parseCaptureTxt(MINIMAL_CAPTURE);
      expect(result.header.scenarioName).toBe('login-test');
      expect(result.header.description).toBe('Minimal login flow');
      expect(result.header.server).toBe('Shamba / BETA');
      expect(result.header.date).toBe('2026-02-11');
    });

    it('should parse client-to-server WS messages', () => {
      const result = parseCaptureTxt(MINIMAL_CAPTURE);
      const clientMsgs = result.wsMessages.filter(m => m.direction === 'client-to-server');
      expect(clientMsgs).toHaveLength(1);
      expect(clientMsgs[0].data.type).toBe(WsMessageType.REQ_CONNECT_DIRECTORY);
      expect(clientMsgs[0].data.wsRequestId).toBe('abc123');
    });

    it('should parse server-to-client responses with requestId', () => {
      const result = parseCaptureTxt(MINIMAL_CAPTURE);
      const serverMsgs = result.wsMessages.filter(m => m.direction === 'server-to-client');
      expect(serverMsgs).toHaveLength(1);
      expect(serverMsgs[0].data.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
      expect(serverMsgs[0].responseToRequestId).toBe('abc123');
    });

    it('should parse full login flow with multiple exchanges', () => {
      const result = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      const clientMsgs = result.wsMessages.filter(m => m.direction === 'client-to-server');
      const serverMsgs = result.wsMessages.filter(m => m.direction === 'server-to-client');

      expect(clientMsgs).toHaveLength(3); // connect, login, select
      expect(serverMsgs).toHaveLength(4); // 3 responses + 1 event
    });

    it('should parse DELAY markers', () => {
      const result = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      // DELAY 200ms appears before the second client message (index 2 in wsMessages)
      // First client msg is at index 0, first server msg at index 1
      // DELAY is before second client msg which would be at index 2
      expect(result.delays.size).toBeGreaterThan(0);
    });

    it('should identify event messages (no request)', () => {
      const result = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      const events = result.wsMessages.filter(m => m.isEvent);
      expect(events).toHaveLength(1);
      expect(events[0].data.type).toBe(WsMessageType.EVENT_TYCOON_UPDATE);
    });

    it('should parse NOTE markers', () => {
      const result = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      expect(result.notes.length).toBeGreaterThan(0);
      expect(result.notes[0]).toContain('company select');
    });

    it('should parse HTTP captures', () => {
      const result = parseCaptureTxt(CAPTURE_WITH_HTTP);
      expect(result.httpCaptures).toHaveLength(3);

      expect(result.httpCaptures[0].method).toBe('GET');
      expect(result.httpCaptures[0].url).toBe('/api/road-block-classes');
      expect(result.httpCaptures[0].status).toBe(200);
      expect(result.httpCaptures[0].contentType).toBe('application/json');
      expect(result.httpCaptures[0].body).toBeDefined();
    });

    it('should parse HTTP FILE references', () => {
      const result = parseCaptureTxt(CAPTURE_WITH_HTTP);
      const pngCapture = result.httpCaptures.find(c => c.url.includes('terrain-atlas'));
      expect(pngCapture).toBeDefined();
      expect(pngCapture!.bodyFile).toBe('terrain-atlas-earth-2.png');
    });
  });

  describe('buildScenario', () => {
    it('should build scenario with correct metadata', () => {
      const parsed = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      const { scenario } = buildScenario(parsed);

      expect(scenario.name).toBe('login-select-company');
      expect(scenario.description).toBe('Flow complet de login');
      expect(scenario.serverInfo.world).toBe('Shamba');
      expect(scenario.serverInfo.zone).toBe('BETA zone');
    });

    it('should pair requests with responses by wsRequestId', () => {
      const parsed = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      const { scenario } = buildScenario(parsed);

      expect(scenario.exchanges).toHaveLength(3); // 3 request-response pairs

      // First exchange: connect directory
      expect(scenario.exchanges[0].request!.type).toBe(WsMessageType.REQ_CONNECT_DIRECTORY);
      expect(scenario.exchanges[0].responses).toHaveLength(1);
      expect(scenario.exchanges[0].responses[0].type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);

      // Second exchange: login world
      expect(scenario.exchanges[1].request!.type).toBe(WsMessageType.REQ_LOGIN_WORLD);
      expect(scenario.exchanges[1].responses).toHaveLength(1);
      expect(scenario.exchanges[1].responses[0].type).toBe(WsMessageType.RESP_LOGIN_SUCCESS);

      // Third exchange: select company
      expect(scenario.exchanges[2].request!.type).toBe(WsMessageType.REQ_SELECT_COMPANY);
      expect(scenario.exchanges[2].responses).toHaveLength(1);
    });

    it('should create scheduled events from EVENT_* messages', () => {
      const parsed = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      const { scenario } = buildScenario(parsed);

      expect(scenario.scheduledEvents).toBeDefined();
      expect(scenario.scheduledEvents).toHaveLength(1);
      expect(scenario.scheduledEvents![0].event.type).toBe(WsMessageType.EVENT_TYCOON_UPDATE);
    });

    it('should assign unique exchange IDs', () => {
      const parsed = parseCaptureTxt(FULL_LOGIN_CAPTURE);
      const { scenario } = buildScenario(parsed);

      const ids = scenario.exchanges.map(e => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should build HTTP responses', () => {
      const parsed = parseCaptureTxt(CAPTURE_WITH_HTTP);
      const { httpResponses } = buildScenario(parsed);

      expect(httpResponses).toHaveLength(3);

      expect(httpResponses[0].urlPattern).toBe('/api/road-block-classes');
      expect(httpResponses[0].method).toBe('GET');
      expect(httpResponses[0].status).toBe(200);
      expect(httpResponses[0].bodyJson).toBeDefined();

      // Binary file reference
      expect(httpResponses[1].bodyFile).toBe('terrain-atlas-earth-2.png');
    });
  });

  describe('importCaptureTxt (end-to-end)', () => {
    it('should produce a complete scenario from raw text', () => {
      const { scenario, httpResponses } = importCaptureTxt(FULL_LOGIN_CAPTURE);

      expect(scenario.name).toBe('login-select-company');
      expect(scenario.exchanges).toHaveLength(3);
      expect(scenario.scheduledEvents).toHaveLength(1);
      expect(httpResponses).toHaveLength(0); // No HTTP in this capture
    });

    it('should handle mixed WS + HTTP captures', () => {
      const mixed = `
=== SCENARIO: mixed ===
DESCRIPTION: Mixed WS and HTTP
SERVER: Shamba / BETA
DATE: 2026-02-11

--- WS CLIENT → SERVER ---
{"type":"REQ_CONNECT_DIRECTORY","wsRequestId":"x1","username":"test","password":"***"}

--- WS SERVER → CLIENT (response to x1) ---
{"type":"RESP_CONNECT_SUCCESS","wsRequestId":"x1","worlds":[]}

--- HTTP GET /api/road-block-classes ---
RESPONSE 200 application/json
{"files":[]}

=== END SCENARIO ===
`;

      const { scenario, httpResponses } = importCaptureTxt(mixed);
      expect(scenario.exchanges).toHaveLength(1);
      expect(httpResponses).toHaveLength(1);
    });
  });
});
