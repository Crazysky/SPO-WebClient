/**
 * Unit tests for Road Terrain Grid
 */

import {
  WaterType,
  TerrainGrid,
  ConcreteGrid,
  RoadTerrainData,
  type UrbanBuilding,
} from './road-terrain-grid';

describe('TerrainGrid', () => {
  describe('constructor', () => {
    it('should create grid with specified dimensions', () => {
      const grid = new TerrainGrid(100, 100);
      const { width, height } = grid.getDimensions();
      expect(width).toBe(100);
      expect(height).toBe(100);
    });

    it('should initialize all tiles as NONE', () => {
      const grid = new TerrainGrid(10, 10);
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(grid.getWaterType(x, y)).toBe(WaterType.NONE);
        }
      }
    });
  });

  describe('loadFromPalette', () => {
    it('should decode water from palette indices 0x80-0x88', () => {
      const grid = new TerrainGrid(3, 3);
      const paletteData = [
        [0x80, 0x81, 0x82],  // CENTER, N, E
        [0x83, 0x84, 0x85],  // NE, S, SW
        [0x86, 0x87, 0x88],  // W, SE, NW
      ];

      grid.loadFromPalette(paletteData);

      expect(grid.getWaterType(0, 0)).toBe(WaterType.CENTER);
      expect(grid.getWaterType(1, 0)).toBe(WaterType.N);
      expect(grid.getWaterType(2, 0)).toBe(WaterType.E);
      expect(grid.getWaterType(0, 1)).toBe(WaterType.NE);
      expect(grid.getWaterType(1, 1)).toBe(WaterType.S);
      expect(grid.getWaterType(2, 1)).toBe(WaterType.SW);
      expect(grid.getWaterType(0, 2)).toBe(WaterType.W);
      expect(grid.getWaterType(1, 2)).toBe(WaterType.SE);
      expect(grid.getWaterType(2, 2)).toBe(WaterType.NW);
    });

    it('should treat palette indices < 0x80 as NONE', () => {
      const grid = new TerrainGrid(3, 3);
      const paletteData = [
        [0, 10, 50],
        [100, 127, 79],
        [1, 2, 3],
      ];

      grid.loadFromPalette(paletteData);

      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          expect(grid.getWaterType(x, y)).toBe(WaterType.NONE);
        }
      }
    });

    it('should handle palette indices > 0x88 as NONE', () => {
      const grid = new TerrainGrid(2, 2);
      const paletteData = [
        [0x89, 0x90],  // Above valid range
        [0xFF, 0xA0],
      ];

      grid.loadFromPalette(paletteData);

      expect(grid.getWaterType(0, 0)).toBe(WaterType.NONE);
      expect(grid.getWaterType(1, 0)).toBe(WaterType.NONE);
      expect(grid.getWaterType(0, 1)).toBe(WaterType.NONE);
      expect(grid.getWaterType(1, 1)).toBe(WaterType.NONE);
    });
  });

  describe('hasWater', () => {
    it('should return true for tiles with water', () => {
      const grid = new TerrainGrid(2, 2);
      const paletteData = [
        [0x80, 0],
        [0, 0x81],
      ];
      grid.loadFromPalette(paletteData);

      expect(grid.hasWater(0, 0)).toBe(true);
      expect(grid.hasWater(1, 1)).toBe(true);
    });

    it('should return false for tiles without water', () => {
      const grid = new TerrainGrid(2, 2);
      const paletteData = [
        [0, 10],
        [50, 100],
      ];
      grid.loadFromPalette(paletteData);

      expect(grid.hasWater(0, 0)).toBe(false);
      expect(grid.hasWater(1, 0)).toBe(false);
      expect(grid.hasWater(0, 1)).toBe(false);
      expect(grid.hasWater(1, 1)).toBe(false);
    });

    it('should return false for out-of-bounds coordinates', () => {
      const grid = new TerrainGrid(5, 5);
      expect(grid.hasWater(-1, 0)).toBe(false);
      expect(grid.hasWater(0, -1)).toBe(false);
      expect(grid.hasWater(5, 0)).toBe(false);
      expect(grid.hasWater(0, 5)).toBe(false);
    });
  });
});

