/**
 * IsometricMapRenderer
 *
 * Complete map renderer using isometric terrain with game objects (buildings, roads, overlays).
 * This replaces the rectangular MapRenderer with an isometric view.
 *
 * Layers (back to front):
 * 1. Terrain (IsometricTerrainRenderer)
 * 2. Roads (gray diamond tiles)
 * 3. Buildings (blue diamond tiles)
 * 4. Zone overlay (colored zones)
 * 5. Placement preview
 * 6. Road drawing preview
 * 7. UI overlays
 */

import { IsometricTerrainRenderer } from './isometric-terrain-renderer';
import { CoordinateMapper } from './coordinate-mapper';
import { TextureCache } from './texture-cache';
import { GameObjectTextureCache } from './game-object-texture-cache';
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

    // Create game object texture cache (roads, buildings, etc.)
    this.gameObjectTextureCache = new GameObjectTextureCache(500);

    // Preload common road textures
    this.preloadRoadTextures();

    // Setup event handlers
    this.setupMouseControls();

    // Initial render
    this.render();
  }

  /**
   * Preload common road textures for faster rendering
   */
  private preloadRoadTextures(): void {
    const roadTextures = [
      'Roadhorz.bmp',
      'Roadvert.bmp',
      'Roadcross.bmp',
      'RoadcornerN.bmp',
      'RoadcornerE.bmp',
      'RoadcornerS.bmp',
      'RoadcornerW.bmp',
      'RoadTN.bmp',
      'RoadTE.bmp',
      'RoadTS.bmp',
      'RoadTW.bmp'
    ];
    this.gameObjectTextureCache.preload('RoadBlockImages', roadTextures);
  }

  // =========================================================================
  // MAP LOADING
  // =========================================================================

  /**
   * Load terrain for a map
   */
  async loadMap(mapName: string): Promise<TerrainData> {
    console.log(`[IsometricMapRenderer] Loading map: ${mapName}`);

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

    console.log(`[IsometricMapRenderer] addCachedZone: original=(${x},${y}) aligned=(${alignedX},${alignedY}) buildings=${buildings.length} segments=${segments.length}`);

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
  }

  /**
   * Check if a road tile exists at the given coordinates
   */
  private hasRoadAt(x: number, y: number): boolean {
    return this.roadTilesMap.has(`${x},${y}`);
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
    console.log('[IsometricMapRenderer] triggerZoneCheck called');
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
    this.drawRoads(bounds, occupiedTiles);
    this.drawBuildings(bounds);
    this.drawZoneOverlay(bounds);
    this.drawPlacementPreview();
    this.drawRoadDrawingPreview();

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
   * Draw road segments as isometric tiles with textures
   */
  private drawRoads(bounds: TileBounds, occupiedTiles: Set<string>) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    // Track drawn tiles to avoid duplicates
    const drawnTiles = new Set<string>();

    this.allSegments.forEach(seg => {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      const minY = Math.min(seg.y1, seg.y2);
      const maxY = Math.max(seg.y1, seg.y2);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const tileKey = `${x},${y}`;

          // Skip if occupied by building or already drawn
          if (occupiedTiles.has(tileKey) || drawnTiles.has(tileKey)) continue;
          drawnTiles.add(tileKey);

          // Convert to isometric coordinates (x = j, y = i)
          const screenPos = this.terrainRenderer.mapToScreen(y, x);

          // Cull if off-screen
          if (screenPos.x < -config.tileWidth || screenPos.x > this.canvas.width + config.tileWidth ||
              screenPos.y < -config.tileHeight || screenPos.y > this.canvas.height + config.tileHeight) {
            continue;
          }

          // Round coordinates for pixel-perfect rendering
          const sx = Math.round(screenPos.x);
          const sy = Math.round(screenPos.y);

          // Determine road texture type based on neighboring roads
          const hasNorth = this.hasRoadAt(x, y - 1);
          const hasEast = this.hasRoadAt(x + 1, y);
          const hasSouth = this.hasRoadAt(x, y + 1);
          const hasWest = this.hasRoadAt(x - 1, y);

          const textureType = GameObjectTextureCache.getRoadTextureType(hasNorth, hasEast, hasSouth, hasWest);
          const textureFilename = GameObjectTextureCache.getRoadTextureFilename(textureType);

          // Try to get road texture
          const texture = this.gameObjectTextureCache.getTextureSync('RoadBlockImages', textureFilename);

          if (texture) {
            // Draw road texture directly (textures are already diamond-shaped)
            ctx.drawImage(
              texture,
              sx - halfWidth,
              sy,
              config.tileWidth,
              config.tileHeight
            );
          } else {
            // Fallback to solid color
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - halfWidth, sy + halfHeight);
            ctx.lineTo(sx, sy + config.tileHeight);
            ctx.lineTo(sx + halfWidth, sy + halfHeight);
            ctx.closePath();

            ctx.fillStyle = '#666';
            ctx.fill();
          }
        }
      }
    });
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
   */
  private drawRoadDrawingPreview() {
    if (!this.roadDrawingMode || !this.roadDrawingState.isDrawing) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const state = this.roadDrawingState;

    // Generate staircase path
    const pathTiles = this.generateStaircasePath(
      state.startX, state.startY,
      state.endX, state.endY
    );

    // Check for collisions along path
    let hasCollision = false;
    for (const tile of pathTiles) {
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;

        if (tile.x >= building.x && tile.x < building.x + bw &&
            tile.y >= building.y && tile.y < building.y + bh) {
          hasCollision = true;
          break;
        }
      }
      if (hasCollision) break;
    }

    const fillColor = hasCollision ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 200, 100, 0.5)';
    const strokeColor = hasCollision ? '#ff4444' : '#88ff88';

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

    // Draw cost tooltip
    const endPos = this.terrainRenderer.mapToScreen(state.endY, state.endX);
    const tileCount = pathTiles.length;
    const cost = tileCount * this.roadCostPerTile;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(endPos.x + 10, endPos.y - 30, 140, 40);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tiles: ${tileCount}`, endPos.x + 20, endPos.y - 12);
    ctx.fillText(`Cost: $${cost.toLocaleString()}`, endPos.x + 20, endPos.y + 4);
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
    ctx.fillText(`Buildings: ${this.allBuildings.length} | Roads: ${this.allSegments.length}`, 20, this.canvas.height - 32);
    ctx.fillText(`Zones: ${this.cachedZones.size} | Mouse: (${this.mouseMapJ}, ${this.mouseMapI})`, 20, this.canvas.height - 16);
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
    return { i: Math.floor(mapPos.y), j: Math.floor(mapPos.x) };
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
      console.log('[IsometricMapRenderer] checkVisibleZones: onLoadZone callback not set');
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
      console.log('[IsometricMapRenderer] loadVisibleZones: onLoadZone callback not set');
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

    console.log(`[IsometricMapRenderer] loadVisibleZones: bounds i=[${minI},${maxI}] j=[${minJ},${maxJ}]`);
    console.log(`[IsometricMapRenderer] loadVisibleZones: zones X=[${startZoneX},${endZoneX}] Y=[${startZoneY},${endZoneY}]`);

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

    console.log(`[IsometricMapRenderer] loadVisibleZones: ${zonesToLoad.length} zones needed, requesting ${zonesToRequest.length} (max ${MAX_ZONES_PER_BATCH}), ${this.cachedZones.size} cached, ${this.loadingZones.size} loading`);

    // Load zones (limited batch)
    for (const zone of zonesToRequest) {
      const key = `${zone.x},${zone.y}`;
      this.loadingZones.add(key);
      console.log(`[IsometricMapRenderer] Requesting zone (${zone.x}, ${zone.y})`);
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
