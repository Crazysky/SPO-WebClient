/**
 * Tests for map-parsers
 * Tests ObjectsInArea parsing and OptionsByte decoding (spec Section 4)
 */

import { describe, it, expect } from '@jest/globals';
import { parseBuildings, parseSegments } from './map-parsers';

describe('parseBuildings', () => {
  describe('Basic parsing (spec Section 4.2)', () => {
    it('should parse a single building from 5 lines', () => {
      const lines = ['142', '3017', '33', '450', '820'];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(1);
      expect(buildings[0].visualClass).toBe('142');
      expect(buildings[0].tycoonId).toBe(3017);
      expect(buildings[0].options).toBe(33);
      expect(buildings[0].x).toBe(450);
      expect(buildings[0].y).toBe(820);
    });

    it('should parse multiple buildings', () => {
      const lines = ['142', '3017', '33', '450', '820', '98', '0', '16', '455', '825'];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(2);
      expect(buildings[0].visualClass).toBe('142');
      expect(buildings[1].visualClass).toBe('98');
    });

    it('should return empty array for empty input', () => {
      expect(parseBuildings([])).toHaveLength(0);
    });

    it('should skip incomplete groups (fewer than 5 lines)', () => {
      const lines = ['142', '3017', '33']; // Only 3 lines
      expect(parseBuildings(lines)).toHaveLength(0);
    });

    it('should handle buildings with no owner (tycoonId = 0)', () => {
      const lines = ['98', '0', '16', '455', '825'];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(1);
      expect(buildings[0].tycoonId).toBe(0);
    });
  });

  describe('OptionsByte decoding (spec Section 4.3)', () => {
    it('should decode level from bits 4-7 (unsigned shift right)', () => {
      // options = 33 = 0b00100001 → level = 33 >> 4 = 2
      const lines = ['100', '0', '33', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].level).toBe(2);
    });

    it('should decode alert from low nibble', () => {
      // options = 33 = 0b00100001 → (33 & 0x0F) = 1 → alert = true
      const lines = ['100', '0', '33', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].alert).toBe(true);
    });

    it('should decode alert as false when low nibble is 0', () => {
      // options = 16 = 0b00010000 → (16 & 0x0F) = 0 → alert = false
      const lines = ['100', '0', '16', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].alert).toBe(false);
    });

    it('should decode attack from bits 1-3', () => {
      // options = 33 = 0b00100001 → (33 & 0x0E) = 0
      const lines = ['100', '0', '33', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].attack).toBe(0);
    });

    it('should decode attack when bits 1-3 are set', () => {
      // options = 0b00010110 = 22 → (22 & 0x0E) = 6
      const lines = ['100', '0', '22', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].attack).toBe(6);
    });

    it('should handle options = 0 correctly', () => {
      const lines = ['100', '0', '0', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].level).toBe(0);
      expect(buildings[0].alert).toBe(false);
      expect(buildings[0].attack).toBe(0);
    });

    it('should handle max level (15)', () => {
      // options = 0xFF = 255 → level = 255 >> 4 = 15
      const lines = ['100', '0', '255', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].level).toBe(15);
    });

    it('should match worked example from spec Section 4.5', () => {
      // Object 0: visualClass=142, companyId=3017, info=33
      //   Level = 33 >> 4 = 2
      //   Alert = 33 & 0x0F = 1 → true
      //   Attack = 33 & 0x0E = 0
      const lines = ['142', '3017', '33', '450', '820'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].level).toBe(2);
      expect(buildings[0].alert).toBe(true);
      expect(buildings[0].attack).toBe(0);
    });

    it('should match second worked example from spec Section 4.5', () => {
      // Object 1: visualClass=98, companyId=0, info=16
      //   Level = 16 >> 4 = 1
      //   Alert = 16 & 0x0F = 0 → false
      //   Attack = 16 & 0x0E = 0
      const lines = ['98', '0', '16', '455', '825'];
      const buildings = parseBuildings(lines);

      expect(buildings[0].level).toBe(1);
      expect(buildings[0].alert).toBe(false);
      expect(buildings[0].attack).toBe(0);
    });
  });

  describe('VisualClass cleaning', () => {
    it('should handle already-clean numeric strings', () => {
      const lines = ['4602', '0', '16', '100', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(1);
      expect(buildings[0].visualClass).toBe('4602');
    });
  });

  describe('Context/header line skipping', () => {
    it('should skip non-numeric context lines at the beginning', () => {
      // ObjectsInArea may return localized context text before building data
      const lines = [
        'IdentidadeCom sinalizador',
        'Status: Active',
        '142', '3017', '33', '450', '820',
      ];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(1);
      expect(buildings[0].visualClass).toBe('142');
      expect(buildings[0].tycoonId).toBe(3017);
      expect(buildings[0].x).toBe(450);
      expect(buildings[0].y).toBe(820);
    });

    it('should skip a single context header line', () => {
      const lines = [
        'Área de Construção',
        '98', '0', '16', '455', '825',
      ];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(1);
      expect(buildings[0].visualClass).toBe('98');
    });

    it('should parse correctly with no context header', () => {
      const lines = ['142', '3017', '33', '450', '820'];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(1);
      expect(buildings[0].visualClass).toBe('142');
    });

    it('should parse multiple buildings after context header', () => {
      const lines = [
        'Some context text',
        'More context',
        '142', '3017', '33', '450', '820',
        '98', '0', '16', '455', '825',
      ];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(2);
      expect(buildings[0].visualClass).toBe('142');
      expect(buildings[1].visualClass).toBe('98');
    });
  });

  describe('Validation', () => {
    it('should reject coordinates out of range', () => {
      const lines = ['100', '0', '16', '5000', '100']; // x > 2000
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(0);
    });

    it('should reject negative coordinates', () => {
      const lines = ['100', '0', '16', '-5', '100'];
      const buildings = parseBuildings(lines);

      expect(buildings).toHaveLength(0);
    });
  });
});

describe('parseSegments', () => {
  it('should parse a single segment from 10 lines', () => {
    const lines = ['10', '20', '30', '40', '1', '2', '3', '4', '5', '6'];
    const segments = parseSegments(lines);

    expect(segments).toHaveLength(1);
    expect(segments[0].x1).toBe(10);
    expect(segments[0].y1).toBe(20);
    expect(segments[0].x2).toBe(30);
    expect(segments[0].y2).toBe(40);
  });

  it('should return empty array for empty input', () => {
    expect(parseSegments([])).toHaveLength(0);
  });

  it('should skip non-numeric context lines at the beginning', () => {
    const lines = [
      'Road Network Data',
      '10', '20', '30', '40', '1', '2', '3', '4', '5', '6',
    ];
    const segments = parseSegments(lines);

    expect(segments).toHaveLength(1);
    expect(segments[0].x1).toBe(10);
    expect(segments[0].y1).toBe(20);
  });
});
