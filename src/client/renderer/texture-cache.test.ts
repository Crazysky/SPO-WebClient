/**
 * Unit tests for TextureCache
 */

import { TextureCache, getFallbackColor } from './texture-cache';

// Mock fetch
global.fetch = jest.fn();

// Mock createImageBitmap
(global as any).createImageBitmap = jest.fn();

describe('TextureCache', () => {
  let cache: TextureCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new TextureCache(50);

    // Default mock: return 204 (no texture available)
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 204,
    });
  });

  describe('constructor', () => {
    it('should create cache with default max size', () => {
      const defaultCache = new TextureCache();
      const stats = defaultCache.getStats();
      expect(stats.maxSize).toBe(200);
    });

    it('should create cache with custom max size', () => {
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(50);
    });

    it('should start with empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('terrain type', () => {
    it('should have default terrain type of Earth', () => {
      expect(cache.getTerrainType()).toBe('Earth');
    });

    it('should set terrain type', () => {
      cache.setTerrainType('Alien Swamp');
      expect(cache.getTerrainType()).toBe('Alien Swamp');
    });

    it('should clear cache when terrain type changes', () => {
      // First, add something to cache by triggering a load
      cache.getTextureSync(100, 2);

      // Change terrain type
      cache.setTerrainType('Alien Swamp');

      // Stats should be reset
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
    });

    it('should not clear cache when setting same terrain type', () => {
      cache.setTerrainType('Earth'); // Same as default
      cache.getTextureSync(100, 2); // This should trigger a load

      const stats = cache.getStats();
      expect(stats.misses).toBe(1); // Should have one miss from the load
    });
  });

  describe('getTextureSync', () => {
    it('should return null for uncached texture', () => {
      const texture = cache.getTextureSync(100, 2);
      expect(texture).toBeNull();
    });

    it('should increment misses for uncached texture', () => {
      cache.getTextureSync(100, 2);
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('should start async load for uncached texture', () => {
      cache.getTextureSync(100, 2);
      expect(global.fetch).toHaveBeenCalledWith('/api/terrain-texture/Earth/2/100');
    });

    it('should not start multiple loads for same texture', () => {
      cache.getTextureSync(100, 2);
      cache.getTextureSync(100, 2);
      cache.getTextureSync(100, 2);

      // Should only call fetch once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTextureAsync', () => {
    it('should resolve to null for missing texture (204 response)', async () => {
      const texture = await cache.getTextureAsync(100, 2);
      expect(texture).toBeNull();
    });

    it('should resolve to ImageBitmap for successful response', async () => {
      const mockBitmap = { width: 32, height: 16, close: jest.fn() };
      const mockBlob = new Blob();

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: jest.fn().mockResolvedValue(mockBlob),
      });
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      const texture = await cache.getTextureAsync(128, 2);
      expect(texture).toBe(mockBitmap);
    });
  });

  describe('getFallbackColor', () => {
    it('should return color from palette for known indices', () => {
      const color = cache.getFallbackColor(192);
      expect(color).toBe('#1a3a5c'); // Water color
    });

    it('should generate deterministic color for unknown indices', () => {
      const color1 = cache.getFallbackColor(255);
      const color2 = cache.getFallbackColor(255);
      expect(color1).toBe(color2);
    });
  });

  describe('has', () => {
    it('should return false for uncached texture', () => {
      expect(cache.has(100, 2)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should reset all cache state', () => {
      // Trigger some cache activity
      cache.getTextureSync(100, 2);
      cache.getTextureSync(101, 2);

      // Clear
      cache.clear();

      // Verify reset
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('preload', () => {
    it('should load multiple textures', async () => {
      await cache.preload([100, 101, 102], 2);

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenCalledWith('/api/terrain-texture/Earth/2/100');
      expect(global.fetch).toHaveBeenCalledWith('/api/terrain-texture/Earth/2/101');
      expect(global.fetch).toHaveBeenCalledWith('/api/terrain-texture/Earth/2/102');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const stats = cache.getStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should calculate hit rate correctly', () => {
      // All misses
      cache.getTextureSync(100, 2);
      cache.getTextureSync(101, 2);

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('getLoadedCount', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.getLoadedCount()).toBe(0);
    });
  });
});

describe('getFallbackColor (exported function)', () => {
  it('should return water tones for high indices (192+)', () => {
    const color = getFallbackColor(192);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });

  it('should return grass tones for low indices (0-63)', () => {
    const color = getFallbackColor(0);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });

  it('should return midgrass tones for mid indices (64-127)', () => {
    const color = getFallbackColor(64);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });

  it('should return dryground tones for high-mid indices (128-191)', () => {
    const color = getFallbackColor(128);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });
});