describe('ConcreteGrid', () => {
  describe('constructor', () => {
    it('should create grid with specified dimensions', () => {
      const grid = new ConcreteGrid(100, 100);
      const { width, height } = grid.getDimensions();
      expect(width).toBe(100);
      expect(height).toBe(100);
    });

    it('should initialize all tiles as false', () => {
      const grid = new ConcreteGrid(10, 10);
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(grid.hasConcrete(x, y)).toBe(false);
        }
      }
    });
  });

  describe('calculateFromBuildings', () => {
    it('should expand concrete in radius 2 around urban buildings', () => {
      const grid = new ConcreteGrid(10, 10);
      const buildings: UrbanBuilding[] = [
        { x: 5, y: 5, xSize: 1, ySize: 1, isUrban: true },
      ];

      grid.calculateFromBuildings(buildings);

      // Check radius 2 expansion
      // Building at (5, 5) with size 1x1
      // Concrete should span (5-2, 5-2) to (5+1-1+2, 5+1-1+2) = (3,3) to (7,7)
      expect(grid.hasConcrete(3, 3)).toBe(true);
      expect(grid.hasConcrete(7, 7)).toBe(true);
      expect(grid.hasConcrete(5, 5)).toBe(true);
      expect(grid.hasConcrete(7, 5)).toBe(true);  // Edge of radius

      // Outside radius should be false
      expect(grid.hasConcrete(2, 5)).toBe(false);  // x=2 is outside (3-7 range)
      expect(grid.hasConcrete(8, 5)).toBe(false);  // x=8 is outside
      expect(grid.hasConcrete(5, 2)).toBe(false);  // y=2 is outside (3-7 range)
      expect(grid.hasConcrete(5, 8)).toBe(false);  // y=8 is outside
    });

    it('should handle 2x2 buildings correctly', () => {
      const grid = new ConcreteGrid(15, 15);
      const buildings: UrbanBuilding[] = [
        { x: 5, y: 5, xSize: 2, ySize: 2, isUrban: true },
      ];

      grid.calculateFromBuildings(buildings);

      // Building occupies (5,5) to (6,6)
      // Concrete should span (5-2, 5-2) to (6+2, 6+2) = (3,3) to (8,8)
      expect(grid.hasConcrete(3, 3)).toBe(true);
      expect(grid.hasConcrete(8, 8)).toBe(true);
      expect(grid.hasConcrete(5, 5)).toBe(true);
      expect(grid.hasConcrete(6, 6)).toBe(true);

      // Outside radius
      expect(grid.hasConcrete(2, 5)).toBe(false);
      expect(grid.hasConcrete(9, 5)).toBe(false);
    });

    it('should ignore non-urban buildings', () => {
      const grid = new ConcreteGrid(10, 10);
      const buildings: UrbanBuilding[] = [
        { x: 5, y: 5, xSize: 1, ySize: 1, isUrban: false },
      ];

      grid.calculateFromBuildings(buildings);

      // No concrete should be created
      expect(grid.hasConcrete(5, 5)).toBe(false);
      expect(grid.hasConcrete(4, 4)).toBe(false);
    });

    it('should handle multiple buildings with overlapping concrete', () => {
      const grid = new ConcreteGrid(20, 20);
      const buildings: UrbanBuilding[] = [
        { x: 5, y: 5, xSize: 1, ySize: 1, isUrban: true },
        { x: 8, y: 5, xSize: 1, ySize: 1, isUrban: true },
      ];

      grid.calculateFromBuildings(buildings);

      // Both buildings should create concrete
      expect(grid.hasConcrete(5, 5)).toBe(true);
      expect(grid.hasConcrete(8, 5)).toBe(true);

      // Overlapping area between them
      expect(grid.hasConcrete(6, 5)).toBe(true);
      expect(grid.hasConcrete(7, 5)).toBe(true);
    });

    it('should clip concrete to grid boundaries', () => {
      const grid = new ConcreteGrid(10, 10);
      const buildings: UrbanBuilding[] = [
        { x: 0, y: 0, xSize: 1, ySize: 1, isUrban: true },  // Top-left corner
        { x: 9, y: 9, xSize: 1, ySize: 1, isUrban: true },  // Bottom-right corner
      ];

      grid.calculateFromBuildings(buildings);

      // Should not crash and should clip to boundaries
      expect(grid.hasConcrete(0, 0)).toBe(true);
      expect(grid.hasConcrete(1, 1)).toBe(true);
      expect(grid.hasConcrete(9, 9)).toBe(true);
      expect(grid.hasConcrete(8, 8)).toBe(true);

      // Out of bounds should return false
      expect(grid.hasConcrete(-1, 0)).toBe(false);
      expect(grid.hasConcrete(0, -1)).toBe(false);
      expect(grid.hasConcrete(10, 9)).toBe(false);
      expect(grid.hasConcrete(9, 10)).toBe(false);
    });

    it('should reset grid when recalculated', () => {
      const grid = new ConcreteGrid(10, 10);
      const buildings1: UrbanBuilding[] = [
        { x: 5, y: 5, xSize: 1, ySize: 1, isUrban: true },
      ];

      grid.calculateFromBuildings(buildings1);
      expect(grid.hasConcrete(5, 5)).toBe(true);

      // Recalculate with different buildings
      const buildings2: UrbanBuilding[] = [
        { x: 2, y: 2, xSize: 1, ySize: 1, isUrban: true },
      ];

      grid.calculateFromBuildings(buildings2);

      // Old location should no longer have concrete
      expect(grid.hasConcrete(5, 5)).toBe(false);
      // New location should have concrete
      expect(grid.hasConcrete(2, 2)).toBe(true);
    });
  });

  describe('hasConcrete', () => {
    it('should return false for out-of-bounds coordinates', () => {
      const grid = new ConcreteGrid(5, 5);
      expect(grid.hasConcrete(-1, 0)).toBe(false);
      expect(grid.hasConcrete(0, -1)).toBe(false);
      expect(grid.hasConcrete(5, 0)).toBe(false);
      expect(grid.hasConcrete(0, 5)).toBe(false);
    });
  });

  describe('getConcreteRadius', () => {
    it('should return 2', () => {
      expect(ConcreteGrid.getConcreteRadius()).toBe(2);
    });
  });
});

