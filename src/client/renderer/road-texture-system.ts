/**
 * StarPeace Road Texture System
 * Converted from Delphi (Roads.pas, LocalCacheManager.pas, Map.pas, Land.pas)
 *
 * This module handles:
 * 1. Road topology determination (TRoadBlockId)
 * 2. Road type calculation (urban, rural, bridge, smooth)
 * 3. Texture loading from INI configuration
 */

// =============================================================================
// ENUMERATIONS & CONSTANTS
// =============================================================================

/**
 * Land class types - determines base terrain category
 */
export enum LandClass {
  ZoneA = 0,  // grass
  ZoneB = 1,  // midgrass
  ZoneC = 2,  // dryground
  ZoneD = 3   // water
}

/**
 * Land type - determines terrain edge/transition type
 */
export enum LandType {
  Center = 0,
  N = 1,
  E = 2,
  S = 3,
  W = 4,
  NEo = 5,  // outer corner NE
  SEo = 6,  // outer corner SE
  SWo = 7,  // outer corner SW
  NWo = 8,  // outer corner NW
  NEi = 9,  // inner corner NE
  SEi = 10, // inner corner SE
  SWi = 11, // inner corner SW
  NWi = 12, // inner corner NW
  Special = 13
}

/**
 * Road block topology identifiers
 * Determines the visual shape of the road segment
 */
export enum RoadBlockId {
  None = 0,
  NSRoadStart = 1,    // North-South road starting point
  NSRoadEnd = 2,      // North-South road ending point
  WERoadStart = 3,    // West-East road starting point
  WERoadEnd = 4,      // West-East road ending point
  NSRoad = 5,         // Straight North-South road
  WERoad = 6,         // Straight West-East road
  LeftPlug = 7,       // T-intersection with left plug
  RightPlug = 8,      // T-intersection with right plug
  TopPlug = 9,        // T-intersection with top plug
  BottomPlug = 10,    // T-intersection with bottom plug
  CornerW = 11,       // Corner turning West
  CornerS = 12,       // Corner turning South
  CornerN = 13,       // Corner turning North
  CornerE = 14,       // Corner turning East
  CrossRoads = 15     // Four-way intersection
}

/**
 * Map rotation directions
 */
export enum Rotation {
  North = 0,
  East = 1,
  South = 2,
  West = 3
}

// Road type constants (high byte of road block)
export const ROAD_TYPE = {
  LAND_ROAD: 0,         // Rural road on land
  URBAN_ROAD: 1,        // Urban road on concrete
  NORTH_BRIDGE: 2,      // Bridge facing North
  SOUTH_BRIDGE: 3,      // Bridge facing South
  EAST_BRIDGE: 4,       // Bridge facing East
  WEST_BRIDGE: 5,       // Bridge facing West
  FULL_BRIDGE: 6,       // Full bridge (center water)
  LEVEL_PASS: 7,        // Railroad level crossing (rural)
  URBAN_LEVEL_PASS: 8,  // Railroad level crossing (urban)
  SMOOTH_ROAD: 9,       // Smooth corner (rural)
  URBAN_SMOOTH_ROAD: 10 // Smooth corner (urban)
} as const;

// Bit masks for road block encoding
export const ROAD_TOP_ID_MASK = 0x00F;
export const HIGH_ROAD_ID_MASK = 0x0F0;
export const FREQ_ROAD = 0xF00;
export const LAND_TYPE_SHIFT = 4;
export const DUMMY_ROAD_MASK = 0x100;

// Land encoding constants
const LND_CLASS_SHIFT = 6;
const LND_TYPE_SHIFT = 2;
const LND_CLASS_MASK = 0xFF << LND_CLASS_SHIFT;
const LND_TYPE_MASK = (0xFF << LND_TYPE_SHIFT) & ~LND_CLASS_MASK;

// Special value for no road
export const ROAD_NONE = 0xFFFFFFFF;

// =============================================================================
// DIRECTIONAL BLOCK SETS
// =============================================================================

/** Blocks that point/connect towards the North */
export const NORTH_POINTING_BLOCKS: Set<RoadBlockId> = new Set([
  RoadBlockId.NSRoadEnd,
  RoadBlockId.NSRoad,
  RoadBlockId.LeftPlug,
  RoadBlockId.RightPlug,
  RoadBlockId.TopPlug,
  RoadBlockId.CornerS,
  RoadBlockId.CornerE,
  RoadBlockId.CrossRoads
]);

/** Blocks that point/connect towards the South */
export const SOUTH_POINTING_BLOCKS: Set<RoadBlockId> = new Set([
  RoadBlockId.NSRoadStart,
  RoadBlockId.NSRoad,
  RoadBlockId.LeftPlug,
  RoadBlockId.RightPlug,
  RoadBlockId.BottomPlug,
  RoadBlockId.CornerW,
  RoadBlockId.CornerN,
  RoadBlockId.CrossRoads
]);

