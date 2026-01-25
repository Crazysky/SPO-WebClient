/**
 * IsometricMapRenderer
 *
 * Complete map renderer using isometric terrain with game objects (buildings, roads, overlays).
 * This replaces the rectangular MapRenderer with an isometric view.
 *
 * Layers (back to front):
 * 1. Terrain (IsometricTerrainRenderer)
 * 2. Concrete (pavement around buildings)
 * 3. Roads (gray diamond tiles)
 * 4. Buildings (blue diamond tiles)
 * 5. Zone overlay (colored zones)
 * 6. Placement preview
 * 7. Road drawing preview
 * 8. UI overlays
 */

import { IsometricTerrainRenderer } from './isometric-terrain-renderer';
import { GameObjectTextureCache } from './game-object-texture-cache';
import {
  Point,
  Rect,
  TileBounds,
  ZOOM_LEVELS,
  ZoomConfig,
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
  ROAD_TYPE,
  LandClass,
  landClassOf,
  landTypeOf
} from './road-texture-system';
import { formatLandId, landTypeName, landClassName, decodeLandId } from '../../shared/land-utils';
import {
  ConcreteBlockClassManager,
  loadConcreteBlockClassFromIni,
  getConcreteId,
  buildNeighborConfig,
  CONCRETE_NONE,
  CONCRETE_FULL,
  PLATFORM_IDS,
  ConcreteMapData,
  ConcreteCfg
} from './concrete-texture-system';
import { painterSort, sortForPainter } from './painter-algorithm';

interface CachedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  buildings: MapBuilding[];
  segments: MapSegment[];
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