describe('RoadTerrainData', () => {
  it('should initialize with both grids', () => {
    const data = new RoadTerrainData(100, 100);
    const { terrainGrid, concreteGrid } = data.getGrids();

    expect(terrainGrid).toBeDefined();
    expect(concreteGrid).toBeDefined();
  });

  it('should load terrain data from palette', () => {
    const data = new RoadTerrainData(3, 3);
    const paletteData = [
      [0x80, 0, 0],
      [0, 0x81, 0],
      [0, 0, 0x82],
    ];

    data.loadTerrainFromPalette(paletteData);

    expect(data.hasWater(0, 0)).toBe(true);
    expect(data.hasWater(1, 1)).toBe(true);
    expect(data.hasWater(2, 2)).toBe(true);
    expect(data.hasWater(1, 0)).toBe(false);
  });

  it('should update concrete from buildings', () => {
    const data = new RoadTerrainData(10, 10);
    const buildings: UrbanBuilding[] = [
      { x: 5, y: 5, xSize: 1, ySize: 1, isUrban: true },
    ];

    data.updateConcreteFromBuildings(buildings);

    expect(data.hasConcrete(5, 5)).toBe(true);
    expect(data.hasConcrete(4, 4)).toBe(true);
    expect(data.hasConcrete(6, 6)).toBe(true);
    expect(data.hasConcrete(2, 2)).toBe(false);
  });

  it('should provide unified access to water and concrete', () => {
    const data = new RoadTerrainData(10, 10);

    // Setup water
    const paletteData = Array(10).fill(null).map(() => Array(10).fill(0));
    paletteData[3][3] = 0x80;  // Water at (3,3)
    data.loadTerrainFromPalette(paletteData);

    // Setup concrete
    const buildings: UrbanBuilding[] = [
      { x: 7, y: 7, xSize: 1, ySize: 1, isUrban: true },
    ];
    data.updateConcreteFromBuildings(buildings);

    // Check both grids
    expect(data.hasWater(3, 3)).toBe(true);
    expect(data.hasConcrete(7, 7)).toBe(true);
    expect(data.hasWater(7, 7)).toBe(false);
    expect(data.hasConcrete(3, 3)).toBe(false);

    expect(data.getWaterType(3, 3)).toBe(WaterType.CENTER);
    expect(data.getWaterType(7, 7)).toBe(WaterType.NONE);
  });
});
