/**
 * PixiBuildingLayer - GPU-accelerated building rendering
 *
 * Renders building sprites with:
 * - Multi-tile building support
 * - Hover highlighting
 * - Proper z-ordering (painter's algorithm)
 *
 * Two-Tier Painter's Algorithm:
 * - sortKey = SORT_OFFSET_UPPER + (i + j) * 10000 + SORT_PRIORITY_BUILDING
 * - Buildings use SORT_OFFSET_UPPER to render after ALL roads
 * - Within buildings, painter's algorithm (i+j) still applies
 */

import { Container, Sprite, Texture, Graphics } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds, SORT_OFFSET_UPPER, SORT_MAX_KEY, SORT_MULTIPLIER_DIAGONAL, SORT_MULTIPLIER_J, SORT_PRIORITY_BUILDING } from '../pixi-renderer';
import { ZoomConfig } from '../../../../shared/map-config';
import { MapBuilding, FacilityDimensions } from '../../../../shared/types';

/** Fallback building colors by type */
const BUILDING_COLORS: Record<string, number> = {
  default: 0x4A90E2,     // Blue
  hovered: 0x5FADFF,     // Light blue
  residential: 0xFF6B6B, // Red
  commercial: 0x4ECDC4,  // Teal
  industrial: 0xFFE66D,  // Yellow
};

/** Spatial index chunk size (tiles per chunk) */
const CHUNK_SIZE = 64;

/**
 * Building layer renderer
 */
export class PixiBuildingLayer {
  private container: Container;
  private textureAtlas: TextureAtlasManager;
  private spritePool: SpritePool;
  private batch: BatchSpriteManager;

  // Graphics for fallback rendering
  private fallbackGraphics: Graphics;

  // Spatial index for fast building lookup
  private spatialIndex: Map<string, MapBuilding[]> = new Map();
  private lastBuildingsRef: MapBuilding[] | null = null;

  constructor(
    container: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = container;
    this.textureAtlas = textureAtlas;
    this.spritePool = spritePool;
    this.batch = new BatchSpriteManager(spritePool, container, 'building');
    this.container.sortableChildren = true;

    this.fallbackGraphics = new Graphics();
    this.container.addChild(this.fallbackGraphics);
  }

  /**
   * Build spatial index from buildings array
   */
  private buildSpatialIndex(buildings: MapBuilding[], facilityDimensions: Map<string, FacilityDimensions>): void {
    this.spatialIndex.clear();

    for (const building of buildings) {
      const dims = facilityDimensions.get(building.visualClass);
      const xsize = dims?.xsize ?? 1;
      const ysize = dims?.ysize ?? 1;

      // Add building to all chunks it overlaps
      const minChunkI = Math.floor(building.y / CHUNK_SIZE);
      const maxChunkI = Math.floor((building.y + ysize - 1) / CHUNK_SIZE);
      const minChunkJ = Math.floor(building.x / CHUNK_SIZE);
      const maxChunkJ = Math.floor((building.x + xsize - 1) / CHUNK_SIZE);

      for (let ci = minChunkI; ci <= maxChunkI; ci++) {
        for (let cj = minChunkJ; cj <= maxChunkJ; cj++) {
          const chunkKey = `${ci},${cj}`;
          let chunk = this.spatialIndex.get(chunkKey);
          if (!chunk) {
            chunk = [];
            this.spatialIndex.set(chunkKey, chunk);
          }
          chunk.push(building);
        }
      }
    }
  }

