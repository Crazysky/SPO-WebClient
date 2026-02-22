/**
 * RDO Protocol Tests - RefreshObject Push Detection & Parsing
 *
 * Tests isRefreshObjectPush() and parseRefreshObjectPush() logic
 * from spo_session.ts (lines 723-770).
 *
 * Uses RdoPacket interface from protocol-types.ts and captured data
 * from refresh-object-scenario.ts as ground truth.
 */

import { describe, it, expect } from '@jest/globals';
import type { RdoPacket } from '../../../shared/types/protocol-types';
import type { BuildingFocusInfo } from '../../../shared/types';
import {
  CAPTURED_REFRESH_OBJECT,
  type CapturedRefreshObjectData,
} from '../../../mock-server/scenarios/refresh-object-scenario';
import { cleanPayload } from '../../rdo-helpers';
import { parseBuildingFocusResponse } from '../../map-parsers';

// ==========================================================================
// Replicate isRefreshObjectPush logic (spo_session.ts:723-727)
// ==========================================================================
function isRefreshObjectPush(packet: RdoPacket): boolean {
  return packet.type === 'PUSH' &&
         packet.member === 'RefreshObject' &&
         packet.separator === '"*"';
}

// ==========================================================================
// Replicate parseRefreshObjectPush logic (spo_session.ts:733-770)
// ==========================================================================
function parseRefreshObjectPush(
  packet: RdoPacket,
  currentFocusedCoords: { x: number; y: number } | null
): BuildingFocusInfo | null {
  if (!currentFocusedCoords) return null;

  try {
    if (!packet.args || packet.args.length < 3) {
      return null;
    }

    // Extract building ID from args[0] — format: "#202334236"
    const buildingIdWithPrefix = packet.args[0];
    const buildingId = buildingIdWithPrefix.replace(/[#@%]/g, '');

    // Extract and clean data from args[2]
    let dataString = packet.args[2];
    dataString = cleanPayload(dataString);
    if (dataString.startsWith('%')) {
      dataString = dataString.substring(1);
    }

    // Prepend building ID for consistent parsing
    const fullPayload = buildingId + '\n' + dataString;

    return parseBuildingFocusResponse(
      fullPayload,
      currentFocusedCoords.x,
      currentFocusedCoords.y
    );
  } catch {
    return null;
  }
}

// ==========================================================================
// Helper to build a RefreshObject RdoPacket from captured data
// ==========================================================================
function makeRefreshObjectPacket(data: CapturedRefreshObjectData): RdoPacket {
  // Build the ExtraInfo string per InterfaceServer.pas GetFacilityExtraInfo:
  // "<shortName>\n<companyName>\n<salesSummary>\n<revenue>:-:<details>:-:<hints>:-:"
  const extraInfo = [
    '10', // shortName (Drug Store display name)
    data.companyName,
    data.salesSummary,
    `${data.revenue}:-:${data.detailsText}:-:${data.hintsText}:-:`,
  ].join('\n');

  return {
    raw: `C sel ${data.tycoonProxyId} call RefreshObject "*" "#${data.buildingId}","#${data.statusFlag}","%${extraInfo}";`,
    type: 'PUSH',
    verb: undefined,
    targetId: data.tycoonProxyId,
    action: undefined,
    member: 'RefreshObject',
    separator: '"*"',
    args: [`#${data.buildingId}`, `#${data.statusFlag}`, `%${extraInfo}`],
  };
}

// ==========================================================================
// Tests
// ==========================================================================

describe('isRefreshObjectPush', () => {
  it('should return true for valid RefreshObject push packet', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    expect(isRefreshObjectPush(packet)).toBe(true);
  });

  it('should return false when type is REQUEST', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'REQUEST',
      member: 'RefreshObject',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when type is RESPONSE', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'RESPONSE',
      member: 'RefreshObject',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when member is not RefreshObject', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshTycoon',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when separator is "^" (method call)', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"^"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when member is undefined', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when separator is undefined', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should be case-sensitive for member name', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'refreshobject',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });
});

