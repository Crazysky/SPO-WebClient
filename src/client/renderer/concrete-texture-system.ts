/**
 * StarPeace Concrete Texture System
 *
 * Context-sensitive algorithm for selecting concrete textures based on neighbor tiles.
 * Ported from Delphi (Concrete.pas, Map.pas, MapTypes.pas)
 *
 * This module handles:
 * 1. Neighbor configuration analysis (8 neighbors for land, 4 cardinal for water)
 * 2. Concrete texture ID calculation (land: 0-12, water: 0-8 with platform flag)
 * 3. Road and special concrete flag application
 * 4. Rotation support for map orientations
 * 5. INI-based texture class loading
 */

import { LandClass, landClassOf } from '../../shared/land-utils';
import { Rotation } from './road-texture-system';
import { parseIniFile, parseDelphiInt } from './road-texture-system';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Full concrete - tile surrounded by concrete on all 8 sides */
export const CONCRETE_FULL = 12;

/** Special decorative concrete (used on even grid positions) */
export const CONCRETE_SPECIAL = 15;

/** Road flag - OR'd with base land concrete ID when road present on tile */
export const CONCRETE_ROAD_FLAG = 0x10;

/** Platform flag - OR'd for water/aquatic concrete platforms */
export const CONCRETE_PLATFORM_FLAG = 0x80;

/** Mask to extract base ID without platform flag */
export const CONCRETE_PLATFORM_MASK = 0x7F;

/** No concrete present */
export const CONCRETE_NONE = 0xFF;

// =============================================================================
// NEIGHBOR CONFIGURATION
// =============================================================================

/**
 * 8-neighbor configuration for concrete calculation
 *
 * Index mapping (isometric view):
 *       [0]   [1]   [2]
 *          ╲   │   ╱
 *           ╲  │  ╱
 *    [3] ─── TILE ─── [4]
 *           ╱  │  ╲
 *          ╱   │   ╲
 *       [5]   [6]   [7]
 *
 * Each element is true if that neighbor has concrete
 */
export type ConcreteCfg = [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean];

/**
 * Neighbor offset table: [di, dj] for each index 0-7
 * Used to calculate neighbor coordinates from tile position
 */
export const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [-1, -1], // 0: top-left (diagonal)
  [-1,  0], // 1: top (cardinal)
  [-1,  1], // 2: top-right (diagonal)
  [ 0, -1], // 3: left (cardinal)
  [ 0,  1], // 4: right (cardinal)
  [ 1, -1], // 5: bottom-left (diagonal)
  [ 1,  0], // 6: bottom (cardinal)
  [ 1,  1]  // 7: bottom-right (diagonal)
] as const;

/** Cardinal neighbor indices (for water platforms) */
export const CARDINAL_INDICES = {
  TOP: 1,
  LEFT: 3,
  RIGHT: 4,
  BOTTOM: 6
} as const;

/** Diagonal neighbor indices */
export const DIAGONAL_INDICES = {
  TOP_LEFT: 0,
  TOP_RIGHT: 2,
  BOTTOM_LEFT: 5,
  BOTTOM_RIGHT: 7
} as const;

// =============================================================================
// MAP DATA INTERFACE
// =============================================================================

/**
 * Interface for querying map data needed by concrete calculations
 */
export interface ConcreteMapData {
  /** Get the land ID (terrain type) at a position */
  getLandId(row: number, col: number): number;
  /** Check if a tile has concrete */
  hasConcrete(row: number, col: number): boolean;
  /** Check if a tile has a road */
  hasRoad(row: number, col: number): boolean;
  /** Check if a building occupies this tile */
  hasBuilding(row: number, col: number): boolean;
}

// =============================================================================
// LOOKUP TABLES
// =============================================================================

/**
 * Water platform INI IDs
 * These are the actual IDs from the INI files (platC, platE, platN, etc.)
 *
 * The naming convention refers to which EDGE of the platform is exposed (no neighbor):
 * - platN = tile at North edge of platform (missing N neighbor, exposed to the north)
 * - platE = tile at East edge of platform (missing E neighbor, exposed to the east)
 * - platNE = tile at NE corner of platform (missing N and E neighbors)
 *
 * Isometric coordinate mapping:
 * - N (North) = row-1 = top-right on screen
 * - S (South) = row+1 = bottom-left on screen
 * - E (East) = col+1 = bottom-right on screen
 * - W (West) = col-1 = top-left on screen
 */
