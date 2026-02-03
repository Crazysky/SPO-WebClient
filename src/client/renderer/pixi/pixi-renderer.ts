/**
 * PixiJS Renderer - WebGL-accelerated isometric map renderer
 *
 * Replaces Canvas 2D rendering with GPU-accelerated PixiJS for:
 * - Batched draw calls (thousands of sprites in 1 GPU call)
 * - Efficient texture atlasing
 * - GPU-based sorting and compositing
 * - Mobile-optimized rendering
 *
 * Layer order (back to front):
 * 0. Terrain (base tiles)
 * 1. Concrete (pavement around buildings)
 * 2. Roads (road segments)
 * 3. Tall Terrain (trees/decorations over roads)
 * 4. Buildings (building sprites)
 * 5. Zone Overlay (colored zones)
 * 6. Placement Preview (building ghost)
 * 7. Road Preview (road drawing)
 * 8. UI Overlay (debug, game info)
 */

import { Application, Container, Sprite, Texture, Assets, Graphics, RenderTexture } from 'pixi.js';
import {
  Point,
  Rect,
  TileBounds,
  ZOOM_LEVELS,
  ZoomConfig,
  TerrainData
} from '../../../shared/map-config';
import {
  MapBuilding,
  MapSegment,
  SurfaceData,
  FacilityDimensions,
  RoadDrawingState
} from '../../../shared/types';
import { SpritePool } from './sprite-pool';
import { TextureAtlasManager } from './texture-atlas-manager';
import { PixiTerrainLayer } from './layers/pixi-terrain-layer';
import { PixiConcreteLayer } from './layers/pixi-concrete-layer';
import { PixiRoadLayer } from './layers/pixi-road-layer';
import { PixiBuildingLayer } from './layers/pixi-building-layer';
import { PixiOverlayLayer } from './layers/pixi-overlay-layer';
import { getFacilityDimensionsCache } from '../../facility-dimensions-cache';

/**
 * Unified sortKey priorities for painter's algorithm
 * All game elements (terrain, roads, buildings) are in the SAME container
 *
 * PAINTER'S ALGORITHM RULE (from painter-algorithm.ts):
 * - Higher (i+j) = higher on screen = further from viewer = draw FIRST (low zIndex)
 * - Lower (i+j) = lower on screen = closer to viewer = draw LAST (high zIndex)
 *
 * TWO-TIER SORTING SYSTEM with j-based tie-breaker:
 * - Lower tier (SORT_OFFSET_LOWER): Base terrain, concrete, roads
 *   Formula: (SORT_MAX_KEY - sortKey) * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_*
 *
 * - Upper tier (SORT_OFFSET_UPPER): Tall terrain, buildings
 *   Formula: SORT_OFFSET_UPPER + (SORT_MAX_KEY - sortKey) * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_*
 *
 * We INVERT sortKey (SORT_MAX_KEY - sortKey) so that:
 * - Higher (i+j) → lower inverted value → lower zIndex → drawn first (background)
 * - Lower (i+j) → higher inverted value → higher zIndex → drawn last (foreground)
 *
 * The j-based tie-breaker ensures tiles on the same diagonal (same i+j) are
 * properly ordered: higher j = more to the right = rendered on top.
 *
 * This ensures:
 * 1. Tall terrain ALWAYS renders AFTER roads (matching Canvas2D drawTallTerrainOverRoads)
 * 2. Within each tier, painter's algorithm (i+j) works correctly
 * 3. On same diagonal: tiles with higher j are on top
 * 4. On same position: terrain < concrete < road < tall_terrain < building
 */
export const SORT_OFFSET_LOWER = 0;
export const SORT_OFFSET_UPPER = 300_000_000;  // Must be > max lower tier (~200M)

export const SORT_MAX_KEY = 5000;  // Max sortKey (i+j) for a 2500x2500 map
export const SORT_MULTIPLIER_DIAGONAL = 100_000;  // Multiplier for inverted sortKey
export const SORT_MULTIPLIER_J = 100;              // Multiplier for j tie-breaker

export const SORT_PRIORITY_TERRAIN_BASE = 0;
export const SORT_PRIORITY_CONCRETE = 10;
export const SORT_PRIORITY_ROAD = 20;
export const SORT_PRIORITY_TERRAIN_TALL = 50;
export const SORT_PRIORITY_BUILDING = 90;

/** Render layer indices - now simplified since game elements share a container */
export const enum RenderLayerIndex {
  GAME_WORLD = 0,      // All game elements (terrain, roads, buildings) with unified sorting
  ZONE_OVERLAY = 1,    // Zone overlay (UI)
  PLACEMENT_PREVIEW = 2,
  ROAD_PREVIEW = 3,
  UI_OVERLAY = 4,
}

/** Configuration for the PixiJS renderer */
export interface PixiRendererConfig {
  /** Container element to attach canvas to */
  container: HTMLElement;
  /** Initial width */
  width: number;
  /** Initial height */
  height: number;
  /** Background color */
  backgroundColor?: number;
  /** Enable anti-aliasing */
  antialias?: boolean;
  /** Device pixel ratio (default: window.devicePixelRatio) */
  resolution?: number;
}

