/**
 * TextureAtlasManager
 *
 * Manages texture atlases for GPU-efficient batched rendering in Three.js.
 * Combines multiple terrain textures into a single atlas texture for
 * minimal draw calls with instanced meshes.
 *
 * Atlas Layout:
 * - 16x16 grid = 256 texture slots (one per palette index)
 * - Each slot: 64x32 pixels (standard isometric tile)
 * - Total atlas: 1024x512 pixels
 *
 * Features:
 * - Dynamic atlas building from server textures
 * - Color-key transparency (corner pixel detection)
 * - Season support (separate atlas per season)
 * - Fallback colors for missing textures
 * - UV coordinate calculation for any palette index
 */

import * as THREE from 'three';
import { Season, SEASON_NAMES } from '../../../shared/map-config';
import { LandClass, landClassOf } from '../../../shared/land-utils';

// Atlas configuration
const ATLAS_COLS = 16;  // 16 textures per row
const ATLAS_ROWS = 16;  // 16 rows = 256 total slots
const TILE_WIDTH = 64;  // Pixels per tile width
const TILE_HEIGHT = 32; // Pixels per tile height
const ATLAS_WIDTH = ATLAS_COLS * TILE_WIDTH;   // 1024 pixels
const ATLAS_HEIGHT = ATLAS_ROWS * TILE_HEIGHT; // 512 pixels

// Tolerance for color key matching
const COLOR_KEY_TOLERANCE = 5;

/**
 * UV coordinates for a texture slot in the atlas
 */
export interface AtlasUV {
  u0: number;  // Left edge (0-1)
  v0: number;  // Top edge (0-1)
  u1: number;  // Right edge (0-1)
  v1: number;  // Bottom edge (0-1)
}

/**
 * Generate a fallback color for terrain based on landId
 */
function getFallbackColor(paletteIndex: number): { r: number; g: number; b: number } {
  const landClass = landClassOf(paletteIndex);

  switch (landClass) {
    case LandClass.ZoneD: // Water
      return { r: 26, g: 58, b: 92 };
    case LandClass.ZoneC: // DryGround
      return { r: 139, g: 115, b: 85 };
    case LandClass.ZoneB: // MidGrass
      return { r: 107, g: 148, b: 96 };
    case LandClass.ZoneA: // Grass
    default:
      return { r: 90, g: 140, b: 79 };
  }
}

export class TextureAtlasManager {
  private terrainType: string = 'Earth';
  private currentSeason: Season = Season.SUMMER;

  // Atlas textures per season
  private atlases: Map<Season, THREE.CanvasTexture> = new Map();

  // Canvas for building atlases
  private atlasCanvas: OffscreenCanvas | HTMLCanvasElement;
  private atlasCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  // Track which slots are loaded
  private loadedSlots: Map<Season, Set<number>> = new Map();

  // Loading state
  private loadingPromises: Map<string, Promise<void>> = new Map();

  // Callback when atlas is updated
  private onAtlasUpdated: (() => void) | null = null;

  constructor() {
    // Create canvas for atlas building
    if (typeof OffscreenCanvas !== 'undefined') {
      this.atlasCanvas = new OffscreenCanvas(ATLAS_WIDTH, ATLAS_HEIGHT);
      this.atlasCtx = this.atlasCanvas.getContext('2d')!;
    } else {
      // Fallback for environments without OffscreenCanvas
      this.atlasCanvas = document.createElement('canvas');
      this.atlasCanvas.width = ATLAS_WIDTH;
      this.atlasCanvas.height = ATLAS_HEIGHT;
      this.atlasCtx = this.atlasCanvas.getContext('2d')!;
    }
  }

  /**
   * Set the terrain type (e.g., 'Earth', 'Alien Swamp')
   */
  setTerrainType(terrainType: string): void {
    if (this.terrainType !== terrainType) {
      this.terrainType = terrainType;
      // Clear all atlases when terrain type changes
      this.clearAllAtlases();
      console.log(`[TextureAtlasManager] Terrain type set to: ${terrainType}`);
    }
  }

