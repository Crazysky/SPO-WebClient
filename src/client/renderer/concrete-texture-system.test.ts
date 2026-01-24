/**
 * Concrete Texture System Tests
 *
 * Tests the algorithm from concrete-texture-system.ts by:
 * 1. Testing constant values
 * 2. Testing neighbor configuration building
 * 3. Testing land concrete ID calculations (0-12)
 * 4. Testing water concrete ID calculations (0-8)
 * 5. Testing flag applications (road, platform, special)
 * 6. Testing rotation tables
 * 7. Testing INI file parsing and class manager
 * 8. Validating all INI files and referenced textures exist
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CONCRETE_FULL,
  CONCRETE_SPECIAL,
  CONCRETE_ROAD_FLAG,
  CONCRETE_PLATFORM_FLAG,
  CONCRETE_PLATFORM_MASK,
  CONCRETE_NONE,
  NEIGHBOR_OFFSETS,
  CARDINAL_INDICES,
  DIAGONAL_INDICES,
  PLATFORM_IDS,
  ConcreteCfg,
  ConcreteMapData,
  ConcreteBlockClassManager,
  loadConcreteBlockClassFromIni,
  buildNeighborConfig,
  getLandConcreteId,
  getWaterConcreteId,
  getConcreteId,
  rotateConcreteId,
  LAND_CONCRETE_ROTATION,
  WATER_CONCRETE_ROTATION
} from './concrete-texture-system';
import { Rotation } from './road-texture-system';
import { LandClass } from '../../shared/land-utils';

// Path to cache directories
const CACHE_DIR = path.join(__dirname, '../../../cache');
const CONCRETE_CLASSES_DIR = path.join(CACHE_DIR, 'ConcreteClasses');
const CONCRETE_IMAGES_DIR = path.join(CACHE_DIR, 'ConcreteImages');

// =============================================================================
// MOCK MAP DATA
// =============================================================================

/**
 * Mock map data for testing concrete calculations
 */
class MockConcreteMapData implements ConcreteMapData {
  private concrete: Set<string> = new Set();
  private roads: Set<string> = new Set();
  private buildings: Set<string> = new Set();
  private landIds: Map<string, number> = new Map();

  setConcrete(row: number, col: number, value: boolean = true): void {
    const key = `${row},${col}`;
    if (value) this.concrete.add(key);
    else this.concrete.delete(key);
  }

  setRoad(row: number, col: number, value: boolean = true): void {
    const key = `${row},${col}`;
    if (value) this.roads.add(key);
    else this.roads.delete(key);
  }

  setBuilding(row: number, col: number, value: boolean = true): void {
    const key = `${row},${col}`;
    if (value) this.buildings.add(key);
    else this.buildings.delete(key);
  }

  setLandId(row: number, col: number, landId: number): void {
    this.landIds.set(`${row},${col}`, landId);
  }

  // Set all 8 neighbors around a tile to have concrete
  setAllNeighborsConcrete(row: number, col: number): void {
    for (const [di, dj] of NEIGHBOR_OFFSETS) {
      this.setConcrete(row + di, col + dj, true);
    }
  }

  // Interface implementation
  getLandId(row: number, col: number): number {
    return this.landIds.get(`${row},${col}`) ?? 0;
  }

  hasConcrete(row: number, col: number): boolean {
    return this.concrete.has(`${row},${col}`);
  }

  hasRoad(row: number, col: number): boolean {
    return this.roads.has(`${row},${col}`);
  }