/** Camera state for viewport management */
export interface CameraState {
  /** Camera X position (screen space) */
  x: number;
  /** Camera Y position (screen space) */
  y: number;
  /** Current zoom level (0-3) */
  zoomLevel: number;
  /** Zoom configuration */
  zoomConfig: ZoomConfig;
}

/** Viewport bounds in map coordinates */
export interface ViewportBounds {
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
}

/**
 * Main PixiJS renderer for the isometric map
 */
export class PixiRenderer {
  // PixiJS core
  private app: Application;
  private initialized: boolean = false;

  // Layer containers
  private worldContainer: Container;
  private layers: Container[] = [];

  // Layer renderers
  private terrainLayer: PixiTerrainLayer | null = null;
  private concreteLayer: PixiConcreteLayer | null = null;
  private roadLayer: PixiRoadLayer | null = null;
  private buildingLayer: PixiBuildingLayer | null = null;
  private overlayLayer: PixiOverlayLayer | null = null;

  // Managers
  private textureAtlasManager: TextureAtlasManager;
  private spritePool: SpritePool;

  // Map data
  private terrainData: TerrainData | null = null;
  private mapWidth: number = 0;
  private mapHeight: number = 0;

  // Game data
  private buildings: MapBuilding[] = [];
  private segments: MapSegment[] = [];
  private roadTilesMap: Map<string, boolean> = new Map();
  private concreteTilesMap: Map<string, boolean> = new Map(); // Tiles with concrete (for skipping tall terrain)

  // Camera state
  private camera: CameraState = {
    x: 0,
    y: 0,
    zoomLevel: 2,
    zoomConfig: ZOOM_LEVELS[2]
  };

  // Mouse state
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private mouseMapI: number = 0;
  private mouseMapJ: number = 0;
  private hoveredBuilding: MapBuilding | null = null;
  private mouseDownTime: number = 0; // Track mouse down time for short click detection

  // Placement/drawing modes
  private placementMode: boolean = false;
  private placementPreview: { i: number; j: number; xsize: number; ysize: number } | null = null;
  private roadDrawingMode: boolean = false;
  private roadDrawingState: RoadDrawingState | null = null;

  // Zone overlay
  private zoneOverlayEnabled: boolean = false;
  private zoneOverlayData: SurfaceData | null = null;
  private zoneOverlayX1: number = 0;
  private zoneOverlayY1: number = 0;

  // Viewport culling
  private visibleBounds: ViewportBounds = { minI: 0, maxI: 0, minJ: 0, maxJ: 0 };
  private viewportDirty: boolean = true;

