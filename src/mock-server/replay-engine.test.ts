import { WsMessageType } from '../shared/types/message-types';
import type { WsMessage } from '../shared/types/message-types';
import type { WsCaptureScenario } from './types/capture-types';
import { MockSessionPhase } from './types/capture-types';
import { CaptureStore } from './capture-store';
import { ReplayEngine } from './replay-engine';

function createLoginScenario(): WsCaptureScenario {
  return {
    name: 'login-test',
    description: 'Login flow',
    capturedAt: '2026-02-11',
    serverInfo: { world: 'Shamba', zone: 'BETA', date: '2026-02-11' },
    exchanges: [
      {
        id: 'ex-001',
        timestamp: '2026-02-11T10:00:00Z',
        request: {
          type: WsMessageType.REQ_CONNECT_DIRECTORY,
          wsRequestId: 'captured-r1',
          username: 'SPO_test3',
          password: '***',
          zonePath: 'Root/Areas/Asia/Worlds',
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_CONNECT_SUCCESS,
          wsRequestId: 'captured-r1',
          worlds: [{ name: 'Shamba', url: 'http://test.com' }],
        } as WsMessage],
      },
      {
        id: 'ex-002',
        timestamp: '2026-02-11T10:00:01Z',
        request: {
          type: WsMessageType.REQ_LOGIN_WORLD,
          wsRequestId: 'captured-r2',
          username: 'SPO_test3',
          password: '***',
          worldName: 'Shamba',
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_LOGIN_SUCCESS,
          wsRequestId: 'captured-r2',
          tycoonId: '12345',
          contextId: '67890',
          companyCount: 1,
        } as WsMessage],
        delayMs: 200,
      },
      {
        id: 'ex-003',
        timestamp: '2026-02-11T10:00:02Z',
        request: {
          type: WsMessageType.REQ_SELECT_COMPANY,
          wsRequestId: 'captured-r3',
          companyId: '99',
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: 'captured-r3',
          result: 'OK',
        } as WsMessage],
      },
    ],
  };
}

function createBuildingScenario(): WsCaptureScenario {
  return {
    name: 'building-test',
    description: 'Building focus',
    capturedAt: '2026-02-11',
    serverInfo: { world: 'Shamba', zone: 'BETA', date: '2026-02-11' },
    exchanges: [
      {
        id: 'ex-010',
        timestamp: '',
        request: {
          type: WsMessageType.REQ_BUILDING_FOCUS,
          wsRequestId: 'captured-bf1',
          x: 100,
          y: 200,
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_BUILDING_FOCUS,
          wsRequestId: 'captured-bf1',
          building: {
            buildingId: 'b1',
            buildingName: 'Test Building',
            ownerName: 'SPO_test3',
            x: 100,
            y: 200,
          },
        } as WsMessage],
      },
      {
        id: 'ex-011',
        timestamp: '',
        request: {
          type: WsMessageType.REQ_BUILDING_FOCUS,
          wsRequestId: 'captured-bf2',
          x: 300,
          y: 400,
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_BUILDING_FOCUS,
          wsRequestId: 'captured-bf2',
          building: {
            buildingId: 'b2',
            buildingName: 'Other Building',
            ownerName: 'Admin',
            x: 300,
            y: 400,
          },
        } as WsMessage],
      },
    ],
  };
}

