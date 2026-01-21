/**
 * TextureCache
 *
 * Client-side texture cache with LRU eviction.
 * Fetches terrain textures from the server and caches them as ImageBitmap objects.
 *
 * Features:
 * - LRU (Least Recently Used) eviction policy
 * - Async texture loading with Promise-based API
 * - Fallback colors for missing textures
 * - Pre-loading support for visible tiles
 */

import { ZoomConfig, ZOOM_LEVELS } from '../../shared/map-config';

// Fallback colors for palette indices when texture is not available
const TERRAIN_COLORS: Record<number, string> = {
  // Water (indices 192-255)
  192: '#1a3a5c', 193: '#1d4268', 194: '#204a74', 195: '#234f80',
  196: '#1a3a5c', 197: '#1d4268', 198: '#204a74', 199: '#234f80',
  200: '#287389', 201: '#2a7a90', 202: '#2c8197', 203: '#2e889e',

  // Grass (indices 0-63)
  0: '#5a8c4f', 1: '#5d8f52', 2: '#608255', 3: '#638558',
  4: '#4a7c3f', 5: '#4d7f42', 6: '#507245', 7: '#537548',

  // MidGrass (indices 64-127)
  64: '#6b9460', 65: '#6e9763', 66: '#718a66', 67: '#748d69',
  100: '#7a9a70', 101: '#7d9d73', 102: '#809076', 103: '#839379',

  // DryGround (indices 128-191)
  128: '#8b7355', 129: '#8e7658', 130: '#91795b', 131: '#947c5e',
  132: '#877050', 133: '#8a7353', 134: '#8d7656', 135: '#907959',
  160: '#9a836a', 161: '#9d866d', 162: '#a08970', 163: '#a38c73',
};

/**
 * Generate a deterministic fallback color for unmapped palette indices
 */
function getFallbackColor(paletteIndex: number): string {
  if (TERRAIN_COLORS[paletteIndex]) {
    return TERRAIN_COLORS[paletteIndex];
  }

  // Determine terrain type based on index range
  if (paletteIndex >= 192) {
    // Water range - blue tones
    const hue = 200 + (paletteIndex % 20);
    const sat = 40 + (paletteIndex % 20);
    const light = 25 + (paletteIndex % 15);
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  } else if (paletteIndex >= 128) {
    // DryGround range - brown tones
    const hue = 30 + (paletteIndex % 15);
    const sat = 30 + (paletteIndex % 20);
    const light = 35 + (paletteIndex % 20);
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  } else if (paletteIndex >= 64) {
    // MidGrass range - yellow-green tones
    const hue = 70 + (paletteIndex % 30);
    const sat = 35 + (paletteIndex % 25);
    const light = 35 + (paletteIndex % 20);
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  } else {
    // Grass range - green tones
    const hue = 90 + (paletteIndex % 30);
    const sat = 40 + (paletteIndex % 25);
    const light = 30 + (paletteIndex % 20);
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }
}

interface CacheEntry {
  texture: ImageBitmap | null;
  lastAccess: number;
  loading: boolean;
  loadPromise?: Promise<ImageBitmap | null>;
}

