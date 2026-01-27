/**
 * IsometricThreeRenderer
 *
 * Three.js-based isometric renderer for GPU-accelerated rendering.
 * Phase 2: Terrain System - Scene setup, camera, terrain chunk rendering.
 *
 * This renderer will eventually replace IsometricMapRenderer with:
 * - GPU-accelerated rendering via WebGL
 * - Chunk-based terrain with merged geometry
 * - Sprites for buildings
 * - renderOrder-based painter's algorithm (no per-frame sorting)
 */

import * as THREE from 'three';
import { CoordinateMapper3D } from './CoordinateMapper3D';
import { CameraController } from './CameraController';
import { TextureAtlasManager } from './TextureAtlasManager';
import { TerrainChunkManager, TerrainDataProvider } from './TerrainChunkManager';
import { RoadRenderer } from './RoadRenderer';
import { ConcreteRenderer } from './ConcreteRenderer';
import { BuildingRenderer } from './BuildingRenderer';
import { PreviewManager, PlacementParams, RoadDrawingState, RoadValidation } from './PreviewManager';
import { TerrainData, TileBounds, Season } from '../../../shared/map-config';
import { TerrainLoader } from '../terrain-loader';
import { MapBuilding, MapSegment } from '../../../shared/types';
import { SurfaceData } from '../../../shared/types/domain-types';

// Layer constants for renderOrder
export const RENDER_LAYER = {
  TERRAIN: 0,
  CONCRETE: 1,
  ROADS: 2,
  TALL_TERRAIN: 3,
  BUILDINGS: 4,
  ZONE_OVERLAY: 5,
  UI: 6
} as const;

export interface IsometricThreeRendererOptions {
  antialias?: boolean;
  backgroundColor?: number;
  enableDebug?: boolean;
}

export class IsometricThreeRenderer {
  // Core Three.js objects
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;

  // Controllers
  private cameraController: CameraController;
  private coordinateMapper: CoordinateMapper3D;

  // Terrain system
  private terrainLoader: TerrainLoader;
  private atlasManager: TextureAtlasManager;
  private terrainChunkManager: TerrainChunkManager | null = null;

  // Map object renderers
  private roadRenderer: RoadRenderer | null = null;
  private concreteRenderer: ConcreteRenderer | null = null;
  private buildingRenderer: BuildingRenderer | null = null;

  // Preview manager
  private previewManager: PreviewManager | null = null;

  // Canvas reference
  private canvas: HTMLCanvasElement;
  private canvasId: string;

  // Map state
  private mapLoaded: boolean = false;
  private mapName: string = '';
  private terrainData: TerrainData | null = null;
  private buildings: MapBuilding[] = [];
  private segments: MapSegment[] = [];

  // Test grid (Phase 1 only - can be removed after terrain works)
  private testGridGroup: THREE.Group | null = null;

  // Animation state
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  // Debug
  private debugMode: boolean = false;
  private stats: { fps: number; drawCalls: number; frameTime: number } = { fps: 0, drawCalls: 0, frameTime: 0 };
  private fpsFrames: number = 0;
  private fpsLastTime: number = performance.now();
  private frameTimeHistory: number[] = [];

