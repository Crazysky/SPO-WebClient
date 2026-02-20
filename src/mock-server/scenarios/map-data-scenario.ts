/**
 * Scenario 5: Map Data Loading
 * RDO: SegmentsInArea & ObjectsInArea calls for loading map tiles
 * WS: REQ_MAP_LOAD (x, y, width, height) -> RESP_MAP_DATA
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** A captured road/terrain segment from SegmentsInArea response */
export interface CapturedSegmentData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  leftTerrain: number;
  rightTerrain: number;
  leftSide: number;
  rightSide: number;
  leftSideAttr: number;
  rightSideAttr: number;
}

/** A captured map object from ObjectsInArea response */
export interface CapturedObjectData {
  classId: number;
  rotation: number;
  visualClassId: number;
  x: number;
  y: number;
}

/** First 4 segments parsed from captured SegmentsInArea response */
const SAMPLE_SEGMENTS: CapturedSegmentData[] = [
  { x1: 448, y1: 384, x2: 448, y2: 391, leftTerrain: 23, rightTerrain: 22, leftSide: 0, rightSide: 0, leftSideAttr: 0, rightSideAttr: 0 },
  { x1: 448, y1: 391, x2: 448, y2: 398, leftTerrain: 22, rightTerrain: 23, leftSide: 0, rightSide: 0, leftSideAttr: 0, rightSideAttr: 0 },
  { x1: 441, y1: 391, x2: 448, y2: 391, leftTerrain: 22, rightTerrain: 22, leftSide: 0, rightSide: 0, leftSideAttr: 0, rightSideAttr: 0 },
  { x1: 441, y1: 391, x2: 441, y2: 398, leftTerrain: 22, rightTerrain: 23, leftSide: 0, rightSide: 0, leftSideAttr: 0, rightSideAttr: 0 },
];

/** Objects parsed from captured ObjectsInArea response (groups of 5) */
const SAMPLE_OBJECTS: CapturedObjectData[] = [
  { classId: 6031, rotation: 0, visualClassId: 16, x: 458, y: 392 },
  { classId: 4702, rotation: 22, visualClassId: 17, x: 459, y: 389 },
  { classId: 4752, rotation: 22, visualClassId: 17, x: 461, y: 390 },
  { classId: 4510, rotation: 0, visualClassId: 16, x: 463, y: 389 },
  { classId: 4500, rotation: 11, visualClassId: 16, x: 463, y: 392 },
  { classId: 4116, rotation: 22, visualClassId: 17, x: 472, y: 392 },
  { classId: 4702, rotation: 22, visualClassId: 17, x: 477, y: 392 },
];

/**
 * Build the SegmentsInArea response string from segment data.
 * Each segment is 10 numbers, one per line.
 */
function buildSegmentsResponse(segments: CapturedSegmentData[]): string {
  const lines: string[] = [];
  for (const seg of segments) {
    lines.push(
      String(seg.x1), String(seg.y1),
      String(seg.x2), String(seg.y2),
      String(seg.leftTerrain), String(seg.rightTerrain),
      String(seg.leftSide), String(seg.rightSide),
      String(seg.leftSideAttr), String(seg.rightSideAttr),
    );
  }
  return lines.join('\n');
}

/**
 * Build the ObjectsInArea response string from object data.
 * Each object is 5 numbers, one per line.
 */
function buildObjectsResponse(objects: CapturedObjectData[]): string {
  const lines: string[] = [];
  for (const obj of objects) {
    lines.push(
      String(obj.classId), String(obj.rotation),
      String(obj.visualClassId),
      String(obj.x), String(obj.y),
    );
  }
  return lines.join('\n');
}

export function createMapDataScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const segmentsResponseBody = buildSegmentsResponse(SAMPLE_SEGMENTS);
  const objectsResponseBody = buildObjectsResponse(SAMPLE_OBJECTS);

  // Empty objects response for an area with no buildings
  const emptyObjectsResponse = '';

  const rdo: RdoScenario = {
    name: 'map-data',
    description: 'Map data loading: SegmentsInArea & ObjectsInArea',
    exchanges: [
      {
        id: 'md-rdo-001',
        request: `C 53 sel ${vars.clientViewId} call ObjectsInArea "^" "#384","#384","#64","#64"`,
        response: `A53 res="%"`,
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'ObjectsInArea',
          argsPattern: ['"#384"', '"#384"', '"#64"', '"#64"'],
        },
      },
      {
        id: 'md-rdo-002',
        request: `C 55 sel ${vars.clientViewId} call SegmentsInArea "^" "#1","#383","#383","#449","#449"`,
        response: `A55 res="%${segmentsResponseBody}\n"`,
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'SegmentsInArea',
          argsPattern: ['"#1"', '"#383"', '"#383"', '"#449"', '"#449"'],
        },
      },
      {
        id: 'md-rdo-003',
        request: `C 58 sel ${vars.clientViewId} call ObjectsInArea "^" "#448","#384","#64","#64"`,
        response: `A58 res="%${objectsResponseBody}"`,
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'ObjectsInArea',
          argsPattern: ['"#448"', '"#384"', '"#64"', '"#64"'],
        },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const ws: WsCaptureScenario = {
    name: 'map-data',
    description: 'Map data loading via WebSocket',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'md-ws-001',
        timestamp: '2026-02-18T21:21:50.000Z',
        request: {
          type: WsMessageType.REQ_MAP_LOAD,
          wsRequestId: 'md-001',
          x: 384,
          y: 384,
          width: 64,
          height: 64,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_MAP_DATA,
            wsRequestId: 'md-001',
            data: {
              x: 384,
              y: 384,
              w: 64,
              h: 64,
              buildings: [],
              segments: SAMPLE_SEGMENTS.map(seg => ({
                x1: seg.x1,
                y1: seg.y1,
                x2: seg.x2,
                y2: seg.y2,
                unknown1: seg.leftTerrain,
                unknown2: seg.rightTerrain,
                unknown3: seg.leftSide,
                unknown4: seg.rightSide,
                unknown5: seg.leftSideAttr,
                unknown6: seg.rightSideAttr,
              })),
            },
          } as WsMessage,
        ],
        tags: ['map'],
      },
      {
        id: 'md-ws-002',
        timestamp: '2026-02-18T21:21:51.000Z',
        request: {
          type: WsMessageType.REQ_MAP_LOAD,
          wsRequestId: 'md-002',
          x: 448,
          y: 384,
          width: 64,
          height: 64,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_MAP_DATA,
            wsRequestId: 'md-002',
            data: {
              x: 448,
              y: 384,
              w: 64,
              h: 64,
              buildings: SAMPLE_OBJECTS.map(obj => ({
                visualClass: String(obj.visualClassId),
                tycoonId: obj.rotation,
                options: obj.visualClassId,
                x: obj.x,
                y: obj.y,
                level: obj.visualClassId >> 4,
                alert: (obj.visualClassId & 0x0F) !== 0,
                attack: obj.visualClassId & 0x0E,
              })),
              segments: [],
            },
          } as WsMessage,
        ],
        tags: ['map'],
      },
    ],
  };

  return { ws, rdo };
}

export { SAMPLE_SEGMENTS, SAMPLE_OBJECTS, buildSegmentsResponse, buildObjectsResponse };
