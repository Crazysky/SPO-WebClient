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
import {
  Point,
  Rect,
  TileBounds,
  ZOOM_LEVELS,
  ZoomConfig,
  Rotation,
  TerrainData
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

  // Texture mode (true = use textures, false = use colors only)
  private useTextures: boolean = true;

  // View state
  private zoomLevel: number = 2;  // Default zoom (16×32 pixels per tile)
  private rotation: Rotation = Rotation.NORTH;

  // Camera position in map coordinates (center tile)
  private cameraI: number = 500;
  private cameraJ: number = 500;

  // Screen origin (for Lander.pas formula)
  private origin: Point = { x: 0, y: 0 };

  // State flags
  private loaded: boolean = false;
  private mapName: string = '';

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
    console.log(`[IsometricRenderer] Terrain type: ${terrainType}`);

    // Load terrain data
    const terrainData = await this.terrainLoader.loadMap(mapName);

    // Update coordinate mapper with actual map dimensions
    this.coordMapper = new CoordinateMapper(
      terrainData.width,
      terrainData.height
    );

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
   * Update origin based on camera position
   * The origin is the screen offset that centers the camera tile
   */
  private updateOrigin(): void {
    const config = ZOOM_LEVELS[this.zoomLevel];
    const u = config.u;

    const dims = this.terrainLoader.getDimensions();
    const rows = dims.height;
    const cols = dims.width;

    // Calculate where the camera tile would be in screen space
    // Then offset so it's at the center of the canvas
    const cameraScreenX = 2 * u * (rows - this.cameraI + this.cameraJ);
    const cameraScreenY = u * ((rows - this.cameraI) + (cols - this.cameraJ));

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
   * Draws isometric diamond tiles for each visible map cell
   */
  private renderTerrainLayer(bounds: TileBounds): number {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.zoomLevel];
    const u = config.u;
    const tileWidth = config.tileWidth;   // 2 * u
    const tileHeight = config.tileHeight; // u

    let tilesRendered = 0;

    // Render tiles in back-to-front order (painter's algorithm)
    // For isometric: iterate from top-left to bottom-right of visible area
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        // Get texture ID from terrain data
        const textureId = this.terrainLoader.getTextureId(j, i);

        // Convert map coordinates to screen coordinates
        const screenPos = this.coordMapper.mapToScreen(
          i, j,
          this.zoomLevel,
          this.rotation,
          this.origin
        );

        // Skip if off-screen (with margin)
        if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth ||
            screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
          continue;
        }

        // Draw the isometric tile
        this.drawIsometricTile(screenPos.x, screenPos.y, config, textureId);
        tilesRendered++;
      }
    }

    return tilesRendered;
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
   */
  private drawIsometricTile(
    screenX: number,
    screenY: number,
    config: ZoomConfig,
    textureId: number
  ): void {
    const ctx = this.ctx;
    const halfWidth = config.tileWidth / 2;  // u
    const halfHeight = config.tileHeight / 2;

    // Try to get texture from cache
    let textureDrawn = false;

    if (this.useTextures) {
      const texture = this.textureCache.getTextureSync(textureId, config.level);

      if (texture) {
        // Draw texture as diamond using clipping path
        ctx.save();

        // Create diamond clipping path
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);                          // Top
        ctx.lineTo(screenX - halfWidth, screenY + halfHeight); // Left
        ctx.lineTo(screenX, screenY + config.tileHeight);      // Bottom
        ctx.lineTo(screenX + halfWidth, screenY + halfHeight); // Right
        ctx.closePath();
        ctx.clip();

        // Draw texture scaled to tile size
        // BMP textures are typically 32x16 for zoom 2, scale to match current zoom
        const texWidth = config.tileWidth;
        const texHeight = config.tileHeight;

        ctx.drawImage(
          texture,
          screenX - halfWidth,
          screenY,
          texWidth,
          texHeight
        );

        ctx.restore();
        textureDrawn = true;
      }
    }

    // Fallback to solid color if texture not available
    if (!textureDrawn) {
      const color = this.textureCache.getFallbackColor(textureId);

      // Draw diamond shape
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);                          // Top
      ctx.lineTo(screenX - halfWidth, screenY + halfHeight); // Left
      ctx.lineTo(screenX, screenY + config.tileHeight);      // Bottom
      ctx.lineTo(screenX + halfWidth, screenY + halfHeight); // Right
      ctx.closePath();

      // Fill with terrain color
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Draw subtle edge for depth (optional, can be toggled)
    if (this.zoomLevel >= 2) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);                          // Top
      ctx.lineTo(screenX - halfWidth, screenY + halfHeight); // Left
      ctx.lineTo(screenX, screenY + config.tileHeight);      // Bottom
      ctx.lineTo(screenX + halfWidth, screenY + halfHeight); // Right
      ctx.closePath();
      ctx.stroke();
    }
  }

  /**
   * Render debug information overlay
   */
  private renderDebugInfo(bounds: TileBounds, tilesRendered: number): void {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.zoomLevel];
    const cacheStats = this.textureCache.getStats();

    // Draw info panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 380, 180);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    const lines = [
      `Map: ${this.mapName} (${this.terrainLoader.getDimensions().width}×${this.terrainLoader.getDimensions().height})`,
      `Terrain: ${this.textureCache.getTerrainType()}`,
      `Camera: (${Math.round(this.cameraI)}, ${Math.round(this.cameraJ)})`,
      `Zoom Level: ${this.zoomLevel} (${config.tileWidth}×${config.tileHeight}px)`,
      `Visible: i[${bounds.minI}..${bounds.maxI}] j[${bounds.minJ}..${bounds.maxJ}]`,
      `Tiles Rendered: ${tilesRendered}`,
      `Textures: ${this.useTextures ? 'ON' : 'OFF'} | Cache: ${cacheStats.size}/${cacheStats.maxSize} (${(cacheStats.hitRate * 100).toFixed(1)}% hit)`,
      `Render Time: ${this.lastRenderStats.renderTimeMs.toFixed(2)}ms`,
      `Controls: Drag=Pan, Wheel=Zoom, T=Toggle Textures`
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
    await this.textureCache.preload(Array.from(textureIds), this.zoomLevel);
    this.render();
  }
}
