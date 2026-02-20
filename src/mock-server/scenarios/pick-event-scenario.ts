/**
 * Scenario 10: PickEvent Polling
 * Client periodically calls PickEvent to check for pending server events.
 * Empty response ("%") means no events pending.
 *
 * Captured RDO:
 *   C 81 sel 8161308 call PickEvent "^" "#22";
 *   A81 res="%";
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured PickEvent parameters */
export interface CapturedPickEventData {
  clientViewId: string;
  tycoonId: string;
}

export const CAPTURED_PICK_EVENT: CapturedPickEventData = {
  clientViewId: '8161308',
  tycoonId: '22',
};

export function createPickEventScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'pick-event',
    description: 'Client polls for pending server events (empty = no events)',
    exchanges: [
      {
        id: 'pe-rdo-001',
        request: `C 81 sel ${vars.clientViewId} call PickEvent "^" "#${CAPTURED_PICK_EVENT.tycoonId}"`,
        response: `A81 res="%"`,
        matchKeys: { verb: 'sel', action: 'call', member: 'PickEvent' },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const ws: WsCaptureScenario = {
    name: 'pick-event',
    description: 'PickEvent polling (empty response = no pending events)',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'pe-ws-001',
        timestamp: '2026-02-18T21:22:30.000Z',
        request: {
          type: WsMessageType.REQ_RDO_DIRECT,
          wsRequestId: 'pe-001',
          verb: 'sel',
          targetId: vars.clientViewId,
          action: 'call',
          member: 'PickEvent',
          args: [`#${CAPTURED_PICK_EVENT.tycoonId}`],
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_RDO_RESULT,
            wsRequestId: 'pe-001',
            result: '%',
          } as WsMessage,
        ],
        tags: ['polling'],
      },
    ],
  };

  return { ws, rdo };
}
