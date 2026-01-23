/**
 * Road Renderer System
 *
 * Complete road rendering system that integrates:
 * - Topology detection (16 types)
 * - Surface detection (11 types)
 * - Terrain grids (water, concrete)
 * - Texture mapping (topology + surface → BMP filename)
 *
 * This is the main entry point for road rendering with proper textures.
 *
 * Based on official Delphi client's Roads.pas, Concrete.pas, Map.pas
 * See: doc/road_rendering_reference_data.md
 */

import { RoadTopology, RoadSurface, RoadTopologyAnalyzer } from './road-topology-analyzer';
import { RoadTerrainData, type UrbanBuilding } from './road-terrain-grid';
import { RoadSurfaceDetector } from './road-surface-detector';
import { RoadTextureMapper } from './road-texture-mapper';

/**
 * Road segment data for rendering
 */
export interface RoadSegment {
  x: number;
  y: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/**
 * Road tile render data
 */
export interface RoadTileData {
  x: number;
  y: number;
  topology: RoadTopology;
  surface: RoadSurface;
  textureFilename: string;
}

/**
 * Road grid for neighbor lookups
 */
export class RoadGrid {
  private roads: Set<string>;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.roads = new Set();
  }

  /**
   * Add a road tile to the grid
   */
  addRoad(x: number, y: number): void {
    this.roads.add(`${x},${y}`);
  }

  /**
   * Remove a road tile from the grid
   */
  removeRoad(x: number, y: number): void {
    this.roads.delete(`${x},${y}`);
  }

  /**
   * Check if there's a road at coordinates
   */
  hasRoad(x: number, y: number): boolean {
    return this.roads.has(`${x},${y}`);
  }

  /**
   * Get all road coordinates
   */
  getAllRoads(): Array<{ x: number; y: number }> {
    return Array.from(this.roads).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  }

  /**
   * Clear all roads
   */
  clear(): void {
    this.roads.clear();
  }

  /**
   * Get neighbor connections for a tile
   */
  getNeighbors(x: number, y: number): {
    hasNorth: boolean;
    hasEast: boolean;
    hasSouth: boolean;
    hasWest: boolean;
  } {
    return {
      hasNorth: this.hasRoad(x, y - 1),
      hasEast: this.hasRoad(x + 1, y),
      hasSouth: this.hasRoad(x, y + 1),
      hasWest: this.hasRoad(x - 1, y),
    };
  }
}

/**
 * Complete road rendering system
 */
export class RoadRendererSystem {
  private roadGrid: RoadGrid;
  private terrainData: RoadTerrainData;
  private surfaceDetector: RoadSurfaceDetector;
  private topologyCache: Map<string, RoadTopology>;

  constructor(mapWidth: number, mapHeight: number) {
    this.roadGrid = new RoadGrid(mapWidth, mapHeight);
    this.terrainData = new RoadTerrainData(mapWidth, mapHeight);
    this.surfaceDetector = new RoadSurfaceDetector(this.terrainData);
    this.topologyCache = new Map();
  }

  /**
   * Load terrain data from BMP palette
   */
  loadTerrainFromPalette(paletteData: number[][]): void {
    this.terrainData.loadTerrainFromPalette(paletteData);
    this.invalidateAllTiles();
  }

  /**
   * Update concrete grid from buildings
   */
  updateConcreteFromBuildings(buildings: UrbanBuilding[]): void {
    this.terrainData.updateConcreteFromBuildings(buildings);
    this.invalidateAllTiles();
  }

  /**
   * Add road segments to the grid
   */
  addRoadSegments(segments: RoadSegment[]): void {
    for (const segment of segments) {
      this.roadGrid.addRoad(segment.x, segment.y);
    }
    this.invalidateAffectedTiles(segments);
  }

  /**
   * Remove road segments from the grid
   */
  removeRoadSegments(segments: RoadSegment[]): void {
    for (const segment of segments) {
      this.roadGrid.removeRoad(segment.x, segment.y);
    }
    this.invalidateAffectedTiles(segments);
  }

  /**
   * Get render data for a road tile
   */
  getRoadTileData(x: number, y: number): RoadTileData | null {
    if (!this.roadGrid.hasRoad(x, y)) {
      return null;
    }

    const { hasNorth, hasEast, hasSouth, hasWest } = this.roadGrid.getNeighbors(x, y);

    // Get or calculate topology
    const topology = this.getTopology(x, y, hasNorth, hasEast, hasSouth, hasWest);

    // Detect surface
    const surface = this.surfaceDetector.detectSurface(x, y, hasNorth, hasEast, hasSouth, hasWest);

    // Get texture filename
    const textureFilename = RoadTextureMapper.getTextureFilenameWithNeighbors(
      topology,
      surface,
      hasNorth,
      hasEast,
      hasSouth,
      hasWest
    );

    return {
      x,
      y,
      topology,
      surface,
      textureFilename,
    };
  }

  /**
   * Get render data for all roads in a viewport
   */
  getRoadsInViewport(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): RoadTileData[] {
    const results: RoadTileData[] = [];

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const data = this.getRoadTileData(x, y);
        if (data) {
          results.push(data);
        }
      }
    }

    return results;
  }

  /**
   * Get all road tile data (for full map render)
   */
  getAllRoadTileData(): RoadTileData[] {
    const allRoads = this.roadGrid.getAllRoads();
    return allRoads
      .map(({ x, y }) => this.getRoadTileData(x, y))
      .filter((data): data is RoadTileData => data !== null);
  }

  /**
   * Get or calculate topology for a tile
   */
  private getTopology(
    x: number,
    y: number,
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): RoadTopology {
    const cacheKey = `${x},${y}`;
    const cached = this.topologyCache.get(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    // Check if we have previous topology for state transition
    const currentTopology = cached ?? RoadTopology.NONE;

    let topology: RoadTopology;
    if (currentTopology === RoadTopology.NONE) {
      // First time - initialize
      topology = RoadTopologyAnalyzer.initializeTopology(hasNorth, hasEast, hasSouth, hasWest);
    } else {
      // Use state transition
      topology = RoadTopologyAnalyzer.detectTopology(
        currentTopology,
        hasNorth,
        hasEast,
        hasSouth,
        hasWest
      );
    }

    this.topologyCache.set(cacheKey, topology);
    return topology;
  }

  /**
   * Invalidate topology cache for a tile and its neighbors
   */
  private invalidateTile(x: number, y: number): void {
    this.topologyCache.delete(`${x},${y}`);
    // Invalidate neighbors too (their topology may change)
    this.topologyCache.delete(`${x},${y - 1}`);  // North
    this.topologyCache.delete(`${x + 1},${y}`);  // East
    this.topologyCache.delete(`${x},${y + 1}`);  // South
    this.topologyCache.delete(`${x - 1},${y}`);  // West
  }

  /**
   * Invalidate topology cache for affected tiles
   */
  private invalidateAffectedTiles(segments: RoadSegment[]): void {
    for (const segment of segments) {
      this.invalidateTile(segment.x, segment.y);
    }
  }

  /**
   * Invalidate entire topology cache
   */
  private invalidateAllTiles(): void {
    this.topologyCache.clear();
  }

  /**
   * Clear all roads
   */
  clearAllRoads(): void {
    this.roadGrid.clear();
    this.topologyCache.clear();
  }

  /**
   * Get terrain data (for advanced use)
   */
  getTerrainData(): RoadTerrainData {
    return this.terrainData;
  }

  /**
   * Get road grid (for advanced use)
   */
  getRoadGrid(): RoadGrid {
    return this.roadGrid;
  }
}
