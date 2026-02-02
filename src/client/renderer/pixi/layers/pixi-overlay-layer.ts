/**
 * PixiOverlayLayer - Renders UI overlays (zones, placement preview, road preview)
 *
 * Handles:
 * - Zone overlay (residential/commercial/industrial colors)
 * - Building placement preview (green/red ghost)
 * - Road drawing preview (path visualization)
 */

import { Container, Graphics } from 'pixi.js';
import { ViewportBounds } from '../pixi-renderer';
import { ZoomConfig } from '../../../../shared/map-config';
import { SurfaceData, RoadDrawingState } from '../../../../shared/types';

/** Zone colors */
const ZONE_COLORS: Record<number, number> = {
  1: 0xFF6B6B, // Residential - Red
  2: 0x4ECDC4, // Commercial - Teal
  3: 0xFFE66D, // Industrial - Yellow
  4: 0x95E1D3, // Office - Green
};

/** Placement preview colors */
const PLACEMENT_VALID = 0x4CAF50;   // Green
const PLACEMENT_INVALID = 0xF44336; // Red

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
    placementPreview: { i: number; j: number; xsize: number; ysize: number } | null,
    roadDrawingState: RoadDrawingState | null,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig
  ): void {
    // Update zone overlay
    this.updateZoneOverlay(zoneData, bounds, zoomConfig);

    // Update placement preview
    this.updatePlacementPreview(placementPreview, zoomConfig);

    // Update road preview
    this.updateRoadPreview(roadDrawingState, zoomConfig);
  }

  /**
   * Update zone overlay
   */
  private updateZoneOverlay(
    zoneData: SurfaceData | null,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig
  ): void {
    this.zoneGraphics.clear();

    if (!zoneData) return;

    const { minI, maxI, minJ, maxJ } = bounds;

    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        // Get zone type from data (would need proper indexing)
        const dataI = i - (zoneData as { y1?: number }).y1!;
        const dataJ = j - (zoneData as { x1?: number }).x1!;

        if (dataI < 0 || dataJ < 0) continue;

        const zoneType = zoneData.data[dataI]?.[dataJ];
        if (zoneType && zoneType > 0) {
          this.drawZoneTile(i, j, zoneType, zoomConfig);
        }
      }
    }
  }

  /**
   * Draw a single zone tile
   * Note: screenPos is the TOP CENTER of the tile (from mapToScreen)
   */
  private drawZoneTile(i: number, j: number, zoneType: number, zoomConfig: ZoomConfig): void {
    const color = ZONE_COLORS[zoneType] ?? 0x888888;
    const screenPos = this.mapToScreen(i, j, zoomConfig);

    const hw = zoomConfig.tileWidth / 2;
    const th = zoomConfig.tileHeight;

    // Diamond shape: top point at screenPos.y, bottom at screenPos.y + tileHeight
    this.zoneGraphics.setFillStyle({ color, alpha: 0.3 });
    this.zoneGraphics.moveTo(screenPos.x, screenPos.y);           // Top
    this.zoneGraphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);  // Right
    this.zoneGraphics.lineTo(screenPos.x, screenPos.y + th);      // Bottom
    this.zoneGraphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);  // Left
    this.zoneGraphics.closePath();
    this.zoneGraphics.fill();
  }

  /**
   * Update placement preview
   */
  private updatePlacementPreview(
    preview: { i: number; j: number; xsize: number; ysize: number } | null,
    zoomConfig: ZoomConfig
  ): void {
    this.placementGraphics.clear();

    if (!preview) return;

    const { i, j, xsize, ysize } = preview;
    const isValid = true; // Would check collision in full implementation

    const color = isValid ? PLACEMENT_VALID : PLACEMENT_INVALID;

    // Draw building footprint
    // Note: screenPos is the TOP CENTER of each tile
    for (let di = 0; di < ysize; di++) {
      for (let dj = 0; dj < xsize; dj++) {
        const tileI = i + di;
        const tileJ = j + dj;
        const screenPos = this.mapToScreen(tileI, tileJ, zoomConfig);

        const hw = zoomConfig.tileWidth / 2;
        const th = zoomConfig.tileHeight;

        // Diamond shape: top point at screenPos.y, bottom at screenPos.y + tileHeight
        this.placementGraphics.setFillStyle({ color, alpha: 0.5 });
        this.placementGraphics.moveTo(screenPos.x, screenPos.y);
        this.placementGraphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);
        this.placementGraphics.lineTo(screenPos.x, screenPos.y + th);
        this.placementGraphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);
        this.placementGraphics.closePath();
        this.placementGraphics.fill();

        // Outline
        this.placementGraphics.setStrokeStyle({ width: 2, color: color, alpha: 1 });
        this.placementGraphics.moveTo(screenPos.x, screenPos.y);
        this.placementGraphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);
        this.placementGraphics.lineTo(screenPos.x, screenPos.y + th);
        this.placementGraphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);
        this.placementGraphics.closePath();
        this.placementGraphics.stroke();
      }
    }
  }

  /**
   * Update road drawing preview
   */
  private updateRoadPreview(
    state: RoadDrawingState | null,
    zoomConfig: ZoomConfig
  ): void {
    this.roadPreviewGraphics.clear();

    if (!state || !state.isDrawing) return;

    const { startX, startY, endX, endY } = state;

    // Determine path direction (horizontal or vertical)
    const dx = endX - startX;
    const dy = endY - startY;

    const color = PLACEMENT_VALID;

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal path
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      for (let x = minX; x <= maxX; x++) {
        this.drawRoadPreviewTile(startY, x, color, zoomConfig);
      }
    } else {
      // Vertical path
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);
      for (let y = minY; y <= maxY; y++) {
        this.drawRoadPreviewTile(y, startX, color, zoomConfig);
      }
    }
  }

  /**
   * Draw a single road preview tile
   * Note: screenPos is the TOP CENTER of the tile
   */
  private drawRoadPreviewTile(i: number, j: number, color: number, zoomConfig: ZoomConfig): void {
    const screenPos = this.mapToScreen(i, j, zoomConfig);

    const hw = zoomConfig.tileWidth / 2;
    const th = zoomConfig.tileHeight;

    // Diamond shape: top point at screenPos.y, bottom at screenPos.y + tileHeight
    this.roadPreviewGraphics.setFillStyle({ color, alpha: 0.4 });
    this.roadPreviewGraphics.moveTo(screenPos.x, screenPos.y);
    this.roadPreviewGraphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);
    this.roadPreviewGraphics.lineTo(screenPos.x, screenPos.y + th);
    this.roadPreviewGraphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);
    this.roadPreviewGraphics.closePath();
    this.roadPreviewGraphics.fill();

    // Outline
    this.roadPreviewGraphics.setStrokeStyle({ width: 1, color: color, alpha: 1 });
    this.roadPreviewGraphics.moveTo(screenPos.x, screenPos.y);
    this.roadPreviewGraphics.lineTo(screenPos.x + hw, screenPos.y + th / 2);
    this.roadPreviewGraphics.lineTo(screenPos.x, screenPos.y + th);
    this.roadPreviewGraphics.lineTo(screenPos.x - hw, screenPos.y + th / 2);
    this.roadPreviewGraphics.closePath();
    this.roadPreviewGraphics.stroke();
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
