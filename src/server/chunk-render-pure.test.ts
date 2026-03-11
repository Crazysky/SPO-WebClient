/**
 * Tests for generateChunkRGBAPure
 */

import { generateChunkRGBAPure } from './chunk-render-pure';
import { CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT, CHUNK_SIZE } from './terrain-chunk-renderer';
import type { AtlasManifest } from './atlas-generator';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Build a minimal AtlasManifest with one tile at position (0,0) */
function makeManifest(paletteIndex: number, tileW: number, tileH: number): AtlasManifest {
  return {
    version: 1,
    terrainType: 'Earth',
    season: 2,
    tileWidth: 64,
    tileHeight: 32,
    cellHeight: 96,
    atlasWidth: 1024,
    atlasHeight: 1536,
    columns: 16,
    rows: 16,
    tiles: {
      [String(paletteIndex)]: { x: 0, y: 0, width: tileW, height: tileH },
    },
  };
}

/** Build a tiny atlas pixel buffer: all pixels have the given RGBA value */
function makeAtlasPixels(width: number, height: number, r: number, g: number, b: number, a: number): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4]     = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

/** Build a map indices array where every tile has the same value */
function makeMapIndices(width: number, height: number, value: number): Uint8Array {
  return new Uint8Array(width * height).fill(value);
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('generateChunkRGBAPure', () => {
  const ATLAS_W = 1024;
  const ATLAS_H = 1536;

  test('returns null for empty atlasPixels', () => {
    const manifest = makeManifest(0, 64, 32);
    const mapIndices = makeMapIndices(64, 64, 0);
    const result = generateChunkRGBAPure(
      Buffer.alloc(0), ATLAS_W, manifest, mapIndices, 64, 64, 0, 0
    );
    expect(result).toBeNull();
  });

  test('returns null for empty mapIndices', () => {
    const atlasPixels = makeAtlasPixels(ATLAS_W, ATLAS_H, 255, 0, 0, 255);
    const manifest = makeManifest(0, 64, 32);
    const result = generateChunkRGBAPure(
      atlasPixels, ATLAS_W, manifest, new Uint8Array(0), 64, 64, 0, 0
    );
    expect(result).toBeNull();
  });

  test('returns buffer of correct size', () => {
    const atlasPixels = makeAtlasPixels(ATLAS_W, ATLAS_H, 100, 150, 200, 255);
    const manifest = makeManifest(42, 64, 32);
    const mapIndices = makeMapIndices(CHUNK_SIZE, CHUNK_SIZE, 42);
    const result = generateChunkRGBAPure(
      atlasPixels, ATLAS_W, manifest, mapIndices, CHUNK_SIZE, CHUNK_SIZE, 0, 0
    );
    expect(result).not.toBeNull();
    expect(result!.length).toBe(CHUNK_CANVAS_WIDTH * CHUNK_CANVAS_HEIGHT * 4);
  });

  test('transparent atlas tile (alpha=0) leaves chunk transparent', () => {
    // Atlas pixels are fully transparent
    const atlasPixels = makeAtlasPixels(ATLAS_W, ATLAS_H, 255, 0, 0, 0);
    const manifest = makeManifest(0, 64, 32);
    const mapIndices = makeMapIndices(CHUNK_SIZE, CHUNK_SIZE, 0);
    const result = generateChunkRGBAPure(
      atlasPixels, ATLAS_W, manifest, mapIndices, CHUNK_SIZE, CHUNK_SIZE, 0, 0
    );
    expect(result).not.toBeNull();
    // All alpha bytes should be 0 (transparent blitting of transparent source)
    let anyOpaque = false;
    for (let i = 3; i < result!.length; i += 4) {
      if (result![i] > 0) { anyOpaque = true; break; }
    }
    expect(anyOpaque).toBe(false);
  });

  test('special tile is masked with FLAT_MASK (0xC0) before atlas lookup', () => {
    // LandType.Special = 13. Encoding: (13 << 2) | 0 = 0x34 (ZoneA, Special, var=0).
    // 0x34 & 0xC0 = 0x00 — masked to ZoneA Center (palette index 0).
    const SPECIAL_ID = 0x34;
    const MASKED_ID  = 0x00;

    // Atlas has entry for MASKED_ID (0x00) but not for SPECIAL_ID (0x0D)
    const manifest = makeManifest(MASKED_ID, 64, 32);
    const atlasPixels = makeAtlasPixels(ATLAS_W, ATLAS_H, 10, 20, 30, 255);
    const mapIndices = makeMapIndices(CHUNK_SIZE, CHUNK_SIZE, SPECIAL_ID);

    const result = generateChunkRGBAPure(
      atlasPixels, ATLAS_W, manifest, mapIndices, CHUNK_SIZE, CHUNK_SIZE, 0, 0
    );
    expect(result).not.toBeNull();
    // Some pixels should be opaque (tile was found via masked ID)
    let hasOpaque = false;
    for (let i = 3; i < result!.length; i += 4) {
      if (result![i] > 0) { hasOpaque = true; break; }
    }
    expect(hasOpaque).toBe(true);
  });

  test('missing atlas entry for tile ID leaves those pixels transparent', () => {
    // Map has tile ID 99, but manifest has no entry for 99
    const manifest = makeManifest(0, 64, 32); // only has tile 0
    const atlasPixels = makeAtlasPixels(ATLAS_W, ATLAS_H, 255, 0, 0, 255);
    const mapIndices = makeMapIndices(CHUNK_SIZE, CHUNK_SIZE, 99);
    const result = generateChunkRGBAPure(
      atlasPixels, ATLAS_W, manifest, mapIndices, CHUNK_SIZE, CHUNK_SIZE, 0, 0
    );
    expect(result).not.toBeNull();
    // No pixels should be opaque (tile 99 has no atlas entry, all skipped)
    let anyOpaque = false;
    for (let i = 3; i < result!.length; i += 4) {
      if (result![i] > 0) { anyOpaque = true; break; }
    }
    expect(anyOpaque).toBe(false);
  });

  test('opaque atlas tile blits colour into chunk buffer', () => {
    // Map tile 5 maps to a 1×1 opaque red pixel in the atlas
    const manifest: AtlasManifest = {
      version: 1, terrainType: 'Earth', season: 2,
      tileWidth: 64, tileHeight: 32, cellHeight: 96,
      atlasWidth: 4, atlasHeight: 4,
      columns: 2, rows: 2,
      tiles: { '5': { x: 0, y: 0, width: 1, height: 1 } },
    };
    const atlasPixels = Buffer.alloc(4 * 4 * 4, 0);
    // pixel (0,0) = red, fully opaque
    atlasPixels[0] = 200; atlasPixels[1] = 50; atlasPixels[2] = 10; atlasPixels[3] = 255;

    const mapIndices = makeMapIndices(CHUNK_SIZE, CHUNK_SIZE, 5);
    const result = generateChunkRGBAPure(
      atlasPixels, 4, manifest, mapIndices, CHUNK_SIZE, CHUNK_SIZE, 0, 0
    );
    expect(result).not.toBeNull();
    // At least one pixel should have R=200
    let found = false;
    for (let i = 0; i < result!.length; i += 4) {
      if (result![i] === 200 && result![i + 3] === 255) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  test('out-of-bounds chunk (startI >= mapHeight) returns transparent buffer', () => {
    const atlasPixels = makeAtlasPixels(ATLAS_W, ATLAS_H, 255, 0, 0, 255);
    const manifest = makeManifest(0, 64, 32);
    // Map is only 1×1 tile, chunk (5,5) is far out of bounds
    const mapIndices = makeMapIndices(1, 1, 0);
    const result = generateChunkRGBAPure(
      atlasPixels, ATLAS_W, manifest, mapIndices, 1, 1, 5, 5
    );
    expect(result).not.toBeNull();
    expect(result!.length).toBe(CHUNK_CANVAS_WIDTH * CHUNK_CANVAS_HEIGHT * 4);
    // Spot-check: buffer should be all zeros (no tiles rendered — out of bounds)
    // Avoid looping 8.8M bytes in a test; check the first 1024 alpha values.
    for (let i = 3; i < Math.min(result!.length, 1024 * 4); i += 4) {
      expect(result![i]).toBe(0);
    }
  });
});
