/**
 * RDO Protocol Tests - ShowNotification Push Detection & Parsing
 *
 * Tests ShowNotification push command handling in spo_session.ts handlePush().
 *
 * ShowNotification format:
 *   C sel <proxy> call ShowNotification "*" "#<kind>","%<title>","%<body>","#<options>";
 *
 * NotificationKind (from Delphi TNotificationKind):
 *   0=MessageBox, 1=URLFrame, 2=ChatMessage, 3=Sound, 4=GenericEvent
 */

import { describe, it, expect } from '@jest/globals';
import type { RdoPacket } from '../../../shared/types/protocol-types';
import { RdoParser } from '../../../shared/rdo-types';

// ==========================================================================
// Replicate isShowNotificationPush logic (matches spo_session.ts handlePush)
// ==========================================================================
function isShowNotificationPush(packet: RdoPacket): boolean {
  return packet.type === 'PUSH' &&
         packet.member === 'ShowNotification' &&
         packet.separator === '"*"';
}

// ==========================================================================
// Replicate parseShowNotificationPush logic
// ==========================================================================
function parseShowNotificationPush(packet: RdoPacket): {
  kind: number;
  title: string;
  body: string;
  options: number;
} {
  const kind = packet.args?.[0] ? RdoParser.asInt(packet.args[0]) : 0;
  const title = packet.args?.[1] ? RdoParser.getValue(packet.args[1]) : '';
  const body = packet.args?.[2] ? RdoParser.getValue(packet.args[2]) : '';
  const options = packet.args?.[3] ? RdoParser.asInt(packet.args[3]) : 0;
  return { kind, title, body, options };
}

// ==========================================================================
// Detection tests
// ==========================================================================
describe('isShowNotificationPush', () => {
  it('returns true for a valid ShowNotification push', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      args: ['#4', '%', '%Research completed.', '#1'],
      raw: 'C sel 39474736 call ShowNotification "*" "#4","%","%Research completed.","#1";',
    };
    expect(isShowNotificationPush(packet)).toBe(true);
  });

  it('returns false for non-PUSH type', () => {
    const packet: RdoPacket = {
      type: 'RESPONSE',
      member: 'ShowNotification',
      separator: '"*"',
      args: [],
      raw: '',
    };
    expect(isShowNotificationPush(packet)).toBe(false);
  });

  it('returns false for wrong member name', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: [],
      raw: '',
    };
    expect(isShowNotificationPush(packet)).toBe(false);
  });

  it('returns false for call separator instead of push', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"^"',
      args: [],
      raw: '',
    };
    expect(isShowNotificationPush(packet)).toBe(false);
  });

  it('returns false when separator is missing', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      args: [],
      raw: '',
    };
    expect(isShowNotificationPush(packet)).toBe(false);
  });
});

// ==========================================================================
// Parsing tests
// ==========================================================================
describe('parseShowNotificationPush', () => {
  it('parses research completion notification (kind=4)', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      args: [
        '#4',
        '%',
        '%Research "Water Quest Licenses" completed. Check for new items in your Build page.',
        '#1',
      ],
      raw: 'C sel 39474736 call ShowNotification "*" "#4","%","%Research ""Water Quest Licenses"" completed. Check for new items in your Build page.","#1";',
    };

    const result = parseShowNotificationPush(packet);
    expect(result.kind).toBe(4);
    expect(result.title).toBe('');
    expect(result.body).toBe('Research "Water Quest Licenses" completed. Check for new items in your Build page.');
    expect(result.options).toBe(1);
  });

  it('parses MessageBox notification (kind=0)', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      args: ['#0', '%Important', '%Server maintenance in 10 minutes.', '#0'],
      raw: '',
    };

    const result = parseShowNotificationPush(packet);
    expect(result.kind).toBe(0);
    expect(result.title).toBe('Important');
    expect(result.body).toBe('Server maintenance in 10 minutes.');
    expect(result.options).toBe(0);
  });

  it('parses Sound notification (kind=3)', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      args: ['#3', '%', '%', '#0'],
      raw: '',
    };

    const result = parseShowNotificationPush(packet);
    expect(result.kind).toBe(3);
    expect(result.title).toBe('');
    expect(result.body).toBe('');
    expect(result.options).toBe(0);
  });

  it('handles empty title (just % prefix)', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      args: ['#4', '%', '%Some body text.', '#1'],
      raw: '',
    };

    const result = parseShowNotificationPush(packet);
    expect(result.title).toBe('');
    expect(result.body).toBe('Some body text.');
  });

  it('defaults to 0/empty when args are missing', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      args: [],
      raw: '',
    };

    const result = parseShowNotificationPush(packet);
    expect(result.kind).toBe(0);
    expect(result.title).toBe('');
    expect(result.body).toBe('');
    expect(result.options).toBe(0);
  });

  it('defaults gracefully when args is undefined', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      raw: '',
    };

    const result = parseShowNotificationPush(packet);
    expect(result.kind).toBe(0);
    expect(result.title).toBe('');
    expect(result.body).toBe('');
    expect(result.options).toBe(0);
  });

  it('handles partial args (only kind provided)', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'ShowNotification',
      separator: '"*"',
      args: ['#2'],
      raw: '',
    };

    const result = parseShowNotificationPush(packet);
    expect(result.kind).toBe(2);
    expect(result.title).toBe('');
    expect(result.body).toBe('');
    expect(result.options).toBe(0);
  });

  it('parses all NotificationKind values correctly', () => {
    const kinds = [0, 1, 2, 3, 4];
    for (const k of kinds) {
      const packet: RdoPacket = {
        type: 'PUSH',
        member: 'ShowNotification',
        separator: '"*"',
        args: [`#${k}`, '%', '%test', '#0'],
        raw: '',
      };
      expect(parseShowNotificationPush(packet).kind).toBe(k);
    }
  });
});

// ==========================================================================
// Bare Refresh push tests
// ==========================================================================
describe('bare Refresh push', () => {
  function isRefreshPush(packet: RdoPacket): boolean {
    return packet.type === 'PUSH' &&
           packet.member === 'Refresh' &&
           (!packet.args || packet.args.length === 0);
  }

  it('detects bare Refresh push (no args)', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'Refresh',
      separator: '"*"',
      args: [],
      raw: 'C 241 sel 31413720 call Refresh "*" ;',
    };
    expect(isRefreshPush(packet)).toBe(true);
  });

  it('detects bare Refresh push when args is undefined', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'Refresh',
      separator: '"*"',
      raw: 'C 241 sel 31413720 call Refresh "*" ;',
    };
    expect(isRefreshPush(packet)).toBe(true);
  });

  it('does not match RefreshObject', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#129625108', '#1', '%'],
      raw: '',
    };
    expect(isRefreshPush(packet)).toBe(false);
  });

  it('does not match RefreshArea', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#462', '#403', '#3', '#1', '%data'],
      raw: '',
    };
    expect(isRefreshPush(packet)).toBe(false);
  });

  it('does not match RefreshTycoon', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'RefreshTycoon',
      separator: '"*"',
      args: ['%4666201923', '%10359', '#2', '#33', '#70'],
      raw: '',
    };
    expect(isRefreshPush(packet)).toBe(false);
  });

  it('does not match Refresh with args (different command)', () => {
    const packet: RdoPacket = {
      type: 'PUSH',
      member: 'Refresh',
      separator: '"*"',
      args: ['#1'],
      raw: '',
    };
    expect(isRefreshPush(packet)).toBe(false);
  });
});
