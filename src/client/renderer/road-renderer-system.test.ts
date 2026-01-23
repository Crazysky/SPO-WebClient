/**
 * Unit tests for Road Renderer System
 */

import { RoadTopology, RoadSurface } from './road-topology-analyzer';
import { type UrbanBuilding } from './road-terrain-grid';
import { RoadRendererSystem, RoadGrid, type RoadSegment } from './road-renderer-system';

describe('RoadGrid', () => {
  describe('addRoad and hasRoad', () => {
    it('should add roads to grid', () => {
      const grid = new RoadGrid(100, 100);

      grid.addRoad(5, 5);
      expect(grid.hasRoad(5, 5)).toBe(true);
    });

    it('should return false for tiles without roads', () => {
      const grid = new RoadGrid(100, 100);
      expect(grid.hasRoad(10, 10)).toBe(false);
    });
  });

  describe('removeRoad', () => {
    it('should remove roads from grid', () => {
      const grid = new RoadGrid(100, 100);

      grid.addRoad(5, 5);
      expect(grid.hasRoad(5, 5)).toBe(true);

      grid.removeRoad(5, 5);
      expect(grid.hasRoad(5, 5)).toBe(false);
    });
  });

  describe('getNeighbors', () => {
    it('should return correct neighbors', () => {
      const grid = new RoadGrid(100, 100);

      // Add roads in a cross pattern
      grid.addRoad(5, 4);  // North
      grid.addRoad(6, 5);  // East
      grid.addRoad(5, 6);  // South
      grid.addRoad(4, 5);  // West
      grid.addRoad(5, 5);  // Center

      const neighbors = grid.getNeighbors(5, 5);
      expect(neighbors.hasNorth).toBe(true);
      expect(neighbors.hasEast).toBe(true);
      expect(neighbors.hasSouth).toBe(true);
      expect(neighbors.hasWest).toBe(true);
    });

    it('should return false for missing neighbors', () => {
      const grid = new RoadGrid(100, 100);
      grid.addRoad(5, 5);

      const neighbors = grid.getNeighbors(5, 5);
      expect(neighbors.hasNorth).toBe(false);
      expect(neighbors.hasEast).toBe(false);
      expect(neighbors.hasSouth).toBe(false);
      expect(neighbors.hasWest).toBe(false);
    });
  });

  describe('getAllRoads', () => {
    it('should return all road coordinates', () => {
      const grid = new RoadGrid(100, 100);

      grid.addRoad(5, 5);
      grid.addRoad(6, 5);
      grid.addRoad(7, 5);

      const roads = grid.getAllRoads();
      expect(roads).toHaveLength(3);
      expect(roads).toContainEqual({ x: 5, y: 5 });
      expect(roads).toContainEqual({ x: 6, y: 5 });
      expect(roads).toContainEqual({ x: 7, y: 5 });
    });
  });

  describe('clear', () => {
    it('should remove all roads', () => {
      const grid = new RoadGrid(100, 100);

      grid.addRoad(5, 5);
      grid.addRoad(6, 5);

      grid.clear();

      expect(grid.hasRoad(5, 5)).toBe(false);
      expect(grid.hasRoad(6, 5)).toBe(false);
      expect(grid.getAllRoads()).toHaveLength(0);
    });
  });
});

