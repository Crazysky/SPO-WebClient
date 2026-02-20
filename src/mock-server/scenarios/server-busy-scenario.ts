/**
 * Scenario 6: Server Busy Check
 * RDO: Single `get ServerBusy` -> returns #0 (not busy)
 * WS: REQ_RDO_DIRECT with verb='sel', action='get', member='ServerBusy'
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

export function createServerBusyScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'server-busy',
    description: 'Server busy check: get ServerBusy -> #0',
    exchanges: [
      {
        id: 'sb-rdo-001',
        request: `C 67 sel ${vars.clientViewId} get ServerBusy`,
        response: `A67 ServerBusy="#0"`,
        matchKeys: { verb: 'sel', action: 'get', member: 'ServerBusy' },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const ws: WsCaptureScenario = {
    name: 'server-busy',
    description: 'Server busy polling via WebSocket',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'sb-ws-001',
        timestamp: '2026-02-18T21:22:00.000Z',
        request: {
          type: WsMessageType.REQ_RDO_DIRECT,
          wsRequestId: 'sb-001',
          verb: 'sel',
          targetId: vars.clientViewId,
          action: 'get',
          member: 'ServerBusy',
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_RDO_RESULT,
            wsRequestId: 'sb-001',
            result: '#0',
          } as WsMessage,
        ],
        tags: ['polling'],
      },
    ],
  };

  return { ws, rdo };
}
