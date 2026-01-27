/**
 * PixiBuildingLayer - GPU-accelerated building rendering
 *
 * Renders building sprites with:
 * - Multi-tile building support
 * - Hover highlighting
 * - Proper z-ordering (painter's algorithm)
 */

import { Container, Sprite, Texture, Graphics } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds } from '../pixi-renderer';
import { ZoomConfig } from '../../../../shared/map-config';
import { MapBuilding, FacilityDimensions } from '../../../../shared/types';

/** Fallback building colors by type */
const BUILDING_COLORS: Record<string, number> = {
  default: 0x4A90E2,     // Blue
  hovered: 0x5FADFF,     // Light blue
  residential: 0xFF6B6B, // Red
  commercial: 0x4ECDC4,  // Teal
  industrial: 0xFFE66D,  // Yellow
};

/**
 * Building layer renderer
 */
export class PixiBuildingLayer {
  private container: Container;
  private textureAtlas: TextureAtlasManager;
  private spritePool: SpritePool;
  private batch: BatchSpriteManager;

  // Graphics for fallback rendering
  private fallbackGraphics: Graphics;

  constructor(
    container: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = container;
    this.textureAtlas = textureAtlas;
    this.spritePool = spritePool;
    this.batch = new BatchSpriteManager(spritePool, container, 'building');
    this.container.sortableChildren = true;

    this.fallbackGraphics = new Graphics();
    this.container.addChild(this.fallbackGraphics);
  }

  /**
   * Update building rendering
   */
  update(
    buildings: MapBuilding[],
    facilityDimensions: Map<string, FacilityDimensions>,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig,
    hoveredBuilding: MapBuilding | null
  ): void {
    this.batch.beginFrame();
    this.fallbackGraphics.clear();

    const { minI, maxI, minJ, maxJ } = bounds;

    // Filter buildings in viewport and sort by painter's algorithm
    const visibleBuildings: Array<{ building: MapBuilding; sortKey: number }> = [];

    for (const building of buildings) {
      const dims = facilityDimensions.get(building.visualClass);
      const xsize = dims?.xsize ?? 1;
      const ysize = dims?.ysize ?? 1;

      // Check if building overlaps viewport
      const buildingMinI = building.y;
      const buildingMaxI = building.y + ysize - 1;
      const buildingMinJ = building.x;
      const buildingMaxJ = building.x + xsize - 1;

      if (
        buildingMaxI >= minI &&
        buildingMinI <= maxI &&
        buildingMaxJ >= minJ &&
        buildingMinJ <= maxJ
      ) {
        // Sort key based on anchor point (bottom corner of building)
        const sortKey = (building.y + ysize) + (building.x + xsize);
        visibleBuildings.push({ building, sortKey });
      }
    }

    // Sort by painter's algorithm (ascending)
    visibleBuildings.sort((a, b) => a.sortKey - b.sortKey);

    // Render each building
    for (const { building, sortKey } of visibleBuildings) {
      const dims = facilityDimensions.get(building.visualClass);
      const isHovered = hoveredBuilding === building;
      this.renderBuilding(building, dims, sortKey, zoomConfig, isHovered);
    }

    this.batch.endFrame();
  }

  /**
   * Render a single building
   */
  private renderBuilding(
    building: MapBuilding,
    dims: FacilityDimensions | undefined,
    sortKey: number,
    zoomConfig: ZoomConfig,
    isHovered: boolean
  ): void {
    const xsize = dims?.xsize ?? 1;
    const ysize = dims?.ysize ?? 1;

    // Get texture (async loading)
    const texture = this.textureAtlas.getBuildingTextureSync(building.visualClass);

    if (texture) {
      // Render with texture
      this.renderBuildingSprite(building, texture, xsize, ysize, sortKey, zoomConfig, isHovered);
    } else {
      // Render fallback (colored diamond)
      this.renderBuildingFallback(building, xsize, ysize, sortKey, zoomConfig, isHovered);
    }
  }

  /**
   * Render building with texture
   */
  private renderBuildingSprite(
    building: MapBuilding,
    texture: Texture,
    xsize: number,
    ysize: number,
    sortKey: number,
    zoomConfig: ZoomConfig,
    isHovered: boolean
  ): void {
    // Calculate anchor position (top corner of building footprint)
    const anchorI = building.y;
    const anchorJ = building.x + xsize - 1;

    const screenPos = this.mapToScreen(
      anchorI,
      anchorJ,
      2000, // mapHeight - would be passed in
      2000, // mapWidth
      zoomConfig
    );

    // Calculate building screen size based on footprint
    const buildingScreenWidth = zoomConfig.tileWidth * xsize;
    const buildingScreenHeight = zoomConfig.tileHeight * ysize;

    // Scale texture to fit building footprint
    const scaleX = buildingScreenWidth / texture.width;
    const scaleY = buildingScreenHeight / texture.height;

    const posKey = `building:${building.x},${building.y}`;
    const textureKey = `building:${building.visualClass}`;

    const sprite = this.batch.setSprite(
      posKey,
      textureKey,
      texture,
      screenPos.x,
      screenPos.y,
      sortKey * 1000,
      {
        scaleX,
        scaleY,
        anchorX: 0.5,
        anchorY: 1, // Anchor at bottom for correct positioning
        tint: isHovered ? 0xAAAAFF : 0xFFFFFF, // Tint hovered buildings
        alpha: isHovered ? 0.9 : 1
      }
    );
  }

  /**
   * Render building as fallback colored diamond
   */
  private renderBuildingFallback(
    building: MapBuilding,
    xsize: number,
    ysize: number,
    sortKey: number,
    zoomConfig: ZoomConfig,
    isHovered: boolean
  ): void {
    const color = isHovered ? BUILDING_COLORS.hovered : BUILDING_COLORS.default;

    // Draw diamond for each tile in building footprint
    for (let di = 0; di < ysize; di++) {
      for (let dj = 0; dj < xsize; dj++) {
        const i = building.y + di;
        const j = building.x + dj;

        const screenPos = this.mapToScreen(i, j, 2000, 2000, zoomConfig);

        const hw = zoomConfig.tileWidth / 2;
        const hh = zoomConfig.tileHeight / 2;

        this.fallbackGraphics.setFillStyle({ color, alpha: 0.8 });
        this.fallbackGraphics.moveTo(screenPos.x, screenPos.y - hh);
        this.fallbackGraphics.lineTo(screenPos.x + hw, screenPos.y);
        this.fallbackGraphics.lineTo(screenPos.x, screenPos.y + hh);
        this.fallbackGraphics.lineTo(screenPos.x - hw, screenPos.y);
        this.fallbackGraphics.closePath();
        this.fallbackGraphics.fill();
      }
    }

    // Set z-index for fallback graphics
    this.fallbackGraphics.zIndex = sortKey * 1000 + 1;
  }

  /**
   * Convert map coordinates to screen position
   */
  private mapToScreen(
    i: number,
    j: number,
    mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig
  ): { x: number; y: number } {
    const u = zoomConfig.u;
    const rows = mapHeight;
    const cols = mapWidth;

    const x = u * (rows - i + j);
    const y = (u / 2) * ((rows - i) + (cols - j));

    return { x, y };
  }

  /**
   * Clear layer
   */
  clear(): void {
    this.batch.clear();
    this.fallbackGraphics.clear();
  }
}
