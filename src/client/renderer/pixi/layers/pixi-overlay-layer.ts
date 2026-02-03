/**
 * PixiOverlayLayer - Renders UI overlays (zones, placement preview, road preview)
 *
 * Handles:
 * - Zone overlay (residential/commercial/industrial colors)
 * - Building placement preview (green/red ghost with collision detection)
 * - Road drawing preview (path visualization with validation)
 */

import { Container, Graphics } from 'pixi.js';
import { ViewportBounds } from '../pixi-renderer';
import { ZoomConfig } from '../../../../shared/map-config';
import { SurfaceData, RoadDrawingState, MapBuilding, MapSegment, FacilityDimensions } from '../../../../shared/types';

/** Zone colors */
const ZONE_COLORS: Record<number, number> = {
  1: 0xFF6B6B, // Residential - Red
  2: 0x4ECDC4, // Commercial - Teal
  3: 0xFFE66D, // Industrial - Yellow
  4: 0x95E1D3, // Office - Green
};

/** Preview colors */
const COLOR_VALID = 0x64C864;     // Green (valid placement/road)
const COLOR_INVALID = 0xFF6464;  // Red (collision/invalid)
const COLOR_HOVER = 0x64C8FF;    // Blue (hover indicator)

/** Road hover state for displaying before drawing starts */
export interface RoadHoverState {
  x: number;
  y: number;
  isValid: boolean;
  message: string;
}

/**
 * Overlay layer renderer
 */
export class PixiOverlayLayer {
  private zoneContainer: Container;
  private placementContainer: Container;
  private roadPreviewContainer: Container;

  // Graphics objects
  private zoneGraphics: Graphics;
  private placementGraphics: Graphics;
  private roadPreviewGraphics: Graphics;

  // Map dimensions (for coordinate conversion)
  private mapWidth: number = 2000;
  private mapHeight: number = 2000;

  constructor(
    zoneContainer: Container,
    placementContainer: Container,
    roadPreviewContainer: Container,
    _uiContainer: Container
  ) {
    this.zoneContainer = zoneContainer;
    this.placementContainer = placementContainer;
    this.roadPreviewContainer = roadPreviewContainer;

    // Initialize graphics
    this.zoneGraphics = new Graphics();
    this.zoneContainer.addChild(this.zoneGraphics);

    this.placementGraphics = new Graphics();
    this.placementContainer.addChild(this.placementGraphics);

    this.roadPreviewGraphics = new Graphics();
    this.roadPreviewContainer.addChild(this.roadPreviewGraphics);
  }

  /**
   * Update all overlay layers
   */
  update(
    zoneData: SurfaceData | null,
    zoneX1: number,
    zoneY1: number,
    placementPreview: { i: number; j: number; xsize: number; ysize: number } | null,
    roadDrawingState: RoadDrawingState | null,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig,
    // New parameters for validation
    buildings?: MapBuilding[],
    segments?: MapSegment[],
    facilityDimensionsCache?: Map<string, FacilityDimensions>,
    roadTilesMap?: Map<string, boolean>,
    roadHoverState?: RoadHoverState | null
  ): void {
    // Update zone overlay
    this.updateZoneOverlay(zoneData, zoneX1, zoneY1, bounds, zoomConfig);

    // Update placement preview with collision detection
    this.updatePlacementPreview(
      placementPreview,
      zoomConfig,
      buildings,
      segments,
      facilityDimensionsCache
    );

    // Update road preview (hover indicator and path)
    this.updateRoadPreview(
      roadDrawingState,
      zoomConfig,
      buildings,
      facilityDimensionsCache,
      roadTilesMap,
      roadHoverState
    );
  }

