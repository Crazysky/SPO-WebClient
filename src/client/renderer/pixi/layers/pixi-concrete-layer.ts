/**
 * PixiConcreteLayer - GPU-accelerated concrete/pavement rendering
 *
 * Renders concrete textures around buildings:
 * - Land concrete (IDs 0-12)
 * - Water platforms (IDs 0x80-0x88)
 */

import { Container, Sprite, Texture, Graphics } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds } from '../pixi-renderer';
import { TerrainData, ZoomConfig } from '../../../../shared/map-config';
import { MapBuilding, FacilityDimensions } from '../../../../shared/types';
import { LandClass, landClassOf } from '../../road-texture-system';

/** Concrete ID to filename mapping */
const CONCRETE_FILENAMES: Record<number, string> = {
  0: 'Conc1.bmp',
  1: 'Conc2.bmp',
  2: 'Conc3.bmp',
  3: 'Conc4.bmp',
  4: 'Conc5.bmp',
  5: 'Conc6.bmp',
  6: 'Conc7.bmp',
  7: 'Conc8.bmp',
  8: 'Conc9.bmp',
  9: 'Conc10.bmp',
  10: 'Conc11.bmp',
  11: 'Conc12.bmp',
  12: 'Conc13.bmp',
};

/** Water platform filenames */
const PLATFORM_FILENAMES: Record<number, string> = {
  0x80: 'platC.bmp',
  0x81: 'platE.bmp',
  0x82: 'platN.bmp',
  0x83: 'platNE.bmp',
  0x84: 'platNW.bmp',
  0x85: 'platS.bmp',
  0x86: 'platSE.bmp',
  0x87: 'platSW.bmp',
  0x88: 'platW.bmp',
};

/**
 * Concrete layer renderer
 */
export class PixiConcreteLayer {
  private container: Container;
  private textureAtlas: TextureAtlasManager;
  private spritePool: SpritePool;
  private batch: BatchSpriteManager;

  // Concrete grid (computed from buildings)
  private concreteGrid: Map<string, number> = new Map();

  // Cache invalidation tracking
  private lastBuildingsHash: string = '';
  private gridDirty: boolean = true;

  constructor(
    container: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = container;
    this.textureAtlas = textureAtlas;
    this.spritePool = spritePool;
    this.batch = new BatchSpriteManager(spritePool, container, 'concrete');
    this.container.sortableChildren = true;
  }

  /**
   * Update concrete rendering
   */
  update(
    buildings: MapBuilding[],
    terrainData: TerrainData,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig
  ): void {
    // Only rebuild concrete grid when buildings change (expensive operation)
    const buildingsHash = this.computeBuildingsHash(buildings);
    if (buildingsHash !== this.lastBuildingsHash || this.gridDirty) {
      this.rebuildConcreteGrid(buildings, terrainData);
      this.lastBuildingsHash = buildingsHash;
      this.gridDirty = false;
    }

    this.batch.beginFrame();

    const { minI, maxI, minJ, maxJ } = bounds;
    const mapWidth = terrainData.width;
    const mapHeight = terrainData.height;

    // Render concrete tiles in painter's algorithm order (by diagonal bands)
    // This avoids array allocation and sorting overhead
    const minSortKey = minI + minJ;
    const maxSortKey = maxI + maxJ;

    for (let sortKey = minSortKey; sortKey <= maxSortKey; sortKey++) {
      const iStart = Math.max(minI, sortKey - maxJ);
      const iEnd = Math.min(maxI, sortKey - minJ);

      for (let i = iStart; i <= iEnd; i++) {
        const j = sortKey - i;
        if (j >= minJ && j <= maxJ) {
          const key = `${i},${j}`;
          const concreteId = this.concreteGrid.get(key);
          if (concreteId !== undefined && concreteId >= 0) {
            this.renderConcreteTile(i, j, concreteId, sortKey, mapWidth, mapHeight, zoomConfig);
          }
        }
      }
    }

    this.batch.endFrame();
  }

  /**
   * Rebuild concrete grid from buildings
   */
  private rebuildConcreteGrid(buildings: MapBuilding[], terrainData: TerrainData): void {
    this.concreteGrid.clear();

    const CONCRETE_RADIUS = 1; // Tiles around building

    for (const building of buildings) {
      const xsize = 1; // Would need facility dimensions
      const ysize = 1;

      // Mark concrete around building
      for (let di = -CONCRETE_RADIUS; di < ysize + CONCRETE_RADIUS; di++) {
        for (let dj = -CONCRETE_RADIUS; dj < xsize + CONCRETE_RADIUS; dj++) {
          const i = building.y + di;
          const j = building.x + dj;

          if (i < 0 || j < 0 || i >= terrainData.height || j >= terrainData.width) continue;

          const key = `${i},${j}`;
          this.concreteGrid.set(key, (this.concreteGrid.get(key) ?? 0) + 1);
        }
      }
    }

    // Convert counts to concrete IDs based on neighbors
    for (const [key, count] of this.concreteGrid) {
      if (count > 0) {
        const [iStr, jStr] = key.split(',');
        const i = parseInt(iStr);
        const j = parseInt(jStr);
        const concreteId = this.calculateConcreteId(i, j, terrainData);
        this.concreteGrid.set(key, concreteId);
      }
    }
  }

