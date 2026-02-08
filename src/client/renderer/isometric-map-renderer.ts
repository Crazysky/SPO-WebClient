/**
 * IsometricMapRenderer
 *
 * Complete map renderer using isometric terrain with game objects (buildings, roads, overlays).
 *
 * Layers (back to front):
 * 1. Terrain base (IsometricTerrainRenderer) — flat only, no vegetation
 * 2. Vegetation overlay — special terrain tiles (trees, decorations)
 * 3. Concrete (pavement around buildings)
 * 4. Roads
 * 5. Buildings
 * 6. Zone overlay (colored zones)
 * 7. Placement preview
 * 8. Road drawing preview
 * 9. UI overlays
 */

import { IsometricTerrainRenderer } from './isometric-terrain-renderer';
import { GameObjectTextureCache } from './game-object-texture-cache';
import { VegetationFlatMapper } from './vegetation-flat-mapper';
import { TouchHandler2D } from './touch-handler-2d';
import {
  Point,
  Rect,
  TileBounds,
  ZOOM_LEVELS,
  ZoomConfig,
  Rotation,
  TerrainData
} from '../../shared/map-config';
import {
  MapBuilding,
  MapSegment,
  SurfaceData,
  FacilityDimensions,
  RoadDrawingState
} from '../../shared/types';
import {
  RoadsRendering,
  RoadBlockClassManager,
  renderRoadSegment,
  loadRoadBlockClassFromIni,
  RoadBlockId,
  roadBlockId,
  detectSmoothCorner,
  isJunctionTopology,
  getConnectedDirections,
  isBridge,
  ROAD_TYPE,
  LandClass,
  LandType,
  landClassOf,
  landTypeOf,
  isWater
} from './road-texture-system';
import { formatLandId, landTypeName, landClassName, decodeLandId, isSpecialTile } from '../../shared/land-utils';
import {
  ConcreteBlockClassManager,
  loadConcreteBlockClassFromIni,
  getConcreteId,
  buildNeighborConfig,
  canReceiveConcrete,
  CONCRETE_NONE,
  CONCRETE_FULL,
  PLATFORM_IDS,
  PLATFORM_SHIFT,
  ConcreteMapData,
  ConcreteCfg
} from './concrete-texture-system';
import { painterSort } from './painter-algorithm';
import { CarClassManager } from './car-class-system';
import { VehicleAnimationSystem } from './vehicle-animation-system';

interface CachedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  buildings: MapBuilding[];
  segments: MapSegment[];
  lastLoadTime: number; // Timestamp when zone was loaded
  forceRefresh?: boolean; // Flag to force reload on next visibility check
}

interface PlacementPreview {
  i: number;  // Map coordinate i
  j: number;  // Map coordinate j
  buildingName: string;
  cost: number;
  area: number;
  zoneRequirement: string;
  xsize: number;
  ysize: number;
}

/**
 * Zone Request Manager
 *
 * Manages zone loading with:
 * - Movement-aware request delays (send when movement stops, not during)
 * - Zoom-based delay strategy (Z3 immediate, Z0 longest delay)
 * - Request queue with prioritization by distance to camera
 * - Server-safe concurrent request limit (max 3)
 * - Timeout handling and cleanup
 */
class ZoneRequestManager {
  // Queue of pending zone requests (sorted by priority)
  private zoneQueue: Array<{x: number, y: number, priority: number}> = [];

  // Currently loading zones with timestamps for timeout detection
  private loadingZones: Map<string, number> = new Map();

  // Movement state tracking
  private isMoving: boolean = false;
  private movementStopTimer: number | null = null;

  // Zoom-based delay configuration (milliseconds)
  private readonly ZOOM_DELAYS = {
    0: 500,  // Z0 (farthest) - wait for movement fully stops
    1: 300,  // Z1 - moderate delay
    2: 100,  // Z2 - short delay
    3: 0     // Z3 (closest) - immediate
  };

  // Server limit: max 3 concurrent requests
  private readonly MAX_CONCURRENT = 3;
  private readonly REQUEST_TIMEOUT = 15000; // 15s timeout

  // Zone staleness threshold (5 minutes)
  private readonly ZONE_EXPIRY_MS = 5 * 60 * 1000;

  constructor(
    private onLoadZone: (x: number, y: number, w: number, h: number) => void,
    private zoneSize: number = 64
  ) {}

  /**
   * Mark camera as moving (called during pan/zoom/rotate)
   */
  public markMoving(): void {
    this.isMoving = true;

    // Clear any pending movement stop timer
    if (this.movementStopTimer !== null) {
      clearTimeout(this.movementStopTimer);
      this.movementStopTimer = null;
    }
  }

  /**
   * Mark camera as stopped (called after pan/zoom/rotate ends)
   * Triggers delayed zone loading based on zoom level
   */
  public markStopped(currentZoom: number): void {
    this.isMoving = false;

    // Clear any pending timer
    if (this.movementStopTimer !== null) {
      clearTimeout(this.movementStopTimer);
    }

    // Use zoom-based delay
    const delay = this.ZOOM_DELAYS[currentZoom as keyof typeof this.ZOOM_DELAYS] || 500;

    this.movementStopTimer = window.setTimeout(() => {
      this.processQueue();
    }, delay);
  }

  /**
   * Request zones for visible area
   * Queues all needed zones and processes them based on movement state
   */
  public requestVisibleZones(
    visibleBounds: TileBounds,
    cachedZones: Map<string, CachedZone>,
    cameraPos: {i: number, j: number},
    currentZoom: number
  ): void {
    // Calculate zone boundaries (aligned to zoneSize grid)
    const minI = Math.min(visibleBounds.minI, visibleBounds.maxI);
    const maxI = Math.max(visibleBounds.minI, visibleBounds.maxI);
    const minJ = Math.min(visibleBounds.minJ, visibleBounds.maxJ);
    const maxJ = Math.max(visibleBounds.minJ, visibleBounds.maxJ);

    const startZoneX = Math.floor(minJ / this.zoneSize) * this.zoneSize;
    const endZoneX = Math.ceil(maxJ / this.zoneSize) * this.zoneSize;
    const startZoneY = Math.floor(minI / this.zoneSize) * this.zoneSize;
    const endZoneY = Math.ceil(maxI / this.zoneSize) * this.zoneSize;

    // Collect zones that need loading (new or stale)
    const zonesToAdd: Array<{x: number, y: number, priority: number}> = [];
    const now = Date.now();

    for (let zx = startZoneX; zx < endZoneX; zx += this.zoneSize) {
      for (let zy = startZoneY; zy < endZoneY; zy += this.zoneSize) {
        const key = `${zx},${zy}`;
        const cached = cachedZones.get(key);

        // Check if zone needs refresh
        let needsLoad = false;

        if (!cached) {
          // Zone not loaded yet
          needsLoad = true;
        } else {
          // Zone exists - check if stale or force refresh
          const age = now - cached.lastLoadTime;
          const isStale = age > this.ZONE_EXPIRY_MS;

          if (cached.forceRefresh || isStale) {
            // Remove stale zone from cache so it gets reloaded
            cachedZones.delete(key);
            needsLoad = true;

            if (isStale) {
              console.log(`[ZoneRequestManager] Zone ${key} is stale (${Math.floor(age / 1000)}s old), reloading`);
            } else {
              console.log(`[ZoneRequestManager] Zone ${key} marked for force refresh, reloading`);
            }
          }
        }

        if (!needsLoad) {
          continue;
        }

        // Skip if already loading
        if (this.loadingZones.has(key)) {
          continue;
        }

        // Skip if already in queue
        if (this.zoneQueue.some(z => z.x === zx && z.y === zy)) {
          continue;
        }

        // Calculate priority (distance to camera center)
        const centerX = zx + this.zoneSize / 2;
        const centerY = zy + this.zoneSize / 2;
        const distSq = (centerX - cameraPos.j) ** 2 + (centerY - cameraPos.i) ** 2;

        zonesToAdd.push({ x: zx, y: zy, priority: distSq });
      }
    }

    // Add new zones to queue and sort by priority (closest first)
    this.zoneQueue.push(...zonesToAdd);
    this.zoneQueue.sort((a, b) => a.priority - b.priority);

    // For Z3 (closest zoom), process immediately even during movement
    if (currentZoom === 3 && !this.isMoving) {
      this.processQueue();
    }
  }

  /**
   * Process zone queue - send requests up to concurrent limit
   */
  private processQueue(): void {
    // Clean up timed-out requests
    this.cleanupTimedOutRequests();

    // Calculate how many requests we can send
    const currentLoading = this.loadingZones.size;
    const slotsAvailable = this.MAX_CONCURRENT - currentLoading;

    if (slotsAvailable <= 0 || this.zoneQueue.length === 0) {
      return;
    }

    // Send up to slotsAvailable requests
    const zonesToRequest = this.zoneQueue.splice(0, slotsAvailable);

    for (const zone of zonesToRequest) {
      const key = `${zone.x},${zone.y}`;
      this.loadingZones.set(key, Date.now());
      this.onLoadZone(zone.x, zone.y, this.zoneSize, this.zoneSize);
    }
  }

  /**
   * Mark zone as loaded (called when response arrives)
   */
  public markZoneLoaded(x: number, y: number): void {
    // Align to zone grid
    const alignedX = Math.floor(x / this.zoneSize) * this.zoneSize;
    const alignedY = Math.floor(y / this.zoneSize) * this.zoneSize;
    const key = `${alignedX},${alignedY}`;

    this.loadingZones.delete(key);

    // Process more zones if queue not empty
    if (this.zoneQueue.length > 0 && !this.isMoving) {
      this.processQueue();
    }
  }

  /**
   * Clean up requests that have timed out
   */
  private cleanupTimedOutRequests(): void {
    const now = Date.now();
    const timedOut: string[] = [];

    this.loadingZones.forEach((timestamp, key) => {
      if (now - timestamp > this.REQUEST_TIMEOUT) {
        timedOut.push(key);
      }
    });

    timedOut.forEach(key => {
      console.warn(`[ZoneRequestManager] Zone ${key} request timed out`);
      this.loadingZones.delete(key);
    });
  }

  /**
   * Clear all pending requests and queue
   */
  public clear(): void {
    this.zoneQueue = [];
    this.loadingZones.clear();
    this.isMoving = false;

    if (this.movementStopTimer !== null) {
      clearTimeout(this.movementStopTimer);
      this.movementStopTimer = null;
    }
  }

  /**
   * Get current queue size (for debugging)
   */
  public getQueueSize(): number {
    return this.zoneQueue.length;
  }

  /**
   * Get current loading count (for debugging)
   */
  public getLoadingCount(): number {
    return this.loadingZones.size;
  }
}

