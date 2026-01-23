/**
 * Road Topology Analyzer
 *
 * Implements the official client's road rendering algorithm with:
 * - 16 topology types (segment endpoints, middles, junctions)
 * - 11 surface types (land, urban, bridges, smooth corners)
 * - State transition tables for topology detection
 *
 * Based on reverse-engineered data from Roads.pas (official Delphi client)
 * See: doc/road_rendering_reference_data.md
 */

/**
 * Road topology types (16 total)
 * Represents the connectivity pattern of a road segment
 */
export enum RoadTopology {
  NONE = 0,           // No road

  // North-South roads
  NS_START = 1,       // Start of N-S road
  NS_END = 2,         // End of N-S road
  NS_MIDDLE = 3,      // Middle of N-S road

  // West-East roads
  WE_START = 4,       // Start of W-E road
  WE_END = 5,         // End of W-E road
  WE_MIDDLE = 6,      // Middle of W-E road

  // NorthWest-SouthEast diagonal roads
  NWSE_START = 7,     // Start of NW-SE road
  NWSE_END = 8,       // End of NW-SE road
  NWSE_MIDDLE = 9,    // Middle of NW-SE road

  // NorthEast-SouthWest diagonal roads
  NESW_START = 10,    // Start of NE-SW road
  NESW_END = 11,      // End of NE-SW road
  NESW_MIDDLE = 12,   // Middle of NE-SW road

  // Junctions
  TCROSS = 13,        // T-junction (3 connections)
  XCROSS = 14,        // X-junction (4-way intersection)
  TWOCROSS = 15,      // Two-way junction (corner)
}

/**
 * Road surface types (11 total, excluding LEVEL_CROSSING - railroad not implemented)
 * Determines the visual appearance of the road
 */
export enum RoadSurface {
  LAND = 0,                  // Regular land road
  URBAN = 1,                 // Urban/concrete road

  // Bridge over water (9 types based on water direction)
  BRIDGE_WATER_CENTER = 2,   // Water on all sides
  BRIDGE_WATER_N = 3,        // Water to North
  BRIDGE_WATER_E = 4,        // Water to East
  BRIDGE_WATER_NE = 5,       // Water to NorthEast
  BRIDGE_WATER_S = 6,        // Water to South
  BRIDGE_WATER_SW = 7,       // Water to SouthWest
  BRIDGE_WATER_W = 8,        // Water to West
  BRIDGE_WATER_SE = 9,       // Water to SouthEast
  BRIDGE_WATER_NW = 10,      // Water to NorthWest

  // LEVEL_CROSSING = 11,    // Railroad crossing (NOT IMPLEMENTED - excluded)

  SMOOTH = 12,               // Smooth corner transition
}

/**
 * Connection bitmask for 4 neighbors (N, E, S, W)
 * Bit 0 (1) = North, Bit 1 (2) = East, Bit 2 (4) = South, Bit 3 (8) = West
 */
export type ConnectionIndex = number; // 0-15

/**
 * Transition table: ConnectionIndex -> Next Topology
 * 6 tables total (one per start/end/middle state of NS and WE)
 */
type TransitionTable = Record<ConnectionIndex, RoadTopology>;

/**
 * State transition tables for topology detection
 * Based on Roads.pas transition logic
 */
export class RoadTransitionTables {
  /**
   * Table for TOPO_NS_START transitions
   * Index: 4-bit connection mask (NESW)
   * Value: Next topology to transition to
   */
  static readonly NS_START: TransitionTable = {
    0:  RoadTopology.NONE,        // No connections
    1:  RoadTopology.NS_END,      // N only → End
    2:  RoadTopology.TWOCROSS,    // E only → Corner
    3:  RoadTopology.TCROSS,      // NE → T-junction
    4:  RoadTopology.NS_START,    // S only → Stay at start
    5:  RoadTopology.NS_MIDDLE,   // NS → Middle
    6:  RoadTopology.TCROSS,      // ES → T-junction
    7:  RoadTopology.TCROSS,      // NES → T-junction
    8:  RoadTopology.TWOCROSS,    // W only → Corner
    9:  RoadTopology.TCROSS,      // NW → T-junction
    10: RoadTopology.WE_MIDDLE,   // EW → WE middle
    11: RoadTopology.TCROSS,      // NEW → T-junction
    12: RoadTopology.TCROSS,      // SW → T-junction
    13: RoadTopology.TCROSS,      // NSW → T-junction
    14: RoadTopology.TCROSS,      // ESW → T-junction
    15: RoadTopology.XCROSS,      // NESW → X-junction
  };

