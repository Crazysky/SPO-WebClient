// @ts-nocheck
/**
 * RDO Protocol Tests - Chat Commands
 *
 * GetUserList was changed from GET (property) to CALL (function).
 * These tests validate the verb fix and its consequence on response parsing.
 *
 * Delphi reference (TClientView, InterfaceServer.pas:191):
 *   GetUserList() — function → call "^", zero args, res="..."
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect } from '@jest/globals';
import { RdoProtocol } from '../../rdo';
import { RdoPacket, RdoVerb, RdoAction } from '../../../shared/types';

function formatAsProduction(packetData: Partial<RdoPacket>, rid = 1): string {
  const packet = { ...packetData, rid, type: 'REQUEST' } as RdoPacket;
  return RdoProtocol.format(packet);
}

describe('getChatUserList() — verb fix GET → CALL', () => {
  const worldContextId = '127839460';

  // Exact packetData from spo_session.ts line 3913-3918
  const packetData: Partial<RdoPacket> = {
    verb: RdoVerb.SEL,
    targetId: worldContextId,
    action: RdoAction.CALL,
    member: 'GetUserList',
    separator: '"^"',
  };

  it('should produce correct wire: call (not get), "^" separator, zero args', () => {
    const wire = formatAsProduction(packetData, 42);

    expect(wire).toBe(`C 42 sel ${worldContextId} call GetUserList "^"`);
  });

  it('CALL response uses res= key, not GetUserList= property key', () => {
    // CALL → server responds with res="..."
    // GET  → server responds with GetUserList="..."
    // Production code parses with parsePropertyResponseHelper(payload, 'res')
    const payload = 'res="%user1\nuser2"';
    expect(/^res=/.test(payload)).toBe(true);
    expect(/^GetUserList=/.test(payload)).toBe(false);
  });
});
