/**
 * TerrainChunkRenderer
 *
 * Server-side terrain chunk pre-rendering. Composites isometric terrain chunks
 * from the terrain atlas PNG and map BMP data, producing PNG images that the
 * client can load directly instead of rendering tiles client-side.
 *
 * Architecture:
 * - Loads terrain atlas PNGs into raw RGBA buffers at initialization
 * - Loads map BMPs lazily as raw palette index arrays
 * - Generates 32×32-tile isometric chunks at ALL zoom levels (0-3)
 * - Zoom 3 rendered from atlas tiles; zoom 2/1/0 downscaled from zoom 3
 * - Pre-generates ALL chunks for all maps/seasons at startup (background)
 * - Caches generated chunk PNGs to disk for persistence across restarts
 * - All vegetation/special tiles are flattened (landId & 0xC0)
 *
 * No Canvas API needed — all compositing uses raw RGBA Buffer operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { decodePng, decodeBmpIndices, encodePng, downscaleRGBA2x, PngData } from './texture-alpha-baker';
import { AtlasManifest, TileEntry } from './atlas-generator';
import { isSpecialTile } from '../shared/land-utils';
import { Season, SEASON_NAMES, getTerrainTypeForMap } from '../shared/map-config';
import type { Service } from './service-registry';

// ============================================================================
// Constants (must match client chunk-cache.ts)
// ============================================================================

/** Tiles per chunk dimension */
export const CHUNK_SIZE = 32;

/** Zoom level 3 configuration (base resolution) */
const ZOOM3_U = 32;
const ZOOM3_TILE_WIDTH = 64;
const ZOOM3_TILE_HEIGHT = 32;
const ZOOM3_HALF_WIDTH = ZOOM3_TILE_WIDTH / 2; // 32

/** Chunk canvas dimensions at zoom level 3 */
export const CHUNK_CANVAS_WIDTH = ZOOM3_U * (2 * CHUNK_SIZE - 1) + ZOOM3_TILE_WIDTH;   // 2080
export const CHUNK_CANVAS_HEIGHT = (ZOOM3_U / 2) * (2 * CHUNK_SIZE - 1) + ZOOM3_TILE_HEIGHT; // 1040

/** Maximum zoom level (base resolution) */
const MAX_ZOOM = 3;

/** Bit mask to extract LandClass only (Center, variant 0) — flattens vegetation */
const FLAT_MASK = 0xC0;

// ============================================================================
// Types
// ============================================================================

/** Decoded atlas data held in memory for fast pixel access */
interface AtlasPixelData {
  width: number;
  height: number;
  pixels: Buffer;           // RGBA, 4 bytes per pixel
  manifest: AtlasManifest;
}

/** Map data held in memory */
interface MapPixelData {
  width: number;
  height: number;
  indices: Uint8Array;      // Raw 8-bit palette indices
}

/** Chunk manifest returned by the manifest endpoint */
export interface ChunkManifest {
  mapName: string;
  terrainType: string;
  season: number;
  seasonName: string;
  mapWidth: number;
  mapHeight: number;
  chunkSize: number;
  chunksI: number;
  chunksJ: number;
  chunkWidth: number;
  chunkHeight: number;
  zoomLevel: number;
  tileWidth: number;
  tileHeight: number;
  u: number;
  zoomLevels: number[];
}

// ============================================================================
// Tile position formula (must match client chunk-cache.ts)
// ============================================================================

/**
 * Calculate the screen offset for a tile within a chunk's local canvas.
 * Exact replica of client-side getTileScreenPosInChunk().
 */
export function getTileScreenPosInChunk(localI: number, localJ: number): { x: number; y: number } {
  return {
    x: ZOOM3_U * (CHUNK_SIZE - localI + localJ),
    y: (ZOOM3_U / 2) * ((CHUNK_SIZE - localI) + (CHUNK_SIZE - localJ))
  };
}

// ============================================================================
// Alpha blending
// ============================================================================

/**
 * Blit a tile from the atlas onto the chunk buffer with alpha blending.
 * Direct RGBA pixel copy — no Canvas API needed.
 */
