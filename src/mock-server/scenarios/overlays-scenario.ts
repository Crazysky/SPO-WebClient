/**
 * Scenario 11: GetSurface for Overlays (ZONES)
 * Returns RLE-compressed zone data for a map region.
 *
 * Captured RDO:
 *   C 95 sel 8161308 call GetSurface "^" "%ZONES","#384","#384","#448","#448";
 *   A95 res="%65:65:0=65,:0=65,:...";
 *
 * Response format: "rows:cols:data" where data is RLE-compressed.
 * "0=65" means value 0 repeated 65 times. This is a 65x65 grid, all zones = 0.
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured GetSurface request parameters */
export interface CapturedSurfaceRequestData {
  clientViewId: string;
  surfaceType: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const CAPTURED_SURFACE_REQUEST: CapturedSurfaceRequestData = {
  clientViewId: '8161308',
  surfaceType: 'ZONES',
  x1: 384,
  y1: 384,
  x2: 448,
  y2: 448,
};

/**
 * RLE-compressed zones data: 65x65 grid, all values = 0.
 * Format: "rows:cols:row0,row1,...,rowN,"
 * Each row: "value=count" (RLE encoding)
 */
export const CAPTURED_ZONES_DATA: string = (() => {
  const row = '0=65';
  const rows = Array.from({ length: 65 }, () => row).join(',:');
  return `65:65:${rows},:`;
})();

/** Build the full RDO response string for the zones surface */
function buildZonesResponse(): string {
  return `A95 res="%${CAPTURED_ZONES_DATA}"`;
}

export function createOverlaysScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'overlays',
    description: 'GetSurface ZONES overlay - returns RLE-compressed zone data',
    exchanges: [
      {
        id: 'ov-rdo-001',
        request: `C 95 sel ${vars.clientViewId} call GetSurface "^" "%ZONES","#${CAPTURED_SURFACE_REQUEST.x1}","#${CAPTURED_SURFACE_REQUEST.y1}","#${CAPTURED_SURFACE_REQUEST.x2}","#${CAPTURED_SURFACE_REQUEST.y2}"`,
        response: buildZonesResponse(),
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'GetSurface',
          argsPattern: ['"%ZONES"'],
        },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  // Build a decoded 2D array for the WS-level response (all zeros, 65x65)
  const decodedRows: number[][] = Array.from({ length: 65 }, () =>
    Array.from({ length: 65 }, () => 0)
  );

  const ws: WsCaptureScenario = {
    name: 'overlays',
    description: 'GetSurface ZONES overlay via WebSocket',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'ov-ws-001',
        timestamp: '2026-02-18T21:23:00.000Z',
        request: {
          type: WsMessageType.REQ_GET_SURFACE,
          wsRequestId: 'ov-001',
          surfaceType: 'ZONES',
          x1: CAPTURED_SURFACE_REQUEST.x1,
          y1: CAPTURED_SURFACE_REQUEST.y1,
          x2: CAPTURED_SURFACE_REQUEST.x2,
          y2: CAPTURED_SURFACE_REQUEST.y2,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_SURFACE_DATA,
            wsRequestId: 'ov-001',
            data: {
              width: 65,
              height: 65,
              rows: decodedRows,
            },
          } as WsMessage,
        ],
        tags: ['overlay', 'zones'],
      },
    ],
  };

  return { ws, rdo };
}