export class IsometricMapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Core terrain renderer
  private terrainRenderer: IsometricTerrainRenderer;

  // Game object texture cache (roads, buildings, etc.)
  private gameObjectTextureCache: GameObjectTextureCache;

  // Game objects
  private cachedZones: Map<string, CachedZone> = new Map();
  private allBuildings: MapBuilding[] = [];
  private allSegments: MapSegment[] = [];

  // Road tiles map for texture type detection
  private roadTilesMap: Map<string, boolean> = new Map();

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

  // Zone loading
  private loadingZones: Set<string> = new Set();
  private zoneCheckDebounceTimer: number | null = null;
  private readonly ZONE_CHECK_DEBOUNCE_MS = 500; // Match old renderer to prevent server spam

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
  private debugShowRoadInfo: boolean = true;
  private debugShowConcreteInfo: boolean = true;

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

    // Disable terrain renderer's debug info - this renderer handles its own overlay at the end
    this.terrainRenderer.setShowDebugInfo(false);

    // Create game object texture cache (roads, buildings, etc.)
    this.gameObjectTextureCache = new GameObjectTextureCache(500);

    // Setup callback to re-render when textures are loaded
    this.gameObjectTextureCache.setOnTextureLoaded((category, name) => {
      if (category === 'BuildingImages' || category === 'RoadBlockImages' || category === 'ConcreteImages') {
        // Re-render when textures become available
        this.render();
      }
    });

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

    // Setup event handlers
    this.setupMouseControls();
    this.setupKeyboardControls();

    // Initial render
    this.render();
  }

  /**
   * Setup keyboard controls for debug mode
   */
  private setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      // 'D' key toggles debug mode
      if (e.key === 'd' || e.key === 'D') {
        this.debugMode = !this.debugMode;
        console.log(`[IsometricMapRenderer] Debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
        this.render();
      }
      // '1' toggles tile info in debug mode
      if (e.key === '1' && this.debugMode) {
        this.debugShowTileInfo = !this.debugShowTileInfo;
        this.render();
      }
      // '2' toggles road info in debug mode
      if (e.key === '2' && this.debugMode) {
        this.debugShowRoadInfo = !this.debugShowRoadInfo;
        this.render();
      }
      // '3' toggles concrete info in debug mode
      if (e.key === '3' && this.debugMode) {
        this.debugShowConcreteInfo = !this.debugShowConcreteInfo;
        this.render();
      }
    });
  }

  // =========================================================================
  // MAP LOADING
  // =========================================================================

  /**
   * Load terrain for a map
   */
  async loadMap(mapName: string): Promise<TerrainData> {
    this.mapName = mapName;

    const terrainData = await this.terrainRenderer.loadMap(mapName);
    this.mapLoaded = true;

    // Clear cached zones when loading new map
    this.cachedZones.clear();
    this.loadingZones.clear();
    this.allBuildings = [];
    this.allSegments = [];

    this.render();

    // Trigger initial zone loading for visible area
    this.checkVisibleZones();

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
      this.render();
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
      this.render();
    } catch (error) {
      console.error('[IsometricMapRenderer] Error loading concrete block classes:', error);
    }
  }

  // =========================================================================
  // ZONE MANAGEMENT (same API as MapRenderer)
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

    this.cachedZones.set(key, { x: alignedX, y: alignedY, w, h, buildings, segments });
    this.loadingZones.delete(key);

    // Rebuild aggregated lists
    this.rebuildAggregatedData();

    // Fetch dimensions for new buildings
    this.fetchDimensionsForBuildings(buildings);

    this.render();
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

    // Rebuild road topology rendering buffer
    this.rebuildRoadsRendering();
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

    // Preload building textures for all unique visual classes
    this.preloadBuildingTextures(buildings);

    this.render();
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
   * Update map data (compatibility with MapRenderer API)
   * This method provides backward compatibility with the old MapRenderer interface
   */
  public updateMapData(mapData: { x: number; y: number; w: number; h: number; buildings: MapBuilding[]; segments: MapSegment[] }) {
    this.addCachedZone(mapData.x, mapData.y, mapData.w, mapData.h, mapData.buildings, mapData.segments);
  }

  // =========================================================================
  // CALLBACKS (same API as MapRenderer)
  // =========================================================================

  public setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void) {
    this.onLoadZone = callback;
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
    this.terrainRenderer.setZoomLevel(level);
    this.checkVisibleZones();
    this.render();
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
    this.render();
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
    this.render();
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
    this.render();
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
   * Main render loop
   */
  public render() {
    // First, render terrain (this clears and draws the base layer)
    this.terrainRenderer.render();

    if (!this.mapLoaded) return;

    // Build tile occupation map
    const occupiedTiles = this.buildTileOccupationMap();

    // Get visible bounds for culling
    const bounds = this.getVisibleBounds();

    // Draw game object layers on top of terrain
    this.drawConcrete(bounds);
    this.drawRoads(bounds, occupiedTiles);
    this.drawTallTerrainOverRoads(bounds);
    this.drawBuildings(bounds);
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
   * Returns true if the tile is occupied by a building or within 1 tile of any building
   */
  private hasConcrete(x: number, y: number): boolean {
    // Check if any building occupies or is adjacent to this tile
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      // Expand building bounds by 1 tile in each direction for adjacency check
      if (x >= building.x - 1 && x < building.x + bw + 1 &&
          y >= building.y - 1 && y < building.y + bh + 1) {
        return true;
      }
    }
    return false;
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
   * Draw concrete tiles around buildings
   * Concrete appears on tiles adjacent to buildings to create paved areas
   */
  private drawConcrete(bounds: TileBounds): void {
    if (!this.concreteBlockClassesLoaded) return;

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

    // Painter's algorithm: back-to-front rendering
    // Higher (i+j) = back (top of screen) = drawn first
    // Lower (i+j) = front (bottom of screen) = drawn last (on top)
    sortForPainter(concreteTiles);

    // Draw sorted concrete tiles
    for (const tile of concreteTiles) {
      // Get texture filename from class manager
      const filename = this.concreteBlockClassManager.getImageFilename(tile.concreteId);
      if (filename) {
        const texture = this.gameObjectTextureCache.getTextureSync('ConcreteImages', filename);

        if (texture) {
          // Check if this is a water platform texture (ID >= 0x80)
          const isWaterPlatform = (tile.concreteId & 0x80) !== 0;

          if (isWaterPlatform) {
            // Water platform textures are already isometric - draw at native size
            // Center the 64x32 texture on the tile position
            const nativeHalfWidth = texture.width / 2;
            ctx.drawImage(
              texture,
              tile.screenX - nativeHalfWidth,
              tile.screenY
            );
          } else {
            // Land concrete textures - scale to current zoom level
            ctx.drawImage(
              texture,
              tile.screenX - halfWidth,
              tile.screenY,
              config.tileWidth,
              config.tileHeight
            );
          }
          continue;
        }
      }

      // Fallback: draw debug colored tile if texture not available
      this.drawDebugConcreteTile(ctx, tile.screenX, tile.screenY, tile.concreteId, config);
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

    // Collect road tiles for two-pass rendering
    const standardTiles: Array<{
      sx: number;
      sy: number;
      topology: RoadBlockId;
      texture: ImageBitmap | null;
    }> = [];

    const tallTiles: Array<{
      x: number;
      y: number;
      sx: number;
      sy: number;
      topology: RoadBlockId;
      texture: ImageBitmap;
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

      if (this.roadBlockClassesLoaded && this.roadsRendering) {
        topology = this.roadsRendering.get(y, x);

        if (topology !== RoadBlockId.None) {
          const landId = terrainLoader.getLandId(x, y);
          // Use hasConcrete to determine if road should be urban
          const onConcrete = this.hasConcrete(x, y);

          const fullRoadBlockId = roadBlockId(
            topology,
            landId,
            onConcrete,
            false, // onRailroad
            false  // isDummy
          );

          // Get texture
          const texturePath = this.roadBlockClassManager.getImagePath(fullRoadBlockId);
          if (texturePath) {
            const filename = texturePath.split('/').pop() || '';
            texture = this.gameObjectTextureCache.getTextureSync('RoadBlockImages', filename);
          }
        }
      }

      // Separate tall textures (bridges) from standard textures
      if (texture && texture.height > BASE_TILE_HEIGHT) {
        tallTiles.push({ x, y, sx, sy, topology, texture });
      } else {
        standardTiles.push({ sx, sy, topology, texture });
      }
    }

    // Pass 1: Render standard tiles (no sorting needed, they don't overlap)
    for (const tile of standardTiles) {
      if (tile.texture) {
        ctx.drawImage(tile.texture, tile.sx - halfWidth, tile.sy, config.tileWidth, config.tileHeight);
      } else {
        // Fallback: draw colored diamond
        ctx.beginPath();
        ctx.moveTo(tile.sx, tile.sy);
        ctx.lineTo(tile.sx - halfWidth, tile.sy + halfHeight);
        ctx.lineTo(tile.sx, tile.sy + config.tileHeight);
        ctx.lineTo(tile.sx + halfWidth, tile.sy + halfHeight);
        ctx.closePath();
        ctx.fillStyle = this.getDebugColorForTopology(tile.topology);
        ctx.fill();
      }
    }

    // Pass 2: Render tall tiles (bridges) sorted by (i+j) descending
    // Higher (i+j) = higher on screen = drawn first
    // Lower (i+j) = lower on screen = drawn last (on top)
    tallTiles.sort((a, b) => (b.y + b.x) - (a.y + a.x));

    for (const tile of tallTiles) {
      // Calculate scale and height for tall texture
      const scale = config.tileWidth / 64;
      const scaledHeight = tile.texture.height * scale;
      const yOffset = scaledHeight - config.tileHeight;

      // Draw at actual height with upward offset (same as terrain tall textures)
      ctx.drawImage(
        tile.texture,
        tile.sx - halfWidth,
        tile.sy - yOffset,
        config.tileWidth,
        scaledHeight
      );
    }
  }

  /**
   * Re-render tall terrain textures over roads
   * This ensures terrain special textures (plants, decorations) correctly overlap roads
   * Uses painter's algorithm: lower tiles (closer to viewer) drawn last (on top)
   */
  private drawTallTerrainOverRoads(bounds: TileBounds) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const textureCache = this.terrainRenderer.getTextureCache();

    // Standard tile height at base resolution
    const BASE_TILE_HEIGHT = 32;

    // Collect tall terrain tiles that need to be re-rendered over roads
    const tallTerrainTiles: Array<{
      i: number;
      j: number;
      sx: number;
      sy: number;
      texture: ImageBitmap;
    }> = [];

    // Check tiles around roads (roads might be under tall terrain textures from adjacent tiles)
    // We need to check a wider area because tall textures can visually extend into neighboring tiles
    for (let i = bounds.minI - 2; i <= bounds.maxI + 2; i++) {
      for (let j = bounds.minJ - 2; j <= bounds.maxJ + 2; j++) {
        // Skip tiles that have a road or concrete - these cover the terrain texture
        // (as if the plant was removed to build the road/pavement)
        if (this.roadTilesMap.has(`${j},${i}`) || this.hasConcrete(j, i)) {
          continue;
        }

        const textureId = terrainLoader.getTextureId(j, i);
        const texture = textureCache.getTextureSync(textureId);

        // Only process tall textures
        if (!texture || texture.height <= BASE_TILE_HEIGHT) {
          continue;
        }

        const screenPos = this.terrainRenderer.mapToScreen(i, j);

        // Cull if off-screen (with extra margin for tall textures)
        if (screenPos.x < -config.tileWidth * 2 || screenPos.x > this.canvas.width + config.tileWidth * 2 ||
            screenPos.y < -config.tileHeight * 3 || screenPos.y > this.canvas.height + config.tileHeight * 2) {
          continue;
        }

        tallTerrainTiles.push({
          i,
          j,
          sx: Math.round(screenPos.x),
          sy: Math.round(screenPos.y),
          texture
        });
      }
    }

    // Painter's algorithm: back-to-front rendering
    sortForPainter(tallTerrainTiles);

    // Re-render tall terrain textures on top of roads
    for (const tile of tallTerrainTiles) {
      const scale = config.tileWidth / 64;
      const scaledHeight = tile.texture.height * scale;
      const yOffset = scaledHeight - config.tileHeight;

      ctx.drawImage(
        tile.texture,
        tile.sx - halfWidth,
        tile.sy - yOffset,
        config.tileWidth,
        scaledHeight
      );
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
   */
  private drawBuildings(bounds: TileBounds) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    this.allBuildings.forEach(building => {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      const isHovered = this.hoveredBuilding === building;

      // Try to get building texture
      const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(building.visualClass);
      const texture = this.gameObjectTextureCache.getTextureSync('BuildingImages', textureFilename);

      if (texture) {
        // Calculate the anchor point for the building (bottom-left corner in isometric view)
        // For multi-tile buildings, we need to find the correct anchor position
        // The anchor is at (x, y) and the building extends to (x+xsize-1, y+ysize-1)

        // For isometric rendering, we need the top-most point of the building footprint
        // which is at map coordinates (x + xsize - 1, y) - the top corner of the diamond
        const anchorScreenPos = this.terrainRenderer.mapToScreen(building.y, building.x + xsize - 1);

        // Calculate the full building size in screen space
        // Building width spans from (x, y+ysize-1) to (x+xsize-1, y) in screen X
        // Building height spans the full isometric height
        const buildingScreenWidth = config.tileWidth * xsize;
        const buildingScreenHeight = config.tileHeight * ysize;

        // Cull if completely off-screen
        if (anchorScreenPos.x + buildingScreenWidth / 2 < 0 ||
            anchorScreenPos.x - buildingScreenWidth / 2 > this.canvas.width ||
            anchorScreenPos.y < -buildingScreenHeight ||
            anchorScreenPos.y > this.canvas.height + buildingScreenHeight) {
          return;
        }

        // Draw the texture scaled to fit the building footprint
        const drawX = anchorScreenPos.x - buildingScreenWidth / 2;
        const drawY = anchorScreenPos.y;

        if (isHovered) {
          // Draw highlight behind the texture
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#5fadff';
          this.drawBuildingFootprint(building, xsize, ysize, config, halfWidth, halfHeight);
          ctx.globalAlpha = 1.0;
        }

        ctx.drawImage(texture, drawX, drawY, buildingScreenWidth, buildingScreenHeight);
      } else {
        // Fallback: draw solid colored tiles for each tile of building footprint
        for (let dy = 0; dy < ysize; dy++) {
          for (let dx = 0; dx < xsize; dx++) {
            const tileX = building.x + dx;
            const tileY = building.y + dy;

            // Convert to isometric (x = j, y = i)
            const screenPos = this.terrainRenderer.mapToScreen(tileY, tileX);

            // Cull if off-screen
            if (screenPos.x < -config.tileWidth || screenPos.x > this.canvas.width + config.tileWidth ||
                screenPos.y < -config.tileHeight || screenPos.y > this.canvas.height + config.tileHeight) {
              continue;
            }

            // Round coordinates to avoid sub-pixel gaps
            const sx = Math.round(screenPos.x);
            const sy = Math.round(screenPos.y);

            // Draw isometric building tile
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - halfWidth, sy + halfHeight);
            ctx.lineTo(sx, sy + config.tileHeight);
            ctx.lineTo(sx + halfWidth, sy + halfHeight);
            ctx.closePath();

            ctx.fillStyle = isHovered ? '#5fadff' : '#4a90e2';
            ctx.fill();
          }
        }
      }
    });
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
    const hasRoad = this.roadTilesMap.has(`${x},${y}`);
    const hasConcrete = this.hasConcrete(x, y);

    // Calculate panel height based on what info we're showing
    let panelHeight = 140;
    if (decoded.isWater) panelHeight += 32;
    if (hasRoad) panelHeight += 64;
    if (hasConcrete && this.debugShowConcreteInfo) panelHeight += 96;

    // Panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(10, 10, 340, panelHeight);

    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DEBUG MODE [D=toggle, 1=tile, 2=road, 3=concrete]', 20, 28);

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

    // Road info
    if (hasRoad && this.roadsRendering) {
      const topology = this.roadsRendering.get(y, x);
      const onConcrete = this.isOnConcrete(x, y);
      const fullRoadBlockId = roadBlockId(topology, landId, onConcrete, false, false);
      const highId = (fullRoadBlockId & 0xF0) >> 4;

      ctx.fillStyle = '#ff8800';

      ctx.fillText(`Road Topology: ${RoadBlockId[topology]} (${topology})`, 20, yOffset);
      yOffset += 16;
      ctx.fillText(`RoadBlockId: 0x${fullRoadBlockId.toString(16).toUpperCase().padStart(2, '0')} (${fullRoadBlockId})`, 20, yOffset);
      yOffset += 16;

      // Road type
      const roadTypes = ['LAND', 'URBAN', 'N_BRIDGE', 'S_BRIDGE', 'E_BRIDGE', 'W_BRIDGE', 'FULL_BRIDGE', 'LEVEL_PASS', 'URB_LEVEL', 'SMOOTH', 'URB_SMOOTH'];
      const roadTypeName = roadTypes[highId] || `TYPE_${highId}`;
      ctx.fillText(`Road Type: ${roadTypeName}`, 20, yOffset);
      yOffset += 16;

      // Texture path
      const texturePath = this.roadBlockClassManager.getImagePath(fullRoadBlockId);
      if (texturePath) {
        const filename = texturePath.split('/').pop() || '';
        ctx.fillStyle = '#00ff00';
        ctx.fillText(`Texture: ${filename}`, 20, yOffset);
      } else {
        ctx.fillStyle = '#ff0000';
        ctx.fillText(`Texture: NOT FOUND`, 20, yOffset);
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
        this.render();
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
      // Derived from inverting the isometric projection:
      //   screenX = u * (rows - i + j)
      //   screenY = (u/2) * ((rows - i) + (cols - j))
      // Solving for camera delta when screen moves by (dx, dy):
      //   deltaI = (dx + 2*dy) / (2*u)
      //   deltaJ = (2*dy - dx) / (2*u)
      const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const u = config.u;

      const deltaI = (dx + 2 * dy) / (2 * u);
      const deltaJ = (2 * dy - dx) / (2 * u);

      this.terrainRenderer.pan(deltaI, deltaJ);

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // NOTE: Do NOT call checkVisibleZones() during drag to prevent server spam
      // Zone loading will be triggered AFTER drag stops (in onMouseUp/onMouseLeave)
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

    this.render();
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 2 && this.isDragging) {
      this.isDragging = false;
      this.updateCursor();
      // CRITICAL: Load zones AFTER drag stops (matching old renderer behavior)
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
      // CRITICAL: Load zones AFTER drag stops (matching old renderer behavior)
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
      this.checkVisibleZones();
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

  private loadVisibleZones() {
    if (!this.onLoadZone) {
      return;
    }

    const bounds = this.getVisibleBounds();
    const zoneSize = 64;

    // FIX: Ensure min < max (bounds can be inverted depending on camera orientation)
    const minI = Math.min(bounds.minI, bounds.maxI);
    const maxI = Math.max(bounds.minI, bounds.maxI);
    const minJ = Math.min(bounds.minJ, bounds.maxJ);
    const maxJ = Math.max(bounds.minJ, bounds.maxJ);

    // Calculate zone boundaries (aligned to zoneSize grid)
    const startZoneX = Math.floor(minJ / zoneSize) * zoneSize;
    const endZoneX = Math.ceil(maxJ / zoneSize) * zoneSize;
    const startZoneY = Math.floor(minI / zoneSize) * zoneSize;
    const endZoneY = Math.ceil(maxI / zoneSize) * zoneSize;

    const zonesToLoad: Array<{ x: number; y: number }> = [];

    for (let zx = startZoneX; zx < endZoneX; zx += zoneSize) {
      for (let zy = startZoneY; zy < endZoneY; zy += zoneSize) {
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
      this.onLoadZone(zone.x, zone.y, zoneSize, zoneSize);
    }
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================

  public destroy() {
    this.terrainRenderer.unload();
  }
}
