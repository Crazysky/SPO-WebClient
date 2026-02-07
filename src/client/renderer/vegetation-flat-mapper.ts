/**
 * VegetationFlatMapper
 *
 * Automatically replaces vegetation/special terrain textures with flat center
 * textures near dynamic content (buildings, roads).
 *
 * This solves the painter's algorithm conflict where trees/decorations in
 * terrain textures visually clash with adjacent buildings and roads.
 *
 * The mapping is trivial thanks to the landId bit encoding:
 *   flatLandId = landId & 0xC0
 * This keeps LandClass (bits 7-6) and zeroes LandType+LandVar,
 * which maps any tile to the Center variant 0 of its terrain zone.
 */

import { isSpecialTile } from '../../shared/land-utils';
import { MapBuilding, MapSegment, FacilityDimensions } from '../../shared/types';
import { CHUNK_SIZE } from './chunk-cache';

/** Bit mask to extract LandClass only (Center, variant 0) */
const FLAT_MASK = 0xC0;

export class VegetationFlatMapper {
  /** Set of "i,j" tile keys that should use flat textures */
  private flatZones: Set<string> = new Set();

  /** Buffer radius around dynamic content (in tiles) */
  private bufferRadius: number;

  /** Track which chunks are dirty after an update */
  private dirtyChunks: Set<string> = new Set();

  /** Previous flat zones for dirty chunk detection */
  private previousFlatZones: Set<string> = new Set();

  constructor(bufferRadius: number = 2) {
    this.bufferRadius = bufferRadius;
  }

  /**
   * Update the flat zones based on current dynamic content.
   * Call this whenever buildings or road segments change.
   */
  updateDynamicContent(
    buildings: MapBuilding[],
    segments: MapSegment[],
    facilityCache: Map<string, FacilityDimensions>
  ): void {
    // Save previous state for dirty detection
    this.previousFlatZones = this.flatZones;
    this.flatZones = new Set();
    this.dirtyChunks.clear();

    const R = this.bufferRadius;

    // Building footprint tiles + buffer
    for (const building of buildings) {
      const dims = facilityCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      // building.x/y are the building's anchor coordinates
      // Expand by buffer radius in all directions
      for (let dy = -R; dy < ysize + R; dy++) {
        for (let dx = -R; dx < xsize + R; dx++) {
          const ti = building.y + dy;
          const tj = building.x + dx;
          if (ti >= 0 && tj >= 0) {
            this.flatZones.add(`${ti},${tj}`);
          }
        }
      }
    }

    // Road segment tiles + buffer
    for (const seg of segments) {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      const minY = Math.min(seg.y1, seg.y2);
      const maxY = Math.max(seg.y1, seg.y2);

      for (let y = minY - R; y <= maxY + R; y++) {
        for (let x = minX - R; x <= maxX + R; x++) {
          if (y >= 0 && x >= 0) {
            this.flatZones.add(`${y},${x}`);
          }
        }
      }
    }

    // Compute dirty chunks (tiles that changed state)
    this.computeDirtyChunks();
  }

  /**
   * Check if a tile should be flattened (vegetation replaced by center texture).
   * Only flattens tiles that are actually "special" (vegetation/decorations).
   *
   * @param i - Row coordinate
   * @param j - Column coordinate
   * @param landId - The raw landId from the terrain BMP
   * @returns true if this tile should use a flat texture
   */
  shouldFlatten(i: number, j: number, landId: number): boolean {
    if (!isSpecialTile(landId)) return false;
    return this.flatZones.has(`${i},${j}`);
  }

  /**
   * Get the flat equivalent of a landId.
   * Keeps LandClass (bits 7-6), zeros LandType and LandVar.
   *
   * Examples:
   *   GrassSpecial (52 = 0x34) → GrassCenter (0 = 0x00)
   *   DryGroundSpecial (180 = 0xB4) → DryGroundCenter (128 = 0x80)
   */
  getFlatLandId(landId: number): number {
    return landId & FLAT_MASK;
  }

  /**
   * Get the set of chunk keys that need re-rendering.
   * A chunk is dirty if any of its tiles changed flatten state.
   *
   * @param chunkSize - Tiles per chunk dimension (default CHUNK_SIZE)
   * @returns Set of "chunkI,chunkJ" keys
   */
  getDirtyChunks(chunkSize: number = CHUNK_SIZE): Set<string> {
    return this.dirtyChunks;
  }

  /**
   * Check if there are any flat zones defined
   */
  hasFlatZones(): boolean {
    return this.flatZones.size > 0;
  }

  /**
   * Get the number of tiles in the flat zone
   */
  getFlatZoneSize(): number {
    return this.flatZones.size;
  }

  /**
   * Get the buffer radius
   */
  getBufferRadius(): number {
    return this.bufferRadius;
  }

  /**
   * Set the buffer radius and mark everything dirty
   */
  setBufferRadius(radius: number): void {
    this.bufferRadius = radius;
  }

  /**
   * Clear all flat zones
   */
  clear(): void {
    this.previousFlatZones = this.flatZones;
    this.flatZones = new Set();
    this.dirtyChunks.clear();
  }

  /**
   * Compute which chunks changed between previous and current flat zones
   */
  private computeDirtyChunks(): void {
    const changedTiles = new Set<string>();

    // Tiles added to flat zones
    for (const key of this.flatZones) {
      if (!this.previousFlatZones.has(key)) {
        changedTiles.add(key);
      }
    }

    // Tiles removed from flat zones
    for (const key of this.previousFlatZones) {
      if (!this.flatZones.has(key)) {
        changedTiles.add(key);
      }
    }

    // Map changed tiles to chunk coordinates
    for (const key of changedTiles) {
      const [i, j] = key.split(',').map(Number);
      const chunkI = Math.floor(i / CHUNK_SIZE);
      const chunkJ = Math.floor(j / CHUNK_SIZE);
      this.dirtyChunks.add(`${chunkI},${chunkJ}`);
    }
  }
}