describe('parseRefreshObjectPush', () => {
  const FOCUSED_COORDS = { x: 100, y: 200 };

  it('should return null when currentFocusedCoords is null', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    expect(parseRefreshObjectPush(packet, null)).toBeNull();
  });

  it('should return null when args are missing', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
    };
    expect(parseRefreshObjectPush(packet, FOCUSED_COORDS)).toBeNull();
  });

  it('should return null when args has fewer than 3 elements', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#127839460', '#0'],
    };
    expect(parseRefreshObjectPush(packet, FOCUSED_COORDS)).toBeNull();
  });

  it('should parse captured RefreshObject data correctly', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe(CAPTURED_REFRESH_OBJECT.buildingId);
  });

  it('should extract company name from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    // In the ExtraInfo format, line after shortName is companyName
    // parseBuildingFocusResponse sees: buildingId, 10, Yellow Inc., salesSummary, revenue...
    // headerLines[0] = buildingId, [1] = 10 (shortName), [2] = Yellow Inc., [3] = salesSummary, [4] = revenue
    expect(result!.ownerName).toBe(CAPTURED_REFRESH_OBJECT.companyName);
  });

  it('should extract revenue from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    // extractRevenue strips parentheses: "(-$36/h)" → "-$36/h"
    expect(result!.revenue).toContain('$');
  });

  it('should extract details text from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.detailsText).toContain('Drug Store');
    expect(result!.detailsText).toContain('Upgrade Level');
  });

  it('should extract hints text from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.hintsText).toContain('Hint');
  });

  it('should use focused coordinates for x and y', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, { x: 300, y: 400 });

    expect(result).not.toBeNull();
    expect(result!.x).toBe(300);
    expect(result!.y).toBe(400);
  });

  it('should strip # prefix from building ID arg', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    // Should be numeric string without prefix
    expect(result!.buildingId).not.toContain('#');
    expect(result!.buildingId).toMatch(/^\d+$/);
  });

  it('should handle :-: separator in ExtraInfo correctly', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    // :-: separates header from details and hints
    // detailsText should NOT contain the :-: separator itself
    expect(result!.detailsText).not.toContain(':-:');
    expect(result!.hintsText).not.toContain(':-:');
  });

  it('should handle building with minimal data (just ID and name)', () => {
    const minimalPacket: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#999', '#0', '%MinimalBuilding'],
    };

    const result = parseRefreshObjectPush(minimalPacket, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe('999');
  });

  it('should handle empty extraInfo fields gracefully', () => {
    const emptyDataPacket: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#555', '#0', '%EmptyBuilding\n\n\n:-::-::-:'],
    };

    const result = parseRefreshObjectPush(emptyDataPacket, FOCUSED_COORDS);
    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe('555');
  });
});

describe('cleanPayload behavior for RefreshObject args', () => {
  it('should remove outer quotes from args', () => {
    const cleaned = cleanPayload('"#127839460"');
    expect(cleaned).toBe('127839460');
  });

  it('should strip % prefix after quote removal', () => {
    const cleaned = cleanPayload('"%Yellow Inc."');
    expect(cleaned).toBe('Yellow Inc.');
  });

  it('should strip # prefix after quote removal', () => {
    const cleaned = cleanPayload('"#0"');
    expect(cleaned).toBe('0');
  });

  it('should handle res= format', () => {
    const cleaned = cleanPayload('res="#6805584"');
    expect(cleaned).toBe('6805584');
  });

  it('should handle plain string without quotes', () => {
    const cleaned = cleanPayload('%Hello');
    expect(cleaned).toBe('Hello');
  });
});

describe('CAPTURED_REFRESH_OBJECT ground truth', () => {
  it('should have expected building ID', () => {
    expect(CAPTURED_REFRESH_OBJECT.buildingId).toBe('127839460');
  });

  it('should have expected tycoon proxy ID', () => {
    expect(CAPTURED_REFRESH_OBJECT.tycoonProxyId).toBe('40133496');
  });

  it('should have expected company name', () => {
    expect(CAPTURED_REFRESH_OBJECT.companyName).toBe('Yellow Inc.');
  });

  it('should have expected revenue format', () => {
    expect(CAPTURED_REFRESH_OBJECT.revenue).toMatch(/\(-?\$[\d,]+\/h\)/);
  });

  it('should have non-empty details text', () => {
    expect(CAPTURED_REFRESH_OBJECT.detailsText.length).toBeGreaterThan(0);
    expect(CAPTURED_REFRESH_OBJECT.detailsText).toContain('Drug Store');
  });

  it('should have non-empty hints text', () => {
    expect(CAPTURED_REFRESH_OBJECT.hintsText.length).toBeGreaterThan(0);
    expect(CAPTURED_REFRESH_OBJECT.hintsText).toContain('Hint');
  });
});
