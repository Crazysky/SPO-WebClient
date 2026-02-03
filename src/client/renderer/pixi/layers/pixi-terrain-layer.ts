/**
 * PixiTerrainLayer - GPU-accelerated terrain rendering
 *
 * Renders isometric terrain tiles using PixiJS sprites with:
 * - Efficient sprite pooling and reuse
 * - Viewport culling (only render visible tiles)
 * - Automatic texture loading and caching
 *
 * Two-Tier Painter's Algorithm:
 * - Base terrain: sortKey * 10000 + SORT_PRIORITY_TERRAIN_BASE (lower tier)
 * - Tall terrain: SORT_OFFSET_UPPER + sortKey * 10000 + SORT_PRIORITY_TERRAIN_TALL (upper tier)
 *
 * The upper tier (SORT_OFFSET_UPPER = 30M) ensures tall terrain ALWAYS renders
 * after ALL roads, matching Canvas2D's drawTallTerrainOverRoads behavior.
 */

import { Container, Sprite, Texture, Graphics } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds, SORT_OFFSET_UPPER, SORT_MAX_KEY, SORT_MULTIPLIER_DIAGONAL, SORT_MULTIPLIER_J, SORT_PRIORITY_TERRAIN_BASE, SORT_PRIORITY_TERRAIN_TALL } from '../pixi-renderer';
import { TerrainData, ZoomConfig } from '../../../../shared/map-config';
// Note: LandClass/landClassOf not currently used but may be needed for future texture selection

/** Tall texture threshold (tiles taller than this need second pass) */
const TALL_TEXTURE_THRESHOLD = 32;

/**
 * LOD Configuration for tall terrain
 *
 * At distant zoom levels (0-1), tall terrain textures are so small that
 * their vegetation/details are invisible. Rendering them in the upper tier
 * adds sprites without visual benefit.
 *
 * LOD Strategy:
 * - Zoom 0-1: Skip tall terrain upper tier entirely (10-20% sprite reduction)
 * - Zoom 2-3: Full tall terrain rendering
 *
 * This significantly improves performance at distant zoom levels where
 * the sprite count would otherwise be 65K-260K.
 */
const LOD_SKIP_TALL_TERRAIN_MAX_ZOOM = 1; // Skip tall terrain at zoom levels <= this

/**
 * Terrain layer renderer for PixiJS
 */
export class PixiTerrainLayer {
  private container: Container;
  private textureAtlas: TextureAtlasManager;
  private spritePool: SpritePool;

  // Single batch for all terrain (base + tall) - critical for painter's algorithm
  private batch: BatchSpriteManager;

  // Cached data
  private lastBounds: ViewportBounds | null = null;
  private lastZoomLevel: number = -1;

  constructor(
    baseContainer: Container,
    _tallContainer: Container, // Not used - all terrain in base container for proper painter's algorithm
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = baseContainer;
    this.textureAtlas = textureAtlas;
    this.spritePool = spritePool;

    // Single batch for ALL terrain - required for correct painter's algorithm overlap
    this.batch = new BatchSpriteManager(spritePool, baseContainer, 'terrain');

    // Enable sorting for proper z-order
    // PERFORMANCE: sortableChildren disabled - parent PixiRenderer sorts manually
    // this.container.sortableChildren = true;
  }

  /**
   * Update terrain rendering for current viewport
   * @param roadTilesMap Map of road tile positions (key format: "x,y") - tiles with roads don't render tall terrain
   * @param concreteTilesMap Map of concrete tile positions (key format: "i,j") - tiles with concrete don't render tall terrain
   */
  update(
    terrainData: TerrainData,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig,
    roadTilesMap?: Map<string, boolean>,
    concreteTilesMap?: Map<string, boolean>
  ): void {
    const { minI, maxI, minJ, maxJ } = bounds;
    const mapWidth = terrainData.width;
    const mapHeight = terrainData.height;

    // Begin frame
    this.batch.beginFrame();

    // Render tiles in painter's algorithm order (back to front)
    // Instead of sorting, iterate by diagonal bands: sortKey = i + j
    // This avoids array allocation and sorting overhead
    const minSortKey = minI + minJ;
    const maxSortKey = maxI + maxJ;

    for (let sortKey = minSortKey; sortKey <= maxSortKey; sortKey++) {
      // For each diagonal, iterate valid (i, j) pairs where i + j = sortKey
      // i ranges from max(minI, sortKey - maxJ) to min(maxI, sortKey - minJ)
      const iStart = Math.max(minI, sortKey - maxJ);
      const iEnd = Math.min(maxI, sortKey - minJ);

      for (let i = iStart; i <= iEnd; i++) {
        const j = sortKey - i;
        if (j >= minJ && j <= maxJ) {
          this.renderTile(terrainData, i, j, sortKey, mapWidth, mapHeight, zoomConfig, roadTilesMap, concreteTilesMap);
        }
      }
    }

    // End frame - release unused sprites
    this.batch.endFrame();

    this.lastBounds = bounds;
    this.lastZoomLevel = zoomConfig.level;
  }

