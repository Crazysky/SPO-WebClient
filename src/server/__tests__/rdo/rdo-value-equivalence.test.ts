// @ts-nocheck
/**
 * RDO Value Equivalence Tests
 *
 * Regression test for the manual-prefix → RdoValue.format() migration.
 * Each test runs BOTH old manual args AND new RdoValue args through the
 * real RdoProtocol.format(), proving identical wire output and matching
 * the Delphi-spec expected string.
 *
 * One test per migrated method — no duplication.
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect } from '@jest/globals';
import { RdoValue } from '../../../shared/rdo-types';
import { RdoProtocol } from '../../rdo';
import { RdoPacket, RdoVerb, RdoAction } from '../../../shared/types';

function formatCall(target: string, member: string, args: string[], rid = 1): string {
  return RdoProtocol.format({
    rid, type: 'REQUEST', verb: RdoVerb.SEL, targetId: target,
    action: RdoAction.CALL, member, separator: '"^"', args,
  } as RdoPacket);
}

function formatSet(target: string, member: string, args: string[], rid = 1): string {
  return RdoProtocol.format({
    rid, type: 'REQUEST', verb: RdoVerb.SEL, targetId: target,
    action: RdoAction.SET, member, args,
  } as RdoPacket);
}

describe('RdoValue.format() ↔ manual prefix wire equivalence', () => {

  it('NewCompany: 3 OLE string args', () => {
    const oldWire = formatCall('999', 'NewCompany', ['%TestUser', '%My Company', '%PGI']);
    const newWire = formatCall('999', 'NewCompany', [
      RdoValue.string('TestUser').format(), RdoValue.string('My Company').format(), RdoValue.string('PGI').format(),
    ]);
    expect(newWire).toBe(oldWire);
    expect(newWire).toBe('C 1 sel 999 call NewCompany "^" "%TestUser","%My Company","%PGI"');
  });

  it('SwitchFocusEx: 3 integer args (with parseInt)', () => {
    const oldWire = formatCall('999', 'SwitchFocusEx', ['#0', '#472', '#392']);
    const newWire = formatCall('999', 'SwitchFocusEx', [
      RdoValue.int(parseInt('0', 10)).format(), RdoValue.int(472).format(), RdoValue.int(392).format(),
    ]);
    expect(newWire).toBe(oldWire);
    expect(newWire).toBe('C 1 sel 999 call SwitchFocusEx "^" "#0","#472","#392"');
  });

  it('SET Name: 1 OLE string value', () => {
    const oldWire = formatSet('100575368', 'Name', ['%My Office']);
    const newWire = formatSet('100575368', 'Name', [RdoValue.string('My Office').format()]);
    expect(newWire).toBe(oldWire);
    expect(newWire).toBe('C 1 sel 100575368 set Name="%My Office"');
  });

  it('RDODelFacility: 2 integer args', () => {
    const oldWire = formatCall('39751288', 'RDODelFacility', ['#100', '#200']);
    const newWire = formatCall('39751288', 'RDODelFacility', [RdoValue.int(100).format(), RdoValue.int(200).format()]);
    expect(newWire).toBe(oldWire);
    expect(newWire).toBe('C 1 sel 39751288 call RDODelFacility "^" "#100","#200"');
  });

  it('GetSurface: mixed args (1 string + 4 integers)', () => {
    const oldWire = formatCall('999', 'GetSurface', ['%Concrete', '#10', '#20', '#50', '#60']);
    const newWire = formatCall('999', 'GetSurface', [
      RdoValue.string('Concrete').format(), RdoValue.int(10).format(), RdoValue.int(20).format(),
      RdoValue.int(50).format(), RdoValue.int(60).format(),
    ]);
    expect(newWire).toBe(oldWire);
    expect(newWire).toBe('C 1 sel 999 call GetSurface "^" "%Concrete","#10","#20","#50","#60"');
  });

  it('NewFacility: mixed args (1 string + 3 integers)', () => {
    const oldWire = formatCall('999', 'NewFacility', ['%PGIFarm', '#28', '#472', '#392']);
    const newWire = formatCall('999', 'NewFacility', [
      RdoValue.string('PGIFarm').format(), RdoValue.int(28).format(), RdoValue.int(472).format(), RdoValue.int(392).format(),
    ]);
    expect(newWire).toBe(oldWire);
    expect(newWire).toBe('C 1 sel 999 call NewFacility "^" "%PGIFarm","#28","#472","#392"');
  });

  it('GetChannelList: 1 OLE string arg + separator fix', () => {
    const oldWire = formatCall('999', 'GetChannelList', ['%ROOT']);
    const newWire = formatCall('999', 'GetChannelList', [RdoValue.string('ROOT').format()]);
    expect(newWire).toBe(oldWire);
    expect(newWire).toBe('C 1 sel 999 call GetChannelList "^" "%ROOT"');
  });
});