  /**
   * Table for TOPO_NS_END transitions
   */
  static readonly NS_END: TransitionTable = {
    0:  RoadTopology.NONE,
    1:  RoadTopology.NS_END,      // N only → Stay at end
    2:  RoadTopology.TWOCROSS,    // E only → Corner
    3:  RoadTopology.TCROSS,      // NE → T-junction
    4:  RoadTopology.NS_START,    // S only → Start
    5:  RoadTopology.NS_MIDDLE,   // NS → Middle
    6:  RoadTopology.TCROSS,      // ES → T-junction
    7:  RoadTopology.TCROSS,      // NES → T-junction
    8:  RoadTopology.TWOCROSS,    // W only → Corner
    9:  RoadTopology.TCROSS,      // NW → T-junction
    10: RoadTopology.WE_MIDDLE,   // EW → WE middle
    11: RoadTopology.TCROSS,      // NEW → T-junction
    12: RoadTopology.TCROSS,      // SW → T-junction
    13: RoadTopology.TCROSS,      // NSW → T-junction
    14: RoadTopology.TCROSS,      // ESW → T-junction
    15: RoadTopology.XCROSS,      // NESW → X-junction
  };

  /**
   * Table for TOPO_NS_MIDDLE transitions
   */
  static readonly NS_MIDDLE: TransitionTable = {
    0:  RoadTopology.NONE,
    1:  RoadTopology.NS_END,      // N only → End
    2:  RoadTopology.TWOCROSS,    // E only → Corner
    3:  RoadTopology.TCROSS,      // NE → T-junction
    4:  RoadTopology.NS_START,    // S only → Start
    5:  RoadTopology.NS_MIDDLE,   // NS → Stay at middle
    6:  RoadTopology.TCROSS,      // ES → T-junction
    7:  RoadTopology.TCROSS,      // NES → T-junction
    8:  RoadTopology.TWOCROSS,    // W only → Corner
    9:  RoadTopology.TCROSS,      // NW → T-junction
    10: RoadTopology.WE_MIDDLE,   // EW → WE middle
    11: RoadTopology.TCROSS,      // NEW → T-junction
    12: RoadTopology.TCROSS,      // SW → T-junction
    13: RoadTopology.TCROSS,      // NSW → T-junction
    14: RoadTopology.TCROSS,      // ESW → T-junction
    15: RoadTopology.XCROSS,      // NESW → X-junction
  };

  /**
   * Table for TOPO_WE_START transitions
   */
  static readonly WE_START: TransitionTable = {
    0:  RoadTopology.NONE,
    1:  RoadTopology.TWOCROSS,    // N only → Corner
    2:  RoadTopology.WE_END,      // E only → End
    3:  RoadTopology.TCROSS,      // NE → T-junction
    4:  RoadTopology.TWOCROSS,    // S only → Corner
    5:  RoadTopology.NS_MIDDLE,   // NS → NS middle
    6:  RoadTopology.TCROSS,      // ES → T-junction
    7:  RoadTopology.TCROSS,      // NES → T-junction
    8:  RoadTopology.WE_START,    // W only → Stay at start
    9:  RoadTopology.TCROSS,      // NW → T-junction
    10: RoadTopology.WE_MIDDLE,   // EW → Middle
    11: RoadTopology.TCROSS,      // NEW → T-junction
    12: RoadTopology.TCROSS,      // SW → T-junction
    13: RoadTopology.TCROSS,      // NSW → T-junction
    14: RoadTopology.TCROSS,      // ESW → T-junction
    15: RoadTopology.XCROSS,      // NESW → X-junction
  };

  /**
   * Table for TOPO_WE_END transitions
   */
  static readonly WE_END: TransitionTable = {
    0:  RoadTopology.NONE,
    1:  RoadTopology.TWOCROSS,    // N only → Corner
    2:  RoadTopology.WE_END,      // E only → Stay at end
    3:  RoadTopology.TCROSS,      // NE → T-junction
    4:  RoadTopology.TWOCROSS,    // S only → Corner
    5:  RoadTopology.NS_MIDDLE,   // NS → NS middle
    6:  RoadTopology.TCROSS,      // ES → T-junction
    7:  RoadTopology.TCROSS,      // NES → T-junction
    8:  RoadTopology.WE_START,    // W only → Start
    9:  RoadTopology.TCROSS,      // NW → T-junction
    10: RoadTopology.WE_MIDDLE,   // EW → Middle
    11: RoadTopology.TCROSS,      // NEW → T-junction
    12: RoadTopology.TCROSS,      // SW → T-junction
    13: RoadTopology.TCROSS,      // NSW → T-junction
    14: RoadTopology.TCROSS,      // ESW → T-junction
    15: RoadTopology.XCROSS,      // NESW → X-junction
  };

  /**
   * Table for TOPO_WE_MIDDLE transitions
   */
  static readonly WE_MIDDLE: TransitionTable = {
    0:  RoadTopology.NONE,
    1:  RoadTopology.TWOCROSS,    // N only → Corner
    2:  RoadTopology.WE_END,      // E only → End
    3:  RoadTopology.TCROSS,      // NE → T-junction
    4:  RoadTopology.TWOCROSS,    // S only → Corner
    5:  RoadTopology.NS_MIDDLE,   // NS → NS middle
    6:  RoadTopology.TCROSS,      // ES → T-junction
    7:  RoadTopology.TCROSS,      // NES → T-junction
    8:  RoadTopology.WE_START,    // W only → Start
    9:  RoadTopology.TCROSS,      // NW → T-junction
    10: RoadTopology.WE_MIDDLE,   // EW → Stay at middle
    11: RoadTopology.TCROSS,      // NEW → T-junction
    12: RoadTopology.TCROSS,      // SW → T-junction
    13: RoadTopology.TCROSS,      // NSW → T-junction
    14: RoadTopology.TCROSS,      // ESW → T-junction
    15: RoadTopology.XCROSS,      // NESW → X-junction
  };

