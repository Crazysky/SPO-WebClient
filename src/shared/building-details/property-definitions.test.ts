/**
 * Unit Tests for Property Formatting Functions
 * Tests for formatCurrency, formatPercentage, formatNumber, and parsePropertyResponse
 */

import { describe, it, expect } from '@jest/globals';
import {
  formatCurrency,
  formatPercentage,
  formatNumber,
  parsePropertyResponse
} from './property-definitions';

describe('formatCurrency()', () => {
  describe('Basic formatting', () => {
    it('should format small values with dollar sign', () => {
      expect(formatCurrency(100)).toBe('$100.00');
      expect(formatCurrency(50.5)).toBe('$50.50');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle string input', () => {
      expect(formatCurrency('500')).toBe('$500.00');
      expect(formatCurrency('123.45')).toBe('$123.45');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency('0')).toBe('$0.00');
    });
  });

  describe('Thousand formatting (K)', () => {
    it('should format thousands with K suffix', () => {
      expect(formatCurrency(1000)).toBe('$1.00K');
      expect(formatCurrency(5500)).toBe('$5.50K');
      expect(formatCurrency(15000)).toBe('$15.00K');
    });

    it('should use K for values between 1K and 1M', () => {
      expect(formatCurrency(999)).toBe('$999.00');
      expect(formatCurrency(1000)).toBe('$1.00K');
      expect(formatCurrency(999999)).toBe('$1000.00K');
    });

    it('should round to 2 decimal places', () => {
      expect(formatCurrency(1234)).toBe('$1.23K');
      expect(formatCurrency(1567)).toBe('$1.57K');
    });
  });

  describe('Million formatting (M)', () => {
    it('should format millions with M suffix', () => {
      expect(formatCurrency(1000000)).toBe('$1.00M');
      expect(formatCurrency(2500000)).toBe('$2.50M');
      expect(formatCurrency(15000000)).toBe('$15.00M');
    });

    it('should use M for values between 1M and 1B', () => {
      expect(formatCurrency(999999)).toBe('$1000.00K');
      expect(formatCurrency(1000000)).toBe('$1.00M');
      expect(formatCurrency(999999999)).toBe('$1000.00M');
    });
  });

  describe('Billion formatting (B)', () => {
    it('should format billions with B suffix', () => {
      expect(formatCurrency(1000000000)).toBe('$1.00B');
      expect(formatCurrency(1500000000)).toBe('$1.50B');
      expect(formatCurrency(25000000000)).toBe('$25.00B');
    });

    it('should use B for very large values', () => {
      expect(formatCurrency(1e9)).toBe('$1.00B');
      expect(formatCurrency(5.5e10)).toBe('$55.00B');
    });
  });

  describe('Negative values', () => {
    it('should handle negative small values', () => {
      expect(formatCurrency(-100)).toBe('-$100.00');
      expect(formatCurrency(-50.5)).toBe('-$50.50');
    });

    it('should handle negative thousands', () => {
      expect(formatCurrency(-5000)).toBe('-$5.00K');
      expect(formatCurrency(-15000)).toBe('-$15.00K');
    });

    it('should handle negative millions', () => {
      expect(formatCurrency(-2500000)).toBe('-$2.50M');
    });

    it('should handle negative billions', () => {
      expect(formatCurrency(-1500000000)).toBe('-$1.50B');
    });
  });

  describe('Edge cases', () => {
    it('should handle NaN input as $0', () => {
      expect(formatCurrency(NaN)).toBe('$0');
      expect(formatCurrency('invalid')).toBe('$0');
      expect(formatCurrency('')).toBe('$0');
    });

    it('should handle very small decimals', () => {
      expect(formatCurrency(0.01)).toBe('$0.01');
      expect(formatCurrency(0.99)).toBe('$0.99');
    });

    it('should handle values just below thresholds', () => {
      expect(formatCurrency(999)).toBe('$999.00');
      expect(formatCurrency(999999)).toBe('$1000.00K');
    });

    it('should handle values just at thresholds', () => {
      expect(formatCurrency(1000)).toBe('$1.00K');
      expect(formatCurrency(1000000)).toBe('$1.00M');
      expect(formatCurrency(1000000000)).toBe('$1.00B');
    });
  });
});

