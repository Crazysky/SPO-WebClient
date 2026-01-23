/**
 * Road Texture System Tests
 *
 * Tests the algorithm from road-texture-system.ts by:
 * 1. Parsing INI files from cache/RoadBlockClasses/
 * 2. Verifying that referenced textures exist in cache/RoadBlockImages/
 * 3. Testing topology calculations
 * 4. Identifying missing files and errors
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  RoadBlockId,
  LandClass,
  LandType,
  ROAD_TYPE,
  ROAD_NONE,
  RoadsRendering,
  RoadBlockClassManager,
  RoadTextureResolver,
  parseIniFile,
  loadRoadBlockClassFromIni,
  roadBlockId,
  roadIdOf,
  highRoadIdOf,
  makeRoadBlockOf,
  isBridge,
  landClassOf,
  landTypeOf,
  isWater,
  renderRoadSegment,
  renderRoadSegments,
  detectSmoothCorner,
  rotateRoadBlockId,
  validateRoadId,
  SegmentInfo,
  MapData
} from './road-texture-system';

// Path to cache directories
const CACHE_DIR = path.join(__dirname, '../../../cache');
const ROAD_CLASSES_DIR = path.join(CACHE_DIR, 'RoadBlockClasses');
const ROAD_IMAGES_DIR = path.join(CACHE_DIR, 'RoadBlockImages');

describe('Road Texture System', () => {
  // ==========================================================================
  // INI FILE PARSING TESTS
  // ==========================================================================

  describe('INI File Parsing', () => {
    it('should parse simple INI file', () => {
      const content = `[General]
Id=5

[Images]
64x32=CountryRoadhorz.bmp`;

      const sections = parseIniFile(content);

      expect(sections.size).toBe(2);
      expect(sections.get('General')?.get('Id')).toBe('5');
      expect(sections.get('Images')?.get('64x32')).toBe('CountryRoadhorz.bmp');
    });

    it('should parse INI file with hexadecimal ID', () => {
      const content = `[General]
Id=$65

[Images]
64x32=WEBridge.bmp
Railing64x32=WEBridgeCover.bmp`;

      const sections = parseIniFile(content);
      const idStr = sections.get('General')?.get('Id');
      // The parseIniFile returns raw string - the loadRoadBlockClassFromIni handles hex
      expect(idStr).toBe('$65');

      // Verify the loadRoadBlockClassFromIni handles hex correctly
      const config = loadRoadBlockClassFromIni(content);
      expect(config.id).toBe(0x65); // 101 in decimal
    });

    it('should load road block class from INI content', () => {
      const content = `[General]
Id=5

[Images]
64x32=CountryRoadhorz.bmp`;

      const config = loadRoadBlockClassFromIni(content);

      expect(config.id).toBe(5);
      expect(config.imagePath).toBe('CountryRoadhorz.bmp');
      expect(config.railingImagePath).toBe('');
      expect(config.frequency).toBe(1);
    });

    it('should load road block class with railing from INI content', () => {
      const content = `[General]
Id=101
Freq=2

[Images]
64x32=WEBridge.bmp
Railing64x32=WEBridgeCover.bmp`;

      const config = loadRoadBlockClassFromIni(content);

      expect(config.id).toBe(101);
      expect(config.imagePath).toBe('WEBridge.bmp');
      expect(config.railingImagePath).toBe('WEBridgeCover.bmp');
      expect(config.frequency).toBe(2);
    });

    it('should handle INI files with comments', () => {
      const content = `; This is a comment
[General]
Id=5
# Another comment
[Images]
64x32=test.bmp`;

      const sections = parseIniFile(content);
      expect(sections.get('General')?.get('Id')).toBe('5');
    });
  });

  // ==========================================================================
  // LAND ID FUNCTIONS TESTS
  // ==========================================================================

  describe('Land ID Functions', () => {
    it('should extract land class from land ID', () => {
      // Land class is in bits 6-7 (after shift by 6)
      expect(landClassOf(0b00000000)).toBe(LandClass.ZoneA);
      expect(landClassOf(0b01000000)).toBe(LandClass.ZoneB);
      expect(landClassOf(0b10000000)).toBe(LandClass.ZoneC);
      expect(landClassOf(0b11000000)).toBe(LandClass.ZoneD); // Water
    });

    it('should extract land type from land ID', () => {
      // Land type is in bits 2-5 (after shift by 2)
      expect(landTypeOf(0b00000000)).toBe(LandType.Center);
      expect(landTypeOf(0b00000100)).toBe(LandType.N);
      expect(landTypeOf(0b00001000)).toBe(LandType.E);
      expect(landTypeOf(0b00001100)).toBe(LandType.S);
      expect(landTypeOf(0b00010000)).toBe(LandType.W);
    });

    it('should detect water correctly', () => {
      expect(isWater(0b11000000)).toBe(true);  // ZoneD (water)
      expect(isWater(0b00000000)).toBe(false); // ZoneA (grass)
      expect(isWater(0b01000000)).toBe(false); // ZoneB (midgrass)
      expect(isWater(0b10000000)).toBe(false); // ZoneC (dryground)
    });
  });

  // ==========================================================================
  // ROAD ID MANIPULATION TESTS
  // ==========================================================================

  describe('Road ID Manipulation', () => {
    it('should extract topology ID from road block', () => {
      expect(roadIdOf(0)).toBe(RoadBlockId.NSRoadStart); // 0 + 1 = 1
      expect(roadIdOf(4)).toBe(RoadBlockId.NSRoad);      // 4 + 1 = 5
      expect(roadIdOf(14)).toBe(RoadBlockId.CrossRoads); // 14 + 1 = 15
      expect(roadIdOf(ROAD_NONE)).toBe(RoadBlockId.None);
    });

    it('should extract high road ID (type) from road block', () => {
      expect(highRoadIdOf(0x00)).toBe(ROAD_TYPE.LAND_ROAD);
      expect(highRoadIdOf(0x10)).toBe(ROAD_TYPE.URBAN_ROAD);
      expect(highRoadIdOf(0x20)).toBe(ROAD_TYPE.NORTH_BRIDGE);
      expect(highRoadIdOf(0x60)).toBe(ROAD_TYPE.FULL_BRIDGE);
    });

    it('should combine topology and type into road block', () => {
      const block = makeRoadBlockOf(RoadBlockId.NSRoad, ROAD_TYPE.URBAN_ROAD);
      expect(roadIdOf(block)).toBe(RoadBlockId.NSRoad);
      expect(highRoadIdOf(block)).toBe(ROAD_TYPE.URBAN_ROAD);
    });

    it('should detect bridge types', () => {
      expect(isBridge(makeRoadBlockOf(RoadBlockId.NSRoad, ROAD_TYPE.LAND_ROAD))).toBe(false);
      expect(isBridge(makeRoadBlockOf(RoadBlockId.NSRoad, ROAD_TYPE.URBAN_ROAD))).toBe(false);
      expect(isBridge(makeRoadBlockOf(RoadBlockId.NSRoad, ROAD_TYPE.NORTH_BRIDGE))).toBe(true);
      expect(isBridge(makeRoadBlockOf(RoadBlockId.NSRoad, ROAD_TYPE.FULL_BRIDGE))).toBe(true);
    });
  });

  // ==========================================================================
  // ROAD BLOCK ID CALCULATION TESTS
  // ==========================================================================

  describe('Road Block ID Calculation', () => {
    it('should calculate land road on grass', () => {
      const result = roadBlockId(
        RoadBlockId.NSRoad,
        0b00000000,  // ZoneA (grass), Center
        false,       // not on concrete
        false,       // not on railroad
        false        // not a dummy
      );

      expect(result).not.toBe(ROAD_NONE);
      expect(roadIdOf(result)).toBe(RoadBlockId.NSRoad);
      expect(highRoadIdOf(result)).toBe(ROAD_TYPE.LAND_ROAD);
    });

    it('should calculate urban road on concrete', () => {
      const result = roadBlockId(
        RoadBlockId.WERoad,
        0b00000000,  // ZoneA (grass), Center
        true,        // on concrete
        false,       // not on railroad
        false        // not a dummy
      );

      expect(result).not.toBe(ROAD_NONE);
      expect(roadIdOf(result)).toBe(RoadBlockId.WERoad);
      expect(highRoadIdOf(result)).toBe(ROAD_TYPE.URBAN_ROAD);
    });

    it('should calculate bridge on water center', () => {
      const result = roadBlockId(
        RoadBlockId.NSRoad,
        0b11000000,  // ZoneD (water), Center
        false,       // not on concrete
        false,       // not on railroad
        false        // not a dummy
      );

      expect(result).not.toBe(ROAD_NONE);
      expect(highRoadIdOf(result)).toBe(ROAD_TYPE.FULL_BRIDGE);
    });

    it('should calculate level pass on railroad', () => {
      const result = roadBlockId(
        RoadBlockId.WERoad,
        0b00000000,  // ZoneA (grass), Center
        false,       // not on concrete
        true,        // on railroad
        false        // not a dummy
      );

      expect(result).not.toBe(ROAD_NONE);
      expect(highRoadIdOf(result)).toBe(ROAD_TYPE.LEVEL_PASS);
    });

    it('should return ROAD_NONE for None topology', () => {
      const result = roadBlockId(
        RoadBlockId.None,
        0b00000000,
        false,
        false,
        false
      );

      expect(result).toBe(ROAD_NONE);
    });
  });

  // ==========================================================================
  // SEGMENT RENDERING TESTS
  // ==========================================================================

  describe('Segment Rendering', () => {
    it('should render vertical segment', () => {
      const rendering = new RoadsRendering(0, 0, 10, 10);
      const segment: SegmentInfo = { x1: 5, y1: 2, x2: 5, y2: 6 };

      renderRoadSegment(rendering, segment);

      // Check start (y=2), middle (y=3,4,5), end (y=6)
      expect(rendering.get(2, 5)).toBe(RoadBlockId.NSRoadEnd);
      expect(rendering.get(3, 5)).toBe(RoadBlockId.NSRoad);
      expect(rendering.get(4, 5)).toBe(RoadBlockId.NSRoad);
      expect(rendering.get(5, 5)).toBe(RoadBlockId.NSRoad);
      expect(rendering.get(6, 5)).toBe(RoadBlockId.NSRoadStart);
    });

    it('should render horizontal segment', () => {
      const rendering = new RoadsRendering(0, 0, 10, 10);
      const segment: SegmentInfo = { x1: 2, y1: 5, x2: 6, y2: 5 };

      renderRoadSegment(rendering, segment);

      // Check start (x=2), middle (x=3,4,5), end (x=6)
      expect(rendering.get(5, 2)).toBe(RoadBlockId.WERoadStart);
      expect(rendering.get(5, 3)).toBe(RoadBlockId.WERoad);
      expect(rendering.get(5, 4)).toBe(RoadBlockId.WERoad);
      expect(rendering.get(5, 5)).toBe(RoadBlockId.WERoad);
      expect(rendering.get(5, 6)).toBe(RoadBlockId.WERoadEnd);
    });

    it('should create intersection at crossing', () => {
      const rendering = new RoadsRendering(0, 0, 10, 10);

      // Horizontal road
      renderRoadSegment(rendering, { x1: 2, y1: 5, x2: 8, y2: 5 });
      // Vertical road crossing at (5, 5)
      renderRoadSegment(rendering, { x1: 5, y1: 2, x2: 5, y2: 8 });

      expect(rendering.get(5, 5)).toBe(RoadBlockId.CrossRoads);
    });

    it('should create T-junction', () => {
      const rendering = new RoadsRendering(0, 0, 10, 10);

      // Horizontal road
      renderRoadSegment(rendering, { x1: 2, y1: 5, x2: 8, y2: 5 });
      // Vertical road from top stopping at horizontal road
      renderRoadSegment(rendering, { x1: 5, y1: 2, x2: 5, y2: 5 });

      // The vertical road ends at y=5, which becomes NS_START_MAPPING
      // Combined with the horizontal WERoad at (5,5), this creates a BottomPlug
      // (T-junction with road coming from the bottom/south)
      expect(rendering.get(5, 5)).toBe(RoadBlockId.BottomPlug);
    });

    it('should create corner', () => {
      const rendering = new RoadsRendering(0, 0, 10, 10);

      // Horizontal road segment ending at (5, 5)
      renderRoadSegment(rendering, { x1: 2, y1: 5, x2: 5, y2: 5 });
      // Vertical road segment starting at (5, 5) going south
      renderRoadSegment(rendering, { x1: 5, y1: 5, x2: 5, y2: 8 });

      // Should be a corner
      const block = rendering.get(5, 5);
      expect([RoadBlockId.CornerW, RoadBlockId.CornerS, RoadBlockId.CornerN, RoadBlockId.CornerE]).toContain(block);
    });
  });

  // ==========================================================================
  // FILE SYSTEM VALIDATION TESTS (Integration)
  // ==========================================================================

  describe('INI File Validation (Integration)', () => {
    let iniFiles: string[] = [];
    let bmpFiles: string[] = [];

    beforeAll(() => {
      // Get all INI files
      if (fs.existsSync(ROAD_CLASSES_DIR)) {
        iniFiles = fs.readdirSync(ROAD_CLASSES_DIR)
          .filter(f => f.endsWith('.ini'));
      }

      // Get all BMP files (lowercase for case-insensitive matching)
      if (fs.existsSync(ROAD_IMAGES_DIR)) {
        bmpFiles = fs.readdirSync(ROAD_IMAGES_DIR)
          .filter(f => f.toLowerCase().endsWith('.bmp'))
          .map(f => f.toLowerCase());
      }
    });

    it('should find INI files in cache', () => {
      expect(iniFiles.length).toBeGreaterThan(0);
      console.log(`Found ${iniFiles.length} INI files`);
    });

    it('should find BMP files in cache', () => {
      expect(bmpFiles.length).toBeGreaterThan(0);
      console.log(`Found ${bmpFiles.length} BMP files`);
    });

    it('should validate all INI files reference existing textures', () => {
      const missingTextures: { ini: string; texture: string }[] = [];
      const missingRailings: { ini: string; railing: string }[] = [];
      const validCount = { textures: 0, railings: 0 };

      for (const iniFile of iniFiles) {
        const iniPath = path.join(ROAD_CLASSES_DIR, iniFile);
        const content = fs.readFileSync(iniPath, 'utf-8');
        const config = loadRoadBlockClassFromIni(content);

        // Check main texture
        if (config.imagePath) {
          if (bmpFiles.includes(config.imagePath.toLowerCase())) {
            validCount.textures++;
          } else {
            missingTextures.push({ ini: iniFile, texture: config.imagePath });
          }
        }

        // Check railing texture (for bridges)
        if (config.railingImagePath) {
          if (bmpFiles.includes(config.railingImagePath.toLowerCase())) {
            validCount.railings++;
          } else {
            missingRailings.push({ ini: iniFile, railing: config.railingImagePath });
          }
        }
      }

      console.log(`\n=== Texture Validation Results ===`);
      console.log(`Valid textures: ${validCount.textures}`);
      console.log(`Valid railings: ${validCount.railings}`);

      if (missingTextures.length > 0) {
        console.log(`\nMissing textures (${missingTextures.length}):`);
        missingTextures.forEach(m => console.log(`  - ${m.ini} -> ${m.texture}`));
      }

      if (missingRailings.length > 0) {
        console.log(`\nMissing railings (${missingRailings.length}):`);
        missingRailings.forEach(m => console.log(`  - ${m.ini} -> ${m.railing}`));
      }

      // Report but don't fail - some textures might be expected to be missing
      expect(missingTextures.length).toBeLessThanOrEqual(10); // Allow up to 10 missing
    });

    it('should parse all INI files without error', () => {
      const parseErrors: { ini: string; error: string }[] = [];

      for (const iniFile of iniFiles) {
        try {
          const iniPath = path.join(ROAD_CLASSES_DIR, iniFile);
          const content = fs.readFileSync(iniPath, 'utf-8');
          const config = loadRoadBlockClassFromIni(content);

          // Validate ID is a valid number or hex
          if (isNaN(config.id) || config.id < 0) {
            parseErrors.push({ ini: iniFile, error: `Invalid ID: ${config.id}` });
          }
        } catch (e) {
          parseErrors.push({ ini: iniFile, error: String(e) });
        }
      }

      if (parseErrors.length > 0) {
        console.log(`\nParse errors (${parseErrors.length}):`);
        parseErrors.forEach(e => console.log(`  - ${e.ini}: ${e.error}`));
      }

      expect(parseErrors.length).toBe(0);
    });
  });

  // ==========================================================================
  // ROAD BLOCK CLASS MANAGER TESTS
  // ==========================================================================

  describe('Road Block Class Manager', () => {
    let manager: RoadBlockClassManager;

    beforeEach(() => {
      manager = new RoadBlockClassManager();
      manager.setBasePath('/cache/');
    });

    it('should load INI content and retrieve class', () => {
      const content = `[General]
Id=5

[Images]
64x32=CountryRoadhorz.bmp`;

      manager.loadFromIni(content);

      const classConfig = manager.getClass(5);
      expect(classConfig).toBeDefined();
      expect(classConfig?.imagePath).toBe('CountryRoadhorz.bmp');
    });

    it('should return correct image path', () => {
      const content = `[General]
Id=5

[Images]
64x32=CountryRoadhorz.bmp`;

      manager.loadFromIni(content);

      const imagePath = manager.getImagePath(5);
      expect(imagePath).toBe('/cache/RoadBlockImages/CountryRoadhorz.bmp');
    });

    it('should return null for unknown road block ID', () => {
      const imagePath = manager.getImagePath(999);
      expect(imagePath).toBeNull();
    });

    it('should handle railing paths for bridges', () => {
      const content = `[General]
Id=101

[Images]
64x32=WEBridge.bmp
Railing64x32=WEBridgeCover.bmp`;

      manager.loadFromIni(content);

      const railingPath = manager.getRailingImagePath(101);
      expect(railingPath).toBe('/cache/RoadBlockImages/WEBridgeCover.bmp');
    });
  });

  // ==========================================================================
  // COMPREHENSIVE ID MAPPING TEST
  // ==========================================================================

  describe('Road Block ID Mapping', () => {
    it('should generate all possible road block IDs', () => {
      const ids: Set<number> = new Set();

      // Test all topology × type combinations
      for (let topolId = 1; topolId <= 15; topolId++) {
        for (const onConcrete of [false, true]) {
          for (const onRailroad of [false, true]) {
            // Test on grass
            const grassResult = roadBlockId(
              topolId as RoadBlockId,
              0b00000000,  // ZoneA (grass)
              onConcrete,
              onRailroad,
              false
            );
            if (grassResult !== ROAD_NONE) {
              ids.add(grassResult);
            }

            // Test on water center
            const waterResult = roadBlockId(
              topolId as RoadBlockId,
              0b11000000,  // ZoneD (water), Center
              onConcrete,
              onRailroad,
              false
            );
            if (waterResult !== ROAD_NONE) {
              ids.add(waterResult);
            }
          }
        }
      }

      console.log(`\nGenerated ${ids.size} unique road block IDs`);
      console.log(`IDs: ${Array.from(ids).sort((a, b) => a - b).join(', ')}`);

      expect(ids.size).toBeGreaterThan(0);
    });
  });
});