  /**
   * Get facility dimensions from global singleton cache
   */
  private get facilityDimensionsCache(): Map<string, FacilityDimensions> {
    const cache = getFacilityDimensionsCache();
    // Convert singleton cache to Map for compatibility with layer APIs
    const map = new Map<string, FacilityDimensions>();
    if (cache.isInitialized()) {
      // The singleton stores data internally - we need to look up dimensions per visualClass
      // Since we can't iterate the singleton, we return a proxy-like map
      return new Proxy(map, {
        get: (target, prop) => {
          if (prop === 'get') {
            return (visualClass: string) => cache.getFacility(visualClass);
          }
          if (prop === 'has') {
            return (visualClass: string) => cache.getFacility(visualClass) !== undefined;
          }
          if (prop === 'size') {
            return cache.getSize();
          }
          return Reflect.get(target, prop);
        }
      }) as Map<string, FacilityDimensions>;
    }
    return map;
  }

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onCancelPlacement: (() => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;
  private onRoadSegmentComplete: ((x1: number, y1: number, x2: number, y2: number) => void) | null = null;
  private onCancelRoadDrawing: (() => void) | null = null;
  private onViewportChange: (() => void) | null = null;

  // Texture loading - continuous updates for initial load period
  private textureLoadStartTime: number = 0;
  private readonly TEXTURE_LOAD_UPDATE_DURATION = 3000; // 3 seconds of continuous updates

  // Layer dirty flags - only update layers when their data changes
  private terrainDirty: boolean = true;
  private roadsDirty: boolean = true;
  private buildingsDirty: boolean = true;
  private concreteDirty: boolean = true;
  private overlayDirty: boolean = true;

  constructor(private config: PixiRendererConfig) {
    this.app = new Application();
    this.worldContainer = new Container();
    this.textureAtlasManager = new TextureAtlasManager();
    this.spritePool = new SpritePool();
  }

  /**
   * Initialize the PixiJS renderer
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize PixiJS application
    await this.app.init({
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor ?? 0x1a1a2e,
      antialias: this.config.antialias ?? false,
      resolution: this.config.resolution ?? window.devicePixelRatio,
      autoDensity: true,
      powerPreference: 'high-performance',
    });

    // Append canvas to container
    this.config.container.appendChild(this.app.canvas);

    // Setup world container (moves with camera)
    // PERFORMANCE: sortableChildren = false - we manually sort once per frame
    // instead of PixiJS sorting every render cycle
    this.worldContainer.sortableChildren = false;
    this.app.stage.addChild(this.worldContainer);

    // Create layer containers (sorted by z-index)
    // PERFORMANCE: sortableChildren = false - we manually sort game world container once per frame
    for (let i = 0; i <= RenderLayerIndex.UI_OVERLAY; i++) {
      const layer = new Container();
      layer.zIndex = i;
      // Only enable sortableChildren for UI layers (small sprite count)
      // Game world layer is manually sorted for performance
      layer.sortableChildren = (i !== RenderLayerIndex.GAME_WORLD);
      this.layers.push(layer);

      // UI_OVERLAY should be fixed on screen, not in world space
      if (i === RenderLayerIndex.UI_OVERLAY) {
        this.app.stage.addChild(layer);
      } else {
        this.worldContainer.addChild(layer);
      }
    }

    // All game elements (terrain, roads, buildings, concrete) share a SINGLE container
    // This is critical for correct painter's algorithm across all element types
    const gameWorldContainer = this.layers[RenderLayerIndex.GAME_WORLD];

    // Initialize layer renderers - all use the same gameWorldContainer
    this.terrainLayer = new PixiTerrainLayer(
      gameWorldContainer,
      gameWorldContainer, // Not used separately anymore
      this.textureAtlasManager,
      this.spritePool
    );

    this.concreteLayer = new PixiConcreteLayer(
      gameWorldContainer,
      this.textureAtlasManager,
      this.spritePool
    );

    this.roadLayer = new PixiRoadLayer(
      gameWorldContainer,
      this.textureAtlasManager,
      this.spritePool
    );

    this.buildingLayer = new PixiBuildingLayer(
      gameWorldContainer,
      this.textureAtlasManager,
      this.spritePool
    );

    this.overlayLayer = new PixiOverlayLayer(
      this.layers[RenderLayerIndex.ZONE_OVERLAY],
      this.layers[RenderLayerIndex.PLACEMENT_PREVIEW],
      this.layers[RenderLayerIndex.ROAD_PREVIEW],
      this.layers[RenderLayerIndex.UI_OVERLAY]
    );

    // Setup event listeners
    this.setupEventListeners();

    // Start render loop
    this.app.ticker.add(() => this.update());

    this.initialized = true;
    console.log('[PixiRenderer] Initialized with WebGL');
  }

  /**
   * Setup mouse/touch event listeners
   */
  private setupEventListeners(): void {
    const canvas = this.app.canvas;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch events for mobile
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

    // Keyboard events
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  // Track if manual sort is needed
  private needsManualSort: boolean = true;

  /**
   * Main update loop
   */
  private update(): void {
    const now = performance.now();

    // During texture loading period, keep updating to apply newly loaded textures
    const isInTextureLoadPeriod = this.textureLoadStartTime > 0 &&
      (now - this.textureLoadStartTime < this.TEXTURE_LOAD_UPDATE_DURATION);

    // Update viewport if camera moved or during texture loading period
    if (this.viewportDirty || isInTextureLoadPeriod) {
      this.updateVisibleBounds();
      this.updateLayers();

      // PERFORMANCE: Manual sort once after all layers are updated
      // This replaces PixiJS automatic sorting (sortableChildren = true)
      // which would sort on EVERY render frame
      if (this.needsManualSort) {
        this.sortGameWorldContainer();
        this.needsManualSort = false;
      }

      this.viewportDirty = false;
    }
  }

  /**
   * PERFORMANCE OPTIMIZATION: Manual sort of game world container
   *
   * Instead of sortableChildren = true (which sorts EVERY frame),
   * we sort ONCE when sprites change. This is O(n log n) but only
   * when viewport/data changes, not every frame.
   */
  private sortGameWorldContainer(): void {
    const gameWorld = this.layers[RenderLayerIndex.GAME_WORLD];
    if (gameWorld.children.length > 0) {
      // Sort by zIndex (painter's algorithm order is encoded in zIndex)
      gameWorld.children.sort((a, b) => a.zIndex - b.zIndex);
    }
  }

  /**
   * Calculate visible tile bounds based on camera position
   */
  private updateVisibleBounds(): void {
    if (!this.terrainData) return;

    const config = this.camera.zoomConfig;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;

    // Convert screen corners to map coordinates
    const margin = 5; // Extra tiles margin for smooth scrolling
    const topLeft = this.screenToMap(0, 0);
    const topRight = this.screenToMap(screenW, 0);
    const bottomLeft = this.screenToMap(0, screenH);
    const bottomRight = this.screenToMap(screenW, screenH);

    // Find bounds
    const allI = [topLeft.i, topRight.i, bottomLeft.i, bottomRight.i];
    const allJ = [topLeft.j, topRight.j, bottomLeft.j, bottomRight.j];

    this.visibleBounds = {
      minI: Math.max(0, Math.floor(Math.min(...allI)) - margin),
      maxI: Math.min(this.mapHeight - 1, Math.ceil(Math.max(...allI)) + margin),
      minJ: Math.max(0, Math.floor(Math.min(...allJ)) - margin),
      maxJ: Math.min(this.mapWidth - 1, Math.ceil(Math.max(...allJ)) + margin),
    };
  }

  /**
   * Update all layer renderers with current visible bounds
   * Uses dirty flags to skip unchanged layers for performance
   *
   * PERFORMANCE: When any layer is updated, sprites may be added/removed,
   * so we mark the container as needing a sort.
   */
  private updateLayers(): void {
    if (!this.terrainData) return;

    // Update world container position (camera offset)
    this.worldContainer.x = this.camera.x;
    this.worldContainer.y = this.camera.y;

    // During texture loading, update terrain every frame
    const isTextureLoading = this.textureLoadStartTime > 0 &&
      (performance.now() - this.textureLoadStartTime < this.TEXTURE_LOAD_UPDATE_DURATION);

    // Track if any layer was updated (requires re-sort)
    let anyLayerUpdated = false;

    // Update terrain layer (always update when viewport moves or textures loading)
    // LOD: Pass zoom level to terrain layer for LOD decisions (skip tall terrain at distant zoom)
    if (this.terrainDirty || this.viewportDirty || isTextureLoading) {
      this.terrainLayer?.update(
        this.terrainData,
        this.visibleBounds,
        this.camera.zoomConfig,
        this.roadTilesMap,      // Pass road tiles so tall terrain skips tiles with roads
        this.concreteTilesMap   // Pass concrete tiles so tall terrain skips tiles with concrete
      );
      this.terrainDirty = false;
      anyLayerUpdated = true;
    }

    // Update concrete layer (only when buildings change or viewport moves)
    if (this.concreteDirty || this.viewportDirty) {
      this.concreteLayer?.update(
        this.buildings,
        this.terrainData,
        this.visibleBounds,
        this.camera.zoomConfig,
        this.facilityDimensionsCache,
        this.roadTilesMap
      );
      this.concreteDirty = false;
      anyLayerUpdated = true;
    }

    // Update road layer (only when roads change, buildings change, or viewport moves)
    // Buildings affect road textures (urban vs country) via concrete proximity
    if (this.roadsDirty || this.buildingsDirty || this.viewportDirty) {
      this.roadLayer?.update(
        this.segments,
        this.roadTilesMap,
        this.terrainData,
        this.visibleBounds,
        this.camera.zoomConfig,
        this.buildings,
        this.facilityDimensionsCache
      );
      this.roadsDirty = false;
      anyLayerUpdated = true;
    }

    // Update building layer (only when buildings change or viewport moves)
    if (this.buildingsDirty || this.viewportDirty) {
      console.log(`[PixiRenderer] Updating building layer: ${this.buildings.length} buildings, layer=${!!this.buildingLayer}, mapSize=${this.mapWidth}x${this.mapHeight}`);
      this.buildingLayer?.update(
        this.buildings,
        this.facilityDimensionsCache,
        this.visibleBounds,
        this.camera.zoomConfig,
        this.hoveredBuilding,
        this.mapWidth,
        this.mapHeight
      );
      this.buildingsDirty = false;
      anyLayerUpdated = true;
    }

    // Update overlay layer (zones, placement, road preview)
    if (this.overlayDirty || this.viewportDirty) {
      // Calculate road hover state when in road drawing mode but not actively drawing
      let roadHoverState = null;
      if (this.roadDrawingMode && !this.roadDrawingState?.isDrawing) {
        const validation = this.isValidRoadStartPoint(this.mouseMapJ, this.mouseMapI);
        roadHoverState = {
          x: this.mouseMapJ,
          y: this.mouseMapI,
          isValid: validation.valid,
          message: validation.message
        };
      }

      this.overlayLayer?.update(
        this.zoneOverlayEnabled ? this.zoneOverlayData : null,
        this.zoneOverlayX1,
        this.zoneOverlayY1,
        this.placementPreview,
        this.roadDrawingState,
        this.visibleBounds,
        this.camera.zoomConfig,
        // Validation parameters
        this.buildings,
        this.segments,
        this.facilityDimensionsCache,
        this.roadTilesMap,
        roadHoverState
      );
      this.overlayDirty = false;
      // Note: overlay is in separate container, doesn't need game world sort
    }

    // PERFORMANCE: Mark for manual sort if any game layer was updated
    if (anyLayerUpdated) {
      this.needsManualSort = true;
    }
  }

  // =========================================================================
  // Coordinate Conversion
  // =========================================================================

  /**
   * Convert map coordinates (i, j) to screen coordinates
   */
  mapToScreen(i: number, j: number): Point {
    const config = this.camera.zoomConfig;
    const u = config.u;
    const rows = this.mapHeight;
    const cols = this.mapWidth;

    // Isometric projection (from Lander.pas)
    const screenX = u * (rows - i + j);
    const screenY = (u / 2) * ((rows - i) + (cols - j));

    return { x: screenX, y: screenY };
  }

  /**
   * Convert screen coordinates to map coordinates (i, j)
   */
  screenToMap(screenX: number, screenY: number): { i: number; j: number } {
    const config = this.camera.zoomConfig;
    const u = config.u;
    const rows = this.mapHeight;
    const cols = this.mapWidth;

    // Inverse isometric projection
    // Forward: screenX = u * (rows - i + j)
    // Forward: screenY = (u/2) * ((rows - i) + (cols - j))
    //
    // Let A = (screenX - camera.x) / u = rows - i + j
    // Let B = (screenY - camera.y) / (u/2) = rows - i + cols - j
    //
    // Adding: A + B = 2*rows + cols - 2*i  =>  i = rows + cols/2 - A/2 - B/2
    // From A: j = A - rows + i  =>  j = A/2 - B/2 + cols/2
    const A = (screenX - this.camera.x) / u;
    const B = (screenY - this.camera.y) / (u / 2);

    const i = rows + (cols - A - B) / 2;
    const j = (A - B + cols) / 2;

    return { i, j };
  }

  // =========================================================================
  // Public API - Data Loading
  // =========================================================================

  /**
   * Load terrain data
   */
  async loadTerrain(terrainData: TerrainData, terrainType: string, season: number): Promise<void> {
    this.terrainData = terrainData;
    this.mapWidth = terrainData.width;
    this.mapHeight = terrainData.height;

    // Initialize camera to center of map
    this.centerOnMap(Math.floor(this.mapWidth / 2), Math.floor(this.mapHeight / 2));

    // Load terrain textures into atlas
    await this.textureAtlasManager.loadTerrainTextures(terrainType, season);

    // Set map dimensions for overlay layer (critical for placement/road preview coordinate conversion)
    this.overlayLayer?.setMapDimensions(this.mapWidth, this.mapHeight);

    // Start texture load period - continuous updates for a period to apply async-loaded textures
    this.textureLoadStartTime = performance.now();

    this.viewportDirty = true;
    console.log(`[PixiRenderer] Loaded terrain ${this.mapWidth}x${this.mapHeight}, starting ${this.TEXTURE_LOAD_UPDATE_DURATION}ms texture loading period`);
  }

  /**
   * Set buildings data
   */
  setBuildings(buildings: MapBuilding[]): void {
    console.log(`[PixiRenderer] setBuildings called with ${buildings.length} buildings`);
    this.buildings = buildings;
    this.rebuildConcreteTilesMap(); // Rebuild concrete map for terrain layer
    this.buildingsDirty = true;
    this.concreteDirty = true; // Concrete depends on buildings
    this.viewportDirty = true;
  }

  /**
   * Set road segments
   */
  setSegments(segments: MapSegment[]): void {
    this.segments = segments;
    this.rebuildRoadTilesMap();
    this.roadsDirty = true;
    this.concreteDirty = true; // Concrete textures depend on road positions
    this.roadLayer?.invalidateTopologyCache(); // Clear topology cache when roads change
    this.viewportDirty = true;
  }

  /**
   * Set facility dimensions cache (legacy method - now uses global singleton)
   * Kept for API compatibility, passes to texture atlas manager
   */
  setFacilityDimensionsCache(cache: Map<string, FacilityDimensions>): void {
    // Note: Local storage removed - now using global singleton via getter
    // Still pass to texture atlas manager for building name lookups
    this.textureAtlasManager.setFacilityDimensionsCache(cache);
  }

  /**
   * Rebuild the road tiles map from segments
   */
  private rebuildRoadTilesMap(): void {
    this.roadTilesMap.clear();
    for (const segment of this.segments) {
      const { x1, y1, x2, y2 } = segment;
      if (x1 === x2) {
        // Vertical segment
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        for (let y = minY; y <= maxY; y++) {
          this.roadTilesMap.set(`${x1},${y}`, true);
        }
      } else if (y1 === y2) {
        // Horizontal segment
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        for (let x = minX; x <= maxX; x++) {
          this.roadTilesMap.set(`${x},${y1}`, true);
        }
      }
    }
  }

  /**
   * Rebuild the concrete tiles map from buildings
   * Concrete tiles are building footprints + 1 tile radius around them
   * Used to skip tall terrain rendering on concrete areas
   */
  private rebuildConcreteTilesMap(): void {
    this.concreteTilesMap.clear();
    const CONCRETE_RADIUS = 1;

    for (const building of this.buildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize ?? 1;
      const ysize = dims?.ysize ?? 1;

      // Mark concrete around building (expanded footprint)
      for (let di = -CONCRETE_RADIUS; di < ysize + CONCRETE_RADIUS; di++) {
        for (let dj = -CONCRETE_RADIUS; dj < xsize + CONCRETE_RADIUS; dj++) {
          const i = building.y + di;
          const j = building.x + dj;
          if (i >= 0 && j >= 0 && i < this.mapHeight && j < this.mapWidth) {
            // Key format matches what terrain layer expects: "i,j"
            this.concreteTilesMap.set(`${i},${j}`, true);
          }
        }
      }
    }
  }

  // =========================================================================
  // Public API - Camera Control
  // =========================================================================

  /**
   * Center camera on map coordinates
   */
  centerOnMap(i: number, j: number): void {
    const screenPos = this.mapToScreen(i, j);
    this.camera.x = this.app.screen.width / 2 - screenPos.x;
    this.camera.y = this.app.screen.height / 2 - screenPos.y;
    this.viewportDirty = true;
  }

  /**
   * Set zoom level (0-3)
   */
  setZoom(level: number): void {
    const newLevel = Math.max(0, Math.min(3, level));
    if (newLevel !== this.camera.zoomLevel) {
      // Get map coords at screen center before zoom
      const centerX = this.app.screen.width / 2;
      const centerY = this.app.screen.height / 2;
      const centerMap = this.screenToMap(centerX, centerY);

      // Change zoom
      this.camera.zoomLevel = newLevel;
      this.camera.zoomConfig = ZOOM_LEVELS[newLevel];

      // Mark all layers dirty since scale changes affect all sprites
      this.terrainDirty = true;
      this.roadsDirty = true;
      this.buildingsDirty = true;
      this.concreteDirty = true;
      this.overlayDirty = true;

      // Re-center on same map position (also sets viewportDirty)
      this.centerOnMap(centerMap.i, centerMap.j);
    }
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.camera.zoomLevel;
  }

  // =========================================================================
  // Public API - Mode Controls
  // =========================================================================

  /**
   * Enable/disable placement mode
   */
  setPlacementMode(enabled: boolean, buildingInfo?: { xsize: number; ysize: number }): void {
    this.placementMode = enabled;
    if (enabled && buildingInfo) {
      this.placementPreview = {
        i: this.mouseMapI,
        j: this.mouseMapJ,
        xsize: buildingInfo.xsize,
        ysize: buildingInfo.ysize
      };
    } else {
      this.placementPreview = null;
    }
    this.viewportDirty = true;
  }

  /**
   * Enable/disable road drawing mode
   */
  setRoadDrawingMode(enabled: boolean): void {
    this.roadDrawingMode = enabled;
    if (!enabled) {
      this.roadDrawingState = null;
    }
    this.viewportDirty = true;
  }

  /**
   * Enable/disable zone overlay
   */
  setZoneOverlay(enabled: boolean, data?: SurfaceData, x1?: number, y1?: number): void {
    this.zoneOverlayEnabled = enabled;
    this.zoneOverlayData = data ?? null;
    this.zoneOverlayX1 = x1 ?? 0;
    this.zoneOverlayY1 = y1 ?? 0;
    this.viewportDirty = true;
  }

  // =========================================================================
  // Validation Methods
  // =========================================================================

  /**
   * Check if building placement would collide with existing buildings or roads
   * @param i Row (Y coordinate)
   * @param j Column (X coordinate)
   * @param ysize Building height in tiles
   * @param xsize Building width in tiles
   */
  checkBuildingCollision(i: number, j: number, ysize: number, xsize: number): boolean {
    // Check each tile in building footprint
    for (let di = 0; di < ysize; di++) {
      for (let dj = 0; dj < xsize; dj++) {
        const checkI = i + di;
        const checkJ = j + dj;

        // Check against existing buildings
        for (const building of this.buildings) {
          const dims = this.facilityDimensionsCache.get(building.visualClass);
          const bw = dims?.xsize ?? 1;
          const bh = dims?.ysize ?? 1;

          if (checkJ >= building.x && checkJ < building.x + bw &&
              checkI >= building.y && checkI < building.y + bh) {
            return true; // Collision with building
          }
        }

        // Check against road segments
        for (const seg of this.segments) {
          const minX = Math.min(seg.x1, seg.x2);
          const maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2);
          const maxY = Math.max(seg.y1, seg.y2);

          if (checkJ >= minX && checkJ <= maxX &&
              checkI >= minY && checkI <= maxY) {
            return true; // Collision with road
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if a tile is adjacent to an existing road
   */
  isAdjacentToRoad(x: number, y: number): boolean {
    // Check all 8 neighbors
    const neighbors = [
      { dx: -1, dy: 0 },  // West
      { dx: 1, dy: 0 },   // East
      { dx: 0, dy: -1 },  // North
      { dx: 0, dy: 1 },   // South
      { dx: -1, dy: -1 }, // NW
      { dx: 1, dy: -1 },  // NE
      { dx: -1, dy: 1 },  // SW
      { dx: 1, dy: 1 },   // SE
    ];

    for (const { dx, dy } of neighbors) {
      if (this.roadTilesMap.has(`${x + dx},${y + dy}`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a tile has an existing road
   */
  hasRoadAt(x: number, y: number): boolean {
    return this.roadTilesMap.has(`${x},${y}`);
  }

  /**
   * Check if a road start point is valid (must connect to existing roads or be first road)
   */
  isValidRoadStartPoint(x: number, y: number): { valid: boolean; message: string } {
    // Check for building collision
    for (const building of this.buildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize ?? 1;
      const bh = dims?.ysize ?? 1;

      if (x >= building.x && x < building.x + bw &&
          y >= building.y && y < building.y + bh) {
        return { valid: false, message: 'Blocked by building' };
      }
    }

    // If no roads exist, allow first road
    if (this.roadTilesMap.size === 0) {
      return { valid: true, message: 'Click to start first road' };
    }

    // Check if adjacent to existing road or on existing road
    if (this.hasRoadAt(x, y) || this.isAdjacentToRoad(x, y)) {
      return { valid: true, message: 'Click to start drawing' };
    }

    return { valid: false, message: 'Must connect to road' };
  }

  /**
   * Generate staircase path between two points (like Canvas2D)
   */
  generateStaircasePath(x1: number, y1: number, x2: number, y2: number): Array<{ x: number; y: number }> {
    const path: Array<{ x: number; y: number }> = [];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let x = x1;
    let y = y1;
    let remainingX = absDx;
    let remainingY = absDy;

    path.push({ x, y });

    while (remainingX > 0 || remainingY > 0) {
      // Alternate between X and Y based on remaining distance
      if (remainingX >= remainingY && remainingX > 0) {
        x += sx;
        remainingX--;
      } else if (remainingY > 0) {
        y += sy;
        remainingY--;
      }
      path.push({ x, y });
    }

    return path;
  }

  // =========================================================================
  // Public API - Callbacks
  // =========================================================================

  setOnLoadZone(callback: (x: number, y: number, w: number, h: number) => void): void {
    this.onLoadZone = callback;
  }

  setOnBuildingClick(callback: (x: number, y: number, visualClass?: string) => void): void {
    this.onBuildingClick = callback;
  }

  setOnCancelPlacement(callback: () => void): void {
    this.onCancelPlacement = callback;
  }

  setOnFetchFacilityDimensions(callback: (visualClass: string) => Promise<FacilityDimensions | null>): void {
    this.onFetchFacilityDimensions = callback;
  }

  setOnRoadSegmentComplete(callback: (x1: number, y1: number, x2: number, y2: number) => void): void {
    this.onRoadSegmentComplete = callback;
  }

  setOnCancelRoadDrawing(callback: () => void): void {
    this.onCancelRoadDrawing = callback;
  }

  setOnViewportChange(callback: () => void): void {
    this.onViewportChange = callback;
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) { // Left click
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.mouseDownTime = Date.now(); // Track for short click detection

      if (this.roadDrawingMode) {
        const mapCoords = this.screenToMap(e.offsetX, e.offsetY);
        this.roadDrawingState = {
          isDrawing: true,
          startX: Math.floor(mapCoords.j),
          startY: Math.floor(mapCoords.i),
          endX: Math.floor(mapCoords.j),
          endY: Math.floor(mapCoords.i),
          isMouseDown: true,
          mouseDownTime: Date.now()
        };
        this.viewportDirty = true;
      }
    } else if (e.button === 2) { // Right click
      // Cancel road drawing or placement mode
      if (this.roadDrawingMode) {
        if (this.roadDrawingState?.isDrawing) {
          // Cancel current drawing
          this.roadDrawingState = null;
          this.viewportDirty = true;
        } else {
          // Cancel road drawing mode entirely
          this.onCancelRoadDrawing?.();
        }
      } else if (this.placementMode) {
        this.onCancelPlacement?.();
      }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update map coordinates under mouse
    // Use Math.round for isometric coordinates to center detection on tiles
    const mapCoords = this.screenToMap(x, y);
    this.mouseMapI = Math.round(mapCoords.i);
    this.mouseMapJ = Math.round(mapCoords.j);

    if (this.isDragging && !this.roadDrawingMode) {
      // Pan camera
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.camera.x += dx;
      this.camera.y += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.viewportDirty = true;
      // Notify adapter of viewport change for zone loading
      this.onViewportChange?.();
    }

    // Update road drawing preview
    if (this.roadDrawingState?.isDrawing) {
      this.roadDrawingState.endX = this.mouseMapJ;
      this.roadDrawingState.endY = this.mouseMapI;
      this.viewportDirty = true;
    } else if (this.roadDrawingMode) {
      // Update hover indicator when in road mode but not drawing
      this.viewportDirty = true;
    }

    // Update placement preview position
    if (this.placementPreview) {
      this.placementPreview.i = this.mouseMapI;
      this.placementPreview.j = this.mouseMapJ;
      this.viewportDirty = true;
    }

    // Update hovered building
    this.updateHoveredBuilding();
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return; // Only handle left click release

    const wasShortClick = this.isDragging && Date.now() - this.mouseDownTime < 200;
    this.isDragging = false;

    if (this.roadDrawingMode && this.roadDrawingState?.isDrawing) {
      // Complete road segment
      const { startX, startY, endX, endY } = this.roadDrawingState;
      if (this.onRoadSegmentComplete && (startX !== endX || startY !== endY)) {
        this.onRoadSegmentComplete(startX, startY, endX, endY);
      }
      this.roadDrawingState = null;
      this.viewportDirty = true;
    } else if (wasShortClick && !this.roadDrawingMode) {
      // Handle click
      if (this.placementMode) {
        // Place building - check collision first
        const hasCollision = this.checkBuildingCollision(
          this.mouseMapI,
          this.mouseMapJ,
          this.placementPreview?.ysize ?? 1,
          this.placementPreview?.xsize ?? 1
        );
        if (!hasCollision && this.onBuildingClick) {
          this.onBuildingClick(this.mouseMapJ, this.mouseMapI);
        }
      } else if (this.hoveredBuilding) {
        // Click on building
        if (this.onBuildingClick) {
          this.onBuildingClick(this.hoveredBuilding.x, this.hoveredBuilding.y, this.hoveredBuilding.visualClass);
        }
      }
    }
  }

  private onMouseLeave(): void {
    this.isDragging = false;
    this.hoveredBuilding = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    this.setZoom(this.camera.zoomLevel + delta);
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      this.isDragging = true;
      this.lastMouseX = touch.clientX;
      this.lastMouseY = touch.clientY;
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1 && this.isDragging) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - this.lastMouseX;
      const dy = touch.clientY - this.lastMouseY;
      this.camera.x += dx;
      this.camera.y += dy;
      this.lastMouseX = touch.clientX;
      this.lastMouseY = touch.clientY;
      this.viewportDirty = true;
      // Notify adapter of viewport change for zone loading
      this.onViewportChange?.();
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    this.isDragging = false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.placementMode) {
        this.onCancelPlacement?.();
      } else if (this.roadDrawingMode) {
        this.onCancelRoadDrawing?.();
      }
    } else if (e.key === 'd' || e.key === 'D') {
      // Debug mode - show road debug info for tile under cursor
      this.debugRoadAtMouse();
    }
  }

  /**
   * Update which building is under the mouse cursor
   */
  private updateHoveredBuilding(): void {
    const previousHovered = this.hoveredBuilding;
    this.hoveredBuilding = null;

    for (const building of this.buildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize ?? 1;
      const ysize = dims?.ysize ?? 1;

      // Check if mouse is within building footprint
      if (
        this.mouseMapJ >= building.x &&
        this.mouseMapJ < building.x + xsize &&
        this.mouseMapI >= building.y &&
        this.mouseMapI < building.y + ysize
      ) {
        this.hoveredBuilding = building;
        break;
      }
    }

    // Trigger re-render if hover state changed (for building highlight)
    if (previousHovered !== this.hoveredBuilding) {
      this.buildingsDirty = true;
      this.viewportDirty = true;
    }
  }

  // =========================================================================
  // Public API - Resize & Cleanup
  // =========================================================================

  /**
   * Resize the renderer
   */
  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    this.viewportDirty = true;
  }

  // =========================================================================
  // Debug Methods - Road Texture Analysis
  // =========================================================================

  /**
   * Get debug info for a specific road tile at map coordinates
   * Usage from console: renderer.debugRoadTile(i, j)
   */
  debugRoadTile(i: number, j: number): void {
    const info = this.roadLayer?.getDebugInfoForTile(i, j);
    if (info) {
      console.log('🛣️ Road Tile Debug Info:');
      console.table({
        position: `[${info.i}, ${info.j}]`,
        neighbors: `N:${info.neighbors.N} S:${info.neighbors.S} E:${info.neighbors.E} W:${info.neighbors.W}`,
        topology: info.topology,
        isUrban: info.isUrban,
        onWater: info.onWater,
        isSmooth: info.isSmooth,
        landId: info.landId?.toString(16),
        textureFile: info.textureFile,
      });
    } else {
      // No road found - show debug info for nearby roads
      const key = `${j},${i}`;
      console.log(`No road at [i=${i}, j=${j}] (key: "${key}")`);

      // Check nearby tiles for roads
      const nearby: string[] = [];
      for (let di = -2; di <= 2; di++) {
        for (let dj = -2; dj <= 2; dj++) {
          if (di === 0 && dj === 0) continue;
          const ni = i + di;
          const nj = j + dj;
          if (this.roadTilesMap.has(`${nj},${ni}`)) {
            nearby.push(`[${ni},${nj}]`);
          }
        }
      }
      if (nearby.length > 0) {
        console.log(`Nearby roads: ${nearby.join(', ')}`);
      } else {
        console.log('No roads within 2 tiles');
      }
    }
  }

  /**
   * Get debug info for the road tile under the mouse cursor
   * Usage from console: renderer.debugRoadAtMouse()
   */
  debugRoadAtMouse(): void {
    this.debugRoadTile(this.mouseMapI, this.mouseMapJ);
  }

  /**
   * Dump all road debug info to console
   * Usage from console: renderer.dumpRoadDebug()
   */
  dumpRoadDebug(): void {
    this.roadLayer?.dumpDebugToConsole();
  }

  /**
   * Get road debug info as JSON (for analysis)
   * Usage from console: copy(renderer.getRoadDebugJSON())
   */
  getRoadDebugJSON(): string {
    return this.roadLayer?.getDebugJSON() ?? '[]';
  }

  /**
   * Find and log potential road texture issues
   * Usage from console: renderer.findRoadIssues()
   */
  findRoadIssues(): void {
    const issues = this.roadLayer?.findPotentialIssues() ?? [];
    if (issues.length === 0) {
      console.log('✅ No road texture issues detected');
    } else {
      console.group(`⚠️ Found ${issues.length} potential road issues:`);
      for (const issue of issues) {
        const n = issue.neighbors;
        console.log(
          `[${issue.i},${issue.j}] ${issue.topology} | ` +
          `N:${n.N ? '✓' : '✗'} S:${n.S ? '✓' : '✗'} E:${n.E ? '✓' : '✗'} W:${n.W ? '✓' : '✗'} | ` +
          `water:${issue.onWater} urban:${issue.isUrban} | ` +
          `→ ${issue.textureFile}`
        );
      }
      console.groupEnd();
    }
  }

  /**
   * Get current mouse map coordinates (for debugging)
   */
  getMouseCoords(): { i: number; j: number } {
    return { i: this.mouseMapI, j: this.mouseMapJ };
  }

  /**
   * Destroy the renderer and clean up resources
   */
  destroy(): void {
    this.app.destroy(true);
    this.textureAtlasManager.destroy();
    this.spritePool.destroy();
    this.initialized = false;
  }
}
