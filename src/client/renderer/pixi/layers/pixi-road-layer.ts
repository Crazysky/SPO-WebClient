/**
 * PixiRoadLayer - GPU-accelerated road rendering
 *
 * =============================================================================
 * COORDINATE SYSTEM (CRITICAL - READ BEFORE MODIFYING)
 * =============================================================================
 *
 * Map coordinates (i, j) to SCREEN positions:
 *
 *   Screen formula: x = u * (rows - i + j)
 *                   y = (u/2) * ((rows - i) + (cols - j))
 *
 *   Neighbor at i-1: screen position is RIGHT and DOWN  (SOUTH-EAST visually)
 *   Neighbor at i+1: screen position is LEFT and UP     (NORTH-WEST visually)
 *   Neighbor at j+1: screen position is RIGHT and UP    (NORTH-EAST visually)
 *   Neighbor at j-1: screen position is LEFT and DOWN   (SOUTH-WEST visually)
 *
 *   Isometric diamond on screen:
 *
 *                    TOP (vertex)
 *                      /\
 *            (i+1)   /    \   (j+1)
 *           NW     /        \     NE
 *                 /          \
 *          LEFT  ·    TILE    ·  RIGHT
 *                 \          /
 *           SW     \        /     SE
 *            (j-1)   \    /   (i-1)
 *                      \/
 *                   BOTTOM (vertex)
 *
 * =============================================================================
 * TEXTURE MAPPING (based on visual analysis of BMP files)
 * =============================================================================
 *
 *   CornerW = road on RIGHT side   = connects SE(i-1) + NE(j+1)
 *   CornerE = road on LEFT side    = connects NW(i+1) + SW(j-1)
 *   CornerN = road on BOTTOM half  = connects SE(i-1) + SW(j-1)
 *   CornerS = road on TOP half     = connects NW(i+1) + NE(j+1)
 *
 * =============================================================================
 *
 * Unified Painter's Algorithm:
 * - sortKey = (i + j) * 10000 + SORT_PRIORITY_ROAD
 * - Roads render after terrain base but before tall terrain on same diagonal
 *
 * Texture selection priority:
 * 1. Bridge textures (on water)
 * 2. Urban textures (adjacent to buildings)
 * 3. Country/rural textures (default)
 */

import { Container } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds, SORT_MAX_KEY, SORT_MULTIPLIER_DIAGONAL, SORT_MULTIPLIER_J, SORT_PRIORITY_ROAD } from '../pixi-renderer';
import { TerrainData, ZoomConfig } from '../../../../shared/map-config';
import { MapBuilding, MapSegment, FacilityDimensions } from '../../../../shared/types';
import { landClassOf, LandClass } from '../../../../shared/land-utils';

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

/** Topology names for debug output */
const TOPOLOGY_NAMES: Record<RoadTopology, string> = {
  [RoadTopology.NONE]: 'NONE',
  [RoadTopology.NS]: 'NS',
  [RoadTopology.WE]: 'WE',
  [RoadTopology.CORNER_N]: 'CORNER_N',
  [RoadTopology.CORNER_E]: 'CORNER_E',
  [RoadTopology.CORNER_S]: 'CORNER_S',
  [RoadTopology.CORNER_W]: 'CORNER_W',
  [RoadTopology.T_N]: 'T_N',
  [RoadTopology.T_E]: 'T_E',
  [RoadTopology.T_S]: 'T_S',
  [RoadTopology.T_W]: 'T_W',
  [RoadTopology.CROSS]: 'CROSS',
};

/** Debug info for a single road tile */
export interface RoadDebugInfo {
  i: number;
  j: number;
  key: string;
  neighbors: { N: boolean; S: boolean; E: boolean; W: boolean };
  topology: string;
  isUrban: boolean;
  onWater: boolean;
  isSmooth: boolean;
  textureFile: string;
  landId?: number;
}

/** Opposite corners for smooth detection */
const OPPOSITE_CORNER: Partial<Record<RoadTopology, RoadTopology>> = {
  [RoadTopology.CORNER_N]: RoadTopology.CORNER_S,
  [RoadTopology.CORNER_S]: RoadTopology.CORNER_N,
  [RoadTopology.CORNER_E]: RoadTopology.CORNER_W,
  [RoadTopology.CORNER_W]: RoadTopology.CORNER_E,
};

