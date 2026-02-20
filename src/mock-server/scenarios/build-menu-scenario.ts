/**
 * Scenario 12: Build Menu + NewFacility
 * HTTP: Build.asp (frameset), FacilityList.asp (facility items with Build now buttons)
 * RDO: NewFacility call (success res=#0, duplicate error res=#33)
 * WS: REQ_PLACE_BUILDING -> RESP_BUILDING_PLACED
 *
 * Captured RDO:
 *   C 147 sel 8184316 call NewFacility "^" "%PGISupermarketC","#28","#618","#117"; A147 res="#0";
 *   C 98 sel 8161308 call NewFacility "^" "%PGIGeneralHeadquarterSTA","#28","#465","#388"; A98 res="#33";
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { HttpScenario } from '../types/http-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured data for a successful NewFacility build */
export interface CapturedBuildData {
  facilityClass: string;
  companyId: string;
  x: number;
  y: number;
  result: number;
}

export const CAPTURED_BUILD_SUCCESS: CapturedBuildData = {
  facilityClass: 'PGISupermarketC',
  companyId: '28',
  x: 618,
  y: 117,
  result: 0,
};

export const CAPTURED_BUILD_DUPLICATE: CapturedBuildData = {
  facilityClass: 'PGIGeneralHeadquarterSTA',
  companyId: '28',
  x: 465,
  y: 388,
  result: 33,
};

function buildBuildAspHtml(vars: ScenarioVariables): string {
  return `<html>
<head><title>Build</title></head>
<frameset framespacing="0" rows="95,*">
  <frame name="Top" src="BuildTop.asp?Company=${encodeURIComponent(vars.companyName)}&WorldName=${vars.worldName}&Cluster=&Tycoon=${vars.username}" scrolling="no" noresize frameborder="No">
  <frame name="Main" src="KindList.asp?Company=${encodeURIComponent(vars.companyName)}&WorldName=${vars.worldName}&Cluster=&Tycoon=${vars.username}" noresize frameborder="No">
</frameset>
</html>`;
}

function buildFacilityListHtml(): string {
  return `<html>
<head><title>Facility List</title>
<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>
<body>
<div class="header2" style="color: #FF9900; margin-left: 10px">Headquarters</div>
<table cellspacing="0" cellpadding="0" width="95%" style="margin-left: 10px">
<tr>
<td align="center" valign="bottom"
  style="border-style: solid; border-width: 1px; border-color: #333333; padding: 5px"
  info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGIGeneralHeadquarterSTA&VisualClassId=602"
  command="build">
<img src="images/fac-PGIGeneralHeadquarterSTA.gif" border="0">
<div class="header3">General Headquarter</div>
<div class="data">Cost: $5,000,000</div>
<div class="link" style="color: white">Build now</div>
</td>
</tr>
<tr>
<td align="center" valign="bottom"
  style="border-style: solid; border-width: 1px; border-color: #333333; padding: 5px"
  info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGISupermarketC&VisualClassId=610"
  command="build">
<img src="images/fac-PGISupermarketC.gif" border="0">
<div class="header3">Supermarket</div>
<div class="data">Cost: $500,000</div>
<div class="link" style="color: white">Build now</div>
</td>
</tr>
</table>
</body>
</html>`;
}

export function createBuildMenuScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario; http: HttpScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'build-menu',
    description: 'Build menu: NewFacility success and duplicate error',
    exchanges: [
      {
        id: 'bm-rdo-001',
        request: `C 147 sel 8184316 call NewFacility "^" "%${CAPTURED_BUILD_SUCCESS.facilityClass}","#${CAPTURED_BUILD_SUCCESS.companyId}","#${CAPTURED_BUILD_SUCCESS.x}","#${CAPTURED_BUILD_SUCCESS.y}"`,
        response: `A147 res="#${CAPTURED_BUILD_SUCCESS.result}"`,
        matchKeys: { verb: 'sel', action: 'call', member: 'NewFacility' },
      },
      {
        id: 'bm-rdo-002',
        request: `C 98 sel ${vars.clientViewId} call NewFacility "^" "%${CAPTURED_BUILD_DUPLICATE.facilityClass}","#${CAPTURED_BUILD_DUPLICATE.companyId}","#${CAPTURED_BUILD_DUPLICATE.x}","#${CAPTURED_BUILD_DUPLICATE.y}"`,
        response: `A98 res="#${CAPTURED_BUILD_DUPLICATE.result}"`,
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'NewFacility',
          argsPattern: [`"%${CAPTURED_BUILD_DUPLICATE.facilityClass}"`],
        },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const http: HttpScenario = {
    name: 'build-menu',
    exchanges: [
      {
        id: 'bm-http-001',
        method: 'GET',
        urlPattern: '/five/0/visual/voyager/Build/Build.asp',
        queryPatterns: {
          Tycoon: vars.username,
          Company: vars.companyName,
          WorldName: vars.worldName,
        },
        status: 200,
        contentType: 'text/html',
        body: buildBuildAspHtml(vars),
      },
      {
        id: 'bm-http-002',
        method: 'GET',
        urlPattern: '/five/0/visual/voyager/Build/FacilityList.asp',
        queryPatterns: {
          Company: vars.companyName,
          WorldName: vars.worldName,
        },
        status: 200,
        contentType: 'text/html',
        body: buildFacilityListHtml(),
      },
    ],
    variables: {},
  };

  const ws: WsCaptureScenario = {
    name: 'build-menu',
    description: 'Build menu: place building via NewFacility',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'bm-ws-001',
        timestamp: '2026-02-18T21:30:00.000Z',
        request: {
          type: WsMessageType.REQ_PLACE_BUILDING,
          wsRequestId: 'bm-001',
          facilityClass: CAPTURED_BUILD_SUCCESS.facilityClass,
          x: CAPTURED_BUILD_SUCCESS.x,
          y: CAPTURED_BUILD_SUCCESS.y,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_BUILDING_PLACED,
            wsRequestId: 'bm-001',
            x: CAPTURED_BUILD_SUCCESS.x,
            y: CAPTURED_BUILD_SUCCESS.y,
            buildingId: '0',
          } as WsMessage,
        ],
        tags: ['build'],
      },
    ],
  };

  return { ws, rdo, http };
}
