/**
 * Unit tests for AtlasGenerator
 *
 * Tests terrain atlas generation and object atlas generation.
 * Uses synthetic BMP files created in temporary directories.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { generateTerrainAtlas, generateObjectAtlas, AtlasManifest } from './atlas-generator';

// ============================================================================
// Helper: Create synthetic 24-bit BMP for testing
// ============================================================================

function createTestBmp(
  width: number,
  height: number,
  bgColor: [number, number, number] = [0, 0, 255],
  fgColor: [number, number, number] = [0, 200, 0]
): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const dataSize = rowSize * height;
  const fileSize = 54 + dataSize;
  const buffer = Buffer.alloc(fileSize);

  // File header
  buffer.writeUInt16LE(0x4D42, 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);

  // Info header
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22); // positive = bottom-up
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(dataSize, 34);

  // Pixel data (bottom-up, BGR)
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y; // bottom-up
    const rowOffset = 54 + srcRow * rowSize;

    for (let x = 0; x < width; x++) {
      const cx = width / 2;
      const cy = height / 2;
      const dist = Math.abs(x - cx) / cx + Math.abs(y - cy) / cy;

      const color = dist < 0.8 ? fgColor : bgColor;
      const pixOffset = rowOffset + x * 3;
      buffer[pixOffset] = color[2];     // B
      buffer[pixOffset + 1] = color[1]; // G
      buffer[pixOffset + 2] = color[0]; // R
    }
  }

  return buffer;
}

// ============================================================================
// Tests
// ============================================================================

describe('generateTerrainAtlas', () => {
  const tmpDir = path.join(__dirname, '../../.test-tmp-atlas-terrain');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        fs.unlinkSync(path.join(tmpDir, f));
      }
      fs.rmdirSync(tmpDir);
    }
  });

  it('should generate atlas from a set of terrain textures', () => {
    // Create test BMP files for a few palette indices
    const textures = [];
    for (let i = 0; i < 5; i++) {
      const bmpPath = path.join(tmpDir, `land.${i}.test.bmp`);
      fs.writeFileSync(bmpPath, createTestBmp(64, 32));
      textures.push({ paletteIndex: i, filePath: bmpPath });
    }

    const result = generateTerrainAtlas(textures, tmpDir, 'Earth', 2);

    expect(result.success).toBe(true);
    expect(result.tileCount).toBe(5);
    expect(result.atlasWidth).toBe(1024);   // 16 * 64
    expect(result.atlasHeight).toBe(1536);  // 16 * 96

    // Verify files exist
    expect(fs.existsSync(path.join(tmpDir, 'atlas.png'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'atlas.json'))).toBe(true);
  });

  it('should produce valid manifest JSON', () => {
    const bmpPath = path.join(tmpDir, 'tile0.bmp');
    fs.writeFileSync(bmpPath, createTestBmp(64, 32));

    generateTerrainAtlas(
      [{ paletteIndex: 0, filePath: bmpPath }],
      tmpDir,
      'Earth',
      2
    );

    const manifest: AtlasManifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'atlas.json'), 'utf-8')
    );

    expect(manifest.version).toBe(1);
    expect(manifest.terrainType).toBe('Earth');
    expect(manifest.season).toBe(2);
    expect(manifest.tileWidth).toBe(64);
    expect(manifest.tileHeight).toBe(32);
    expect(manifest.cellHeight).toBe(96);
    expect(manifest.columns).toBe(16);
    expect(manifest.rows).toBe(16);
    expect(manifest.tiles['0']).toBeDefined();
    expect(manifest.tiles['0'].width).toBe(64);
    expect(manifest.tiles['0'].height).toBe(32);
  });

  it('should position tiles correctly in grid', () => {
    // Create textures at indices 0, 15, 16 (first col, last col first row, first col second row)
    const indices = [0, 15, 16];
    const textures = indices.map(idx => {
      const bmpPath = path.join(tmpDir, `tile${idx}.bmp`);
      fs.writeFileSync(bmpPath, createTestBmp(64, 32));
      return { paletteIndex: idx, filePath: bmpPath };
    });

    generateTerrainAtlas(textures, tmpDir, 'Earth', 2);

    const manifest: AtlasManifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'atlas.json'), 'utf-8')
    );

    // Index 0: col=0, row=0 → x=0, y=0+yOffset
    expect(manifest.tiles['0'].x).toBe(0);
    expect(manifest.tiles['0'].y).toBe(64); // cellHeight(96) - tileHeight(32) = 64

    // Index 15: col=15, row=0 → x=15*64=960, y=64
    expect(manifest.tiles['15'].x).toBe(960);
    expect(manifest.tiles['15'].y).toBe(64);

    // Index 16: col=0, row=1 → x=0, y=96+64=160
    expect(manifest.tiles['16'].x).toBe(0);
    expect(manifest.tiles['16'].y).toBe(160);
  });

  it('should handle tall textures (64x90)', () => {
    const bmpPath = path.join(tmpDir, 'tall.bmp');
    fs.writeFileSync(bmpPath, createTestBmp(64, 90));

    generateTerrainAtlas(
      [{ paletteIndex: 42, filePath: bmpPath }],
      tmpDir,
      'Earth',
      2
    );

    const manifest: AtlasManifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'atlas.json'), 'utf-8')
    );

    const tile = manifest.tiles['42'];
    expect(tile).toBeDefined();
    expect(tile.height).toBe(90);
    expect(tile.width).toBe(64);
    // yOffset = 96 - 90 = 6, row=2 (42/16=2), so y = 2*96 + 6 = 198
    expect(tile.y).toBe(198);
  });

  it('should produce valid PNG file', () => {
    const bmpPath = path.join(tmpDir, 'tile.bmp');
    fs.writeFileSync(bmpPath, createTestBmp(64, 32));

    generateTerrainAtlas(
      [{ paletteIndex: 0, filePath: bmpPath }],
      tmpDir,
      'Earth',
      2
    );

    const pngBuffer = fs.readFileSync(path.join(tmpDir, 'atlas.png'));

    // Check PNG signature
    expect(pngBuffer[0]).toBe(137);
    expect(pngBuffer[1]).toBe(80);  // P
    expect(pngBuffer[2]).toBe(78);  // N
    expect(pngBuffer[3]).toBe(71);  // G
  });

  it('should skip missing texture files gracefully', () => {
    const bmpPath = path.join(tmpDir, 'exists.bmp');
    fs.writeFileSync(bmpPath, createTestBmp(64, 32));

    const result = generateTerrainAtlas(
      [
        { paletteIndex: 0, filePath: bmpPath },
        { paletteIndex: 1, filePath: path.join(tmpDir, 'missing.bmp') },
      ],
      tmpDir,
      'Earth',
      2
    );

    expect(result.success).toBe(true);
    expect(result.tileCount).toBe(1); // Only the existing file
  });

  it('should handle empty texture list', () => {
    const result = generateTerrainAtlas([], tmpDir, 'Earth', 2);

    expect(result.success).toBe(true);
    expect(result.tileCount).toBe(0);
    // Atlas and manifest should still be created (empty)
    expect(fs.existsSync(path.join(tmpDir, 'atlas.png'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'atlas.json'))).toBe(true);
  });
});

describe('generateObjectAtlas', () => {
  const tmpDir = path.join(__dirname, '../../.test-tmp-atlas-objects');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        fs.unlinkSync(path.join(tmpDir, f));
      }
      fs.rmdirSync(tmpDir);
    }
  });

  it('should generate atlas from road BMP files', () => {
    // Create some test road BMPs
    const roadNames = ['Roadhorz', 'Roadvert', 'Roadcross', 'RoadcornerN'];
    for (const name of roadNames) {
      fs.writeFileSync(
        path.join(tmpDir, `${name}.bmp`),
        createTestBmp(64, 32)
      );
    }

    const atlasPath = path.join(tmpDir, 'road-atlas.png');
    const manifestPath = path.join(tmpDir, 'road-atlas.json');
    const result = generateObjectAtlas(tmpDir, atlasPath, manifestPath, 'roads');

    expect(result.success).toBe(true);
    expect(result.tileCount).toBe(4);
    expect(fs.existsSync(atlasPath)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('should produce correct manifest with tile names as keys', () => {
    fs.writeFileSync(path.join(tmpDir, 'Roadhorz.bmp'), createTestBmp(64, 32));
    fs.writeFileSync(path.join(tmpDir, 'Roadvert.bmp'), createTestBmp(64, 32));

    const atlasPath = path.join(tmpDir, 'atlas.png');
    const manifestPath = path.join(tmpDir, 'atlas.json');
    generateObjectAtlas(tmpDir, atlasPath, manifestPath, 'roads');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(manifest.category).toBe('roads');
    expect(manifest.version).toBe(1);
    expect(manifest.tiles['Roadhorz']).toBeDefined();
    expect(manifest.tiles['Roadvert']).toBeDefined();
    expect(manifest.tiles['Roadhorz'].width).toBe(64);
    expect(manifest.tiles['Roadhorz'].height).toBe(32);
  });

  it('should handle non-existent source directory', () => {
    const result = generateObjectAtlas(
      '/nonexistent/dir',
      path.join(tmpDir, 'atlas.png'),
      path.join(tmpDir, 'atlas.json'),
      'roads'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should handle directory with no BMP files', () => {
    // Directory exists but has no BMPs
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'hello');

    const result = generateObjectAtlas(
      tmpDir,
      path.join(tmpDir, 'atlas.png'),
      path.join(tmpDir, 'atlas.json'),
      'roads'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No BMP files');
  });

  it('should calculate grid dimensions correctly for small sets', () => {
    // 3 files → ceil(sqrt(3))=2 cols, ceil(3/2)=2 rows → 128x64
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(tmpDir, `tile${i}.bmp`), createTestBmp(64, 32));
    }

    const atlasPath = path.join(tmpDir, 'atlas.png');
    const manifestPath = path.join(tmpDir, 'atlas.json');
    const result = generateObjectAtlas(tmpDir, atlasPath, manifestPath, 'test');

    expect(result.success).toBe(true);
    expect(result.atlasWidth).toBe(128);  // 2 * 64
    expect(result.atlasHeight).toBe(64);  // 2 * 32
  });

  it('should handle mixed standard and tall textures (bridges)', () => {
    // Standard road: 64×32, bridge: 64×49
    fs.writeFileSync(path.join(tmpDir, 'Roadhorz.bmp'), createTestBmp(64, 32));
    fs.writeFileSync(path.join(tmpDir, 'NSBridge.bmp'), createTestBmp(64, 49));

    const atlasPath = path.join(tmpDir, 'atlas.png');
    const manifestPath = path.join(tmpDir, 'atlas.json');
    const result = generateObjectAtlas(tmpDir, atlasPath, manifestPath, 'roads');

    expect(result.success).toBe(true);
    expect(result.tileCount).toBe(2);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Cell height should be 49 (max texture height)
    expect(manifest.cellHeight).toBe(49);

    // Bridge texture: full height, bottom-aligned → yOffset = 0
    const bridge = manifest.tiles['NSBridge'];
    expect(bridge).toBeDefined();
    expect(bridge.height).toBe(49);
    expect(bridge.y % 49).toBe(0); // starts at cell top (yOffset = 49-49 = 0)

    // Standard road: 32px, bottom-aligned → yOffset = 49-32 = 17
    const road = manifest.tiles['Roadhorz'];
    expect(road).toBeDefined();
    expect(road.height).toBe(32);
    expect(road.y % 49).toBe(17); // bottom-aligned offset
  });

  it('should handle very tall textures (platform 80px)', () => {
    fs.writeFileSync(path.join(tmpDir, 'platC.bmp'), createTestBmp(64, 80));
    fs.writeFileSync(path.join(tmpDir, 'platS.bmp'), createTestBmp(64, 80));
    fs.writeFileSync(path.join(tmpDir, 'concrete1.bmp'), createTestBmp(64, 32));

    const atlasPath = path.join(tmpDir, 'atlas.png');
    const manifestPath = path.join(tmpDir, 'atlas.json');
    const result = generateObjectAtlas(tmpDir, atlasPath, manifestPath, 'concrete');

    expect(result.success).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Cell height should be 80 (max texture height)
    expect(manifest.cellHeight).toBe(80);

    // Platform texture: 80px height, yOffset = 0
    const platC = manifest.tiles['platC'];
    expect(platC.height).toBe(80);

    // Standard concrete: 32px, bottom-aligned → yOffset = 80-32 = 48
    const std = manifest.tiles['concrete1'];
    expect(std.height).toBe(32);
    expect(std.y % 80).toBe(48); // bottom-aligned
  });

  it('should handle wider-than-standard textures (platW 68px)', () => {
    fs.writeFileSync(path.join(tmpDir, 'platW.bmp'), createTestBmp(68, 80));
    fs.writeFileSync(path.join(tmpDir, 'standard.bmp'), createTestBmp(64, 32));

    const atlasPath = path.join(tmpDir, 'atlas.png');
    const manifestPath = path.join(tmpDir, 'atlas.json');
    const result = generateObjectAtlas(tmpDir, atlasPath, manifestPath, 'concrete');

    expect(result.success).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Cell width should be 68 (max texture width)
    expect(manifest.cellWidth).toBe(68);
    expect(manifest.cellHeight).toBe(80);

    // platW: 68px wide
    const platW = manifest.tiles['platW'];
    expect(platW.width).toBe(68);
    expect(platW.height).toBe(80);

    // standard: 64px wide (less than cellWidth)
    const std = manifest.tiles['standard'];
    expect(std.width).toBe(64);
  });

  it('should preserve standard tile dimensions in manifest for uniform sets', () => {
    // All 64×32 → cellWidth=64, cellHeight=32, no bottom-alignment offset
    fs.writeFileSync(path.join(tmpDir, 'road1.bmp'), createTestBmp(64, 32));
    fs.writeFileSync(path.join(tmpDir, 'road2.bmp'), createTestBmp(64, 32));

    const atlasPath = path.join(tmpDir, 'atlas.png');
    const manifestPath = path.join(tmpDir, 'atlas.json');
    generateObjectAtlas(tmpDir, atlasPath, manifestPath, 'roads');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // When all tiles are 32px, no offset applied
    expect(manifest.tileWidth).toBe(64);
    expect(manifest.tileHeight).toBe(32);
    expect(manifest.cellWidth).toBe(64);
    expect(manifest.cellHeight).toBe(32);

    // Both tiles at their cell top (yOffset = 32-32 = 0)
    for (const key of Object.keys(manifest.tiles)) {
      expect(manifest.tiles[key].height).toBe(32);
      expect(manifest.tiles[key].width).toBe(64);
    }
  });
});
