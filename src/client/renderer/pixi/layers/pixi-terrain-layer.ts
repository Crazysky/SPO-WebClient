/**
 * PixiTerrainLayer - GPU-accelerated terrain rendering
 *
 * Renders isometric terrain tiles using PixiJS sprites with:
 * - Efficient sprite pooling and reuse
 * - Viewport culling (only render visible tiles)
 * - Automatic texture loading and caching
 * - Two-pass rendering (standard tiles + tall tiles)
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
  private tallContainer: Container;
  private textureAtlas: TextureAtlasManager;
  private spritePool: SpritePool;

  // Batch managers for efficient sprite handling
  private baseBatch: BatchSpriteManager;
  private tallBatch: BatchSpriteManager;

  // Cached data
  private lastBounds: ViewportBounds | null = null;
  private lastZoomLevel: number = -1;

  constructor(
    baseContainer: Container,
    tallContainer: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.baseContainer = baseContainer;
    this.tallContainer = tallContainer;
    this.textureAtlas = textureAtlas;
    this.spritePool = spritePool;

    this.baseBatch = new BatchSpriteManager(spritePool, baseContainer, 'terrain-base');
    this.tallBatch = new BatchSpriteManager(spritePool, tallContainer, 'terrain-tall');

    // Enable sorting for proper z-order
    this.baseContainer.sortableChildren = true;
    this.tallContainer.sortableChildren = true;
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
    const { tileWidth, tileHeight, u } = zoomConfig;
    const mapWidth = terrainData.width;
    const mapHeight = terrainData.height;

    // Begin frame for both batches
    this.baseBatch.beginFrame();
    this.tallBatch.beginFrame();

    // Render tiles in painter's algorithm order (back to front)
    // Sorting by (i + j) ascending ensures proper overlap
    const tiles: Array<{ i: number; j: number; sortKey: number }> = [];

    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        tiles.push({ i, j, sortKey: i + j });
      }
    }

    // Sort by sortKey ascending (back to front)
    tiles.sort((a, b) => a.sortKey - b.sortKey);

    // Render each tile
    for (const { i, j, sortKey } of tiles) {
      this.renderTile(terrainData, i, j, sortKey, mapWidth, mapHeight, zoomConfig);
    }

    // End frame - release unused sprites
    this.baseBatch.endFrame();
    this.tallBatch.endFrame();

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
      // Tall tile - render in tall container with adjusted position
      // Tall textures extend upward, so we need to offset Y
      this.tallBatch.setSprite(
        posKey,
        textureKey,
        texture,
        screenPos.x,
        screenPos.y - (texture.height * scaleY - zoomConfig.tileHeight),
        sortKey * 1000 + 500, // Z-index with offset for tall tiles
        {
          scaleX,
          scaleY,
          anchorX: 0.5,
          anchorY: 1
        }
      );
    } else {
      // Standard tile
      this.baseBatch.setSprite(
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
          anchorY: 0.5
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
    this.baseBatch.clear();
    this.tallBatch.clear();
  }

  /**
   * Get statistics
   */
  getStats(): { baseSprites: number; tallSprites: number } {
    return {
      baseSprites: this.baseBatch.getActiveCount(),
      tallSprites: this.tallBatch.getActiveCount()
    };
  }
}