  /**
   * Set the current season
   */
  setSeason(season: Season): void {
    this.currentSeason = season;
  }

  /**
   * Get the current season
   */
  getSeason(): Season {
    return this.currentSeason;
  }

  /**
   * Set callback for atlas updates
   */
  setOnAtlasUpdated(callback: () => void): void {
    this.onAtlasUpdated = callback;
  }

  /**
   * Get or create the atlas texture for the current season
   */
  getAtlasTexture(): THREE.CanvasTexture {
    let atlas = this.atlases.get(this.currentSeason);

    if (!atlas) {
      atlas = this.createEmptyAtlas();
      this.atlases.set(this.currentSeason, atlas);
      this.loadedSlots.set(this.currentSeason, new Set());
    }

    return atlas;
  }

  /**
   * Create an empty atlas texture with fallback colors
   */
  private createEmptyAtlas(): THREE.CanvasTexture {
    // Clear canvas
    this.atlasCtx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);

    // Fill each slot with fallback color
    for (let paletteIndex = 0; paletteIndex < 256; paletteIndex++) {
      const col = paletteIndex % ATLAS_COLS;
      const row = Math.floor(paletteIndex / ATLAS_COLS);
      const x = col * TILE_WIDTH;
      const y = row * TILE_HEIGHT;

      const color = getFallbackColor(paletteIndex);
      this.atlasCtx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      this.atlasCtx.fillRect(x, y, TILE_WIDTH, TILE_HEIGHT);
    }

    // Create Three.js texture from canvas
    const texture = new THREE.CanvasTexture(this.atlasCanvas as HTMLCanvasElement);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Get UV coordinates for a palette index
   */
  getUV(paletteIndex: number): AtlasUV {
    const col = paletteIndex % ATLAS_COLS;
    const row = Math.floor(paletteIndex / ATLAS_COLS);

    return {
      u0: col / ATLAS_COLS,
      v0: row / ATLAS_ROWS,
      u1: (col + 1) / ATLAS_COLS,
      v1: (row + 1) / ATLAS_ROWS
    };
  }