/**
 * Topology to texture filename mapping
 *
 * Texture naming convention (matching Canvas2D and official client):
 * - T-junctions: "T_X" means the T's stem (single road) points towards X
 *   e.g., T_S = stem points South = missing N neighbor = has roads E, S, W
 * - Corners: "CORNER_X" matches the texture filename RoadcornerX.bmp
 *
 * Actual texture files in cache/RoadBlockImages:
 * - Rural roads (on land): CountryRoad*.bmp
 * - Urban roads (on concrete): Road*.bmp (NOT "UrbanRoad")
 * - Smooth corners: countryroadSmoothCornerX.bmp / roadSmoothCornerX.bmp
 * - Bridges: NSBridge.bmp, WEBridge.bmp, NorthBridge.bmp, etc.
 */
const ROAD_TEXTURE_MAP: Record<RoadTopology, { land: string; urban: string }> = {
  [RoadTopology.NONE]: { land: '', urban: '' },
  [RoadTopology.NS]: { land: 'CountryRoadvert.bmp', urban: 'Roadvert.bmp' },
  [RoadTopology.WE]: { land: 'CountryRoadhorz.bmp', urban: 'Roadhorz.bmp' },
  // Corners - direct mapping (matches Canvas2D)
  [RoadTopology.CORNER_N]: { land: 'CountryRoadcornerN.bmp', urban: 'RoadcornerN.bmp' },
  [RoadTopology.CORNER_E]: { land: 'CountryRoadcornerE.bmp', urban: 'RoadcornerE.bmp' },
  [RoadTopology.CORNER_S]: { land: 'CountryRoadcornerS.bmp', urban: 'RoadcornerS.bmp' },
  [RoadTopology.CORNER_W]: { land: 'CountryRoadcornerW.bmp', urban: 'RoadcornerW.bmp' },
  // T-junctions - direct mapping (matches Canvas2D)
  [RoadTopology.T_N]: { land: 'CountryRoadTN.bmp', urban: 'RoadTN.bmp' },
  [RoadTopology.T_E]: { land: 'CountryRoadTE.bmp', urban: 'RoadTE.bmp' },
  [RoadTopology.T_S]: { land: 'CountryRoadTS.bmp', urban: 'RoadTS.bmp' },
  [RoadTopology.T_W]: { land: 'CountryRoadTW.bmp', urban: 'RoadTW.bmp' },
  [RoadTopology.CROSS]: { land: 'CountryRoadcross.bmp', urban: 'Roadcross.bmp' },
};

/** Smooth corner textures (for isolated corners not in staircase pattern) */
const SMOOTH_CORNER_TEXTURE_MAP: Partial<Record<RoadTopology, { land: string; urban: string }>> = {
  [RoadTopology.CORNER_N]: { land: 'countryroadSmoothCornerN.bmp', urban: 'roadSmoothCornerN.bmp' },
  [RoadTopology.CORNER_E]: { land: 'countryroadSmoothCornerE.bmp', urban: 'roadSmoothCornerE.bmp' },
  [RoadTopology.CORNER_S]: { land: 'countryroadSmoothCornerS.bmp', urban: 'roadSmoothCornerS.bmp' },
  [RoadTopology.CORNER_W]: { land: 'countryroadSmoothCornerW.bmp', urban: 'roadSmoothCornerW.bmp' },
};

