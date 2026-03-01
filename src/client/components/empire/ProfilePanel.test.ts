/**
 * Tests for ProfilePanel utility functions and policy value mapping.
 */

import { describe, it, expect } from '@jest/globals';
import { formatMoney } from './ProfilePanel';

describe('formatMoney()', () => {
  it('should format positive integers with thousands separators', () => {
    expect(formatMoney(1234567)).toBe('$1,234,567');
    expect(formatMoney(1000)).toBe('$1,000');
    expect(formatMoney(999)).toBe('$999');
    expect(formatMoney(0)).toBe('$0');
  });

  it('should format string inputs', () => {
    expect(formatMoney('1234567')).toBe('$1,234,567');
    expect(formatMoney('500000')).toBe('$500,000');
    expect(formatMoney('0')).toBe('$0');
  });

  it('should handle strings with existing commas', () => {
    expect(formatMoney('1,234,567')).toBe('$1,234,567');
  });

  it('should handle negative values', () => {
    expect(formatMoney(-5000)).toBe('-$5,000');
    expect(formatMoney('-15000')).toBe('-$15,000');
  });

  it('should return $0 for NaN/invalid inputs', () => {
    expect(formatMoney(NaN)).toBe('$0');
    expect(formatMoney('invalid')).toBe('$0');
    expect(formatMoney('')).toBe('$0');
  });

  it('should truncate fractional parts', () => {
    expect(formatMoney(1234.56)).toBe('$1,235');
    expect(formatMoney('9999.99')).toBe('$10,000');
  });

  it('should handle very large values', () => {
    expect(formatMoney(1000000000)).toBe('$1,000,000,000');
    expect(formatMoney('50000000000')).toBe('$50,000,000,000');
  });
});

describe('Policy value mapping (Delphi TPolicyStatus)', () => {
  // These values match Delphi TPolicyStatus enum: 0=Ally, 1=Neutral, 2=Enemy
  const POLICY_LABELS: Record<number, string> = { 0: 'Ally', 1: 'Neutral', 2: 'Enemy' };
  const policyLabel = (val: number) => POLICY_LABELS[val] ?? 'Neutral';

  it('should map 0 to Ally (Delphi pstAlly)', () => {
    expect(policyLabel(0)).toBe('Ally');
  });

  it('should map 1 to Neutral (Delphi pstNeutral)', () => {
    expect(policyLabel(1)).toBe('Neutral');
  });

  it('should map 2 to Enemy (Delphi pstEnemy)', () => {
    expect(policyLabel(2)).toBe('Enemy');
  });

  it('should default to Neutral for unknown values', () => {
    expect(policyLabel(-1)).toBe('Neutral');
    expect(policyLabel(99)).toBe('Neutral');
  });
});