/** Blocks that point/connect towards the East */
export const EAST_POINTING_BLOCKS: Set<RoadBlockId> = new Set([
  RoadBlockId.WERoadStart,
  RoadBlockId.WERoad,
  RoadBlockId.RightPlug,
  RoadBlockId.TopPlug,
  RoadBlockId.BottomPlug,
  RoadBlockId.CornerW,
  RoadBlockId.CornerS,
  RoadBlockId.CrossRoads
]);

/** Blocks that point/connect towards the West */
export const WEST_POINTING_BLOCKS: Set<RoadBlockId> = new Set([
  RoadBlockId.WERoadEnd,
  RoadBlockId.WERoad,
  RoadBlockId.LeftPlug,
  RoadBlockId.TopPlug,
  RoadBlockId.BottomPlug,
  RoadBlockId.CornerN,
  RoadBlockId.CornerE,
  RoadBlockId.CrossRoads
]);

// =============================================================================
// TOPOLOGY MAPPING TABLES
// =============================================================================

/**
 * NS Road Start mapping - determines resulting block when adding NS road start
 * Index: current block, Value: resulting block
 */
const NS_ROAD_START_MAPPINGS: RoadBlockId[] = [
  RoadBlockId.NSRoadStart,  // None -> NSRoadStart
  RoadBlockId.NSRoadStart,  // NSRoadStart -> NSRoadStart
  RoadBlockId.NSRoad,       // NSRoadEnd -> NSRoad
  RoadBlockId.CornerW,      // WERoadStart -> CornerW
  RoadBlockId.CornerN,      // WERoadEnd -> CornerN
  RoadBlockId.NSRoad,       // NSRoad -> NSRoad
  RoadBlockId.BottomPlug,   // WERoad -> BottomPlug
  RoadBlockId.LeftPlug,     // LeftPlug -> LeftPlug
  RoadBlockId.RightPlug,    // RightPlug -> RightPlug
  RoadBlockId.CrossRoads,   // TopPlug -> CrossRoads
  RoadBlockId.BottomPlug,   // BottomPlug -> BottomPlug
  RoadBlockId.CornerW,      // CornerW -> CornerW
  RoadBlockId.RightPlug,    // CornerS -> RightPlug
  RoadBlockId.CornerN,      // CornerN -> CornerN
  RoadBlockId.LeftPlug,     // CornerE -> LeftPlug
  RoadBlockId.CrossRoads    // CrossRoads -> CrossRoads
];

/**
 * NS Road Block mapping - middle section of NS road
 */
const NS_ROAD_BLOCK_MAPPINGS: RoadBlockId[] = [
  RoadBlockId.NSRoad,       // None -> NSRoad
  RoadBlockId.NSRoad,       // NSRoadStart -> NSRoad
  RoadBlockId.NSRoad,       // NSRoadEnd -> NSRoad
  RoadBlockId.RightPlug,    // WERoadStart -> RightPlug
  RoadBlockId.LeftPlug,     // WERoadEnd -> LeftPlug
  RoadBlockId.NSRoad,       // NSRoad -> NSRoad
  RoadBlockId.CrossRoads,   // WERoad -> CrossRoads
  RoadBlockId.LeftPlug,     // LeftPlug -> LeftPlug
  RoadBlockId.RightPlug,    // RightPlug -> RightPlug
  RoadBlockId.CrossRoads,   // TopPlug -> CrossRoads
  RoadBlockId.CrossRoads,   // BottomPlug -> CrossRoads
  RoadBlockId.RightPlug,    // CornerW -> RightPlug
  RoadBlockId.RightPlug,    // CornerS -> RightPlug
  RoadBlockId.LeftPlug,     // CornerN -> LeftPlug
  RoadBlockId.LeftPlug,     // CornerE -> LeftPlug
  RoadBlockId.CrossRoads    // CrossRoads -> CrossRoads
];

/**
 * NS Road End mapping
 */
const NS_ROAD_END_MAPPINGS: RoadBlockId[] = [
  RoadBlockId.NSRoadEnd,    // None -> NSRoadEnd
  RoadBlockId.NSRoad,       // NSRoadStart -> NSRoad
  RoadBlockId.NSRoadEnd,    // NSRoadEnd -> NSRoadEnd
  RoadBlockId.CornerS,      // WERoadStart -> CornerS
  RoadBlockId.CornerE,      // WERoadEnd -> CornerE
  RoadBlockId.NSRoad,       // NSRoad -> NSRoad
  RoadBlockId.TopPlug,      // WERoad -> TopPlug
  RoadBlockId.LeftPlug,     // LeftPlug -> LeftPlug
  RoadBlockId.RightPlug,    // RightPlug -> RightPlug
  RoadBlockId.TopPlug,      // TopPlug -> TopPlug
  RoadBlockId.CrossRoads,   // BottomPlug -> CrossRoads
  RoadBlockId.RightPlug,    // CornerW -> RightPlug
  RoadBlockId.CornerS,      // CornerS -> CornerS
  RoadBlockId.LeftPlug,     // CornerN -> LeftPlug
  RoadBlockId.CornerE,      // CornerE -> CornerE
  RoadBlockId.CrossRoads    // CrossRoads -> CrossRoads
];