export const PLATFORM_IDS = {
  CENTER: 0x80, // platC - all 4 cardinal neighbors present (center tile)
  E: 0x81,      // platE - East edge exposed (missing E neighbor)
  N: 0x82,      // platN - North edge exposed (missing N neighbor)
  NE: 0x83,     // platNE - NE corner exposed (missing N,E neighbors)
  NW: 0x84,     // platNW - NW corner exposed (missing N,W neighbors)
  S: 0x85,      // platS - South edge exposed (missing S neighbor)
  SE: 0x86,     // platSE - SE corner exposed (missing S,E neighbors)
  SW: 0x87,     // platSW - SW corner exposed (missing S,W neighbors)
  W: 0x88,      // platW - West edge exposed (missing W neighbor)
} as const;

/**
 * Water concrete lookup table
 * Maps 4-bit cardinal neighbor pattern DIRECTLY to INI platform ID
 *
 * Key bits: [top][left][right][bottom] (each 1 bit)
 * Key = (top ? 8 : 0) | (left ? 4 : 0) | (right ? 2 : 0) | (bottom ? 1 : 0)
 *
 * IMPORTANT: The edge/corner NAME refers to which edge is EXPOSED (no neighbor):
 * - Missing T (row-1) = NORTH edge exposed → use platN
 * - Missing B (row+1) = SOUTH edge exposed → use platS
 * - Missing L (col-1) = WEST edge exposed → use platW
 * - Missing R (col+1) = EAST edge exposed → use platE
 *
 * | Pattern | Missing | Exposed Edge | INI ID |
 * |---------|---------|--------------|--------|
 * | TLRB    | none    | center       | $80    |
 * | _LRB    | T       | N edge       | $82    |
 * | T_RB    | L       | W edge       | $88    |
 * | TL_B    | R       | E edge       | $81    |
 * | TLR_    | B       | S edge       | $85    |
 * | __RB    | T,L     | NW corner    | $84    |
 * | _L_B    | T,R     | NE corner    | $83    |
 * | T__B    | L,R     | (vertical)   | $80    |
 * | TL__    | R,B     | SE corner    | $86    |
 * | T_R_    | L,B     | SW corner    | $87    |
 * | _LR_    | T,B     | (horizontal) | $80    |
 */
const WATER_CONCRETE_LOOKUP: Record<number, number> = {
  0b1111: PLATFORM_IDS.CENTER, // TLRB = all present → center
  0b0111: PLATFORM_IDS.N,      // _LRB = missing T → N edge exposed
  0b1011: PLATFORM_IDS.W,      // T_RB = missing L → W edge exposed
  0b1101: PLATFORM_IDS.E,      // TL_B = missing R → E edge exposed
  0b1110: PLATFORM_IDS.S,      // TLR_ = missing B → S edge exposed
  0b0011: PLATFORM_IDS.NW,     // __RB = missing T,L → NW corner exposed
  0b0101: PLATFORM_IDS.NE,     // _L_B = missing T,R → NE corner exposed
  0b1001: PLATFORM_IDS.CENTER, // T__B = missing L,R → vertical strip (use center)
  0b1100: PLATFORM_IDS.SE,     // TL__ = missing R,B → SE corner exposed
  0b1010: PLATFORM_IDS.SW,     // T_R_ = missing L,B → SW corner exposed
  0b0110: PLATFORM_IDS.CENTER, // _LR_ = missing T,B → horizontal strip (use center)
  // Isolated patterns - use center as fallback
  0b0001: PLATFORM_IDS.CENTER, // ___B
  0b0010: PLATFORM_IDS.CENTER, // __R_
  0b0100: PLATFORM_IDS.CENTER, // _L__
  0b1000: PLATFORM_IDS.CENTER, // T___
  0b0000: PLATFORM_IDS.CENTER, // ____ (no neighbors)
};

/**
 * Land concrete lookup - decision tree implementation
 *
 * The land concrete algorithm uses a cascading decision tree based on:
 * 1. Cardinal neighbors (priority) - indices 1, 3, 4, 6
 * 2. Diagonal neighbors (refinement) - indices 0, 2, 5, 7
 *
 * Returns concrete ID 0-12 based on the neighbor pattern.
 *
 * ID meanings:
 * | ID | Description |
 * |----|-------------|
 * | 0  | Center complete horizontal |
 * | 1  | Corner missing top-left |
 * | 2  | Bottom edge exposed |
 * | 3  | Top-right corner piece |
 * | 4  | Corner missing top-right |
 * | 5  | Right edge exposed |
 * | 6  | Top edge exposed |
 * | 7  | Left edge exposed |
 * | 8  | Corner missing bottom-right |
 * | 9  | Top-left corner piece |
 * | 10 | Bottom corner (isolated) |
 * | 11 | Corner missing bottom-left |
 * | 12 | Full concrete (all neighbors) |
 */
