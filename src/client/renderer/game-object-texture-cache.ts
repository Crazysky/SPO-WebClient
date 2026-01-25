/**
 * GameObjectTextureCache
 *
 * Client-side texture cache for game objects (roads, buildings, cars, etc.)
 * Fetches textures from the server and caches them as ImageBitmap objects.
 *
 * Supported texture types:
 * - RoadBlockImages: Road textures (Roadvert.bmp, Roadhorz.bmp, etc.)
 * - BuildingImages: Building textures (Map*.gif)
 * - CarImages: Vehicle textures
 * - ConcreteImages: Concrete/pavement textures
 *
 * Transparency handling (color keying):
 * Textures are isometric diamond shapes inside square images.
 * The corners outside the diamond use "transparency key" colors:
 * - Road textures: Dynamic detection from corner pixel (0,0)
 *   Handles various background colors (blue, gray, teal for bridges, etc.)
 * - Building textures: RGB(0, 128, 0) - green background
 */

import { getFacilityDimensionsCache } from '../facility-dimensions-cache';

/**
 * Color key definitions for transparency processing
 * Used as fallback when dynamic detection isn't applicable
 */
interface ColorKey {
  r: number;
  g: number;
  b: number;
}

const TRANSPARENCY_KEYS: Record<string, ColorKey> = {
  'Building': { r: 0, g: 128, b: 0 },  // Green background for buildings
};

interface CacheEntry {
  texture: ImageBitmap | null;
  lastAccess: number;
  loading: boolean;
  loaded: boolean;
  loadPromise?: Promise<ImageBitmap | null>;
}

export type TextureCategory = 'RoadBlockImages' | 'BuildingImages' | 'CarImages' | 'ConcreteImages';

/**
 * Road texture type based on segment orientation and connections
 */
export type RoadTextureType =
  | 'Roadhorz'      // Horizontal road segment
  | 'Roadvert'      // Vertical road segment
  | 'Roadcross'     // 4-way intersection
  | 'RoadcornerN'   // Corner turning north
  | 'RoadcornerE'   // Corner turning east
  | 'RoadcornerS'   // Corner turning south
  | 'RoadcornerW'   // Corner turning west
  | 'RoadTN'        // T-junction opening north
  | 'RoadTE'        // T-junction opening east
  | 'RoadTS'        // T-junction opening south
  | 'RoadTW';       // T-junction opening west

