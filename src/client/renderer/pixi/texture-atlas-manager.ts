/**
 * TextureAtlasManager - Manages texture loading and atlasing for PixiJS
 *
 * Handles:
 * - Loading individual textures from the server
 * - Creating texture atlases for batched rendering
 * - Color key transparency processing
 * - LRU caching for memory management
 */

import { Texture, Assets, BaseTexture, SCALE_MODES, Rectangle, Spritesheet } from 'pixi.js';
import { FacilityDimensions } from '../../../shared/types';

/** Texture categories */
export const enum TextureCategory {
  TERRAIN = 'terrain',
  ROAD = 'road',
  CONCRETE = 'concrete',
  BUILDING = 'building',
}

/** Loaded texture info */
interface LoadedTexture {
  texture: Texture;
  lastUsed: number;
  category: TextureCategory;
}

/** Atlas frame data */
interface AtlasFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Texture atlas manager
 */
export class TextureAtlasManager {
  // Loaded textures by key
  private textures: Map<string, LoadedTexture> = new Map();

  // Fallback textures (solid colors)
  private fallbackTextures: Map<number, Texture> = new Map();

  // Loading promises (avoid duplicate loads)
  private loadingPromises: Map<string, Promise<Texture | null>> = new Map();

  // Terrain configuration
  private currentTerrainType: string = 'Earth';
  private currentSeason: number = 2;

  // LRU cache settings
  private readonly MAX_TEXTURES = 2000;
  private readonly TERRAIN_TILE_SIZE = { width: 64, height: 32 };

  // Transparency color keys
  private readonly BUILDING_COLOR_KEY = 0x008000; // RGB(0, 128, 0) green
  private readonly DEFAULT_COLOR_KEY = 0x0000FF;  // Blue

  // Facility dimensions cache (for building name lookup)
  private facilityDimensionsCache: Map<string, FacilityDimensions> = new Map();

  /**
   * Load terrain textures for a specific terrain type and season
   */
  async loadTerrainTextures(terrainType: string, season: number): Promise<void> {
    this.currentTerrainType = terrainType;
    this.currentSeason = season;

    console.log(`[TextureAtlasManager] Loading terrain: ${terrainType}, season: ${season}`);

    // Clear old terrain textures
    this.clearCategory(TextureCategory.TERRAIN);
  }

  /**
   * Get terrain texture for a palette index
   */
  async getTerrainTexture(paletteIndex: number): Promise<Texture> {
    const key = `terrain:${this.currentTerrainType}:${this.currentSeason}:${paletteIndex}`;

    // Check cache
    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    // Check if already loading
    const existing = this.loadingPromises.get(key);
    if (existing) {
      const texture = await existing;
      return texture ?? this.getFallbackTexture(paletteIndex);
    }

    // Start loading
    const loadPromise = this.loadTerrainTextureFromServer(paletteIndex);
    this.loadingPromises.set(key, loadPromise);

    try {
      const texture = await loadPromise;
      if (texture) {
        this.textures.set(key, {
          texture,
          lastUsed: Date.now(),
          category: TextureCategory.TERRAIN
        });
        this.evictIfNeeded();
        return texture;
      }
    } finally {
      this.loadingPromises.delete(key);
    }

    return this.getFallbackTexture(paletteIndex);
  }

  /**
   * Get terrain texture synchronously (returns fallback if not loaded)
   */
  getTerrainTextureSync(paletteIndex: number): Texture {
    const key = `terrain:${this.currentTerrainType}:${this.currentSeason}:${paletteIndex}`;
    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    // Trigger async load
    this.getTerrainTexture(paletteIndex).catch(() => {});

    return this.getFallbackTexture(paletteIndex);
  }

  /**
   * Load terrain texture from server
   */
  private async loadTerrainTextureFromServer(paletteIndex: number): Promise<Texture | null> {
    const url = `/api/terrain-texture/${encodeURIComponent(this.currentTerrainType)}/${this.currentSeason}/${paletteIndex}`;

    try {
      const response = await fetch(url);
      if (!response.ok || response.status === 204) {
        return null;
      }

      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      // Apply transparency
      const transparentBitmap = await this.applyColorKeyTransparency(imageBitmap);

      // Create texture
      const texture = Texture.from(transparentBitmap);
      texture.source.scaleMode = 'nearest';

      return texture;
    } catch (error) {
      console.warn(`[TextureAtlasManager] Failed to load terrain texture ${paletteIndex}:`, error);
      return null;
    }
  }