  /**
   * Calculate concrete ID based on neighbors
   */
  private calculateConcreteId(i: number, j: number, terrainData: TerrainData): number {
    // Check if near water
    const paletteIndex = terrainData.paletteData[i]?.[j] ?? 0;
    const isWater = landClassOf(paletteIndex) === LandClass.ZoneD;

    if (isWater) {
      // Return water platform ID based on neighbors
      return this.calculatePlatformId(i, j);
    }

    // Check cardinal neighbors for concrete
    const hasTop = this.concreteGrid.has(`${i - 1},${j}`);
    const hasBottom = this.concreteGrid.has(`${i + 1},${j}`);
    const hasLeft = this.concreteGrid.has(`${i},${j - 1}`);
    const hasRight = this.concreteGrid.has(`${i},${j + 1}`);

    // Determine concrete ID based on pattern
    if (hasTop && hasLeft && !hasRight && !hasBottom) return 3;  // NW corner
    if (!hasTop && !hasLeft && hasRight && hasBottom) return 10; // SE corner
    if (hasTop && hasRight && !hasLeft && !hasBottom) return 9;  // SW corner
    if (!hasTop && hasLeft && !hasRight && hasBottom) return 2;  // NE corner
    if (!hasTop && hasLeft && hasRight && hasBottom) return 0;   // N edge
    if (hasTop && hasLeft && hasRight && !hasBottom) return 6;   // S edge
    if (hasTop && hasLeft && !hasRight && hasBottom) return 5;   // E edge
    if (hasTop && !hasLeft && hasRight && hasBottom) return 7;   // W edge

    return 12; // Full concrete (center)
  }

  /**
   * Calculate water platform ID
   */
  private calculatePlatformId(i: number, j: number): number {
    const hasTop = this.concreteGrid.has(`${i - 1},${j}`);
    const hasBottom = this.concreteGrid.has(`${i + 1},${j}`);
    const hasLeft = this.concreteGrid.has(`${i},${j - 1}`);
    const hasRight = this.concreteGrid.has(`${i},${j + 1}`);

    // Platform edge patterns
    if (!hasTop && hasLeft && hasBottom && !hasRight) return 0x83; // NE corner
    if (!hasTop && !hasLeft && hasBottom && hasRight) return 0x84; // NW corner
    if (hasTop && hasLeft && !hasBottom && !hasRight) return 0x86; // SE corner
    if (hasTop && !hasLeft && !hasBottom && hasRight) return 0x87; // SW corner
    if (!hasTop && hasLeft && hasRight && hasBottom) return 0x82;  // N edge
    if (hasTop && hasLeft && hasRight && !hasBottom) return 0x85;  // S edge
    if (hasTop && hasLeft && !hasRight && hasBottom) return 0x81;  // E edge
    if (hasTop && !hasLeft && hasRight && hasBottom) return 0x88;  // W edge

    return 0x80; // Center
  }

  /**
   * Render a single concrete tile
   */
  private renderConcreteTile(
    i: number,
    j: number,
    concreteId: number,
    sortKey: number,
    mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig
  ): void {
    // Get filename for this concrete ID
    const filename = concreteId >= 0x80
      ? PLATFORM_FILENAMES[concreteId]
      : CONCRETE_FILENAMES[concreteId];

    if (!filename) return;

    // Get texture
    const texture = this.textureAtlas.getConcreteTextureSync(filename);
    if (!texture) return;

    // Calculate screen position
    const screenPos = this.mapToScreen(i, j, mapWidth, mapHeight, zoomConfig);

    // Scale
    const scaleX = zoomConfig.tileWidth / 64;
    const scaleY = zoomConfig.tileHeight / 32;

    const posKey = `${i},${j}`;
    const textureKey = `concrete:${concreteId}`;

    this.batch.setSprite(
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
        anchorY: 0  // Top anchor to match Canvas renderer (mapToScreen returns top of tile)
      }
    );
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
    this.concreteGrid.clear();
    this.gridDirty = true;
    this.lastBuildingsHash = '';
  }

  /**
   * Compute a simple hash of buildings for change detection
   */
  private computeBuildingsHash(buildings: MapBuilding[]): string {
    // Quick hash based on count and a few sample positions
    if (buildings.length === 0) return '0';
    const sample = buildings.slice(0, 10).map(b => `${b.x},${b.y}`).join(';');
    return `${buildings.length}:${sample}`;
  }
}