/** Bridge textures (for roads on water) */
const BRIDGE_TEXTURE_MAP: Partial<Record<RoadTopology, string>> = {
  [RoadTopology.NS]: 'NSBridge.bmp',
  [RoadTopology.WE]: 'WEBridge.bmp',
  [RoadTopology.CROSS]: 'Roadcross.bmp',  // No special bridge crossroad, use urban
  // T-junctions and corners on water - use urban textures as fallback
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

  // Smooth corner cache - tracks which corners should use smooth textures
  private smoothCornerCache: Map<string, boolean> = new Map();

  // Concrete grid cache - tracks which tiles have concrete (buildings nearby)
  private concreteGrid: Map<string, boolean> = new Map();
  private lastBuildingsRef: MapBuilding[] | null = null;

  // Road tiles map reference (for debug)
  private roadTilesMapRef: Map<string, boolean> = new Map();

  // Terrain data reference (for debug)
  private terrainDataRef: TerrainData | null = null;

  constructor(
    container: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = container;
    this.textureAtlas = textureAtlas;
    this._spritePool = spritePool;
    this.batch = new BatchSpriteManager(spritePool, container, 'road');
    // PERFORMANCE: sortableChildren disabled - parent PixiRenderer sorts manually
    // this.container.sortableChildren = true;
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
   * Check if a tile is on water
   */
  private isOnWater(i: number, j: number, terrainData: TerrainData): boolean {
    if (!terrainData.paletteData) return false;
    const landId = terrainData.paletteData[i]?.[j];
    if (landId === undefined) return false;
    return landClassOf(landId) === LandClass.ZoneD;
  }

  /**
   * Invalidate topology cache (call when road segments change)
   */
  invalidateTopologyCache(): void {
    this.topologyCache.clear();
    this.smoothCornerCache.clear();
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
    // Store references for debug
    this.roadTilesMapRef = roadTilesMap;
    this.terrainDataRef = terrainData;

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
    this.smoothCornerCache.clear();

    // First pass: calculate topology for all tiles
    for (const key of roadTilesMap.keys()) {
      const [xStr, yStr] = key.split(',');
      const j = parseInt(xStr); // x = j
      const i = parseInt(yStr); // y = i
      const topology = this.calculateTopologyFromMap(i, j, roadTilesMap);
      this.topologyCache.set(key, topology);
    }

    // Second pass: detect smooth corners
    for (const key of roadTilesMap.keys()) {
      const [xStr, yStr] = key.split(',');
      const j = parseInt(xStr);
      const i = parseInt(yStr);
      const topology = this.topologyCache.get(key)!;

      if (this.isCorner(topology)) {
        const isSmooth = this.detectSmoothCorner(i, j, topology);
        this.smoothCornerCache.set(key, isSmooth);
      }
    }
  }

  /**
   * Check if topology is a corner
   */
  private isCorner(topology: RoadTopology): boolean {
    return topology === RoadTopology.CORNER_N ||
           topology === RoadTopology.CORNER_E ||
           topology === RoadTopology.CORNER_S ||
           topology === RoadTopology.CORNER_W;
  }

  /**
   * Detect if a corner should use smooth texture
   * A corner is smooth if it's NOT adjacent to its opposite corner
   * (i.e., not part of a staircase pattern)
   */
  private detectSmoothCorner(i: number, j: number, topology: RoadTopology): boolean {
    const opposite = OPPOSITE_CORNER[topology];
    if (!opposite) return false;

    // Check adjacent tiles for the opposite corner
    // Based on VISUAL texture analysis:
    // - CORNER_W (N+E = RIGHT side):  opposite is CORNER_E (LEFT side)
    // - CORNER_E (S+W = LEFT side):   opposite is CORNER_W (RIGHT side)
    // - CORNER_N (N+W = BOTTOM side): opposite is CORNER_S (TOP side)
    // - CORNER_S (S+E = TOP side):    opposite is CORNER_N (BOTTOM side)
    //
    // For staircase detection, check where corners could connect:

    let checkPositions: Array<{ di: number; dj: number }>;

    switch (topology) {
      case RoadTopology.CORNER_W:
        // CORNER_W (RIGHT side, connects N+E) - check i-1 and j+1 for opposite CORNER_E
        checkPositions = [{ di: -1, dj: 0 }, { di: 0, dj: 1 }];
        break;
      case RoadTopology.CORNER_E:
        // CORNER_E (LEFT side, connects S+W) - check i+1 and j-1 for opposite CORNER_W
        checkPositions = [{ di: 1, dj: 0 }, { di: 0, dj: -1 }];
        break;
      case RoadTopology.CORNER_N:
        // CORNER_N (BOTTOM side, connects N+W) - check i-1 and j-1 for opposite CORNER_S
        checkPositions = [{ di: -1, dj: 0 }, { di: 0, dj: -1 }];
        break;
      case RoadTopology.CORNER_S:
        // CORNER_S (TOP side, connects S+E) - check i+1 and j+1 for opposite CORNER_N
        checkPositions = [{ di: 1, dj: 0 }, { di: 0, dj: 1 }];
        break;
      default:
        return false;
    }

    // Check if any adjacent position has the opposite corner
    for (const { di, dj } of checkPositions) {
      const adjKey = `${j + dj},${i + di}`;
      const adjTopology = this.topologyCache.get(adjKey);
      if (adjTopology === opposite) {
        return false; // Part of staircase pattern, use regular corner
      }
    }

    return true; // Isolated corner, use smooth texture
  }

  /**
   * Render a single road tile
   */
  private renderRoadTile(
    i: number,
    j: number,
    sortKey: number,
    terrainData: TerrainData,
    mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig
  ): void {
    // Get topology from cache (much faster than recalculating)
    const key = `${j},${i}`;
    const topology = this.topologyCache.get(key) ?? RoadTopology.NONE;
    if (topology === RoadTopology.NONE) return;

    // Determine surface type and get filename
    const filename = this.getTextureFilename(i, j, topology, terrainData);
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
    const textureKey = `road:${filename}`;

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
   * Get the appropriate texture filename based on surface type
   */
  private getTextureFilename(
    i: number,
    j: number,
    topology: RoadTopology,
    terrainData: TerrainData
  ): string {
    const key = `${j},${i}`;
    const isUrban = this.hasConcrete(j, i);
    const onWater = this.isOnWater(i, j, terrainData);

    // Priority 1: Bridge textures on water (for straight roads only)
    if (onWater && !isUrban) {
      const bridgeTexture = BRIDGE_TEXTURE_MAP[topology];
      if (bridgeTexture) {
        return bridgeTexture;
      }
      // For corners and T-junctions on water, fall through to urban textures
      // (bridges don't have special corner/T textures)
    }

    // Priority 2: Smooth corner textures (for isolated corners)
    if (this.isCorner(topology)) {
      const isSmooth = this.smoothCornerCache.get(key) ?? false;
      if (isSmooth) {
        const smoothTextures = SMOOTH_CORNER_TEXTURE_MAP[topology];
        if (smoothTextures) {
          return isUrban || onWater ? smoothTextures.urban : smoothTextures.land;
        }
      }
    }

    // Priority 3: Standard textures
    const textureInfo = ROAD_TEXTURE_MAP[topology];
    return isUrban || onWater ? textureInfo.urban : textureInfo.land;
  }

  /**
   * Calculate road topology from neighbors (used for cache building)
   *
   * COORDINATE SYSTEM (see file header for full documentation):
   *
   *   hasN (i-1) = neighbor at SOUTH-EAST on screen (right-down diagonal)
   *   hasS (i+1) = neighbor at NORTH-WEST on screen (left-up diagonal)
   *   hasE (j+1) = neighbor at NORTH-EAST on screen (right-up diagonal)
   *   hasW (j-1) = neighbor at SOUTH-WEST on screen (left-down diagonal)
   *
   * TEXTURE MAPPING (based on visual analysis of actual BMP files):
   *
   *   CornerW.bmp = road fills RIGHT side of diamond  = SE + NE = hasN && hasE
   *   CornerE.bmp = road fills LEFT side of diamond   = NW + SW = hasS && hasW
   *   CornerN.bmp = road fills BOTTOM of diamond      = SE + SW = hasN && hasW
   *   CornerS.bmp = road fills TOP of diamond         = NW + NE = hasS && hasE
   */
  private calculateTopologyFromMap(i: number, j: number, roadTilesMap: Map<string, boolean>): RoadTopology {
    // Check neighbors (roadTilesMap uses "x,y" = "j,i" format)
    // Variable names N/S/E/W are LEGACY - they do NOT match screen directions!
    const hasN = roadTilesMap.has(`${j},${i - 1}`);  // Actually SOUTH-EAST on screen
    const hasS = roadTilesMap.has(`${j},${i + 1}`);  // Actually NORTH-WEST on screen
    const hasE = roadTilesMap.has(`${j + 1},${i}`);  // Actually NORTH-EAST on screen
    const hasW = roadTilesMap.has(`${j - 1},${i}`);  // Actually SOUTH-WEST on screen

    const count = (hasN ? 1 : 0) + (hasS ? 1 : 0) + (hasE ? 1 : 0) + (hasW ? 1 : 0);

    // Determine topology
    if (count === 4) return RoadTopology.CROSS;

    if (count === 3) {
      // T-junctions mapping (corrected based on visual testing):
      //   TopPlug    → RoadTE.bmp = missing hasN (i-1 = SE on screen)
      //   BottomPlug → RoadTW.bmp = missing hasS (i+1 = NW on screen)
      //   LeftPlug   → RoadTN.bmp = missing hasE (j+1 = NE on screen)
      //   RightPlug  → RoadTS.bmp = missing hasW (j-1 = SW on screen)
      if (!hasN) return RoadTopology.T_E;  // Missing SE → TopPlug → RoadTE
      if (!hasS) return RoadTopology.T_W;  // Missing NW → BottomPlug → RoadTW
      if (!hasE) return RoadTopology.T_N;  // Missing NE → LeftPlug → RoadTN
      if (!hasW) return RoadTopology.T_S;  // Missing SW → RightPlug → RoadTS
    }

    if (count === 2) {
      // Straight roads
      if (hasN && hasS) return RoadTopology.NS;  // SE ↔ NW diagonal (/)
      if (hasE && hasW) return RoadTopology.WE;  // NE ↔ SW diagonal (\)

      // Corners - based on VISUAL analysis of actual BMP textures:
      // CornerW = RIGHT side of diamond (road going right-up and right-down)
      // CornerE = LEFT side of diamond (road going left-up and left-down)
      // CornerN = BOTTOM of diamond (road going down-left and down-right)
      // CornerS = TOP of diamond (road going up-left and up-right)
      if (hasN && hasE) return RoadTopology.CORNER_W;  // SE + NE = RIGHT side
      if (hasS && hasE) return RoadTopology.CORNER_S;  // NW + NE = TOP side
      if (hasS && hasW) return RoadTopology.CORNER_E;  // NW + SW = LEFT side
      if (hasN && hasW) return RoadTopology.CORNER_N;  // SE + SW = BOTTOM side
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

  // =========================================================================
  // DEBUG METHODS
  // =========================================================================

  /**
   * Get debug info for a specific road tile
   */
  getDebugInfoForTile(i: number, j: number): RoadDebugInfo | null {
    const key = `${j},${i}`;
    if (!this.topologyCache.has(key)) return null;

    const topology = this.topologyCache.get(key)!;
    const hasN = this.roadTilesMapRef.has(`${j},${i - 1}`);
    const hasS = this.roadTilesMapRef.has(`${j},${i + 1}`);
    const hasE = this.roadTilesMapRef.has(`${j + 1},${i}`);
    const hasW = this.roadTilesMapRef.has(`${j - 1},${i}`);
    const isUrban = this.hasConcrete(j, i);
    const onWater = this.terrainDataRef ? this.isOnWater(i, j, this.terrainDataRef) : false;
    const isSmooth = this.smoothCornerCache.get(key) ?? false;
    const textureFile = this.terrainDataRef
      ? this.getTextureFilename(i, j, topology, this.terrainDataRef)
      : '';

    let landId: number | undefined;
    if (this.terrainDataRef?.paletteData) {
      landId = this.terrainDataRef.paletteData[i]?.[j];
    }

    return {
      i,
      j,
      key,
      neighbors: { N: hasN, S: hasS, E: hasE, W: hasW },
      topology: TOPOLOGY_NAMES[topology],
      isUrban,
      onWater,
      isSmooth,
      textureFile,
      landId,
    };
  }

  /**
   * Get debug info for all road tiles
   */
  getAllDebugInfo(): RoadDebugInfo[] {
    const result: RoadDebugInfo[] = [];

    for (const key of this.topologyCache.keys()) {
      const [xStr, yStr] = key.split(',');
      const j = parseInt(xStr);
      const i = parseInt(yStr);
      const info = this.getDebugInfoForTile(i, j);
      if (info) {
        result.push(info);
      }
    }

    return result;
  }

  /**
   * Dump debug info to console (grouped by topology type)
   */
  dumpDebugToConsole(): void {
    const allInfo = this.getAllDebugInfo();

    console.group('🛣️ Road Debug Info');
    console.log(`Total road tiles: ${allInfo.length}`);

    // Group by topology
    const byTopology = new Map<string, RoadDebugInfo[]>();
    for (const info of allInfo) {
      const list = byTopology.get(info.topology) ?? [];
      list.push(info);
      byTopology.set(info.topology, list);
    }

    // Log each group
    for (const [topology, tiles] of byTopology) {
      console.group(`${topology} (${tiles.length} tiles)`);
      for (const tile of tiles.slice(0, 10)) { // Limit to 10 per type
        const n = tile.neighbors;
        const neighborStr = `N:${n.N ? '✓' : '✗'} S:${n.S ? '✓' : '✗'} E:${n.E ? '✓' : '✗'} W:${n.W ? '✓' : '✗'}`;
        const flags = [
          tile.isUrban ? 'urban' : 'rural',
          tile.onWater ? 'water' : 'land',
          tile.isSmooth ? 'smooth' : '',
        ].filter(Boolean).join(', ');
        console.log(
          `[${tile.i},${tile.j}] ${neighborStr} | ${flags} | landId:${tile.landId?.toString(16) ?? '?'} → ${tile.textureFile}`
        );
      }
      if (tiles.length > 10) {
        console.log(`... and ${tiles.length - 10} more`);
      }
      console.groupEnd();
    }

    console.groupEnd();
  }

  /**
   * Get debug info as JSON string (for copying to analysis)
   */
  getDebugJSON(): string {
    return JSON.stringify(this.getAllDebugInfo(), null, 2);
  }

  /**
   * Find tiles with potential issues (mismatched texture vs expected)
   * Returns tiles where the selected texture might be wrong
   */
  findPotentialIssues(): RoadDebugInfo[] {
    const issues: RoadDebugInfo[] = [];
    const allInfo = this.getAllDebugInfo();

    for (const info of allInfo) {
      // Check for T-junctions and corners on water without bridge texture
      if (info.onWater && !info.isUrban) {
        const isCornerOrT = info.topology.startsWith('CORNER_') || info.topology.startsWith('T_');
        if (isCornerOrT) {
          issues.push(info);
        }
      }

      // Check for unexpected topology based on neighbors
      const n = info.neighbors;
      const count = (n.N ? 1 : 0) + (n.S ? 1 : 0) + (n.E ? 1 : 0) + (n.W ? 1 : 0);

      // Verify T-junction detection
      // Based on visual testing: TopPlug→TE(!N), BottomPlug→TW(!S), LeftPlug→TN(!E), RightPlug→TS(!W)
      if (count === 3) {
        const expectedT = !n.N ? 'T_E' : !n.S ? 'T_W' : !n.E ? 'T_N' : 'T_S';
        if (info.topology !== expectedT) {
          console.warn(`T-junction mismatch at [${info.i},${info.j}]: got ${info.topology}, expected ${expectedT}`);
          issues.push(info);
        }
      }

      // Verify corner detection (based on VISUAL texture analysis)
      // CORNER_W = RIGHT side, CORNER_E = LEFT side, CORNER_N = BOTTOM, CORNER_S = TOP
      if (count === 2 && !info.topology.startsWith('NS') && !info.topology.startsWith('WE')) {
        let expectedCorner = '';
        if (n.N && n.E) expectedCorner = 'CORNER_W';  // RIGHT side (SE + NE on screen)
        else if (n.S && n.E) expectedCorner = 'CORNER_S';  // TOP side (NW + NE on screen)
        else if (n.S && n.W) expectedCorner = 'CORNER_E';  // LEFT side (NW + SW on screen)
        else if (n.N && n.W) expectedCorner = 'CORNER_N';  // BOTTOM side (SE + SW on screen)

        if (expectedCorner && info.topology !== expectedCorner) {
          console.warn(`Corner mismatch at [${info.i},${info.j}]: got ${info.topology}, expected ${expectedCorner}`);
          issues.push(info);
        }
      }
    }

    return issues;
  }
}
