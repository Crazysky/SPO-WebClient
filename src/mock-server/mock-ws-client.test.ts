import { WsMessageType } from '../shared/types/message-types';
import type { WsMessage } from '../shared/types/message-types';
import type { WsCaptureScenario } from './types/capture-types';
import { MockSessionPhase } from './types/capture-types';
import { MockWebSocketClient } from './mock-ws-client';

function createLoginScenario(): WsCaptureScenario {
  return {
    name: 'login-test',
    description: 'Login flow',
    capturedAt: '2026-02-11',
    serverInfo: { world: 'Shamba', zone: 'BETA', date: '2026-02-11' },
    exchanges: [
      {
        id: 'ex-001',
        timestamp: '',
        request: {
          type: WsMessageType.REQ_CONNECT_DIRECTORY,
          wsRequestId: 'cap-r1',
          username: 'SPO_test3',
          password: '***',
          zonePath: 'Root/Areas/Asia/Worlds',
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_CONNECT_SUCCESS,
          wsRequestId: 'cap-r1',
          worlds: [{ name: 'Shamba' }],
        } as WsMessage],
      },
      {
        id: 'ex-002',
        timestamp: '',
        request: {
          type: WsMessageType.REQ_LOGIN_WORLD,
          wsRequestId: 'cap-r2',
          username: 'SPO_test3',
          password: '***',
          worldName: 'Shamba',
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_LOGIN_SUCCESS,
          wsRequestId: 'cap-r2',
          tycoonId: '12345',
          contextId: '67890',
          companyCount: 1,
          companies: [{ id: '99', name: 'Shamba Corp' }],
        } as WsMessage],
        delayMs: 50,
      },
      {
        id: 'ex-003',
        timestamp: '',
        request: {
          type: WsMessageType.REQ_SELECT_COMPANY,
          wsRequestId: 'cap-r3',
          companyId: '99',
        } as WsMessage,
        responses: [{
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: 'cap-r3',
          result: 'OK',
        } as WsMessage],
      },
    ],
    scheduledEvents: [{
      afterMs: 100,
      event: {
        type: WsMessageType.EVENT_TYCOON_UPDATE,
        cash: '1500000',
        incomePerHour: '25000',
        ranking: 3,
        buildingCount: 12,
        maxBuildings: 50,
      } as WsMessage,
    }],
  };
}

describe('MockWebSocketClient', () => {
  let client: MockWebSocketClient;

  beforeEach(() => {
    client = new MockWebSocketClient([createLoginScenario()]);
  });

  afterEach(() => {
    client.reset();
  });

  describe('send (request-response)', () => {
    it('should return matched response for a request', async () => {
      const resp = await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(resp.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
      expect(resp.wsRequestId).toBe('test-1');
    });

    it('should throw for unmatched requests', async () => {
      await expect(
        client.send({
          type: WsMessageType.REQ_CHAT_SEND_MESSAGE,
          wsRequestId: 'test-x',
          message: 'hello',
        } as WsMessage)
      ).rejects.toThrow('No matching capture');
    });

    it('should respect delay from captured exchange', async () => {
      // Connect first
      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      // Login has delayMs: 50
      const start = Date.now();
      await client.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow small timing variance
    });
  });

  describe('message log', () => {
    it('should log all sent and received messages', async () => {
      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      const log = client.getMessageLog();
      expect(log).toHaveLength(2); // 1 sent + 1 received

      expect(log[0].direction).toBe('sent');
      expect(log[0].msg.type).toBe(WsMessageType.REQ_CONNECT_DIRECTORY);

      expect(log[1].direction).toBe('received');
      expect(log[1].msg.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
    });

    it('should separate sent and received messages', async () => {
      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(client.getSentMessages()).toHaveLength(1);
      expect(client.getReceivedMessages()).toHaveLength(1);
    });

    it('should support hasReceived check', async () => {
      expect(client.hasReceived(WsMessageType.RESP_CONNECT_SUCCESS)).toBe(false);

      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(client.hasReceived(WsMessageType.RESP_CONNECT_SUCCESS)).toBe(true);
    });
  });

  describe('event handling', () => {
    it('should emit events from scheduled events', (done) => {
      client.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, (msg) => {
        expect(msg.type).toBe(WsMessageType.EVENT_TYCOON_UPDATE);
        client.stopScheduledEvents();
        done();
      });

      client.startScheduledEvents();
    }, 5000);
  });

  describe('session state', () => {
    it('should track session state through interactions', async () => {
      expect(client.getSessionState().phase).toBe(MockSessionPhase.DISCONNECTED);

      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(client.getSessionState().phase).toBe(MockSessionPhase.DIRECTORY_CONNECTED);
    });
  });

  describe('full login flow', () => {
    it('should complete the full login sequence', async () => {
      // Connect
      const connectResp = await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);
      expect(connectResp.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);

      // Login
      const loginResp = await client.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);
      expect(loginResp.type).toBe(WsMessageType.RESP_LOGIN_SUCCESS);

      // Select company
      const companyResp = await client.send({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 's1',
        companyId: '99',
      } as WsMessage);
      expect(companyResp.type).toBe(WsMessageType.RESP_RDO_RESULT);

      // All 3 exchanges sent + 3 received = 6 total
      expect(client.getMessageLog()).toHaveLength(6);
      expect(client.getSessionState().phase).toBe(MockSessionPhase.COMPANY_SELECTED);
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      client.reset();

      expect(client.getMessageLog()).toHaveLength(0);
      expect(client.getSessionState().phase).toBe(MockSessionPhase.DISCONNECTED);
    });
  });
});
