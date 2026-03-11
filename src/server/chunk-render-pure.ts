/**
 * chunk-render-pure
 *
 * Pure function version of TerrainChunkRenderer.generateChunkRGBA().
 * Takes atlas and map data as plain parameters — no class instance, no 'this'.
 * Safe to import and call from worker_threads.
 *
 * Logic is identical to the instance method in terrain-chunk-renderer.ts.
 */

import {
  blitTileWithAlpha,
  getTileScreenPosInChunk,
  CHUNK_CANVAS_WIDTH,
  CHUNK_CANVAS_HEIGHT,
  CHUNK_SIZE,
} from './terrain-chunk-renderer';
import { isSpecialTile } from '../shared/land-utils';
import type { AtlasManifest } from './atlas-generator';

/** Bit mask to flatten vegetation/special tile variants to base class */
const FLAT_MASK = 0xC0;

/** Half the zoom-3 tile width (ZOOM3_TILE_WIDTH=64 / 2). Matches terrain-chunk-renderer.ts. */
const ZOOM3_HALF_WIDTH = 32;

/**
 * Render a single terrain chunk at zoom level 3 as an RGBA pixel buffer.
 *
 * This is a pure-function equivalent of TerrainChunkRenderer.generateChunkRGBA().
 * It takes all required data as parameters rather than reading from class state,
 * making it safe to call in worker_threads where class instances cannot be shared.
 *
 * @param atlasPixels   Raw RGBA pixels of the terrain atlas (Buffer or Uint8Array view of SAB)
 * @param atlasWidth    Atlas image width in pixels
 * @param manifest      Atlas manifest mapping palette indices to tile (x, y, w, h)
 * @param mapIndices    Raw 8-bit palette indices from the map BMP (flat array, row-major)
 * @param mapWidth      Map width in tiles
 * @param mapHeight     Map height in tiles
 * @param chunkI        Chunk row index (0-based)
 * @param chunkJ        Chunk column index (0-based)
 * @returns RGBA buffer (CHUNK_CANVAS_WIDTH × CHUNK_CANVAS_HEIGHT × 4 bytes),
 *          or null if the chunk has no atlas data loaded.
 */
export function generateChunkRGBAPure(
  atlasPixels: Buffer,
  atlasWidth: number,
  manifest: AtlasManifest,
  mapIndices: Uint8Array,
  mapWidth: number,
  mapHeight: number,
  chunkI: number,
  chunkJ: number
): Buffer | null {
  if (!atlasPixels || atlasPixels.length === 0) return null;
  if (!mapIndices || mapIndices.length === 0) return null;

  // Allocate chunk RGBA buffer (transparent initially)
  const pixels = Buffer.alloc(CHUNK_CANVAS_WIDTH * CHUNK_CANVAS_HEIGHT * 4, 0);

  // Calculate tile range for this chunk
  const startI = chunkI * CHUNK_SIZE;
  const startJ = chunkJ * CHUNK_SIZE;
  const endI = Math.min(startI + CHUNK_SIZE, mapHeight);
  const endJ = Math.min(startJ + CHUNK_SIZE, mapWidth);

  // Render tiles (same iteration order as the original instance method and client)
  for (let i = startI; i < endI; i++) {
    for (let j = startJ; j < endJ; j++) {
      // Get texture ID and flatten vegetation
      let textureId = mapIndices[i * mapWidth + j];
      if (isSpecialTile(textureId)) {
        textureId = textureId & FLAT_MASK;
      }

      // Get tile source rect from atlas manifest
      const tileEntry = manifest.tiles[String(textureId)];
      if (!tileEntry) continue; // Skip missing tiles

      // Calculate tile position in chunk canvas
      const localI = i - startI;
      const localJ = j - startJ;
      const screenPos = getTileScreenPosInChunk(localI, localJ);
      const destX = screenPos.x - ZOOM3_HALF_WIDTH;
      const destY = screenPos.y;

      // Alpha-blend tile pixels from atlas onto chunk buffer
      blitTileWithAlpha(
        atlasPixels, atlasWidth,
        tileEntry.x, tileEntry.y,
        tileEntry.width, tileEntry.height,
        pixels, CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT,
        destX, destY
      );
    }
  }

  return pixels;
}