  /**
   * Get the appropriate transition table for a given topology
   */
  static getTable(topology: RoadTopology): TransitionTable | null {
    switch (topology) {
      case RoadTopology.NS_START:  return this.NS_START;
      case RoadTopology.NS_END:    return this.NS_END;
      case RoadTopology.NS_MIDDLE: return this.NS_MIDDLE;
      case RoadTopology.WE_START:  return this.WE_START;
      case RoadTopology.WE_END:    return this.WE_END;
      case RoadTopology.WE_MIDDLE: return this.WE_MIDDLE;
      default: return null; // No transition table for junctions or diagonal roads
    }
  }
}

/**
 * Analyzes road segments to determine topology and surface types
 */
export class RoadTopologyAnalyzer {
  /**
   * Calculate connection index from 4 neighbors
   * Bit 0 = North, Bit 1 = East, Bit 2 = South, Bit 3 = West
   */
  static getConnectionIndex(hasNorth: boolean, hasEast: boolean, hasSouth: boolean, hasWest: boolean): ConnectionIndex {
    return (
      (hasNorth ? 1 : 0) |
      (hasEast  ? 2 : 0) |
      (hasSouth ? 4 : 0) |
      (hasWest  ? 8 : 0)
    );
  }

  /**
   * Detect topology for a road tile given its current topology and neighbors
   * Uses state transition tables to determine next topology
   */
  static detectTopology(
    currentTopology: RoadTopology,
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): RoadTopology {
    const connectionIndex = this.getConnectionIndex(hasNorth, hasEast, hasSouth, hasWest);

    // Get transition table for current topology
    const table = RoadTransitionTables.getTable(currentTopology);

    if (table) {
      // Use transition table
      return table[connectionIndex];
    } else {
      // No transition table - handle junctions and diagonal roads
      // For now, use simple connection-based logic (will expand in Phase 3)
      const count = [hasNorth, hasEast, hasSouth, hasWest].filter(Boolean).length;

      if (count === 4) return RoadTopology.XCROSS;
      if (count === 3) return RoadTopology.TCROSS;
      if (count === 2) {
        if (hasNorth && hasSouth) return RoadTopology.NS_MIDDLE;
        if (hasEast && hasWest) return RoadTopology.WE_MIDDLE;
        return RoadTopology.TWOCROSS;
      }
      if (count === 1) {
        if (hasNorth) return RoadTopology.NS_END;
        if (hasSouth) return RoadTopology.NS_START;
        if (hasEast) return RoadTopology.WE_END;
        if (hasWest) return RoadTopology.WE_START;
      }

      return RoadTopology.NONE;
    }
  }

  /**
   * Initialize topology for a new road tile (first time detection)
   * Uses connection pattern to determine initial state
   */
  static initializeTopology(
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): RoadTopology {
    const connectionIndex = this.getConnectionIndex(hasNorth, hasEast, hasSouth, hasWest);
    const count = [hasNorth, hasEast, hasSouth, hasWest].filter(Boolean).length;

    if (count === 4) return RoadTopology.XCROSS;
    if (count === 3) return RoadTopology.TCROSS;

    if (count === 2) {
      if (hasNorth && hasSouth) return RoadTopology.NS_MIDDLE;
      if (hasEast && hasWest) return RoadTopology.WE_MIDDLE;
      return RoadTopology.TWOCROSS;
    }

    if (count === 1) {
      // Single connection - start of a road
      if (hasNorth) return RoadTopology.NS_END;
      if (hasSouth) return RoadTopology.NS_START;
      if (hasEast) return RoadTopology.WE_END;
      if (hasWest) return RoadTopology.WE_START;
    }

    // No connections - isolated road tile, default to horizontal start
    return RoadTopology.WE_START;
  }

  /**
   * Encode topology and surface into texture ID
   * TextureID = (topology - 1) | (surface << 4)
   *
   * Note: NONE topology should never be encoded (no road tile exists).
   * Valid texture IDs start from 0 (NS_START + LAND).
   */
  static encodeTextureId(topology: RoadTopology, surface: RoadSurface): number {
    if (topology === RoadTopology.NONE) {
      throw new Error('Cannot encode NONE topology - no road tile exists');
    }
    return (topology - 1) | (surface << 4);
  }

  /**
   * Decode texture ID into topology and surface
   *
   * Note: TextureID 0 represents NS_START + LAND (first valid road texture).
   * NONE topology is never encoded (tiles without roads don't have textures).
   */
  static decodeTextureId(textureId: number): { topology: RoadTopology; surface: RoadSurface } {
    const topology = (textureId & 0x0F) + 1 as RoadTopology;
    const surface = (textureId >> 4) & 0x0F as RoadSurface;

    return { topology, surface };
  }
}