  // Callbacks (matching existing renderer API)
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<any>) | null = null;
  private onCancelPlacement: (() => void) | null = null;
  private onRoadSegmentComplete: ((x1: number, y1: number, x2: number, y2: number) => void) | null = null;
  private onCancelRoadDrawing: (() => void) | null = null;

  // Mouse interaction state
  private hoveredBuilding: MapBuilding | null = null;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Zone loading state
  private cachedZones: Set<string> = new Set();
  private loadingZones: Set<string> = new Set();
  private zoneCheckDebounceTimer: number | null = null;
  private readonly ZONE_CHECK_DEBOUNCE_MS = 300;
  private readonly ZONE_SIZE = 64;

  // Building placement preview state
  private placementMode: boolean = false;
  private placementPreview: PlacementParams | null = null;

  // Road drawing preview state
  private roadDrawingMode: boolean = false;
  private roadDrawingState: RoadDrawingState = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0
  };
  private readonly ROAD_COST_PER_TILE = 2000000;

  // Zone overlay state
  private zoneOverlayEnabled: boolean = false;
  private zoneOverlayData: SurfaceData | null = null;
  private zoneOverlayX1: number = 0;
  private zoneOverlayY1: number = 0;

  // Tooltip element
  private tooltipElement: HTMLDivElement | null = null;

  constructor(canvasId: string, options: IsometricThreeRendererOptions = {}) {
    this.canvasId = canvasId;

    // Get or create canvas
    let canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas with id "${canvasId}" not found`);
    }
    this.canvas = canvas;

    // Check WebGL support
    if (!this.checkWebGLSupport()) {
      throw new Error('WebGL is not supported in this browser');
    }

    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(options.backgroundColor ?? 0x1a1a2e);

    // Create orthographic camera
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;

    console.log(`[IsometricThreeRenderer] Canvas dimensions at init: ${width}x${height} (clientWidth=${canvas.clientWidth}, clientHeight=${canvas.clientHeight})`);

    this.camera = new THREE.OrthographicCamera(
      -width / 2, width / 2,
      height / 2, -height / 2,
      0.1, 10000
    );

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: options.antialias ?? true,
      alpha: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Enable sorting by renderOrder for transparent objects
    this.renderer.sortObjects = true;

    // Initialize coordinate mapper (default 2000x2000 map)
    this.coordinateMapper = new CoordinateMapper3D(2000, 2000);

    // Initialize terrain system
    this.terrainLoader = new TerrainLoader();
    this.atlasManager = new TextureAtlasManager();

    // Initialize camera controller (disable built-in event handlers, we'll handle mouse events ourselves)
    this.cameraController = new CameraController(
      this.camera,
      this.canvas,
      this.coordinateMapper,
      { enablePan: false, enableZoom: false }
    );

    // Set up camera change callback to update terrain and re-render
    this.cameraController.setOnCameraChange(() => {
      this.updateVisibleChunks();
      this.render();
    });

    // Center camera on map
    const center = this.coordinateMapper.getMapCenterWorld();
    this.cameraController.centerOnWorld(center.x, center.z);

    // Set up resize observer
    this.setupResizeObserver();

    // Set up mouse event listeners
    this.setupMouseEventListeners();

    // Create tooltip element
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'three-renderer-tooltip';
    this.tooltipElement.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      pointer-events: none;
      display: none;
      z-index: 1000;
    `;
    document.body.appendChild(this.tooltipElement);

    // Debug mode
    this.debugMode = options.enableDebug ?? false;

    // Initial render
    this.render();
  }

  /**
   * Check if WebGL is supported
   */
  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Set up resize observer for canvas
   */
  private setupResizeObserver(): void {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        if (width > 0 && height > 0) {
          this.handleResize(width, height);
        }
      }
    });
    resizeObserver.observe(this.canvas);
  }

  /**
   * Handle canvas resize
   */
  private handleResize(width: number, height: number): void {
    console.log(`[IsometricThreeRenderer] handleResize called: ${width}x${height}`);
    this.renderer.setSize(width, height);
    this.cameraController.handleResize(width, height);
    this.render();
  }

  /**
   * Set up mouse event listeners
   */
  private setupMouseEventListeners(): void {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Handle mouse down event
   */
  private onMouseDown(e: MouseEvent): void {
    if (e.button === 2) { // Right click
      e.preventDefault();

      // Cancel placement or road drawing mode
      if (this.placementMode && this.onCancelPlacement) {
        this.onCancelPlacement();
        return;
      }

      if (this.roadDrawingMode && this.onCancelRoadDrawing) {
        this.onCancelRoadDrawing();
        return;
      }

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
      // CameraController will handle panning via panByPixels() during mousemove
    }

    if (e.button === 0) { // Left click
      // Handle road drawing
      if (this.roadDrawingMode) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);
        const mapPos = this.coordinateMapper.worldToMap(worldPos.x, worldPos.z);

        this.roadDrawingState.isDrawing = true;
        this.roadDrawingState.startX = mapPos.y; // j
        this.roadDrawingState.startY = mapPos.x; // i
        this.roadDrawingState.endX = mapPos.y;
        this.roadDrawingState.endY = mapPos.x;

        this.previewManager?.updateRoadPathPreview(this.roadDrawingState);
        this.render();
        return;
      }

      // Handle placement mode (client handles the placement)
      if (this.placementMode) {
        return;
      }

      // Check building click
      if (this.buildingRenderer && this.onBuildingClick) {
        const building = this.buildingRenderer.getBuildingAtPosition(e.clientX, e.clientY, this.camera);
        if (building) {
          this.onBuildingClick(building.x, building.y, building.visualClass);
        }
      }
    }
  }

  /**
   * Handle mouse move event
   */
  private onMouseMove(e: MouseEvent): void {
    // Handle right-click dragging (panning)
    if (e.buttons === 2) { // Right button is held down
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      // Pan camera by pixel delta
      this.cameraController.panByPixels(dx, dy);

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // Update visible chunks during pan
      this.updateVisibleChunks();

      // NOTE: Do NOT call checkVisibleZones() during drag to prevent server spam
      // Zone loading will be triggered AFTER drag stops (in onMouseUp/onMouseLeave)
      return;
    }

    // Get world and map position
    const worldPos = this.screenToWorld(e.clientX, e.clientY);
    const mapPos = this.coordinateMapper.worldToMap(worldPos.x, worldPos.z);

    // Handle building placement preview
    if (this.placementMode && this.placementPreview) {
      this.placementPreview.i = mapPos.x;
      this.placementPreview.j = mapPos.y;
      this.previewManager?.updateBuildingPreviewPosition(mapPos.x, mapPos.y);

      // Update tooltip
      this.updatePlacementTooltip(mapPos.x, mapPos.y);
      this.render();
      return;
    }

    // Handle road drawing preview
    if (this.roadDrawingMode) {
      if (this.roadDrawingState.isDrawing) {
        // Update endpoint during drag
        this.roadDrawingState.endX = mapPos.y;
        this.roadDrawingState.endY = mapPos.x;

        const validation = this.previewManager?.updateRoadPathPreview(this.roadDrawingState);
        this.updateRoadTooltip(mapPos.x, mapPos.y, validation);
      } else {
        // Show hover indicator
        const validation = this.previewManager?.updateRoadHoverPreview(mapPos.x, mapPos.y);
        this.updateRoadHoverTooltip(mapPos.x, mapPos.y, validation);
      }

      this.render();
      return;
    }

    // Update hover state for buildings
    if (this.buildingRenderer) {
      const building = this.buildingRenderer.getBuildingAtPosition(e.clientX, e.clientY, this.camera);

      if (building !== this.hoveredBuilding) {
        this.hoveredBuilding = building;
        this.buildingRenderer.setHoveredBuilding(building);
        this.updateCursor();
        this.render();
      }
    }
  }

  /**
   * Handle mouse up event
   */
  private onMouseUp(e: MouseEvent): void {
    // Handle road drawing completion
    if (e.button === 0 && this.roadDrawingMode && this.roadDrawingState.isDrawing) {
      this.roadDrawingState.isDrawing = false;

      // Fire callback if road segment is complete
      if (this.onRoadSegmentComplete) {
        this.onRoadSegmentComplete(
          this.roadDrawingState.startX,
          this.roadDrawingState.startY,
          this.roadDrawingState.endX,
          this.roadDrawingState.endY
        );
      }

      // Hide tooltip after completion
      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }

      this.render();
      return;
    }

    if (e.button === 2) { // Right click released
      this.updateCursor();
      // CRITICAL: Load zones AFTER drag stops (matching old renderer behavior)
      this.checkVisibleZones();
    }
  }

  /**
   * Handle mouse leave event
   */
  private onMouseLeave(): void {
    this.updateCursor();
    // CRITICAL: Load zones AFTER drag stops (matching old renderer behavior)
    this.checkVisibleZones();
  }

  /**
   * Handle mouse wheel event (zoom)
   */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();

    const oldZoom = this.cameraController.getZoomLevel();
    const newZoom = e.deltaY > 0
      ? Math.max(0, oldZoom - 1)
      : Math.min(3, oldZoom + 1);

    if (newZoom !== oldZoom) {
      this.setZoom(newZoom);
      this.checkVisibleZones();
    }
  }

  /**
   * Update cursor based on hover state
   */
  private updateCursor(): void {
    if (this.placementMode || this.roadDrawingMode) {
      this.canvas.style.cursor = 'crosshair';
    } else if (this.hoveredBuilding) {
      this.canvas.style.cursor = 'pointer';
    } else {
      this.canvas.style.cursor = 'grab';
    }
  }

  /**
   * Create a test grid of colored tiles (Phase 1 validation)
   * Renders a grid of diamond-shaped tiles to verify coordinate system
   */
  public createTestGrid(startI: number, startJ: number, countI: number, countJ: number): void {
    // Remove existing test grid
    if (this.testGridGroup) {
      this.scene.remove(this.testGridGroup);
      this.testGridGroup = null;
    }

    this.testGridGroup = new THREE.Group();

    // Create diamond geometry for tiles
    const tileWidth = CoordinateMapper3D.getTileWidth();
    const tileHeight = CoordinateMapper3D.getTileHeight();

    // Diamond shape vertices (flat on XZ plane, Y=0)
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    const diamondShape = new THREE.Shape();
    diamondShape.moveTo(0, -halfH);    // Top (in local space, -Z is "up" visually)
    diamondShape.lineTo(halfW, 0);     // Right
    diamondShape.lineTo(0, halfH);     // Bottom
    diamondShape.lineTo(-halfW, 0);    // Left
    diamondShape.closePath();

    const geometry = new THREE.ShapeGeometry(diamondShape);

    // Rotate geometry to lie flat on XZ plane (Shape is on XY by default)
    geometry.rotateX(-Math.PI / 2);

    // Create tiles
    for (let i = startI; i < startI + countI; i++) {
      for (let j = startJ; j < startJ + countJ; j++) {
        // Color based on position (checkerboard with variations)
        const isEven = (i + j) % 2 === 0;
        const hue = ((i * 7 + j * 13) % 360) / 360;
        const saturation = 0.5 + (isEven ? 0.2 : 0);
        const lightness = 0.4 + (isEven ? 0.1 : 0);

        const color = new THREE.Color();
        color.setHSL(hue, saturation, lightness);

        const material = new THREE.MeshBasicMaterial({
          color: color,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Position tile
        const worldPos = this.coordinateMapper.mapToWorld(i, j);
        mesh.position.set(worldPos.x, 0.01, worldPos.z); // Slight Y offset to prevent z-fighting

        // Set render order based on painter's algorithm
        mesh.renderOrder = this.coordinateMapper.getRenderOrder(i, j, RENDER_LAYER.TERRAIN);

        this.testGridGroup.add(mesh);
      }
    }

    this.scene.add(this.testGridGroup);
    this.render();

    console.log(`[IsometricThreeRenderer] Created test grid: ${countI}x${countJ} tiles`);
  }

  /**
   * Render the scene
   */
  public render(): void {
    const frameStart = performance.now();

    this.renderer.render(this.scene, this.camera);

    if (this.debugMode) {
      const frameEnd = performance.now();
      const frameTime = frameEnd - frameStart;
      this.updateStats(frameTime);
    }
  }

  /**
   * Start continuous render loop
   */
  public startRenderLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const animate = (): void => {
      if (!this.isRunning) return;
      this.animationFrameId = requestAnimationFrame(animate);
      this.render();
    };

    animate();
  }

  /**
   * Stop render loop
   */
  public stopRenderLoop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Update debug statistics
   */
  private updateStats(frameTime: number): void {
    const info = this.renderer.info;
    this.stats.drawCalls = info.render.calls;

    // Track frame time
    this.frameTimeHistory.push(frameTime);
    if (this.frameTimeHistory.length > 60) {
      this.frameTimeHistory.shift();
    }

    // Calculate average frame time
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    this.stats.frameTime = avgFrameTime;

    // Calculate FPS (update every 500ms)
    this.fpsFrames++;
    const now = performance.now();
    const elapsed = now - this.fpsLastTime;

    if (elapsed >= 500) {
      this.stats.fps = Math.round((this.fpsFrames * 1000) / elapsed);
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }
  }

  // ============================================
  // Public API (matching existing renderer)
  // ============================================

  /**
   * Load a map and initialize terrain rendering
   */
  public async loadMap(mapName: string): Promise<TerrainData | null> {
    console.log(`[IsometricThreeRenderer] loadMap called for: ${mapName}`);
    this.mapName = mapName;

    try {
      // Load terrain data
      const terrainData = await this.terrainLoader.loadMap(mapName);
      this.terrainData = terrainData;

      // Update coordinate mapper with actual map dimensions
      this.coordinateMapper.setMapDimensions(terrainData.width, terrainData.height);

      // Set terrain type for atlas manager
      const terrainType = this.getTerrainTypeForMap(mapName);
      this.atlasManager.setTerrainType(terrainType);

      // Fetch terrain info and update season if needed
      await this.fetchTerrainInfo(terrainType);

      // Initialize terrain chunk manager if not already created
      if (!this.terrainChunkManager) {
        this.terrainChunkManager = new TerrainChunkManager(
          this.scene,
          this.coordinateMapper,
          this.atlasManager
        );
      }

      // Create terrain data provider that wraps TerrainLoader
      const terrainProvider: TerrainDataProvider = {
        getTextureId: (i: number, j: number) => this.terrainLoader.getTextureId(j, i),
        getMapWidth: () => terrainData.width,
        getMapHeight: () => terrainData.height
      };

      this.terrainChunkManager.setTerrainProvider(terrainProvider);

      // Initialize road renderer
      if (!this.roadRenderer) {
        this.roadRenderer = new RoadRenderer(this.scene, this.coordinateMapper);
      }

      // Initialize concrete renderer
      if (!this.concreteRenderer) {
        this.concreteRenderer = new ConcreteRenderer(this.scene, this.coordinateMapper);
      }

      // Initialize building renderer
      if (!this.buildingRenderer) {
        this.buildingRenderer = new BuildingRenderer(this.scene, this.coordinateMapper);
        this.buildingRenderer.setOnTextureLoaded(() => {
          this.render(); // Re-render when building textures load
        });
      }

      // Initialize preview manager
      if (!this.previewManager) {
        this.previewManager = new PreviewManager(
          this.scene,
          this.coordinateMapper,
          () => this.buildings,
          () => this.segments
        );
      }

      // Update scale factor based on current zoom
      const zoomLevel = this.cameraController.getZoomLevel();
      const scaleFactor = this.getScaleFactorForZoom(zoomLevel);
      this.buildingRenderer.setScaleFactor(scaleFactor);

      // Center camera on map
      const centerI = Math.floor(terrainData.height / 2);
      const centerJ = Math.floor(terrainData.width / 2);
      this.cameraController.centerOnMapCoords(centerI, centerJ);

      // Zoom to fit entire map in view
      this.cameraController.fitMapToView(terrainData.width, terrainData.height);

      // Clear cached zones when loading new map
      this.cachedZones.clear();
      this.loadingZones.clear();
      this.buildings = [];
      this.segments = [];

      // Initial update of visible chunks
      this.updateVisibleChunks();

      this.mapLoaded = true;
      console.log(`[IsometricThreeRenderer] Map loaded: ${terrainData.width}x${terrainData.height}`);

      // NOTE: Do NOT call checkVisibleZones() here - let the callback be set first
      // Zone loading will be triggered via triggerZoneCheck() when setOnLoadZone() is called
      // (See map-navigation-ui.ts setOnLoadZone method which calls triggerZoneCheck)

      return terrainData;
    } catch (error) {
      console.error(`[IsometricThreeRenderer] Failed to load map:`, error);

      // Fallback to test grid if map loading fails
      this.createTestGrid(990, 990, 20, 20);
      this.mapLoaded = true;

      return null;
    }
  }

  /**
   * Get terrain type for a map name
   */
  private getTerrainTypeForMap(mapName: string): string {
    const MAP_TERRAIN_TYPES: Record<string, string> = {
      'Shamba': 'Alien Swamp',
      'Antiqua': 'Earth',
      'Zyrane': 'Earth',
    };
    const terrainType = MAP_TERRAIN_TYPES[mapName] || 'Earth';
    console.log(`[IsometricThreeRenderer] Map '${mapName}' -> Terrain type '${terrainType}'`);
    return terrainType;
  }

  /**
   * Fetch terrain info and update season if needed
   */
  private async fetchTerrainInfo(terrainType: string): Promise<void> {
    try {
      const response = await fetch(`/api/terrain-info/${encodeURIComponent(terrainType)}`);

      if (!response.ok) {
        console.warn(`[IsometricThreeRenderer] Failed to fetch terrain info for ${terrainType}`);
        return;
      }

      const info = await response.json() as {
        terrainType: string;
        availableSeasons: Season[];
        defaultSeason: Season;
      };

      console.log(`[IsometricThreeRenderer] Terrain info for '${terrainType}': availableSeasons=[${info.availableSeasons.join(',')}], defaultSeason=${info.defaultSeason}`);

      // If current season is not available, switch to default
      const currentSeason = this.atlasManager.getSeason();
      if (!info.availableSeasons.includes(currentSeason)) {
        console.log(`[IsometricThreeRenderer] Current season ${currentSeason} not available for ${terrainType}, switching to ${info.defaultSeason}`);
        this.atlasManager.setSeason(info.defaultSeason);
        // Clear atlas to reload with new season
        this.atlasManager.clearCurrentAtlas();
      }
    } catch (error) {
      console.warn(`[IsometricThreeRenderer] Error fetching terrain info:`, error);
    }
  }

  /**
   * Update visible terrain chunks based on camera position
   */
  private updateVisibleChunks(): void {
    if (!this.terrainData) return;

    // Get visible bounds from camera
    const visibleBounds = this.coordinateMapper.getVisibleBounds(
      this.camera,
      this.renderer,
      2 // padding
    );

    // Get building occupancy data (needed by roads and concrete)
    const occupiedTiles = this.buildingRenderer?.getOccupiedTiles() ?? new Set<string>();

    // Update terrain chunks
    if (this.terrainChunkManager) {
      this.terrainChunkManager.updateVisibleChunks(visibleBounds);
    }

    // Update roads (needs occupied tiles to avoid rendering roads under buildings)
    if (this.roadRenderer && this.segments.length > 0) {
      this.roadRenderer.updateVisibleRoads(visibleBounds, occupiedTiles);
    }

    // Update concrete (requires building occupancy data)
    if (this.concreteRenderer && this.buildings.length > 0) {
      this.concreteRenderer.updateVisibleConcrete(visibleBounds, occupiedTiles);
    }

    // Update buildings
    if (this.buildingRenderer && this.buildings.length > 0) {
      this.buildingRenderer.updateVisibleBuildings(visibleBounds);
    }

    // Update zone overlay visibility
    if (this.zoneOverlayEnabled && this.previewManager) {
      this.previewManager.updateZoneOverlayVisibility(visibleBounds);
    }
  }

  /**
   * Get scale factor for zoom level
   * Building textures are designed for 64x32 tile size (zoom level 3)
   */
  private getScaleFactorForZoom(zoomLevel: number): number {
    const zoomScales = [0.25, 0.5, 1.0, 2.0];
    return zoomScales[Math.max(0, Math.min(3, zoomLevel))] ?? 1.0;
  }

  /**
   * Check if map is loaded
   */
  public isLoaded(): boolean {
    return this.mapLoaded;
  }

  /**
   * Center camera on map coordinates
   */
  public centerOn(x: number, y: number): void {
    this.cameraController.centerOnMapCoords(x, y);
    this.checkVisibleZones();
  }

  /**
   * Get camera position in map coordinates
   */
  public getCameraPosition(): { x: number; y: number } {
    const target = this.cameraController.getTargetMapCoords();
    return { x: target.i, y: target.j };
  }

  /**
   * Set zoom level (0-3)
   */
  public setZoom(level: number): void {
    this.cameraController.setZoomLevel(level);

    // Update building scale factor
    if (this.buildingRenderer) {
      const scaleFactor = this.getScaleFactorForZoom(level);
      this.buildingRenderer.setScaleFactor(scaleFactor);
    }
  }

  /**
   * Get current zoom level
   */
  public getZoom(): number {
    return this.cameraController.getZoomLevel();
  }

  /**
   * Set callback for zone loading
   */
  public setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void): void {
    this.onLoadZone = callback;
  }

  /**
   * Set callback for building clicks
   */
  public setBuildingClickCallback(callback: (x: number, y: number, visualClass?: string) => void): void {
    this.onBuildingClick = callback;
  }

  public setFetchFacilityDimensionsCallback(callback: (visualClass: string) => Promise<any>): void {
    this.onFetchFacilityDimensions = callback;
  }

  public setCancelPlacementCallback(callback: () => void): void {
    this.onCancelPlacement = callback;
  }

  public setRoadSegmentCompleteCallback(callback: (x1: number, y1: number, x2: number, y2: number) => void): void {
    this.onRoadSegmentComplete = callback;
  }

  public setCancelRoadDrawingCallback(callback: () => void): void {
    this.onCancelRoadDrawing = callback;
  }

  /**
   * Set debug mode
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Get debug stats
   */
  public getStats(): { fps: number; drawCalls: number; frameTime: number } {
    return { ...this.stats };
  }

  /**
   * Get the Three.js scene (for advanced usage)
   */
  public getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the coordinate mapper
   */
  public getCoordinateMapper(): CoordinateMapper3D {
    return this.coordinateMapper;
  }

  /**
   * Get the camera controller
   */
  public getCameraController(): CameraController {
    return this.cameraController;
  }

  /**
   * Set the season for terrain textures
   */
  public setSeason(season: Season): void {
    this.atlasManager.setSeason(season);
    // Rebuild terrain chunks with new textures
    if (this.terrainChunkManager) {
      this.terrainChunkManager.rebuildChunks();
    }
    this.render();
  }

  /**
   * Get the current season
   */
  public getSeason(): Season {
    return this.atlasManager.getSeason();
  }

  /**
   * Update map data (buildings and road segments)
   * Called when new map data is received from server
   */
  public updateMapData(mapData: {
    x: number;
    y: number;
    w: number;
    h: number;
    buildings: MapBuilding[];
    segments: MapSegment[];
  }): void {
    console.log(`[IsometricThreeRenderer] updateMapData: ${mapData.buildings.length} buildings, ${mapData.segments.length} segments`);

    // Mark this zone as cached
    const zoneKey = `${mapData.x},${mapData.y}`;
    this.cachedZones.add(zoneKey);
    this.loadingZones.delete(zoneKey);

    // Append new data to existing data (zones accumulate)
    this.buildings.push(...mapData.buildings);
    this.segments.push(...mapData.segments);

    // Update renderers
    if (this.roadRenderer) {
      this.roadRenderer.addSegments(mapData.segments);
    }

    if (this.buildingRenderer) {
      this.buildingRenderer.addBuildings(mapData.buildings);
    }

    // Update visible chunks and objects (concrete will get occupiedTiles during update)
    this.updateVisibleChunks();

    // Render
    this.render();
  }

  /**
   * Check and load zones for visible area
   */
  private checkVisibleZones(): void {
    if (!this.onLoadZone) {
      return;
    }

    // Debounce zone checking
    if (this.zoneCheckDebounceTimer) {
      clearTimeout(this.zoneCheckDebounceTimer);
    }

    this.zoneCheckDebounceTimer = window.setTimeout(() => {
      this.loadVisibleZones();
    }, this.ZONE_CHECK_DEBOUNCE_MS);
  }

  /**
   * Load zones for currently visible area
   */
  private loadVisibleZones(): void {
    if (!this.onLoadZone || !this.terrainData) {
      return;
    }

    const bounds = this.coordinateMapper.getVisibleBounds(this.camera, this.renderer, 2);

    // FIX: Ensure min < max (bounds can be inverted depending on camera orientation)
    const minI = Math.min(bounds.minI, bounds.maxI);
    const maxI = Math.max(bounds.minI, bounds.maxI);
    const minJ = Math.min(bounds.minJ, bounds.maxJ);
    const maxJ = Math.max(bounds.minJ, bounds.maxJ);

    // Calculate zone boundaries (aligned to ZONE_SIZE grid)
    const startZoneX = Math.floor(minJ / this.ZONE_SIZE) * this.ZONE_SIZE;
    const endZoneX = Math.ceil(maxJ / this.ZONE_SIZE) * this.ZONE_SIZE;
    const startZoneY = Math.floor(minI / this.ZONE_SIZE) * this.ZONE_SIZE;
    const endZoneY = Math.ceil(maxI / this.ZONE_SIZE) * this.ZONE_SIZE;

    const zonesToLoad: Array<{ x: number; y: number }> = [];

    for (let zx = startZoneX; zx < endZoneX; zx += this.ZONE_SIZE) {
      for (let zy = startZoneY; zy < endZoneY; zy += this.ZONE_SIZE) {
        const key = `${zx},${zy}`;
        if (!this.cachedZones.has(key) && !this.loadingZones.has(key)) {
          zonesToLoad.push({ x: zx, y: zy });
        }
      }
    }

    // Limit to prevent server spam (server has max 3 concurrent requests)
    // Use 2 to stay well under limit and allow other requests to go through
    const MAX_ZONES_PER_BATCH = 2;
    const zonesToRequest = zonesToLoad.slice(0, MAX_ZONES_PER_BATCH);

    // Load zones (limited batch)
    for (const zone of zonesToRequest) {
      const key = `${zone.x},${zone.y}`;
      this.loadingZones.add(key);
      this.onLoadZone(zone.x, zone.y, this.ZONE_SIZE, this.ZONE_SIZE);
    }
  }

  /**
   * Manually trigger zone checking (useful after callbacks are set up)
   */
  public triggerZoneCheck(): void {
    this.checkVisibleZones();
  }

  /**
   * Get terrain chunk manager stats
   */
  public getTerrainStats(): { chunks: number; visibleChunks: number; texturesLoaded: number } {
    return {
      chunks: this.terrainChunkManager?.getChunkCount() ?? 0,
      visibleChunks: this.terrainChunkManager?.getVisibleChunkCount() ?? 0,
      texturesLoaded: this.atlasManager.getLoadedCount()
    };
  }

  /**
   * Get rendering statistics
   */
  public getRenderStats(): {
    terrain: { chunks: number; visibleChunks: number; texturesLoaded: number };
    buildings: { total: number; visible: number; texturesLoaded: boolean };
    roads: { total: number; meshes: number };
    concrete: { meshes: number };
  } {
    return {
      terrain: this.getTerrainStats(),
      buildings: {
        total: this.buildingRenderer?.getBuildingCount() ?? 0,
        visible: this.buildingRenderer?.getSpriteCount() ?? 0,
        texturesLoaded: this.buildingRenderer?.allTexturesLoaded() ?? true
      },
      roads: {
        total: this.segments.length,
        meshes: this.roadRenderer?.getRoadMeshCount() ?? 0
      },
      concrete: {
        meshes: this.concreteRenderer?.getConcreteMeshCount() ?? 0
      }
    };
  }

  /**
   * Set zone overlay
   */
  public setZoneOverlay(enabled: boolean, data?: any, x1?: number, y1?: number): void {
    this.zoneOverlayEnabled = enabled;

    if (enabled && data) {
      this.zoneOverlayData = data as SurfaceData;
      this.zoneOverlayX1 = x1 || 0;
      this.zoneOverlayY1 = y1 || 0;
      this.previewManager?.setZoneOverlay(true, data as SurfaceData, x1 || 0, y1 || 0);
    } else {
      this.previewManager?.setZoneOverlay(false, null, 0, 0);
    }

    this.render();
  }

  /**
   * Set placement mode for building placement
   */
  public setPlacementMode(
    enabled: boolean,
    buildingName: string = '',
    cost: number = 0,
    area: number = 0,
    zoneRequirement: string = '',
    xsize: number = 1,
    ysize: number = 1
  ): void {
    this.placementMode = enabled;

    if (enabled) {
      this.placementPreview = {
        i: 0,
        j: 0,
        buildingName,
        cost,
        area,
        zoneRequirement,
        xsize,
        ysize
      };
      this.previewManager?.setBuildingPreview(true, this.placementPreview);
    } else {
      this.placementPreview = null;
      this.previewManager?.setBuildingPreview(false);
      // Hide tooltip
      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }
    }

    this.updateCursor();
    this.render();
  }

  /**
   * Get placement coordinates
   */
  public getPlacementCoordinates(): { x: number; y: number } | null {
    if (!this.placementPreview) {
      return null;
    }
    return { x: this.placementPreview.j, y: this.placementPreview.i };
  }

  /**
   * Set road drawing mode
   */
  public setRoadDrawingMode(enabled: boolean): void {
    this.roadDrawingMode = enabled;

    if (enabled) {
      this.roadDrawingState = {
        isDrawing: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0
      };
      this.previewManager?.setRoadDrawingMode(true);
    } else {
      this.previewManager?.setRoadDrawingMode(false);
      // Hide tooltip
      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }
    }

    this.updateCursor();
    this.render();
  }

  /**
   * Validate road path
   */
  public validateRoadPath(x1: number, y1: number, x2: number, y2: number): { valid: boolean; error?: string } {
    if (!this.previewManager) {
      return { valid: true };
    }

    const pathTiles = this.previewManager.generateStaircasePath(x1, y1, x2, y2);
    const validation = this.previewManager.validateRoadPath(pathTiles);

    if (validation.hasCollision) {
      return { valid: false, error: 'Blocked by building' };
    }
    if (!validation.connectsToRoad) {
      return { valid: false, error: 'Must connect to road' };
    }

    return { valid: true };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Convert screen coordinates to world coordinates (intersect with ground plane y=0)
   */
  private screenToWorld(screenX: number, screenY: number): THREE.Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((screenX - rect.left) / rect.width) * 2 - 1;
    const y = -((screenY - rect.top) / rect.height) * 2 + 1;

    const vector = new THREE.Vector3(x, y, 0);
    vector.unproject(this.camera);

    const cameraPos = this.camera.position;
    const dir = vector.sub(cameraPos).normalize();

    // Intersect with ground plane (y = 0)
    const t = -cameraPos.y / dir.y;
    return new THREE.Vector3(
      cameraPos.x + dir.x * t,
      0,
      cameraPos.z + dir.z * t
    );
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  private worldToScreen(worldX: number, worldZ: number): { x: number; y: number } {
    const vector = new THREE.Vector3(worldX, 0, worldZ);
    vector.project(this.camera);

    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-vector.y * 0.5 + 0.5) * rect.height + rect.top
    };
  }

  /**
   * Update placement tooltip content and position
   */
  private updatePlacementTooltip(i: number, j: number): void {
    if (!this.tooltipElement || !this.placementPreview) return;

    const worldPos = this.coordinateMapper.mapToWorld(i, j);
    const screenPos = this.worldToScreen(worldPos.x, worldPos.z);

    this.tooltipElement.style.display = 'block';
    this.tooltipElement.style.left = `${screenPos.x + 20}px`;
    this.tooltipElement.style.top = `${screenPos.y - 60}px`;
    this.tooltipElement.innerHTML = `
      <div><strong>${this.placementPreview.buildingName}</strong></div>
      <div>Cost: $${this.placementPreview.cost.toLocaleString()}</div>
      <div>Size: ${this.placementPreview.xsize}×${this.placementPreview.ysize}</div>
      <div>Zone: ${this.placementPreview.zoneRequirement}</div>
    `;
  }

  /**
   * Update road path tooltip (during drag)
   */
  private updateRoadTooltip(i: number, j: number, validation: RoadValidation | undefined): void {
    if (!this.tooltipElement || !this.roadDrawingState.isDrawing || !validation) return;

    // Calculate path tiles and cost
    const pathTiles = this.previewManager?.generateStaircasePath(
      this.roadDrawingState.startX,
      this.roadDrawingState.startY,
      this.roadDrawingState.endX,
      this.roadDrawingState.endY
    ) || [];

    const tileCount = pathTiles.length;
    const cost = tileCount * this.ROAD_COST_PER_TILE;

    // Determine error message
    let errorMessage = '';
    if (validation.hasCollision) {
      errorMessage = '⚠ Blocked by building';
    } else if (!validation.connectsToRoad) {
      errorMessage = '⚠ Must connect to road';
    }

    const worldPos = this.coordinateMapper.mapToWorld(i, j);
    const screenPos = this.worldToScreen(worldPos.x, worldPos.z);

    this.tooltipElement.style.display = 'block';
    this.tooltipElement.style.left = `${screenPos.x + 10}px`;
    this.tooltipElement.style.top = `${screenPos.y - 40}px`;
    this.tooltipElement.innerHTML = `
      <div>Tiles: ${tileCount}</div>
      <div>Cost: $${cost.toLocaleString()}</div>
      ${errorMessage ? `<div style="color: #ff6666;">${errorMessage}</div>` : ''}
    `;
  }

  /**
   * Update road hover tooltip (before drag)
   */
  private updateRoadHoverTooltip(i: number, j: number, validation: RoadValidation | undefined): void {
    if (!this.tooltipElement || !validation) return;

    const cost = this.ROAD_COST_PER_TILE;

    // Determine status message
    let statusMessage = '';
    if (validation.hasCollision) {
      statusMessage = '⚠ Blocked by building';
    } else if (!validation.connectsToRoad) {
      statusMessage = '⚠ Must connect to road';
    } else {
      statusMessage = '✓ Valid placement';
    }

    const worldPos = this.coordinateMapper.mapToWorld(i, j);
    const screenPos = this.worldToScreen(worldPos.x, worldPos.z);

    this.tooltipElement.style.display = 'block';
    this.tooltipElement.style.left = `${screenPos.x + 10}px`;
    this.tooltipElement.style.top = `${screenPos.y - 30}px`;
    this.tooltipElement.innerHTML = `
      <div>Road Tile</div>
      <div>Cost: $${cost.toLocaleString()}</div>
      <div style="color: ${validation.hasCollision || !validation.connectsToRoad ? '#ff6666' : '#66ff66'};">${statusMessage}</div>
    `;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopRenderLoop();

    // Dispose terrain system
    if (this.terrainChunkManager) {
      this.terrainChunkManager.dispose();
      this.terrainChunkManager = null;
    }
    this.atlasManager.dispose();

    // Dispose map object renderers
    if (this.roadRenderer) {
      this.roadRenderer.dispose();
      this.roadRenderer = null;
    }
    if (this.concreteRenderer) {
      this.concreteRenderer.dispose();
      this.concreteRenderer = null;
    }
    if (this.buildingRenderer) {
      this.buildingRenderer.dispose();
      this.buildingRenderer = null;
    }
    if (this.previewManager) {
      this.previewManager.dispose();
      this.previewManager = null;
    }

    // Remove tooltip element
    if (this.tooltipElement && this.tooltipElement.parentNode) {
      this.tooltipElement.parentNode.removeChild(this.tooltipElement);
      this.tooltipElement = null;
    }

    // Dispose of geometries and materials
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material?.dispose();
        }
      }
    });

    // Clear scene
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }

    // Dispose renderer
    this.renderer.dispose();

    // Dispose camera controller
    this.cameraController.dispose();

    console.log('[IsometricThreeRenderer] Destroyed');
  }
}
