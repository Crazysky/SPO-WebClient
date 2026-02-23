import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('TextureExtractor index caching', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tex-index-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Simulate the index loading logic from TextureExtractor.extractTerrainTextures()
   * to test the validation without needing the full service initialization.
   */
  function loadIndexIfValid(indexPath: string): { loaded: boolean; textureCount: number; reason?: string } {
    if (!fs.existsSync(indexPath)) {
      return { loaded: false, textureCount: 0, reason: 'index not found' };
    }

    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const textureKeys = Object.keys(indexData.textures || {});

    if (indexData.version === 3 && textureKeys.length > 0) {
      return { loaded: true, textureCount: textureKeys.length };
    } else if (indexData.version === 3 && textureKeys.length === 0) {
      return { loaded: false, textureCount: 0, reason: 'empty v3 index' };
    } else {
      return { loaded: false, textureCount: 0, reason: `version mismatch: ${indexData.version}` };
    }
  }

  it('should reject v3 index with empty textures', () => {
    const indexPath = path.join(tempDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      version: 3,
      terrainType: 'Earth',
      season: 1,
      seasonName: 'Spring',
      textures: {}
    }));

    const result = loadIndexIfValid(indexPath);
    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('empty v3 index');
  });

  it('should accept v3 index with actual textures', () => {
    const indexPath = path.join(tempDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      version: 3,
      terrainType: 'Earth',
      season: 1,
      seasonName: 'Spring',
      textures: {
        '0': [{ paletteIndex: 0, terrainType: 'Earth', direction: 'Center', variant: 0, filePath: '/path/to/texture.png', fileName: 'texture.png' }],
        '1': [{ paletteIndex: 1, terrainType: 'Earth', direction: 'Center', variant: 0, filePath: '/path/to/texture2.png', fileName: 'texture2.png' }]
      }
    }));

    const result = loadIndexIfValid(indexPath);
    expect(result.loaded).toBe(true);
    expect(result.textureCount).toBe(2);
  });

  it('should reject old version index', () => {
    const indexPath = path.join(tempDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      version: 2,
      terrainType: 'Earth',
      season: 1,
      textures: { '0': [{}] }
    }));

    const result = loadIndexIfValid(indexPath);
    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('version mismatch: 2');
  });

  it('should handle missing textures field gracefully', () => {
    const indexPath = path.join(tempDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
      version: 3,
      terrainType: 'Earth',
      season: 1
      // no textures field
    }));

    const result = loadIndexIfValid(indexPath);
    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('empty v3 index');
  });

  it('should return not found for missing index file', () => {
    const result = loadIndexIfValid(path.join(tempDir, 'nonexistent.json'));
    expect(result.loaded).toBe(false);
    expect(result.reason).toBe('index not found');
  });
});