  /**
   * Update zone overlay
   */
  private updateZoneOverlay(
    zoneData: SurfaceData | null,
    x1: number,
    y1: number,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig
  ): void {
    this.zoneGraphics.clear();

    if (!zoneData) return;

    const { minI, maxI, minJ, maxJ } = bounds;

    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        // Get zone type from data using proper offset
        const dataI = i - y1;
        const dataJ = j - x1;

        if (dataI < 0 || dataJ < 0) continue;

        const zoneType = zoneData.rows[dataI]?.[dataJ];
        if (zoneType && zoneType > 0) {
          this.drawZoneTile(i, j, zoneType, zoomConfig);
        }
      }
    }
  }

  /**
   * Draw a single zone tile
   */
  private drawZoneTile(i: number, j: number, zoneType: number, zoomConfig: ZoomConfig): void {
    const color = ZONE_COLORS[zoneType] ?? 0x888888;
    const screenPos = this.mapToScreen(i, j, zoomConfig);

    const hw = zoomConfig.tileWidth / 2;
    const th = zoomConfig.tileHeight;

    // Diamond shape
    this.zoneGraphics.setFillStyle({ color, alpha: 0.3 });
    this.zoneGraphics.moveTo(screenPos.x, screenPos.y);
    this.zoneGraphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);
    this.zoneGraphics.lineTo(screenPos.x, screenPos.y + th);
    this.zoneGraphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);
    this.zoneGraphics.closePath();
    this.zoneGraphics.fill();
  }

  /**
   * Update placement preview with collision detection
   */
  private updatePlacementPreview(
    preview: { i: number; j: number; xsize: number; ysize: number } | null,
    zoomConfig: ZoomConfig,
    buildings?: MapBuilding[],
    segments?: MapSegment[],
    facilityDimensionsCache?: Map<string, FacilityDimensions>
  ): void {
    this.placementGraphics.clear();

    if (!preview) return;

    const { i, j, xsize, ysize } = preview;

    // Check collision for each tile
    const hasCollision = this.checkBuildingCollision(
      i, j, ysize, xsize,
      buildings ?? [],
      segments ?? [],
      facilityDimensionsCache
    );

    const color = hasCollision ? COLOR_INVALID : COLOR_VALID;

    // Draw building footprint
    for (let di = 0; di < ysize; di++) {
      for (let dj = 0; dj < xsize; dj++) {
        const tileI = i + di;
        const tileJ = j + dj;
        this.drawPreviewTile(this.placementGraphics, tileI, tileJ, color, 0.5, 2, zoomConfig);
      }
    }
  }

  /**
   * Check if building placement would collide with existing buildings or roads
   */
  private checkBuildingCollision(
    i: number,
    j: number,
    ysize: number,
    xsize: number,
    buildings: MapBuilding[],
    segments: MapSegment[],
    facilityDimensionsCache?: Map<string, FacilityDimensions>
  ): boolean {
    for (let di = 0; di < ysize; di++) {
      for (let dj = 0; dj < xsize; dj++) {
        const checkI = i + di;
        const checkJ = j + dj;

        // Check against existing buildings
        for (const building of buildings) {
          const dims = facilityDimensionsCache?.get(building.visualClass);
          const bw = dims?.xsize ?? 1;
          const bh = dims?.ysize ?? 1;

          if (checkJ >= building.x && checkJ < building.x + bw &&
              checkI >= building.y && checkI < building.y + bh) {
            return true;
          }
        }

        // Check against road segments
        for (const seg of segments) {
          const minX = Math.min(seg.x1, seg.x2);
          const maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2);
          const maxY = Math.max(seg.y1, seg.y2);

          if (checkJ >= minX && checkJ <= maxX &&
              checkI >= minY && checkI <= maxY) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Update road drawing preview
   */
  private updateRoadPreview(
    state: RoadDrawingState | null,
    zoomConfig: ZoomConfig,
    buildings?: MapBuilding[],
    facilityDimensionsCache?: Map<string, FacilityDimensions>,
    roadTilesMap?: Map<string, boolean>,
    roadHoverState?: RoadHoverState | null
  ): void {
    this.roadPreviewGraphics.clear();

    // Show hover indicator when not drawing
    if (roadHoverState && (!state || !state.isDrawing)) {
      const color = roadHoverState.isValid ? COLOR_HOVER : COLOR_INVALID;
      this.drawPreviewTile(
        this.roadPreviewGraphics,
        roadHoverState.y,  // i = row = y
        roadHoverState.x,  // j = column = x
        color,
        0.4,
        2,
        zoomConfig
      );
      return;
    }

    // Show path when drawing
    if (!state || !state.isDrawing) return;

    const { startX, startY, endX, endY } = state;

    // Generate staircase path
    const path = this.generateStaircasePath(startX, startY, endX, endY);

    // Check for collisions along path
    let hasCollision = false;
    for (const point of path) {
      if (this.checkTileCollision(point.y, point.x, buildings ?? [], facilityDimensionsCache)) {
        hasCollision = true;
        break;
      }
    }

    // Check if path connects to existing roads
    let connectsToRoad = (roadTilesMap?.size ?? 0) === 0; // Allow first road
    if (!connectsToRoad && roadTilesMap) {
      for (const point of path) {
        if (this.hasRoadAt(point.x, point.y, roadTilesMap) ||
            this.isAdjacentToRoad(point.x, point.y, roadTilesMap)) {
          connectsToRoad = true;
          break;
        }
      }
    }

    const isValid = !hasCollision && connectsToRoad;
    const color = isValid ? COLOR_VALID : COLOR_INVALID;

    // Draw each tile in path
    for (const point of path) {
      this.drawPreviewTile(
        this.roadPreviewGraphics,
        point.y,  // i = row
        point.x,  // j = column
        color,
        0.4,
        1,
        zoomConfig
      );
    }
  }

  /**
   * Draw a preview tile (diamond shape)
   */
  private drawPreviewTile(
    graphics: Graphics,
    i: number,
    j: number,
    color: number,
    fillAlpha: number,
    strokeWidth: number,
    zoomConfig: ZoomConfig
  ): void {
    const screenPos = this.mapToScreen(i, j, zoomConfig);
    const hw = zoomConfig.tileWidth / 2;
    const th = zoomConfig.tileHeight;

    // Fill
    graphics.setFillStyle({ color, alpha: fillAlpha });
    graphics.moveTo(screenPos.x, screenPos.y);
    graphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);
    graphics.lineTo(screenPos.x, screenPos.y + th);
    graphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);
    graphics.closePath();
    graphics.fill();

    // Stroke
    graphics.setStrokeStyle({ width: strokeWidth, color: color, alpha: 1 });
    graphics.moveTo(screenPos.x, screenPos.y);
    graphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);
    graphics.lineTo(screenPos.x, screenPos.y + th);
    graphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);
    graphics.closePath();
    graphics.stroke();
  }

  /**
   * Check if a single tile has a building collision
   */
  private checkTileCollision(
    i: number,
    j: number,
    buildings: MapBuilding[],
    facilityDimensionsCache?: Map<string, FacilityDimensions>
  ): boolean {
    for (const building of buildings) {
      const dims = facilityDimensionsCache?.get(building.visualClass);
      const bw = dims?.xsize ?? 1;
      const bh = dims?.ysize ?? 1;

      if (j >= building.x && j < building.x + bw &&
          i >= building.y && i < building.y + bh) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate staircase path between two points
   */
  private generateStaircasePath(x1: number, y1: number, x2: number, y2: number): Array<{ x: number; y: number }> {
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

  /**
   * Check if a tile has an existing road
   */
  private hasRoadAt(x: number, y: number, roadTilesMap: Map<string, boolean>): boolean {
    return roadTilesMap.has(`${x},${y}`);
  }

  /**
   * Check if a tile is adjacent to an existing road
   */
  private isAdjacentToRoad(x: number, y: number, roadTilesMap: Map<string, boolean>): boolean {
    const neighbors = [
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
      { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ];

    for (const { dx, dy } of neighbors) {
      if (roadTilesMap.has(`${x + dx},${y + dy}`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Convert map coordinates to screen position
   */
  private mapToScreen(i: number, j: number, zoomConfig: ZoomConfig): { x: number; y: number } {
    const u = zoomConfig.u;
    const rows = this.mapHeight;
    const cols = this.mapWidth;

    const x = u * (rows - i + j);
    const y = (u / 2) * ((rows - i) + (cols - j));

    return { x, y };
  }

  /**
   * Set map dimensions
   */
  setMapDimensions(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
  }

  /**
   * Clear all overlays
   */
  clear(): void {
    this.zoneGraphics.clear();
    this.placementGraphics.clear();
    this.roadPreviewGraphics.clear();
  }
}
