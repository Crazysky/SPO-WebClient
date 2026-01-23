/**
 * Unit tests for Road Surface Detector
 */

import { RoadSurface } from './road-topology-analyzer';
import { RoadSurfaceDetector, detectRoadSurface } from './road-surface-detector';
import { RoadTerrainData, type UrbanBuilding } from './road-terrain-grid';

describe('RoadSurfaceDetector', () => {
  describe('detectSurface - LAND (default)', () => {
    it('should return LAND for tiles without water or concrete', () => {
      const terrainData = new RoadTerrainData(10, 10);
      const detector = new RoadSurfaceDetector(terrainData);

      const surface = detector.detectSurface(5, 5, true, false, true, false);
      expect(surface).toBe(RoadSurface.LAND);
    });

    it('should return LAND for all connection patterns on plain terrain', () => {
      const terrainData = new RoadTerrainData(10, 10);
      const detector = new RoadSurfaceDetector(terrainData);

      // Test various connection patterns
      expect(detector.detectSurface(5, 5, true, false, true, false)).toBe(RoadSurface.LAND);  // N-S
      expect(detector.detectSurface(5, 5, false, true, false, true)).toBe(RoadSurface.LAND);  // E-W
      expect(detector.detectSurface(5, 5, true, true, false, false)).toBe(RoadSurface.LAND);  // N-E corner
      expect(detector.detectSurface(5, 5, true, true, true, true)).toBe(RoadSurface.LAND);    // 4-way
    });
  });

  describe('detectSurface - URBAN', () => {
    it('should return URBAN for tiles in concrete area', () => {
      const terrainData = new RoadTerrainData(20, 20);
      const buildings: UrbanBuilding[] = [
        { x: 10, y: 10, xSize: 2, ySize: 2, isUrban: true },
      ];
      terrainData.updateConcreteFromBuildings(buildings);

      const detector = new RoadSurfaceDetector(terrainData);

      // Tile at (10, 10) should be in concrete area (building center)
      const surface = detector.detectSurface(10, 10, true, false, true, false);
      expect(surface).toBe(RoadSurface.URBAN);
    });

    it('should return URBAN for tiles in concrete radius around urban building', () => {
      const terrainData = new RoadTerrainData(20, 20);
      const buildings: UrbanBuilding[] = [
        { x: 10, y: 10, xSize: 1, ySize: 1, isUrban: true },
      ];
      terrainData.updateConcreteFromBuildings(buildings);

      const detector = new RoadSurfaceDetector(terrainData);

      // Tiles within radius 2 should have URBAN surface
      expect(detector.detectSurface(10, 10, true, false, true, false)).toBe(RoadSurface.URBAN);
      expect(detector.detectSurface(9, 9, true, false, true, false)).toBe(RoadSurface.URBAN);
      expect(detector.detectSurface(11, 11, true, false, true, false)).toBe(RoadSurface.URBAN);
    });

    it('should return LAND for tiles outside concrete radius', () => {
      const terrainData = new RoadTerrainData(20, 20);
      const buildings: UrbanBuilding[] = [
        { x: 10, y: 10, xSize: 1, ySize: 1, isUrban: true },
      ];
      terrainData.updateConcreteFromBuildings(buildings);

      const detector = new RoadSurfaceDetector(terrainData);

      // Tiles outside radius 2 should have LAND surface
      // Concrete spans (8,8) to (12,12), so (7,10) should be LAND
      expect(detector.detectSurface(7, 10, true, false, true, false)).toBe(RoadSurface.LAND);
      expect(detector.detectSurface(13, 10, true, false, true, false)).toBe(RoadSurface.LAND);
    });
  });

  describe('detectSurface - BRIDGE', () => {
    it('should return BRIDGE_WATER_CENTER for water center tiles', () => {
      const terrainData = new RoadTerrainData(10, 10);
      const paletteData = Array(10).fill(null).map(() => Array(10).fill(0));
      paletteData[5][5] = 0x80;  // WATER_CENTER
      terrainData.loadTerrainFromPalette(paletteData);

      const detector = new RoadSurfaceDetector(terrainData);

      const surface = detector.detectSurface(5, 5, true, false, true, false);
      expect(surface).toBe(RoadSurface.BRIDGE_WATER_CENTER);
    });

    it('should return correct bridge type for each water direction', () => {
      const terrainData = new RoadTerrainData(10, 10);
      const paletteData = Array(10).fill(null).map(() => Array(10).fill(0));

      // Setup different water types
      paletteData[0][0] = 0x80;  // CENTER
      paletteData[0][1] = 0x81;  // N
      paletteData[0][2] = 0x82;  // E
      paletteData[0][3] = 0x83;  // NE
      paletteData[1][0] = 0x84;  // S
      paletteData[1][1] = 0x85;  // SW
      paletteData[1][2] = 0x86;  // W
      paletteData[1][3] = 0x87;  // SE
      paletteData[2][0] = 0x88;  // NW

      terrainData.loadTerrainFromPalette(paletteData);
      const detector = new RoadSurfaceDetector(terrainData);

      expect(detector.detectSurface(0, 0, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_CENTER);
      expect(detector.detectSurface(1, 0, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_N);
      expect(detector.detectSurface(2, 0, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_E);
      expect(detector.detectSurface(3, 0, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_NE);
      expect(detector.detectSurface(0, 1, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_S);
      expect(detector.detectSurface(1, 1, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_SW);
      expect(detector.detectSurface(2, 1, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_W);
      expect(detector.detectSurface(3, 1, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_SE);
      expect(detector.detectSurface(0, 2, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_NW);
    });
  });

  describe('detectSurface - priority order', () => {
    it('should prioritize BRIDGE over URBAN when both present', () => {
      const terrainData = new RoadTerrainData(20, 20);

      // Setup water at (10, 10)
      const paletteData = Array(20).fill(null).map(() => Array(20).fill(0));
      paletteData[10][10] = 0x80;  // WATER_CENTER
      terrainData.loadTerrainFromPalette(paletteData);

      // Setup urban building overlapping water
      const buildings: UrbanBuilding[] = [
        { x: 10, y: 10, xSize: 1, ySize: 1, isUrban: true },
      ];
      terrainData.updateConcreteFromBuildings(buildings);

      const detector = new RoadSurfaceDetector(terrainData);

      // Water should take priority over concrete
      const surface = detector.detectSurface(10, 10, true, false, true, false);
      expect(surface).toBe(RoadSurface.BRIDGE_WATER_CENTER);
    });

    it('should prioritize URBAN over LAND', () => {
      const terrainData = new RoadTerrainData(20, 20);

      // Setup urban building (no water)
      const buildings: UrbanBuilding[] = [
        { x: 10, y: 10, xSize: 1, ySize: 1, isUrban: true },
      ];
      terrainData.updateConcreteFromBuildings(buildings);

      const detector = new RoadSurfaceDetector(terrainData);

      // Should be URBAN, not LAND
      const surface = detector.detectSurface(10, 10, true, false, true, false);
      expect(surface).toBe(RoadSurface.URBAN);
    });
  });

  describe('detectSurface - SMOOTH corners', () => {
    it('should return LAND for corners without smooth transition (stub)', () => {
      const terrainData = new RoadTerrainData(10, 10);
      const detector = new RoadSurfaceDetector(terrainData);

      // North-East corner (no smooth detection yet)
      const surface = detector.detectSurface(5, 5, true, true, false, false);
      expect(surface).toBe(RoadSurface.LAND);
    });

    // Note: Full SMOOTH detection requires road grid lookup
    // Current implementation has stub that always returns false
    // These tests will be expanded when road grid integration is complete
  });

  describe('helper function - detectRoadSurface', () => {
    it('should work as standalone function', () => {
      const terrainData = new RoadTerrainData(10, 10);

      const surface = detectRoadSurface(terrainData, 5, 5, true, false, true, false);
      expect(surface).toBe(RoadSurface.LAND);
    });

    it('should detect URBAN via helper function', () => {
      const terrainData = new RoadTerrainData(20, 20);
      const buildings: UrbanBuilding[] = [
        { x: 10, y: 10, xSize: 1, ySize: 1, isUrban: true },
      ];
      terrainData.updateConcreteFromBuildings(buildings);

      const surface = detectRoadSurface(terrainData, 10, 10, true, false, true, false);
      expect(surface).toBe(RoadSurface.URBAN);
    });

    it('should detect BRIDGE via helper function', () => {
      const terrainData = new RoadTerrainData(10, 10);
      const paletteData = Array(10).fill(null).map(() => Array(10).fill(0));
      paletteData[5][5] = 0x81;  // WATER_N
      terrainData.loadTerrainFromPalette(paletteData);

      const surface = detectRoadSurface(terrainData, 5, 5, true, false, true, false);
      expect(surface).toBe(RoadSurface.BRIDGE_WATER_N);
    });
  });

  describe('setTerrainData', () => {
    it('should allow updating terrain data', () => {
      const terrainData1 = new RoadTerrainData(10, 10);
      const detector = new RoadSurfaceDetector(terrainData1);

      expect(detector.detectSurface(5, 5, true, false, true, false)).toBe(RoadSurface.LAND);

      // Create new terrain data with water
      const terrainData2 = new RoadTerrainData(10, 10);
      const paletteData = Array(10).fill(null).map(() => Array(10).fill(0));
      paletteData[5][5] = 0x80;
      terrainData2.loadTerrainFromPalette(paletteData);

      detector.setTerrainData(terrainData2);

      expect(detector.detectSurface(5, 5, true, false, true, false)).toBe(RoadSurface.BRIDGE_WATER_CENTER);
    });
  });
});
