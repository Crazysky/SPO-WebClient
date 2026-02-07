/**
 * Unit tests for GameObjectTextureCache
 * Tests atlas loading and texture management for road/concrete/building textures.
 */

import { GameObjectTextureCache } from './game-object-texture-cache';

// Mock fetch
global.fetch = jest.fn();

// Mock createImageBitmap
(global as any).createImageBitmap = jest.fn();

// Mock facility dimensions cache
jest.mock('../facility-dimensions-cache', () => ({
  getFacilityDimensionsCache: () => ({
    getFacility: (visualClass: string) => {
      if (visualClass === 'PGIFoodStore') {
        return {
          textureFilename: 'MapPGIFoodStore64x32x0.gif',
          constructionTextureFilename: 'Construction64.gif',
        };
      }
      return null;
    },
  }),
}));

describe('GameObjectTextureCache', () => {
  let cache: GameObjectTextureCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new GameObjectTextureCache();

    // Default mock: return 404
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });
  });

  describe('constructor', () => {
    it('should create cache with default max size of 2048', () => {
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(2048);
    });

    it('should create cache with custom max size', () => {
      const custom = new GameObjectTextureCache(100);
      expect(custom.getStats().maxSize).toBe(100);
    });

    it('should start with empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getTextureSync', () => {
    it('should return null for uncached texture', () => {
      const texture = cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      expect(texture).toBeNull();
    });

    it('should trigger async load for uncached texture', () => {
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      expect(global.fetch).toHaveBeenCalledWith('/cache/RoadBlockImages/Roadvert.bmp');
    });

    it('should not start multiple loads for same texture', () => {
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should increment misses for uncached texture', () => {
      cache.getTextureSync('ConcreteImages', 'concrete1.bmp');
      expect(cache.getStats().misses).toBe(1);
    });
  });

  describe('getTextureAsync', () => {
    it('should resolve to null for missing texture (404)', async () => {
      const texture = await cache.getTextureAsync('RoadBlockImages', 'missing.bmp');
      expect(texture).toBeNull();
    });

    it('should resolve to ImageBitmap for successful response', async () => {
      const mockBitmap = { width: 64, height: 32, close: jest.fn() };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob()),
      });
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      const texture = await cache.getTextureAsync('RoadBlockImages', 'Roadvert.bmp');
      expect(texture).toBe(mockBitmap);
    });
  });

  describe('object atlas', () => {
    const mockManifest = {
      category: 'road',
      tileWidth: 64,
      tileHeight: 32,
      atlasWidth: 512,
      atlasHeight: 256,
      tiles: {
        'Roadvert.bmp': { x: 0, y: 0, width: 64, height: 32 },
        'Roadhorz.bmp': { x: 64, y: 0, width: 64, height: 32 },
        'Bridge.bmp': { x: 128, y: 0, width: 64, height: 90 },
      },
    };

    const mockBitmap = { width: 512, height: 256, close: jest.fn() };

    function setupAtlasMock() {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('/manifest')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockManifest),
          });
        }
        if (url.includes('/api/object-atlas/')) {
          return Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob()),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);
    }

    it('should load object atlas from server', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      expect(global.fetch).toHaveBeenCalledWith('/api/object-atlas/road');
      expect(global.fetch).toHaveBeenCalledWith('/api/object-atlas/road/manifest');
      expect(cache.hasAtlas('road')).toBe(true);
    });

    it('should not reload atlas if already loaded', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');
      await cache.loadObjectAtlas('road');

      // Only 2 fetch calls (atlas + manifest), not 4
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle failed atlas load gracefully', async () => {
      // Default mock returns 404
      await cache.loadObjectAtlas('road');
      expect(cache.hasAtlas('road')).toBe(false);
    });

    it('should return atlas rect for known texture', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('RoadBlockImages', 'Roadvert.bmp');
      expect(rect).not.toBeNull();
      expect(rect!.sx).toBe(0);
      expect(rect!.sy).toBe(0);
      expect(rect!.sw).toBe(64);
      expect(rect!.sh).toBe(32);
      expect(rect!.atlas).toBe(mockBitmap);
    });

    it('should return atlas rect for tall texture (bridge)', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('RoadBlockImages', 'Bridge.bmp');
      expect(rect).not.toBeNull();
      expect(rect!.sh).toBe(90);
    });

    it('should return null for unknown texture in atlas', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('RoadBlockImages', 'NonExistent.bmp');
      expect(rect).toBeNull();
    });

    it('should return null when atlas not loaded', () => {
      const rect = cache.getAtlasRect('RoadBlockImages', 'Roadvert.bmp');
      expect(rect).toBeNull();
    });

    it('should return null for categories without atlas (BuildingImages)', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('BuildingImages', 'MapSomething.gif');
      expect(rect).toBeNull();
    });

    it('should map ConcreteImages to concrete atlas', async () => {
      const concreteManifest = {
        category: 'concrete',
        tileWidth: 64,
        tileHeight: 32,
        atlasWidth: 256,
        atlasHeight: 128,
        tiles: {
          'concrete1.bmp': { x: 0, y: 0, width: 64, height: 32 },
        },
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('/manifest')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(concreteManifest),
          });
        }
        if (url.includes('/api/object-atlas/')) {
          return Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob()),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await cache.loadObjectAtlas('concrete');

      const rect = cache.getAtlasRect('ConcreteImages', 'concrete1.bmp');
      expect(rect).not.toBeNull();
      expect(rect!.sw).toBe(64);
    });
  });

  describe('clear', () => {
    it('should reset all cache state', () => {
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should clear loaded atlases', async () => {
      const mockManifest = {
        category: 'road',
        tileWidth: 64, tileHeight: 32,
        atlasWidth: 256, atlasHeight: 128,
        tiles: { 'test.bmp': { x: 0, y: 0, width: 64, height: 32 } },
      };
      const mockBitmap = { width: 256, height: 128, close: jest.fn() };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('/manifest')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockManifest) });
        }
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await cache.loadObjectAtlas('road');
      expect(cache.hasAtlas('road')).toBe(true);

      cache.clear();
      expect(cache.hasAtlas('road')).toBe(false);
      expect(mockBitmap.close).toHaveBeenCalled();
    });
  });

  describe('static methods', () => {
    it('should get road texture type for 4-way intersection', () => {
      expect(GameObjectTextureCache.getRoadTextureType(true, true, true, true)).toBe('Roadcross');
    });

    it('should get road texture type for straight vertical', () => {
      expect(GameObjectTextureCache.getRoadTextureType(true, false, true, false)).toBe('Roadvert');
    });

    it('should get road texture type for straight horizontal', () => {
      expect(GameObjectTextureCache.getRoadTextureType(false, true, false, true)).toBe('Roadhorz');
    });

    it('should get road texture type for corners', () => {
      expect(GameObjectTextureCache.getRoadTextureType(true, true, false, false)).toBe('RoadcornerW');
      expect(GameObjectTextureCache.getRoadTextureType(false, true, true, false)).toBe('RoadcornerN');
      expect(GameObjectTextureCache.getRoadTextureType(false, false, true, true)).toBe('RoadcornerE');
      expect(GameObjectTextureCache.getRoadTextureType(true, false, false, true)).toBe('RoadcornerS');
    });

    it('should get road texture type for T-junctions', () => {
      expect(GameObjectTextureCache.getRoadTextureType(false, true, true, true)).toBe('RoadTS');
      expect(GameObjectTextureCache.getRoadTextureType(true, false, true, true)).toBe('RoadTW');
      expect(GameObjectTextureCache.getRoadTextureType(true, true, false, true)).toBe('RoadTN');
      expect(GameObjectTextureCache.getRoadTextureType(true, true, true, false)).toBe('RoadTE');
    });

    it('should get road texture filename', () => {
      expect(GameObjectTextureCache.getRoadTextureFilename('Roadvert')).toBe('Roadvert.bmp');
    });

    it('should get building texture filename from facility cache', () => {
      expect(GameObjectTextureCache.getBuildingTextureFilename('PGIFoodStore')).toBe('MapPGIFoodStore64x32x0.gif');
    });

    it('should use fallback pattern for unknown buildings', () => {
      expect(GameObjectTextureCache.getBuildingTextureFilename('Unknown')).toBe('MapUnknown64x32x0.gif');
    });

    it('should get construction texture filename', () => {
      expect(GameObjectTextureCache.getConstructionTextureFilename('PGIFoodStore')).toBe('Construction64.gif');
    });
  });

  describe('onTextureLoaded callback', () => {
    it('should call callback when texture is loaded', async () => {
      const callback = jest.fn();
      cache.setOnTextureLoaded(callback);

      const mockBitmap = { width: 64, height: 32, close: jest.fn() };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob()),
      });
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      await cache.getTextureAsync('RoadBlockImages', 'Roadvert.bmp');
      expect(callback).toHaveBeenCalledWith('RoadBlockImages', 'Roadvert.bmp');
    });

    it('should not call callback for missing textures', async () => {
      const callback = jest.fn();
      cache.setOnTextureLoaded(callback);

      await cache.getTextureAsync('RoadBlockImages', 'missing.bmp');
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