  /**
   * Get buildings in visible chunks
   */
  private getBuildingsInBounds(bounds: ViewportBounds, facilityDimensions: Map<string, FacilityDimensions>): MapBuilding[] {
    const { minI, maxI, minJ, maxJ } = bounds;
    const minChunkI = Math.floor(minI / CHUNK_SIZE);
    const maxChunkI = Math.floor(maxI / CHUNK_SIZE);
    const minChunkJ = Math.floor(minJ / CHUNK_SIZE);
    const maxChunkJ = Math.floor(maxJ / CHUNK_SIZE);

    const seen = new Set<MapBuilding>();
    const result: MapBuilding[] = [];

    for (let ci = minChunkI; ci <= maxChunkI; ci++) {
      for (let cj = minChunkJ; cj <= maxChunkJ; cj++) {
        const chunk = this.spatialIndex.get(`${ci},${cj}`);
        if (chunk) {
          for (const building of chunk) {
            if (!seen.has(building)) {
              seen.add(building);
              // Verify building actually overlaps viewport
              const dims = facilityDimensions.get(building.visualClass);
              const xsize = dims?.xsize ?? 1;
              const ysize = dims?.ysize ?? 1;
              if (
                building.y + ysize - 1 >= minI &&
                building.y <= maxI &&
                building.x + xsize - 1 >= minJ &&
                building.x <= maxJ
              ) {
                result.push(building);
              }
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Update building rendering
   */
  update(
    buildings: MapBuilding[],
    facilityDimensions: Map<string, FacilityDimensions>,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig,
    hoveredBuilding: MapBuilding | null,
    mapWidth: number,
    mapHeight: number
  ): void {
    try {
      console.log(`[PixiBuildingLayer] update() called with ${buildings.length} buildings`);

      // Rebuild spatial index if buildings changed
      if (buildings !== this.lastBuildingsRef) {
        console.log(`[PixiBuildingLayer] Rebuilding index for ${buildings.length} buildings, mapSize=${mapWidth}x${mapHeight}`);
        if (buildings.length > 0) {
          console.log(`[PixiBuildingLayer] First building:`, buildings[0]);
        }
        this.buildSpatialIndex(buildings, facilityDimensions);
        this.lastBuildingsRef = buildings;
      }

    this.batch.beginFrame();
    this.fallbackGraphics.clear();

    // Get buildings in visible chunks (fast spatial query)
    const candidateBuildings = this.getBuildingsInBounds(bounds, facilityDimensions);

    // Debug log (throttled)
    if (candidateBuildings.length > 0 || Math.random() < 0.01) {
      console.log(`[PixiBuildingLayer] bounds: i=${bounds.minI}-${bounds.maxI}, j=${bounds.minJ}-${bounds.maxJ}, candidates=${candidateBuildings.length}, mapSize=${mapWidth}x${mapHeight}`);
    }

    // Skip rendering if map dimensions are invalid
    if (mapWidth <= 0 || mapHeight <= 0) {
      console.warn(`[PixiBuildingLayer] Invalid map dimensions: ${mapWidth}x${mapHeight}`);
      this.batch.endFrame();
      return;
    }

    // Sort by painter's algorithm (ascending)
    const visibleBuildings: Array<{ building: MapBuilding; sortKey: number }> = [];
    for (const building of candidateBuildings) {
      const dims = facilityDimensions.get(building.visualClass);
      const xsize = dims?.xsize ?? 1;
      const ysize = dims?.ysize ?? 1;
      const sortKey = (building.y + ysize) + (building.x + xsize);
      visibleBuildings.push({ building, sortKey });
    }

    visibleBuildings.sort((a, b) => a.sortKey - b.sortKey);

    // Render each building
    for (const { building, sortKey } of visibleBuildings) {
      const dims = facilityDimensions.get(building.visualClass);
      const isHovered = hoveredBuilding === building;
      this.renderBuilding(building, dims, sortKey, zoomConfig, isHovered, mapWidth, mapHeight);
    }

    this.batch.endFrame();
    } catch (error) {
      console.error('[PixiBuildingLayer] Error in update():', error);
    }
  }

  /**
   * Render a single building
   */
  private renderBuilding(
    building: MapBuilding,
    dims: FacilityDimensions | undefined,
    sortKey: number,
    zoomConfig: ZoomConfig,
    isHovered: boolean,
    mapWidth: number,
    mapHeight: number
  ): void {
    const xsize = dims?.xsize ?? 1;
    const ysize = dims?.ysize ?? 1;

    // Get texture (async loading)
    const texture = this.textureAtlas.getBuildingTextureSync(building.visualClass);

    if (texture) {
      // Render with texture
      this.renderBuildingSprite(building, texture, xsize, ysize, sortKey, zoomConfig, isHovered, mapWidth, mapHeight);
    } else {
      // Render fallback (colored diamond)
      this.renderBuildingFallback(building, xsize, ysize, sortKey, zoomConfig, isHovered, mapWidth, mapHeight);
    }
  }

  /**
   * Render building with texture
   *
   * Matches Canvas2D positioning logic:
   * - Anchor at SOUTH corner (front corner closest to viewer) at (building.y, building.x)
   * - Scale uniformly based on zoom level (textures designed for 64x32 tile size)
   * - Bottom-center of texture aligns with south vertex of south corner tile
   */
  private renderBuildingSprite(
    building: MapBuilding,
    texture: Texture,
    xsize: number,
    ysize: number,
    sortKey: number,
    zoomConfig: ZoomConfig,
    isHovered: boolean,
    mapWidth: number,
    mapHeight: number
  ): void {
    // Calculate anchor position: SOUTH corner (front corner) at (building.y, building.x)
    // This matches Canvas2D: southCornerScreenPos = mapToScreen(building.y, building.x)
    const southCornerI = building.y;
    const southCornerJ = building.x;

    const screenPos = this.mapToScreen(
      southCornerI,
      southCornerJ,
      mapWidth,
      mapHeight,
      zoomConfig
    );

    // Calculate zoom scale factor (textures designed for 64x32 tile size)
    // Scale uniformly - do NOT force into footprint dimensions
    const scaleFactor = zoomConfig.tileWidth / 64;

    const posKey = `building:${building.x},${building.y}`;
    const textureKey = `building:${building.visualClass}`;

    // j tie-breaker uses front corner j coordinate
    const jTieBreaker = building.x + xsize;

    // PAINTER'S ALGORITHM: Invert sortKey so higher (i+j) = lower zIndex = drawn first (background)
    const invertedSortKey = SORT_MAX_KEY - sortKey;

    // Position: bottom-center of texture aligns with south VERTEX of south corner tile
    // South vertex is at screenPos.y + tileHeight
    // With anchorY=1 (bottom) and anchorX=0.5 (center), sprite position should be at south vertex
    this.batch.setSprite(
      posKey,
      textureKey,
      texture,
      screenPos.x,                          // Center horizontally on south corner
      screenPos.y + zoomConfig.tileHeight,  // South vertex (bottom of tile)
      SORT_OFFSET_UPPER + invertedSortKey * SORT_MULTIPLIER_DIAGONAL + jTieBreaker * SORT_MULTIPLIER_J + SORT_PRIORITY_BUILDING,
      {
        scaleX: scaleFactor,
        scaleY: scaleFactor,
        anchorX: 0.5,  // Center horizontally
        anchorY: 1,    // Anchor at bottom
        tint: isHovered ? 0xAAAAFF : 0xFFFFFF,
        alpha: isHovered ? 0.9 : 1
      }
    );
  }

  /**
   * Render building as fallback colored diamond
   */
  private renderBuildingFallback(
    building: MapBuilding,
    xsize: number,
    ysize: number,
    sortKey: number,
    zoomConfig: ZoomConfig,
    isHovered: boolean,
    mapWidth: number,
    mapHeight: number
  ): void {
    const color = isHovered ? BUILDING_COLORS.hovered : BUILDING_COLORS.default;

    // Draw diamond for each tile in building footprint
    for (let di = 0; di < ysize; di++) {
      for (let dj = 0; dj < xsize; dj++) {
        const i = building.y + di;
        const j = building.x + dj;

        const screenPos = this.mapToScreen(i, j, mapWidth, mapHeight, zoomConfig);

        const hw = zoomConfig.tileWidth / 2;
        const hh = zoomConfig.tileHeight / 2;

        this.fallbackGraphics.setFillStyle({ color, alpha: 0.8 });
        this.fallbackGraphics.moveTo(screenPos.x, screenPos.y - hh);
        this.fallbackGraphics.lineTo(screenPos.x + hw, screenPos.y);
        this.fallbackGraphics.lineTo(screenPos.x, screenPos.y + hh);
        this.fallbackGraphics.lineTo(screenPos.x - hw, screenPos.y);
        this.fallbackGraphics.closePath();
        this.fallbackGraphics.fill();
      }
    }

    // Set z-index for fallback graphics (unified sortKey with upper layer offset)
    const jTieBreaker = building.x + xsize;
    // PAINTER'S ALGORITHM: Invert sortKey so higher (i+j) = lower zIndex = drawn first (background)
    const invertedSortKey = SORT_MAX_KEY - sortKey;
    this.fallbackGraphics.zIndex = SORT_OFFSET_UPPER + invertedSortKey * SORT_MULTIPLIER_DIAGONAL + jTieBreaker * SORT_MULTIPLIER_J + SORT_PRIORITY_BUILDING + 1;
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
    this.fallbackGraphics.clear();
  }
}
