/**
 * IsometricTerrainRenderer
 *
 * Core isometric rendering engine based on Lander.pas algorithm.
 * Renders terrain from BMP texture IDs using diamond-shaped isometric tiles.
 *
 * Phase 3: Solid colors based on texture ID
 * Phase 4: Actual texture images from CAB archives
 */

import { TerrainLoader } from './terrain-loader';
import { CoordinateMapper } from './coordinate-mapper';
import { TextureCache, getFallbackColor } from './texture-cache';
import { ChunkCache, CHUNK_SIZE } from './chunk-cache';
import {
  Point,
  Rect,
  TileBounds,
  ZOOM_LEVELS,
  ZoomConfig,
  Rotation,
  TerrainData,
  Season,
  SEASON_NAMES
} from '../../shared/map-config';

/**
 * Map name to terrain type mapping
 * Used to determine which texture set to load
 */
const MAP_TERRAIN_TYPES: Record<string, string> = {
  'Shamba': 'Alien Swamp',
  'Antiqua': 'Earth',
  'Zyrane': 'Earth',
  // Default to Earth for unknown maps
};

function getTerrainTypeForMap(mapName: string): string {
  return MAP_TERRAIN_TYPES[mapName] || 'Earth';
}

export class IsometricTerrainRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Core components
  private terrainLoader: TerrainLoader;
  private coordMapper: CoordinateMapper;
  private textureCache: TextureCache;
  private chunkCache: ChunkCache | null = null;

  // Rendering mode
  private useTextures: boolean = true;
  private useChunks: boolean = true; // Use chunk-based rendering (10-20x faster)

  // View state
  private zoomLevel: number = 2;  // Default zoom (16×32 pixels per tile)
  private rotation: Rotation = Rotation.NORTH;
  private season: Season = Season.SUMMER;  // Default season for textures

  // Camera position in map coordinates (center tile)
  private cameraI: number = 500;
  private cameraJ: number = 500;

  // Screen origin (for Lander.pas formula)
  private origin: Point = { x: 0, y: 0 };

  // State flags
  private loaded: boolean = false;
  private mapName: string = '';

  // Available seasons for current terrain type (auto-detected from server)
  private availableSeasons: Season[] = [Season.WINTER, Season.SPRING, Season.SUMMER, Season.AUTUMN];

  // Rendering stats (for debug info)
  private lastRenderStats = {
    tilesRendered: 0,
    renderTimeMs: 0,
    visibleBounds: { minI: 0, maxI: 0, minJ: 0, maxJ: 0 } as TileBounds
  };

  // Mouse interaction state
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;

    // Initialize components (mapper will be resized after map load)
    this.terrainLoader = new TerrainLoader();
    this.coordMapper = new CoordinateMapper(2000, 2000);
    this.textureCache = new TextureCache(200); // LRU cache with 200 texture limit

    // Setup event handlers
    this.setupMouseControls();
    this.setupResizeHandler();

    // Initial render (loading state)
    this.render();
  }

  /**
   * Load terrain data for a map
   * @param mapName - Name of the map (e.g., 'Shamba', 'Antiqua')
   */
  async loadMap(mapName: string): Promise<TerrainData> {
    console.log(`[IsometricRenderer] Loading map: ${mapName}`);

    // Set terrain type for texture loading
    const terrainType = getTerrainTypeForMap(mapName);
    this.textureCache.setTerrainType(terrainType);

    // Query available seasons from server and auto-select if current season is unavailable
    await this.fetchAvailableSeasons(terrainType);

    // Load terrain data
    const terrainData = await this.terrainLoader.loadMap(mapName);

    // Update coordinate mapper with actual map dimensions
    this.coordMapper = new CoordinateMapper(
      terrainData.width,
      terrainData.height
    );

    // Initialize chunk cache for fast terrain rendering
    this.chunkCache = new ChunkCache(
      this.textureCache,
      (x, y) => this.terrainLoader.getTextureId(x, y)
    );
    this.chunkCache.setMapDimensions(terrainData.width, terrainData.height);
    this.chunkCache.setOnChunkReady(() => this.render());

    // Center camera on map
    this.cameraI = Math.floor(terrainData.height / 2);
    this.cameraJ = Math.floor(terrainData.width / 2);

    // Update origin for centered view
    this.updateOrigin();

    this.mapName = mapName;
    this.loaded = true;

    console.log(`[IsometricRenderer] Map loaded: ${terrainData.width}×${terrainData.height}`);

    // Render the loaded map
    this.render();

    return terrainData;
  }

  /**
   * Fetch available seasons for a terrain type from server
   * Auto-selects the default season if current season is not available
   */
  private async fetchAvailableSeasons(terrainType: string): Promise<void> {
    try {
      const url = `/api/terrain-info/${encodeURIComponent(terrainType)}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[IsometricRenderer] Failed to fetch terrain info for ${terrainType}: ${response.status}`);
        return;
      }

      const info = await response.json() as {
        terrainType: string;
        availableSeasons: Season[];
        defaultSeason: Season;
      };

      this.availableSeasons = info.availableSeasons;

      // If current season is not available, switch to default
      if (!info.availableSeasons.includes(this.season)) {
        console.log(`[IsometricRenderer] Season ${this.season} not available for ${terrainType}, switching to ${info.defaultSeason}`);
        this.season = info.defaultSeason;
        this.textureCache.setSeason(info.defaultSeason);
        // Clear chunk cache since season changed
        this.chunkCache?.clearAll();
      }
    } catch (error) {
      console.warn(`[IsometricRenderer] Error fetching terrain info:`, error);
    }
  }

  /**
   * Update origin based on camera position
   * The origin is the screen offset that centers the camera tile
   */
  private updateOrigin(): void {
    const config = ZOOM_LEVELS[this.zoomLevel];
    const u = config.u;

    const dims = this.terrainLoader.getDimensions();
    const rows = dims.height;
    const cols = dims.width;

    // Calculate where the camera tile would be in screen space using the seamless formula
    // Then offset so it's at the center of the canvas
    const cameraScreenX = u * (rows - this.cameraI + this.cameraJ);
    const cameraScreenY = (u / 2) * ((rows - this.cameraI) + (cols - this.cameraJ));

    // Origin makes camera position appear at canvas center
    this.origin = {
      x: cameraScreenX - this.canvas.width / 2,
      y: cameraScreenY - this.canvas.height / 2
    };
  }

  /**
   * Main render loop
   */
  render(): void {
    const startTime = performance.now();

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas with dark background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    if (!this.loaded) {
      // Show loading message
      ctx.fillStyle = '#666';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading terrain data...', width / 2, height / 2);
      return;
    }

    // Update origin for current camera position
    this.updateOrigin();

    // Get viewport bounds
    const viewport: Rect = {
      x: 0,
      y: 0,
      width: width,
      height: height
    };

    // Calculate visible tile bounds
    const bounds = this.coordMapper.getVisibleBounds(
      viewport,
      this.zoomLevel,
      this.rotation,
      this.origin
    );

    // Render terrain layer
    const tilesRendered = this.renderTerrainLayer(bounds);

    // Render debug info
    this.renderDebugInfo(bounds, tilesRendered);

    // Update stats
    this.lastRenderStats = {
      tilesRendered,
      renderTimeMs: performance.now() - startTime,
      visibleBounds: bounds
    };
  }

  /**
   * Render the terrain layer
   * Uses chunk-based rendering for performance (10-20x faster)
   * Falls back to tile-by-tile rendering when chunks not available
   */
  private renderTerrainLayer(bounds: TileBounds): number {
    // Use chunk-based rendering if available, enabled, and supported
    if (this.useChunks && this.chunkCache && this.chunkCache.isSupported()) {
      return this.renderTerrainLayerChunked();
    }

    // Fallback: tile-by-tile rendering
    return this.renderTerrainLayerTiles(bounds);
  }

  /**
   * Chunk-based terrain rendering (fast path)
   * Renders pre-cached chunks instead of individual tiles
   */
  private renderTerrainLayerChunked(): number {
    if (!this.chunkCache) return 0;

    const ctx = this.ctx;

    // Get visible chunk range
    const visibleChunks = this.chunkCache.getVisibleChunks(
      this.canvas.width,
      this.canvas.height,
      this.zoomLevel,
      this.origin
    );

    let chunksDrawn = 0;
    let tilesRendered = 0;

    // Draw visible chunks
    for (let ci = visibleChunks.minChunkI; ci <= visibleChunks.maxChunkI; ci++) {
      for (let cj = visibleChunks.minChunkJ; cj <= visibleChunks.maxChunkJ; cj++) {
        const drawn = this.chunkCache.drawChunkToCanvas(
          ctx,
          ci, cj,
          this.zoomLevel,
          this.origin
        );

        if (drawn) {
          chunksDrawn++;
          tilesRendered += CHUNK_SIZE * CHUNK_SIZE;
        } else {
          // Chunk not ready - render individual tiles for this chunk
          tilesRendered += this.renderChunkTilesFallback(ci, cj);
        }
      }
    }

    // Preload neighboring chunks (anticipate pan)
    const centerChunkI = Math.floor((visibleChunks.minChunkI + visibleChunks.maxChunkI) / 2);
    const centerChunkJ = Math.floor((visibleChunks.minChunkJ + visibleChunks.maxChunkJ) / 2);
    this.chunkCache.preloadChunks(centerChunkI, centerChunkJ, 2, this.zoomLevel);

    return tilesRendered;
  }

  /**
   * Render individual tiles for a chunk that isn't cached yet
   * Uses two-pass rendering: standard tiles first, then tall tiles on top
   */
  private renderChunkTilesFallback(chunkI: number, chunkJ: number): number {
    const config = ZOOM_LEVELS[this.zoomLevel];
    const tileWidth = config.tileWidth;
    const tileHeight = config.tileHeight;

    const startI = chunkI * CHUNK_SIZE;
    const startJ = chunkJ * CHUNK_SIZE;
    const endI = Math.min(startI + CHUNK_SIZE, this.terrainLoader.getDimensions().height);
    const endJ = Math.min(startJ + CHUNK_SIZE, this.terrainLoader.getDimensions().width);

    // Standard tile height at base resolution (64×32)
    const BASE_TILE_HEIGHT = 32;

    // Collect tiles for two-pass rendering
    const standardTiles: Array<{ screenX: number; screenY: number; textureId: number }> = [];
    const tallTiles: Array<{ screenX: number; screenY: number; textureId: number }> = [];

    for (let i = startI; i < endI; i++) {
      for (let j = startJ; j < endJ; j++) {
        const textureId = this.terrainLoader.getTextureId(j, i);
        const screenPos = this.coordMapper.mapToScreen(
          i, j,
          this.zoomLevel,
          this.rotation,
          this.origin
        );

        // Skip if off-screen
        if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth ||
            screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
          continue;
        }

        // Check if texture is tall (only if textures are enabled)
        let isTall = false;
        if (this.useTextures) {
          const texture = this.textureCache.getTextureSync(textureId);
          isTall = texture !== null && texture.height > BASE_TILE_HEIGHT;
        }

        if (isTall) {
          tallTiles.push({ screenX: screenPos.x, screenY: screenPos.y, textureId });
        } else {
          standardTiles.push({ screenX: screenPos.x, screenY: screenPos.y, textureId });
        }
      }
    }

    // Pass 1: Render standard tiles
    for (const tile of standardTiles) {
      this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, false);
    }

    // Pass 2: Render tall tiles on top
    for (const tile of tallTiles) {
      this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, true);
    }

    return standardTiles.length + tallTiles.length;
  }

  /**
   * Tile-by-tile terrain rendering (slow path, fallback)
   * Uses two-pass rendering: standard tiles first, then tall tiles on top
   */
  private renderTerrainLayerTiles(bounds: TileBounds): number {
    const config = ZOOM_LEVELS[this.zoomLevel];
    const tileWidth = config.tileWidth;
    const tileHeight = config.tileHeight;

    // Standard tile height at base resolution (64×32)
    const BASE_TILE_HEIGHT = 32;

    // Collect tiles for two-pass rendering
    const standardTiles: Array<{ screenX: number; screenY: number; textureId: number }> = [];
    const tallTiles: Array<{ screenX: number; screenY: number; textureId: number }> = [];

    // Render tiles in back-to-front order (painter's algorithm)
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        const textureId = this.terrainLoader.getTextureId(j, i);

        const screenPos = this.coordMapper.mapToScreen(
          i, j,
          this.zoomLevel,
          this.rotation,
          this.origin
        );

        // Skip if off-screen
        if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth ||
            screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
          continue;
        }

        // Check if texture is tall (only if textures are enabled)
        let isTall = false;
        if (this.useTextures) {
          const texture = this.textureCache.getTextureSync(textureId);
          isTall = texture !== null && texture.height > BASE_TILE_HEIGHT;
        }

        if (isTall) {
          tallTiles.push({ screenX: screenPos.x, screenY: screenPos.y, textureId });
        } else {
          standardTiles.push({ screenX: screenPos.x, screenY: screenPos.y, textureId });
        }
      }
    }

    // Pass 1: Render standard tiles
    for (const tile of standardTiles) {
      this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, false);
    }

    // Pass 2: Render tall tiles on top
    for (const tile of tallTiles) {
      this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, true);
    }

    return standardTiles.length + tallTiles.length;
  }

  /**
   * Draw a single isometric diamond tile
   *
   * Diamond shape vertices (relative to top point):
   *       (0, 0) - top
   *   (-u, h/2)  - left
   *       (0, h) - bottom
   *    (u, h/2)  - right
   *
   * Where: u = tileWidth/2, h = tileHeight
   *
   * Tiles are positioned using the seamless formula which ensures adjacent tiles
   * overlap by exactly half their dimensions. This means the opaque diamond content
   * of one tile covers the transparent corners of adjacent tiles.
   *
   * When textures are available: Draw ONLY the texture (no background rectangle)
   * When textures are NOT available: Draw a diamond-shaped fallback color
   *
   * @param isTallTexture - If true, draw texture at full height with upward offset
   */
  private drawIsometricTile(
    screenX: number,
    screenY: number,
    config: ZoomConfig,
    textureId: number,
    isTallTexture: boolean = false
  ): void {
    const ctx = this.ctx;
    const halfWidth = config.tileWidth / 2;  // u
    const halfHeight = config.tileHeight / 2;

    // Round coordinates to integers to avoid sub-pixel rendering gaps
    const x = Math.round(screenX);
    const y = Math.round(screenY);

    // Try to get texture if textures are enabled
    let texture: ImageBitmap | null = null;
    if (this.useTextures) {
      texture = this.textureCache.getTextureSync(textureId);
    }

    if (texture) {
      if (isTallTexture) {
        // Tall texture: draw at actual height with upward offset
        const scale = config.tileWidth / 64;
        const scaledHeight = texture.height * scale;
        const yOffset = scaledHeight - config.tileHeight;

        ctx.drawImage(
          texture,
          x - halfWidth,
          y - yOffset,
          config.tileWidth,
          scaledHeight
        );
      } else {
        // Standard texture: draw at standard tile height
        ctx.drawImage(
          texture,
          x - halfWidth,
          y,
          config.tileWidth,
          config.tileHeight
        );
      }
    } else {
      // No texture available - draw a diamond-shaped fallback color
      const color = this.textureCache.getFallbackColor(textureId);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);                           // top
      ctx.lineTo(x + halfWidth, y + halfHeight);  // right
      ctx.lineTo(x, y + config.tileHeight);       // bottom
      ctx.lineTo(x - halfWidth, y + halfHeight);  // left
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Render debug information overlay
   */
  private renderDebugInfo(bounds: TileBounds, tilesRendered: number): void {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.zoomLevel];
    const cacheStats = this.textureCache.getStats();
    const chunkStats = this.chunkCache?.getStats();

    // Draw info panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 420, 210);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    const availableSeasonStr = this.availableSeasons.length === 1
      ? `(only ${SEASON_NAMES[this.availableSeasons[0]]})`
      : `(${this.availableSeasons.length} available)`;

    const lines = [
      `Map: ${this.mapName} (${this.terrainLoader.getDimensions().width}×${this.terrainLoader.getDimensions().height})`,
      `Terrain: ${this.textureCache.getTerrainType()} | Season: ${SEASON_NAMES[this.season]} ${availableSeasonStr}`,
      `Camera: (${Math.round(this.cameraI)}, ${Math.round(this.cameraJ)})`,
      `Zoom Level: ${this.zoomLevel} (${config.tileWidth}×${config.tileHeight}px)`,
      `Visible: i[${bounds.minI}..${bounds.maxI}] j[${bounds.minJ}..${bounds.maxJ}]`,
      `Tiles Rendered: ${tilesRendered}`,
      `Textures: ${this.useTextures ? 'ON' : 'OFF'} | Cache: ${cacheStats.size}/${cacheStats.maxSize} (${(cacheStats.hitRate * 100).toFixed(1)}% hit)`,
      `Chunks: ${this.useChunks ? 'ON' : 'OFF'} | Cached: ${chunkStats?.cacheSizes[this.zoomLevel] || 0} (${((chunkStats?.hitRate || 0) * 100).toFixed(1)}% hit)`,
      `Render Time: ${this.lastRenderStats.renderTimeMs.toFixed(2)}ms`,
      `Controls: Drag=Pan, Wheel=Zoom, T=Textures, C=Chunks, S=Season`
    ];

    lines.forEach((line, index) => {
      ctx.fillText(line, 20, 30 + index * 18);
    });
  }

  /**
   * Setup mouse controls for pan and zoom
   */
  private setupMouseControls(): void {
    // Mouse wheel for zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const oldZoom = this.zoomLevel;

      if (e.deltaY > 0) {
        // Zoom out
        this.zoomLevel = Math.max(0, this.zoomLevel - 1);
      } else {
        // Zoom in
        this.zoomLevel = Math.min(3, this.zoomLevel + 1);
      }

      if (oldZoom !== this.zoomLevel) {
        this.render();
      }
    });

    // Mouse down - start drag
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) { // Left or right click
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
      }
    });

    // Mouse move - drag to pan
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      // Convert screen delta to map delta
      // In isometric view, horizontal movement affects both i and j
      const config = ZOOM_LEVELS[this.zoomLevel];
      const u = config.u;

      // Approximate conversion (simplified)
      const mapDeltaI = (dy / u + dx / (2 * u)) * 0.5;
      const mapDeltaJ = (dy / u - dx / (2 * u)) * 0.5;

      this.cameraI += mapDeltaI;
      this.cameraJ -= mapDeltaJ;

      // Clamp to map bounds
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      this.render();
    });

    // Mouse up - stop drag
    const stopDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    };

    this.canvas.addEventListener('mouseup', stopDrag);
    this.canvas.addEventListener('mouseleave', stopDrag);

    // Prevent context menu on right-click
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Initial cursor
    this.canvas.style.cursor = 'grab';

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        this.toggleTextures();
      }
      if (e.key === 'c' || e.key === 'C') {
        this.toggleChunks();
      }
      if (e.key === 's' || e.key === 'S') {
        this.cycleSeason();
      }
    });
  }

  /**
   * Setup window resize handler
   */
  private setupResizeHandler(): void {
    const resizeObserver = new ResizeObserver(() => {
      this.canvas.width = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight;
      this.render();
    });
    resizeObserver.observe(this.canvas);
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Set zoom level (0-3)
   */
  setZoomLevel(level: number): void {
    this.zoomLevel = Math.max(0, Math.min(3, level));
    this.render();
  }

  /**
   * Get current zoom level
   */
  getZoomLevel(): number {
    return this.zoomLevel;
  }

  /**
   * Set rotation (currently disabled - always NORTH)
   */
  setRotation(rotation: Rotation): void {
    this.rotation = rotation;
    this.render();
  }

  /**
   * Get current rotation
   */
  getRotation(): Rotation {
    return this.rotation;
  }

  /**
   * Pan camera by delta in map coordinates
   */
  pan(deltaI: number, deltaJ: number): void {
    this.cameraI += deltaI;
    this.cameraJ += deltaJ;

    // Clamp to map bounds
    const dims = this.terrainLoader.getDimensions();
    this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
    this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));

    this.render();
  }

  /**
   * Center camera on specific map coordinates
   */
  centerOn(i: number, j: number): void {
    this.cameraI = i;
    this.cameraJ = j;

    // Clamp to map bounds
    const dims = this.terrainLoader.getDimensions();
    this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
    this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));

    this.render();
  }

  /**
   * Get camera position
   */
  getCameraPosition(): { i: number; j: number } {
    return { i: this.cameraI, j: this.cameraJ };
  }

  /**
   * Convert screen coordinates to map coordinates
   */
  screenToMap(screenX: number, screenY: number): Point {
    return this.coordMapper.screenToMap(
      screenX, screenY,
      this.zoomLevel,
      this.rotation,
      this.origin
    );
  }

  /**
   * Convert map coordinates to screen coordinates
   */
  mapToScreen(i: number, j: number): Point {
    return this.coordMapper.mapToScreen(
      i, j,
      this.zoomLevel,
      this.rotation,
      this.origin
    );
  }

  /**
   * Get terrain loader (for accessing terrain data)
   */
  getTerrainLoader(): TerrainLoader {
    return this.terrainLoader;
  }

  /**
   * Get coordinate mapper
   */
  getCoordinateMapper(): CoordinateMapper {
    return this.coordMapper;
  }

  /**
   * Check if map is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get map name
   */
  getMapName(): string {
    return this.mapName;
  }

  /**
   * Get last render statistics
   */
  getRenderStats(): typeof this.lastRenderStats {
    return { ...this.lastRenderStats };
  }

  /**
   * Unload and cleanup
   */
  unload(): void {
    this.terrainLoader.unload();
    this.textureCache.clear();
    this.chunkCache?.clearAll();
    this.chunkCache = null;
    this.loaded = false;
    this.mapName = '';
    this.render();
  }

  // =========================================================================
  // TEXTURE API
  // =========================================================================

  /**
   * Toggle texture rendering on/off
   */
  toggleTextures(): void {
    this.useTextures = !this.useTextures;
    console.log(`[IsometricRenderer] Textures: ${this.useTextures ? 'ON' : 'OFF'}`);
    this.render();
  }

  /**
   * Toggle chunk-based rendering on/off
   * When OFF, uses tile-by-tile rendering (slower but useful for debugging)
   */
  toggleChunks(): void {
    this.useChunks = !this.useChunks;
    console.log(`[IsometricRenderer] Chunks: ${this.useChunks ? 'ON' : 'OFF'}`);
    this.render();
  }

  /**
   * Set texture rendering mode
   */
  setTextureMode(enabled: boolean): void {
    this.useTextures = enabled;
    this.render();
  }

  /**
   * Check if texture rendering is enabled
   */
  isTextureMode(): boolean {
    return this.useTextures;
  }

  /**
   * Get texture cache for advanced operations
   */
  getTextureCache(): TextureCache {
    return this.textureCache;
  }

  /**
   * Preload textures for visible area
   */
  async preloadTextures(): Promise<void> {
    if (!this.loaded) return;

    const viewport: Rect = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height
    };

    const bounds = this.coordMapper.getVisibleBounds(
      viewport,
      this.zoomLevel,
      this.rotation,
      this.origin
    );

    // Collect unique texture IDs in visible area
    const textureIds = new Set<number>();
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        textureIds.add(this.terrainLoader.getTextureId(j, i));
      }
    }

    // Preload all visible textures
    await this.textureCache.preload(Array.from(textureIds));
    this.render();
  }

  // =========================================================================
  // SEASON API
  // =========================================================================

  /**
   * Set the season for terrain textures
   * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   */
  setSeason(season: Season): void {
    if (this.season !== season) {
      this.season = season;
      this.textureCache.setSeason(season);
      // Clear chunk cache since textures changed
      this.chunkCache?.clearAll();
      console.log(`[IsometricRenderer] Season changed to ${SEASON_NAMES[season]}`);
      this.render();
    }
  }

  /**
   * Get current season
   */
  getSeason(): Season {
    return this.season;
  }

  /**
   * Get current season name
   */
  getSeasonName(): string {
    return SEASON_NAMES[this.season];
  }

  /**
   * Cycle to next season (for keyboard shortcut)
   * Only cycles through available seasons for this terrain type
   */
  cycleSeason(): void {
    if (this.availableSeasons.length <= 1) {
      console.log(`[IsometricRenderer] Only one season available, cannot cycle`);
      return;
    }

    // Find current index in available seasons
    const currentIndex = this.availableSeasons.indexOf(this.season);
    const nextIndex = (currentIndex + 1) % this.availableSeasons.length;
    const nextSeason = this.availableSeasons[nextIndex];
    this.setSeason(nextSeason);
  }

  /**
   * Get available seasons for current terrain type
   */
  getAvailableSeasons(): Season[] {
    return [...this.availableSeasons];
  }
}