  /**
   * Load a texture into the atlas at the given palette index
   */
  async loadTexture(paletteIndex: number): Promise<void> {
    const season = this.currentSeason;
    const key = `${this.terrainType}-${season}-${paletteIndex}`;

    // Check if already loaded or loading
    const loaded = this.loadedSlots.get(season);
    if (loaded?.has(paletteIndex)) {
      return;
    }

    // Check if already loading
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key);
    }

    console.log(`[TextureAtlasManager] Loading texture ${paletteIndex} for ${this.terrainType}/${season}`);

    // Start loading
    const loadPromise = this.fetchAndPlaceTexture(paletteIndex, season);
    this.loadingPromises.set(key, loadPromise);

    try {
      await loadPromise;
    } finally {
      this.loadingPromises.delete(key);
    }
  }

  /**
   * Fetch texture from server and place it in the atlas
   */
  private async fetchAndPlaceTexture(paletteIndex: number, season: Season): Promise<void> {
    const url = `/api/terrain-texture/${encodeURIComponent(this.terrainType)}/${season}/${paletteIndex}`;

    console.log(`[TextureAtlasManager] Fetching texture from: ${url}`);

    try {
      const response = await fetch(url);

      console.log(`[TextureAtlasManager] Response status for ${paletteIndex}: ${response.status}`);

      // 204 means texture not available
      if (response.status === 204 || !response.ok) {
        console.log(`[TextureAtlasManager] Texture ${paletteIndex} not available (status ${response.status})`);
        return;
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      console.log(`[TextureAtlasManager] Texture ${paletteIndex} loaded, size: ${bitmap.width}x${bitmap.height}`);

      // Apply color-key transparency
      const processedBitmap = await this.applyColorKeyTransparency(bitmap);

      // Place in atlas
      this.placeTextureInAtlas(paletteIndex, processedBitmap, season);

      // Mark as loaded
      let loaded = this.loadedSlots.get(season);
      if (!loaded) {
        loaded = new Set();
        this.loadedSlots.set(season, loaded);
      }
      loaded.add(paletteIndex);

      // Update Three.js texture
      const atlas = this.atlases.get(season);
      if (atlas) {
        atlas.needsUpdate = true;
      }

      console.log(`[TextureAtlasManager] Texture ${paletteIndex} successfully placed in atlas`);

      // Notify listeners
      if (this.onAtlasUpdated) {
        this.onAtlasUpdated();
      }

    } catch (error) {
      // Texture not available, keep fallback color
      console.error(`[TextureAtlasManager] Error loading texture ${paletteIndex}:`, error);
    }
  }

  /**
   * Place a texture bitmap into the atlas at the given palette index
   */
  private placeTextureInAtlas(
    paletteIndex: number,
    bitmap: ImageBitmap,
    season: Season
  ): void {
    const col = paletteIndex % ATLAS_COLS;
    const row = Math.floor(paletteIndex / ATLAS_COLS);
    const x = col * TILE_WIDTH;
    const y = row * TILE_HEIGHT;

    // Draw the texture into the atlas
    this.atlasCtx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, x, y, TILE_WIDTH, TILE_HEIGHT);

    // Close bitmap to free memory
    bitmap.close();
  }

  /**
   * Apply color-key transparency to a texture
   * Detects the transparency color from the corner pixel (0,0)
   */
  private async applyColorKeyTransparency(bitmap: ImageBitmap): Promise<ImageBitmap> {
    if (typeof OffscreenCanvas === 'undefined') {
      return bitmap;
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return bitmap;
    }

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const data = imageData.data;

    // Detect transparency color from corner pixel
    const tr = data[0];
    const tg = data[1];
    const tb = data[2];

    // Apply transparency
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        Math.abs(r - tr) <= COLOR_KEY_TOLERANCE &&
        Math.abs(g - tg) <= COLOR_KEY_TOLERANCE &&
        Math.abs(b - tb) <= COLOR_KEY_TOLERANCE
      ) {
        data[i + 3] = 0; // Set alpha to 0
      }
    }

    ctx.putImageData(imageData, 0, 0);
    bitmap.close();

    return canvas.transferToImageBitmap();
  }

  /**
   * Preload textures for a range of palette indices
   */
  async preloadTextures(paletteIndices: number[]): Promise<void> {
    const loadPromises = paletteIndices.map(index => this.loadTexture(index));
    await Promise.all(loadPromises);
  }

  /**
   * Preload all terrain textures (0-255)
   */
  async preloadAllTextures(): Promise<void> {
    const indices = Array.from({ length: 256 }, (_, i) => i);
    await this.preloadTextures(indices);
  }

  /**
   * Check if a texture slot is loaded
   */
  isTextureLoaded(paletteIndex: number): boolean {
    const loaded = this.loadedSlots.get(this.currentSeason);
    return loaded?.has(paletteIndex) ?? false;
  }

  /**
   * Get count of loaded textures for current season
   */
  getLoadedCount(): number {
    const loaded = this.loadedSlots.get(this.currentSeason);
    return loaded?.size ?? 0;
  }

  /**
   * Clear atlas for the current season
   */
  clearCurrentAtlas(): void {
    const atlas = this.atlases.get(this.currentSeason);
    if (atlas) {
      atlas.dispose();
      this.atlases.delete(this.currentSeason);
    }
    this.loadedSlots.delete(this.currentSeason);
  }

  /**
   * Clear all atlases
   */
  clearAllAtlases(): void {
    for (const atlas of this.atlases.values()) {
      atlas.dispose();
    }
    this.atlases.clear();
    this.loadedSlots.clear();
    this.loadingPromises.clear();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearAllAtlases();
  }

  // Static getters for atlas dimensions
  static getAtlasWidth(): number {
    return ATLAS_WIDTH;
  }

  static getAtlasHeight(): number {
    return ATLAS_HEIGHT;
  }

  static getTileWidth(): number {
    return TILE_WIDTH;
  }

  static getTileHeight(): number {
    return TILE_HEIGHT;
  }

  static getAtlasCols(): number {
    return ATLAS_COLS;
  }

  static getAtlasRows(): number {
    return ATLAS_ROWS;
  }
}