  /**
   * Get road texture
   */
  async getRoadTexture(filename: string): Promise<Texture> {
    const key = `road:${filename}`;

    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    const existing = this.loadingPromises.get(key);
    if (existing) {
      const texture = await existing;
      return texture ?? Texture.WHITE;
    }

    const loadPromise = this.loadGameObjectTexture('RoadBlockImages', filename);
    this.loadingPromises.set(key, loadPromise);

    try {
      const texture = await loadPromise;
      if (texture) {
        this.textures.set(key, {
          texture,
          lastUsed: Date.now(),
          category: TextureCategory.ROAD
        });
        this.evictIfNeeded();
        return texture;
      }
    } finally {
      this.loadingPromises.delete(key);
    }

    return Texture.WHITE;
  }

  /**
   * Get road texture synchronously
   */
  getRoadTextureSync(filename: string): Texture | null {
    const key = `road:${filename}`;
    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    // Trigger async load
    this.getRoadTexture(filename).catch(() => {});
    return null;
  }

  /**
   * Get concrete texture
   */
  async getConcreteTexture(filename: string): Promise<Texture> {
    const key = `concrete:${filename}`;

    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    const existing = this.loadingPromises.get(key);
    if (existing) {
      const texture = await existing;
      return texture ?? Texture.WHITE;
    }

    const loadPromise = this.loadGameObjectTexture('ConcreteImages', filename);
    this.loadingPromises.set(key, loadPromise);

    try {
      const texture = await loadPromise;
      if (texture) {
        this.textures.set(key, {
          texture,
          lastUsed: Date.now(),
          category: TextureCategory.CONCRETE
        });
        this.evictIfNeeded();
        return texture;
      }
    } finally {
      this.loadingPromises.delete(key);
    }

    return Texture.WHITE;
  }

  /**
   * Get concrete texture synchronously
   */
  getConcreteTextureSync(filename: string): Texture | null {
    const key = `concrete:${filename}`;
    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    this.getConcreteTexture(filename).catch(() => {});
    return null;
  }

  /**
   * Set facility dimensions cache for building name lookup
   */
  setFacilityDimensionsCache(cache: Map<string, FacilityDimensions>): void {
    this.facilityDimensionsCache = cache;
  }

  /**
   * Get building texture
   */
  async getBuildingTexture(visualClass: string): Promise<Texture> {
    // Look up building name from facility dimensions cache
    const dims = this.facilityDimensionsCache.get(visualClass);
    const buildingName = dims?.name ?? visualClass;
    const filename = `Map${buildingName}64x32x0.gif`;
    const key = `building:${visualClass}`;

    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    const existing = this.loadingPromises.get(key);
    if (existing) {
      const texture = await existing;
      return texture ?? Texture.WHITE;
    }

    const loadPromise = this.loadBuildingTexture(filename);
    this.loadingPromises.set(key, loadPromise);

    try {
      const texture = await loadPromise;
      if (texture) {
        this.textures.set(key, {
          texture,
          lastUsed: Date.now(),
          category: TextureCategory.BUILDING
        });
        this.evictIfNeeded();
        return texture;
      }
    } finally {
      this.loadingPromises.delete(key);
    }

    return Texture.WHITE;
  }

  /**
   * Get building texture synchronously
   */
  getBuildingTextureSync(visualClass: string): Texture | null {
    const key = `building:${visualClass}`;
    const cached = this.textures.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    this.getBuildingTexture(visualClass).catch(() => {});
    return null;
  }

