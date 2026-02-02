/**
 * PixiMapRendererAdapter - Drop-in replacement for IsometricMapRenderer
 *
 * This adapter wraps PixiRenderer to provide the same API as the Canvas-based
 * IsometricMapRenderer, allowing for easy switching between renderers.
 */

import { PixiRenderer } from './pixi-renderer';
import { TerrainLoader } from '../terrain-loader';
import {
  Point,
  TerrainData,
  ZoomConfig,
  ZOOM_LEVELS
} from '../../../shared/map-config';
import {
  MapBuilding,
  MapSegment,
  SurfaceData,
  FacilityDimensions,
  BuildingInfo
} from '../../../shared/types';

interface CachedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  buildings: MapBuilding[];
  segments: MapSegment[];
}

/**
 * Adapter for PixiRenderer that matches IsometricMapRenderer API
 */
export class PixiMapRendererAdapter {
  private pixi: PixiRenderer;
  private terrainLoader: TerrainLoader;

  // Cached data
  private cachedZones: Map<string, CachedZone> = new Map();
  private allBuildings: MapBuilding[] = [];
  private allSegments: MapSegment[] = [];
  private roadTilesMap: Map<string, boolean> = new Map();

  // Facility dimensions
  private facilityDimensionsCache: Map<string, FacilityDimensions> = new Map();

  // Map state
  private mapLoaded: boolean = false;
  private mapName: string = '';
  private terrainData: TerrainData | null = null;

  // Placement mode
  private placementMode: boolean = false;
  private currentPlacementBuilding: BuildingInfo | null = null;

  // Road drawing mode
  private roadDrawingMode: boolean = false;

