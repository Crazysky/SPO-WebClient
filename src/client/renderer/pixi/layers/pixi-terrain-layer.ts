/**
 * PixiTerrainLayer - GPU-accelerated terrain rendering
 *
 * Renders isometric terrain tiles using PixiJS sprites with:
 * - Efficient sprite pooling and reuse
 * - Viewport culling (only render visible tiles)
 * - Automatic texture loading and caching
 * - All terrain (including tall tiles) in same layer for proper painter's algorithm
 */

import { Container, Sprite, Texture, Graphics } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds } from '../pixi-renderer';
import { TerrainData, ZoomConfig } from '../../../../shared/map-config';
import { LandClass, landClassOf, landTypeOf, LandType } from '../../road-texture-system';

/** Tall texture threshold (tiles taller than this need second pass) */
const TALL_TEXTURE_THRESHOLD = 32;

/**
 * Terrain layer renderer for PixiJS
 */
export class PixiTerrainLayer {
  private baseContainer: Container;
  private textureAtlas: TextureAtlasManager;
  private spritePool: SpritePool;

  // Batch manager for all terrain (including tall tiles)
  private batch: BatchSpriteManager;

  // Cached data
  private lastBounds: ViewportBounds | null = null;
  private lastZoomLevel: number = -1;

  constructor(
    baseContainer: Container,
    _tallContainer: Container, // No longer used - all terrain in base layer
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.baseContainer = baseContainer;
    this.textureAtlas = textureAtlas;
    this.spritePool = spritePool;

    this.batch = new BatchSpriteManager(spritePool, baseContainer, 'terrain');

    // Enable sorting for proper z-order
    this.baseContainer.sortableChildren = true;
  }

  /**
   * Update terrain rendering for current viewport
   */
  update(
    terrainData: TerrainData,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig
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
          this.renderTile(terrainData, i, j, sortKey, mapWidth, mapHeight, zoomConfig);
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
    zoomConfig: ZoomConfig
  ): void {
    // Get palette index from terrain data
    const paletteIndex = terrainData.paletteData[i]?.[j];
    if (paletteIndex === undefined) return;

    // Get screen position (isometric projection)
    const screenPos = this.mapToScreen(i, j, mapWidth, mapHeight, zoomConfig);

    // Get texture (sync - will use fallback if not loaded)
    const texture = this.textureAtlas.getTerrainTextureSync(paletteIndex);

    // Determine if this is a tall texture (special tiles like trees)
    const landType = landTypeOf(paletteIndex);
    const isTall = landType === LandType.Special;

    // Position key for sprite tracking
    const posKey = `${i},${j}`;
    const textureKey = `terrain:${paletteIndex}`;

    // Calculate scale based on zoom level
    const scaleX = zoomConfig.tileWidth / 64;  // Base texture is 64 wide
    const scaleY = zoomConfig.tileHeight / 32; // Base texture is 32 tall

    if (isTall) {
      // Tall tile - bottom-anchored, bottom aligns with standard tile bottom
      // Use +500 offset to render after standard tiles on SAME diagonal only
      // This respects painter's algorithm: tiles with higher sortKey render on top
      this.batch.setSprite(
        posKey,
        textureKey,
        texture,
        screenPos.x,
        screenPos.y + zoomConfig.tileHeight,
        sortKey * 1000 + 500, // +500 ensures tall tile renders after standard tiles on same diagonal
        {
          scaleX,
          scaleY,
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
        sortKey * 1000,
        {
          scaleX,
          scaleY,
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
