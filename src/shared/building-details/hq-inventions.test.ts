/**
 * Tests for HQ Inventions Group
 * Verifies template structure, handler mapping, and group lookup.
 */

import { describe, it, expect } from '@jest/globals';
import {
  HQ_INVENTIONS_GROUP,
  HANDLER_TO_GROUP,
  GROUP_BY_ID,
  getGroupById,
} from './template-groups';
import { PropertyType } from './property-definitions';

describe('HQ_INVENTIONS_GROUP', () => {
  it('should have correct id and name', () => {
    expect(HQ_INVENTIONS_GROUP.id).toBe('hqInventions');
    expect(HQ_INVENTIONS_GROUP.name).toBe('Research');
    expect(HQ_INVENTIONS_GROUP.icon).toBe('R');
    expect(HQ_INVENTIONS_GROUP.order).toBe(15);
  });

  it('should have RsKind as TEXT with hideEmpty', () => {
    const rsKind = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'RsKind');
    expect(rsKind).toBeDefined();
    expect(rsKind!.type).toBe(PropertyType.TEXT);
    expect(rsKind!.hideEmpty).toBe(true);
  });

  it('should have CatCount as NUMBER with hideEmpty', () => {
    const catCount = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'CatCount');
    expect(catCount).toBeDefined();
    expect(catCount!.type).toBe(PropertyType.NUMBER);
    expect(catCount!.hideEmpty).toBe(true);
  });

  it('should have count properties for available, developing, completed', () => {
    const avl = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'avlCount0');
    const dev = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'devCount0');
    const has = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'hasCount0');

    expect(avl).toBeDefined();
    expect(dev).toBeDefined();
    expect(has).toBeDefined();

    expect(avl!.type).toBe(PropertyType.NUMBER);
    expect(dev!.type).toBe(PropertyType.NUMBER);
    expect(has!.type).toBe(PropertyType.NUMBER);

    expect(avl!.hideEmpty).toBe(true);
    expect(dev!.hideEmpty).toBe(true);
    expect(has!.hideEmpty).toBe(true);
  });

  it('should have a RESEARCH_PANEL marker property', () => {
    const panel = HQ_INVENTIONS_GROUP.properties.find(p => p.type === PropertyType.RESEARCH_PANEL);
    expect(panel).toBeDefined();
    expect(panel!.rdoName).toBe('_researchPanel');
  });

  it('should have no TABLE or ACTION_BUTTON properties', () => {
    const tables = HQ_INVENTIONS_GROUP.properties.filter(p => p.type === PropertyType.TABLE);
    const buttons = HQ_INVENTIONS_GROUP.properties.filter(p => p.type === PropertyType.ACTION_BUTTON);
    expect(tables).toHaveLength(0);
    expect(buttons).toHaveLength(0);
  });

  it('should have rdoCommands for RDOQueueResearch and RDOCancelResearch', () => {
    expect(HQ_INVENTIONS_GROUP.rdoCommands).toBeDefined();
    expect(HQ_INVENTIONS_GROUP.rdoCommands!['RDOQueueResearch']).toBeDefined();
    expect(HQ_INVENTIONS_GROUP.rdoCommands!['RDOCancelResearch']).toBeDefined();
  });

  it('should have exactly 6 properties', () => {
    expect(HQ_INVENTIONS_GROUP.properties).toHaveLength(6);
  });
});

describe('Handler and Group mappings', () => {
  it('should map hdqInventions handler to HQ_INVENTIONS_GROUP', () => {
    expect(HANDLER_TO_GROUP['hdqInventions']).toBe(HQ_INVENTIONS_GROUP);
  });

  it('should be in GROUP_BY_ID as hqInventions', () => {
    expect(GROUP_BY_ID['hqInventions']).toBe(HQ_INVENTIONS_GROUP);
  });

  it('should be resolved by getGroupById', () => {
    expect(getGroupById('hqInventions')).toBe(HQ_INVENTIONS_GROUP);
  });
});