/**
 * WE Road Start mapping
 */
const WE_ROAD_START_MAPPINGS: RoadBlockId[] = [
  RoadBlockId.WERoadStart,  // None -> WERoadStart
  RoadBlockId.CornerW,      // NSRoadStart -> CornerW
  RoadBlockId.CornerS,      // NSRoadEnd -> CornerS
  RoadBlockId.WERoadStart,  // WERoadStart -> WERoadStart
  RoadBlockId.WERoad,       // WERoadEnd -> WERoad
  RoadBlockId.RightPlug,    // NSRoad -> RightPlug
  RoadBlockId.WERoad,       // WERoad -> WERoad
  RoadBlockId.CrossRoads,   // LeftPlug -> CrossRoads
  RoadBlockId.RightPlug,    // RightPlug -> RightPlug
  RoadBlockId.TopPlug,      // TopPlug -> TopPlug
  RoadBlockId.BottomPlug,   // BottomPlug -> BottomPlug
  RoadBlockId.CornerW,      // CornerW -> CornerW
  RoadBlockId.CornerS,      // CornerS -> CornerS
  RoadBlockId.BottomPlug,   // CornerN -> BottomPlug
  RoadBlockId.TopPlug,      // CornerE -> TopPlug
  RoadBlockId.CrossRoads    // CrossRoads -> CrossRoads
];

/**
 * WE Road Block mapping
 */
const WE_ROAD_BLOCK_MAPPINGS: RoadBlockId[] = [
  RoadBlockId.WERoad,       // None -> WERoad
  RoadBlockId.BottomPlug,   // NSRoadStart -> BottomPlug
  RoadBlockId.TopPlug,      // NSRoadEnd -> TopPlug
  RoadBlockId.WERoad,       // WERoadStart -> WERoad
  RoadBlockId.WERoad,       // WERoadEnd -> WERoad
  RoadBlockId.CrossRoads,   // NSRoad -> CrossRoads
  RoadBlockId.WERoad,       // WERoad -> WERoad
  RoadBlockId.CrossRoads,   // LeftPlug -> CrossRoads
  RoadBlockId.CrossRoads,   // RightPlug -> CrossRoads
  RoadBlockId.TopPlug,      // TopPlug -> TopPlug
  RoadBlockId.BottomPlug,   // BottomPlug -> BottomPlug
  RoadBlockId.BottomPlug,   // CornerW -> BottomPlug
  RoadBlockId.TopPlug,      // CornerS -> TopPlug
  RoadBlockId.BottomPlug,   // CornerN -> BottomPlug
  RoadBlockId.TopPlug,      // CornerE -> TopPlug
  RoadBlockId.CrossRoads    // CrossRoads -> CrossRoads
];

/**
 * WE Road End mapping
 */
const WE_ROAD_END_MAPPINGS: RoadBlockId[] = [
  RoadBlockId.WERoadEnd,    // None -> WERoadEnd
  RoadBlockId.CornerN,      // NSRoadStart -> CornerN
  RoadBlockId.CornerE,      // NSRoadEnd -> CornerE
  RoadBlockId.WERoad,       // WERoadStart -> WERoad
  RoadBlockId.WERoadEnd,    // WERoadEnd -> WERoadEnd
  RoadBlockId.LeftPlug,     // NSRoad -> LeftPlug
  RoadBlockId.WERoad,       // WERoad -> WERoad
  RoadBlockId.LeftPlug,     // LeftPlug -> LeftPlug
  RoadBlockId.CrossRoads,   // RightPlug -> CrossRoads
  RoadBlockId.TopPlug,      // TopPlug -> TopPlug
  RoadBlockId.BottomPlug,   // BottomPlug -> BottomPlug
  RoadBlockId.BottomPlug,   // CornerW -> BottomPlug
  RoadBlockId.TopPlug,      // CornerS -> TopPlug
  RoadBlockId.CornerN,      // CornerN -> CornerN
  RoadBlockId.CornerE,      // CornerE -> CornerE
  RoadBlockId.CrossRoads    // CrossRoads -> CrossRoads
];

/**
 * Rotation mapping table for road topology IDs
 * [rotation][original block] = rotated block
 */
