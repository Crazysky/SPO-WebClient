/**
 * Integration Test: Login Flow with Mock Server
 *
 * Tests the complete login sequence using captured data:
 * 1. Connect to directory
 * 2. Login to world
 * 3. Select company
 * 4. Get facility dimensions (init)
 * 5. Connect mail (init)
 * 6. Get profile (init)
 *
 * Uses the login-select-company.capture.json fixture.
 */

import { WsMessageType } from '../../../shared/types/message-types';
import type { WsMessage } from '../../../shared/types/message-types';
import { MockSessionPhase } from '../../types/capture-types';
import { createMockEnvironment, quickScenario } from '../../test-helpers';
import { MockWebSocketClient } from '../../mock-ws-client';

describe('Login Flow Integration', () => {
  describe('with capture file', () => {
    let ws: MockWebSocketClient;
    let cleanup: () => void;

    beforeEach(() => {
      const env = createMockEnvironment({
        wsScenario: 'login-select-company',
      });
      ws = env.ws;
      cleanup = env.cleanup;
    });

    afterEach(() => {
      cleanup();
    });

    it('should connect to directory and receive world list', async () => {
      const resp = await ws.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'int-1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(resp.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
      expect(resp.wsRequestId).toBe('int-1');

      const worlds = (resp as unknown as Record<string, unknown>).worlds as Array<Record<string, unknown>>;
      expect(worlds).toHaveLength(1);
      expect(worlds[0].name).toBe('Shamba');
      expect(worlds[0].running3).toBe(true);
    });

    it('should login to world and receive company list', async () => {
      // Connect first
      await ws.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'int-c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      // Login
      const resp = await ws.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'int-l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);

      expect(resp.type).toBe(WsMessageType.RESP_LOGIN_SUCCESS);

      const loginResp = resp as unknown as Record<string, unknown>;
      expect(loginResp.tycoonId).toBe('12345');
      expect(loginResp.companyCount).toBe(1);

      const companies = loginResp.companies as Array<Record<string, unknown>>;
      expect(companies[0].name).toBe('Shamba Industries');
    });

    it('should complete full login sequence and reach COMPANY_SELECTED phase', async () => {
      // Connect
      await ws.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'int-c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(ws.getSessionState().phase).toBe(MockSessionPhase.DIRECTORY_CONNECTED);

      // Login
      await ws.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'int-l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);

      expect(ws.getSessionState().phase).toBe(MockSessionPhase.WORLD_CONNECTED);
      expect(ws.getSessionState().currentWorld).toBe('Shamba');

      // Select company
      await ws.send({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 'int-s1',
        companyId: '99',
      } as WsMessage);

      expect(ws.getSessionState().phase).toBe(MockSessionPhase.COMPANY_SELECTED);
      expect(ws.getSessionState().currentCompany).toBe('99');
    });

    it('should handle post-login initialization requests', async () => {
      // Complete login flow
      await ws.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      await ws.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);

      await ws.send({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 's1',
        companyId: '99',
      } as WsMessage);

      // Facility dimensions
      const dimResp = await ws.send({
        type: WsMessageType.REQ_GET_ALL_FACILITY_DIMENSIONS,
        wsRequestId: 'fd1',
      });

      expect(dimResp.type).toBe(WsMessageType.RESP_ALL_FACILITY_DIMENSIONS);
      const dims = (dimResp as unknown as Record<string, unknown>).dimensions as Record<string, unknown>;
      expect(Object.keys(dims)).toHaveLength(2);

      // Mail connect
      const mailResp = await ws.send({
        type: WsMessageType.REQ_MAIL_CONNECT,
        wsRequestId: 'mc1',
      });

      expect(mailResp.type).toBe(WsMessageType.RESP_MAIL_CONNECTED);
      expect((mailResp as unknown as Record<string, unknown>).unreadCount).toBe(3);

      // Profile
      const profileResp = await ws.send({
        type: WsMessageType.REQ_GET_PROFILE,
        wsRequestId: 'gp1',
      });

      expect(profileResp.type).toBe(WsMessageType.RESP_GET_PROFILE);
      const profile = (profileResp as unknown as Record<string, unknown>).profile as Record<string, unknown>;
      expect(profile.name).toBe('SPO_test3');
      expect(profile.levelName).toBe('Entrepreneur');
    });

    it('should track complete message log', async () => {
      await ws.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'c1',
        username: 'SPO_test3',
        password: '***',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      await ws.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'l1',
        username: 'SPO_test3',
        password: '***',
        worldName: 'Shamba',
      } as WsMessage);

      await ws.send({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 's1',
        companyId: '99',
      } as WsMessage);

      const log = ws.getMessageLog();
      // 3 sent + 3 received = 6
      expect(log).toHaveLength(6);

      const sent = ws.getSentMessages();
      expect(sent).toHaveLength(3);
      expect(sent.map(m => m.type)).toEqual([
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.REQ_LOGIN_WORLD,
        WsMessageType.REQ_SELECT_COMPANY,
      ]);

      const received = ws.getReceivedMessages();
      expect(received).toHaveLength(3);
      expect(received.map(m => m.type)).toEqual([
        WsMessageType.RESP_CONNECT_SUCCESS,
        WsMessageType.RESP_LOGIN_SUCCESS,
        WsMessageType.RESP_RDO_RESULT,
      ]);
    });
  });

  describe('with quickScenario', () => {
    it('should support inline scenario definition', async () => {
      const scenario = quickScenario([
        {
          request: {
            type: WsMessageType.REQ_CONNECT_DIRECTORY,
            username: 'TestUser',
            password: '***',
          } as never,
          response: {
            type: WsMessageType.RESP_CONNECT_SUCCESS,
            worlds: [{ name: 'TestWorld' }],
          } as never,
        },
      ]);

      const ws = new MockWebSocketClient([scenario]);

      const resp = await ws.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'q1',
        username: 'TestUser',
        password: '***',
      } as WsMessage);

      expect(resp.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
      expect(resp.wsRequestId).toBe('q1');

      ws.reset();
    });
  });
});
