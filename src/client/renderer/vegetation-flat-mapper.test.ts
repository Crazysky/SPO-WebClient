/**
 * Tests for VegetationFlatMapper
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { VegetationFlatMapper } from './vegetation-flat-mapper';
import { MapBuilding, MapSegment, FacilityDimensions } from '../../shared/types';
import { LandClass, LandType, LND_CLASS_SHIFT, LND_TYPE_SHIFT } from '../../shared/land-utils';

/** Helper: construct a landId from components */
function makeLandId(landClass: LandClass, landType: LandType, landVar: number = 0): number {
  return (landClass << LND_CLASS_SHIFT) | (landType << LND_TYPE_SHIFT) | (landVar & 0x03);
}

/** Helper: create a MapBuilding */
function makeBuilding(x: number, y: number, visualClass: string = 'vc1'): MapBuilding {
  return { visualClass, tycoonId: 1, options: 0, x, y, level: 0, alert: false, attack: 0 };
}

/** Helper: create a MapSegment (road) */
function makeSegment(x1: number, y1: number, x2: number, y2: number): MapSegment {
  return { x1, y1, x2, y2, unknown1: 0, unknown2: 0, unknown3: 0, unknown4: 0, unknown5: 0, unknown6: 0 };
}

/** Helper: create a FacilityDimensions entry */
function makeDims(visualClass: string, xsize: number, ysize: number): FacilityDimensions {
  return { visualClass, name: 'Test', facid: 'FID_Test', xsize, ysize, level: 1 };
}