const ROTATED_ROAD_TOP_IDS: RoadBlockId[][] = [
  // drNorth (no rotation)
  [
    RoadBlockId.None, RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd,
    RoadBlockId.WERoadStart, RoadBlockId.WERoadEnd, RoadBlockId.NSRoad,
    RoadBlockId.WERoad, RoadBlockId.LeftPlug, RoadBlockId.RightPlug,
    RoadBlockId.TopPlug, RoadBlockId.BottomPlug, RoadBlockId.CornerW,
    RoadBlockId.CornerS, RoadBlockId.CornerN, RoadBlockId.CornerE,
    RoadBlockId.CrossRoads
  ],
  // drEast (90° clockwise)
  [
    RoadBlockId.None, RoadBlockId.WERoadStart, RoadBlockId.WERoadEnd,
    RoadBlockId.NSRoadEnd, RoadBlockId.NSRoadStart, RoadBlockId.WERoad,
    RoadBlockId.NSRoad, RoadBlockId.BottomPlug, RoadBlockId.TopPlug,
    RoadBlockId.LeftPlug, RoadBlockId.RightPlug, RoadBlockId.CornerS,
    RoadBlockId.CornerE, RoadBlockId.CornerW, RoadBlockId.CornerN,
    RoadBlockId.CrossRoads
  ],
  // drSouth (180°)
  [
    RoadBlockId.None, RoadBlockId.NSRoadEnd, RoadBlockId.NSRoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.WERoadStart, RoadBlockId.NSRoad,
    RoadBlockId.WERoad, RoadBlockId.RightPlug, RoadBlockId.LeftPlug,
    RoadBlockId.BottomPlug, RoadBlockId.TopPlug, RoadBlockId.CornerE,
    RoadBlockId.CornerN, RoadBlockId.CornerS, RoadBlockId.CornerW,
    RoadBlockId.CrossRoads
  ],
  // drWest (270° / 90° counter-clockwise)
  [
    RoadBlockId.None, RoadBlockId.WERoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoad,
    RoadBlockId.NSRoad, RoadBlockId.TopPlug, RoadBlockId.BottomPlug,
    RoadBlockId.RightPlug, RoadBlockId.LeftPlug, RoadBlockId.CornerN,
    RoadBlockId.CornerW, RoadBlockId.CornerE, RoadBlockId.CornerS,
    RoadBlockId.CrossRoads
  ]
];

/**
 * Valid road blocks per land type (for bridge validation on water)
 */
const VALID_ROAD_BLOCKS_BY_LAND_TYPE: Record<LandType, Set<RoadBlockId>> = {
  [LandType.Center]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad,
    RoadBlockId.LeftPlug, RoadBlockId.RightPlug, RoadBlockId.TopPlug,
    RoadBlockId.BottomPlug, RoadBlockId.CornerW, RoadBlockId.CornerS,
    RoadBlockId.CornerN, RoadBlockId.CornerE, RoadBlockId.CrossRoads
  ]),
  [LandType.N]: new Set([RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.NSRoad]),
  [LandType.E]: new Set([RoadBlockId.WERoadStart, RoadBlockId.WERoadEnd, RoadBlockId.WERoad]),
  [LandType.S]: new Set([RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.NSRoad]),
  [LandType.W]: new Set([RoadBlockId.WERoadStart, RoadBlockId.WERoadEnd, RoadBlockId.WERoad]),
  [LandType.NEo]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.SEo]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.SWo]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.NWo]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.NEi]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.SEi]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.SWi]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.NWi]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ]),
  [LandType.Special]: new Set([
    RoadBlockId.NSRoadStart, RoadBlockId.NSRoadEnd, RoadBlockId.WERoadStart,
    RoadBlockId.WERoadEnd, RoadBlockId.NSRoad, RoadBlockId.WERoad
  ])
};

/**
 * Invalid road block ID combinations (filtered out)
 */
const INVALID_ROAD_BLOCK_IDS: Set<number> = new Set([
  34, 35, 37, 38, 39, 42, 46, 50, 51, 53, 54, 56, 59,
  64, 65, 68, 80, 81, 84, 86, 89, 102, 109, 110
]);

// =============================================================================
// INTERFACES
// =============================================================================