function getLandConcreteIdFromDecisionTree(cfg: ConcreteCfg): number {
  // Extract neighbor presence
  const topLeft = cfg[0];
  const top = cfg[1];
  const topRight = cfg[2];
  const left = cfg[3];
  const right = cfg[4];
  const bottomLeft = cfg[5];
  const bottom = cfg[6];
  const bottomRight = cfg[7];

  // Decision tree based on Concrete.pas:102-212
  if (top) {
    if (left) {
      if (right) {
        if (bottom) {
          // All 4 cardinals present - check diagonals for corner missing
          if (!topLeft) return 1;      // Missing top-left corner
          if (!topRight) return 4;     // Missing top-right corner
          if (!bottomRight) return 8;  // Missing bottom-right corner
          if (!bottomLeft) return 11;  // Missing bottom-left corner
          return CONCRETE_FULL;        // All 8 present
        } else {
          // Top, Left, Right present; Bottom missing
          if (!topLeft) return 6;      // Top edge, missing TL
          if (!topRight) return 6;     // Top edge, missing TR
          return 6;                     // Top edge exposed
        }
      } else {
        // Top, Left present; Right missing
        if (bottom) {
          if (!topLeft) return 5;      // Right edge, missing TL
          if (!bottomLeft) return 5;   // Right edge, missing BL
          return 5;                     // Right edge exposed
        } else {
          // Top, Left present; Right, Bottom missing = NW corner visually
          return 3;                     // NW corner piece (Conc4.bmp)
        }
      }
    } else {
      // Top present; Left missing
      if (right) {
        if (bottom) {
          if (!topRight) return 7;     // Left edge, missing TR
          if (!bottomRight) return 7;  // Left edge, missing BR
          return 7;                     // Left edge exposed
        } else {
          // Top, Right present; Left, Bottom missing
          return 9;                     // Top-left corner piece
        }
      } else {
        // Only Top present
        if (bottom) {
          return 0;                     // Vertical strip
        } else {
          return 10;                    // Isolated top
        }
      }
    }
  } else {
    // Top missing
    if (left) {
      if (right) {
        if (bottom) {
          if (!bottomLeft) return 0;   // North edge, missing BL (Conc1.bmp)
          if (!bottomRight) return 0;  // North edge, missing BR (Conc1.bmp)
          return 0;                     // North edge exposed (Conc1.bmp)
        } else {
          // Left, Right present; Top, Bottom missing
          return 0;                     // Horizontal strip
        }
      } else {
        // Left present; Top, Right missing = NE corner exposed
        if (bottom) {
          return 2;                     // NE corner piece (Conc3.bmp)
        } else {
          return 10;                    // Isolated left
        }
      }
    } else {
      // Top, Left missing
      if (right) {
        if (bottom) {
          return 10;                    // SE corner visually (Conc11.bmp)
        } else {
          return 10;                    // Isolated right
        }
      } else {
        // Right also missing
        if (bottom) {
          return 10;                    // Isolated bottom
        } else {
          return CONCRETE_FULL;         // Completely isolated - use full
        }
      }
    }
  }
}

// =============================================================================
// ROTATION TABLES
// =============================================================================

/**
 * Land concrete rotation table
 * [rotation][original_id] = rotated_id
 *
 * IDs 12 (full) and 15 (special) are rotation-invariant
 */
export const LAND_CONCRETE_ROTATION: readonly number[][] = [
  // Rotation.North (0 degrees - identity)
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  // Rotation.East (90 degrees clockwise)
  [0, 4, 5, 9, 8, 7, 2, 3, 11, 1, 10, 6, 12, 13, 14, 15],
  // Rotation.South (180 degrees)
  [0, 8, 7, 1, 11, 3, 5, 2, 4, 9, 10, 6, 12, 13, 14, 15],
  // Rotation.West (270 degrees)
  [0, 11, 3, 4, 1, 2, 7, 5, 9, 8, 10, 6, 12, 13, 14, 15]
] as const;

/**
 * Water concrete rotation table
 * Water platforms (IDs 0-8) have different rotation mapping
 */
export const WATER_CONCRETE_ROTATION: readonly number[][] = [
  // Rotation.North (identity)
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  // Rotation.East
  [0, 8, 3, 2, 7, 1, 4, 6, 5],
  // Rotation.South
  [0, 5, 7, 6, 3, 8, 2, 4, 1],
  // Rotation.West
  [0, 1, 6, 4, 2, 5, 7, 3, 8]
] as const;

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Build the 8-neighbor configuration array
 * Each element is true if that neighbor has concrete
 */