export function blitTileWithAlpha(
  srcPixels: Buffer, srcStride: number,
  srcX: number, srcY: number,
  srcW: number, srcH: number,
  dstPixels: Buffer, dstStride: number, dstHeight: number,
  dstX: number, dstY: number
): void {
  for (let y = 0; y < srcH; y++) {
    const dy = dstY + y;
    if (dy < 0 || dy >= dstHeight) continue;

    for (let x = 0; x < srcW; x++) {
      const dx = dstX + x;
      if (dx < 0 || dx >= dstStride) continue;

      const srcIdx = ((srcY + y) * srcStride + (srcX + x)) * 4;
      const dstIdx = (dy * dstStride + dx) * 4;

      const srcA = srcPixels[srcIdx + 3];
      if (srcA === 0) continue; // Fully transparent, skip

      if (srcA === 255) {
        // Fully opaque — direct copy (fast path)
        dstPixels[dstIdx] = srcPixels[srcIdx];
        dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
        dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
        dstPixels[dstIdx + 3] = 255;
      } else {
        // Semi-transparent — alpha blend
        const invA = 255 - srcA;
        dstPixels[dstIdx] = (srcPixels[srcIdx] * srcA + dstPixels[dstIdx] * invA + 127) / 255 | 0;
        dstPixels[dstIdx + 1] = (srcPixels[srcIdx + 1] * srcA + dstPixels[dstIdx + 1] * invA + 127) / 255 | 0;
        dstPixels[dstIdx + 2] = (srcPixels[srcIdx + 2] * srcA + dstPixels[dstIdx + 2] * invA + 127) / 255 | 0;
        dstPixels[dstIdx + 3] = Math.min(255, dstPixels[dstIdx + 3] + srcA);
      }
    }
  }
}

// ============================================================================
// TerrainChunkRenderer Service
// ============================================================================

export class TerrainChunkRenderer implements Service {
  public readonly name = 'terrainChunks';

  /** Decoded atlas RGBA data: "terrainType-season" → AtlasPixelData */
  private atlasData: Map<string, AtlasPixelData> = new Map();

  /** Map palette indices: "mapName" → MapPixelData */
  private mapData: Map<string, MapPixelData> = new Map();

  /** Root directory for disk cache */
  private cacheDir: string;

  /** Root directory for map BMPs */
  private mapCacheDir: string;

  /** Root directory for texture atlases */
  private textureDir: string;

  /** Dedup in-flight chunk generation */
  private generating: Map<string, Promise<Buffer | null>> = new Map();

  /** Background pre-generation state */
  private preGenerating: boolean = false;

  /** Set to true before initialize() to skip background pre-generation (for tests) */
  public skipPreGeneration: boolean = false;

  constructor(
    cacheDir: string = path.join(__dirname, '../../webclient-cache'),
    mapCacheDir: string = path.join(__dirname, '../../cache'),
    textureDir: string = path.join(__dirname, '../../webclient-cache/textures')
  ) {
    this.cacheDir = cacheDir;
    this.mapCacheDir = mapCacheDir;
    this.textureDir = textureDir;
  }

