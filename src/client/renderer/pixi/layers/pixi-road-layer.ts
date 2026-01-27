/**
 * PixiRoadLayer - GPU-accelerated road rendering
 *
 * Renders road segments with proper topology detection:
 * - Straight roads (NS, WE)
 * - Corners (N, E, S, W)
 * - T-junctions
 * - Crossroads
 * - Urban/rural variants
 */

import { Container, Sprite, Texture } from 'pixi.js';
import { SpritePool, BatchSpriteManager } from '../sprite-pool';
import { TextureAtlasManager } from '../texture-atlas-manager';
import { ViewportBounds } from '../pixi-renderer';
import { TerrainData, ZoomConfig } from '../../../../shared/map-config';
import { MapSegment } from '../../../../shared/types';
import { LandClass, landClassOf } from '../../road-texture-system';

/** Road topology types */
const enum RoadTopology {
  NONE = 0,
  NS = 1,        // North-South
  WE = 2,        // West-East
  CORNER_N = 3,  // Corner opening to North
  CORNER_E = 4,  // Corner opening to East
  CORNER_S = 5,  // Corner opening to South
  CORNER_W = 6,  // Corner opening to West
  T_N = 7,       // T-junction, stem to North
  T_E = 8,       // T-junction, stem to East
  T_S = 9,       // T-junction, stem to South
  T_W = 10,      // T-junction, stem to West
  CROSS = 11,    // Crossroads
}

/** Topology to texture filename mapping */
const ROAD_TEXTURE_MAP: Record<RoadTopology, { land: string; urban: string }> = {
  [RoadTopology.NONE]: { land: '', urban: '' },
  [RoadTopology.NS]: { land: 'CountryRoadvert.bmp', urban: 'UrbanRoadvert.bmp' },
  [RoadTopology.WE]: { land: 'CountryRoadhorz.bmp', urban: 'UrbanRoadhorz.bmp' },
  [RoadTopology.CORNER_N]: { land: 'CountryRoadcornerN.bmp', urban: 'UrbanRoadcornerN.bmp' },
  [RoadTopology.CORNER_E]: { land: 'CountryRoadcornerE.bmp', urban: 'UrbanRoadcornerE.bmp' },
  [RoadTopology.CORNER_S]: { land: 'CountryRoadcornerS.bmp', urban: 'UrbanRoadcornerS.bmp' },
  [RoadTopology.CORNER_W]: { land: 'CountryRoadcornerW.bmp', urban: 'UrbanRoadcornerW.bmp' },
  [RoadTopology.T_N]: { land: 'CountryRoadTN.bmp', urban: 'UrbanRoadTN.bmp' },
  [RoadTopology.T_E]: { land: 'CountryRoadTE.bmp', urban: 'UrbanRoadTE.bmp' },
  [RoadTopology.T_S]: { land: 'CountryRoadTS.bmp', urban: 'UrbanRoadTS.bmp' },
  [RoadTopology.T_W]: { land: 'CountryRoadTW.bmp', urban: 'UrbanRoadTW.bmp' },
  [RoadTopology.CROSS]: { land: 'CountryRoadcross.bmp', urban: 'UrbanRoadcross.bmp' },
};

/**
 * Road layer renderer
 */
export class PixiRoadLayer {
  private container: Container;
  private textureAtlas: TextureAtlasManager;
  private spritePool: SpritePool;
  private batch: BatchSpriteManager;

  constructor(
    container: Container,
    textureAtlas: TextureAtlasManager,
    spritePool: SpritePool
  ) {
    this.container = container;
    this.textureAtlas = textureAtlas;
    this.spritePool = spritePool;
    this.batch = new BatchSpriteManager(spritePool, container, 'road');
    this.container.sortableChildren = true;
  }

