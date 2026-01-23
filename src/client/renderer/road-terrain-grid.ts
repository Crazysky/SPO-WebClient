/**
 * Road Terrain Grid
 *
 * Manages terrain data grids needed for road surface detection:
 * - TerrainGrid: Water detection from BMP palette indices
 * - ConcreteGrid: Urban areas calculated from building positions
 *
 * Based on Concrete.pas and Map.pas from official Delphi client
 * See: doc/road_rendering_reference_data.md
 */

/**
 * Water type detected from terrain BMP palette
 * Palette indices 0x80-0x88 encode 9 water types
 */
export enum WaterType {
  NONE = -1,           // No water
  CENTER = 0,          // Water on all sides
  N = 1,               // Water to North
  E = 2,               // Water to East
  NE = 3,              // Water to NorthEast
  S = 4,               // Water to South
  SW = 5,              // Water to SouthWest
  W = 6,               // Water to West
  SE = 7,              // Water to SouthEast
  NW = 8,              // Water to NorthWest
}

/**
 * Constants for terrain palette decoding
 * From Concrete.pas (official Delphi client)
 */
const PLATFORM_FLAG = 0x80;  // Bit 7 = water flag
const PLATFORM_MASK = 0x7F;  // Mask to extract water type (0-8)

/**
 * Terrain grid managing water detection from BMP palette
 */
export class TerrainGrid {
  private waterGrid: WaterType[][];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.waterGrid = [];

    // Initialize grid with NONE
    for (let i = 0; i < height; i++) {
      this.waterGrid[i] = new Array(width).fill(WaterType.NONE);
    }
  }

  /**
   * Load terrain grid from BMP palette data
   * @param paletteData - 2D array of palette indices from BMP file
   */
  loadFromPalette(paletteData: number[][]): void {
    for (let i = 0; i < this.height; i++) {
      for (let j = 0; j < this.width; j++) {
        const paletteIndex = paletteData[i]?.[j] ?? 0;
        this.waterGrid[i][j] = this.decodeWaterType(paletteIndex);
      }
    }
  }

  /**
   * Decode water type from BMP palette index
   * Palette indices 0x80-0x88 encode water:
   * - 0x80 (128) = WATER_CENTER
   * - 0x81 (129) = WATER_N
   * - 0x82 (130) = WATER_E
   * - 0x83 (131) = WATER_NE
   * - 0x84 (132) = WATER_S
   * - 0x85 (133) = WATER_SW
   * - 0x86 (134) = WATER_W
   * - 0x87 (135) = WATER_SE
   * - 0x88 (136) = WATER_NW
   */
  private decodeWaterType(paletteIndex: number): WaterType {
    // Check if water flag is set (bit 7)
    if ((paletteIndex & PLATFORM_FLAG) === 0) {
      return WaterType.NONE;
    }

    // Extract water type (bits 0-6)
    const waterType = paletteIndex & PLATFORM_MASK;

    // Map to WaterType enum (0-8)
    if (waterType >= 0 && waterType <= 8) {
      return waterType as WaterType;
    }

    return WaterType.NONE;
  }

  /**
   * Get water type at specific coordinates
   */
  getWaterType(x: number, y: number): WaterType {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return WaterType.NONE;
    }
    return this.waterGrid[y][x];
  }

  /**
   * Check if tile has water
   */
  hasWater(x: number, y: number): boolean {
    return this.getWaterType(x, y) !== WaterType.NONE;
  }

  /**
   * Get grid dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

/**
 * Urban building interface (minimal data needed for concrete calculation)
 */
export interface UrbanBuilding {
  x: number;
  y: number;
  xSize: number;
  ySize: number;
  isUrban: boolean;  // True if building generates concrete
}

/**
 * Concrete grid managing urban areas around buildings
 * Concrete expands in a radius around urban buildings (stores, offices, etc.)
 */
export class ConcreteGrid {
  private concreteGrid: boolean[][];
  private width: number;
  private height: number;

  /**
   * Radius of concrete expansion around urban buildings (in tiles)
   * From Map.pas: CONCRETE_RADIUS = 2
   */
  private static readonly CONCRETE_RADIUS = 2;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.concreteGrid = [];

    // Initialize grid with false
    for (let i = 0; i < height; i++) {
      this.concreteGrid[i] = new Array(width).fill(false);
    }
  }

  /**
   * Calculate concrete grid from urban buildings
   * Expands concrete in a radius around each urban building
   */
  calculateFromBuildings(buildings: UrbanBuilding[]): void {
    // Reset grid
    for (let i = 0; i < this.height; i++) {
      this.concreteGrid[i].fill(false);
    }

    // Expand concrete around each urban building
    for (const building of buildings) {
      if (!building.isUrban) continue;

      // Calculate expansion bounds
      const minX = Math.max(0, building.x - ConcreteGrid.CONCRETE_RADIUS);
      const maxX = Math.min(this.width - 1, building.x + building.xSize + ConcreteGrid.CONCRETE_RADIUS - 1);
      const minY = Math.max(0, building.y - ConcreteGrid.CONCRETE_RADIUS);
      const maxY = Math.min(this.height - 1, building.y + building.ySize + ConcreteGrid.CONCRETE_RADIUS - 1);

      // Mark all tiles in expansion radius as concrete
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          this.concreteGrid[y][x] = true;
        }
      }
    }
  }

  /**
   * Check if tile has concrete (urban road)
   */
  hasConcrete(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.concreteGrid[y][x];
  }

  /**
   * Get grid dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Get concrete radius constant
   */
  static getConcreteRadius(): number {
    return this.CONCRETE_RADIUS;
  }
}

/**
 * Combined terrain data manager
 * Provides unified access to water and concrete grids
 */
export class RoadTerrainData {
  private terrainGrid: TerrainGrid;
  private concreteGrid: ConcreteGrid;

  constructor(width: number, height: number) {
    this.terrainGrid = new TerrainGrid(width, height);
    this.concreteGrid = new ConcreteGrid(width, height);
  }

  /**
   * Initialize terrain grid from BMP palette data
   */
  loadTerrainFromPalette(paletteData: number[][]): void {
    this.terrainGrid.loadFromPalette(paletteData);
  }

  /**
   * Update concrete grid from building list
   */
  updateConcreteFromBuildings(buildings: UrbanBuilding[]): void {
    this.concreteGrid.calculateFromBuildings(buildings);
  }

  /**
   * Get water type at coordinates
   */
  getWaterType(x: number, y: number): WaterType {
    return this.terrainGrid.getWaterType(x, y);
  }

  /**
   * Check if tile has water
   */
  hasWater(x: number, y: number): boolean {
    return this.terrainGrid.hasWater(x, y);
  }

  /**
   * Check if tile has concrete (urban area)
   */
  hasConcrete(x: number, y: number): boolean {
    return this.concreteGrid.hasConcrete(x, y);
  }

  /**
   * Get terrain and concrete grids (for advanced use)
   */
  getGrids(): { terrainGrid: TerrainGrid; concreteGrid: ConcreteGrid } {
    return {
      terrainGrid: this.terrainGrid,
      concreteGrid: this.concreteGrid,
    };
  }
}