export interface SegmentInfo {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SegmentReport {
  segmentCount: number;
  segments: SegmentInfo[];
}

export interface MapData {
  getLandId(row: number, col: number): number;
  hasConcrete(row: number, col: number): boolean;
  hasRailroad(row: number, col: number): boolean;
  getRoad(row: number, col: number): number;
}

export interface RoadBlockClass {
  id: number;
  imagePath: string;
  railingImgPath: string;
  frequency: number;
}

// =============================================================================
// LAND FUNCTIONS
// =============================================================================

/**
 * Extract land class from land ID
 */
export function landClassOf(landId: number): LandClass {
  return (landId & LND_CLASS_MASK) >> LND_CLASS_SHIFT;
}

/**
 * Extract land type from land ID
 */
export function landTypeOf(landId: number): LandType {
  const typeIdx = (landId & LND_TYPE_MASK) >> LND_TYPE_SHIFT;
  if (typeIdx < LandType.Special) {
    return typeIdx as LandType;
  }
  return LandType.Special;
}

/**
 * Check if land is water (ZoneD)
 */
export function isWater(landId: number): boolean {
  return landClassOf(landId) === LandClass.ZoneD;
}

// =============================================================================
// ROAD ID MANIPULATION FUNCTIONS
// =============================================================================

/**
 * Extract the topology ID from a road block value
 */
export function roadIdOf(roadblock: number): RoadBlockId {
  if (roadblock !== ROAD_NONE) {
    return ((roadblock & ROAD_TOP_ID_MASK) + 1) as RoadBlockId;
  }
  return RoadBlockId.None;
}

/**
 * Extract the high (type) portion of a road block ID
 */
export function highRoadIdOf(roadblock: number): number {
  return (roadblock & HIGH_ROAD_ID_MASK) >> 4;
}

/**
 * Combine topology ID and road type into a complete road block value
 */
export function makeRoadBlockOf(topId: RoadBlockId, highId: number): number {
  return (highId << 4) | (topId - 1);
}

/**
 * Check if road block is a bridge type
 */
export function isBridge(roadblock: number): boolean {
  const highId = highRoadIdOf(roadblock);
  return highId >= ROAD_TYPE.NORTH_BRIDGE && highId <= ROAD_TYPE.FULL_BRIDGE;
}

/**
 * Check if a road is horizontal (West-East)
 */
function isHorizontalRoad(topId: RoadBlockId): boolean {
  return topId === RoadBlockId.WERoad ||
         topId === RoadBlockId.WERoadStart ||
         topId === RoadBlockId.WERoadEnd;
}

// =============================================================================
// ROAD TYPE CALCULATION
// =============================================================================

/**
 * Calculate the complete road block ID including type
 * This is the main function for determining the final road texture
 *
 * @param topolId - Topology/shape ID (what type of intersection/segment)
 * @param landId - Land ID at this position
 * @param onConcrete - Is there concrete (urban) at this position
 * @param onRailroad - Is there a railroad crossing
 * @param isDummy - Is this a preview/ghost road
 * @returns Complete road block ID or ROAD_NONE
 */
export function roadBlockId(
  topolId: RoadBlockId,
  landId: number,
  onConcrete: boolean,
  onRailroad: boolean,
  isDummy: boolean
): number {
  if (topolId === RoadBlockId.None) {
    return ROAD_NONE;
  }

  const topolIdOrd = topolId - 1;
  const horizRoad = isHorizontalRoad(topolId);
  let result: number;

  // Check if on water (ZoneD) and not on concrete
  if (landClassOf(landId) === LandClass.ZoneD && !onConcrete) {
    const landType = landTypeOf(landId);

    // Determine bridge direction based on water edge type
    switch (landType) {
      case LandType.N:
        result = topolIdOrd | (ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.S:
        result = topolIdOrd | (ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.E:
        result = topolIdOrd | (ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.W:
        result = topolIdOrd | (ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.NEo:
        result = horizRoad
          ? topolIdOrd | (ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT)
          : topolIdOrd | (ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.SEo:
        result = horizRoad
          ? topolIdOrd | (ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT)
          : topolIdOrd | (ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.SWo:
        result = horizRoad
          ? topolIdOrd | (ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT)
          : topolIdOrd | (ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.NWo:
        result = horizRoad
          ? topolIdOrd | (ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT)
          : topolIdOrd | (ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT);
        break;
      case LandType.Center:
      case LandType.NEi:
      case LandType.SEi:
      case LandType.SWi:
      case LandType.NWi:
        result = topolIdOrd | (ROAD_TYPE.FULL_BRIDGE << LAND_TYPE_SHIFT);
        break;
      default:
        result = topolIdOrd;
    }
  } else {
    // Land road or urban road
    if (onConcrete) {
      if (onRailroad) {
        result = topolIdOrd | (ROAD_TYPE.URBAN_LEVEL_PASS << LAND_TYPE_SHIFT);
      } else {
        result = topolIdOrd | (ROAD_TYPE.URBAN_ROAD << LAND_TYPE_SHIFT);
      }
    } else {
      if (onRailroad) {
        result = topolIdOrd | (ROAD_TYPE.LEVEL_PASS << LAND_TYPE_SHIFT);
      } else {
        result = topolIdOrd;
      }
    }
  }

  // Mark as dummy if needed
  if (isDummy) {
    result = result | DUMMY_ROAD_MASK;
  }

  // Filter invalid combinations
  if (INVALID_ROAD_BLOCK_IDS.has(result)) {
    return ROAD_NONE;
  }

  // Special case handling for specific IDs
  if (result === 86) {
    return 0x16; // Map 86 to 0x16
  }

  return result;
}

// =============================================================================
// SMOOTH CORNER DETECTION
// =============================================================================

/**
 * Detect if a corner should use smooth textures
 * Smooth corners are used when a corner is NOT adjacent to an opposite corner
 */
export function detectSmoothCorner(
  row: number,
  col: number,
  renderedRoads: RoadBlockId[][],
  getRoadIdAt: (r: number, c: number) => RoadBlockId,
  hasConcrete: (r: number, c: number) => boolean
): { isSmooth: boolean; roadBlock: number } {
  const currentBlock = renderedRoads[row]?.[col] ?? RoadBlockId.None;

  // Get adjacent blocks (use rendered if available, otherwise query map)
  const getBlock = (r: number, c: number): RoadBlockId => {
    if (renderedRoads[r]?.[c] !== undefined) {
      return renderedRoads[r][c];
    }
    return getRoadIdAt(r, c);
  };

  const uBlock = getBlock(row + 1, col);
  const dBlock = getBlock(row - 1, col);
  const rBlock = getBlock(row, col + 1);
  const lBlock = getBlock(row, col - 1);

  let isSmooth = false;

  switch (currentBlock) {
    case RoadBlockId.CornerW:
      isSmooth = dBlock !== RoadBlockId.CornerE && rBlock !== RoadBlockId.CornerE;
      break;
    case RoadBlockId.CornerS:
      isSmooth = uBlock !== RoadBlockId.CornerN && rBlock !== RoadBlockId.CornerN;
      break;
    case RoadBlockId.CornerN:
      isSmooth = dBlock !== RoadBlockId.CornerS && lBlock !== RoadBlockId.CornerS;
      break;
    case RoadBlockId.CornerE:
      isSmooth = uBlock !== RoadBlockId.CornerW && lBlock !== RoadBlockId.CornerW;
      break;
  }

  if (isSmooth) {
    const roadType = hasConcrete(row, col)
      ? ROAD_TYPE.URBAN_SMOOTH_ROAD
      : ROAD_TYPE.SMOOTH_ROAD;
    return {
      isSmooth: true,
      roadBlock: makeRoadBlockOf(currentBlock, roadType)
    };
  }

  return { isSmooth: false, roadBlock: ROAD_NONE };
}

// =============================================================================
// ROAD ROTATION
// =============================================================================

/**
 * Rotate a road block ID by the specified rotation
 */
export function rotateRoadBlockId(id: number, rotation: Rotation): number {
  const topId = roadIdOf(id);
  let highId = highRoadIdOf(id);

  // Rotate bridge direction
  switch (highId) {
    case ROAD_TYPE.NORTH_BRIDGE:
      switch (rotation) {
        case Rotation.East: highId = ROAD_TYPE.WEST_BRIDGE; break;
        case Rotation.South: highId = ROAD_TYPE.SOUTH_BRIDGE; break;
        case Rotation.West: highId = ROAD_TYPE.EAST_BRIDGE; break;
      }
      break;
    case ROAD_TYPE.SOUTH_BRIDGE:
      switch (rotation) {
        case Rotation.East: highId = ROAD_TYPE.EAST_BRIDGE; break;
        case Rotation.South: highId = ROAD_TYPE.NORTH_BRIDGE; break;
        case Rotation.West: highId = ROAD_TYPE.WEST_BRIDGE; break;
      }
      break;
    case ROAD_TYPE.EAST_BRIDGE:
      switch (rotation) {
        case Rotation.East: highId = ROAD_TYPE.NORTH_BRIDGE; break;
        case Rotation.South: highId = ROAD_TYPE.WEST_BRIDGE; break;
        case Rotation.West: highId = ROAD_TYPE.SOUTH_BRIDGE; break;
      }
      break;
    case ROAD_TYPE.WEST_BRIDGE:
      switch (rotation) {
        case Rotation.East: highId = ROAD_TYPE.SOUTH_BRIDGE; break;
        case Rotation.South: highId = ROAD_TYPE.EAST_BRIDGE; break;
        case Rotation.West: highId = ROAD_TYPE.NORTH_BRIDGE; break;
      }
      break;
  }

  // Rotate topology
  const rotatedTopId = ROTATED_ROAD_TOP_IDS[rotation][topId];
  return makeRoadBlockOf(rotatedTopId, highId);
}

// =============================================================================
// SEGMENT RENDERING - TOPOLOGY DETERMINATION
// =============================================================================

/**
 * Roads rendering buffer for tracking topology during segment rendering
 */
export class RoadsRendering {
  private roadIds: RoadBlockId[][];
  private top: number;
  private left: number;
  private width: number;
  private height: number;

  constructor(top: number, left: number, width: number, height: number) {
    this.top = top;
    this.left = left;
    this.width = width;
    this.height = height;
    this.roadIds = [];

    // Initialize with None
    for (let i = 0; i < height; i++) {
      this.roadIds[i] = new Array(width).fill(RoadBlockId.None);
    }
  }

  private isValidAddress(row: number, col: number): boolean {
    return row >= this.top && row < this.top + this.height &&
           col >= this.left && col < this.left + this.width;
  }

  get(row: number, col: number): RoadBlockId {
    if (this.isValidAddress(row, col)) {
      return this.roadIds[row - this.top][col - this.left];
    }
    return RoadBlockId.None;
  }

  set(row: number, col: number, value: RoadBlockId): void {
    if (this.isValidAddress(row, col)) {
      this.roadIds[row - this.top][col - this.left] = value;
    }
  }

  getAll(): RoadBlockId[][] {
    return this.roadIds;
  }
}

/**
 * Render a single road segment into the rendering buffer
 * This determines the topology (shape) of each road cell
 */
export function renderRoadSegment(
  rendering: RoadsRendering,
  segment: SegmentInfo
): void {
  const { x1, y1, x2, y2 } = segment;

  // Vertical segment (NS)
  if (x1 === x2) {
    const x = x1;
    let ymin = y1;
    let ymax = y2;

    if (ymin > ymax) {
      ymin = y2;
      ymax = y1;
    }

    // Start of NS road
    let y = ymin;
    rendering.set(y, x, NS_ROAD_END_MAPPINGS[rendering.get(y, x)]);
    y++;

    // Middle sections
    while (y < ymax) {
      rendering.set(y, x, NS_ROAD_BLOCK_MAPPINGS[rendering.get(y, x)]);
      y++;
    }

    // End of NS road
    if (y === ymax) {
      rendering.set(y, x, NS_ROAD_START_MAPPINGS[rendering.get(y, x)]);
    }
  }
  // Horizontal segment (WE)
  else if (y1 === y2) {
    const y = y1;
    let xmin = x1;
    let xmax = x2;

    if (xmin > xmax) {
      xmin = x2;
      xmax = x1;
    }

    // Start of WE road
    let x = xmin;
    rendering.set(y, x, WE_ROAD_START_MAPPINGS[rendering.get(y, x)]);
    x++;

    // Middle sections
    while (x < xmax) {
      rendering.set(y, x, WE_ROAD_BLOCK_MAPPINGS[rendering.get(y, x)]);
      x++;
    }

    // End of WE road
    if (x === xmax) {
      rendering.set(y, x, WE_ROAD_END_MAPPINGS[rendering.get(y, x)]);
    }
  }
}

/**
 * Render all road segments from a segment report
 */
export function renderRoadSegments(
  segmentsReport: SegmentReport,
  left: number,
  top: number,
  width: number,
  height: number
): RoadsRendering {
  const rendering = new RoadsRendering(top, left, width, height);

  for (let i = 0; i < segmentsReport.segmentCount; i++) {
    renderRoadSegment(rendering, segmentsReport.segments[i]);
  }

  return rendering;
}

// =============================================================================
// ROAD BLOCK VALIDATION
// =============================================================================

/**
 * Validate that a road block ID is valid for the given land type
 * Used primarily for bridge validation on water
 */
export function validateRoadId(
  row: number,
  col: number,
  roadBlockId: RoadBlockId,
  landId: number,
  hasConcrete: boolean
): RoadBlockId {
  // Only validate on water without concrete
  if (landClassOf(landId) === LandClass.ZoneD && !hasConcrete) {
    const landType = landTypeOf(landId);
    const validBlocks = VALID_ROAD_BLOCKS_BY_LAND_TYPE[landType];

    if (!validBlocks.has(roadBlockId)) {
      return RoadBlockId.None;
    }
  }
  return roadBlockId;
}

// =============================================================================
// INI CONFIGURATION LOADING
// =============================================================================

/**
 * Parse INI file content into key-value sections
 */
export function parseIniFile(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let currentSection = '';
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      continue;
    }

    // Section header
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, new Map());
      }
      continue;
    }

    // Key=Value pair
    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch && currentSection) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      sections.get(currentSection)!.set(key, value);
    }
  }

  return sections;
}

/**
 * Road block class loaded from INI file
 */
export interface RoadBlockClassConfig {
  id: number;
  imagePath: string;
  railingImagePath: string;
  frequency: number;
}

/**
 * Parse a Delphi-style integer that may be decimal or hex ($XX)
 * Examples: "5" -> 5, "$15" -> 21, "$65" -> 101
 */
function parseDelphiInt(value: string, defaultValue: number = 0): number {
  if (!value) return defaultValue;
  const trimmed = value.trim();
  if (trimmed.startsWith('$')) {
    // Delphi hexadecimal format: $XX
    return parseInt(trimmed.substring(1), 16);
  }
  return parseInt(trimmed, 10);
}

/**
 * Load road block class configuration from INI content
 *
 * Expected INI format:
 * [General]
 * Id=<number> or Id=$<hex>  (Delphi-style hex)
 * Freq=<number>
 *
 * [Images]
 * 64x32=<path to road texture>
 * Railing64x32=<path to railing texture for bridges>
 */
export function loadRoadBlockClassFromIni(iniContent: string): RoadBlockClassConfig {
  const sections = parseIniFile(iniContent);

  const general = sections.get('General') ?? new Map();
  const images = sections.get('Images') ?? new Map();

  return {
    id: parseDelphiInt(general.get('Id') ?? '', 255),
    imagePath: images.get('64x32') ?? '',
    railingImagePath: images.get('Railing64x32') ?? '',
    frequency: parseDelphiInt(general.get('Freq') ?? '', 1)
  };
}

/**
 * Road block class storage
 */
export class RoadBlockClassManager {
  private classes: Map<number, RoadBlockClassConfig> = new Map();
  private basePath: string = '';