  /**
   * Initialize: load available atlas PNGs into memory, then start background pre-generation.
   * Called by ServiceRegistry after textures service is ready.
   */
  async initialize(): Promise<void> {
    console.log('[TerrainChunkRenderer] Initializing...');

    // Discover available terrain types and seasons from texture directory
    if (!fs.existsSync(this.textureDir)) {
      console.warn('[TerrainChunkRenderer] Texture directory not found, skipping atlas loading');
      return;
    }

    const terrainTypes = fs.readdirSync(this.textureDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    let loadedCount = 0;

    for (const terrainType of terrainTypes) {
      const terrainDir = path.join(this.textureDir, terrainType);
      const seasons = fs.readdirSync(terrainDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d$/.test(e.name))
        .map(e => parseInt(e.name, 10) as Season);

      for (const season of seasons) {
        const loaded = this.loadAtlas(terrainType, season);
        if (loaded) loadedCount++;
      }
    }

    // Ensure chunk cache root exists
    const chunkRoot = path.join(this.cacheDir, 'chunks');
    if (!fs.existsSync(chunkRoot)) {
      fs.mkdirSync(chunkRoot, { recursive: true });
    }

    console.log(`[TerrainChunkRenderer] Loaded ${loadedCount} terrain atlases`);

    // Start background pre-generation (fire-and-forget, non-blocking)
    if (!this.skipPreGeneration) {
      this.preGenerateAllChunks();
    }
  }

  /**
   * Load a terrain atlas PNG + manifest into memory.
   * @returns true if successfully loaded
   */
  loadAtlas(terrainType: string, season: number): boolean {
    const atlasPath = path.join(this.textureDir, terrainType, String(season), 'atlas.png');
    const manifestPath = path.join(this.textureDir, terrainType, String(season), 'atlas.json');

    if (!fs.existsSync(atlasPath) || !fs.existsSync(manifestPath)) {
      return false;
    }

    try {
      const pngBuffer = fs.readFileSync(atlasPath);
      const pngData: PngData = decodePng(pngBuffer);

      const manifestJson = fs.readFileSync(manifestPath, 'utf-8');
      const manifest: AtlasManifest = JSON.parse(manifestJson);

      const key = `${terrainType}-${season}`;
      this.atlasData.set(key, {
        width: pngData.width,
        height: pngData.height,
        pixels: pngData.pixels,
        manifest
      });

      console.log(`[TerrainChunkRenderer] Loaded atlas: ${terrainType}/${SEASON_NAMES[season as Season]} (${Object.keys(manifest.tiles).length} tiles, ${pngData.width}x${pngData.height})`);
      return true;
    } catch (error) {
      console.error(`[TerrainChunkRenderer] Failed to load atlas ${terrainType}/${season}:`, error);
      return false;
    }
  }

  /**
   * Load map BMP data (palette indices) into memory.
   * Called lazily on first chunk request for a map.
   */
  loadMapData(mapName: string): boolean {
    if (this.mapData.has(mapName)) return true;

    const bmpPath = path.join(this.mapCacheDir, 'Maps', mapName, `${mapName}.bmp`);

    if (!fs.existsSync(bmpPath)) {
      console.error(`[TerrainChunkRenderer] Map BMP not found: ${bmpPath}`);
      return false;
    }

    try {
      const bmpBuffer = fs.readFileSync(bmpPath);
      const data = decodeBmpIndices(bmpBuffer);

      this.mapData.set(mapName, {
        width: data.width,
        height: data.height,
        indices: data.indices
      });

      console.log(`[TerrainChunkRenderer] Loaded map data: ${mapName} (${data.width}x${data.height})`);
      return true;
    } catch (error) {
      console.error(`[TerrainChunkRenderer] Failed to load map ${mapName}:`, error);
      return false;
    }
  }

  /**
   * Get or generate a chunk PNG buffer at a specific zoom level.
   * Checks disk cache first, generates on-demand if not cached.
   */
  async getChunk(
    mapName: string,
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number,
    zoomLevel: number = MAX_ZOOM
  ): Promise<Buffer | null> {
    const t0 = Date.now();

    // Check disk cache
    const cachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);

    if (fs.existsSync(cachePath)) {
      const result = fs.readFileSync(cachePath);
      const dt = Date.now() - t0;
      if (dt > 10) {
        console.log(`[TerrainChunkRenderer] disk-cache z${zoomLevel} ${chunkI},${chunkJ}: ${dt}ms (${(result.length / 1024).toFixed(0)} KB)`);
      }
      return result;
    }

    // Dedup in-flight generation
    const genKey = `${mapName}-${terrainType}-${season}-z${zoomLevel}-${chunkI}-${chunkJ}`;
    const existing = this.generating.get(genKey);
    if (existing) return existing;

    const promise = this._generateAndCacheZoom(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);
    this.generating.set(genKey, promise);

    try {
      const result = await promise;
      const dt = Date.now() - t0;
      console.log(`[TerrainChunkRenderer] generate z${zoomLevel} ${chunkI},${chunkJ}: ${dt}ms (${result ? (result.length / 1024).toFixed(0) + ' KB' : 'null'})`);
      return result;
    } finally {
      this.generating.delete(genKey);
    }
  }