  /**
   * Update road rendering
   */
  update(
    segments: MapSegment[],
    roadTilesMap: Map<string, boolean>,
    terrainData: TerrainData,
    bounds: ViewportBounds,
    zoomConfig: ZoomConfig
  ): void {
    this.batch.beginFrame();

    const { minI, maxI, minJ, maxJ } = bounds;
    const mapWidth = terrainData.width;
    const mapHeight = terrainData.height;

    // Collect road tiles in viewport
    const tiles: Array<{ i: number; j: number; sortKey: number }> = [];

    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        const key = `${j},${i}`; // Note: roadTilesMap uses x,y format
        if (roadTilesMap.has(key)) {
          tiles.push({ i, j, sortKey: i + j });
        }
      }
    }

    // Sort by painter's algorithm
    tiles.sort((a, b) => a.sortKey - b.sortKey);

    // Render each road tile
    for (const { i, j, sortKey } of tiles) {
      this.renderRoadTile(i, j, sortKey, roadTilesMap, terrainData, mapWidth, mapHeight, zoomConfig);
    }

    this.batch.endFrame();
  }

  /**
   * Render a single road tile
   */
  private renderRoadTile(
    i: number,
    j: number,
    sortKey: number,
    roadTilesMap: Map<string, boolean>,
    terrainData: TerrainData,
    mapWidth: number,
    mapHeight: number,
    zoomConfig: ZoomConfig
  ): void {
    // Calculate topology from neighbors
    const topology = this.calculateTopology(i, j, roadTilesMap);
    if (topology === RoadTopology.NONE) return;

    // Determine if urban or rural based on terrain (simplified)
    const paletteIndex = terrainData.paletteData[i]?.[j] ?? 0;
    const isUrban = false; // Would check concrete grid in full implementation

    // Get texture filename
    const textureInfo = ROAD_TEXTURE_MAP[topology];
    const filename = isUrban ? textureInfo.urban : textureInfo.land;
    if (!filename) return;

    // Get texture
    const texture = this.textureAtlas.getRoadTextureSync(filename);
    if (!texture) return;

    // Calculate screen position
    const screenPos = this.mapToScreen(i, j, mapWidth, mapHeight, zoomConfig);

    // Scale
    const scaleX = zoomConfig.tileWidth / 64;
    const scaleY = zoomConfig.tileHeight / 32;

    const posKey = `${i},${j}`;
    const textureKey = `road:${topology}:${isUrban ? 'urban' : 'land'}`;

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
        anchorY: 0.5
      }
    );
  }

  /**
   * Calculate road topology from neighbors
   */
  private calculateTopology(i: number, j: number, roadTilesMap: Map<string, boolean>): RoadTopology {
    // Check neighbors (using x,y format for roadTilesMap)
    const hasN = roadTilesMap.has(`${j},${i - 1}`);
    const hasS = roadTilesMap.has(`${j},${i + 1}`);
    const hasE = roadTilesMap.has(`${j + 1},${i}`);
    const hasW = roadTilesMap.has(`${j - 1},${i}`);

    const count = (hasN ? 1 : 0) + (hasS ? 1 : 0) + (hasE ? 1 : 0) + (hasW ? 1 : 0);

    // Determine topology
    if (count === 4) return RoadTopology.CROSS;

    if (count === 3) {
      if (!hasN) return RoadTopology.T_S;
      if (!hasS) return RoadTopology.T_N;
      if (!hasE) return RoadTopology.T_W;
      if (!hasW) return RoadTopology.T_E;
    }

    if (count === 2) {
      // Straight or corner
      if (hasN && hasS) return RoadTopology.NS;
      if (hasE && hasW) return RoadTopology.WE;

      // Corners
      if (hasN && hasE) return RoadTopology.CORNER_S;
      if (hasN && hasW) return RoadTopology.CORNER_E;
      if (hasS && hasE) return RoadTopology.CORNER_W;
      if (hasS && hasW) return RoadTopology.CORNER_N;
    }

    if (count === 1) {
      // Dead ends - use straight piece
      if (hasN || hasS) return RoadTopology.NS;
      if (hasE || hasW) return RoadTopology.WE;
    }

    // Isolated road tile
    return RoadTopology.CROSS;
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
  }
}