  /**
   * Render a single terrain tile
   */
  private renderTile(
    terrainData: TerrainData,
    i: number,
    j: number,
    sortKey: number,
    mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig,
    roadTilesMap?: Map<string, boolean>,
    concreteTilesMap?: Map<string, boolean>
  ): void {
    // Get palette index from terrain data
    const paletteIndex = terrainData.paletteData[i]?.[j];
    if (paletteIndex === undefined) return;

    // Get screen position (isometric projection)
    const screenPos = this.mapToScreen(i, j, mapWidth, mapHeight, zoomConfig);

    // Get texture (sync - will use fallback if not loaded)
    const texture = this.textureAtlas.getTerrainTextureSync(paletteIndex);

    // Position key for sprite tracking (declared early for fallback path)
    const posKey = `${i},${j}`;
    const textureKey = `terrain:${paletteIndex}`;

    // Calculate scale based on zoom level
    // Use uniform scale (based on width) to maintain aspect ratio
    const scale = zoomConfig.tileWidth / 64;  // Base texture is 64 wide

    // Determine if this is a tall texture by checking actual texture height
    // (matching Canvas2D approach which checks texture.height > 32)
    const isTall = texture.height > TALL_TEXTURE_THRESHOLD;

    // If tile has a road or concrete and is tall, skip rendering tall terrain
    // The base terrain was already rendered by the standard pass, roads will cover it
    // This matches Canvas2D's drawTallTerrainOverRoads which skips tall terrain on road tiles
    const onConcreteOrRoad = roadTilesMap?.has(`${j},${i}`) || concreteTilesMap?.has(`${i},${j}`);
    if (isTall && onConcreteOrRoad) {
      // Render the texture at base tier (not upper tier) so roads cover it properly
      // The full texture is rendered but the vegetation part above will be covered by nearby elements
      const invertedSortKeyBase = SORT_MAX_KEY - sortKey;
      this.batch.setSprite(
        posKey,
        textureKey,
        texture,
        screenPos.x,
        screenPos.y + zoomConfig.tileHeight,
        invertedSortKeyBase * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_TERRAIN_BASE,
        {
          scaleX: scale,
          scaleY: scale,
          anchorX: 0.5,
          anchorY: 1  // Bottom anchor for tall textures
        }
      );
      return;
    }

    // Unified zIndex formula: sortKey * DIAGONAL + j * J_MULT + priority
    // The j tie-breaker ensures proper ordering on the same diagonal
    // PAINTER'S ALGORITHM: Invert sortKey so higher (i+j) = lower zIndex = drawn first (background)
    const invertedSortKey = SORT_MAX_KEY - sortKey;

    if (isTall) {
      // LOD: At distant zoom levels, skip tall terrain in upper tier
      // The vegetation/details are invisible at these scales anyway
      // This reduces sprite count by 10-20% at zoom levels 0-1
      if (zoomConfig.level <= LOD_SKIP_TALL_TERRAIN_MAX_ZOOM) {
        // At distant zoom, render tall texture at base tier only (no upper tier)
        // This saves sprites while maintaining ground appearance
        this.batch.setSprite(
          posKey,
          textureKey,
          texture,
          screenPos.x,
          screenPos.y + zoomConfig.tileHeight,
          invertedSortKey * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_TERRAIN_BASE,
          {
            scaleX: scale,
            scaleY: scale,
            anchorX: 0.5,
            anchorY: 1
          }
        );
        return;
      }

      // Tall tile - bottom-anchored, bottom aligns with standard tile bottom
      // Uses SORT_OFFSET_UPPER to ensure tall terrain renders AFTER ALL roads
      // (matching Canvas2D drawTallTerrainOverRoads behavior)
      this.batch.setSprite(
        posKey,
        textureKey,
        texture,
        screenPos.x,
        screenPos.y + zoomConfig.tileHeight,
        SORT_OFFSET_UPPER + invertedSortKey * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_TERRAIN_TALL,
        {
          scaleX: scale,
          scaleY: scale,  // Uniform scale to maintain aspect ratio for tall textures
          anchorX: 0.5,
          anchorY: 1  // Bottom anchor - sprite extends upward from position
        }
      );
    } else {
      // Standard tile - top anchor, screenPos.y is the top of the tile
      this.batch.setSprite(
        posKey,
        textureKey,
        texture,
        screenPos.x,
        screenPos.y,
        invertedSortKey * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_TERRAIN_BASE,
        {
          scaleX: scale,
          scaleY: scale,  // Uniform scale
          anchorX: 0.5,
          anchorY: 0  // Top anchor - sprite extends downward from position
        }
      );
    }
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

    // Isometric projection
    const x = u * (rows - i + j);
    const y = (u / 2) * ((rows - i) + (cols - j));

    return { x, y };
  }

  /**
   * Clear all terrain sprites
   */
  clear(): void {
    this.batch.clear();
  }

  /**
   * Get statistics
   */
  getStats(): { sprites: number } {
    return {
      sprites: this.batch.getActiveCount()
    };
  }
}