  setBasePath(path: string): void {
    this.basePath = path.endsWith('/') ? path : path + '/';
  }

  /**
   * Load a road block class from INI content
   */
  loadFromIni(iniContent: string): void {
    const config = loadRoadBlockClassFromIni(iniContent);
    this.classes.set(config.id, config);
  }

  /**
   * Get road block class by ID
   */
  getClass(id: number): RoadBlockClassConfig | undefined {
    return this.classes.get(id);
  }

  /**
   * Get the image path for a road block ID
   */
  getImagePath(roadBlockId: number): string | null {
    const config = this.classes.get(roadBlockId);
    if (config && config.imagePath) {
      return this.basePath + 'RoadBlockImages/' + config.imagePath;
    }
    return null;
  }

  /**
   * Get the railing image path for a road block ID (for bridges)
   */
  getRailingImagePath(roadBlockId: number): string | null {
    const config = this.classes.get(roadBlockId);
    if (config && config.railingImagePath) {
      return this.basePath + 'RoadBlockImages/' + config.railingImagePath;
    }
    return null;
  }
}

// =============================================================================
// COMPLETE ROAD TEXTURE RESOLUTION
// =============================================================================

/**
 * Complete road texture resolution system
 * Combines topology determination, type calculation, and texture lookup
 */
export class RoadTextureResolver {
  private classManager: RoadBlockClassManager;

