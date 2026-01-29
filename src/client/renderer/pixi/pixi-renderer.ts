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

/** Render layer indices (z-order) */
export const enum RenderLayerIndex {
  TERRAIN = 0,
  CONCRETE = 1,
  ROADS = 2,
  TALL_TERRAIN = 3,
  BUILDINGS = 4,
  ZONE_OVERLAY = 5,
  PLACEMENT_PREVIEW = 6,
  ROAD_PREVIEW = 7,
  UI_OVERLAY = 8,
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

  // Placement/drawing modes
  private placementMode: boolean = false;
  private placementPreview: { i: number; j: number; xsize: number; ysize: number } | null = null;
  private roadDrawingMode: boolean = false;
  private roadDrawingState: RoadDrawingState | null = null;

  // Zone overlay
  private zoneOverlayEnabled: boolean = false;
  private zoneOverlayData: SurfaceData | null = null;

  // Viewport culling
  private visibleBounds: ViewportBounds = { minI: 0, maxI: 0, minJ: 0, maxJ: 0 };
  private viewportDirty: boolean = true;

  // Facility dimensions
  private facilityDimensionsCache: Map<string, FacilityDimensions> = new Map();

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onCancelPlacement: (() => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;
  private onRoadSegmentComplete: ((x1: number, y1: number, x2: number, y2: number) => void) | null = null;
  private onCancelRoadDrawing: (() => void) | null = null;

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
    this.worldContainer.sortableChildren = true;
    this.app.stage.addChild(this.worldContainer);

    // Create layer containers (sorted by z-index)
    for (let i = 0; i <= RenderLayerIndex.UI_OVERLAY; i++) {
      const layer = new Container();
      layer.zIndex = i;
      layer.sortableChildren = true;
      this.layers.push(layer);

      // UI_OVERLAY should be fixed on screen, not in world space
      if (i === RenderLayerIndex.UI_OVERLAY) {
        this.app.stage.addChild(layer);
      } else {
        this.worldContainer.addChild(layer);
      }
    }

    // Initialize layer renderers
    this.terrainLayer = new PixiTerrainLayer(
      this.layers[RenderLayerIndex.TERRAIN],
      this.layers[RenderLayerIndex.TALL_TERRAIN],
      this.textureAtlasManager,
      this.spritePool
    );

    this.concreteLayer = new PixiConcreteLayer(
      this.layers[RenderLayerIndex.CONCRETE],
      this.textureAtlasManager,
      this.spritePool
    );

    this.roadLayer = new PixiRoadLayer(
      this.layers[RenderLayerIndex.ROADS],
      this.textureAtlasManager,
      this.spritePool
    );

    this.buildingLayer = new PixiBuildingLayer(
      this.layers[RenderLayerIndex.BUILDINGS],
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
      this.viewportDirty = false;
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
   */
  private updateLayers(): void {
    if (!this.terrainData) return;

    // Update world container position (camera offset)
    this.worldContainer.x = this.camera.x;
    this.worldContainer.y = this.camera.y;

    // During texture loading, update terrain every frame
    const isTextureLoading = this.textureLoadStartTime > 0 &&
      (performance.now() - this.textureLoadStartTime < this.TEXTURE_LOAD_UPDATE_DURATION);

    // Update terrain layer (always update when viewport moves or textures loading)
    if (this.terrainDirty || this.viewportDirty || isTextureLoading) {
      this.terrainLayer?.update(
        this.terrainData,
        this.visibleBounds,
        this.camera.zoomConfig
      );
      this.terrainDirty = false;
    }

    // Update concrete layer (only when buildings change or viewport moves)
    if (this.concreteDirty || this.viewportDirty) {
      this.concreteLayer?.update(
        this.buildings,
        this.terrainData,
        this.visibleBounds,
        this.camera.zoomConfig
      );
      this.concreteDirty = false;
    }

    // Update road layer (only when roads change or viewport moves)
    if (this.roadsDirty || this.viewportDirty) {
      this.roadLayer?.update(
        this.segments,
        this.roadTilesMap,
        this.terrainData,
        this.visibleBounds,
        this.camera.zoomConfig
      );
      this.roadsDirty = false;
    }

    // Update building layer (only when buildings change or viewport moves)
    if (this.buildingsDirty || this.viewportDirty) {
      this.buildingLayer?.update(
        this.buildings,
        this.facilityDimensionsCache,
        this.visibleBounds,
        this.camera.zoomConfig,
        this.hoveredBuilding
      );
      this.buildingsDirty = false;
    }

    // Update overlay layer (zones, placement, road preview)
    if (this.overlayDirty || this.viewportDirty) {
      this.overlayLayer?.update(
        this.zoneOverlayEnabled ? this.zoneOverlayData : null,
        this.placementPreview,
        this.roadDrawingState,
        this.visibleBounds,
        this.camera.zoomConfig
      );
      this.overlayDirty = false;
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

    // Start texture load period - continuous updates for a period to apply async-loaded textures
    this.textureLoadStartTime = performance.now();

    this.viewportDirty = true;
    console.log(`[PixiRenderer] Loaded terrain ${this.mapWidth}x${this.mapHeight}, starting ${this.TEXTURE_LOAD_UPDATE_DURATION}ms texture loading period`);
  }

  /**
   * Set buildings data
   */
  setBuildings(buildings: MapBuilding[]): void {
    this.buildings = buildings;
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
    this.roadLayer?.invalidateTopologyCache(); // Clear topology cache when roads change
    this.viewportDirty = true;
  }

  /**
   * Set facility dimensions cache
   */
  setFacilityDimensionsCache(cache: Map<string, FacilityDimensions>): void {
    this.facilityDimensionsCache = cache;
    // Also pass to texture atlas manager for building name lookups
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
  setZoneOverlay(enabled: boolean, data?: SurfaceData): void {
    this.zoneOverlayEnabled = enabled;
    this.zoneOverlayData = data ?? null;
    this.viewportDirty = true;
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

  // =========================================================================
  // Event Handlers
  // =========================================================================

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) { // Left click
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

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
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.app.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update map coordinates under mouse
    const mapCoords = this.screenToMap(x, y);
    this.mouseMapI = Math.floor(mapCoords.i);
    this.mouseMapJ = Math.floor(mapCoords.j);

    if (this.isDragging && !this.roadDrawingMode) {
      // Pan camera
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.camera.x += dx;
      this.camera.y += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.viewportDirty = true;
    }

    // Update road drawing preview
    if (this.roadDrawingState?.isDrawing) {
      this.roadDrawingState.endX = this.mouseMapJ;
      this.roadDrawingState.endY = this.mouseMapI;
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
    const wasShortClick = this.isDragging && Date.now() - (this.roadDrawingState?.mouseDownTime ?? 0) < 200;
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
        // Place building
        if (this.onBuildingClick) {
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
    }
  }

  /**
   * Update which building is under the mouse cursor
   */
  private updateHoveredBuilding(): void {
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
