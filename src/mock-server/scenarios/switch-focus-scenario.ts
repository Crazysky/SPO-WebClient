/**
 * Scenario 7: Building Focus / SwitchFocusEx
 * RDO: SwitchFocusEx calls to query building info at map coordinates
 * WS: REQ_BUILDING_FOCUS (x, y) -> RESP_BUILDING_FOCUS
 *
 * Response format: objectId\nname\n\nownerCompany\n\nstatusLine\n\nfinancialLine:-:detailSection:-:hintSection:-:
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Parsed building focus data from SwitchFocusEx response */
export interface CapturedBuildingFocusData {
  objectId: string;
  name: string;
  ownerCompany: string;
  statusLine: string;
  financialLine: string;
  detailSections: string[];
}

/** Farm building captured data */
const CAPTURED_FARM: CapturedBuildingFocusData = {
  objectId: '127706280',
  name: 'Farm 10',
  ownerCompany: 'Yellow Inc.',
  statusLine: 'Hiring workforce at 39%',
  financialLine: '(-$29/h)',
  detailSections: [
    'Upgrade Level: 1  Professionals: 1 of 1.Workers: 9 of 27.',
    'Warning: This facility needs Low class work force.',
  ],
};

/** Drug Store building captured data */
const CAPTURED_DRUG_STORE: CapturedBuildingFocusData = {
  objectId: '127839460',
  name: '10',
  ownerCompany: 'Yellow Inc.',
  statusLine: 'Pharmaceutics sales at 1%',
  financialLine: '(-$36/h)',
  detailSections: [
    'Drug Store.  Upgrade Level: 1  Items Sold: 1/h  Potential customers (per day): 0 hi, 1 mid, 1 low. Actual customers: 0 hi, 1 mid, 1 low.  Efficiency: 87%  Desirability: 46',
    'Hint: Try to attract more customers by offering better quality and prices.',
  ],
};

/**
 * Build the raw SwitchFocusEx response string from captured data.
 * Format: objectId\nname\n\nownerCompany\n\nstatusLine\n\nfinancialLine:-:detail1:-:detail2:-:
 */
function buildFocusResponse(data: CapturedBuildingFocusData): string {
  const sections = data.detailSections.join(':-:');
  return [
    data.objectId,
    data.name,
    '',
    data.ownerCompany,
    '',
    data.statusLine,
    '',
    `${data.financialLine}:-:${sections}:-:`,
  ].join('\n');
}

export function createSwitchFocusScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  const farmResponse = buildFocusResponse(CAPTURED_FARM);
  const drugStoreResponse = buildFocusResponse(CAPTURED_DRUG_STORE);

  const rdo: RdoScenario = {
    name: 'switch-focus',
    description: 'Building focus queries via SwitchFocusEx',
    exchanges: [
      {
        id: 'sf-rdo-001',
        request: `C 68 sel ${vars.clientViewId} call SwitchFocusEx "^" "#0","#472","#392"`,
        response: `A68 res="%${farmResponse}"`,
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'SwitchFocusEx',
          argsPattern: ['"#0"', '"#472"', '"#392"'],
        },
      },
      {
        id: 'sf-rdo-002',
        request: `C 72 sel ${vars.clientViewId} call SwitchFocusEx "^" "#${CAPTURED_FARM.objectId}","#477","#392"`,
        response: `A72 res="%${drugStoreResponse}"`,
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'SwitchFocusEx',
          argsPattern: [`"#${CAPTURED_FARM.objectId}"`, '"#477"', '"#392"'],
        },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const ws: WsCaptureScenario = {
    name: 'switch-focus',
    description: 'Building focus/info queries via WebSocket',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'sf-ws-001',
        timestamp: '2026-02-18T21:22:10.000Z',
        request: {
          type: WsMessageType.REQ_BUILDING_FOCUS,
          wsRequestId: 'sf-001',
          x: 472,
          y: 392,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_BUILDING_FOCUS,
            wsRequestId: 'sf-001',
            building: {
              buildingId: CAPTURED_FARM.objectId,
              buildingName: CAPTURED_FARM.name,
              ownerName: CAPTURED_FARM.ownerCompany,
              salesInfo: CAPTURED_FARM.statusLine,
              revenue: CAPTURED_FARM.financialLine,
              detailsText: CAPTURED_FARM.detailSections[0],
              hintsText: CAPTURED_FARM.detailSections[1],
              x: 472,
              y: 392,
            },
          } as WsMessage,
        ],
        tags: ['building-focus'],
      },
      {
        id: 'sf-ws-002',
        timestamp: '2026-02-18T21:22:15.000Z',
        request: {
          type: WsMessageType.REQ_BUILDING_FOCUS,
          wsRequestId: 'sf-002',
          x: 477,
          y: 392,
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_BUILDING_FOCUS,
            wsRequestId: 'sf-002',
            building: {
              buildingId: CAPTURED_DRUG_STORE.objectId,
              buildingName: CAPTURED_DRUG_STORE.name,
              ownerName: CAPTURED_DRUG_STORE.ownerCompany,
              salesInfo: CAPTURED_DRUG_STORE.statusLine,
              revenue: CAPTURED_DRUG_STORE.financialLine,
              detailsText: CAPTURED_DRUG_STORE.detailSections[0],
              hintsText: CAPTURED_DRUG_STORE.detailSections[1],
              x: 477,
              y: 392,
            },
          } as WsMessage,
        ],
        tags: ['building-focus'],
      },
    ],
  };

  return { ws, rdo };
}

export { CAPTURED_FARM, CAPTURED_DRUG_STORE, buildFocusResponse };