describe('formatPercentage()', () => {
  describe('Basic formatting', () => {
    it('should format percentage with % sign', () => {
      expect(formatPercentage(50)).toBe('50%');
      expect(formatPercentage(100)).toBe('100%');
      expect(formatPercentage(0)).toBe('0%');
    });

    it('should handle string input', () => {
      expect(formatPercentage('75')).toBe('75%');
      expect(formatPercentage('100')).toBe('100%');
    });

    it('should round to 0 decimal places', () => {
      expect(formatPercentage(50.4)).toBe('50%');
      expect(formatPercentage(50.6)).toBe('51%');
      expect(formatPercentage(99.9)).toBe('100%');
    });
  });

  describe('Edge cases', () => {
    it('should handle values over 100%', () => {
      expect(formatPercentage(150)).toBe('150%');
      expect(formatPercentage(250)).toBe('250%');
    });

    it('should handle negative percentages', () => {
      expect(formatPercentage(-10)).toBe('-10%');
      expect(formatPercentage(-50.5)).toBe('-51%');
    });

    it('should handle zero', () => {
      expect(formatPercentage(0)).toBe('0%');
      expect(formatPercentage('0')).toBe('0%');
    });

    it('should handle NaN as 0%', () => {
      expect(formatPercentage(NaN)).toBe('0%');
      expect(formatPercentage('invalid')).toBe('0%');
      expect(formatPercentage('')).toBe('0%');
    });

    it('should handle decimal values', () => {
      expect(formatPercentage(33.333)).toBe('33%');
      expect(formatPercentage(66.666)).toBe('67%');
    });
  });
});

describe('formatNumber()', () => {
  describe('Basic formatting without unit', () => {
    it('should format small integers as-is', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(999)).toBe('999');
    });

    it('should format small decimals with 2 decimal places', () => {
      expect(formatNumber(3.14159)).toBe('3.14');
      expect(formatNumber(100.5)).toBe('100.50');
    });

    it('should format integers without decimals', () => {
      expect(formatNumber(100)).toBe('100');
      expect(formatNumber(500)).toBe('500');
    });

    it('should handle string input', () => {
      expect(formatNumber('123')).toBe('123');
      expect(formatNumber('45.67')).toBe('45.67');
    });
  });

  describe('Thousand formatting (K)', () => {
    it('should format thousands with K suffix', () => {
      expect(formatNumber(1000)).toBe('1.00K');
      expect(formatNumber(5500)).toBe('5.50K');
      expect(formatNumber(15000)).toBe('15.00K');
    });

    it('should use K for values between 1K and 1M', () => {
      expect(formatNumber(999)).toBe('999');
      expect(formatNumber(1000)).toBe('1.00K');
      expect(formatNumber(999999)).toBe('1000.00K');
    });
  });

  describe('Million formatting (M)', () => {
    it('should format millions with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1.00M');
      expect(formatNumber(2500000)).toBe('2.50M');
      expect(formatNumber(15000000)).toBe('15.00M');
    });

    it('should use M for values >= 1M', () => {
      expect(formatNumber(1e6)).toBe('1.00M');
      expect(formatNumber(5.5e7)).toBe('55.00M');
    });
  });

  describe('Formatting with unit', () => {
    it('should append unit to formatted value', () => {
      expect(formatNumber(100, 'kg/day')).toBe('100 kg/day');
      expect(formatNumber(1500, 'items')).toBe('1.50K items');
      expect(formatNumber(2500000, 'units')).toBe('2.50M units');
    });

    it('should handle empty unit string', () => {
      expect(formatNumber(100, '')).toBe('100');
    });

    it('should handle various unit types', () => {
      expect(formatNumber(42, 'years')).toBe('42 years');
      expect(formatNumber(3.14, 'meters')).toBe('3.14 meters');
      expect(formatNumber(5000, '%')).toBe('5.00K %');
    });
  });

  describe('Negative values', () => {
    it('should handle negative numbers', () => {
      expect(formatNumber(-100)).toBe('-100');
      expect(formatNumber(-5000)).toBe('-5.00K');
      expect(formatNumber(-2500000)).toBe('-2.50M');
    });

    it('should preserve sign with units', () => {
      expect(formatNumber(-100, 'items')).toBe('-100 items');
      expect(formatNumber(-5000, 'kg')).toBe('-5.00K kg');
    });
  });

  describe('Edge cases', () => {
    it('should handle NaN as 0', () => {
      expect(formatNumber(NaN)).toBe('0');
      expect(formatNumber('invalid')).toBe('0');
      expect(formatNumber('')).toBe('0');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(0, 'units')).toBe('0 units');
    });

    it('should handle very small decimals', () => {
      expect(formatNumber(0.01)).toBe('0.01');
      expect(formatNumber(0.99)).toBe('0.99');
    });

    it('should handle threshold boundaries', () => {
      expect(formatNumber(999)).toBe('999');
      expect(formatNumber(1000)).toBe('1.00K');
      expect(formatNumber(999999)).toBe('1000.00K');
      expect(formatNumber(1000000)).toBe('1.00M');
    });
  });
});