export function buildNeighborConfig(
  row: number,
  col: number,
  mapData: ConcreteMapData
): ConcreteCfg {
  const cfg: ConcreteCfg = [false, false, false, false, false, false, false, false];

  for (let i = 0; i < 8; i++) {
    const [di, dj] = NEIGHBOR_OFFSETS[i];
    const neighborRow = row + di;
    const neighborCol = col + dj;
    cfg[i] = mapData.hasConcrete(neighborRow, neighborCol);
  }

  return cfg;
}

/**
 * Calculate land concrete ID based on 8 neighbors
 * Returns ID 0-12
 */
export function getLandConcreteId(cfg: ConcreteCfg): number {
  return getLandConcreteIdFromDecisionTree(cfg);
}

/**
 * Calculate water platform concrete ID based on 4 cardinal neighbors
 * Returns the INI platform ID directly ($80-$88)
 */
export function getWaterConcreteId(cfg: ConcreteCfg): number {
  const top = cfg[CARDINAL_INDICES.TOP];
  const left = cfg[CARDINAL_INDICES.LEFT];
  const right = cfg[CARDINAL_INDICES.RIGHT];
  const bottom = cfg[CARDINAL_INDICES.BOTTOM];

  // Build 4-bit key: [top][left][right][bottom]
  const key = (top ? 8 : 0) | (left ? 4 : 0) | (right ? 2 : 0) | (bottom ? 1 : 0);

  // Lookup returns the actual INI platform ID directly
  return WATER_CONCRETE_LOOKUP[key] ?? PLATFORM_IDS.CENTER;
}

/**
 * Check if a tile is on water or adjacent to water (for water platform detection)
 * Water platforms extend from buildings over water, so edge tiles are on land but adjacent to water
 */
function isWaterPlatformTile(row: number, col: number, mapData: ConcreteMapData): boolean {
  // Check if tile itself is on water
  const landId = mapData.getLandId(row, col);
  if (landClassOf(landId) === LandClass.ZoneD) {
    return true;
  }

  // Check if any cardinal neighbor is on water (platform edge case)
  const neighbors = [
    [row - 1, col], // N (top)
    [row + 1, col], // S (bottom)
    [row, col - 1], // W (left)
    [row, col + 1]  // E (right)
  ];

  for (const [nRow, nCol] of neighbors) {
    const neighborLandId = mapData.getLandId(nRow, nCol);
    if (landClassOf(neighborLandId) === LandClass.ZoneD) {
      return true;
    }
  }

  return false;
}

/**
 * Main entry point: Calculate the concrete texture ID for a tile
 *
 * Decision flow:
 * 1. No concrete at tile → return CONCRETE_NONE
 * 2. Building exists AND not water platform → return CONCRETE_FULL (12)
 * 3. Water platform (on water OR adjacent to water) → use 4-cardinal lookup (plat*.bmp)
 * 4. Land zone → use 8-neighbor lookup, apply road/special flags
 *
 * @param row - Map row (i coordinate)
 * @param col - Map column (j coordinate)
 * @param mapData - Map data interface for querying tiles
 * @returns Concrete texture ID (0-15, or with flags, or CONCRETE_NONE)
 */
export function getConcreteId(
  row: number,
  col: number,
  mapData: ConcreteMapData
): number {
  // Step 1: Check if tile has concrete
  if (!mapData.hasConcrete(row, col)) {
    return CONCRETE_NONE;
  }

  const hasBuilding = mapData.hasBuilding(row, col);
  const hasRoad = mapData.hasRoad(row, col);

  // Step 2: Check if this is a water platform tile
  // Water platforms are tiles on water OR land tiles adjacent to water
  const isWaterPlatform = isWaterPlatformTile(row, col, mapData);

  // Step 3: Building on pure land (not near water) gets full concrete
  if (hasBuilding && !isWaterPlatform) {
    return CONCRETE_FULL;
  }

  // Step 4: Build neighbor configuration
  const cfg = buildNeighborConfig(row, col, mapData);

  // Step 5: Water platform - use cardinal-only lookup (plat*.bmp textures)
  // getWaterConcreteId returns the full INI platform ID ($80-$88) directly
  if (isWaterPlatform) {
    return getWaterConcreteId(cfg);
  }

  // Step 6: Land zone - use full 8-neighbor lookup
  let concreteId = getLandConcreteId(cfg);

  // Step 7: Apply road flag if road present and not full concrete
  if (hasRoad && concreteId < CONCRETE_FULL) {
    concreteId |= CONCRETE_ROAD_FLAG;
  }

  // Step 8: Check for special decorative concrete
  if (concreteId === CONCRETE_FULL &&
      !hasBuilding &&
      !hasRoad &&
      row % 2 === 0 &&
      col % 2 === 0) {
    return CONCRETE_SPECIAL;
  }

  return concreteId;
}

