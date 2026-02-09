/**
 * Tests for CLASSES.BIN parser
 * Verifies correct parsing of the binary building class archive (spec Section 6.2)
 */

import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { parseClassesBin, BuildingClassEntry } from './classes-bin-parser';

// Mock logger to prevent console spam during tests
jest.mock('../shared/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

const CLASSES_BIN_PATH = path.join(__dirname, '../../cache/BuildingClasses/CLASSES.BIN');

// Skip all tests if CLASSES.BIN doesn't exist
const binExists = fs.existsSync(CLASSES_BIN_PATH);

(binExists ? describe : describe.skip)('ClassesBinParser', () => {
  let result: ReturnType<typeof parseClassesBin>;

  beforeAll(() => {
    result = parseClassesBin(CLASSES_BIN_PATH);
  });

  describe('String table', () => {
    it('should parse string table with known section names', () => {
      expect(result.stringCount).toBeGreaterThan(0);
    });
  });

  describe('Class count', () => {
    it('should parse all classes', () => {
      expect(result.classCount).toBeGreaterThan(0);
      expect(result.classes.length).toBe(result.classCount);
    });

    it('should have 863 classes (known count from CLASSES.BIN)', () => {
      expect(result.classes.length).toBe(863);
    });

    it('should have all classes with imagePath', () => {
      // Every entry in CLASSES.BIN has a texture
      const withImages = result.classes.filter(c => c.imagePath);
      expect(withImages.length).toBe(863);
    });
  });

  describe('ID lookup', () => {
    it('should provide O(1) lookup by ID', () => {
      const entry = result.byId.get(602);
      expect(entry).toBeDefined();
      expect(entry!.imagePath).toBe('MapPGIHQ1.gif');
    });

    it('should have correct ID range', () => {
      const ids = result.classes.map(c => c.id).sort((a, b) => a - b);
      expect(ids[0]).toBe(151);
      expect(ids[ids.length - 1]).toBe(8542);
    });
  });

  describe('Previously-invisible buildings', () => {
    it('should contain ID 602 (PGI HQ)', () => {
      const entry = result.byId.get(602);
      expect(entry).toBeDefined();
      expect(entry!.imagePath).toBe('MapPGIHQ1.gif');
      expect(entry!.size).toBe(3);
    });

    it('should contain ID 8022 (IFEL Tennis)', () => {
      const entry = result.byId.get(8022);
      expect(entry).toBeDefined();
      expect(entry!.imagePath).toBe('MapIFELTennis64x32.gif');
      expect(entry!.size).toBe(3);
    });

    it('should contain ID 8062 (IFEL AlienParkB)', () => {
      const entry = result.byId.get(8062);
      expect(entry).toBeDefined();
      expect(entry!.imagePath).toBe('MapIFELAlienParkB64x32x0.gif');
    });

    it('should contain ID 4722 with correct texture (not buildings.json wrong name)', () => {
      const entry = result.byId.get(4722);
      expect(entry).toBeDefined();
      // CLASSES.BIN has the correct name: MapPGIMarketA, NOT MapPGISupermarketA
      expect(entry!.imagePath).toBe('MapPGIMarketA64x32x0.gif');
    });

    it('should contain ID 8072 (IFEL AlienParkC)', () => {
      const entry = result.byId.get(8072);
      expect(entry).toBeDefined();
      expect(entry!.imagePath).toBe('MapIFELAlienParkC64x32x0.gif');
    });

    it('should contain ID 7282 with correct texture (no typo)', () => {
      const entry = result.byId.get(7282);
      expect(entry).toBeDefined();
      // CLASSES.BIN has correct: ComputerStore (no 's'), not ComputersStore
      expect(entry!.imagePath).toBe('MapMKOComputerStore64x32x0.gif');
    });
  });

  describe('Property extraction (spec Section 6.3)', () => {
    it('should extract xSize from General section', () => {
      // ID 602 (PGI HQ) has xSize=3
      const entry = result.byId.get(602);
      expect(entry!.size).toBe(3);
    });

    it('should extract urban flag', () => {
      // ID 602 is urban
      const entry = result.byId.get(602);
      expect(entry!.urban).toBe(true);
    });

    it('should extract imagePath from MapImages section', () => {
      const entry = result.byId.get(602);
      expect(entry!.imagePath).toBe('MapPGIHQ1.gif');
    });

    it('should have selectable default to true', () => {
      // Most buildings should be selectable
      const selectableCount = result.classes.filter(c => c.selectable).length;
      expect(selectableCount).toBeGreaterThan(result.classes.length / 2);
    });
  });

  describe('Construction textures', () => {
    it('should have construction entries (imagePath starts with Construction)', () => {
      const constructionEntries = result.classes.filter(c =>
        c.imagePath.startsWith('Construction')
      );
      expect(constructionEntries.length).toBeGreaterThan(0);
    });

    it('construction entries should be followed by building entries', () => {
      // ID 601 is construction for PGI HQ, ID 602 is the building
      const construction = result.byId.get(601);
      const building = result.byId.get(602);
      expect(construction!.imagePath).toBe('Construction192.gif');
      expect(building!.imagePath).toBe('MapPGIHQ1.gif');
    });
  });
});
