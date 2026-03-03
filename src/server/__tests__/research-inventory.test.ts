/**
 * Tests for parseResearchItems — verifies cache property name construction
 * and correct extraction of invention items from cache values.
 */

import { describe, it, expect } from '@jest/globals';
import { parseResearchItems } from '../spo_session';

describe('parseResearchItems', () => {
  it('should return empty array for zero count', () => {
    const result = parseResearchItems('avl', 0, 0, new Map(), true);
    expect(result).toEqual([]);
  });

  it('should parse available items with enabled flag', () => {
    const values = new Map([
      ['avl0RsId0', 'GreenTech.Level1'],
      ['avl0RsEnabled0', '1'],  // Delphi TObjectCache.WriteBoolean writes '1' for true
      ['avl0RsName0', 'Green Technology 1'],
      ['avl0RsDyn0', 'yes'],
      ['avl0RsParent0', 'GreenTech'],

      ['avl0RsId1', 'GreenTech.Level2'],
      ['avl0RsEnabled1', '0'],  // Delphi TObjectCache.WriteBoolean writes '0' for false
      ['avl0RsName1', ''],
      ['avl0RsDyn1', 'no'],
      ['avl0RsParent1', 'GreenTech'],
    ]);

    const result = parseResearchItems('avl', 0, 2, values, true);
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      inventionId: 'GreenTech.Level1',
      name: 'Green Technology 1',
      enabled: true,
      cost: undefined,
      parent: 'GreenTech',
      volatile: true,
    });

    expect(result[1]).toEqual({
      inventionId: 'GreenTech.Level2',
      name: 'GreenTech.Level2', // falls back to ID when name is empty
      enabled: false,
      cost: undefined,
      parent: 'GreenTech',
      volatile: undefined, // 'no' → not volatile
    });
  });

  it('should parse developing items without enabled flag', () => {
    const values = new Map([
      ['dev0RsId0', 'AI.Research1'],
      ['dev0RsName0', 'AI Research'],
      ['dev0RsDyn0', 'no'],
      ['dev0RsParent0', 'AI'],
    ]);

    const result = parseResearchItems('dev', 0, 1, values, false);
    expect(result).toHaveLength(1);

    expect(result[0]).toEqual({
      inventionId: 'AI.Research1',
      name: 'AI Research',
      enabled: undefined,
      cost: undefined,
      parent: 'AI',
      volatile: undefined,
    });
  });

  it('should parse completed items with cost', () => {
    const values = new Map([
      ['has0RsId0', 'Basic.Level1'],
      ['has0RsCost0', '$1,500,000'],
      ['has0RsName0', 'Basic Technology'],
      ['has0RsDyn0', 'no'],
      ['has0RsParent0', ''],
    ]);

    const result = parseResearchItems('has', 0, 1, values, false);
    expect(result).toHaveLength(1);

    expect(result[0]).toEqual({
      inventionId: 'Basic.Level1',
      name: 'Basic Technology',
      enabled: undefined,
      cost: '$1,500,000',
      parent: undefined, // empty string → undefined
      volatile: undefined,
    });
  });

  it('should skip items with empty ID', () => {
    const values = new Map([
      ['avl0RsId0', 'Valid.Item'],
      ['avl0RsEnabled0', 'true'],
      ['avl0RsName0', 'Valid'],
      ['avl0RsDyn0', 'no'],
      // avl0RsId1 is missing (no value in map)
      ['avl0RsEnabled1', 'true'],
      ['avl0RsName1', 'Invalid'],
      ['avl0RsDyn1', 'no'],
    ]);

    const result = parseResearchItems('avl', 0, 2, values, true);
    expect(result).toHaveLength(1);
    expect(result[0].inventionId).toBe('Valid.Item');
  });

  it('should handle category index other than 0', () => {
    const values = new Map([
      ['avl2RsId0', 'Tech.Cat2'],
      ['avl2RsEnabled0', '-1'],
      ['avl2RsName0', 'Category 2 Tech'],
      ['avl2RsDyn0', 'yes'],
      ['avl2RsParent0', 'Tech'],
    ]);

    const result = parseResearchItems('avl', 2, 1, values, true);
    expect(result).toHaveLength(1);
    expect(result[0].inventionId).toBe('Tech.Cat2');
    expect(result[0].volatile).toBe(true);
  });

  it('should treat enabled=1 as enabled (Delphi TObjectCache.WriteBoolean)', () => {
    const values = new Map([
      ['avl0RsId0', 'Item1'],
      ['avl0RsEnabled0', '1'],
      ['avl0RsName0', 'Item 1'],
      ['avl0RsDyn0', 'no'],
    ]);

    const result = parseResearchItems('avl', 0, 1, values, true);
    expect(result[0].enabled).toBe(true);
  });

  it('should treat enabled=true as enabled', () => {
    const values = new Map([
      ['avl0RsId0', 'Item1'],
      ['avl0RsEnabled0', 'true'],
      ['avl0RsName0', 'Item 1'],
      ['avl0RsDyn0', 'no'],
    ]);

    const result = parseResearchItems('avl', 0, 1, values, true);
    expect(result[0].enabled).toBe(true);
  });

  it('should treat enabled=-1 as enabled (Delphi WordBool fallback)', () => {
    const values = new Map([
      ['avl0RsId0', 'Item1'],
      ['avl0RsEnabled0', '-1'],
      ['avl0RsName0', 'Item 1'],
      ['avl0RsDyn0', 'no'],
    ]);

    const result = parseResearchItems('avl', 0, 1, values, true);
    expect(result[0].enabled).toBe(true);
  });

  it('should treat enabled=0 as disabled (Delphi TObjectCache.WriteBoolean)', () => {
    const values = new Map([
      ['avl0RsId0', 'Item1'],
      ['avl0RsEnabled0', '0'],
      ['avl0RsName0', 'Item 1'],
      ['avl0RsDyn0', 'no'],
    ]);

    const result = parseResearchItems('avl', 0, 1, values, true);
    expect(result[0].enabled).toBe(false);
  });
});