  /**
   * Generate and cache a chunk at a specific zoom level.
   * For zoom 3: renders from atlas tiles.
   * For zoom < 3: gets zoom-3 RGBA, then cascades downscale.
   */
  private async _generateAndCacheZoom(
    mapName: string,
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number,
    zoomLevel: number
  ): Promise<Buffer | null> {
    if (!this.loadMapData(mapName)) return null;

    let pixels: Buffer | null;
    let width: number;
    let height: number;

    if (zoomLevel === MAX_ZOOM) {
      // Zoom 3: render from atlas
      pixels = this.generateChunkRGBA(terrainType, season, chunkI, chunkJ, mapName);
      width = CHUNK_CANVAS_WIDTH;
      height = CHUNK_CANVAS_HEIGHT;
    } else {
      // Zoom < 3: get zoom-3 chunk RGBA, then downscale
      // First check if zoom-3 PNG is cached on disk
      const z3CachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, MAX_ZOOM);
      let z3Pixels: Buffer | null = null;
      let z3W = CHUNK_CANVAS_WIDTH;
      let z3H = CHUNK_CANVAS_HEIGHT;

      if (fs.existsSync(z3CachePath)) {
        // Decode from cached PNG
        const pngBuf = fs.readFileSync(z3CachePath);
        const decoded = decodePng(pngBuf);
        z3Pixels = decoded.pixels;
        z3W = decoded.width;
        z3H = decoded.height;
      } else {
        // Generate zoom-3 from atlas and cache it
        z3Pixels = this.generateChunkRGBA(terrainType, season, chunkI, chunkJ, mapName);
        if (z3Pixels) {
          const z3Png = encodePng(z3W, z3H, z3Pixels);
          const z3Dir = path.dirname(z3CachePath);
          if (!fs.existsSync(z3Dir)) fs.mkdirSync(z3Dir, { recursive: true });
          fs.writeFileSync(z3CachePath, z3Png);
        }
      }

      if (!z3Pixels) return null;

      // Cascade downscale from zoom 3 to target zoom
      pixels = z3Pixels;
      width = z3W;
      height = z3H;
      for (let z = MAX_ZOOM - 1; z >= zoomLevel; z--) {
        const scaled = downscaleRGBA2x(pixels, width, height);
        pixels = scaled.pixels;
        width = scaled.width;
        height = scaled.height;
      }
    }

    if (!pixels) return null;

    // Encode as PNG
    const png = encodePng(width, height, pixels);