describe('RoadRendererSystem', () => {
  describe('constructor', () => {
    it('should create system with specified map size', () => {
      const system = new RoadRendererSystem(1000, 1000);
      expect(system).toBeDefined();
    });
  });

  describe('addRoadSegments', () => {
    it('should add single road segment', () => {
      const system = new RoadRendererSystem(100, 100);
      const segments: RoadSegment[] = [{ x: 5, y: 5 }];

      system.addRoadSegments(segments);

      const data = system.getRoadTileData(5, 5);
      expect(data).not.toBeNull();
      expect(data?.x).toBe(5);
      expect(data?.y).toBe(5);
    });

    it('should add multiple road segments', () => {
      const system = new RoadRendererSystem(100, 100);
      const segments: RoadSegment[] = [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 7, y: 5 },
      ];

      system.addRoadSegments(segments);

      expect(system.getRoadTileData(5, 5)).not.toBeNull();
      expect(system.getRoadTileData(6, 5)).not.toBeNull();
      expect(system.getRoadTileData(7, 5)).not.toBeNull();
    });
  });

  describe('removeRoadSegments', () => {
    it('should remove road segments', () => {
      const system = new RoadRendererSystem(100, 100);
      const segments: RoadSegment[] = [{ x: 5, y: 5 }];

      system.addRoadSegments(segments);
      expect(system.getRoadTileData(5, 5)).not.toBeNull();

      system.removeRoadSegments(segments);
      expect(system.getRoadTileData(5, 5)).toBeNull();
    });
  });

  describe('getRoadTileData', () => {
    it('should return null for non-road tiles', () => {
      const system = new RoadRendererSystem(100, 100);
      expect(system.getRoadTileData(5, 5)).toBeNull();
    });

    it('should return data with correct topology for straight road', () => {
      const system = new RoadRendererSystem(100, 100);

      // Create horizontal road: West - Center - East
      system.addRoadSegments([
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ]);

      const data = system.getRoadTileData(5, 5);
      expect(data).not.toBeNull();
      expect(data?.topology).toBe(RoadTopology.WE_MIDDLE);
    });

    it('should return data with correct surface for land road', () => {
      const system = new RoadRendererSystem(100, 100);
      system.addRoadSegments([{ x: 5, y: 5 }]);

      const data = system.getRoadTileData(5, 5);
      expect(data).not.toBeNull();
      expect(data?.surface).toBe(RoadSurface.LAND);
    });

    it('should return data with correct texture filename', () => {
      const system = new RoadRendererSystem(100, 100);

      // Horizontal road
      system.addRoadSegments([
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ]);

      const data = system.getRoadTileData(5, 5);
      expect(data).not.toBeNull();
      expect(data?.textureFilename).toBe('Roadhorz.bmp');
    });

    it('should detect 4-way intersection', () => {
      const system = new RoadRendererSystem(100, 100);

      // Create cross pattern
      system.addRoadSegments([
        { x: 5, y: 4 },  // North
        { x: 6, y: 5 },  // East
        { x: 5, y: 6 },  // South
        { x: 4, y: 5 },  // West
        { x: 5, y: 5 },  // Center
      ]);

      const data = system.getRoadTileData(5, 5);
      expect(data?.topology).toBe(RoadTopology.XCROSS);
      expect(data?.textureFilename).toBe('Roadcross.bmp');
    });

    it('should detect T-junction', () => {
      const system = new RoadRendererSystem(100, 100);

      // Create T-junction (missing North, opens to South)
      system.addRoadSegments([
        { x: 6, y: 5 },  // East
        { x: 5, y: 6 },  // South
        { x: 4, y: 5 },  // West
        { x: 5, y: 5 },  // Center
      ]);

      const data = system.getRoadTileData(5, 5);
      expect(data?.topology).toBe(RoadTopology.TCROSS);
      expect(data?.textureFilename).toBe('RoadTS.bmp');
    });

    it('should detect corner', () => {
      const system = new RoadRendererSystem(100, 100);

      // Create North-East corner
      system.addRoadSegments([
        { x: 5, y: 4 },  // North
        { x: 6, y: 5 },  // East
        { x: 5, y: 5 },  // Center
      ]);

      const data = system.getRoadTileData(5, 5);
      expect(data?.topology).toBe(RoadTopology.TWOCROSS);
      expect(data?.textureFilename).toBe('RoadcornerE.bmp');
    });
  });

  describe('getRoadsInViewport', () => {
    it('should return only roads in viewport', () => {
      const system = new RoadRendererSystem(100, 100);

      system.addRoadSegments([
        { x: 5, y: 5 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]);

      const roads = system.getRoadsInViewport(0, 0, 15, 15);
      expect(roads).toHaveLength(2);
      expect(roads.some(r => r.x === 5 && r.y === 5)).toBe(true);
      expect(roads.some(r => r.x === 10 && r.y === 10)).toBe(true);
      expect(roads.some(r => r.x === 20 && r.y === 20)).toBe(false);
    });

    it('should return empty array for viewport with no roads', () => {
      const system = new RoadRendererSystem(100, 100);
      system.addRoadSegments([{ x: 50, y: 50 }]);

      const roads = system.getRoadsInViewport(0, 0, 10, 10);
      expect(roads).toHaveLength(0);
    });
  });

  describe('getAllRoadTileData', () => {
    it('should return data for all roads', () => {
      const system = new RoadRendererSystem(100, 100);

      system.addRoadSegments([
        { x: 5, y: 5 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]);

      const allRoads = system.getAllRoadTileData();
      expect(allRoads).toHaveLength(3);
    });

    it('should return empty array when no roads', () => {
      const system = new RoadRendererSystem(100, 100);
      const allRoads = system.getAllRoadTileData();
      expect(allRoads).toHaveLength(0);
    });
  });

  describe('terrain integration', () => {
    it('should detect URBAN surface in concrete area', () => {
      const system = new RoadRendererSystem(100, 100);

      const buildings: UrbanBuilding[] = [
        { x: 5, y: 5, xSize: 1, ySize: 1, isUrban: true },
      ];
      system.updateConcreteFromBuildings(buildings);

      system.addRoadSegments([{ x: 5, y: 5 }]);

      const data = system.getRoadTileData(5, 5);
      expect(data?.surface).toBe(RoadSurface.URBAN);
      expect(data?.textureFilename).toContain('ConcreteRoad');
    });

    it('should detect BRIDGE surface on water', () => {
      const system = new RoadRendererSystem(10, 10);

      // Setup water at (5, 5)
      const paletteData = Array(10).fill(null).map(() => Array(10).fill(0));
      paletteData[5][5] = 0x80;  // WATER_CENTER
      system.loadTerrainFromPalette(paletteData);

      system.addRoadSegments([{ x: 5, y: 5 }]);

      const data = system.getRoadTileData(5, 5);
      expect(data?.surface).toBe(RoadSurface.BRIDGE_WATER_CENTER);
      expect(data?.textureFilename).toContain('Bridge');
    });
  });

  describe('clearAllRoads', () => {
    it('should remove all roads', () => {
      const system = new RoadRendererSystem(100, 100);

      system.addRoadSegments([
        { x: 5, y: 5 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]);

      expect(system.getAllRoadTileData()).toHaveLength(3);

      system.clearAllRoads();

      expect(system.getAllRoadTileData()).toHaveLength(0);
      expect(system.getRoadTileData(5, 5)).toBeNull();
    });
  });

  describe('topology caching', () => {
    it('should cache topology for performance', () => {
      const system = new RoadRendererSystem(100, 100);

      system.addRoadSegments([
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ]);

      // First call - calculates topology
      const data1 = system.getRoadTileData(5, 5);

      // Second call - should use cached topology
      const data2 = system.getRoadTileData(5, 5);

      expect(data1?.topology).toBe(data2?.topology);
    });

    it('should invalidate cache when neighbors change', () => {
      const system = new RoadRendererSystem(100, 100);

      // Add horizontal road
      system.addRoadSegments([
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ]);

      const data1 = system.getRoadTileData(5, 5);
      expect(data1?.topology).toBe(RoadTopology.WE_MIDDLE);

      // Add vertical connection to make it a cross
      system.addRoadSegments([
        { x: 5, y: 4 },
        { x: 5, y: 6 },
      ]);

      const data2 = system.getRoadTileData(5, 5);
      expect(data2?.topology).toBe(RoadTopology.XCROSS);
    });
  });
});
