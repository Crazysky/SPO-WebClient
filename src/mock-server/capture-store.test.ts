/**
 * Unit Tests for CaptureStore
 * Tests scenario storage, retrieval, exchange lookups, and clearing.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CaptureStore } from './capture-store';
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario, WsCaptureExchange } from './types/mock-types';
import type { RdoScenario } from './types/rdo-exchange-types';
import type { HttpScenario } from './types/http-exchange-types';

function makeWsExchange(
  id: string,
  requestType: WsMessageType,
  responseType: WsMessageType
): WsCaptureExchange {
  return {
    id,
    timestamp: '2026-02-18T00:00:00.000Z',
    request: { type: requestType, wsRequestId: id } as WsMessage,
    responses: [{ type: responseType, wsRequestId: id } as WsMessage],
  };
}

function makeWsScenario(
  name: string,
  exchanges: WsCaptureExchange[]
): WsCaptureScenario {
  return {
    name,
    description: `Test scenario: ${name}`,
    capturedAt: '2026-02-18',
    serverInfo: { world: 'Test', zone: 'Test', date: '2026-02-18' },
    exchanges,
  };
}

function makeRdoScenario(name: string): RdoScenario {
  return {
    name,
    description: `RDO scenario: ${name}`,
    exchanges: [
      { id: `${name}-001`, request: 'C 0 idof "Obj"', response: 'A0 objid="1"' },
    ],
    variables: {},
  };
}

function makeHttpScenario(name: string): HttpScenario {
  return {
    name,
    exchanges: [
      {
        id: `${name}-001`,
        method: 'GET',
        urlPattern: '/test/path',
        status: 200,
        contentType: 'text/html',
        body: '<html>OK</html>',
      },
    ],
    variables: {},
  };
}

describe('CaptureStore', () => {
  let store: CaptureStore;

  beforeEach(() => {
    store = new CaptureStore();
  });

  describe('addWsScenario / getWsScenarios', () => {
    it('adds a WS scenario and retrieves it', () => {
      const exchange = makeWsExchange(
        'ws-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      const scenario = makeWsScenario('auth', [exchange]);

      store.addWsScenario(scenario);
      const result = store.getWsScenarios();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('auth');
      expect(result[0].exchanges).toHaveLength(1);
    });

    it('returns empty array when no scenarios loaded', () => {
      expect(store.getWsScenarios()).toEqual([]);
    });

    it('returns defensive copy (not the internal array)', () => {
      const scenario = makeWsScenario('auth', []);
      store.addWsScenario(scenario);

      const first = store.getWsScenarios();
      const second = store.getWsScenarios();

      expect(first).not.toBe(second);
      expect(first).toEqual(second);

      // Mutating the returned array should not affect internal state
      first.push(makeWsScenario('injected', []));
      expect(store.getWsScenarios()).toHaveLength(1);
    });
  });

  describe('addRdoScenario / getRdoScenarios', () => {
    it('adds and retrieves RDO scenario', () => {
      const scenario = makeRdoScenario('auth-rdo');

      store.addRdoScenario(scenario);
      const result = store.getRdoScenarios();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('auth-rdo');
      expect(result[0].exchanges).toHaveLength(1);
    });
  });

  describe('addHttpScenario / getHttpScenarios', () => {
    it('adds and retrieves HTTP scenario', () => {
      const scenario = makeHttpScenario('http-test');

      store.addHttpScenario(scenario);
      const result = store.getHttpScenarios();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('http-test');
      expect(result[0].exchanges[0].status).toBe(200);
    });
  });

  describe('getExchangesByType', () => {
    it('finds exchanges matching a given WsMessageType', () => {
      const exchange = makeWsExchange(
        'ws-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeWsScenario('auth', [exchange]));

      const matches = store.getExchangesByType(WsMessageType.REQ_CONNECT_DIRECTORY);

      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('ws-001');
    });

    it('returns empty array when no matches', () => {
      const exchange = makeWsExchange(
        'ws-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeWsScenario('auth', [exchange]));

      const matches = store.getExchangesByType(WsMessageType.REQ_LOGIN_WORLD);

      expect(matches).toEqual([]);
    });

    it('finds exchanges across multiple scenarios', () => {
      const ex1 = makeWsExchange(
        'ws-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      const ex2 = makeWsExchange(
        'ws-002',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );

      store.addWsScenario(makeWsScenario('scenario-1', [ex1]));
      store.addWsScenario(makeWsScenario('scenario-2', [ex2]));

      const matches = store.getExchangesByType(WsMessageType.REQ_CONNECT_DIRECTORY);

      expect(matches).toHaveLength(2);
      expect(matches[0].id).toBe('ws-001');
      expect(matches[1].id).toBe('ws-002');
    });
  });

  describe('getHttpExchangeForUrl', () => {
    it('finds HTTP exchange by exact path match', () => {
      store.addHttpScenario(makeHttpScenario('http'));

      const result = store.getHttpExchangeForUrl('GET', '/test/path');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('http-001');
    });

    it('returns null when no match found', () => {
      store.addHttpScenario(makeHttpScenario('http'));

      const result = store.getHttpExchangeForUrl('GET', '/nonexistent');

      expect(result).toBeNull();
    });

    it('matches case-insensitively', () => {
      store.addHttpScenario(makeHttpScenario('http'));

      const result = store.getHttpExchangeForUrl('GET', '/TEST/PATH');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('http-001');
    });
  });

  describe('getWsExchangeCount', () => {
    it('returns total exchange count across all scenarios', () => {
      const ex1 = makeWsExchange('ws-001', WsMessageType.REQ_CONNECT_DIRECTORY, WsMessageType.RESP_CONNECT_SUCCESS);
      const ex2 = makeWsExchange('ws-002', WsMessageType.REQ_LOGIN_WORLD, WsMessageType.RESP_LOGIN_SUCCESS);
      const ex3 = makeWsExchange('ws-003', WsMessageType.REQ_SELECT_COMPANY, WsMessageType.RESP_RDO_RESULT);

      store.addWsScenario(makeWsScenario('s1', [ex1, ex2]));
      store.addWsScenario(makeWsScenario('s2', [ex3]));

      expect(store.getWsExchangeCount()).toBe(3);
    });

    it('returns 0 when empty', () => {
      expect(store.getWsExchangeCount()).toBe(0);
    });
  });

  describe('clear', () => {
    it('clears all scenarios', () => {
      store.addWsScenario(makeWsScenario('ws', [
        makeWsExchange('ws-001', WsMessageType.REQ_CONNECT_DIRECTORY, WsMessageType.RESP_CONNECT_SUCCESS),
      ]));
      store.addRdoScenario(makeRdoScenario('rdo'));
      store.addHttpScenario(makeHttpScenario('http'));

      expect(store.getWsScenarios()).toHaveLength(1);
      expect(store.getRdoScenarios()).toHaveLength(1);
      expect(store.getHttpScenarios()).toHaveLength(1);

      store.clear();

      expect(store.getWsScenarios()).toEqual([]);
      expect(store.getRdoScenarios()).toEqual([]);
      expect(store.getHttpScenarios()).toEqual([]);
      expect(store.getWsExchangeCount()).toBe(0);
    });
  });
});
