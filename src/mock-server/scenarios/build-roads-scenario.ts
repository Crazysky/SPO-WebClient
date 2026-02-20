/**
 * Scenario 13: Build Roads via Build Menu
 * HTTP: RoadOptions.asp (Build and Demolish buttons)
 * RDO: CreateCircuitSeg call + RefreshArea server push after road built
 * WS: REQ_BUILD_ROAD -> RESP_BUILD_ROAD
 *
 * Captured RDO:
 *   C 505 sel 29862524 call CreateCircuitSeg "^" "#1","#248041616","#462","#403","#464","#403","#4000000";
 *   A505 res="#0";
 *
 * Server push (RefreshArea after road built):
 *   C sel 41051000 call RefreshArea "*" "#462","#403","#3","#1","%1::462\n391\n462\n403\n...";
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { HttpScenario } from '../types/http-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured data for a successful CreateCircuitSeg road build */
export interface CapturedRoadBuildData {
  /** Circuit type: 1=Roads, 2=Railroads (maps to CircuitId param in Delphi) */
  circuitType: number;
  /** Tycoon/owner ID (maps to OwnerId param in Delphi CreateCircuitSeg) */
  ownerId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cost: number;
  result: number;
}

export const CAPTURED_ROAD_BUILD: CapturedRoadBuildData = {
  circuitType: 1,
  ownerId: '248041616',
  x1: 462,
  y1: 403,
  x2: 464,
  y2: 403,
  cost: 4000000,
  result: 0,
};

/** Build the RefreshArea push data block for the road segment */
function buildRefreshAreaPush(): string {
  const refreshBlock = [
    '1::462',
    '391',
    '462',
    '403',
    '17',
    '15',
    '7',
    '6',
    '0',
    '0',
    '462',
    '403',
    '462',
    '419',
    '15',
    '13',
    '6',
    '4',
    '0',
    '0',
    '462',
    '403',
    '464',
    '403',
    '15',
    '49',
    '6',
    '0',
    '0',
    '0',
    ':',
  ].join('\n');

  return `C sel 41051000 call RefreshArea "*" "#${CAPTURED_ROAD_BUILD.x1}","#${CAPTURED_ROAD_BUILD.y1}","#3","#1","%${refreshBlock}";`;
}

function buildRoadOptionsHtml(): string {
  return `<html>
<head><title>Road options</title><link rel="STYLESHEET" href="../voyager.css" type="text/css"></head>
<body>
<div class=header2 style="color: #FF9900; margin-left: 10px">Roads</div>
<table cellspacing="0" cellpadding="0" width="80%" style="margin-left: 10px">
<tr>
<td align="center" valign="bottom" info="http://local.asp?frame_Id=MapIsoView&frame_Action=BuildRoad">
<div class="link" style="color: white">Build</div>
</td>
<td align="center" valign="bottom" info="http://local.asp?frame_Id=MapIsoView&frame_Action=DemolishRoad">
<div class="link" style="color: white">Demolish</div>
</td>
</tr>
</table>
</body>
</html>`;
}

export function createBuildRoadsScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario; http: HttpScenario } {
  const vars = mergeVariables(overrides);

  const refreshAreaPush = buildRefreshAreaPush();

  const rdo: RdoScenario = {
    name: 'build-roads',
    description: 'Build roads: CreateCircuitSeg + RefreshArea server push',
    exchanges: [
      {
        id: 'br-rdo-001',
        request: `C 505 sel 29862524 call CreateCircuitSeg "^" "#${CAPTURED_ROAD_BUILD.circuitType}","#${CAPTURED_ROAD_BUILD.ownerId}","#${CAPTURED_ROAD_BUILD.x1}","#${CAPTURED_ROAD_BUILD.y1}","#${CAPTURED_ROAD_BUILD.x2}","#${CAPTURED_ROAD_BUILD.y2}","#${CAPTURED_ROAD_BUILD.cost}"`,
        response: `A505 res="#${CAPTURED_ROAD_BUILD.result}"`,
        pushes: [refreshAreaPush],
        matchKeys: { verb: 'sel', action: 'call', member: 'CreateCircuitSeg' },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const http: HttpScenario = {
    name: 'build-roads',
    exchanges: [
      {
        id: 'br-http-001',
        method: 'GET',
        urlPattern: '/five/0/visual/voyager/Build/RoadOptions.asp',
        status: 200,
        contentType: 'text/html',
        body: buildRoadOptionsHtml(),
      },
    ],
    variables: {},
  };

  const ws: WsCaptureScenario = {
    name: 'build-roads',
    description: 'Build roads via Build menu',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'br-ws-001',
        timestamp: '2026-02-18T21:32:00.000Z',
        request: {
          type: WsMessageType.REQ_BUILD_ROAD,
          wsRequestId: 'br-001',
          x1: CAPTURED_ROAD_BUILD.x1,
          y1: CAPTURED_ROAD_BUILD.y1,
          x2: CAPTURED_ROAD_BUILD.x2,
          y2: CAPTURED_ROAD_BUILD.y2,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_BUILD_ROAD,
            wsRequestId: 'br-001',
            success: true,
            cost: CAPTURED_ROAD_BUILD.cost,
            tileCount: 3,
          } as WsMessage,
        ],
        tags: ['roads'],
      },
    ],
  };

  return { ws, rdo, http };
}
