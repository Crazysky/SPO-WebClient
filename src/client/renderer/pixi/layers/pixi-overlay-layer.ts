/**
 * PixiOverlayLayer - Renders UI overlays (zones, placement preview, road preview)
 *
 * Handles:
 * - Zone overlay (residential/commercial/industrial colors)
 * - Building placement preview (green/red ghost)
 * - Road drawing preview (path visualization)
 * - Debug overlay (FPS, tile info)
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
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
  private uiContainer: Container;

  // Graphics objects
  private zoneGraphics: Graphics;
  private placementGraphics: Graphics;
  private roadPreviewGraphics: Graphics;
  private debugGraphics: Graphics;

  // Debug text
  private fpsText: Text;
  private debugText: Text;

  // Map dimensions (for coordinate conversion)
  private mapWidth: number = 2000;
  private mapHeight: number = 2000;

  constructor(
    zoneContainer: Container,
    placementContainer: Container,
    roadPreviewContainer: Container,
    uiContainer: Container
  ) {
    this.zoneContainer = zoneContainer;
    this.placementContainer = placementContainer;
    this.roadPreviewContainer = roadPreviewContainer;
    this.uiContainer = uiContainer;

    // Initialize graphics
    this.zoneGraphics = new Graphics();
    this.zoneContainer.addChild(this.zoneGraphics);

    this.placementGraphics = new Graphics();
    this.placementContainer.addChild(this.placementGraphics);

    this.roadPreviewGraphics = new Graphics();
    this.roadPreviewContainer.addChild(this.roadPreviewGraphics);

    this.debugGraphics = new Graphics();
    this.uiContainer.addChild(this.debugGraphics);

    // Initialize text elements
    const textStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 12,
      fill: 0xFFFFFF,
    });

    this.fpsText = new Text({ text: 'FPS: 0', style: textStyle });
    this.fpsText.x = 10;
    this.fpsText.y = 10;
    this.uiContainer.addChild(this.fpsText);

    this.debugText = new Text({ text: '', style: textStyle });
    this.debugText.x = 10;
    this.debugText.y = 30;
    this.uiContainer.addChild(this.debugText);
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
   */
  private drawZoneTile(i: number, j: number, zoneType: number, zoomConfig: ZoomConfig): void {
    const color = ZONE_COLORS[zoneType] ?? 0x888888;
    const screenPos = this.mapToScreen(i, j, zoomConfig);

    const hw = zoomConfig.tileWidth / 2;
    const hh = zoomConfig.tileHeight / 2;

    this.zoneGraphics.setFillStyle({ color, alpha: 0.3 });
    this.zoneGraphics.moveTo(screenPos.x, screenPos.y - hh);
    this.zoneGraphics.lineTo(screenPos.x + hw, screenPos.y);
    this.zoneGraphics.lineTo(screenPos.x, screenPos.y + hh);
    this.zoneGraphics.lineTo(screenPos.x - hw, screenPos.y);
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
    for (let di = 0; di < ysize; di++) {
      for (let dj = 0; dj < xsize; dj++) {
        const tileI = i + di;
        const tileJ = j + dj;
        const screenPos = this.mapToScreen(tileI, tileJ, zoomConfig);

        const hw = zoomConfig.tileWidth / 2;
        const hh = zoomConfig.tileHeight / 2;

        this.placementGraphics.setFillStyle({ color, alpha: 0.5 });
        this.placementGraphics.moveTo(screenPos.x, screenPos.y - hh);
        this.placementGraphics.lineTo(screenPos.x + hw, screenPos.y);
        this.placementGraphics.lineTo(screenPos.x, screenPos.y + hh);
        this.placementGraphics.lineTo(screenPos.x - hw, screenPos.y);
        this.placementGraphics.closePath();
        this.placementGraphics.fill();

        // Outline
        this.placementGraphics.setStrokeStyle({ width: 2, color: color, alpha: 1 });
        this.placementGraphics.moveTo(screenPos.x, screenPos.y - hh);
        this.placementGraphics.lineTo(screenPos.x + hw, screenPos.y);
        this.placementGraphics.lineTo(screenPos.x, screenPos.y + hh);
        this.placementGraphics.lineTo(screenPos.x - hw, screenPos.y);
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
   */
  private drawRoadPreviewTile(i: number, j: number, color: number, zoomConfig: ZoomConfig): void {
    const screenPos = this.mapToScreen(i, j, zoomConfig);

    const hw = zoomConfig.tileWidth / 2;
    const hh = zoomConfig.tileHeight / 2;

    this.roadPreviewGraphics.setFillStyle({ color, alpha: 0.4 });
    this.roadPreviewGraphics.moveTo(screenPos.x, screenPos.y - hh);
    this.roadPreviewGraphics.lineTo(screenPos.x + hw, screenPos.y);
    this.roadPreviewGraphics.lineTo(screenPos.x, screenPos.y + hh);
    this.roadPreviewGraphics.lineTo(screenPos.x - hw, screenPos.y);
    this.roadPreviewGraphics.closePath();
    this.roadPreviewGraphics.fill();

    // Outline
    this.roadPreviewGraphics.setStrokeStyle({ width: 1, color: color, alpha: 1 });
    this.roadPreviewGraphics.moveTo(screenPos.x, screenPos.y - hh);
    this.roadPreviewGraphics.lineTo(screenPos.x + hw, screenPos.y);
    this.roadPreviewGraphics.lineTo(screenPos.x, screenPos.y + hh);
    this.roadPreviewGraphics.lineTo(screenPos.x - hw, screenPos.y);
    this.roadPreviewGraphics.closePath();
    this.roadPreviewGraphics.stroke();
  }

  /**
   * Update FPS display
   */
  updateFps(fps: number): void {
    this.fpsText.text = `FPS: ${fps}`;
  }

  /**
   * Update debug text
   */
  updateDebugText(text: string): void {
    this.debugText.text = text;
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
    this.debugGraphics.clear();
  }
}