describe('VegetationFlatMapper', () => {
  let mapper: VegetationFlatMapper;

  beforeEach(() => {
    mapper = new VegetationFlatMapper(2);
  });

  // =========================================================================
  // getFlatLandId
  // =========================================================================

  describe('getFlatLandId', () => {
    it('should map GrassSpecial to GrassCenter', () => {
      // GrassSpecial var0: LandClass=0, LandType=13, LandVar=0 → 0b00110100 = 52
      const grassSpecial = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      expect(grassSpecial).toBe(52);
      expect(mapper.getFlatLandId(grassSpecial)).toBe(0); // GrassCenter var0
    });

    it('should map MidGrassSpecial to MidGrassCenter', () => {
      const midGrassSpecial = makeLandId(LandClass.ZoneB, LandType.Special, 0);
      expect(midGrassSpecial).toBe(116);
      expect(mapper.getFlatLandId(midGrassSpecial)).toBe(64); // MidGrassCenter var0
    });

    it('should map DryGroundSpecial to DryGroundCenter', () => {
      const drySpecial = makeLandId(LandClass.ZoneC, LandType.Special, 0);
      expect(drySpecial).toBe(180);
      expect(mapper.getFlatLandId(drySpecial)).toBe(128); // DryGroundCenter var0
    });

    it('should map WaterSpecial to WaterCenter', () => {
      const waterSpecial = makeLandId(LandClass.ZoneD, LandType.Special, 0);
      expect(waterSpecial).toBe(244);
      expect(mapper.getFlatLandId(waterSpecial)).toBe(192); // WaterCenter var0
    });

    it('should handle Special tiles with different variants', () => {
      const grassSpecialVar1 = makeLandId(LandClass.ZoneA, LandType.Special, 1);
      expect(grassSpecialVar1).toBe(53);
      expect(mapper.getFlatLandId(grassSpecialVar1)).toBe(0);

      const grassSpecialVar3 = makeLandId(LandClass.ZoneA, LandType.Special, 3);
      expect(grassSpecialVar3).toBe(55);
      expect(mapper.getFlatLandId(grassSpecialVar3)).toBe(0);
    });

    it('should also work on non-special tiles (though shouldFlatten would reject them)', () => {
      const grassCenter = makeLandId(LandClass.ZoneA, LandType.Center, 0);
      expect(mapper.getFlatLandId(grassCenter)).toBe(0);

      const grassNorth = makeLandId(LandClass.ZoneA, LandType.N, 2);
      expect(mapper.getFlatLandId(grassNorth)).toBe(0);
    });
  });

  // =========================================================================
  // shouldFlatten
  // =========================================================================

  describe('shouldFlatten', () => {
    it('should return false when no dynamic content exists', () => {
      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      expect(mapper.shouldFlatten(10, 10, specialId)).toBe(false);
    });

    it('should return false for non-special tiles even in flat zone', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));
      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);

      const centerId = makeLandId(LandClass.ZoneA, LandType.Center, 0);
      expect(mapper.shouldFlatten(10, 10, centerId)).toBe(false);

      const edgeId = makeLandId(LandClass.ZoneA, LandType.N, 0);
      expect(mapper.shouldFlatten(10, 10, edgeId)).toBe(false);
    });

    it('should return true for special tiles in flat zone', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));
      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Building at (x=10, y=10), buffer=2 → flat zone covers i=[8..12], j=[8..12]
      expect(mapper.shouldFlatten(10, 10, specialId)).toBe(true);
      expect(mapper.shouldFlatten(8, 8, specialId)).toBe(true);
      expect(mapper.shouldFlatten(12, 12, specialId)).toBe(true);
    });

    it('should return false for special tiles outside buffer zone', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));
      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Building at (x=10, y=10), buffer=2 → i=7 and i=13 are outside
      expect(mapper.shouldFlatten(7, 10, specialId)).toBe(false);
      expect(mapper.shouldFlatten(13, 10, specialId)).toBe(false);
    });
  });

  // =========================================================================
  // updateDynamicContent - Buildings
  // =========================================================================

  describe('updateDynamicContent with buildings', () => {
    it('should create flat zone around 1x1 building with buffer', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));
      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);

      // Buffer radius=2, building 1x1 at (x=10, y=10)
      // Flat zone: dy in [-2, 0+2), dx in [-2, 0+2)
      // → i (y) from 10-2=8 to 10+1+2-1=12, j (x) from 10-2=8 to 10+1+2-1=12
      expect(mapper.hasFlatZones()).toBe(true);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Corners of the buffer zone
      expect(mapper.shouldFlatten(8, 8, specialId)).toBe(true);
      expect(mapper.shouldFlatten(12, 12, specialId)).toBe(true);
      // Just outside
      expect(mapper.shouldFlatten(7, 8, specialId)).toBe(false);
      expect(mapper.shouldFlatten(8, 7, specialId)).toBe(false);
    });

    it('should handle multi-tile buildings', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc2', makeDims('vc2', 3, 2));
      // Building at (x=20, y=15), 3x2 tiles
      mapper.updateDynamicContent([makeBuilding(20, 15, 'vc2')], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Building footprint: x=[20,22], y=[15,16]
      // Buffer=2: x=[18,24], y=[13,18]
      // In (i,j): i=y, j=x → i=[13,18], j=[18,24]
      expect(mapper.shouldFlatten(13, 18, specialId)).toBe(true);
      expect(mapper.shouldFlatten(18, 24, specialId)).toBe(true);
      expect(mapper.shouldFlatten(12, 18, specialId)).toBe(false);
    });

    it('should use default 1x1 when facility dimensions not in cache', () => {
      const cache = new Map<string, FacilityDimensions>();
      // No entry for 'unknown' - should default to 1x1
      mapper.updateDynamicContent([makeBuilding(5, 5, 'unknown')], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      expect(mapper.shouldFlatten(5, 5, specialId)).toBe(true);
      expect(mapper.shouldFlatten(3, 3, specialId)).toBe(true);
      expect(mapper.shouldFlatten(7, 7, specialId)).toBe(true);
    });

    it('should handle multiple buildings with overlapping zones', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));

      mapper.updateDynamicContent([
        makeBuilding(10, 10),
        makeBuilding(12, 10)
      ], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Both buildings contribute to the flat zone; overlap is fine
      expect(mapper.shouldFlatten(10, 11, specialId)).toBe(true); // Between them
      expect(mapper.shouldFlatten(10, 8, specialId)).toBe(true);  // Buffer of first
      expect(mapper.shouldFlatten(10, 14, specialId)).toBe(true); // Buffer of second
    });
  });

  // =========================================================================
  // updateDynamicContent - Road Segments
  // =========================================================================

  describe('updateDynamicContent with road segments', () => {
    it('should create flat zone around horizontal road segment', () => {
      const cache = new Map<string, FacilityDimensions>();
      // Horizontal road from (5,10) to (8,10) → x=[5,8], y=[10,10]
      mapper.updateDynamicContent([], [makeSegment(5, 10, 8, 10)], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Buffer=2: x=[3,10], y=[8,12]
      // In (i,j): i=y, j=x
      expect(mapper.shouldFlatten(10, 5, specialId)).toBe(true);  // On road
      expect(mapper.shouldFlatten(8, 3, specialId)).toBe(true);   // Buffer corner
      expect(mapper.shouldFlatten(12, 10, specialId)).toBe(true); // Buffer edge
      expect(mapper.shouldFlatten(7, 3, specialId)).toBe(false);  // Outside
    });

    it('should create flat zone around vertical road segment', () => {
      const cache = new Map<string, FacilityDimensions>();
      mapper.updateDynamicContent([], [makeSegment(10, 5, 10, 8)], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Buffer=2: x=[8,12], y=[3,10]
      expect(mapper.shouldFlatten(5, 10, specialId)).toBe(true);
      expect(mapper.shouldFlatten(3, 8, specialId)).toBe(true);
    });

    it('should handle road segments with reversed coordinates', () => {
      const cache = new Map<string, FacilityDimensions>();
      // x2 < x1 should still work (min/max)
      mapper.updateDynamicContent([], [makeSegment(8, 10, 5, 10)], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      expect(mapper.shouldFlatten(10, 5, specialId)).toBe(true);
      expect(mapper.shouldFlatten(10, 8, specialId)).toBe(true);
    });
  });

  // =========================================================================
  // updateDynamicContent - Mixed content
  // =========================================================================

  describe('updateDynamicContent with mixed content', () => {
    it('should handle buildings and roads together', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 2, 2));

      mapper.updateDynamicContent(
        [makeBuilding(10, 10)],
        [makeSegment(15, 10, 15, 14)],
        cache
      );

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Building zone
      expect(mapper.shouldFlatten(10, 10, specialId)).toBe(true);
      // Road zone
      expect(mapper.shouldFlatten(12, 15, specialId)).toBe(true);
    });

    it('should clear previous zones on update', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));

      // First update: building at (10, 10)
      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);
      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      expect(mapper.shouldFlatten(10, 10, specialId)).toBe(true);

      // Second update: building moved to (50, 50)
      mapper.updateDynamicContent([makeBuilding(50, 50)], [], cache);
      expect(mapper.shouldFlatten(10, 10, specialId)).toBe(false);
      expect(mapper.shouldFlatten(50, 50, specialId)).toBe(true);
    });
  });

  // =========================================================================
  // getDirtyChunks
  // =========================================================================

  describe('getDirtyChunks', () => {
    it('should return empty set when no changes', () => {
      expect(mapper.getDirtyChunks().size).toBe(0);
    });

    it('should identify dirty chunks after first update', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));

      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);

      const dirty = mapper.getDirtyChunks();
      expect(dirty.size).toBeGreaterThan(0);
      // Building at (10,10) is in chunk (0,0) since 10 < 32
      expect(dirty.has('0,0')).toBe(true);
    });

    it('should detect chunks that lost flat zones', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));

      // Add building → chunk becomes dirty
      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);
      expect(mapper.getDirtyChunks().has('0,0')).toBe(true);

      // Remove building → chunk should be dirty again (vegetation restored)
      mapper.updateDynamicContent([], [], cache);
      expect(mapper.getDirtyChunks().has('0,0')).toBe(true);
    });

    it('should identify correct chunks for buildings at chunk boundaries', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));

      // Building at (32, 32) → chunk (1,1)
      // With buffer=2, extends into chunk (0,0) at tiles (30,30)
      mapper.updateDynamicContent([makeBuilding(32, 32)], [], cache);

      const dirty = mapper.getDirtyChunks();
      expect(dirty.has('1,1')).toBe(true);
      expect(dirty.has('0,0')).toBe(true); // Buffer extends to tile (30,30) in chunk (0,0)
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should not create negative coordinates in flat zones', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));

      // Building near origin → buffer would go negative
      mapper.updateDynamicContent([makeBuilding(0, 0)], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      expect(mapper.shouldFlatten(0, 0, specialId)).toBe(true);
      // Negative coords should not be in flat zone
      expect(mapper.shouldFlatten(-1, 0, specialId)).toBe(false);
    });

    it('should handle empty building and segment arrays', () => {
      const cache = new Map<string, FacilityDimensions>();
      mapper.updateDynamicContent([], [], cache);
      expect(mapper.hasFlatZones()).toBe(false);
    });

    it('should work with buffer radius 0', () => {
      const mapper0 = new VegetationFlatMapper(0);
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));
      mapper0.updateDynamicContent([makeBuilding(10, 10)], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      // Only the building tile itself
      expect(mapper0.shouldFlatten(10, 10, specialId)).toBe(true);
      expect(mapper0.shouldFlatten(11, 10, specialId)).toBe(false);
    });

    it('should work with large buffer radius', () => {
      const mapperLarge = new VegetationFlatMapper(5);
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));
      mapperLarge.updateDynamicContent([makeBuilding(10, 10)], [], cache);

      const specialId = makeLandId(LandClass.ZoneA, LandType.Special, 0);
      expect(mapperLarge.shouldFlatten(5, 5, specialId)).toBe(true);
      expect(mapperLarge.shouldFlatten(15, 15, specialId)).toBe(true);
      expect(mapperLarge.shouldFlatten(4, 5, specialId)).toBe(false);
    });

    it('clear() should reset all flat zones', () => {
      const cache = new Map<string, FacilityDimensions>();
      cache.set('vc1', makeDims('vc1', 1, 1));
      mapper.updateDynamicContent([makeBuilding(10, 10)], [], cache);
      expect(mapper.hasFlatZones()).toBe(true);

      mapper.clear();
      expect(mapper.hasFlatZones()).toBe(false);
    });
  });
});