/**
 * Rotate a concrete ID based on map rotation
 * Preserves flags during rotation
 */
export function rotateConcreteId(id: number, rotation: Rotation): number {
  if (id === CONCRETE_NONE) return CONCRETE_NONE;
  if (rotation === Rotation.North) return id; // No rotation needed

  const isPlatform = (id & CONCRETE_PLATFORM_FLAG) !== 0;
  const baseId = id & CONCRETE_PLATFORM_MASK;
  const hasRoadFlag = (baseId & CONCRETE_ROAD_FLAG) !== 0;
  const pureId = baseId & 0x0F;

  let rotatedId: number;

  if (isPlatform) {
    // Water platform rotation
    if (pureId < WATER_CONCRETE_ROTATION[rotation].length) {
      rotatedId = WATER_CONCRETE_ROTATION[rotation][pureId] | CONCRETE_PLATFORM_FLAG;
    } else {
      rotatedId = id; // Unknown ID, don't rotate
    }
  } else {
    // Land concrete rotation
    if (pureId < LAND_CONCRETE_ROTATION[rotation].length) {
      rotatedId = LAND_CONCRETE_ROTATION[rotation][pureId];
      if (hasRoadFlag && rotatedId < CONCRETE_FULL) {
        rotatedId |= CONCRETE_ROAD_FLAG;
      }
    } else {
      rotatedId = id; // Unknown ID, don't rotate
    }
  }

  return rotatedId;
}

// =============================================================================
// CLASS MANAGER
// =============================================================================

/**
 * Concrete block class configuration (loaded from INI)
 */
export interface ConcreteBlockClassConfig {
  id: number;
  imagePath: string;
}

/**
 * Manages concrete block class configurations loaded from INI files
 * Mirrors the pattern used by RoadBlockClassManager
 */
export class ConcreteBlockClassManager {
  private classes: Map<number, ConcreteBlockClassConfig> = new Map();
  private basePath: string = '';

  /**
   * Set the base path for texture loading
   */
  setBasePath(path: string): void {
    this.basePath = path.endsWith('/') ? path : path + '/';
  }

  /**
   * Load a concrete block class from INI content
   */
  loadFromIni(iniContent: string): void {
    const config = loadConcreteBlockClassFromIni(iniContent);
    if (config.id !== CONCRETE_NONE) {
      this.classes.set(config.id, config);
    }
  }

  /**
   * Get concrete block class by ID
   */
  getClass(id: number): ConcreteBlockClassConfig | undefined {
    return this.classes.get(id);
  }

  /**
   * Get the image path for a concrete block ID
   * Returns the full path to the texture file
   */
  getImagePath(concreteBlockId: number): string | null {
    const config = this.classes.get(concreteBlockId);
    if (config && config.imagePath) {
      return this.basePath + 'ConcreteImages/' + config.imagePath;
    }
    return null;
  }

  /**
   * Get the image filename (without path) for a concrete block ID
   */
  getImageFilename(concreteBlockId: number): string | null {
    const config = this.classes.get(concreteBlockId);
    return config?.imagePath || null;
  }

  /**
   * Check if a concrete block class is loaded
   */
  hasClass(id: number): boolean {
    return this.classes.has(id);
  }

  /**
   * Get all loaded class IDs
   */
  getAllIds(): number[] {
    return Array.from(this.classes.keys());
  }

  /**
   * Get count of loaded classes
   */
  getClassCount(): number {
    return this.classes.size;
  }
}

/**
 * Parse concrete INI file content
 * Format matches road INI files:
 * [General]
 * Id = <decimal or $hex>
 * [Images]
 * 64X32 = <filename.bmp>
 */
export function loadConcreteBlockClassFromIni(iniContent: string): ConcreteBlockClassConfig {
  const sections = parseIniFile(iniContent);

  const general = sections.get('General') ?? new Map<string, string>();
  const images = sections.get('Images') ?? new Map<string, string>();

  const idStr = general.get('Id') ?? '';
  const id = parseDelphiInt(idStr, CONCRETE_NONE);

  // Try both cases for image path (64X32 or 64x32)
  const imagePath = images.get('64X32') ?? images.get('64x32') ?? '';

  return { id, imagePath };
}