  // Zone loading
  private loadingZones: Set<string> = new Set();
  private zoneCheckDebounceTimer: number | null = null;
  private readonly ZONE_CHECK_DEBOUNCE_MS = 500;

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onCancelPlacement: (() => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;
  private onRoadSegmentComplete: ((x1: number, y1: number, x2: number, y2: number) => void) | null = null;
  private onCancelRoadDrawing: (() => void) | null = null;

  constructor(canvasId: string) {
    // Get canvas element
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas with id "${canvasId}" not found`);
    }

    // Get parent container
    const container = canvas.parentElement;
    if (!container) {
      throw new Error('Canvas must have a parent container');
    }

    // Remove the canvas (PixiJS will create its own)
    canvas.remove();

    // Create PixiRenderer
    this.pixi = new PixiRenderer({
      container,
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      backgroundColor: 0x1a1a2e,
    });

    this.terrainLoader = new TerrainLoader();

    // Initialize PixiJS
    this.init();
  }

  /**
   * Initialize PixiJS renderer
   */
  private async init(): Promise<void> {
    await this.pixi.init();

    // Setup callbacks
    this.pixi.setOnLoadZone((x, y, w, h) => {
      this.onLoadZone?.(x, y, w, h);
    });

    this.pixi.setOnBuildingClick((x, y, visualClass) => {
      this.onBuildingClick?.(x, y, visualClass);
    });

    this.pixi.setOnCancelPlacement(() => {
      this.onCancelPlacement?.();
    });

    this.pixi.setOnFetchFacilityDimensions(async (visualClass) => {
      return this.onFetchFacilityDimensions?.(visualClass) ?? null;
    });

    this.pixi.setOnRoadSegmentComplete((x1, y1, x2, y2) => {
      this.onRoadSegmentComplete?.(x1, y1, x2, y2);
    });

    this.pixi.setOnCancelRoadDrawing(() => {
      this.onCancelRoadDrawing?.();
    });

    // Setup resize observer
    const container = this.pixi['app'].canvas.parentElement;
    if (container) {
      const resizeObserver = new ResizeObserver(() => {
        this.pixi.resize(container.clientWidth, container.clientHeight);
      });
      resizeObserver.observe(container);
    }

    console.log('[PixiMapRendererAdapter] Initialized');
  }

  // =========================================================================
  // Map Loading
  // =========================================================================

  /**
   * Load a map by name
   */
  async loadMap(mapName: string, season?: number): Promise<TerrainData> {
    console.log(`[PixiMapRendererAdapter] Loading map: ${mapName}`);

    this.mapName = mapName;
    this.terrainData = await this.terrainLoader.loadMap(mapName);

    // Determine terrain type from map
    const terrainType = this.getTerrainTypeForMap(mapName);
    // Use provided season, or get default for terrain type
    const effectiveSeason = season ?? this.getDefaultSeasonForTerrain(terrainType);

    await this.pixi.loadTerrain(this.terrainData, terrainType, effectiveSeason);

    this.mapLoaded = true;

    // Trigger initial zone check
    this.scheduleZoneCheck();

    return this.terrainData;
  }

  /**
   * Get terrain type for a map name
   */
  private getTerrainTypeForMap(mapName: string): string {
    const terrainTypes: Record<string, string> = {
      'Shamba': 'Alien Swamp',
      'Antiqua': 'Earth',
      'Zyrane': 'Earth',
    };
    return terrainTypes[mapName] ?? 'Earth';
  }

  /**
   * Get default season for terrain type based on available textures
   * Alien Swamp only has Winter textures, Earth has all seasons
   */
  private getDefaultSeasonForTerrain(terrainType: string): number {
    // Alien Swamp only has Winter (0) textures available
    if (terrainType === 'Alien Swamp') {
      return 0; // Winter
    }
    return 2; // Summer default for Earth
  }

  // =========================================================================
  // Zone Management
  // =========================================================================

  /**
   * Add a cached zone with buildings and segments
   */
  public addCachedZone(
    x: number,
    y: number,
    w: number,
    h: number,
    buildings: MapBuilding[],
    segments: MapSegment[]
  ): void {
    const key = `${x},${y},${w},${h}`;
    this.cachedZones.set(key, { x, y, w, h, buildings, segments });

    // Merge buildings (avoid duplicates)
    const existingIds = new Set(this.allBuildings.map(b => `${b.x},${b.y}`));
    for (const building of buildings) {
      const id = `${building.x},${building.y}`;
      if (!existingIds.has(id)) {
        this.allBuildings.push(building);
        existingIds.add(id);
      }
    }

    // Merge segments
    for (const segment of segments) {
      this.allSegments.push(segment);
    }

    // Rebuild road tiles map
    this.rebuildRoadTilesMap();

    // Update PixiJS renderer
    this.pixi.setBuildings(this.allBuildings);
    this.pixi.setSegments(this.allSegments);
  }

  /**
   * Update map data (buildings and segments)
   */
  public updateMapData(mapData: {
    x: number;
    y: number;
    w: number;
    h: number;
    buildings: MapBuilding[];
    segments: MapSegment[];
  }): void {
    this.addCachedZone(
      mapData.x,
      mapData.y,
      mapData.w,
      mapData.h,
      mapData.buildings,
      mapData.segments
    );
  }

  /**
   * Rebuild the road tiles map from segments
   */
  private rebuildRoadTilesMap(): void {
    this.roadTilesMap.clear();
    for (const segment of this.allSegments) {
      const { x1, y1, x2, y2 } = segment;
      if (x1 === x2) {
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        for (let y = minY; y <= maxY; y++) {
          this.roadTilesMap.set(`${x1},${y}`, true);
        }
      } else if (y1 === y2) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        for (let x = minX; x <= maxX; x++) {
          this.roadTilesMap.set(`${x},${y1}`, true);
        }
      }
    }
  }

  /**
   * Schedule a zone check (debounced)
   */
  private scheduleZoneCheck(): void {
    if (this.zoneCheckDebounceTimer !== null) {
      clearTimeout(this.zoneCheckDebounceTimer);
    }

    this.zoneCheckDebounceTimer = window.setTimeout(() => {
      this.checkVisibleZones();
    }, this.ZONE_CHECK_DEBOUNCE_MS);
  }

  /**
   * Check and load visible zones
   */
  private checkVisibleZones(): void {
    if (!this.terrainData || !this.onLoadZone) return;

    // Get visible bounds from PixiJS renderer
    const bounds = this.pixi['visibleBounds'];
    if (!bounds) return;

    // Calculate zone coordinates (zone size is typically 100x100)
    const zoneSize = 100;
    const minZoneX = Math.floor(bounds.minJ / zoneSize) * zoneSize;
    const minZoneY = Math.floor(bounds.minI / zoneSize) * zoneSize;
    const maxZoneX = Math.ceil(bounds.maxJ / zoneSize) * zoneSize;
    const maxZoneY = Math.ceil(bounds.maxI / zoneSize) * zoneSize;

    // Request zones that aren't loaded
    for (let zoneY = minZoneY; zoneY < maxZoneY; zoneY += zoneSize) {
      for (let zoneX = minZoneX; zoneX < maxZoneX; zoneX += zoneSize) {
        const key = `${zoneX},${zoneY},${zoneSize},${zoneSize}`;
        if (!this.cachedZones.has(key) && !this.loadingZones.has(key)) {
          this.loadingZones.add(key);
          console.log(`[PixiMapRendererAdapter] Requesting zone: ${key}`);
          this.onLoadZone(zoneX, zoneY, zoneSize, zoneSize);
        }
      }
    }
  }

  /**
   * Trigger zone check manually
   */
  public triggerZoneCheck(): void {
    this.scheduleZoneCheck();
  }

  // =========================================================================
  // Callbacks
  // =========================================================================

  public setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void): void {
    this.onLoadZone = callback;
    this.pixi.setOnLoadZone(callback);
  }

  public setBuildingClickCallback(callback: (x: number, y: number, visualClass?: string) => void): void {
    this.onBuildingClick = callback;
    this.pixi.setOnBuildingClick(callback);
  }

  public setCancelPlacementCallback(callback: () => void): void {
    this.onCancelPlacement = callback;
    this.pixi.setOnCancelPlacement(callback);
  }

  public setFetchFacilityDimensionsCallback(callback: (visualClass: string) => Promise<FacilityDimensions | null>): void {
    this.onFetchFacilityDimensions = callback;
    this.pixi.setOnFetchFacilityDimensions(callback);
  }

  public setRoadSegmentCompleteCallback(callback: (x1: number, y1: number, x2: number, y2: number) => void): void {
    this.onRoadSegmentComplete = callback;
    this.pixi.setOnRoadSegmentComplete(callback);
  }

  public setCancelRoadDrawingCallback(callback: () => void): void {
    this.onCancelRoadDrawing = callback;
    this.pixi.setOnCancelRoadDrawing(callback);
  }

  public setOnRoadSegmentComplete(callback: (x1: number, y1: number, x2: number, y2: number) => void): void {
    this.setRoadSegmentCompleteCallback(callback);
  }

  public setOnRoadDrawingCancel(callback: () => void): void {
    this.setCancelRoadDrawingCallback(callback);
  }

  // =========================================================================
  // Camera Control
  // =========================================================================

  public centerOn(x: number, y: number): void {
    this.pixi.centerOnMap(y, x); // Note: i=y, j=x
    this.scheduleZoneCheck();
  }

  public getCameraPosition(): { x: number; y: number } {
    const camera = this.pixi['camera'];
    return { x: camera?.x ?? 0, y: camera?.y ?? 0 };
  }

  public setZoom(level: number): void {
    this.pixi.setZoom(level);
    this.scheduleZoneCheck();
  }

  public getZoom(): number {
    return this.pixi.getZoom();
  }

  // =========================================================================
  // Mode Controls
  // =========================================================================

  public setZoneOverlay(enabled: boolean, data?: SurfaceData, x1?: number, y1?: number): void {
    if (data && x1 !== undefined && y1 !== undefined) {
      (data as { x1: number; y1: number }).x1 = x1;
      (data as { x1: number; y1: number }).y1 = y1;
    }
    this.pixi.setZoneOverlay(enabled, data);
  }

  public setPlacementMode(
    enabled: boolean,
    building?: BuildingInfo,
    facilityDimensions?: FacilityDimensions
  ): void {
    this.placementMode = enabled;
    this.currentPlacementBuilding = building ?? null;

    if (enabled && facilityDimensions) {
      this.pixi.setPlacementMode(true, {
        xsize: facilityDimensions.xsize,
        ysize: facilityDimensions.ysize
      });
    } else {
      this.pixi.setPlacementMode(false);
    }
  }

  public getPlacementCoordinates(): { x: number; y: number } | null {
    if (!this.placementMode) return null;
    const mouseMapJ = this.pixi['mouseMapJ'] ?? 0;
    const mouseMapI = this.pixi['mouseMapI'] ?? 0;
    return { x: mouseMapJ, y: mouseMapI };
  }

  public setRoadDrawingMode(enabled: boolean): void {
    this.roadDrawingMode = enabled;
    this.pixi.setRoadDrawingMode(enabled);
  }

  public isRoadDrawingModeActive(): boolean {
    return this.roadDrawingMode;
  }

  // =========================================================================
  // Road Utilities
  // =========================================================================

  public checkRoadPathConnectsToExisting(pathTiles: Point[]): boolean {
    if (this.roadTilesMap.size === 0) return true; // No roads yet

    for (const tile of pathTiles) {
      const neighbors = [
        { x: tile.x - 1, y: tile.y },
        { x: tile.x + 1, y: tile.y },
        { x: tile.x, y: tile.y - 1 },
        { x: tile.x, y: tile.y + 1 },
      ];

      for (const neighbor of neighbors) {
        if (this.roadTilesMap.has(`${neighbor.x},${neighbor.y}`)) {
          return true;
        }
      }
    }

    return false;
  }

  public getRoadTileCount(): number {
    return this.roadTilesMap.size;
  }

  public validateRoadPath(x1: number, y1: number, x2: number, y2: number): { valid: boolean; error?: string } {
    // Basic validation
    if (x1 === x2 && y1 === y2) {
      return { valid: false, error: 'Road must be at least 1 tile long' };
    }

    // Check bounds
    if (this.terrainData) {
      const maxX = this.terrainData.width - 1;
      const maxY = this.terrainData.height - 1;
      if (x1 < 0 || x1 > maxX || x2 < 0 || x2 > maxX ||
          y1 < 0 || y1 > maxY || y2 < 0 || y2 > maxY) {
        return { valid: false, error: 'Road extends outside map bounds' };
      }
    }

    return { valid: true };
  }

  // =========================================================================
  // Facility Dimensions
  // =========================================================================

  public setFacilityDimensionsCache(cache: Map<string, FacilityDimensions>): void {
    this.facilityDimensionsCache = cache;
    this.pixi.setFacilityDimensionsCache(cache);
  }

  // =========================================================================
  // Render (compatibility - PixiJS handles its own render loop)
  // =========================================================================

  public render(): void {
    // PixiJS has its own render loop, this is a no-op
    // Kept for API compatibility
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  public destroy(): void {
    if (this.zoneCheckDebounceTimer !== null) {
      clearTimeout(this.zoneCheckDebounceTimer);
    }
    this.pixi.destroy();
    console.log('[PixiMapRendererAdapter] Destroyed');
  }
}