describe('ReplayEngine', () => {
  let store: CaptureStore;
  let engine: ReplayEngine;

  beforeEach(() => {
    store = new CaptureStore();
    engine = new ReplayEngine(store);
  });

  describe('basic matching', () => {
    it('should match a request by type', () => {
      store.addWsScenario(createLoginScenario());

      const result = engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'client-r1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-001');
      expect(result!.responses).toHaveLength(1);
      expect(result!.responses[0].type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
    });

    it('should return null for unknown message types', () => {
      store.addWsScenario(createLoginScenario());

      const result = engine.match({
        type: WsMessageType.REQ_CHAT_SEND_MESSAGE,
        wsRequestId: 'unknown-1',
        message: 'hello',
      } as WsMessage);

      expect(result).toBeNull();
    });
  });

  describe('wsRequestId rewriting', () => {
    it('should rewrite wsRequestId in responses to match client request', () => {
      store.addWsScenario(createLoginScenario());

      const result = engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'my-unique-id-123',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(result).not.toBeNull();
      // Response must have the CLIENT's wsRequestId, not the captured one
      expect(result!.responses[0].wsRequestId).toBe('my-unique-id-123');
    });

    it('should not mutate the original captured response', () => {
      const scenario = createLoginScenario();
      store.addWsScenario(scenario);

      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'client-id',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      // Original capture should still have the captured ID
      expect(scenario.exchanges[0].responses[0].wsRequestId).toBe('captured-r1');
    });
  });

  describe('key field matching', () => {
    it('should match building focus by x,y coordinates', () => {
      store.addWsScenario(createBuildingScenario());

      // Request building at (300, 400) — should match ex-011, not ex-010
      const result = engine.match({
        type: WsMessageType.REQ_BUILDING_FOCUS,
        wsRequestId: 'client-bf',
        x: 300,
        y: 400,
      } as WsMessage);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-011');
      const resp = result!.responses[0] as unknown as Record<string, unknown>;
      const building = resp.building as Record<string, unknown>;
      expect(building.buildingName).toBe('Other Building');
    });

    it('should match building at different coordinates', () => {
      store.addWsScenario(createBuildingScenario());

      const result = engine.match({
        type: WsMessageType.REQ_BUILDING_FOCUS,
        wsRequestId: 'client-bf',
        x: 100,
        y: 200,
      } as WsMessage);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-010');
    });
  });

  describe('Nth occurrence fallback', () => {
    it('should use Nth match when exact/key fields dont match', () => {
      store.addWsScenario(createBuildingScenario());

      // Focus building at coordinates NOT in any capture
      const result = engine.match({
        type: WsMessageType.REQ_BUILDING_FOCUS,
        wsRequestId: 'client-bf',
        x: 999,
        y: 888,
      } as WsMessage);

      // Should still return something (Nth fallback)
      expect(result).not.toBeNull();
    });
  });

  describe('session state tracking', () => {
    it('should track state through login flow', () => {
      store.addWsScenario(createLoginScenario());

      // Connect
      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(engine.getState().phase).toBe(MockSessionPhase.DIRECTORY_CONNECTED);

      // Login
      engine.match({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);

      expect(engine.getState().phase).toBe(MockSessionPhase.WORLD_CONNECTED);
      expect(engine.getState().currentWorld).toBe('Shamba');

      // Select company
      engine.match({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 's1',
        companyId: '99',
      } as WsMessage);

      expect(engine.getState().phase).toBe(MockSessionPhase.COMPANY_SELECTED);
      expect(engine.getState().currentCompany).toBe('99');
    });
  });

  describe('delay handling', () => {
    it('should return delay from captured exchange', () => {
      store.addWsScenario(createLoginScenario());

      // Login has delayMs: 200
      // First consume connect
      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      const result = engine.match({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);

      expect(result).not.toBeNull();
      expect(result!.delayMs).toBe(200);
    });

    it('should return 0 delay when not specified', () => {
      store.addWsScenario(createLoginScenario());

      const result = engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(result!.delayMs).toBe(0);
    });
  });

  describe('exchange consumption', () => {
    it('should consume exchanges and not reuse them', () => {
      store.addWsScenario(createBuildingScenario());

      // First request consumes ex-010
      const result1 = engine.match({
        type: WsMessageType.REQ_BUILDING_FOCUS,
        wsRequestId: 'bf1',
        x: 100,
        y: 200,
      } as WsMessage);
      expect(result1!.exchange.id).toBe('ex-010');

      // Second request with same coords — ex-010 already consumed, should use ex-011 as fallback
      const result2 = engine.match({
        type: WsMessageType.REQ_BUILDING_FOCUS,
        wsRequestId: 'bf2',
        x: 100,
        y: 200,
      } as WsMessage);
      // ex-010 consumed, ex-011 has different coords so key fields don't match
      // Falls to Nth match
      expect(result2).not.toBeNull();
      expect(result2!.exchange.id).toBe('ex-011');
    });

    it('should wrap around when all exchanges are consumed', () => {
      const scenario: WsCaptureScenario = {
        name: 'single',
        description: '',
        capturedAt: '',
        serverInfo: { world: '', zone: '', date: '' },
        exchanges: [{
          id: 'ex-only',
          timestamp: '',
          request: { type: WsMessageType.REQ_CHAT_GET_USERS, wsRequestId: 'x' },
          responses: [{ type: WsMessageType.RESP_CHAT_USER_LIST, wsRequestId: 'x' }],
        }],
      };
      store.addWsScenario(scenario);

      // First match consumes ex-only
      const r1 = engine.match({ type: WsMessageType.REQ_CHAT_GET_USERS, wsRequestId: 'a' });
      expect(r1).not.toBeNull();

      // Second match — all consumed, should wrap around
      const r2 = engine.match({ type: WsMessageType.REQ_CHAT_GET_USERS, wsRequestId: 'b' });
      expect(r2).not.toBeNull();
      expect(r2!.responses[0].wsRequestId).toBe('b');
    });
  });

  describe('reset', () => {
    it('should reset state and consumed exchanges', () => {
      store.addWsScenario(createLoginScenario());

      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(engine.getState().phase).toBe(MockSessionPhase.DIRECTORY_CONNECTED);
      expect(engine.getConsumedExchangeIds().size).toBe(1);

      engine.reset();

      expect(engine.getState().phase).toBe(MockSessionPhase.DISCONNECTED);
      expect(engine.getConsumedExchangeIds().size).toBe(0);
    });
  });

  describe('multiple response messages', () => {
    it('should return all response messages for an exchange', () => {
      const scenario: WsCaptureScenario = {
        name: 'multi-resp',
        description: '',
        capturedAt: '',
        serverInfo: { world: '', zone: '', date: '' },
        exchanges: [{
          id: 'ex-multi',
          timestamp: '',
          request: { type: WsMessageType.REQ_MAP_LOAD, wsRequestId: 'ml1' },
          responses: [
            { type: WsMessageType.RESP_MAP_DATA, wsRequestId: 'ml1' },
            { type: WsMessageType.EVENT_MAP_DATA, wsRequestId: 'ml1' },
          ],
        }],
      };
      store.addWsScenario(scenario);

      const result = engine.match({
        type: WsMessageType.REQ_MAP_LOAD,
        wsRequestId: 'client-ml',
      });

      expect(result).not.toBeNull();
      expect(result!.responses).toHaveLength(2);
      expect(result!.responses[0].type).toBe(WsMessageType.RESP_MAP_DATA);
      expect(result!.responses[1].type).toBe(WsMessageType.EVENT_MAP_DATA);
      // Both should have the client's requestId
      expect(result!.responses[0].wsRequestId).toBe('client-ml');
      expect(result!.responses[1].wsRequestId).toBe('client-ml');
    });
  });
});