  hasBuilding(row: number, col: number): boolean {
    return this.buildings.has(`${row},${col}`);
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('Concrete Texture System', () => {
  // ===========================================================================
  // CONSTANTS TESTS
  // ===========================================================================

  describe('Constants', () => {
    it('should have correct constant values', () => {
      expect(CONCRETE_FULL).toBe(12);
      expect(CONCRETE_SPECIAL).toBe(15);
      expect(CONCRETE_ROAD_FLAG).toBe(0x10);
      expect(CONCRETE_PLATFORM_FLAG).toBe(0x80);
      expect(CONCRETE_PLATFORM_MASK).toBe(0x7F);
      expect(CONCRETE_NONE).toBe(0xFF);
    });

    it('should have correct neighbor offset count', () => {
      expect(NEIGHBOR_OFFSETS.length).toBe(8);
    });

    it('should have correct cardinal indices', () => {
      expect(CARDINAL_INDICES.TOP).toBe(1);
      expect(CARDINAL_INDICES.LEFT).toBe(3);
      expect(CARDINAL_INDICES.RIGHT).toBe(4);
      expect(CARDINAL_INDICES.BOTTOM).toBe(6);
    });

    it('should have correct diagonal indices', () => {
      expect(DIAGONAL_INDICES.TOP_LEFT).toBe(0);
      expect(DIAGONAL_INDICES.TOP_RIGHT).toBe(2);
      expect(DIAGONAL_INDICES.BOTTOM_LEFT).toBe(5);
      expect(DIAGONAL_INDICES.BOTTOM_RIGHT).toBe(7);
    });
  });

  // ===========================================================================
  // NEIGHBOR CONFIGURATION TESTS
  // ===========================================================================

  describe('Neighbor Configuration', () => {
    it('should build correct neighbor config with no neighbors', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);

      const cfg = buildNeighborConfig(5, 5, mapData);

      expect(cfg).toEqual([false, false, false, false, false, false, false, false]);
    });

    it('should build correct neighbor config with all neighbors', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      mapData.setAllNeighborsConcrete(5, 5);

      const cfg = buildNeighborConfig(5, 5, mapData);

      expect(cfg).toEqual([true, true, true, true, true, true, true, true]);
    });

    it('should detect cardinal neighbors correctly', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      // Set only cardinal neighbors
      mapData.setConcrete(4, 5, true); // top
      mapData.setConcrete(5, 4, true); // left
      mapData.setConcrete(5, 6, true); // right
      mapData.setConcrete(6, 5, true); // bottom

      const cfg = buildNeighborConfig(5, 5, mapData);

      // Cardinals at indices 1, 3, 4, 6 should be true
      expect(cfg[CARDINAL_INDICES.TOP]).toBe(true);
      expect(cfg[CARDINAL_INDICES.LEFT]).toBe(true);
      expect(cfg[CARDINAL_INDICES.RIGHT]).toBe(true);
      expect(cfg[CARDINAL_INDICES.BOTTOM]).toBe(true);

      // Diagonals at indices 0, 2, 5, 7 should be false
      expect(cfg[DIAGONAL_INDICES.TOP_LEFT]).toBe(false);
      expect(cfg[DIAGONAL_INDICES.TOP_RIGHT]).toBe(false);
      expect(cfg[DIAGONAL_INDICES.BOTTOM_LEFT]).toBe(false);
      expect(cfg[DIAGONAL_INDICES.BOTTOM_RIGHT]).toBe(false);
    });

    it('should detect diagonal neighbors correctly', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      // Set only diagonal neighbors
      mapData.setConcrete(4, 4, true); // top-left
      mapData.setConcrete(4, 6, true); // top-right
      mapData.setConcrete(6, 4, true); // bottom-left
      mapData.setConcrete(6, 6, true); // bottom-right

      const cfg = buildNeighborConfig(5, 5, mapData);

      // Diagonals should be true
      expect(cfg[DIAGONAL_INDICES.TOP_LEFT]).toBe(true);
      expect(cfg[DIAGONAL_INDICES.TOP_RIGHT]).toBe(true);
      expect(cfg[DIAGONAL_INDICES.BOTTOM_LEFT]).toBe(true);
      expect(cfg[DIAGONAL_INDICES.BOTTOM_RIGHT]).toBe(true);

      // Cardinals should be false
      expect(cfg[CARDINAL_INDICES.TOP]).toBe(false);
      expect(cfg[CARDINAL_INDICES.LEFT]).toBe(false);
      expect(cfg[CARDINAL_INDICES.RIGHT]).toBe(false);
      expect(cfg[CARDINAL_INDICES.BOTTOM]).toBe(false);
    });
  });

  // ===========================================================================
  // LAND CONCRETE ID TESTS
  // ===========================================================================

  describe('Land Concrete ID Calculation', () => {
    it('should return CONCRETE_FULL (12) for fully surrounded tile', () => {
      const cfg: ConcreteCfg = [true, true, true, true, true, true, true, true];
      expect(getLandConcreteId(cfg)).toBe(CONCRETE_FULL);
    });

    it('should return ID 1 for missing top-left corner', () => {
      const cfg: ConcreteCfg = [false, true, true, true, true, true, true, true];
      expect(getLandConcreteId(cfg)).toBe(1);
    });

    it('should return ID 4 for missing top-right corner', () => {
      const cfg: ConcreteCfg = [true, true, false, true, true, true, true, true];
      expect(getLandConcreteId(cfg)).toBe(4);
    });

    it('should return ID 8 for missing bottom-right corner', () => {
      const cfg: ConcreteCfg = [true, true, true, true, true, true, true, false];
      expect(getLandConcreteId(cfg)).toBe(8);
    });

    it('should return ID 11 for missing bottom-left corner', () => {
      const cfg: ConcreteCfg = [true, true, true, true, true, false, true, true];
      expect(getLandConcreteId(cfg)).toBe(11);
    });

    it('should return edge IDs for edge patterns', () => {
      // Top edge: missing bottom
      const topEdge: ConcreteCfg = [true, true, true, true, true, true, false, true];
      expect(getLandConcreteId(topEdge)).toBeLessThan(CONCRETE_FULL);

      // Bottom edge: missing top
      const bottomEdge: ConcreteCfg = [true, false, true, true, true, true, true, true];
      expect(getLandConcreteId(bottomEdge)).toBeLessThan(CONCRETE_FULL);
    });
  });

  // ===========================================================================
  // WATER CONCRETE ID TESTS
  // ===========================================================================

  describe('Water Concrete ID Calculation', () => {
    it('should return CENTER ($80) when all cardinal neighbors present', () => {
      // All 4 cardinals: T L R B
      const cfg: ConcreteCfg = [false, true, false, true, true, false, true, false];
      expect(getWaterConcreteId(cfg)).toBe(PLATFORM_IDS.CENTER);
    });

    it('should return correct INI ID for each cardinal pattern', () => {
      // Pattern: _L_B = missing T,R → NE corner exposed
      const cfgNE: ConcreteCfg = [false, false, false, true, false, false, true, false];
      expect(getWaterConcreteId(cfgNE)).toBe(PLATFORM_IDS.NE);

      // Pattern: TL__ = missing R,B → SE corner exposed
      const cfgSE: ConcreteCfg = [false, true, false, true, false, false, false, false];
      expect(getWaterConcreteId(cfgSE)).toBe(PLATFORM_IDS.SE);

      // Pattern: TLRB = all cardinals → center
      const cfgCenter: ConcreteCfg = [false, true, false, true, true, false, true, false];
      expect(getWaterConcreteId(cfgCenter)).toBe(PLATFORM_IDS.CENTER);

      // Pattern: _LRB = missing T → N edge exposed
      const cfgN: ConcreteCfg = [false, false, false, true, true, false, true, false];
      expect(getWaterConcreteId(cfgN)).toBe(PLATFORM_IDS.N);

      // Pattern: TLR_ = missing B → S edge exposed
      const cfgS: ConcreteCfg = [false, true, false, true, true, false, false, false];
      expect(getWaterConcreteId(cfgS)).toBe(PLATFORM_IDS.S);
    });

    it('should ignore diagonal neighbors', () => {
      // Same cardinal pattern with different diagonals should give same result
      const cfg1: ConcreteCfg = [false, true, false, true, true, false, true, false];
      const cfg2: ConcreteCfg = [true, true, true, true, true, true, true, true];

      // Both have all 4 cardinals true → both should return CENTER
      expect(getWaterConcreteId(cfg1)).toBe(getWaterConcreteId(cfg2));
      expect(getWaterConcreteId(cfg1)).toBe(PLATFORM_IDS.CENTER);
    });
  });

  // ===========================================================================
  // MAIN GET CONCRETE ID TESTS
  // ===========================================================================

  describe('getConcreteId (Main Function)', () => {
    it('should return CONCRETE_NONE when tile has no concrete', () => {
      const mapData = new MockConcreteMapData();
      // Don't set concrete at (5,5)

      expect(getConcreteId(5, 5, mapData)).toBe(CONCRETE_NONE);
    });

    it('should return CONCRETE_FULL (12) when building present on land', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      mapData.setBuilding(5, 5, true);
      mapData.setLandId(5, 5, 0); // Land zone (not water)

      expect(getConcreteId(5, 5, mapData)).toBe(CONCRETE_FULL);
    });

    it('should NOT return CONCRETE_FULL when building on water', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      mapData.setBuilding(5, 5, true);
      // Water zone: LandClass.ZoneD (bits 7-6 = 11 = 3)
      mapData.setLandId(5, 5, 0xC0); // ZoneD = 0b11xxxxxx

      const result = getConcreteId(5, 5, mapData);
      // Should have platform flag
      expect(result & CONCRETE_PLATFORM_FLAG).toBe(CONCRETE_PLATFORM_FLAG);
    });

    it('should add PLATFORM_FLAG for water zones', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      mapData.setAllNeighborsConcrete(5, 5);
      mapData.setLandId(5, 5, 0xC0); // ZoneD (water)

      const result = getConcreteId(5, 5, mapData);

      expect(result & CONCRETE_PLATFORM_FLAG).toBe(CONCRETE_PLATFORM_FLAG);
    });

    it('should add ROAD_FLAG when road present and ID < 12', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      mapData.setRoad(5, 5, true);
      // Set only some neighbors so ID is not 12
      mapData.setConcrete(4, 5, true); // top

      const result = getConcreteId(5, 5, mapData);

      // If result is less than full concrete, road flag should be applied
      if ((result & CONCRETE_PLATFORM_MASK) < CONCRETE_FULL) {
        expect(result & CONCRETE_ROAD_FLAG).toBe(CONCRETE_ROAD_FLAG);
      }
    });

    it('should NOT add ROAD_FLAG when ID is CONCRETE_FULL', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true);
      mapData.setRoad(5, 5, true);
      mapData.setAllNeighborsConcrete(5, 5);
      mapData.setLandId(5, 5, 0); // Land zone

      // Building overrides to CONCRETE_FULL
      mapData.setBuilding(5, 5, true);

      const result = getConcreteId(5, 5, mapData);

      expect(result).toBe(CONCRETE_FULL);
      expect(result & CONCRETE_ROAD_FLAG).toBe(0);
    });

    it('should return CONCRETE_SPECIAL (15) on even grid without building/road', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(4, 4, true); // Even grid position
      mapData.setAllNeighborsConcrete(4, 4);
      mapData.setLandId(4, 4, 0); // Land zone

      const result = getConcreteId(4, 4, mapData);

      expect(result).toBe(CONCRETE_SPECIAL);
    });

    it('should NOT return CONCRETE_SPECIAL on odd grid', () => {
      const mapData = new MockConcreteMapData();
      mapData.setConcrete(5, 5, true); // Odd grid position
      mapData.setAllNeighborsConcrete(5, 5);
      mapData.setLandId(5, 5, 0); // Land zone

      const result = getConcreteId(5, 5, mapData);

      expect(result).toBe(CONCRETE_FULL);
    });
  });

  // ===========================================================================
  // ROTATION TESTS
  // ===========================================================================

  describe('Rotation', () => {
    it('should preserve CONCRETE_NONE under rotation', () => {
      expect(rotateConcreteId(CONCRETE_NONE, Rotation.North)).toBe(CONCRETE_NONE);
      expect(rotateConcreteId(CONCRETE_NONE, Rotation.East)).toBe(CONCRETE_NONE);
      expect(rotateConcreteId(CONCRETE_NONE, Rotation.South)).toBe(CONCRETE_NONE);
      expect(rotateConcreteId(CONCRETE_NONE, Rotation.West)).toBe(CONCRETE_NONE);
    });

    it('should preserve CONCRETE_FULL (12) under all rotations', () => {
      expect(rotateConcreteId(CONCRETE_FULL, Rotation.North)).toBe(CONCRETE_FULL);
      expect(rotateConcreteId(CONCRETE_FULL, Rotation.East)).toBe(CONCRETE_FULL);
      expect(rotateConcreteId(CONCRETE_FULL, Rotation.South)).toBe(CONCRETE_FULL);
      expect(rotateConcreteId(CONCRETE_FULL, Rotation.West)).toBe(CONCRETE_FULL);
    });

    it('should preserve CONCRETE_SPECIAL (15) under all rotations', () => {
      expect(rotateConcreteId(CONCRETE_SPECIAL, Rotation.North)).toBe(CONCRETE_SPECIAL);
      expect(rotateConcreteId(CONCRETE_SPECIAL, Rotation.East)).toBe(CONCRETE_SPECIAL);
      expect(rotateConcreteId(CONCRETE_SPECIAL, Rotation.South)).toBe(CONCRETE_SPECIAL);
      expect(rotateConcreteId(CONCRETE_SPECIAL, Rotation.West)).toBe(CONCRETE_SPECIAL);
    });

    it('should return same ID for Rotation.North (identity)', () => {
      for (let id = 0; id <= 12; id++) {
        expect(rotateConcreteId(id, Rotation.North)).toBe(id);
      }
    });

    it('should rotate land concrete IDs correctly', () => {
      // Test a few specific rotations based on rotation table
      expect(rotateConcreteId(1, Rotation.East)).toBe(LAND_CONCRETE_ROTATION[Rotation.East][1]);
      expect(rotateConcreteId(3, Rotation.South)).toBe(LAND_CONCRETE_ROTATION[Rotation.South][3]);
      expect(rotateConcreteId(5, Rotation.West)).toBe(LAND_CONCRETE_ROTATION[Rotation.West][5]);
    });

    it('should preserve platform flag through rotation', () => {
      const platformId = 0 | CONCRETE_PLATFORM_FLAG; // Platform center

      const rotated = rotateConcreteId(platformId, Rotation.East);

      expect(rotated & CONCRETE_PLATFORM_FLAG).toBe(CONCRETE_PLATFORM_FLAG);
    });

    it('should preserve road flag through rotation when applicable', () => {
      const roadId = 1 | CONCRETE_ROAD_FLAG; // ID 1 with road flag

      const rotated = rotateConcreteId(roadId, Rotation.East);
      const rotatedBase = rotated & 0x0F;

      // If rotated ID is less than 12, road flag should be preserved
      if (rotatedBase < CONCRETE_FULL) {
        expect(rotated & CONCRETE_ROAD_FLAG).toBe(CONCRETE_ROAD_FLAG);
      }
    });
  });

  // ===========================================================================
  // INI FILE PARSING TESTS
  // ===========================================================================

  describe('INI File Parsing', () => {
    it('should parse concrete INI file with decimal ID', () => {
      const content = `[General]
Id = 0
[Images]
64X32 = Concrete0.bmp`;

      const config = loadConcreteBlockClassFromIni(content);

      expect(config.id).toBe(0);
      expect(config.imagePath).toBe('Concrete0.bmp');
    });

    it('should parse concrete INI file with hexadecimal ID', () => {
      const content = `[General]
Id = $10
[Images]
64X32 = Conc_r1.bmp`;

      const config = loadConcreteBlockClassFromIni(content);

      expect(config.id).toBe(0x10); // 16 in decimal
      expect(config.imagePath).toBe('Conc_r1.bmp');
    });

    it('should parse platform INI file', () => {
      const content = `[General]
Id = $80
[Images]
64X32 = platC.bmp`;

      const config = loadConcreteBlockClassFromIni(content);

      expect(config.id).toBe(0x80); // 128 in decimal
      expect(config.imagePath).toBe('platC.bmp');
    });

    it('should handle case-insensitive image key', () => {
      const content1 = `[General]
Id = 0
[Images]
64X32 = Concrete0.bmp`;

      const content2 = `[General]
Id = 0
[Images]
64x32 = Concrete0.bmp`;

      const config1 = loadConcreteBlockClassFromIni(content1);
      const config2 = loadConcreteBlockClassFromIni(content2);

      expect(config1.imagePath).toBe('Concrete0.bmp');
      expect(config2.imagePath).toBe('Concrete0.bmp');
    });
  });

  // ===========================================================================
  // CLASS MANAGER TESTS
  // ===========================================================================

  describe('ConcreteBlockClassManager', () => {
    it('should load concrete block class from INI', () => {
      const manager = new ConcreteBlockClassManager();
      manager.setBasePath('/cache/');

      const content = `[General]
Id = 5
[Images]
64X32 = Concrete5.bmp`;

      manager.loadFromIni(content);

      expect(manager.hasClass(5)).toBe(true);
      expect(manager.getImageFilename(5)).toBe('Concrete5.bmp');
      expect(manager.getImagePath(5)).toBe('/cache/ConcreteImages/Concrete5.bmp');
    });

    it('should not load class with CONCRETE_NONE ID', () => {
      const manager = new ConcreteBlockClassManager();

      const content = `[General]
Id = 255
[Images]
64X32 = invalid.bmp`;

      manager.loadFromIni(content);

      expect(manager.hasClass(255)).toBe(false);
    });

    it('should return null for unknown class ID', () => {
      const manager = new ConcreteBlockClassManager();

      expect(manager.getImageFilename(999)).toBeNull();
      expect(manager.getImagePath(999)).toBeNull();
    });

    it('should track class count', () => {
      const manager = new ConcreteBlockClassManager();

      expect(manager.getClassCount()).toBe(0);

      manager.loadFromIni(`[General]\nId = 0\n[Images]\n64X32 = a.bmp`);
      expect(manager.getClassCount()).toBe(1);

      manager.loadFromIni(`[General]\nId = 1\n[Images]\n64X32 = b.bmp`);
      expect(manager.getClassCount()).toBe(2);
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS - ACTUAL INI FILES
  // ===========================================================================

  describe('Integration - INI File Validation', () => {
    // Skip if cache directory doesn't exist (CI environment)
    const cacheExists = fs.existsSync(CONCRETE_CLASSES_DIR);

    (cacheExists ? it : it.skip)('should find all INI files in ConcreteClasses', () => {
      const iniFiles = fs.readdirSync(CONCRETE_CLASSES_DIR)
        .filter(f => f.toLowerCase().endsWith('.ini'));

      expect(iniFiles.length).toBeGreaterThan(0);
      console.log(`Found ${iniFiles.length} concrete INI files`);
    });

    (cacheExists ? it : it.skip)('should parse all INI files without error', () => {
      const iniFiles = fs.readdirSync(CONCRETE_CLASSES_DIR)
        .filter(f => f.toLowerCase().endsWith('.ini'));

      const errors: string[] = [];

      for (const file of iniFiles) {
        try {
          const content = fs.readFileSync(path.join(CONCRETE_CLASSES_DIR, file), 'utf-8');
          const config = loadConcreteBlockClassFromIni(content);

          if (config.id === CONCRETE_NONE && !file.toLowerCase().includes('none')) {
            errors.push(`${file}: Invalid ID (parsed as CONCRETE_NONE)`);
          }
        } catch (e: any) {
          errors.push(`${file}: ${e.message}`);
        }
      }

      if (errors.length > 0) {
        console.log('INI parsing errors:', errors);
      }
      expect(errors.length).toBe(0);
    });

    (cacheExists ? it : it.skip)('should validate all referenced textures exist', () => {
      const iniFiles = fs.readdirSync(CONCRETE_CLASSES_DIR)
        .filter(f => f.toLowerCase().endsWith('.ini'));

      const missing: string[] = [];

      for (const file of iniFiles) {
        const content = fs.readFileSync(path.join(CONCRETE_CLASSES_DIR, file), 'utf-8');
        const config = loadConcreteBlockClassFromIni(content);

        if (config.imagePath) {
          const texturePath = path.join(CONCRETE_IMAGES_DIR, config.imagePath);
          if (!fs.existsSync(texturePath)) {
            missing.push(`${file} -> ${config.imagePath}`);
          }
        }
      }

      if (missing.length > 0) {
        console.log('Missing textures:', missing);
      }
      expect(missing.length).toBe(0);
    });

    (cacheExists ? it : it.skip)('should load all classes into manager', () => {
      const manager = new ConcreteBlockClassManager();
      manager.setBasePath('/cache/');

      const iniFiles = fs.readdirSync(CONCRETE_CLASSES_DIR)
        .filter(f => f.toLowerCase().endsWith('.ini'));

      for (const file of iniFiles) {
        const content = fs.readFileSync(path.join(CONCRETE_CLASSES_DIR, file), 'utf-8');
        manager.loadFromIni(content);
      }

      console.log(`Loaded ${manager.getClassCount()} concrete classes`);
      expect(manager.getClassCount()).toBeGreaterThan(0);

      // Verify some expected IDs are loaded
      expect(manager.hasClass(0)).toBe(true);    // Concrete0
      expect(manager.hasClass(12)).toBe(true);   // Full concrete
      expect(manager.hasClass(0x80)).toBe(true); // Platform center
    });
  });
});
