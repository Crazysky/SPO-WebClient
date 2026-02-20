/**
 * Scenario 9: SetViewedArea (Client-to-Server Only)
 * Fire-and-forget call: client tells the server which map area is currently visible.
 * No sequence number, no response from server.
 *
 * Captured RDO:
 *   C sel 8161308 call SetViewedArea "*" "#423","#353","#81","#80";
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured SetViewedArea parameters */
export interface CapturedViewedAreaData {
  clientViewId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CAPTURED_VIEWED_AREA: CapturedViewedAreaData = {
  clientViewId: '8161308',
  x: 423,
  y: 353,
  width: 81,
  height: 80,
};

export function createSetViewedAreaScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'set-viewed-area',
    description: 'Client tells server which area is visible (fire-and-forget)',
    exchanges: [
      {
        id: 'sva-rdo-001',
        request: `C sel ${vars.clientViewId} call SetViewedArea "*" "#${CAPTURED_VIEWED_AREA.x}","#${CAPTURED_VIEWED_AREA.y}","#${CAPTURED_VIEWED_AREA.width}","#${CAPTURED_VIEWED_AREA.height}"`,
        response: '',
        matchKeys: { verb: 'sel', action: 'call', member: 'SetViewedArea' },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const ws: WsCaptureScenario = {
    name: 'set-viewed-area',
    description: 'Client sends visible area coordinates (no response expected)',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'sva-ws-001',
        timestamp: '2026-02-18T21:22:00.000Z',
        request: {
          type: WsMessageType.REQ_RDO_DIRECT,
          wsRequestId: 'sva-001',
          verb: 'sel',
          targetId: vars.clientViewId,
          action: 'call',
          member: 'SetViewedArea',
          args: [
            `#${CAPTURED_VIEWED_AREA.x}`,
            `#${CAPTURED_VIEWED_AREA.y}`,
            `#${CAPTURED_VIEWED_AREA.width}`,
            `#${CAPTURED_VIEWED_AREA.height}`,
          ],
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_RDO_RESULT,
            wsRequestId: 'sva-001',
            result: '',
          } as WsMessage,
        ],
        tags: ['viewport'],
      },
    ],
  };

  return { ws, rdo };
}