export class IsometricMapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Core terrain renderer
  private terrainRenderer: IsometricTerrainRenderer;

  // Vegetation→flat mapping near dynamic content
  private vegetationMapper: VegetationFlatMapper;

  // Game object texture cache (roads, buildings, etc.)
  private gameObjectTextureCache: GameObjectTextureCache;

  // Game objects
  private cachedZones: Map<string, CachedZone> = new Map();
  private allBuildings: MapBuilding[] = [];
  private allSegments: MapSegment[] = [];

  // Road tiles map for texture type detection
  private roadTilesMap: Map<string, boolean> = new Map();

  // Pre-computed concrete adjacency tiles (tiles within 1 tile of any building)
  private concreteTilesSet: Set<string> = new Set();

  // Road texture system
  private roadBlockClassManager: RoadBlockClassManager;
  private roadsRendering: RoadsRendering | null = null;
  private roadBlockClassesLoaded: boolean = false;

  // Concrete texture system
  private concreteBlockClassManager: ConcreteBlockClassManager;
  private concreteBlockClassesLoaded: boolean = false;

  // Building dimensions cache
  private facilityDimensionsCache: Map<string, FacilityDimensions> = new Map();

  // Mouse state
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private hoveredBuilding: MapBuilding | null = null;
  private mouseMapI: number = 0;
  private mouseMapJ: number = 0;

  // Zone loading - managed by ZoneRequestManager
  private zoneRequestManager: ZoneRequestManager | null = null;

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onCancelPlacement: (() => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;
  private onRoadSegmentComplete: ((x1: number, y1: number, x2: number, y2: number) => void) | null = null;
  private onCancelRoadDrawing: (() => void) | null = null;

  // Zone overlay
  private zoneOverlayEnabled: boolean = false;
  private zoneOverlayData: SurfaceData | null = null;
  private zoneOverlayX1: number = 0;
  private zoneOverlayY1: number = 0;

  // Placement preview
  private placementPreview: PlacementPreview | null = null;
  private placementMode: boolean = false;

  // Road drawing
  private roadDrawingMode: boolean = false;
  private roadDrawingState: RoadDrawingState = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    isMouseDown: false,
    mouseDownTime: 0
  };
  private roadCostPerTile: number = 2000000;

  // Map loaded flag
  private mapLoaded: boolean = false;
  private mapName: string = '';

  // Debug mode
  private debugMode: boolean = false;
  private debugShowTileInfo: boolean = true;
  private debugShowBuildingInfo: boolean = true;
  private debugShowConcreteInfo: boolean = true;

  // Touch handler for mobile
  private touchHandler: TouchHandler2D | null = null;

  // Vegetation display control
  private vegetationEnabled: boolean = true;
  private hideVegetationOnMove: boolean = false;
  private isCameraMoving: boolean = false;
  private cameraStopTimer: number | null = null;
  private readonly CAMERA_STOP_DEBOUNCE_MS = 200;

  // Render debouncing (RAF-based, prevents redundant renders per frame)
  private pendingRender: number | null = null;

  // Vehicle animation system
  private carClassManager: CarClassManager = new CarClassManager();
  private vehicleSystem: VehicleAnimationSystem | null = null;
  private vehicleSystemReady: boolean = false;
  private animationLoopRunning: boolean = false;
  private lastRenderTime: number = 0;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas with id "${canvasId}" not found`);
    }

    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;

    // Create terrain renderer (shares canvas, mouse controls handled by this class)
    this.terrainRenderer = new IsometricTerrainRenderer(canvas, { disableMouseControls: true });

    // Create vegetation→flat mapper (replaces vegetation textures near buildings/roads)
    this.vegetationMapper = new VegetationFlatMapper(2);

    // Disable terrain renderer's debug info - this renderer handles its own overlay at the end
    this.terrainRenderer.setShowDebugInfo(false);

    // Wire up render delegation: when terrain chunks become ready, trigger a full-pipeline render
    // instead of terrain-only render (prevents blinking where buildings/roads disappear for 1 frame)
    this.terrainRenderer.setOnRenderNeeded(() => this.requestRender());

    // Create game object texture cache (roads, buildings, etc.)
    this.gameObjectTextureCache = new GameObjectTextureCache();

    // Setup callback to re-render when textures are loaded
    this.gameObjectTextureCache.setOnTextureLoaded((category, name) => {
      if (category === 'BuildingImages' || category === 'RoadBlockImages' || category === 'ConcreteImages' || category === 'CarImages') {
        // Re-render when textures become available (debounced)
        this.requestRender();
      }
    });

    // Load road, concrete, and car atlases (non-blocking, fallback to individual textures)
    this.gameObjectTextureCache.loadObjectAtlas('road').then(() => this.requestRender());
    this.gameObjectTextureCache.loadObjectAtlas('concrete').then(() => this.requestRender());
    this.gameObjectTextureCache.loadObjectAtlas('car').then(() => this.requestRender());

    // Initialize road block class manager
    this.roadBlockClassManager = new RoadBlockClassManager();
    this.roadBlockClassManager.setBasePath('/cache/');

    // Load road block classes asynchronously
    this.loadRoadBlockClasses();

    // Initialize concrete block class manager
    this.concreteBlockClassManager = new ConcreteBlockClassManager();
    this.concreteBlockClassManager.setBasePath('/cache/');

    // Load concrete block classes asynchronously
    this.loadConcreteBlockClasses();

    // Load car classes and initialize vehicle animation system
    this.loadCarClasses();

    // Setup event handlers
    this.setupMouseControls();
    this.setupKeyboardControls();
    this.setupTouchControls();

    // Initial render
    this.render();
  }

  /**
   * Setup keyboard controls for debug mode
   */
  private setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      // 'Q' rotates counter-clockwise (NORTH→WEST→SOUTH→EAST→NORTH)
      if (e.key === 'q' || e.key === 'Q') {
        this.rotateCounterClockwise();
      }
      // 'E' rotates clockwise (NORTH→EAST→SOUTH→WEST→NORTH)
      if (e.key === 'e' || e.key === 'E') {
        this.rotateClockwise();
      }
      // 'D' key toggles debug mode
      if (e.key === 'd' || e.key === 'D') {
        this.debugMode = !this.debugMode;
        console.log(`[IsometricMapRenderer] Debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
        this.requestRender();
      }
      // '1' toggles tile info in debug mode
      if (e.key === '1' && this.debugMode) {
        this.debugShowTileInfo = !this.debugShowTileInfo;
        this.requestRender();
      }
      // '2' toggles building info in debug mode
      if (e.key === '2' && this.debugMode) {
        this.debugShowBuildingInfo = !this.debugShowBuildingInfo;
        this.requestRender();
      }
      // '3' toggles concrete info in debug mode
      if (e.key === '3' && this.debugMode) {
        this.debugShowConcreteInfo = !this.debugShowConcreteInfo;
        this.requestRender();
      }
    });
  }

  /**
   * Rotate view clockwise (Q: NORTH→EAST→SOUTH→WEST→NORTH)
   */
  private rotateClockwise(): void {
    const current = this.terrainRenderer.getRotation();
    const next = (current + 1) % 4 as Rotation;
    this.terrainRenderer.setRotation(next);
    this.markCameraMoving();

    // Clear vehicles on rotation change (CarPaths are in tile-local coords)
    if (this.vehicleSystem) this.vehicleSystem.clear();

    // Mark zone request manager and trigger delayed zone load
    if (this.zoneRequestManager) {
      const currentZoom = this.terrainRenderer.getZoomLevel();
      this.zoneRequestManager.markMoving();
      this.zoneRequestManager.markStopped(currentZoom);
    }
    this.checkVisibleZones();

    console.log(`[IsometricMapRenderer] Rotation: ${Rotation[next]}`);
    this.requestRender();
  }

  /**
   * Rotate view counter-clockwise (E: NORTH→WEST→SOUTH→EAST→NORTH)
   */
  private rotateCounterClockwise(): void {
    const current = this.terrainRenderer.getRotation();
    const next = (current + 3) % 4 as Rotation; // +3 is equivalent to -1 mod 4
    this.terrainRenderer.setRotation(next);
    this.markCameraMoving();

    // Clear vehicles on rotation change (CarPaths are in tile-local coords)
    if (this.vehicleSystem) this.vehicleSystem.clear();

    // Mark zone request manager and trigger delayed zone load
    if (this.zoneRequestManager) {
      const currentZoom = this.terrainRenderer.getZoomLevel();
      this.zoneRequestManager.markMoving();
      this.zoneRequestManager.markStopped(currentZoom);
    }
    this.checkVisibleZones();

    console.log(`[IsometricMapRenderer] Rotation: ${Rotation[next]}`);
    this.requestRender();
  }

  /**
   * Setup touch controls for mobile (pan, pinch-zoom, rotation snap, double-tap)
   */
  private setupTouchControls(): void {
    this.touchHandler = new TouchHandler2D(this.canvas, {
      onPan: (dx, dy) => {
        // Convert screen delta to map delta (same logic as mouse drag)
        const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
        const u = config.u;
        const mapDeltaI = (dy / u + dx / (2 * u)) * 0.5;
        const mapDeltaJ = (dy / u - dx / (2 * u)) * 0.5;
        this.terrainRenderer.pan(mapDeltaI, -mapDeltaJ);
        this.markCameraMoving();

        // Mark zone request manager as moving
        if (this.zoneRequestManager) {
          this.zoneRequestManager.markMoving();
        }

        this.requestRender();
      },
      onPanEnd: () => {
        // Mark movement stopped and trigger delayed zone loading
        if (this.zoneRequestManager) {
          const currentZoom = this.terrainRenderer.getZoomLevel();
          this.zoneRequestManager.markStopped(currentZoom);
        }

        // Also request immediately (manager will handle delay internally)
        this.checkVisibleZones();
      },
      onZoom: (delta) => {
        const current = this.terrainRenderer.getZoomLevel();
        const newZoom = current + delta;
        this.terrainRenderer.setZoomLevel(newZoom);

        // Clear vehicles when zooming out of Z2/Z3
        if (current >= 2 && newZoom < 2 && this.vehicleSystem) {
          this.vehicleSystem.clear();
          this.animationLoopRunning = false;
        }
        if (current < 2 && newZoom >= 2) {
          this.startAnimationLoop();
        }

        // Mark as moving then stopped (triggers delayed zone load based on new zoom)
        if (this.zoneRequestManager) {
          this.zoneRequestManager.markMoving();
          this.zoneRequestManager.markStopped(newZoom);
        }

        this.checkVisibleZones();
        this.requestRender();
      },
      onRotate: (direction) => {
        if (direction === 'cw') {
          this.rotateClockwise();
        } else {
          this.rotateCounterClockwise();
        }
      },
      onDoubleTap: (x, y) => {
        // Center camera on tapped location
        const mapPos = this.terrainRenderer.screenToMap(x, y);
        this.terrainRenderer.centerOn(mapPos.x, mapPos.y);
        this.requestRender();
      },
    });
  }

  // =========================================================================
  // MAP LOADING
  // =========================================================================

  /**
   * Load terrain for a map
   */
  public async loadMap(mapName: string): Promise<TerrainData> {
    this.mapName = mapName;

    const terrainData = await this.terrainRenderer.loadMap(mapName);
    this.mapLoaded = true;

    // Clear cached zones when loading new map
    this.cachedZones.clear();
    if (this.zoneRequestManager) {
      this.zoneRequestManager.clear();
    }
    this.allBuildings = [];
    this.allSegments = [];

    this.render();

    // NOTE: Do NOT call checkVisibleZones() here - let the callback be set first
    // Zone loading will be triggered via triggerZoneCheck() when setOnLoadZone() is called
    // (See map-navigation-ui.ts setOnLoadZone method which calls triggerZoneCheck)

    return terrainData;
  }

  /**
   * Check if map is loaded
   */
  isLoaded(): boolean {
    return this.mapLoaded && this.terrainRenderer.isLoaded();
  }

  /**
   * Load road block class configurations from the server
   */
  private async loadRoadBlockClasses(): Promise<void> {
    try {
      const response = await fetch('/api/road-block-classes');
      if (!response.ok) {
        console.error('[IsometricMapRenderer] Failed to load road block classes:', response.status);
        return;
      }

      const data = await response.json();
      const files: Array<{ filename: string; content: string }> = data.files || [];

      console.log(`[IsometricMapRenderer] Loading ${files.length} road block classes...`);

      for (const file of files) {
        this.roadBlockClassManager.loadFromIni(file.content);
      }

      this.roadBlockClassesLoaded = true;
      console.log(`[IsometricMapRenderer] Road block classes loaded successfully`);

      // Re-render to show road textures
      this.requestRender();
    } catch (error) {
      console.error('[IsometricMapRenderer] Error loading road block classes:', error);
    }
  }

  /**
   * Load concrete block class configurations from the server
   */
  private async loadConcreteBlockClasses(): Promise<void> {
    try {
      const response = await fetch('/api/concrete-block-classes');
      if (!response.ok) {
        console.error('[IsometricMapRenderer] Failed to load concrete block classes:', response.status);
        return;
      }

      const data = await response.json();
      const files: Array<{ filename: string; content: string }> = data.files || [];

      console.log(`[IsometricMapRenderer] Loading ${files.length} concrete block classes...`);

      for (const file of files) {
        const config = loadConcreteBlockClassFromIni(file.content);
        console.log(`[ConcreteINI] ${file.filename}: ID=${config.id} (0x${config.id.toString(16)}) -> ${config.imagePath}`);
        this.concreteBlockClassManager.loadFromIni(file.content);
      }

      this.concreteBlockClassesLoaded = true;
      console.log(`[IsometricMapRenderer] Concrete block classes loaded successfully (${this.concreteBlockClassManager.getClassCount()} classes)`);

      // Debug: Check if platform IDs are loaded
      const platformIds = [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88];
      console.log('[ConcreteDebug] === PLATFORM ID CHECK ===');
      for (const id of platformIds) {
        const hasClass = this.concreteBlockClassManager.hasClass(id);
        const filename = this.concreteBlockClassManager.getImageFilename(id);
        console.log(`[ConcreteDebug] Platform ID 0x${id.toString(16)} (${id}): loaded=${hasClass}, texture=${filename}`);
      }

      // List all loaded IDs
      const allIds = this.concreteBlockClassManager.getAllIds();
      console.log(`[ConcreteDebug] All ${allIds.length} loaded IDs:`, allIds.map(id => `0x${id.toString(16)}(${id})`).join(', '));

      // Re-render to show concrete textures
      this.requestRender();
    } catch (error) {
      console.error('[IsometricMapRenderer] Error loading concrete block classes:', error);
    }
  }

  /**
   * Load car class configurations from the server and initialize the vehicle animation system
   */
  private async loadCarClasses(): Promise<void> {
    try {
      const response = await fetch('/api/car-classes');
      if (!response.ok) {
        console.error('[IsometricMapRenderer] Failed to load car classes:', response.status);
        return;
      }

      const data = await response.json();
      const files: Array<{ filename: string; content: string }> = data.files || [];

      console.log(`[IsometricMapRenderer] Loading ${files.length} car classes...`);

      for (const file of files) {
        this.carClassManager.loadFromIni(file.content);
      }

      console.log(`[IsometricMapRenderer] Car classes loaded: ${this.carClassManager.getClassCount()} classes`);

      // Initialize vehicle animation system
      this.vehicleSystem = new VehicleAnimationSystem();
      this.vehicleSystem.setCarClassManager(this.carClassManager);
      this.vehicleSystem.setRoadBlockClassManager(this.roadBlockClassManager);
      this.vehicleSystem.setGameObjectTextureCache(this.gameObjectTextureCache);
      this.vehicleSystemReady = true;
    } catch (error) {
      console.error('[IsometricMapRenderer] Error loading car classes:', error);
    }
  }

  /**
   * Start the continuous animation loop for vehicles.
   * Only runs when vehicles are active (Z2/Z3 + vehicles exist).
   */
  private startAnimationLoop(): void {
    if (this.animationLoopRunning) return;
    this.animationLoopRunning = true;
    this.lastRenderTime = performance.now();

    const loop = () => {
      if (!this.animationLoopRunning) return;

      const zoom = this.terrainRenderer.getZoomLevel();
      // Only animate at Z2 and Z3
      if (zoom >= 2 && this.vehicleSystemReady && this.vehicleSystem) {
        this.requestRender();
        requestAnimationFrame(loop);
      } else {
        this.animationLoopRunning = false;
      }
    };

    requestAnimationFrame(loop);
  }

  /**
   * Draw animated vehicles on roads (layer between buildings and zone overlay).
   * Active only at Z2 and Z3 zoom levels.
   */
  private drawVehicles(bounds: TileBounds, deltaTime: number, occupiedTiles: Set<string>): void {
    const zoom = this.terrainRenderer.getZoomLevel();
    if (zoom < 2) return;
    if (!this.vehicleSystemReady || !this.vehicleSystem) return;

    // Update road data dependencies for the vehicle system
    this.vehicleSystem.setRoadData(
      this.roadTilesMap,
      this.roadsRendering,
      (col, row) => {
        const terrainLoader = this.terrainRenderer.getTerrainLoader();
        return terrainLoader.getLandId(col, row);
      },
      (col, row) => this.hasConcrete(col, row)
    );

    // Pass building tile positions for proximity-based spawning
    this.vehicleSystem.setBuildingTiles(occupiedTiles);

    // Pause during camera movement
    this.vehicleSystem.setPaused(this.isCameraMoving);

    // Update vehicle positions and spawn new vehicles
    this.vehicleSystem.update(deltaTime, bounds);

    // Render visible vehicles
    const config = ZOOM_LEVELS[zoom];
    this.vehicleSystem.render(
      this.ctx,
      (i: number, j: number) => this.terrainRenderer.mapToScreen(i, j),
      config,
      this.canvas.width,
      this.canvas.height,
      (col: number, row: number) => this.isOnWaterPlatform(col, row)
    );

    // Start animation loop if vehicles are active
    if (this.vehicleSystem.isActive() || this.vehicleSystem.getVehicleCount() === 0) {
      this.startAnimationLoop();
    }
  }

  // =========================================================================
  // ZONE MANAGEMENT
  // =========================================================================

  /**
   * Add a cached zone with buildings and segments
   * Note: Cache key is aligned to zone grid (64-tile boundaries) for consistency
   */
  public addCachedZone(
    x: number,
    y: number,
    w: number,
    h: number,
    buildings: MapBuilding[],
    segments: MapSegment[]
  ) {
    // Align coordinates to zone grid for consistent cache keys
    const zoneSize = 64;
    const alignedX = Math.floor(x / zoneSize) * zoneSize;
    const alignedY = Math.floor(y / zoneSize) * zoneSize;
    const key = `${alignedX},${alignedY}`;

    this.cachedZones.set(key, {
      x: alignedX,
      y: alignedY,
      w,
      h,
      buildings,
      segments,
      lastLoadTime: Date.now(),
      forceRefresh: false
    });

    // Notify zone request manager that zone is loaded
    if (this.zoneRequestManager) {
      this.zoneRequestManager.markZoneLoaded(alignedX, alignedY);
    }

    // Rebuild aggregated lists
    this.rebuildAggregatedData();

    // Fetch dimensions for new buildings
    this.fetchDimensionsForBuildings(buildings);

    this.requestRender();
  }

  /**
   * Rebuild all buildings and segments from cached zones
   */
  private rebuildAggregatedData() {
    this.allBuildings = [];
    this.allSegments = [];
    this.roadTilesMap.clear();

    this.cachedZones.forEach(zone => {
      this.allBuildings.push(...zone.buildings);
      this.allSegments.push(...zone.segments);
    });

    // Build road tiles map for connectivity detection
    this.allSegments.forEach(seg => {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      const minY = Math.min(seg.y1, seg.y2);
      const maxY = Math.max(seg.y1, seg.y2);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          this.roadTilesMap.set(`${x},${y}`, true);
        }
      }
    });

    // Rebuild road topology FIRST — needed to identify junctions for concrete placement
    this.rebuildRoadsRendering();

    // Pre-compute concrete adjacency tiles:
    // 1. Tiles within 1 tile of any building
    // 2. Water road junctions (corners, T, crossroads) + their adjacent connected road tiles
    // On water (ZoneD), only place concrete on deep water (Center) tiles — skip edges/corners
    this.concreteTilesSet.clear();
    const terrainLoaderForConcrete = this.terrainRenderer.getTerrainLoader();
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      // Expand building bounds by 1 tile in each direction
      for (let y = building.y - 1; y < building.y + bh + 1; y++) {
        for (let x = building.x - 1; x < building.x + bw + 1; x++) {
          // Filter out water edge/corner tiles — only ldtCenter accepts concrete
          if (terrainLoaderForConcrete) {
            const landId = terrainLoaderForConcrete.getLandId(x, y);
            if (!canReceiveConcrete(landId)) continue;
          }
          this.concreteTilesSet.add(`${x},${y}`);
        }
      }
    }

    // Add concrete under road tiles on water adjacent to building concrete
    this.addWaterRoadNearBuildingConcrete(terrainLoaderForConcrete);

    // Add concrete platforms around water road junctions (corners, T, crossroads)
    // Bridge textures don't support these topologies, so they need a concrete platform
    // with regular road textures. Also adds concrete to the one adjacent tile in each
    // connected direction (transition from bridge to platform road).
    this.addWaterRoadJunctionConcrete(terrainLoaderForConcrete);

    // Final pass: ensure every non-bridge road tile on water has a 1-tile concrete border
    // for proper platform edge textures (platN, platSE, etc.)
    this.expandWaterRoadConcreteBorders(terrainLoaderForConcrete);

    // Update vegetation→flat zones (used by drawVegetation to hide vegetation near buildings/roads)
    this.vegetationMapper.updateDynamicContent(
      this.allBuildings,
      this.allSegments,
      this.facilityDimensionsCache
    );
  }

  /**
   * Rebuild the RoadsRendering buffer from all segments
   * This computes the topology (shape) of each road tile
   */
  private rebuildRoadsRendering() {
    if (this.allSegments.length === 0) {
      this.roadsRendering = null;
      return;
    }

    // Calculate bounds of all road segments
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const seg of this.allSegments) {
      minX = Math.min(minX, seg.x1, seg.x2);
      maxX = Math.max(maxX, seg.x1, seg.x2);
      minY = Math.min(minY, seg.y1, seg.y2);
      maxY = Math.max(maxY, seg.y1, seg.y2);
    }

    // Add padding for edge cases
    const padding = 1;
    const left = minX - padding;
    const top = minY - padding;
    const width = maxX - minX + 1 + 2 * padding;
    const height = maxY - minY + 1 + 2 * padding;

    // Create rendering buffer
    this.roadsRendering = new RoadsRendering(top, left, width, height);

    // Render all segments into the buffer
    for (const seg of this.allSegments) {
      renderRoadSegment(this.roadsRendering, {
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2
      });
    }
  }

  /**
   * Check if a road tile exists at the given coordinates
   */
  private hasRoadAt(x: number, y: number): boolean {
    return this.roadTilesMap.has(`${x},${y}`);
  }

  /**
   * Check if a tile is adjacent to an existing road (including diagonal adjacency)
   * Returns true if any of the 8 surrounding tiles has a road
   */
  private isAdjacentToRoad(x: number, y: number): boolean {
    const neighbors = [
      { x: x - 1, y: y },     // West
      { x: x + 1, y: y },     // East
      { x: x, y: y - 1 },     // North
      { x: x, y: y + 1 },     // South
      { x: x - 1, y: y - 1 }, // NW
      { x: x + 1, y: y - 1 }, // NE
      { x: x - 1, y: y + 1 }, // SW
      { x: x + 1, y: y + 1 }  // SE
    ];

    return neighbors.some(n => this.hasRoadAt(n.x, n.y));
  }

  /**
   * Check if a road path connects to existing roads
   * Returns true if:
   * - Any tile of the path is adjacent to an existing road, OR
   * - No roads exist yet (first road on map)
   */
  public checkRoadPathConnectsToExisting(pathTiles: Point[]): boolean {
    // If no roads exist, any road can be built (first road)
    if (this.roadTilesMap.size === 0) {
      return true;
    }

    // Check if any tile of the path connects to existing roads
    for (const tile of pathTiles) {
      // Check if this tile is adjacent to an existing road
      if (this.isAdjacentToRoad(tile.x, tile.y)) {
        return true;
      }
      // Also check if the tile itself overlaps with an existing road (extending from endpoint)
      if (this.hasRoadAt(tile.x, tile.y)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the number of existing road tiles (for checking if any roads exist)
   */
  public getRoadTileCount(): number {
    return this.roadTilesMap.size;
  }

  /**
   * Fetch facility dimensions for buildings and preload their textures
   */
  private async fetchDimensionsForBuildings(buildings: MapBuilding[]) {
    if (!this.onFetchFacilityDimensions) return;

    const uniqueClasses = new Set<string>();
    buildings.forEach(b => {
      if (!this.facilityDimensionsCache.has(b.visualClass)) {
        uniqueClasses.add(b.visualClass);
      }
    });

    for (const visualClass of uniqueClasses) {
      const dims = await this.onFetchFacilityDimensions(visualClass);
      if (dims) {
        this.facilityDimensionsCache.set(visualClass, dims);
      }
    }

    // Rebuild concrete set now that we have accurate dimensions
    this.rebuildConcreteSet();

    // Preload building textures for all unique visual classes
    this.preloadBuildingTextures(buildings);

    this.requestRender();
  }

  /**
   * Rebuild the pre-computed concrete adjacency set from all buildings.
   * Called when building dimensions change (after fetching from server).
   */
  private rebuildConcreteSet(): void {
    this.concreteTilesSet.clear();
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      for (let y = building.y - 1; y < building.y + bh + 1; y++) {
        for (let x = building.x - 1; x < building.x + bw + 1; x++) {
          // Filter out water edge/corner tiles — only ldtCenter accepts concrete
          if (terrainLoader) {
            const landId = terrainLoader.getLandId(x, y);
            if (!canReceiveConcrete(landId)) continue;
          }
          this.concreteTilesSet.add(`${x},${y}`);
        }
      }
    }
    // Add concrete under road tiles on water adjacent to building concrete
    this.addWaterRoadNearBuildingConcrete(terrainLoader);
    // Also add concrete around water road junctions
    this.addWaterRoadJunctionConcrete(terrainLoader);
    // Final pass: 1-tile border around all platform road tiles on water
    this.expandWaterRoadConcreteBorders(terrainLoader);
  }

  /**
   * Add concrete platforms around road junctions on water.
   *
   * Bridge textures only support straight segments (NS/WE roads and their start/end caps).
   * Corners, T-intersections, and crossroads CANNOT use bridge textures — they need
   * a concrete platform with regular urban road textures.
   *
   * For each junction tile on water:
   * 1. The junction tile itself gets concrete (+ 1-tile border for platform edges)
   * 2. Each adjacent connected road tile also gets concrete (bridge→road transition)
   *    This is the "one tile before" rule: the straight road segment immediately
   *    adjacent to a junction transitions from bridge to platform road.
   */
  private addWaterRoadJunctionConcrete(terrainLoader: ReturnType<typeof this.terrainRenderer.getTerrainLoader>): void {
    if (!this.roadsRendering || !terrainLoader) return;

    // Helper: add concrete tile if it passes the water filter
    const addConcreteTile = (x: number, y: number) => {
      const landId = terrainLoader.getLandId(x, y);
      if (canReceiveConcrete(landId)) {
        this.concreteTilesSet.add(`${x},${y}`);
      }
    };

    // Helper: add concrete for a tile and its 1-tile border (platform edges)
    const addConcreteWithBorder = (cx: number, cy: number) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          addConcreteTile(cx + dx, cy + dy);
        }
      }
    };

    // Scan all road tiles for junctions on water
    for (const [key] of this.roadTilesMap) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Get topology from rendered roads
      const topology = this.roadsRendering.get(y, x);
      if (topology === RoadBlockId.None) continue;

      // Only process junction topologies (corners, T, crossroads)
      if (!isJunctionTopology(topology)) continue;

      // Only process tiles on water
      const landId = terrainLoader.getLandId(x, y);
      if (!isWater(landId)) continue;

      // Skip if already on building concrete (already handled)
      if (this.concreteTilesSet.has(key)) continue;

      // Add concrete platform around the junction tile
      addConcreteWithBorder(x, y);

      // Add concrete for adjacent connected road tiles (bridge→road transition)
      const dirs = getConnectedDirections(topology);
      for (const [di, dj] of dirs) {
        const adjX = x + dj;  // col offset
        const adjY = y + di;  // row offset
        // Only add if it's also a road tile on water
        if (this.roadTilesMap.has(`${adjX},${adjY}`)) {
          const adjLandId = terrainLoader.getLandId(adjX, adjY);
          if (isWater(adjLandId)) {
            addConcreteWithBorder(adjX, adjY);
          }
        }
      }
    }
  }

  /**
   * Add concrete under road tiles on water that are adjacent to water-side building concrete.
   * Only extends when the neighboring concrete is also on water (not land→water transitions).
   * Does NOT add a border — just the road tile itself (max distance from road = 0).
   */
  private addWaterRoadNearBuildingConcrete(terrainLoader: ReturnType<typeof this.terrainRenderer.getTerrainLoader>): void {
    if (!terrainLoader) return;

    // Snapshot current concrete set (building buffer only at this point)
    const buildingConcreteSnapshot = new Set(this.concreteTilesSet);

    for (const [key] of this.roadTilesMap) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Only process road tiles on water
      const landId = terrainLoader.getLandId(x, y);
      if (!isWater(landId)) continue;

      // Already has concrete from building buffer
      if (this.concreteTilesSet.has(key)) continue;

      // Check if any of the 8 neighbors is in the building concrete set AND on water
      // Skip land-side concrete to avoid placing platforms at land→water transitions
      let nearWaterBuilding = false;
      for (let dy = -1; dy <= 1 && !nearWaterBuilding; dy++) {
        for (let dx = -1; dx <= 1 && !nearWaterBuilding; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (buildingConcreteSnapshot.has(`${nx},${ny}`) && isWater(terrainLoader.getLandId(nx, ny))) {
            nearWaterBuilding = true;
          }
        }
      }

      if (nearWaterBuilding) {
        if (canReceiveConcrete(landId)) {
          this.concreteTilesSet.add(key);
        }
      }
    }
  }

  /**
   * Final expansion pass: every road tile on water that already has concrete (= platform road)
   * gets a 1-tile concrete border for proper platform edge texture rendering.
   * Uses a snapshot to avoid cascading — only expands from road tiles, not from newly added edges.
   */
  private expandWaterRoadConcreteBorders(terrainLoader: ReturnType<typeof this.terrainRenderer.getTerrainLoader>): void {
    if (!terrainLoader) return;

    // Snapshot: only expand from road tiles that already have concrete
    const snapshot = new Set(this.concreteTilesSet);

    for (const [key] of this.roadTilesMap) {
      // Only road tiles that have concrete (= platform roads, not bridges)
      if (!snapshot.has(key)) continue;

      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Only expand on water tiles
      if (!isWater(terrainLoader.getLandId(x, y))) continue;

      // Add 1-tile border around this road tile
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const nLandId = terrainLoader.getLandId(nx, ny);
          if (canReceiveConcrete(nLandId)) {
            this.concreteTilesSet.add(`${nx},${ny}`);
          }
        }
      }
    }
  }

  /**
   * Preload building textures for faster rendering
   */
  private preloadBuildingTextures(buildings: MapBuilding[]): void {
    const uniqueClasses = new Set<string>();
    buildings.forEach(b => uniqueClasses.add(b.visualClass));

    const textureFilenames = Array.from(uniqueClasses).map(
      visualClass => GameObjectTextureCache.getBuildingTextureFilename(visualClass)
    );

    this.gameObjectTextureCache.preload('BuildingImages', textureFilenames);
  }

  /**
   * Update map data with buildings and road segments for a zone
   */
  public updateMapData(mapData: { x: number; y: number; w: number; h: number; buildings: MapBuilding[]; segments: MapSegment[] }) {
    this.addCachedZone(mapData.x, mapData.y, mapData.w, mapData.h, mapData.buildings, mapData.segments);
  }

  /**
   * Invalidate a specific zone, forcing it to reload on next visibility check
   * Use this when the server notifies that a specific area has changed
   */
  public invalidateZone(x: number, y: number): void {
    const zoneSize = 64;
    const alignedX = Math.floor(x / zoneSize) * zoneSize;
    const alignedY = Math.floor(y / zoneSize) * zoneSize;
    const key = `${alignedX},${alignedY}`;

    const cached = this.cachedZones.get(key);
    if (cached) {
      cached.forceRefresh = true;
      console.log(`[IsometricMapRenderer] Zone ${key} marked for refresh`);
    }
  }

  /**
   * Invalidate all cached zones, forcing full reload
   * Use this when reconnecting or after major game state changes
   */
  public invalidateAllZones(): void {
    let count = 0;
    this.cachedZones.forEach(zone => {
      zone.forceRefresh = true;
      count++;
    });
    console.log(`[IsometricMapRenderer] Marked ${count} zones for refresh`);
  }

  /**
   * Invalidate zones within a rectangular area
   * Use this when the server notifies that a region has changed
   */
  public invalidateArea(x1: number, y1: number, x2: number, y2: number): void {
    const zoneSize = 64;
    const startX = Math.floor(Math.min(x1, x2) / zoneSize) * zoneSize;
    const endX = Math.ceil(Math.max(x1, x2) / zoneSize) * zoneSize;
    const startY = Math.floor(Math.min(y1, y2) / zoneSize) * zoneSize;
    const endY = Math.ceil(Math.max(y1, y2) / zoneSize) * zoneSize;

    let count = 0;
    for (let x = startX; x < endX; x += zoneSize) {
      for (let y = startY; y < endY; y += zoneSize) {
        const key = `${x},${y}`;
        const cached = this.cachedZones.get(key);
        if (cached) {
          cached.forceRefresh = true;
          count++;
        }
      }
    }
    console.log(`[IsometricMapRenderer] Marked ${count} zones in area for refresh`);
  }

  // =========================================================================
  // CALLBACKS
  // =========================================================================

  public setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void) {
    this.onLoadZone = callback;

    // Initialize zone request manager now that we have the callback
    this.zoneRequestManager = new ZoneRequestManager(callback, 64);
  }

  /**
   * Manually trigger zone checking (useful after callbacks are set up)
   */
  public triggerZoneCheck() {
    this.checkVisibleZones();
  }

  public setBuildingClickCallback(callback: (x: number, y: number, visualClass?: string) => void) {
    this.onBuildingClick = callback;
  }

  public setCancelPlacementCallback(callback: () => void) {
    this.onCancelPlacement = callback;
  }

  public setFetchFacilityDimensionsCallback(callback: (visualClass: string) => Promise<FacilityDimensions | null>) {
    this.onFetchFacilityDimensions = callback;
  }

  public setRoadSegmentCompleteCallback(callback: (x1: number, y1: number, x2: number, y2: number) => void) {
    this.onRoadSegmentComplete = callback;
  }

  public setCancelRoadDrawingCallback(callback: () => void) {
    this.onCancelRoadDrawing = callback;
  }

  // =========================================================================
  // CAMERA CONTROL
  // =========================================================================

  /**
   * Center camera on specific coordinates (in original map coordinates x, y)
   */
  public centerOn(x: number, y: number) {
    // Convert from original coordinate system (x, y) to isometric (i, j)
    // In the original system, x was column and y was row
    // In isometric, i is row and j is column
    this.terrainRenderer.centerOn(y, x);
    this.checkVisibleZones();
  }

  /**
   * Get current camera position
   */
  public getCameraPosition(): { x: number; y: number } {
    const pos = this.terrainRenderer.getCameraPosition();
    // Convert back: j = x (column), i = y (row)
    return { x: pos.j, y: pos.i };
  }

  /**
   * Set zoom level (0-3)
   */
  public setZoom(level: number) {
    const previousZoom = this.terrainRenderer.getZoomLevel();
    this.terrainRenderer.setZoomLevel(level);
    this.terrainRenderer.clearDistantZoomCaches(level);

    // Clear vehicles when zooming out of Z2/Z3 range
    if (previousZoom >= 2 && level < 2 && this.vehicleSystem) {
      this.vehicleSystem.clear();
      this.animationLoopRunning = false;
    }
    // Start animation loop when zooming into Z2/Z3 range
    if (previousZoom < 2 && level >= 2) {
      this.startAnimationLoop();
    }

    this.checkVisibleZones();
    this.requestRender();
  }

  /**
   * Get current zoom level
   */
  public getZoom(): number {
    return this.terrainRenderer.getZoomLevel();
  }

  // =========================================================================
  // ZONE OVERLAY
  // =========================================================================

  public setZoneOverlay(enabled: boolean, data?: SurfaceData, x1?: number, y1?: number) {
    this.zoneOverlayEnabled = enabled;
    if (data) {
      this.zoneOverlayData = data;
      this.zoneOverlayX1 = x1 || 0;
      this.zoneOverlayY1 = y1 || 0;
    }
    this.requestRender();
  }

  // =========================================================================
  // PLACEMENT MODE
  // =========================================================================

  public setPlacementMode(
    enabled: boolean,
    buildingName: string = '',
    cost: number = 0,
    area: number = 0,
    zoneRequirement: string = '',
    xsize: number = 1,
    ysize: number = 1
  ) {
    this.placementMode = enabled;
    if (enabled && buildingName) {
      this.placementPreview = {
        i: this.mouseMapI,
        j: this.mouseMapJ,
        buildingName,
        cost,
        area,
        zoneRequirement,
        xsize,
        ysize
      };
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.placementPreview = null;
      this.canvas.style.cursor = 'grab';
    }
    this.requestRender();
  }

  public getPlacementCoordinates(): { x: number; y: number } | null {
    if (!this.placementPreview) return null;
    return { x: this.placementPreview.j, y: this.placementPreview.i };
  }

  // =========================================================================
  // ROAD DRAWING MODE
  // =========================================================================

  public setRoadDrawingMode(enabled: boolean) {
    this.roadDrawingMode = enabled;
    this.roadDrawingState = {
      isDrawing: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      isMouseDown: false,
      mouseDownTime: 0
    };
    this.canvas.style.cursor = enabled ? 'crosshair' : 'grab';
    this.requestRender();
  }

  public isRoadDrawingModeActive(): boolean {
    return this.roadDrawingMode;
  }

  public setOnRoadSegmentComplete(callback: (x1: number, y1: number, x2: number, y2: number) => void) {
    this.onRoadSegmentComplete = callback;
  }

  public setOnRoadDrawingCancel(callback: () => void) {
    this.onCancelRoadDrawing = callback;
  }

  /**
   * Validate if a road can be built between two points
   * Returns an object with valid flag and optional error message
   */
  public validateRoadPath(x1: number, y1: number, x2: number, y2: number): { valid: boolean; error?: string } {
    // Generate the staircase path
    const pathTiles = this.generateStaircasePath(x1, y1, x2, y2);

    // Check for building collisions
    for (const tile of pathTiles) {
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;

        if (tile.x >= building.x && tile.x < building.x + bw &&
            tile.y >= building.y && tile.y < building.y + bh) {
          return { valid: false, error: 'Road blocked by building' };
        }
      }
    }

    // Check if road connects to existing roads
    if (!this.checkRoadPathConnectsToExisting(pathTiles)) {
      return { valid: false, error: 'Road must connect to existing road network' };
    }

    return { valid: true };
  }

  // =========================================================================
  // RENDERING
  // =========================================================================

  /**
   * Schedule a render on the next animation frame (debounced).
   * Multiple calls within the same frame are coalesced into one render.
   * Use this for event-driven updates (mouse move, texture loaded, chunk ready).
   */
  private requestRender(): void {
    if (this.pendingRender !== null) return;
    this.pendingRender = requestAnimationFrame(() => {
      this.pendingRender = null;
      this.render();
    });
  }

  /**
   * Main render loop
   */
  public render() {
    // Calculate deltaTime for animations
    const now = performance.now();
    const deltaTime = this.lastRenderTime > 0 ? (now - this.lastRenderTime) / 1000 : 0;
    this.lastRenderTime = now;

    // First, render terrain (this clears and draws the base layer)
    this.terrainRenderer.render();

    if (!this.mapLoaded) return;

    // Get visible bounds for culling
    const bounds = this.getVisibleBounds();

    // Draw vegetation overlay (special terrain tiles) above flat terrain base
    this.drawVegetation(bounds);

    // Build tile occupation map (buildings have priority over roads)
    const occupiedTiles = this.buildTileOccupationMap();

    // Draw game object layers on top of terrain + vegetation
    this.drawConcrete(bounds);
    this.drawRoads(bounds, occupiedTiles);
    this.drawBuildings(bounds);
    this.drawVehicles(bounds, deltaTime, occupiedTiles);
    this.drawZoneOverlay(bounds);
    this.drawPlacementPreview();
    this.drawRoadDrawingPreview();

    // Draw debug overlay if enabled
    if (this.debugMode) {
      this.drawDebugOverlay(bounds);
    }

    // Draw additional info (game-specific overlay)
    this.drawGameInfo();
  }

  /**
   * Get visible tile bounds
   */
  private getVisibleBounds(): TileBounds {
    const viewport: Rect = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height
    };

    // Get the actual origin from terrain renderer (camera position in screen coords)
    const origin = this.terrainRenderer.getOrigin();

    return this.terrainRenderer.getCoordinateMapper().getVisibleBounds(
      viewport,
      this.terrainRenderer.getZoomLevel(),
      this.terrainRenderer.getRotation(),
      origin
    );
  }

  /**
   * Build occupied tiles map (buildings have priority over roads)
   */
  private buildTileOccupationMap(): Set<string> {
    const occupied = new Set<string>();

    this.allBuildings.forEach(building => {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      for (let dy = 0; dy < ysize; dy++) {
        for (let dx = 0; dx < xsize; dx++) {
          occupied.add(`${building.x + dx},${building.y + dy}`);
        }
      }
    });

    return occupied;
  }

  /**
   * Check if a tile has concrete (building adjacency approach)
   * Uses pre-computed Set for O(1) lookup instead of scanning all buildings
   */
  private hasConcrete(x: number, y: number): boolean {
    return this.concreteTilesSet.has(`${x},${y}`);
  }

  /**
   * Check if a tile is on a water platform (has concrete AND is on water).
   * Used for applying platform Y-shift to concrete, roads, and buildings.
   */
  private isOnWaterPlatform(x: number, y: number): boolean {
    if (!this.hasConcrete(x, y)) return false;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    if (!terrainLoader) return false;
    return isWater(terrainLoader.getLandId(x, y));
  }

  /**
   * Check if a building occupies a specific tile
   */
  private isTileOccupiedByBuilding(x: number, y: number): boolean {
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      if (x >= building.x && x < building.x + bw &&
          y >= building.y && y < building.y + bh) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get building at a specific tile position
   * Returns the building object if found, undefined otherwise
   */
  private getBuildingAtTile(x: number, y: number): MapBuilding | undefined {
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      if (x >= building.x && x < building.x + bw &&
          y >= building.y && y < building.y + bh) {
        return building;
      }
    }
    return undefined;
  }

  /**
   * Draw concrete tiles around buildings
   * Concrete appears on tiles adjacent to buildings to create paved areas
   */
  private drawConcrete(bounds: TileBounds): void {
    if (!this.concreteBlockClassesLoaded) return;
    // Skip concrete at far zoom levels — tiles are too small (8×4 or 16×8 px) to see concrete detail
    if (this.terrainRenderer.getZoomLevel() <= 1) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();

    // Create map data adapter for concrete calculations
    const mapData: ConcreteMapData = {
      getLandId: (row, col) => {
        if (!terrainLoader) return 0;
        return terrainLoader.getLandId(col, row);
      },
      hasConcrete: (row, col) => this.hasConcrete(col, row),
      hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
      hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
    };

    // Collect concrete tiles for painter's algorithm sorting
    const concreteTiles: Array<{
      i: number;
      j: number;
      concreteId: number;
      screenX: number;
      screenY: number;
    }> = [];

    // Iterate visible tiles and collect concrete tiles
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        // Skip tiles without concrete
        if (!mapData.hasConcrete(i, j)) continue;

        // Calculate concrete ID based on neighbors
        const concreteId = getConcreteId(i, j, mapData);
        if (concreteId === CONCRETE_NONE) continue;

        // Get screen position
        const screenPos = this.terrainRenderer.mapToScreen(i, j);
        concreteTiles.push({
          i,
          j,
          concreteId,
          screenX: screenPos.x,
          screenY: screenPos.y
        });
      }
    }

    // Painter's algorithm: higher (i+j) drawn first, lower drawn last (on top)
    concreteTiles.sort(painterSort);

    // Platform elevation: water platforms float above water surface
    const scaleFactor = config.tileWidth / 64;
    const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);

    // Draw sorted concrete tiles
    for (const tile of concreteTiles) {
      const isWaterPlatform = (tile.concreteId & 0x80) !== 0;
      const drawY = isWaterPlatform ? tile.screenY - platformYShift : tile.screenY;

      // Get texture filename from class manager
      const filename = this.concreteBlockClassManager.getImageFilename(tile.concreteId);
      if (filename) {
        // Try atlas first (single large image with source rectangles)
        const atlasRect = this.gameObjectTextureCache.getAtlasRect('ConcreteImages', filename);
        if (atlasRect) {
          if (isWaterPlatform) {
            ctx.drawImage(
              atlasRect.atlas,
              atlasRect.sx, atlasRect.sy, atlasRect.sw, atlasRect.sh,
              tile.screenX - atlasRect.sw / 2, drawY,
              atlasRect.sw, atlasRect.sh
            );
          } else {
            ctx.drawImage(
              atlasRect.atlas,
              atlasRect.sx, atlasRect.sy, atlasRect.sw, atlasRect.sh,
              tile.screenX - halfWidth, drawY,
              config.tileWidth, config.tileHeight
            );
          }
          continue;
        }

        // Fallback: individual texture
        const texture = this.gameObjectTextureCache.getTextureSync('ConcreteImages', filename);
        if (texture) {
          if (isWaterPlatform) {
            ctx.drawImage(texture, tile.screenX - texture.width / 2, drawY);
          } else {
            ctx.drawImage(texture, tile.screenX - halfWidth, drawY, config.tileWidth, config.tileHeight);
          }
          continue;
        }
      }

      // Fallback: draw debug colored tile if texture not available
      this.drawDebugConcreteTile(ctx, tile.screenX, drawY, tile.concreteId, config);
    }
  }

  /**
   * Draw a debug colored tile for concrete (when texture not available)
   */
  private drawDebugConcreteTile(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    concreteId: number,
    config: ZoomConfig
  ): void {
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    // Choose color based on concrete type
    let color: string;
    if ((concreteId & 0x80) !== 0) {
      // Water platform - blue-gray
      color = 'rgba(100, 120, 140, 0.7)';
    } else if ((concreteId & 0x10) !== 0) {
      // Road concrete - dark gray
      color = 'rgba(80, 80, 80, 0.7)';
    } else if (concreteId === 15) {
      // Special decorative - light pattern
      color = 'rgba(160, 160, 160, 0.7)';
    } else if (concreteId === 12) {
      // Full concrete - medium gray
      color = 'rgba(140, 140, 140, 0.7)';
    } else {
      // Edge/corner concrete - slightly lighter
      color = 'rgba(130, 130, 130, 0.7)';
    }

    // Draw isometric diamond
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + halfWidth, sy + halfHeight);
    ctx.lineTo(sx, sy + config.tileHeight);
    ctx.lineTo(sx - halfWidth, sy + halfHeight);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /**
   * Draw road segments as isometric tiles with textures
   * Uses the road texture system to determine correct textures based on topology
   *
   * Two-pass rendering (same as terrain special textures):
   * - Pass 1: Standard road tiles (texture height <= 32)
   * - Pass 2: Tall road tiles (bridges) sorted by (i+j) ascending for painter's algorithm
   */
  private drawRoads(bounds: TileBounds, occupiedTiles: Set<string>) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();

    // Standard tile height at base resolution (64×32)
    const BASE_TILE_HEIGHT = 32;

    // Platform elevation for roads on water platforms
    const scaleFactor = config.tileWidth / 64;
    const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);

    // Collect all road tiles into a single array for unified painter's algorithm sorting.
    // Bridges and standard tiles are interleaved so bridges don't render on top of closer roads.
    const allRoadTiles: Array<{
      x: number;
      y: number;
      sx: number;
      sy: number;
      topology: RoadBlockId;
      texture: ImageBitmap | null;
      atlasRect: { atlas: ImageBitmap; sx: number; sy: number; sw: number; sh: number } | null;
      onWaterPlatform: boolean;
      isTall: boolean;
      textureHeight: number;
      roadBlockId: number;
    }> = [];

    for (const [key] of this.roadTilesMap) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Skip if occupied by building
      if (occupiedTiles.has(key)) continue;

      // Viewport culling
      if (x < bounds.minJ || x > bounds.maxJ || y < bounds.minI || y > bounds.maxI) {
        continue;
      }

      // Convert to isometric coordinates (x = j, y = i)
      const screenPos = this.terrainRenderer.mapToScreen(y, x);

      // Cull if off-screen (extra margin for tall textures)
      if (screenPos.x < -config.tileWidth || screenPos.x > this.canvas.width + config.tileWidth ||
          screenPos.y < -config.tileHeight * 2 || screenPos.y > this.canvas.height + config.tileHeight * 2) {
        continue;
      }

      // Round coordinates for pixel-perfect rendering
      const sx = Math.round(screenPos.x);
      const sy = Math.round(screenPos.y);

      let topology = RoadBlockId.None;
      let texture: ImageBitmap | null = null;
      let atlasRect: { atlas: ImageBitmap; sx: number; sy: number; sw: number; sh: number } | null = null;
      let textureHeight = 0;
      let fullRoadBlockId = 0;

      if (this.roadBlockClassesLoaded && this.roadsRendering) {
        topology = this.roadsRendering.get(y, x);

        if (topology !== RoadBlockId.None) {
          const landId = terrainLoader.getLandId(x, y);
          const onConcrete = this.hasConcrete(x, y);

          // Check for smooth corner: angles use smooth textures,
          // diagonals (adjacent opposite corners) keep regular "oblique" textures
          const smoothResult = detectSmoothCorner(
            y, x, this.roadsRendering,
            (_r, c) => this.hasConcrete(c, _r)
          );

          fullRoadBlockId = smoothResult.isSmooth
            ? smoothResult.roadBlock
            : roadBlockId(topology, landId, onConcrete, false, false);

          const texturePath = this.roadBlockClassManager.getImagePath(fullRoadBlockId);
          if (texturePath) {
            const filename = texturePath.split('/').pop() || '';

            // Try atlas first
            const rect = this.gameObjectTextureCache.getAtlasRect('RoadBlockImages', filename);
            if (rect) {
              atlasRect = rect;
              textureHeight = rect.sh;
            } else {
              // Fallback: individual texture
              texture = this.gameObjectTextureCache.getTextureSync('RoadBlockImages', filename);
              if (texture) textureHeight = texture.height;
            }
          }
        }
      }

      // Check if this road is on a water platform (concrete + water = elevated urban road)
      const onWaterPlatform = this.isOnWaterPlatform(x, y);
      const isTall = (texture !== null || atlasRect !== null) && textureHeight > BASE_TILE_HEIGHT;

      allRoadTiles.push({
        x, y, sx, sy, topology, texture, atlasRect,
        onWaterPlatform, isTall, textureHeight,
        roadBlockId: fullRoadBlockId
      });
    }

    // Unified painter's algorithm: sort all tiles by (i+j) descending (back-to-front)
    allRoadTiles.sort((a, b) => (b.y + b.x) - (a.y + a.x));

    const scale = config.tileWidth / 64;

    // Single pass: render each tile according to its type, in painter's order.
    // Bridge base + cover textures are drawn together so they respect depth ordering
    // relative to standard road tiles.
    for (const tile of allRoadTiles) {
      if (tile.isTall) {
        // Tall tile (bridge): draw base texture bottom-aligned
        const scaledHeight = tile.textureHeight * scale;
        const yOffset = scaledHeight - config.tileHeight;

        if (tile.atlasRect) {
          const r = tile.atlasRect;
          ctx.drawImage(r.atlas, r.sx, r.sy, r.sw, r.sh, tile.sx - halfWidth, tile.sy - yOffset, config.tileWidth, scaledHeight);
        } else if (tile.texture) {
          ctx.drawImage(tile.texture, tile.sx - halfWidth, tile.sy - yOffset, config.tileWidth, scaledHeight);
        }

        // Draw bridge cover/railing texture immediately on top of base
        if (isBridge(tile.roadBlockId)) {
          const railingPath = this.roadBlockClassManager.getRailingImagePath(tile.roadBlockId);
          if (railingPath) {
            const railingFilename = railingPath.split('/').pop() || '';
            const railingRect = this.gameObjectTextureCache.getAtlasRect('RoadBlockImages', railingFilename);

            if (railingRect) {
              const rScaledHeight = railingRect.sh * scale;
              const rYOffset = rScaledHeight - config.tileHeight;
              ctx.drawImage(
                railingRect.atlas,
                railingRect.sx, railingRect.sy, railingRect.sw, railingRect.sh,
                tile.sx - halfWidth, tile.sy - rYOffset,
                config.tileWidth, rScaledHeight
              );
            } else {
              const railingTex = this.gameObjectTextureCache.getTextureSync('RoadBlockImages', railingFilename);
              if (railingTex) {
                const rScaledHeight = railingTex.height * scale;
                const rYOffset = rScaledHeight - config.tileHeight;
                ctx.drawImage(railingTex, tile.sx - halfWidth, tile.sy - rYOffset, config.tileWidth, rScaledHeight);
              }
            }
          }
        }
      } else {
        // Standard tile: draw at tile size, elevated if on water platform
        const drawSy = tile.onWaterPlatform ? tile.sy - platformYShift : tile.sy;
        if (tile.atlasRect) {
          const r = tile.atlasRect;
          ctx.drawImage(r.atlas, r.sx, r.sy, r.sw, r.sh, tile.sx - halfWidth, drawSy, config.tileWidth, config.tileHeight);
        } else if (tile.texture) {
          ctx.drawImage(tile.texture, tile.sx - halfWidth, drawSy, config.tileWidth, config.tileHeight);
        } else {
          // Fallback: draw colored diamond
          ctx.beginPath();
          ctx.moveTo(tile.sx, drawSy);
          ctx.lineTo(tile.sx - halfWidth, drawSy + halfHeight);
          ctx.lineTo(tile.sx, drawSy + config.tileHeight);
          ctx.lineTo(tile.sx + halfWidth, drawSy + halfHeight);
          ctx.closePath();
          ctx.fillStyle = this.getDebugColorForTopology(tile.topology);
          ctx.fill();
        }
      }
    }
  }

  /**
   * Draw vegetation overlay (special terrain tiles: trees, decorations)
   * Rendered on top of flat terrain base, below concrete/roads/buildings.
   * Vegetation within 2 tiles of buildings/roads is automatically hidden.
   * Can be disabled during camera movement for performance.
   * Uses painter's algorithm: lower tiles (closer to viewer) drawn last.
   */
  private drawVegetation(bounds: TileBounds): void {
    // Skip if vegetation is globally disabled
    if (!this.vegetationEnabled) return;
    // Skip entirely at the farthest zoom level — vegetation is too small to see
    const currentZoom = this.terrainRenderer.getZoomLevel();
    if (currentZoom === 0) return;
    // At z1, auto-enable hide-on-move behavior for performance
    if ((this.hideVegetationOnMove || currentZoom === 1) && this.isCameraMoving) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const textureCache = this.terrainRenderer.getTextureCache();
    const atlasCache = this.terrainRenderer.getAtlasCache();
    const useAtlas = atlasCache.isReady();

    const BASE_TILE_HEIGHT = 32;

    // Collect vegetation tiles
    const vegTiles: Array<{
      i: number;
      j: number;
      sx: number;
      sy: number;
      textureId: number;
    }> = [];

    // Extend bounds by 2 tiles to catch tall textures that visually overlap into the viewport
    for (let i = bounds.minI - 2; i <= bounds.maxI + 2; i++) {
      for (let j = bounds.minJ - 2; j <= bounds.maxJ + 2; j++) {
        const textureId = terrainLoader.getTextureId(j, i);

        // Only render special tiles (vegetation/decorations)
        if (!isSpecialTile(textureId)) continue;

        // Skip tiles near buildings/roads (flattened in base terrain)
        if (this.vegetationMapper.shouldFlatten(i, j, textureId)) continue;

        const screenPos = this.terrainRenderer.mapToScreen(i, j);

        // Frustum cull with extra margin for tall textures
        if (screenPos.x < -config.tileWidth * 2 || screenPos.x > this.canvas.width + config.tileWidth * 2 ||
            screenPos.y < -config.tileHeight * 4 || screenPos.y > this.canvas.height + config.tileHeight * 2) {
          continue;
        }

        vegTiles.push({
          i, j,
          sx: Math.round(screenPos.x),
          sy: Math.round(screenPos.y),
          textureId,
        });
      }
    }

    // Sort by (i+j) descending for painter's algorithm (back-to-front)
    vegTiles.sort((a, b) => (b.i + b.j) - (a.i + a.j));

    // Draw vegetation tiles
    if (useAtlas) {
      const atlasImg = atlasCache.getAtlas()!;

      for (const tile of vegTiles) {
        const rect = atlasCache.getTileRect(tile.textureId);
        if (!rect) continue;

        if (rect.sh > BASE_TILE_HEIGHT) {
          // Tall texture: draw at full height with upward offset
          const scale = config.tileWidth / 64;
          const scaledHeight = rect.sh * scale;
          const yOffset = scaledHeight - config.tileHeight;

          ctx.drawImage(
            atlasImg,
            rect.sx, rect.sy, rect.sw, rect.sh,
            tile.sx - halfWidth, tile.sy - yOffset,
            config.tileWidth, scaledHeight
          );
        } else {
          // Standard height special texture
          ctx.drawImage(
            atlasImg,
            rect.sx, rect.sy, rect.sw, rect.sh,
            tile.sx - halfWidth, tile.sy,
            config.tileWidth, config.tileHeight
          );
        }
      }
    } else {
      // Fallback: individual textures
      for (const tile of vegTiles) {
        const texture = textureCache.getTextureSync(tile.textureId);
        if (!texture) continue;

        if (texture.height > BASE_TILE_HEIGHT) {
          const scale = config.tileWidth / 64;
          const scaledHeight = texture.height * scale;
          const yOffset = scaledHeight - config.tileHeight;

          ctx.drawImage(
            texture,
            tile.sx - halfWidth, tile.sy - yOffset,
            config.tileWidth, scaledHeight
          );
        } else {
          ctx.drawImage(
            texture,
            tile.sx - halfWidth, tile.sy,
            config.tileWidth, config.tileHeight
          );
        }
      }
    }
  }

  /**
   * Check if a tile is on concrete (urban area)
   * Simple heuristic: check if adjacent to an urban building
   */
  private isOnConcrete(x: number, y: number): boolean {
    const checkRadius = 2;

    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      // Check if road tile is within radius of building
      const nearX = x >= building.x - checkRadius && x < building.x + xsize + checkRadius;
      const nearY = y >= building.y - checkRadius && y < building.y + ysize + checkRadius;

      if (nearX && nearY) {
        // Check if building is urban (simplified check)
        const name = dims?.Name?.toLowerCase() || '';
        if (this.isUrbanBuilding(name)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a building name suggests it's an urban building
   */
  private isUrbanBuilding(name: string): boolean {
    const urbanKeywords = [
      'office', 'store', 'shop', 'mall', 'bank', 'hotel',
      'hospital', 'clinic', 'school', 'university',
      'restaurant', 'bar', 'club', 'theater', 'cinema',
      'apartment', 'condo', 'tower', 'headquarters'
    ];

    return urbanKeywords.some(keyword => name.includes(keyword));
  }

  /**
   * Get debug color for road topology (used when texture not available)
   */
  private getDebugColorForTopology(topology: RoadBlockId): string {
    switch (topology) {
      case RoadBlockId.NSRoad:
      case RoadBlockId.NSRoadStart:
      case RoadBlockId.NSRoadEnd:
        return '#777'; // Vertical roads - lighter gray

      case RoadBlockId.WERoad:
      case RoadBlockId.WERoadStart:
      case RoadBlockId.WERoadEnd:
        return '#555'; // Horizontal roads - darker gray

      case RoadBlockId.CornerN:
      case RoadBlockId.CornerE:
      case RoadBlockId.CornerS:
      case RoadBlockId.CornerW:
        return '#886'; // Corners - brownish

      case RoadBlockId.LeftPlug:
      case RoadBlockId.RightPlug:
      case RoadBlockId.TopPlug:
      case RoadBlockId.BottomPlug:
        return '#868'; // T-junctions - purplish

      case RoadBlockId.CrossRoads:
        return '#688'; // Crossroads - teal

      default:
        return '#666'; // Default gray
    }
  }

  /**
   * Draw buildings as isometric tiles with textures
   * Uses Painter's algorithm: sort by depth (y + x) so buildings closer to viewer are drawn last
   */
  private drawBuildings(bounds: TileBounds) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    // Pre-filter buildings by visible bounds (with margin for multi-tile buildings)
    const margin = 10; // Generous margin for large buildings
    const visibleBuildings = this.allBuildings.filter(b => {
      const dims = this.facilityDimensionsCache.get(b.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;
      return b.x + bw > bounds.minJ - margin && b.x < bounds.maxJ + margin &&
             b.y + bh > bounds.minI - margin && b.y < bounds.maxI + margin;
    });

    // Painter's algorithm: sort by depth (x+y)
    // In isometric view, lower (x+y) = closer to viewer = lower on screen = draw LAST (on top)
    // Higher (x+y) = farther from viewer = higher on screen = draw FIRST (behind)
    const sortedBuildings = visibleBuildings.sort((a, b) => {
      const aDepth = a.y + a.x;
      const bDepth = b.y + b.x;
      return bDepth - aDepth; // Descending: draw farther buildings first, closer ones last
    });

    sortedBuildings.forEach(building => {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      const isHovered = this.hoveredBuilding === building;

      // Try to get building texture
      const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(building.visualClass);
      const texture = this.gameObjectTextureCache.getTextureSync('BuildingImages', textureFilename);

      if (texture) {
        // Calculate zoom scale factor
        // Building textures are designed for 64x32 tile size (zoom level 3)
        // Scale proportionally to current zoom level
        const scaleFactor = config.tileWidth / 64;
        const scaledWidth = texture.width * scaleFactor;
        const scaledHeight = texture.height * scaleFactor;

        // Calculate the anchor point: the SOUTH corner of the building footprint
        // In isometric: lower i,j values = closer to viewer (higher screen Y)
        // The south corner (front, closest to viewer) is at (building.x, building.y)
        // But we need the SOUTH VERTEX of that tile, which is at the bottom of the tile
        const southCornerScreenPos = this.terrainRenderer.mapToScreen(building.y, building.x);

        // The texture bottom-center should align with the south vertex of the south corner tile
        // South vertex is at screenPos.y + tileHeight
        const drawX = Math.round(southCornerScreenPos.x - scaledWidth / 2);
        let drawY = Math.round(southCornerScreenPos.y + config.tileHeight - scaledHeight);

        // Buildings on water platforms are elevated to match the platform
        if (this.isOnWaterPlatform(building.x, building.y)) {
          const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);
          drawY -= platformYShift;
        }

        // Cull if completely off-screen
        if (drawX + scaledWidth < 0 ||
            drawX > this.canvas.width ||
            drawY + scaledHeight < 0 ||
            drawY > this.canvas.height) {
          return;
        }

        if (isHovered) {
          // Draw highlight behind the texture
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#5fadff';
          this.drawBuildingFootprint(building, xsize, ysize, config, halfWidth, halfHeight);
          ctx.globalAlpha = 1.0;
        }

        // Draw texture scaled to match current zoom level
        ctx.drawImage(texture, drawX, drawY, scaledWidth, scaledHeight);

        // Draw VisualClass label for debugging/identification
        this.drawBuildingLabel(building.visualClass, southCornerScreenPos.x, southCornerScreenPos.y + halfHeight);
      } else {
        // Texture not loaded yet — skip (will render once texture arrives via onTextureLoaded callback)
        return;
      }
    });
  }

  /**
   * Draw building VisualClass label for identification
   * Skipped at zoom levels 0-1 where tiles are too small for readable labels
   */
  private drawBuildingLabel(visualClass: string, x: number, y: number): void {
    // Skip labels at far zoom levels — tiles are too small for readable text
    if (this.terrainRenderer.getZoomLevel() <= 1) return;

    const ctx = this.ctx;

    // Draw label background
    ctx.font = '10px monospace';
    const text = visualClass;
    const metrics = ctx.measureText(text);
    const padding = 2;
    const bgWidth = metrics.width + padding * 2;
    const bgHeight = 12;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(Math.round(x - bgWidth / 2), Math.round(y - bgHeight / 2), bgWidth, bgHeight);

    // Draw label text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  /**
   * Draw building footprint outline (used for hover highlighting)
   */
  private drawBuildingFootprint(
    building: MapBuilding,
    xsize: number,
    ysize: number,
    config: ZoomConfig,
    halfWidth: number,
    halfHeight: number
  ): void {
    const ctx = this.ctx;

    for (let dy = 0; dy < ysize; dy++) {
      for (let dx = 0; dx < xsize; dx++) {
        const screenPos = this.terrainRenderer.mapToScreen(building.y + dy, building.x + dx);
        const sx = Math.round(screenPos.x);
        const sy = Math.round(screenPos.y);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - halfWidth, sy + halfHeight);
        ctx.lineTo(sx, sy + config.tileHeight);
        ctx.lineTo(sx + halfWidth, sy + halfHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /**
   * Draw zone overlay as semi-transparent isometric tiles
   */
  private drawZoneOverlay(bounds: TileBounds) {
    if (!this.zoneOverlayEnabled || !this.zoneOverlayData) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const data = this.zoneOverlayData;

    // Zone color mapping
    const zoneColors: Record<number, string> = {
      0: 'transparent',
      3000: 'rgba(255, 107, 107, 0.3)',  // Residential - Red
      4000: 'rgba(77, 171, 247, 0.3)',   // Commercial - Blue
      5000: 'rgba(255, 212, 59, 0.3)',   // Industrial - Yellow
      6000: 'rgba(81, 207, 102, 0.3)',   // Agricultural - Green
      7000: 'rgba(255, 146, 43, 0.3)',   // Mixed - Orange
      8000: 'rgba(132, 94, 247, 0.3)',   // Special - Purple
      9000: 'rgba(253, 126, 20, 0.3)',   // Other - Bright Orange
    };

    for (let row = 0; row < data.rows.length; row++) {
      const rowData = data.rows[row];
      for (let col = 0; col < rowData.length; col++) {
        const value = rowData[col];
        if (value === 0) continue;

        const worldX = this.zoneOverlayX1 + col;
        const worldY = this.zoneOverlayY1 + row;

        // Convert to isometric (x = j, y = i)
        const screenPos = this.terrainRenderer.mapToScreen(worldY, worldX);

        // Cull if off-screen
        if (screenPos.x < -config.tileWidth || screenPos.x > this.canvas.width + config.tileWidth ||
            screenPos.y < -config.tileHeight || screenPos.y > this.canvas.height + config.tileHeight) {
          continue;
        }

        const color = zoneColors[value] || 'rgba(136, 136, 136, 0.3)';

        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
        ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
        ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }

  /**
   * Draw building placement preview
   */
  private drawPlacementPreview() {
    if (!this.placementMode || !this.placementPreview) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const preview = this.placementPreview;

    // Check for collisions
    let hasCollision = false;
    for (let dy = 0; dy < preview.ysize && !hasCollision; dy++) {
      for (let dx = 0; dx < preview.xsize && !hasCollision; dx++) {
        const checkX = preview.j + dx;
        const checkY = preview.i + dy;

        // Check building collision
        for (const building of this.allBuildings) {
          const dims = this.facilityDimensionsCache.get(building.visualClass);
          const bw = dims?.xsize || 1;
          const bh = dims?.ysize || 1;

          if (checkX >= building.x && checkX < building.x + bw &&
              checkY >= building.y && checkY < building.y + bh) {
            hasCollision = true;
            break;
          }
        }

        // Check road collision
        for (const seg of this.allSegments) {
          const minX = Math.min(seg.x1, seg.x2);
          const maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2);
          const maxY = Math.max(seg.y1, seg.y2);

          if (checkX >= minX && checkX <= maxX &&
              checkY >= minY && checkY <= maxY) {
            hasCollision = true;
            break;
          }
        }
      }
    }

    const fillColor = hasCollision ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 255, 100, 0.5)';
    const strokeColor = hasCollision ? '#ff4444' : '#44ff44';

    // Draw preview tiles
    for (let dy = 0; dy < preview.ysize; dy++) {
      for (let dx = 0; dx < preview.xsize; dx++) {
        const tileJ = preview.j + dx;
        const tileI = preview.i + dy;

        const screenPos = this.terrainRenderer.mapToScreen(tileI, tileJ);

        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
        ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
        ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
        ctx.closePath();

        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw tooltip
    const centerPos = this.terrainRenderer.mapToScreen(preview.i, preview.j);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(centerPos.x + 20, centerPos.y - 60, 200, 80);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(preview.buildingName, centerPos.x + 30, centerPos.y - 42);
    ctx.fillText(`Cost: $${preview.cost.toLocaleString()}`, centerPos.x + 30, centerPos.y - 24);
    ctx.fillText(`Size: ${preview.xsize}×${preview.ysize}`, centerPos.x + 30, centerPos.y - 6);
    ctx.fillText(`Zone: ${preview.zoneRequirement}`, centerPos.x + 30, centerPos.y + 12);
  }

  /**
   * Draw road drawing preview
   * Shows either:
   * - A hover indicator for the current tile (when not drawing)
   * - The full path preview (when drawing/dragging)
   */
  private drawRoadDrawingPreview() {
    if (!this.roadDrawingMode) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const state = this.roadDrawingState;

    // If not drawing, show hover preview for current mouse tile
    if (!state.isDrawing) {
      this.drawRoadHoverIndicator(ctx, config, halfWidth, halfHeight);
      return;
    }

    // Generate staircase path
    const pathTiles = this.generateStaircasePath(
      state.startX, state.startY,
      state.endX, state.endY
    );

    // Check for collisions along path (buildings)
    let hasBuildingCollision = false;
    for (const tile of pathTiles) {
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;

        if (tile.x >= building.x && tile.x < building.x + bw &&
            tile.y >= building.y && tile.y < building.y + bh) {
          hasBuildingCollision = true;
          break;
        }
      }
      if (hasBuildingCollision) break;
    }

    // Check if road connects to existing roads (or is first road)
    const connectsToRoad = this.checkRoadPathConnectsToExisting(pathTiles);
    const hasConnectionError = !connectsToRoad;

    // Determine colors based on validation
    const hasError = hasBuildingCollision || hasConnectionError;
    const fillColor = hasError ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 200, 100, 0.5)';
    const strokeColor = hasError ? '#ff4444' : '#88ff88';

    // Draw path tiles
    for (const tile of pathTiles) {
      const screenPos = this.terrainRenderer.mapToScreen(tile.y, tile.x);

      ctx.beginPath();
      ctx.moveTo(screenPos.x, screenPos.y);
      ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
      ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
      ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw cost tooltip (expanded to show connection status)
    const endPos = this.terrainRenderer.mapToScreen(state.endY, state.endX);
    const tileCount = pathTiles.length;
    const cost = tileCount * this.roadCostPerTile;

    // Determine error message
    let errorMessage = '';
    if (hasBuildingCollision) {
      errorMessage = 'Blocked by building';
    } else if (hasConnectionError) {
      errorMessage = 'Must connect to road';
    }

    const tooltipHeight = errorMessage ? 55 : 40;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(endPos.x + 10, endPos.y - 30, 160, tooltipHeight);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tiles: ${tileCount}`, endPos.x + 20, endPos.y - 12);
    ctx.fillText(`Cost: $${cost.toLocaleString()}`, endPos.x + 20, endPos.y + 4);

    if (errorMessage) {
      ctx.fillStyle = '#ff6666';
      ctx.fillText(`⚠ ${errorMessage}`, endPos.x + 20, endPos.y + 20);
    }
  }

  /**
   * Draw hover indicator for road drawing start point
   * Shows a highlighted tile where the road will start when user clicks
   */
  private drawRoadHoverIndicator(
    ctx: CanvasRenderingContext2D,
    config: { tileWidth: number; tileHeight: number },
    halfWidth: number,
    halfHeight: number
  ) {
    const x = this.mouseMapJ;
    const y = this.mouseMapI;

    // Check if this tile connects to existing roads (or is first road)
    const connectsToRoad = this.checkRoadPathConnectsToExisting([{ x, y }]);
    const hasExistingRoad = this.hasRoadAt(x, y);

    // Check for building collision at this tile
    let hasBuildingCollision = false;
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      if (x >= building.x && x < building.x + bw &&
          y >= building.y && y < building.y + bh) {
        hasBuildingCollision = true;
        break;
      }
    }

    // Determine color based on validity
    const isValid = !hasBuildingCollision && (connectsToRoad || hasExistingRoad);
    const fillColor = isValid ? 'rgba(100, 200, 255, 0.4)' : 'rgba(255, 150, 100, 0.4)';
    const strokeColor = isValid ? '#66ccff' : '#ff9966';

    // Draw the tile
    const screenPos = this.terrainRenderer.mapToScreen(y, x);

    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y);
    ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
    ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
    ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw tooltip with info
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(screenPos.x + 15, screenPos.y - 25, 180, 45);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tile: (${x}, ${y})`, screenPos.x + 25, screenPos.y - 8);

    // Show status
    const roadTileCount = this.roadTilesMap.size;
    if (hasBuildingCollision) {
      ctx.fillStyle = '#ff6666';
      ctx.fillText('Blocked by building', screenPos.x + 25, screenPos.y + 8);
    } else if (roadTileCount === 0) {
      ctx.fillStyle = '#66ff66';
      ctx.fillText('Click to start first road', screenPos.x + 25, screenPos.y + 8);
    } else if (connectsToRoad || hasExistingRoad) {
      ctx.fillStyle = '#66ff66';
      ctx.fillText('Click to start drawing', screenPos.x + 25, screenPos.y + 8);
    } else {
      ctx.fillStyle = '#ff6666';
      ctx.fillText(`Must connect to road (${roadTileCount} tiles)`, screenPos.x + 25, screenPos.y + 8);
    }
  }

  /**
   * Generate staircase path between two points (for diagonal roads)
   */
  private generateStaircasePath(x1: number, y1: number, x2: number, y2: number): Point[] {
    const tiles: Point[] = [];

    let x = x1;
    let y = y1;
    tiles.push({ x, y });

    const dx = x2 - x1;
    const dy = y2 - y1;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    let remainingX = Math.abs(dx);
    let remainingY = Math.abs(dy);

    while (remainingX > 0 || remainingY > 0) {
      if (remainingX >= remainingY && remainingX > 0) {
        x += sx;
        remainingX--;
      } else if (remainingY > 0) {
        y += sy;
        remainingY--;
      }
      tiles.push({ x, y });
    }

    return tiles;
  }

  /**
   * Draw debug overlay showing tile and road metadata
   */
  private drawDebugOverlay(bounds: TileBounds) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const terrainLoader = this.terrainRenderer.getTerrainLoader();

    // Only show detailed info for hovered tile area
    const hoverRadius = 2; // Show info for 2 tiles around mouse
    const centerI = this.mouseMapI;
    const centerJ = this.mouseMapJ;

    // Draw debug info panel at top-left
    this.drawDebugPanel(ctx);

    // Draw tile metadata for tiles near mouse
    if (this.debugShowTileInfo || this.debugShowRoadInfo) {
      for (let i = centerI - hoverRadius; i <= centerI + hoverRadius; i++) {
        for (let j = centerJ - hoverRadius; j <= centerJ + hoverRadius; j++) {
          const screenPos = this.terrainRenderer.mapToScreen(i, j);

          // Skip if off-screen
          if (screenPos.x < -100 || screenPos.x > this.canvas.width + 100 ||
              screenPos.y < -100 || screenPos.y > this.canvas.height + 100) {
            continue;
          }

          const landId = terrainLoader.getLandId(j, i);
          const decoded = decodeLandId(landId);
          const hasRoad = this.roadTilesMap.has(`${j},${i}`);
          const isCenter = (i === centerI && j === centerJ);

          // Highlight center tile
          if (isCenter) {
            const halfWidth = config.tileWidth / 2;
            const halfHeight = config.tileHeight / 2;

            ctx.beginPath();
            ctx.moveTo(screenPos.x, screenPos.y);
            ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
            ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
            ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
            ctx.closePath();

            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 3;
            ctx.stroke();
          }

          // Draw tile coordinates
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';

          if (this.debugShowTileInfo) {
            // Draw landId info
            const landClassChar = ['G', 'M', 'D', 'W'][decoded.landClass] || '?';
            const landTypeChar = decoded.landType.toString(16).toUpperCase();

            ctx.fillStyle = decoded.isWater ? '#00ffff' : '#ffffff';
            ctx.fillText(`${landClassChar}${landTypeChar}`, screenPos.x, screenPos.y + config.tileHeight / 2 - 4);

            // Show hex value for center tile
            if (isCenter) {
              ctx.fillStyle = '#ffff00';
              ctx.fillText(`0x${landId.toString(16).toUpperCase().padStart(2, '0')}`, screenPos.x, screenPos.y + config.tileHeight / 2 + 8);
            }
          }

          if (this.debugShowRoadInfo && hasRoad && this.roadsRendering) {
            const topology = this.roadsRendering.get(i, j);
            const fullRoadBlockId = roadBlockId(
              topology,
              landId,
              this.isOnConcrete(j, i),
              false,
              false
            );

            // Show road block ID
            ctx.fillStyle = '#ff8800';
            const roadIdStr = `R:${fullRoadBlockId.toString(16).toUpperCase()}`;
            ctx.fillText(roadIdStr, screenPos.x, screenPos.y + config.tileHeight / 2 + 20);
          }

          // Show concrete info on tiles
          if (this.debugShowConcreteInfo && this.hasConcrete(j, i)) {
            const mapData: ConcreteMapData = {
              getLandId: (row, col) => terrainLoader.getLandId(col, row),
              hasConcrete: (row, col) => this.hasConcrete(col, row),
              hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
              hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
            };

            const concreteId = getConcreteId(i, j, mapData);
            if (concreteId !== CONCRETE_NONE) {
              const isPlatform = (concreteId & 0x80) !== 0;

              // Show concrete ID with color coding
              ctx.fillStyle = isPlatform ? '#00ccff' : '#cc88ff';
              const concreteIdStr = `C:${concreteId.toString(16).toUpperCase().padStart(2, '0')}`;
              ctx.fillText(concreteIdStr, screenPos.x, screenPos.y + config.tileHeight / 2 + (hasRoad ? 32 : 20));

              // For center tile, show texture filename and debug info
              if (isCenter) {
                const filename = this.concreteBlockClassManager.getImageFilename(concreteId);
                const hasClass = this.concreteBlockClassManager.hasClass(concreteId);

                // Log to console for debugging
                console.log(`[TileDebug] Center tile (${i},${j}): concreteId=0x${concreteId.toString(16)} (${concreteId}), hasClass=${hasClass}, filename=${filename}`);

                if (filename) {
                  ctx.fillStyle = '#00ff00';
                  ctx.fillText(filename, screenPos.x, screenPos.y + config.tileHeight / 2 + (hasRoad ? 44 : 32));
                } else {
                  ctx.fillStyle = '#ff0000';
                  ctx.fillText(`NO TEX:${concreteId}`, screenPos.x, screenPos.y + config.tileHeight / 2 + (hasRoad ? 44 : 32));
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Draw debug info panel
   */
  private drawDebugPanel(ctx: CanvasRenderingContext2D) {
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const x = this.mouseMapJ;
    const y = this.mouseMapI;

    const landId = terrainLoader.getLandId(x, y);
    const decoded = decodeLandId(landId);
    const hasConcrete = this.hasConcrete(x, y);

    // Find building at current mouse position
    const buildingAtMouse = this.getBuildingAtTile(x, y);

    // Calculate panel height based on what info we're showing
    let panelHeight = 140;
    if (decoded.isWater) panelHeight += 32;
    if (buildingAtMouse && this.debugShowBuildingInfo) panelHeight += 144;
    if (hasConcrete && this.debugShowConcreteInfo) panelHeight += 96;

    // Panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(10, 10, 340, panelHeight);

    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DEBUG MODE [D=toggle, 1=tile, 2=building, 3=concrete]', 20, 28);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffffff';

    // Tile info
    ctx.fillText(`Tile: (${x}, ${y}) | i=${y}, j=${x}`, 20, 50);
    ctx.fillText(`LandId: 0x${landId.toString(16).toUpperCase().padStart(2, '0')} (${landId})`, 20, 66);
    ctx.fillText(`LandClass: ${landClassName(decoded.landClass)} (${decoded.landClass})`, 20, 82);
    ctx.fillText(`LandType: ${landTypeName(decoded.landType)} (${decoded.landType})`, 20, 98);
    ctx.fillText(`LandVar: ${decoded.landVar}`, 20, 114);

    let yOffset = 130;

    // Water indicator
    if (decoded.isWater) {
      ctx.fillStyle = '#00ffff';
      ctx.fillText(`>>> WATER TILE <<<`, 20, yOffset);
      yOffset += 16;
      if (decoded.isDeepWater) {
        ctx.fillText(`  Type: Deep Water (Center)`, 20, yOffset);
      } else if (decoded.isWaterEdge) {
        ctx.fillText(`  Type: Water Edge`, 20, yOffset);
      }
      yOffset += 16;
    }

    // Building info
    if (buildingAtMouse && this.debugShowBuildingInfo) {
      const visualClass = buildingAtMouse.visualClass;
      const dims = this.facilityDimensionsCache.get(visualClass);
      const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(visualClass);
      const texture = this.gameObjectTextureCache.getTextureSync('BuildingImages', textureFilename);

      ctx.fillStyle = '#ff8800';
      ctx.fillText(`>>> BUILDING <<<`, 20, yOffset);
      yOffset += 16;

      // VisualClass from ObjectsInArea
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`VisualClass: ${visualClass}`, 20, yOffset);
      yOffset += 16;

      // Building position
      ctx.fillText(`Position: (${buildingAtMouse.x}, ${buildingAtMouse.y})`, 20, yOffset);
      yOffset += 16;

      // Facility lookup result
      if (dims) {
        ctx.fillStyle = '#00ff00';
        ctx.fillText(`Lookup: FOUND - ${dims.name}`, 20, yOffset);
        yOffset += 16;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Size: ${dims.xsize}x${dims.ysize}`, 20, yOffset);
        yOffset += 16;
      } else {
        ctx.fillStyle = '#ff0000';
        ctx.fillText(`Lookup: NOT FOUND in buildings.json`, 20, yOffset);
        yOffset += 16;
        ctx.fillText(`(Add entry for visualClass ${visualClass})`, 20, yOffset);
        yOffset += 16;
      }

      // Texture filename
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Texture: ${textureFilename}`, 20, yOffset);
      yOffset += 16;

      // Texture load status
      if (texture) {
        ctx.fillStyle = '#00ff00';
        ctx.fillText(`Status: LOADED (${texture.width}x${texture.height})`, 20, yOffset);
      } else {
        ctx.fillStyle = '#ff0000';
        ctx.fillText(`Status: NOT LOADED (file missing?)`, 20, yOffset);
      }
      yOffset += 16;
    }

    // Concrete info
    if (hasConcrete && this.debugShowConcreteInfo) {
      ctx.fillStyle = '#cc88ff';
      ctx.fillText(`>>> CONCRETE <<<`, 20, yOffset);
      yOffset += 16;

      // Build mapData adapter for this tile
      const mapData: ConcreteMapData = {
        getLandId: (row, col) => terrainLoader.getLandId(col, row),
        hasConcrete: (row, col) => this.hasConcrete(col, row),
        hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
        hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
      };

      const concreteId = getConcreteId(y, x, mapData);
      const cfg = buildNeighborConfig(y, x, mapData);

      // Show neighbor config as visual diagram
      // Format: [TL][T][TR] / [L][X][R] / [BL][B][BR]
      const neighborStr = this.formatNeighborConfig(cfg);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Neighbors: ${neighborStr}`, 20, yOffset);
      yOffset += 16;

      // Show cardinal neighbors explicitly (for water platforms)
      const cardinals = `T:${cfg[1]?'Y':'N'} L:${cfg[3]?'Y':'N'} R:${cfg[4]?'Y':'N'} B:${cfg[6]?'Y':'N'}`;
      ctx.fillText(`Cardinals: ${cardinals}`, 20, yOffset);
      yOffset += 16;

      // Show concrete ID
      const isPlatform = (concreteId & 0x80) !== 0;
      const hasRoadFlag = (concreteId & 0x10) !== 0;
      const baseId = concreteId & 0x0F;
      ctx.fillStyle = '#cc88ff';
      ctx.fillText(`ConcreteId: 0x${concreteId.toString(16).toUpperCase().padStart(2, '0')} (${concreteId})`, 20, yOffset);
      yOffset += 16;

      // Decode ID
      let idType = '';
      if (isPlatform) {
        idType = this.getPlatformIdName(concreteId);
      } else if (hasRoadFlag) {
        idType = `ROAD_CONC (base=${baseId})`;
      } else if (concreteId === CONCRETE_FULL) {
        idType = 'FULL';
      } else if (concreteId === 15) {
        idType = 'SPECIAL';
      } else {
        idType = `EDGE/CORNER (${baseId})`;
      }
      ctx.fillText(`Type: ${idType}`, 20, yOffset);
      yOffset += 16;

      // Show texture file
      const texturePath = this.concreteBlockClassManager.getImageFilename(concreteId);
      if (texturePath) {
        ctx.fillStyle = '#00ff00';
        ctx.fillText(`Texture: ${texturePath}`, 20, yOffset);
      } else {
        ctx.fillStyle = '#ff0000';
        ctx.fillText(`Texture: NOT FOUND for ID ${concreteId}`, 20, yOffset);
      }
    }
  }

  /**
   * Format neighbor configuration as visual string
   * Shows [TL T TR / L X R / BL B BR]
   */
  private formatNeighborConfig(cfg: ConcreteCfg): string {
    const c = (b: boolean) => b ? '■' : '□';
    return `${c(cfg[0])}${c(cfg[1])}${c(cfg[2])} ${c(cfg[3])}X${c(cfg[4])} ${c(cfg[5])}${c(cfg[6])}${c(cfg[7])}`;
  }

  /**
   * Get platform ID name for debug display
   */
  private getPlatformIdName(concreteId: number): string {
    switch (concreteId) {
      case PLATFORM_IDS.CENTER: return 'PLATFORM_CENTER ($80)';
      case PLATFORM_IDS.E: return 'PLATFORM_E ($81)';
      case PLATFORM_IDS.N: return 'PLATFORM_N ($82)';
      case PLATFORM_IDS.NE: return 'PLATFORM_NE ($83)';
      case PLATFORM_IDS.NW: return 'PLATFORM_NW ($84)';
      case PLATFORM_IDS.S: return 'PLATFORM_S ($85)';
      case PLATFORM_IDS.SE: return 'PLATFORM_SE ($86)';
      case PLATFORM_IDS.SW: return 'PLATFORM_SW ($87)';
      case PLATFORM_IDS.W: return 'PLATFORM_W ($88)';
      default: return `PLATFORM_??? ($${concreteId.toString(16)})`;
    }
  }

  /**
   * Draw game-specific info overlay
   */
  private drawGameInfo() {
    const ctx = this.ctx;
    const pos = this.terrainRenderer.getCameraPosition();

    // Draw small info panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, this.canvas.height - 50, 260, 40);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Buildings: ${this.allBuildings.length} | Segments: ${this.allSegments.length} | Road tiles: ${this.roadTilesMap.size}`, 20, this.canvas.height - 32);
    ctx.fillText(`Zones: ${this.cachedZones.size} | Mouse: (${this.mouseMapJ}, ${this.mouseMapI})`, 20, this.canvas.height - 16);

    // Draw compass indicator
    this.drawCompass(ctx);
  }

  /**
   * Draw compass indicator showing cardinal directions in ISOMETRIC orientation
   *
   * Isometric grid mapping (45° rotation from top-down view):
   * - Grid row (i) increases toward bottom-left on screen
   * - Grid col (j) increases toward bottom-right on screen
   *
   * Cardinal directions (rotated 45° for isometric):
   * - N (North) = top-right on screen (decreasing row)
   * - E (East) = bottom-right on screen (increasing col)
   * - S (South) = bottom-left on screen (increasing row)
   * - W (West) = top-left on screen (decreasing col)
   */
  private drawCompass(ctx: CanvasRenderingContext2D) {
    const compassX = this.canvas.width - 55;
    const compassY = this.canvas.height - 55;
    const radius = 35;

    // Background rounded rectangle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(compassX - radius - 12, compassY - radius - 12, (radius + 12) * 2, (radius + 12) * 2, 8);
    ctx.fill();

    // Draw isometric tile shape in center
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    const tileW = radius * 0.6;
    const tileH = radius * 0.3;
    ctx.beginPath();
    ctx.moveTo(compassX, compassY - tileH);       // top
    ctx.lineTo(compassX + tileW, compassY);       // right
    ctx.lineTo(compassX, compassY + tileH);       // bottom
    ctx.lineTo(compassX - tileW, compassY);       // left
    ctx.closePath();
    ctx.stroke();

    // Direction labels at 45° angles (isometric orientation)
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // N - top-right (red, primary direction indicator)
    ctx.fillStyle = '#ff6666';
    ctx.fillText('N', compassX + radius * 0.65, compassY - radius * 0.65);

    // E - bottom-right (blue)
    ctx.fillStyle = '#6699ff';
    ctx.fillText('E', compassX + radius * 0.65, compassY + radius * 0.65);

    // S - bottom-left (yellow)
    ctx.fillStyle = '#ffcc44';
    ctx.fillText('S', compassX - radius * 0.65, compassY + radius * 0.65);

    // W - top-left (green)
    ctx.fillStyle = '#66cc66';
    ctx.fillText('W', compassX - radius * 0.65, compassY - radius * 0.65);

    // Arrow pointing North (toward top-right)
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(compassX, compassY);
    ctx.lineTo(compassX + radius * 0.4, compassY - radius * 0.4);
    ctx.stroke();

    // Arrow head
    ctx.fillStyle = '#ff6666';
    ctx.beginPath();
    ctx.moveTo(compassX + radius * 0.5, compassY - radius * 0.5);
    ctx.lineTo(compassX + radius * 0.25, compassY - radius * 0.35);
    ctx.lineTo(compassX + radius * 0.35, compassY - radius * 0.25);
    ctx.closePath();
    ctx.fill();

    // Center dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(compassX, compassY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Small grid hints
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '7px monospace';
    ctx.fillText('i-', compassX + radius * 0.2, compassY - radius * 0.2);
    ctx.fillText('j+', compassX + radius * 0.2, compassY + radius * 0.2);
  }

  // =========================================================================
  // MOUSE CONTROLS
  // =========================================================================

  // =========================================================================
  // VEGETATION CONTROL
  // =========================================================================

  /**
   * Mark camera as moving (resets debounce timer).
   * When the timer expires, vegetation is re-rendered.
   */
  private markCameraMoving(): void {
    this.isCameraMoving = true;

    // Reset debounce timer
    if (this.cameraStopTimer !== null) {
      clearTimeout(this.cameraStopTimer);
    }

    this.cameraStopTimer = window.setTimeout(() => {
      this.isCameraMoving = false;
      this.cameraStopTimer = null;
      // Re-render with vegetation visible again
      if (this.hideVegetationOnMove) {
        this.requestRender();
      }
    }, this.CAMERA_STOP_DEBOUNCE_MS);
  }

  /**
   * Enable/disable vegetation rendering globally
   */
  public setVegetationEnabled(enabled: boolean): void {
    if (this.vegetationEnabled !== enabled) {
      this.vegetationEnabled = enabled;
      this.requestRender();
    }
  }

  /**
   * Check if vegetation rendering is enabled
   */
  public isVegetationEnabled(): boolean {
    return this.vegetationEnabled;
  }

  /**
   * Enable/disable hiding vegetation during camera movement
   */
  public setHideVegetationOnMove(enabled: boolean): void {
    this.hideVegetationOnMove = enabled;
  }

  /**
   * Check if hide-vegetation-on-move is enabled
   */
  public isHideVegetationOnMove(): boolean {
    return this.hideVegetationOnMove;
  }

  // =========================================================================
  // MOUSE CONTROLS
  // =========================================================================

  private setupMouseControls() {
    // Disable terrain renderer's built-in mouse controls (we'll handle them)
    // The terrain renderer has its own pan/zoom which we need to coordinate with

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onMouseDown(e: MouseEvent) {
    const mapPos = this.screenToMap(e.clientX, e.clientY);
    this.mouseMapI = mapPos.i;
    this.mouseMapJ = mapPos.j;

    if (e.button === 2) { // Right click
      e.preventDefault();

      if (this.placementMode && this.onCancelPlacement) {
        this.onCancelPlacement();
        return;
      }

      if (this.roadDrawingMode && this.onCancelRoadDrawing) {
        this.onCancelRoadDrawing();
        return;
      }

      // Start drag
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    }

    if (e.button === 0) { // Left click
      if (this.roadDrawingMode) {
        this.roadDrawingState.isDrawing = true;
        this.roadDrawingState.startX = mapPos.j;
        this.roadDrawingState.startY = mapPos.i;
        this.roadDrawingState.endX = mapPos.j;
        this.roadDrawingState.endY = mapPos.i;
        this.requestRender();
      } else if (this.placementMode) {
        // Building placement handled by client
      } else {
        // Check building click
        const building = this.getBuildingAt(mapPos.j, mapPos.i);
        if (building && this.onBuildingClick) {
          this.onBuildingClick(building.x, building.y, building.visualClass);
        }
      }
    }
  }

  private onMouseMove(e: MouseEvent) {
    const mapPos = this.screenToMap(e.clientX, e.clientY);
    this.mouseMapI = mapPos.i;
    this.mouseMapJ = mapPos.j;

    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      // Convert screen delta to map delta for grab-and-move behavior
      const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const u = config.u;

      const deltaI = (dx + 2 * dy) / (2 * u);
      const deltaJ = (2 * dy - dx) / (2 * u);

      this.terrainRenderer.pan(deltaI, deltaJ);

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // Mark camera as moving (for vegetation hide-on-move option)
      this.markCameraMoving();

      // Mark zone request manager as moving (prevents zone requests during drag)
      if (this.zoneRequestManager) {
        this.zoneRequestManager.markMoving();
      }
    }

    if (this.roadDrawingMode && this.roadDrawingState.isDrawing) {
      this.roadDrawingState.endX = mapPos.j;
      this.roadDrawingState.endY = mapPos.i;
    }

    if (this.placementMode && this.placementPreview) {
      this.placementPreview.i = mapPos.i;
      this.placementPreview.j = mapPos.j;
    }

    // Update hover state
    this.hoveredBuilding = this.getBuildingAt(mapPos.j, mapPos.i);
    this.updateCursor();

    this.requestRender();
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 2 && this.isDragging) {
      this.isDragging = false;
      this.updateCursor();

      // Mark movement stopped and trigger delayed zone loading
      if (this.zoneRequestManager) {
        const currentZoom = this.terrainRenderer.getZoomLevel();
        this.zoneRequestManager.markStopped(currentZoom);
      }

      // Also request immediately (manager will handle delay internally)
      this.checkVisibleZones();
    }

    if (e.button === 0 && this.roadDrawingMode && this.roadDrawingState.isDrawing) {
      this.roadDrawingState.isDrawing = false;

      if (this.onRoadSegmentComplete) {
        this.onRoadSegmentComplete(
          this.roadDrawingState.startX,
          this.roadDrawingState.startY,
          this.roadDrawingState.endX,
          this.roadDrawingState.endY
        );
      }
    }
  }

  private onMouseLeave() {
    if (this.isDragging) {
      this.isDragging = false;
      this.updateCursor();

      // Mark movement stopped and trigger delayed zone loading
      if (this.zoneRequestManager) {
        const currentZoom = this.terrainRenderer.getZoomLevel();
        this.zoneRequestManager.markStopped(currentZoom);
      }

      // Also request immediately (manager will handle delay internally)
      this.checkVisibleZones();
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();

    const oldZoom = this.terrainRenderer.getZoomLevel();
    const newZoom = e.deltaY > 0
      ? Math.max(0, oldZoom - 1)
      : Math.min(3, oldZoom + 1);

    if (newZoom !== oldZoom) {
      this.terrainRenderer.setZoomLevel(newZoom);
      this.terrainRenderer.clearDistantZoomCaches(newZoom);

      // Mark as moving then stopped (triggers delayed zone load based on new zoom)
      if (this.zoneRequestManager) {
        this.zoneRequestManager.markMoving();
        this.zoneRequestManager.markStopped(newZoom);
      }

      this.checkVisibleZones();
      this.requestRender();
    }
  }

  private updateCursor() {
    if (this.placementMode || this.roadDrawingMode) {
      this.canvas.style.cursor = 'crosshair';
    } else if (this.hoveredBuilding) {
      this.canvas.style.cursor = 'pointer';
    } else if (this.isDragging) {
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.canvas.style.cursor = 'grab';
    }
  }

  /**
   * Convert screen coordinates to map coordinates
   */
  private screenToMap(clientX: number, clientY: number): { i: number; j: number } {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const mapPos = this.terrainRenderer.screenToMap(screenX, screenY);
    // mapPos.x = row (i), mapPos.y = column (j) from coordinate-mapper
    return { i: Math.floor(mapPos.x), j: Math.floor(mapPos.y) };
  }

  /**
   * Get building at map coordinates
   */
  private getBuildingAt(x: number, y: number): MapBuilding | null {
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      if (x >= building.x && x < building.x + xsize &&
          y >= building.y && y < building.y + ysize) {
        return building;
      }
    }
    return null;
  }

  /**
   * Check and load zones for visible area
   */
  private checkVisibleZones() {
    if (!this.zoneRequestManager) {
      return;
    }

    const bounds = this.getVisibleBounds();
    const cameraPos = this.terrainRenderer.getCameraPosition();
    const currentZoom = this.terrainRenderer.getZoomLevel();

    // Request visible zones (manager handles queuing, prioritization, and delays)
    this.zoneRequestManager.requestVisibleZones(
      bounds,
      this.cachedZones,
      cameraPos,
      currentZoom
    );
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================

  public destroy() {
    // Cancel pending render
    if (this.pendingRender !== null) {
      cancelAnimationFrame(this.pendingRender);
      this.pendingRender = null;
    }

    // Cancel camera stop timer
    if (this.cameraStopTimer !== null) {
      clearTimeout(this.cameraStopTimer);
      this.cameraStopTimer = null;
    }

    // Destroy touch handler
    if (this.touchHandler) {
      this.touchHandler.destroy();
      this.touchHandler = null;
    }

    // Destroy terrain renderer (cancels its own RAF, clears caches)
    this.terrainRenderer.destroy();

    // Clear game object cache
    this.gameObjectTextureCache.clear();

    // Clear data
    this.cachedZones.clear();
    this.allBuildings = [];
    this.allSegments = [];
    this.roadTilesMap.clear();
    this.concreteTilesSet.clear();
    this.facilityDimensionsCache.clear();

    // Clear zone request manager
    if (this.zoneRequestManager) {
      this.zoneRequestManager.clear();
      this.zoneRequestManager = null;
    }

    // Null out callbacks
    this.onLoadZone = null;
    this.onBuildingClick = null;
    this.onCancelPlacement = null;
    this.onFetchFacilityDimensions = null;
    this.onRoadSegmentComplete = null;
    this.onCancelRoadDrawing = null;
  }
}