export class GameObjectTextureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private accessCounter: number = 0;

  // Statistics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  // Callback for texture load events
  private onTextureLoadedCallback?: (category: TextureCategory, name: string) => void;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Set callback to be notified when textures are loaded
   */
  setOnTextureLoaded(callback: (category: TextureCategory, name: string) => void): void {
    this.onTextureLoadedCallback = callback;
  }

  /**
   * Generate cache key for a texture
   */
  private getCacheKey(category: TextureCategory, name: string): string {
    return `${category}/${name}`;
  }

  /**
   * Get texture synchronously (returns null if not cached, triggers async load)
   */
  getTextureSync(category: TextureCategory, name: string): ImageBitmap | null {
    const key = this.getCacheKey(category, name);
    const entry = this.cache.get(key);

    if (entry && entry.texture) {
      entry.lastAccess = ++this.accessCounter;
      this.hits++;
      return entry.texture;
    }

    // If already loaded (even if texture is null/missing), don't retry
    if (entry && entry.loaded) {
      this.misses++;
      return null;
    }

    // Not in cache, trigger async load if not already loading
    if (!entry || !entry.loading) {
      this.loadTexture(category, name);
    }

    this.misses++;
    return null;
  }

  /**
   * Get texture asynchronously (waits for load)
   */
  async getTextureAsync(category: TextureCategory, name: string): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(category, name);
    const entry = this.cache.get(key);

    if (entry) {
      entry.lastAccess = ++this.accessCounter;

      if (entry.texture) {
        this.hits++;
        return entry.texture;
      }

      if (entry.loaded) {
        this.misses++;
        return null;
      }

      if (entry.loadPromise) {
        return entry.loadPromise;
      }
    }

    this.misses++;
    return this.loadTexture(category, name);
  }

  /**
   * Load a texture from the server
   */
  private async loadTexture(category: TextureCategory, name: string): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(category, name);

    // Check if already loading
    const existing = this.cache.get(key);
    if (existing?.loadPromise) {
      return existing.loadPromise;
    }

    // Create loading entry
    const loadPromise = this.fetchTexture(category, name);

    this.cache.set(key, {
      texture: null,
      lastAccess: ++this.accessCounter,
      loading: true,
      loaded: false,
      loadPromise
    });

    try {
      const texture = await loadPromise;

      // Update cache entry
      const entry = this.cache.get(key);
      if (entry) {
        entry.texture = texture;
        entry.loading = false;
        entry.loaded = true;
        entry.loadPromise = undefined;
      }

      // Evict if over capacity
      this.evictIfNeeded();

      // Notify callback if texture loaded successfully
      if (texture && this.onTextureLoadedCallback) {
        this.onTextureLoadedCallback(category, name);
      }

      return texture;
    } catch (error) {
      // Remove failed entry
      this.cache.delete(key);
      return null;
    }
  }

  /**
   * Fetch texture from server and apply color key transparency
   */
  private async fetchTexture(category: TextureCategory, name: string): Promise<ImageBitmap | null> {
    // URL pattern: /cache/{category}/{name}
    const url = `/cache/${category}/${encodeURIComponent(name)}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const rawBitmap = await createImageBitmap(blob);

      // Check if this category uses dynamic transparency detection
      if (this.shouldUseDynamicTransparency(category)) {
        return this.applyDynamicColorKeyTransparency(rawBitmap);
      }

      // Apply static color key transparency based on texture type
      const colorKey = this.getColorKeyForTexture(category, name);
      if (colorKey) {
        return this.applyColorKeyTransparency(rawBitmap, colorKey);
      }

      return rawBitmap;
    } catch (error) {
      console.warn(`[GameObjectTextureCache] Failed to load ${category}/${name}:`, error);
      return null;
    }
  }

  /**
   * Check if a category should use dynamic corner-pixel transparency detection
   * Dynamic detection reads the corner pixel (0,0) to determine the transparency color,
   * which handles textures with varying background colors (blue, gray, teal, etc.)
   */
  private shouldUseDynamicTransparency(category: TextureCategory): boolean {
    // Road and concrete textures use various background colors (blue, gray, teal for bridges)
    // Dynamic detection handles all cases automatically
    return category === 'RoadBlockImages' || category === 'ConcreteImages';
  }

  /**
   * Determine the color key for transparency based on texture category and name
   * Returns null for categories that should use dynamic detection
   */
  private getColorKeyForTexture(category: TextureCategory, name: string): ColorKey | null {
    if (category === 'BuildingImages') {
      return TRANSPARENCY_KEYS['Building'];
    }

    // No static color key for other categories
    // RoadBlockImages uses dynamic detection
    return null;
  }

  /**
   * Apply color key transparency to an ImageBitmap
   * Replaces pixels matching the key color with transparent pixels
   */
  private async applyColorKeyTransparency(bitmap: ImageBitmap, colorKey: ColorKey): Promise<ImageBitmap> {
    // Check if OffscreenCanvas is available (not available in Node.js tests)
    if (typeof OffscreenCanvas === 'undefined') {
      return bitmap;
    }

    // Create an OffscreenCanvas to process the image
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return bitmap;
    }

    // Draw the original bitmap
    ctx.drawImage(bitmap, 0, 0);

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const data = imageData.data;

    // Replace color key pixels with transparency
    // Allow small tolerance for compression artifacts
    const tolerance = 5;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        Math.abs(r - colorKey.r) <= tolerance &&
        Math.abs(g - colorKey.g) <= tolerance &&
        Math.abs(b - colorKey.b) <= tolerance
      ) {
        data[i + 3] = 0; // Set alpha to 0 (fully transparent)
      }
    }

    // Put processed data back
    ctx.putImageData(imageData, 0, 0);

    // Close the original bitmap to free memory
    bitmap.close();

    // Create new ImageBitmap from processed canvas
    return canvas.transferToImageBitmap();
  }

  /**
   * Apply dynamic color key transparency to an ImageBitmap
   * Detects the transparency color by reading the corner pixel (0,0)
   * which is always outside the isometric diamond shape.
   *
   * This handles textures with varying background colors (blue, gray, teal for bridges, etc.)
   */
  private async applyDynamicColorKeyTransparency(bitmap: ImageBitmap): Promise<ImageBitmap> {
    // Check if OffscreenCanvas is available (not available in Node.js tests)
    if (typeof OffscreenCanvas === 'undefined') {
      return bitmap;
    }

    // Create an OffscreenCanvas to process the image
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return bitmap;
    }

    // Draw the original bitmap
    ctx.drawImage(bitmap, 0, 0);

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const data = imageData.data;

    // Detect transparency color from corner pixel (top-left corner is always outside the diamond)
    // Read pixel at (0, 0)
    const tr = data[0];
    const tg = data[1];
    const tb = data[2];

    // Tolerance for color matching (handles compression artifacts)
    const tolerance = 5;

    // Apply transparency for pixels matching the detected corner color
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        Math.abs(r - tr) <= tolerance &&
        Math.abs(g - tg) <= tolerance &&
        Math.abs(b - tb) <= tolerance
      ) {
        data[i + 3] = 0; // Set alpha to 0 (fully transparent)
      }
    }

    // Put processed data back
    ctx.putImageData(imageData, 0, 0);

    // Close the original bitmap to free memory
    bitmap.close();

    // Create new ImageBitmap from processed canvas
    return canvas.transferToImageBitmap();
  }

  /**
   * Evict least recently used entries if cache is over capacity
   */
  private evictIfNeeded(): void {
    while (this.cache.size > this.maxSize) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;

      for (const [key, entry] of this.cache) {
        if (!entry.loading && entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.cache.get(oldestKey);
        if (entry?.texture) {
          entry.texture.close();
        }
        this.cache.delete(oldestKey);
        this.evictions++;
      } else {
        break;
      }
    }
  }

  /**
   * Preload textures for a list of names
   */
  async preload(category: TextureCategory, names: string[]): Promise<void> {
    const loadPromises = names.map(name =>
      this.getTextureAsync(category, name)
    );
    await Promise.all(loadPromises);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
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
   * Get road texture type based on segment neighbors
   * Analyzes adjacent road tiles to determine the correct texture variant
   */
  static getRoadTextureType(
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): RoadTextureType {
    const count = [hasNorth, hasEast, hasSouth, hasWest].filter(Boolean).length;

    if (count === 4) {
      return 'Roadcross';
    }

    if (count === 3) {
      // T-junction - opening towards the missing direction
      if (!hasNorth) return 'RoadTS';  // Opening to south
      if (!hasEast) return 'RoadTW';   // Opening to west
      if (!hasSouth) return 'RoadTN';  // Opening to north
      if (!hasWest) return 'RoadTE';   // Opening to east
    }

    if (count === 2) {
      // Straight roads
      if (hasNorth && hasSouth) return 'Roadvert';
      if (hasEast && hasWest) return 'Roadhorz';

      // Corners - based on official client transition tables:
      // The corner name indicates the "missing" direction in the L-shape
      // In isometric view, this creates diagonal staircase patterns
      if (hasNorth && hasEast) return 'RoadcornerW';  // L-shape: road from N and E
      if (hasEast && hasSouth) return 'RoadcornerN';  // L-shape: road from E and S
      if (hasSouth && hasWest) return 'RoadcornerE';  // L-shape: road from S and W
      if (hasWest && hasNorth) return 'RoadcornerS';  // L-shape: road from W and N
    }

    // Single connection or no connections - default to vertical
    if (hasNorth || hasSouth) return 'Roadvert';
    return 'Roadhorz';
  }

  /**
   * Get the BMP filename for a road texture type
   */
  static getRoadTextureFilename(type: RoadTextureType): string {
    return `${type}.bmp`;
  }

  /**
   * Get building texture filename from visualClass
   * Looks up the correct texture filename from the facility dimensions cache.
   * Falls back to a generated pattern if the building is not found in cache.
   *
   * @param visualClass - The runtime VisualClass from ObjectsInArea
   * @returns The correct texture filename (e.g., "MapPGIFoodStore64x32x0.gif")
   */
  static getBuildingTextureFilename(visualClass: string): string {
    // Look up in facility dimensions cache for correct texture filename
    const cache = getFacilityDimensionsCache();
    const facility = cache.getFacility(visualClass);

    if (facility?.textureFilename) {
      return facility.textureFilename;
    }

    // Fallback: generate pattern for unknown buildings
    // This handles buildings not yet in our database
    console.warn(`[GameObjectTextureCache] Unknown visualClass ${visualClass}, using fallback pattern`);
    return `Map${visualClass}64x32x0.gif`;
  }

  /**
   * Get construction texture filename based on building size
   * Construction textures are shared across all buildings based on their footprint size.
   *
   * @param visualClass - The runtime VisualClass from ObjectsInArea
   * @returns Construction texture filename (e.g., "Construction64.gif")
   */
  static getConstructionTextureFilename(visualClass: string): string {
    const cache = getFacilityDimensionsCache();
    const facility = cache.getFacility(visualClass);

    if (facility?.constructionTextureFilename) {
      return facility.constructionTextureFilename;
    }

    // Fallback to default construction texture
    return 'Construction64.gif';
  }

  /**
   * Get empty residential texture filename
   * Used for residential buildings that have no occupants.
   *
   * @param visualClass - The runtime VisualClass from ObjectsInArea
   * @returns Empty texture filename or undefined if not a residential building
   */
  static getEmptyTextureFilename(visualClass: string): string | undefined {
    const cache = getFacilityDimensionsCache();
    const facility = cache.getFacility(visualClass);

    return facility?.emptyTextureFilename;
  }
}
