/**
 * PixiRoadLayer - GPU-accelerated road rendering
 *
 * Renders road segments with proper topology detection:
 * - Straight roads (NS, WE)
 * - Corners (N, E, S, W)
 * - T-junctions
 * - Crossroads
 * - Urban/rural variants (based on concrete proximity)
 *
 * Unified Painter's Algorithm:
 * - sortKey = (i + j) * 10000 + SORT_PRIORITY_ROAD
 * - Roads render after terrain base but before tall terrain on same diagonal
 *
 * Urban vs Country texture selection:
 * - Roads adjacent to buildings (within 1 tile) use Urban textures
 * - Roads on open land use Country textures
 */

import { Container } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds, SORT_MAX_KEY, SORT_MULTIPLIER_DIAGONAL, SORT_MULTIPLIER_J, SORT_PRIORITY_ROAD } from '../pixi-renderer';
import { TerrainData, ZoomConfig } from '../../../../shared/map-config';
import { MapBuilding, MapSegment, FacilityDimensions } from '../../../../shared/types';

/** Road topology types */
const enum RoadTopology {
  NONE = 0,
  NS = 1,        // North-South
  WE = 2,        // West-East
  CORNER_N = 3,  // Corner opening to North
  CORNER_E = 4,  // Corner opening to East
  CORNER_S = 5,  // Corner opening to South
  CORNER_W = 6,  // Corner opening to West
  T_N = 7,       // T-junction, stem to North
  T_E = 8,       // T-junction, stem to East
  T_S = 9,       // T-junction, stem to South
  T_W = 10,      // T-junction, stem to West
  CROSS = 11,    // Crossroads
}

/**
 * Topology to texture filename mapping
 *
 * IMPORTANT: Cardinal directions in our coordinate system are INVERTED relative to texture naming:
 *   Our system:     WEST   0   NORTH     |     Textures:    EAST   0   SOUTH
 *                    0     0   EAST      |                   0     0   WEST
 *                   SOUTH  0    0        |                  NORTH  0    0
 *
 * So we swap N↔S and E↔W when mapping topology to texture names.
 *
 * Actual texture files in cache/RoadBlockImages:
 * - Rural roads (on land): CountryRoad*.bmp
 * - Urban roads (on concrete): Road*.bmp (NOT "UrbanRoad")
 */
const ROAD_TEXTURE_MAP: Record<RoadTopology, { land: string; urban: string }> = {
  [RoadTopology.NONE]: { land: '', urban: '' },
  [RoadTopology.NS]: { land: 'CountryRoadvert.bmp', urban: 'Roadvert.bmp' },
  [RoadTopology.WE]: { land: 'CountryRoadhorz.bmp', urban: 'Roadhorz.bmp' },
  // Corners: our CORNER_N → texture cornerS (swapped)
  [RoadTopology.CORNER_N]: { land: 'CountryRoadcornerS.bmp', urban: 'RoadcornerS.bmp' },
  [RoadTopology.CORNER_E]: { land: 'CountryRoadcornerW.bmp', urban: 'RoadcornerW.bmp' },
  [RoadTopology.CORNER_S]: { land: 'CountryRoadcornerN.bmp', urban: 'RoadcornerN.bmp' },
  [RoadTopology.CORNER_W]: { land: 'CountryRoadcornerE.bmp', urban: 'RoadcornerE.bmp' },
  // T-junctions: our T_N → texture TS (swapped)
  [RoadTopology.T_N]: { land: 'CountryRoadTS.bmp', urban: 'RoadTS.bmp' },
  [RoadTopology.T_E]: { land: 'CountryRoadTW.bmp', urban: 'RoadTW.bmp' },
  [RoadTopology.T_S]: { land: 'CountryRoadTN.bmp', urban: 'RoadTN.bmp' },
  [RoadTopology.T_W]: { land: 'CountryRoadTE.bmp', urban: 'RoadTE.bmp' },
  [RoadTopology.CROSS]: { land: 'CountryRoadcross.bmp', urban: 'Roadcross.bmp' },
};

/**
 * Road layer renderer
 */
export class PixiRoadLayer {
  private container: Container;
  private textureAtlas: TextureAtlasManager;
  private _spritePool: SpritePool;
  private batch: BatchSpriteManager;

  // Topology cache - avoid recalculating every frame
  private topologyCache: Map<string, RoadTopology> = new Map();
  private topologyCacheValid: boolean = false;