    // Write to disk cache
    const cachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);
    const cacheDir = path.dirname(cachePath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, png);

    return png;
  }

  /**
   * Generate a single chunk as RGBA pixel buffer at zoom level 3.
   * This is the core rendering algorithm — replicates client chunk-cache.ts formulas.
   * Returns raw RGBA pixels (not PNG) for reuse in downscaling.
   */
  generateChunkRGBA(
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number,
    mapName: string
  ): Buffer | null {
    // Get atlas data
    const atlasKey = `${terrainType}-${season}`;
    const atlas = this.atlasData.get(atlasKey);
    if (!atlas) {
      return null;
    }

    // Get map data
    const map = this.mapData.get(mapName);
    if (!map) {
      return null;
    }

    // Allocate chunk RGBA buffer (transparent initially)
    const pixels = Buffer.alloc(CHUNK_CANVAS_WIDTH * CHUNK_CANVAS_HEIGHT * 4, 0);

    // Calculate tile range for this chunk
    const startI = chunkI * CHUNK_SIZE;
    const startJ = chunkJ * CHUNK_SIZE;
    const endI = Math.min(startI + CHUNK_SIZE, map.height);
    const endJ = Math.min(startJ + CHUNK_SIZE, map.width);

    // Render tiles (same iteration order as client)
    for (let i = startI; i < endI; i++) {
      for (let j = startJ; j < endJ; j++) {
        // Get texture ID and flatten vegetation
        let textureId = map.indices[i * map.width + j];
        if (isSpecialTile(textureId)) {
          textureId = textureId & FLAT_MASK;
        }

        // Get tile source rect from atlas manifest
        const tileEntry = atlas.manifest.tiles[String(textureId)];
        if (!tileEntry) continue; // Skip missing tiles

        // Calculate tile position in chunk canvas
        const localI = i - startI;
        const localJ = j - startJ;
        const screenPos = getTileScreenPosInChunk(localI, localJ);
        const destX = screenPos.x - ZOOM3_HALF_WIDTH;
        const destY = screenPos.y;

        // Alpha-blend tile pixels from atlas onto chunk buffer
        blitTileWithAlpha(
          atlas.pixels, atlas.width,
          tileEntry.x, tileEntry.y,
          tileEntry.width, tileEntry.height,
          pixels, CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT,
          destX, destY
        );
      }
    }

    return pixels;
  }

  /**
   * Generate ALL zoom levels for a single chunk and cache to disk.
   * Renders zoom 3 from atlas, then cascades 2× downscale for 2→1→0.
   */
  generateChunkAllZooms(
    mapName: string,
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number
  ): boolean {
    // Generate zoom-3 RGBA
    const z3Pixels = this.generateChunkRGBA(terrainType, season, chunkI, chunkJ, mapName);
    if (!z3Pixels) return false;

    // Encode and cache zoom 3
    const z3Png = encodePng(CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT, z3Pixels);
    this._writeChunkCache(mapName, terrainType, season, chunkI, chunkJ, MAX_ZOOM, z3Png);

    // Cascade downscale: 3→2→1→0
    let pixels = z3Pixels;
    let width = CHUNK_CANVAS_WIDTH;
    let height = CHUNK_CANVAS_HEIGHT;

    for (let z = MAX_ZOOM - 1; z >= 0; z--) {
      const scaled = downscaleRGBA2x(pixels, width, height);
      pixels = scaled.pixels;
      width = scaled.width;
      height = scaled.height;

      const png = encodePng(width, height, pixels);
      this._writeChunkCache(mapName, terrainType, season, chunkI, chunkJ, z, png);
    }

    return true;
  }

  /**
   * Write a chunk PNG to the disk cache.
   */
  private _writeChunkCache(
    mapName: string, terrainType: string, season: number,
    chunkI: number, chunkJ: number, zoomLevel: number,
    png: Buffer
  ): void {
    const cachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, png);
  }

  /**
   * Pre-generate ALL chunks for all available maps and zoom levels.
   * Runs in the background via setImmediate to avoid blocking the server.
   */
  private preGenerateAllChunks(): void {
    if (this.preGenerating) return;
    this.preGenerating = true;

    // Discover available maps by scanning cache/Maps/
    const mapsDir = path.join(this.mapCacheDir, 'Maps');
    if (!fs.existsSync(mapsDir)) {
      console.log('[TerrainChunkRenderer] No maps directory found, skipping pre-generation');
      this.preGenerating = false;
      return;
    }

    // TESTING: only pre-generate for these maps
    const PREGENERATE_MAPS = new Set(['Shamba', 'Zorcon', 'Angelicus']);

    const mapDirs = fs.readdirSync(mapsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => {
        if (!PREGENERATE_MAPS.has(name)) return false;
        const bmpPath = path.join(mapsDir, name, `${name}.bmp`);
        return fs.existsSync(bmpPath);
      });

    if (mapDirs.length === 0) {
      console.log('[TerrainChunkRenderer] No maps with BMPs found, skipping pre-generation');
      this.preGenerating = false;
      return;
    }

    // Build work list: (mapName, terrainType, season)[]
    const workItems: Array<{ mapName: string; terrainType: string; season: number }> = [];

    for (const mapName of mapDirs) {
      const terrainType = getTerrainTypeForMap(mapName);
      // Find which seasons have atlases loaded for this terrain type
      for (let s = 0; s <= 3; s++) {
        if (this.hasAtlas(terrainType, s)) {
          workItems.push({ mapName, terrainType, season: s });
        }
      }
    }

    console.log(`[TerrainChunkRenderer] Pre-generation: ${mapDirs.length} maps, ${workItems.length} map/season combos`);

    // Process work items one at a time via setImmediate
    let itemIdx = 0;
    const processNextItem = () => {
      if (itemIdx >= workItems.length) {
        console.log(`[TerrainChunkRenderer] Pre-generation complete for all ${workItems.length} map/season combos`);
        this.preGenerating = false;
        return;
      }

      const item = workItems[itemIdx];
      // Load map data
      if (!this.loadMapData(item.mapName)) {
        itemIdx++;
        setImmediate(processNextItem);
        return;
      }

      const map = this.mapData.get(item.mapName)!;
      const chunksI = Math.ceil(map.height / CHUNK_SIZE);
      const chunksJ = Math.ceil(map.width / CHUNK_SIZE);
      const totalChunks = chunksI * chunksJ;

      // Check how many chunks already exist (all 4 zoom levels)
      let existingCount = 0;
      for (let ci = 0; ci < chunksI; ci++) {
        for (let cj = 0; cj < chunksJ; cj++) {
          const z0Exists = fs.existsSync(this.getChunkCachePath(item.mapName, item.terrainType, item.season, ci, cj, 0));
          const z3Exists = fs.existsSync(this.getChunkCachePath(item.mapName, item.terrainType, item.season, ci, cj, MAX_ZOOM));
          if (z0Exists && z3Exists) existingCount++;
        }
      }

      if (existingCount === totalChunks) {
        console.log(`[TerrainChunkRenderer] ${item.mapName}/${SEASON_NAMES[item.season as Season]}: all ${totalChunks} chunks cached`);
        itemIdx++;
        setImmediate(processNextItem);
        return;
      }

      console.log(`[TerrainChunkRenderer] Pre-generating ${item.mapName} (${item.terrainType}, ${SEASON_NAMES[item.season as Season]}): ${existingCount}/${totalChunks} cached`);

      const t0 = Date.now();
      let generated = 0;
      let chunkIdx = 0;

      const processNextChunk = () => {
        // Process a batch of chunks per tick to avoid starving the event loop
        const batchSize = 4;
        for (let b = 0; b < batchSize && chunkIdx < totalChunks; b++, chunkIdx++) {
          const ci = Math.floor(chunkIdx / chunksJ);
          const cj = chunkIdx % chunksJ;

          // Skip if all 4 zoom levels already cached
          const z0Exists = fs.existsSync(this.getChunkCachePath(item.mapName, item.terrainType, item.season, ci, cj, 0));
          const z3Exists = fs.existsSync(this.getChunkCachePath(item.mapName, item.terrainType, item.season, ci, cj, MAX_ZOOM));
          if (z0Exists && z3Exists) continue;

          this.generateChunkAllZooms(item.mapName, item.terrainType, item.season, ci, cj);
          generated++;
        }

        if (chunkIdx < totalChunks) {
          // More chunks to process — yield and continue
          setImmediate(processNextChunk);
        } else {
          // Done with this map/season
          const dt = Date.now() - t0;
          console.log(`[TerrainChunkRenderer] ${item.mapName}/${SEASON_NAMES[item.season as Season]}: generated ${generated} chunks (${totalChunks * 4} PNGs) in ${(dt / 1000).toFixed(1)}s`);
          itemIdx++;
          setImmediate(processNextItem);
        }
      };

      setImmediate(processNextChunk);
    };

    setImmediate(processNextItem);
  }

  /**
   * Get the chunk manifest for a map/terrainType/season.
   */
  getChunkManifest(mapName: string, terrainType: string, season: number): ChunkManifest | null {
    // Try to get map dimensions
    if (!this.loadMapData(mapName)) return null;

    const map = this.mapData.get(mapName)!;

    return {
      mapName,
      terrainType,
      season,
      seasonName: SEASON_NAMES[season as Season] || 'Unknown',
      mapWidth: map.width,
      mapHeight: map.height,
      chunkSize: CHUNK_SIZE,
      chunksI: Math.ceil(map.height / CHUNK_SIZE),
      chunksJ: Math.ceil(map.width / CHUNK_SIZE),
      chunkWidth: CHUNK_CANVAS_WIDTH,
      chunkHeight: CHUNK_CANVAS_HEIGHT,
      zoomLevel: 3,
      tileWidth: ZOOM3_TILE_WIDTH,
      tileHeight: ZOOM3_TILE_HEIGHT,
      u: ZOOM3_U,
      zoomLevels: [0, 1, 2, 3]
    };
  }

  /**
   * Check if atlas data is loaded for a given terrain type and season.
   */
  hasAtlas(terrainType: string, season: number): boolean {
    return this.atlasData.has(`${terrainType}-${season}`);
  }

  /**
   * Check if a chunk PNG is cached on disk.
   */
  isChunkCached(mapName: string, terrainType: string, season: number, chunkI: number, chunkJ: number, zoomLevel: number = MAX_ZOOM): boolean {
    return fs.existsSync(this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel));
  }

  /**
   * Get the disk cache path for a chunk PNG.
   * Format: chunks/{mapName}/{terrainType}/{season}/z{zoom}/chunk_{i}_{j}.png
   */
  getChunkCachePath(mapName: string, terrainType: string, season: number, chunkI: number, chunkJ: number, zoomLevel: number = MAX_ZOOM): string {
    return path.join(this.cacheDir, 'chunks', mapName, terrainType, String(season), `z${zoomLevel}`, `chunk_${chunkI}_${chunkJ}.png`);
  }

  /**
   * Invalidate all cached chunks for a map (e.g., if atlas is regenerated).
   */
  invalidateMap(mapName: string): void {
    const mapChunkDir = path.join(this.cacheDir, 'chunks', mapName);
    if (fs.existsSync(mapChunkDir)) {
      fs.rmSync(mapChunkDir, { recursive: true, force: true });
      console.log(`[TerrainChunkRenderer] Invalidated all chunks for map: ${mapName}`);
    }
    this.mapData.delete(mapName);
  }

  /**
   * Get loaded atlas count for monitoring.
   */
  getStats(): { atlasCount: number; mapCount: number; generatingCount: number; preGenerating: boolean } {
    return {
      atlasCount: this.atlasData.size,
      mapCount: this.mapData.size,
      generatingCount: this.generating.size,
      preGenerating: this.preGenerating
    };
  }
}