  /**
   * Load game object texture from server
   */
  private async loadGameObjectTexture(category: string, filename: string): Promise<Texture | null> {
    const url = `/cache/${category}/${encodeURIComponent(filename)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      // Apply transparency (detect color key from corner)
      const transparentBitmap = await this.applyColorKeyTransparency(imageBitmap);

      const texture = Texture.from(transparentBitmap);
      texture.source.scaleMode = 'nearest';

      return texture;
    } catch (error) {
      console.warn(`[TextureAtlasManager] Failed to load ${category}/${filename}:`, error);
      return null;
    }
  }

  /**
   * Load building texture with green color key
   */
  private async loadBuildingTexture(filename: string): Promise<Texture | null> {
    const url = `/cache/BuildingImages/${encodeURIComponent(filename)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      // Apply green color key transparency
      const transparentBitmap = await this.applyColorKeyTransparency(imageBitmap, this.BUILDING_COLOR_KEY);

      const texture = Texture.from(transparentBitmap);
      texture.source.scaleMode = 'nearest';

      return texture;
    } catch (error) {
      console.warn(`[TextureAtlasManager] Failed to load building ${filename}:`, error);
      return null;
    }
  }

  /**
   * Apply color key transparency to an image
   */
  private async applyColorKeyTransparency(
    imageBitmap: ImageBitmap,
    colorKey?: number
  ): Promise<ImageBitmap> {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Detect color key from corner pixel if not provided
    let keyR: number, keyG: number, keyB: number;
    if (colorKey !== undefined) {
      keyR = (colorKey >> 16) & 0xFF;
      keyG = (colorKey >> 8) & 0xFF;
      keyB = colorKey & 0xFF;
    } else {
      // Use corner pixel (0,0)
      keyR = data[0];
      keyG = data[1];
      keyB = data[2];
    }

    // Apply transparency with tolerance
    const tolerance = 5;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        Math.abs(r - keyR) <= tolerance &&
        Math.abs(g - keyG) <= tolerance &&
        Math.abs(b - keyB) <= tolerance
      ) {
        data[i + 3] = 0; // Set alpha to 0
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return createImageBitmap(canvas);
  }

  /**
   * Get fallback texture (solid color based on palette index)
   */
  private getFallbackTexture(paletteIndex: number): Texture {
    // Determine land class (bits 7-6)
    const landClass = (paletteIndex >> 6) & 0x03;

    // Generate color based on land class
    let color: number;
    switch (landClass) {
      case 0: // Grass (ZoneA)
        color = 0x4CAF50; // Green
        break;
      case 1: // MidGrass (ZoneB)
        color = 0x8BC34A; // Light green
        break;
      case 2: // DryGround (ZoneC)
        color = 0x795548; // Brown
        break;
      case 3: // Water (ZoneD)
        color = 0x2196F3; // Blue
        break;
      default:
        color = 0x9E9E9E; // Gray
    }

    // Check cache
    const cached = this.fallbackTextures.get(color);
    if (cached) return cached;

    // Create solid color texture
    const canvas = new OffscreenCanvas(64, 32);
    const ctx = canvas.getContext('2d')!;

    // Draw isometric diamond
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.moveTo(32, 0);      // Top
    ctx.lineTo(64, 16);     // Right
    ctx.lineTo(32, 32);     // Bottom
    ctx.lineTo(0, 16);      // Left
    ctx.closePath();
    ctx.fill();

    const texture = Texture.from(canvas.transferToImageBitmap());
    this.fallbackTextures.set(color, texture);
    return texture;
  }

  /**
   * Clear textures of a specific category
   */
  private clearCategory(category: TextureCategory): void {
    const toDelete: string[] = [];
    for (const [key, info] of this.textures) {
      if (info.category === category) {
        info.texture.destroy(true);
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.textures.delete(key);
    }
  }

  /**
   * Evict least recently used textures if over limit
   */
  private evictIfNeeded(): void {
    if (this.textures.size <= this.MAX_TEXTURES) return;

    // Sort by last used time
    const entries = Array.from(this.textures.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    // Remove oldest 20%
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      const [key, info] = entries[i];
      info.texture.destroy(true);
      this.textures.delete(key);
    }

    console.log(`[TextureAtlasManager] Evicted ${toRemove} textures, now ${this.textures.size}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    for (const info of this.textures.values()) {
      byCategory[info.category] = (byCategory[info.category] ?? 0) + 1;
    }
    return {
      total: this.textures.size,
      byCategory
    };
  }

  /**
   * Destroy all textures and clean up
   */
  destroy(): void {
    for (const info of this.textures.values()) {
      info.texture.destroy(true);
    }
    this.textures.clear();

    for (const texture of this.fallbackTextures.values()) {
      texture.destroy(true);
    }
    this.fallbackTextures.clear();

    this.loadingPromises.clear();
  }
}