describe('parsePropertyResponse()', () => {
  describe('Basic parsing', () => {
    it('should parse tab-separated values', () => {
      const response = 'Value1\tValue2\tValue3';
      const properties = ['prop1', 'prop2', 'prop3'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('Value1');
      expect(result.get('prop2')).toBe('Value2');
      expect(result.get('prop3')).toBe('Value3');
    });

    it('should return Map instance', () => {
      const response = 'A\tB';
      const properties = ['p1', 'p2'];
      const result = parsePropertyResponse(response, properties);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
    });

    it('should trim whitespace from values', () => {
      const response = '  Value1  \t  Value2  \t  Value3  ';
      const properties = ['prop1', 'prop2', 'prop3'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('Value1');
      expect(result.get('prop2')).toBe('Value2');
      expect(result.get('prop3')).toBe('Value3');
    });
  });

  describe('Mismatched lengths', () => {
    it('should handle more properties than values', () => {
      const response = 'Value1\tValue2';
      const properties = ['prop1', 'prop2', 'prop3', 'prop4'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('Value1');
      expect(result.get('prop2')).toBe('Value2');
      expect(result.get('prop3')).toBeUndefined();
      expect(result.get('prop4')).toBeUndefined();
      expect(result.size).toBe(2);
    });

    it('should handle more values than properties', () => {
      const response = 'Value1\tValue2\tValue3\tValue4';
      const properties = ['prop1', 'prop2'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('Value1');
      expect(result.get('prop2')).toBe('Value2');
      expect(result.size).toBe(2);
    });

    it('should handle empty properties array', () => {
      const response = 'Value1\tValue2';
      const properties: string[] = [];
      const result = parsePropertyResponse(response, properties);

      expect(result.size).toBe(0);
    });
  });

  describe('Empty values', () => {
    it('should handle empty string values', () => {
      const response = '\t\t';
      const properties = ['prop1', 'prop2', 'prop3'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('');
      expect(result.get('prop2')).toBe('');
      expect(result.get('prop3')).toBe('');
      expect(result.size).toBe(3);
    });

    it('should handle mixed empty and non-empty values', () => {
      const response = 'Value1\t\tValue3';
      const properties = ['prop1', 'prop2', 'prop3'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('Value1');
      expect(result.get('prop2')).toBe('');
      expect(result.get('prop3')).toBe('Value3');
    });
  });

  describe('Special characters', () => {
    it('should handle values with spaces', () => {
      const response = 'Building Name\tCompany Inc.';
      const properties = ['name', 'company'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('name')).toBe('Building Name');
      expect(result.get('company')).toBe('Company Inc.');
    });

    it('should handle numeric values', () => {
      const response = '123\t456.78\t-999';
      const properties = ['int', 'float', 'negative'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('int')).toBe('123');
      expect(result.get('float')).toBe('456.78');
      expect(result.get('negative')).toBe('-999');
    });

    it('should handle special characters', () => {
      const response = 'Test & Co.\t$100\t50%';
      const properties = ['name', 'price', 'percent'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('name')).toBe('Test & Co.');
      expect(result.get('price')).toBe('$100');
      expect(result.get('percent')).toBe('50%');
    });
  });

  describe('Edge cases', () => {
    it('should handle single value', () => {
      const response = 'SingleValue';
      const properties = ['prop1'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('SingleValue');
      expect(result.size).toBe(1);
    });

    it('should handle empty response', () => {
      const response = '';
      const properties = ['prop1', 'prop2'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('prop1')).toBe('');
      expect(result.size).toBe(1);
    });

    it('should handle response with only tabs', () => {
      const response = '\t\t\t';
      const properties = ['p1', 'p2', 'p3', 'p4'];
      const result = parsePropertyResponse(response, properties);

      expect(result.size).toBe(4);
      expect(result.get('p1')).toBe('');
      expect(result.get('p2')).toBe('');
      expect(result.get('p3')).toBe('');
      expect(result.get('p4')).toBe('');
    });

    it('should handle long property lists', () => {
      const values = Array.from({ length: 50 }, (_, i) => `Value${i}`);
      const response = values.join('\t');
      const properties = Array.from({ length: 50 }, (_, i) => `prop${i}`);
      const result = parsePropertyResponse(response, properties);

      expect(result.size).toBe(50);
      expect(result.get('prop0')).toBe('Value0');
      expect(result.get('prop49')).toBe('Value49');
    });
  });

  describe('Real-world examples', () => {
    it('should parse building property response', () => {
      const response = 'Office Building\t100\t50\t$1,234.56\t85%';
      const properties = ['srvName', 'Workers0', 'WorkersMax0', 'srvPrice', 'Quality'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('srvName')).toBe('Office Building');
      expect(result.get('Workers0')).toBe('100');
      expect(result.get('WorkersMax0')).toBe('50');
      expect(result.get('srvPrice')).toBe('$1,234.56');
      expect(result.get('Quality')).toBe('85%');
    });

    it('should parse salary response', () => {
      const response = '100\t120\t150';
      const properties = ['Salaries0', 'Salaries1', 'Salaries2'];
      const result = parsePropertyResponse(response, properties);

      expect(result.get('Salaries0')).toBe('100');
      expect(result.get('Salaries1')).toBe('120');
      expect(result.get('Salaries2')).toBe('150');
    });
  });
});