  constructor(classManager: RoadBlockClassManager) {
    this.classManager = classManager;
  }

  /**
   * Resolve the final texture path for a road at a given position
   *
   * @param row - Map row
   * @param col - Map column
   * @param renderedRoads - Pre-rendered topology data
   * @param mapData - Map data interface for querying land, concrete, railroad
   * @returns Texture path or null if no road
   */
  resolveTexture(
    row: number,
    col: number,
    renderedRoads: RoadsRendering,
    mapData: MapData
  ): { texturePath: string | null; railingPath: string | null; roadBlockId: number } {
    // Get topology from rendered roads
    const topology = renderedRoads.get(row, col);

    if (topology === RoadBlockId.None) {
      return { texturePath: null, railingPath: null, roadBlockId: ROAD_NONE };
    }

    // Check for smooth corner
    const smoothResult = detectSmoothCorner(
      row, col,
      renderedRoads.getAll(),
      (r, c) => roadIdOf(mapData.getRoad(r, c)),
      (r, c) => mapData.hasConcrete(r, c)
    );

    let finalRoadBlockId: number;

    if (smoothResult.isSmooth) {
      finalRoadBlockId = smoothResult.roadBlock;
    } else {
      // Calculate full road block ID with type
      const landId = mapData.getLandId(row, col);
      const onConcrete = mapData.hasConcrete(row, col);
      const onRailroad = mapData.hasRailroad(row, col);

      finalRoadBlockId = roadBlockId(
        topology,
        landId,
        onConcrete,
        onRailroad,
        false
      );
    }

    if (finalRoadBlockId === ROAD_NONE) {
      return { texturePath: null, railingPath: null, roadBlockId: ROAD_NONE };
    }

    // Get texture paths
    const texturePath = this.classManager.getImagePath(finalRoadBlockId);
    const railingPath = isBridge(finalRoadBlockId)
      ? this.classManager.getRailingImagePath(finalRoadBlockId)
      : null;

    return {
      texturePath,
      railingPath,
      roadBlockId: finalRoadBlockId
    };
  }
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export {
  NS_ROAD_START_MAPPINGS,
  NS_ROAD_BLOCK_MAPPINGS,
  NS_ROAD_END_MAPPINGS,
  WE_ROAD_START_MAPPINGS,
  WE_ROAD_BLOCK_MAPPINGS,
  WE_ROAD_END_MAPPINGS,
  ROTATED_ROAD_TOP_IDS,
  VALID_ROAD_BLOCKS_BY_LAND_TYPE,
  INVALID_ROAD_BLOCK_IDS
};