export class TextureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private terrainType: string = 'Earth';
  private accessCounter: number = 0;

  // Statistics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize;
  }

  /**
   * Set the terrain type for texture loading
   */
  setTerrainType(terrainType: string): void {
    if (this.terrainType !== terrainType) {
      this.terrainType = terrainType;
      // Clear cache when terrain type changes
      this.clear();
    }
  }

  /**
   * Get the current terrain type
   */
  getTerrainType(): string {
    return this.terrainType;
  }

  /**
   * Generate cache key for a texture
   */
  private getCacheKey(paletteIndex: number, zoomLevel: number): string {
    return `${this.terrainType}-${zoomLevel}-${paletteIndex}`;
  }

  /**
   * Get texture for a palette index (sync - returns cached or null)
   * Use this for fast rendering - if not cached, returns null and starts loading
   */
  getTextureSync(paletteIndex: number, zoomLevel: number): ImageBitmap | null {
    const key = this.getCacheKey(paletteIndex, zoomLevel);
    const entry = this.cache.get(key);

    if (entry && entry.texture) {
      entry.lastAccess = ++this.accessCounter;
      this.hits++;
      return entry.texture;
    }

    // Not in cache, trigger async load if not already loading
    if (!entry || !entry.loading) {
      this.loadTexture(paletteIndex, zoomLevel);
    }

    this.misses++;
    return null;
  }

  /**
   * Get texture for a palette index (async - waits for load)
   */
  async getTextureAsync(paletteIndex: number, zoomLevel: number): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(paletteIndex, zoomLevel);
    const entry = this.cache.get(key);

    if (entry) {
      entry.lastAccess = ++this.accessCounter;

      if (entry.texture) {
        this.hits++;
        return entry.texture;
      }

      if (entry.loadPromise) {
        return entry.loadPromise;
      }
    }

    this.misses++;
    return this.loadTexture(paletteIndex, zoomLevel);
  }

  /**
   * Get fallback color for a palette index
   */
  getFallbackColor(paletteIndex: number): string {
    return getFallbackColor(paletteIndex);
  }

  /**
   * Load a texture from the server
   */
  private async loadTexture(paletteIndex: number, zoomLevel: number): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(paletteIndex, zoomLevel);

    // Check if already loading
    const existing = this.cache.get(key);
    if (existing?.loadPromise) {
      return existing.loadPromise;
    }

    // Create loading entry
    const loadPromise = this.fetchTexture(paletteIndex, zoomLevel);

    this.cache.set(key, {
      texture: null,
      lastAccess: ++this.accessCounter,
      loading: true,
      loadPromise
    });

    try {
      const texture = await loadPromise;

      // Update cache entry
      const entry = this.cache.get(key);
      if (entry) {
        entry.texture = texture;
        entry.loading = false;
        entry.loadPromise = undefined;
      }

      // Evict if over capacity
      this.evictIfNeeded();

      return texture;
    } catch (error) {
      // Remove failed entry
      this.cache.delete(key);
      return null;
    }
  }

  /**
   * Fetch texture from server and convert to ImageBitmap
   */
  private async fetchTexture(paletteIndex: number, zoomLevel: number): Promise<ImageBitmap | null> {
    const url = `/api/terrain-texture/${encodeURIComponent(this.terrainType)}/${zoomLevel}/${paletteIndex}`;

    try {
      const response = await fetch(url);

      // 204 means texture not available for this palette index
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      return await createImageBitmap(blob);
    } catch (error) {
      console.warn(`[TextureCache] Failed to load texture ${paletteIndex}:`, error);
      return null;
    }
  }

  /**
   * Evict least recently used entries if cache is over capacity
   */
  private evictIfNeeded(): void {
    while (this.cache.size > this.maxSize) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;

      // Find least recently used entry (skip loading entries)
      for (const [key, entry] of this.cache) {
        if (!entry.loading && entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.cache.get(oldestKey);
        if (entry?.texture) {
          entry.texture.close(); // Release ImageBitmap resources
        }
        this.cache.delete(oldestKey);
        this.evictions++;
      } else {
        break; // No evictable entries
      }
    }
  }

  /**
   * Preload textures for a range of palette indices
   */
  async preload(paletteIndices: number[], zoomLevel: number): Promise<void> {
    const loadPromises = paletteIndices.map(index =>
      this.getTextureAsync(index, zoomLevel)
    );

    await Promise.all(loadPromises);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    // Release all ImageBitmap resources
    for (const entry of this.cache.values()) {
      if (entry.texture) {
        entry.texture.close();
      }
    }

    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.accessCounter = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hits: number; misses: number; evictions: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  /**
   * Check if a texture is cached
   */
  has(paletteIndex: number, zoomLevel: number): boolean {
    const key = this.getCacheKey(paletteIndex, zoomLevel);
    const entry = this.cache.get(key);
    return entry !== undefined && entry.texture !== null;
  }

  /**
   * Get count of loaded textures
   */
  getLoadedCount(): number {
    let count = 0;
    for (const entry of this.cache.values()) {
      if (entry.texture) {
        count++;
      }
    }
    return count;
  }
}

// Export fallback color function for use by renderer
export { getFallbackColor };
