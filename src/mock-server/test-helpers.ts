/**
 * Test helpers for mock server — convenience functions for test setup.
 */

import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario, WsCaptureExchange } from './types/mock-types';
import type { ScenarioVariables } from './scenarios/scenario-variables';
import { MockWebSocketClient } from './mock-ws-client';
import { RdoMock } from './rdo-mock';
import { HttpMock } from './http-mock';
import { CaptureStore } from './capture-store';
import { ReplayEngine } from './replay-engine';

export interface MockEnvironmentOptions {
  scenarios?: WsCaptureScenario[];
  variables?: Partial<ScenarioVariables>;
}

export interface MockEnvironment {
  ws: MockWebSocketClient;
  rdoMock: RdoMock;
  httpMock: HttpMock;
  store: CaptureStore;
  engine: ReplayEngine;
  cleanup: () => void;
}

/**
 * Create a complete mock environment for testing.
 */
export function createMockEnvironment(options: MockEnvironmentOptions = {}): MockEnvironment {
  const scenarios = options.scenarios ?? [];
  const ws = new MockWebSocketClient(scenarios);
  const rdoMock = new RdoMock();
  const httpMock = new HttpMock();
  const store = new CaptureStore();
  const engine = new ReplayEngine(store);

  for (const scenario of scenarios) {
    store.addWsScenario(scenario);
  }

  return {
    ws,
    rdoMock,
    httpMock,
    store,
    engine,
    cleanup: () => {
      ws.reset();
      rdoMock.clearScenarios();
      httpMock.reset();
      store.clear();
      engine.reset();
    },
  };
}

/**
 * Create a quick inline scenario for simple tests.
 */
export function quickScenario(
  exchanges: Array<{
    request: Record<string, unknown> & { type: string };
    response: Record<string, unknown> & { type: string };
    delayMs?: number;
    tags?: string[];
  }>
): WsCaptureScenario {
  const wsExchanges: WsCaptureExchange[] = exchanges.map((ex, idx) => {
    const requestId = `quick-${String(idx + 1).padStart(3, '0')}`;
    return {
      id: `ex-${String(idx + 1).padStart(3, '0')}`,
      timestamp: new Date().toISOString(),
      request: {
        ...ex.request,
        wsRequestId: requestId,
      } as WsMessage,
      responses: [
        {
          ...ex.response,
          wsRequestId: requestId,
        } as WsMessage,
      ],
      delayMs: ex.delayMs,
      tags: ex.tags,
    };
  });

  return {
    name: 'quick-scenario',
    description: 'Inline scenario for testing',
    capturedAt: new Date().toISOString(),
    serverInfo: { world: 'Test', zone: 'Test', date: new Date().toISOString() },
    exchanges: wsExchanges,
  };
}