  // Concrete grid cache - tracks which tiles have concrete (buildings nearby)
  private concreteGrid: Map<string, boolean> = new Map();
  private lastBuildingsRef: MapBuilding[] | null = null;

  constructor(
    container: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = container;
    this.textureAtlas = textureAtlas;
    this._spritePool = spritePool;
    this.batch = new BatchSpriteManager(spritePool, container, 'road');
    this.container.sortableChildren = true;
  }

  /**
   * Build concrete grid from buildings (for urban/country texture selection)
   * A tile has concrete if it's within 1 tile of any building
   */
  private buildConcreteGrid(
    buildings: MapBuilding[],
    facilityDimensions: Map<string, FacilityDimensions>
  ): void {
    this.concreteGrid.clear();
    const CONCRETE_RADIUS = 1; // Tiles around building that count as concrete

    for (const building of buildings) {
      const dims = facilityDimensions.get(building.visualClass);
      const xsize = dims?.xsize ?? 1;
      const ysize = dims?.ysize ?? 1;

      // Mark all tiles within CONCRETE_RADIUS of the building
      const minI = building.y - CONCRETE_RADIUS;
      const maxI = building.y + ysize + CONCRETE_RADIUS - 1;
      const minJ = building.x - CONCRETE_RADIUS;
      const maxJ = building.x + xsize + CONCRETE_RADIUS - 1;

      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          this.concreteGrid.set(`${j},${i}`, true);
        }
      }
    }
  }

  /**
   * Check if a tile has concrete (is adjacent to a building)
   */
  private hasConcrete(x: number, y: number): boolean {
    return this.concreteGrid.has(`${x},${y}`);
  }

  /**
   * Invalidate topology cache (call when road segments change)
   */
  invalidateTopologyCache(): void {
    this.topologyCache.clear();
    this.topologyCacheValid = false;
  }

  /**
   * Update road rendering
   */
  update(
    _segments: MapSegment[],
    roadTilesMap: Map<string, boolean>,
    terrainData: TerrainData,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig,
    buildings: MapBuilding[] = [],
    facilityDimensions: Map<string, FacilityDimensions> = new Map()
  ): void {
    // Build topology cache if invalid
    if (!this.topologyCacheValid) {
      this.buildTopologyCache(roadTilesMap);
      this.topologyCacheValid = true;
    }

    // Rebuild concrete grid if buildings changed
    if (buildings !== this.lastBuildingsRef) {
      this.buildConcreteGrid(buildings, facilityDimensions);
      this.lastBuildingsRef = buildings;
    }

    this.batch.beginFrame();

    const { minI, maxI, minJ, maxJ } = bounds;
    const mapWidth = terrainData.width;
    const mapHeight = terrainData.height;

    // Collect road tiles in viewport
    const tiles: Array<{ i: number; j: number; sortKey: number }> = [];

    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        const key = `${j},${i}`; // Note: roadTilesMap uses x,y format
        if (roadTilesMap.has(key)) {
          tiles.push({ i, j, sortKey: i + j });
        }
      }
    }

    // Sort by painter's algorithm
    tiles.sort((a, b) => a.sortKey - b.sortKey);

    // Render each road tile
    for (const { i, j, sortKey } of tiles) {
      this.renderRoadTile(i, j, sortKey, terrainData, mapWidth, mapHeight, zoomConfig);
    }

    this.batch.endFrame();
  }

  /**
   * Build topology cache for all road tiles
   */
  private buildTopologyCache(roadTilesMap: Map<string, boolean>): void {
    this.topologyCache.clear();

    for (const key of roadTilesMap.keys()) {
      const [xStr, yStr] = key.split(',');
      const j = parseInt(xStr); // x = j
      const i = parseInt(yStr); // y = i
      const topology = this.calculateTopologyFromMap(i, j, roadTilesMap);
      this.topologyCache.set(key, topology);
    }
  }

  /**
   * Render a single road tile
   */
  private renderRoadTile(
    i: number,
    j: number,
    sortKey: number,
    _terrainData: TerrainData,
    mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig
  ): void {
    // Get topology from cache (much faster than recalculating)
    const key = `${j},${i}`;
    const topology = this.topologyCache.get(key) ?? RoadTopology.NONE;
    if (topology === RoadTopology.NONE) return;

    // Determine if urban or rural based on concrete proximity (buildings nearby)
    // Roads within 1 tile of any building use Urban textures
    const isUrban = this.hasConcrete(j, i);

    // Get texture filename
    const textureInfo = ROAD_TEXTURE_MAP[topology];
    const filename = isUrban ? textureInfo.urban : textureInfo.land;
    if (!filename) return;

    // Get texture
    const texture = this.textureAtlas.getRoadTextureSync(filename);
    if (!texture) return;

    // Calculate screen position
    const screenPos = this.mapToScreen(i, j, mapWidth, mapHeight, zoomConfig);

    // Scale
    const scaleX = zoomConfig.tileWidth / 64;
    const scaleY = zoomConfig.tileHeight / 32;

    const posKey = `${i},${j}`;
    const textureKey = `road:${topology}:${isUrban ? 'urban' : 'land'}`;

    // PAINTER'S ALGORITHM: Invert sortKey so higher (i+j) = lower zIndex = drawn first (background)
    const invertedSortKey = SORT_MAX_KEY - sortKey;

    // Unified zIndex: invertedSortKey * DIAGONAL + j * J_MULT + SORT_PRIORITY_ROAD
    // Roads render after terrain base but before tall terrain
    this.batch.setSprite(
      posKey,
      textureKey,
      texture,
      screenPos.x,
      screenPos.y,
      invertedSortKey * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_ROAD,
      {
        scaleX,
        scaleY,
        anchorX: 0.5,
        anchorY: 0  // Top anchor to match Canvas renderer (mapToScreen returns top of tile)
      }
    );
  }

  /**
   * Calculate road topology from neighbors (used for cache building)
   */
  private calculateTopologyFromMap(i: number, j: number, roadTilesMap: Map<string, boolean>): RoadTopology {
    // Check neighbors (using x,y format for roadTilesMap)
    const hasN = roadTilesMap.has(`${j},${i - 1}`);
    const hasS = roadTilesMap.has(`${j},${i + 1}`);
    const hasE = roadTilesMap.has(`${j + 1},${i}`);
    const hasW = roadTilesMap.has(`${j - 1},${i}`);

    const count = (hasN ? 1 : 0) + (hasS ? 1 : 0) + (hasE ? 1 : 0) + (hasW ? 1 : 0);

    // Determine topology
    if (count === 4) return RoadTopology.CROSS;

    if (count === 3) {
      if (!hasN) return RoadTopology.T_S;
      if (!hasS) return RoadTopology.T_N;
      if (!hasE) return RoadTopology.T_W;
      if (!hasW) return RoadTopology.T_E;
    }

    if (count === 2) {
      // Straight or corner
      if (hasN && hasS) return RoadTopology.NS;
      if (hasE && hasW) return RoadTopology.WE;

      // Corners - naming convention: CORNER_X means "corner that opens towards X"
      // This matches the road-texture-system.ts mappings:
      // - hasN && hasE: road connects N+E, opens towards S → CORNER_S (CountryRoadcornerS.bmp)
      // - hasN && hasW: road connects N+W, opens towards E → CORNER_E (CountryRoadcornerE.bmp)
      // - hasS && hasE: road connects S+E, opens towards W → CORNER_W (CountryRoadcornerW.bmp)
      // - hasS && hasW: road connects S+W, opens towards N → CORNER_N (CountryRoadcornerN.bmp)
      if (hasN && hasE) return RoadTopology.CORNER_S;
      if (hasN && hasW) return RoadTopology.CORNER_E;
      if (hasS && hasE) return RoadTopology.CORNER_W;
      if (hasS && hasW) return RoadTopology.CORNER_N;
    }

    if (count === 1) {
      // Dead ends - use straight piece
      if (hasN || hasS) return RoadTopology.NS;
      if (hasE || hasW) return RoadTopology.WE;
    }

    // Isolated road tile
    return RoadTopology.CROSS;
  }

  /**
   * Convert map coordinates to screen position
   */
  private mapToScreen(
    i: number,
    j: number,
    mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig
  ): { x: number; y: number } {
    const u = zoomConfig.u;
    const rows = mapHeight;
    const cols = mapWidth;

    const x = u * (rows - i + j);
    const y = (u / 2) * ((rows - i) + (cols - j));

    return { x, y };
  }

  /**
   * Clear layer
   */
  clear(): void {
    this.batch.clear();
  }
}
