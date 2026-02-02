/**
 * PixiConcreteLayer - GPU-accelerated concrete/pavement rendering
 *
 * Renders concrete textures around buildings:
 * - Land concrete (IDs 0-12)
 * - Water platforms (IDs 0x80-0x88)
 *
 * Uses the proper concrete texture system algorithm from concrete-texture-system.ts
 *
 * Unified Painter's Algorithm:
 * - sortKey = (i + j) * 10000 + SORT_PRIORITY_CONCRETE
 * - Concrete renders after terrain base but before roads
 */

import { Container } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds, SORT_MAX_KEY, SORT_MULTIPLIER_DIAGONAL, SORT_MULTIPLIER_J, SORT_PRIORITY_CONCRETE } from '../pixi-renderer';
import { TerrainData, ZoomConfig } from '../../../../shared/map-config';
import { MapBuilding, FacilityDimensions } from '../../../../shared/types';
import {
  getConcreteId,
  ConcreteMapData,
  CONCRETE_NONE,
  CONCRETE_PLATFORM_FLAG
} from '../../concrete-texture-system';

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

/** Water platform filenames (INI IDs $80-$88) */
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
  private _spritePool: SpritePool;
  private batch: BatchSpriteManager;

  // Grids for concrete calculation
  private concretePresenceGrid: Map<string, boolean> = new Map(); // Which tiles have concrete
  private buildingGrid: Map<string, boolean> = new Map();         // Which tiles have buildings
  private concreteIdGrid: Map<string, number> = new Map();        // Final concrete IDs

  // Cache invalidation tracking
  private lastBuildingsRef: MapBuilding[] | null = null;
  private lastTerrainRef: TerrainData | null = null;

  // Cached terrain and road data for mapData interface
  private cachedTerrainData: TerrainData | null = null;
  private roadTilesMap: Map<string, boolean> = new Map();

  constructor(
    container: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = container;
    this.textureAtlas = textureAtlas;
    this._spritePool = spritePool;
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
    zoomConfig: ZoomConfig,
    facilityDimensions: Map<string, FacilityDimensions> = new Map(),
    roadTilesMap: Map<string, boolean> = new Map()
  ): void {
    // Cache for mapData interface
    this.cachedTerrainData = terrainData;
    this.roadTilesMap = roadTilesMap;

    // Only rebuild concrete grid when buildings or terrain change
    if (buildings !== this.lastBuildingsRef || terrainData !== this.lastTerrainRef) {
      console.log(`[PixiConcreteLayer] Rebuilding grid for ${buildings.length} buildings`);
      this.rebuildConcreteGrid(buildings, terrainData, facilityDimensions);
      this.lastBuildingsRef = buildings;
      this.lastTerrainRef = terrainData;
      console.log(`[PixiConcreteLayer] Concrete grid size: ${this.concreteIdGrid.size}`);
    }

    this.batch.beginFrame();

    const { minI, maxI, minJ, maxJ } = bounds;
    const mapWidth = terrainData.width;
    const mapHeight = terrainData.height;

    // Render concrete tiles in painter's algorithm order (by diagonal bands)
    const minSortKey = minI + minJ;
    const maxSortKey = maxI + maxJ;

    for (let sortKey = minSortKey; sortKey <= maxSortKey; sortKey++) {
      const iStart = Math.max(minI, sortKey - maxJ);
      const iEnd = Math.min(maxI, sortKey - minJ);

      for (let i = iStart; i <= iEnd; i++) {
        const j = sortKey - i;
        if (j >= minJ && j <= maxJ) {
          // Skip tiles that have roads - roads cover concrete visually
          // roadTilesMap uses format "x,y" = "j,i"
          if (roadTilesMap.has(`${j},${i}`)) {
            continue;
          }
          const key = `${i},${j}`;
          const concreteId = this.concreteIdGrid.get(key);
          if (concreteId !== undefined && concreteId !== CONCRETE_NONE) {
            this.renderConcreteTile(i, j, concreteId, sortKey, mapWidth, mapHeight, zoomConfig);
          }
        }
      }
    }

    this.batch.endFrame();
  }

  /**
   * Rebuild concrete grid from buildings using proper facility dimensions
   */
  private rebuildConcreteGrid(
    buildings: MapBuilding[],
    terrainData: TerrainData,
    facilityDimensions: Map<string, FacilityDimensions>
  ): void {
    this.concretePresenceGrid.clear();
    this.buildingGrid.clear();
    this.concreteIdGrid.clear();

    const CONCRETE_RADIUS = 1; // Tiles around building that get concrete

    // Phase 1: Mark all tiles that have concrete or buildings
    for (const building of buildings) {
      const dims = facilityDimensions.get(building.visualClass);
      const xsize = dims?.xsize ?? 1;
      const ysize = dims?.ysize ?? 1;

      // Mark building footprint
      for (let di = 0; di < ysize; di++) {
        for (let dj = 0; dj < xsize; dj++) {
          const i = building.y + di;
          const j = building.x + dj;
          if (i >= 0 && j >= 0 && i < terrainData.height && j < terrainData.width) {
            const key = `${i},${j}`;
            this.buildingGrid.set(key, true);
            this.concretePresenceGrid.set(key, true);
          }
        }
      }

      // Mark concrete around building (expanded footprint)
      for (let di = -CONCRETE_RADIUS; di < ysize + CONCRETE_RADIUS; di++) {
        for (let dj = -CONCRETE_RADIUS; dj < xsize + CONCRETE_RADIUS; dj++) {
          const i = building.y + di;
          const j = building.x + dj;
          if (i >= 0 && j >= 0 && i < terrainData.height && j < terrainData.width) {
            const key = `${i},${j}`;
            this.concretePresenceGrid.set(key, true);
          }
        }
      }
    }

    // Phase 2: Calculate concrete ID for each tile using proper algorithm
    const mapData: ConcreteMapData = {
      getLandId: (row, col) => {
        return terrainData.paletteData[row]?.[col] ?? 0;
      },
      hasConcrete: (row, col) => {
        return this.concretePresenceGrid.has(`${row},${col}`);
      },
      hasRoad: (row, col) => {
        // roadTilesMap uses x,y format (j,i)
        return this.roadTilesMap.has(`${col},${row}`);
      },
      hasBuilding: (row, col) => {
        return this.buildingGrid.has(`${row},${col}`);
      }
    };

    for (const key of this.concretePresenceGrid.keys()) {
      const [iStr, jStr] = key.split(',');
      const i = parseInt(iStr);
      const j = parseInt(jStr);
      const concreteId = getConcreteId(i, j, mapData);
      if (concreteId !== CONCRETE_NONE) {
        this.concreteIdGrid.set(key, concreteId);
      }
    }
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
    // Check if it's a platform (water) ID
    const isPlatform = (concreteId & CONCRETE_PLATFORM_FLAG) !== 0;
    const filename = isPlatform
      ? PLATFORM_FILENAMES[concreteId]
      : CONCRETE_FILENAMES[concreteId & 0x0F]; // Mask out road flag

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

    // PAINTER'S ALGORITHM: Invert sortKey so higher (i+j) = lower zIndex = drawn first (background)
    const invertedSortKey = SORT_MAX_KEY - sortKey;

    this.batch.setSprite(
      posKey,
      textureKey,
      texture,
      screenPos.x,
      screenPos.y,
      invertedSortKey * SORT_MULTIPLIER_DIAGONAL + j * SORT_MULTIPLIER_J + SORT_PRIORITY_CONCRETE,
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
    _mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig
  ): { x: number; y: number } {
    const u = zoomConfig.u;
    const rows = mapHeight;
    const cols = _mapWidth;

    const x = u * (rows - i + j);
    const y = (u / 2) * ((rows - i) + (cols - j));

    return { x, y };
  }

  /**
   * Clear layer
   */
  clear(): void {
    this.batch.clear();
    this.concretePresenceGrid.clear();
    this.buildingGrid.clear();
    this.concreteIdGrid.clear();
    this.lastBuildingsRef = null;
    this.lastTerrainRef = null;
  }
}
