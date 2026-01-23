/**
 * Road Texture Mapper
 *
 * Maps (topology, surface) pairs to road texture filenames
 * Based on official client's texture naming convention
 *
 * Texture naming pattern:
 * - Base roads: Road{type}.bmp (e.g., Roadhorz.bmp, Roadvert.bmp)
 * - Corners: RoadcornerN/E/S/W.bmp
 * - T-junctions: RoadTN/TE/TS/TW.bmp
 * - Intersections: Roadcross.bmp
 * - Bridges: {type}Bridge{water}.bmp (e.g., RoadhorzBridgeN.bmp)
 * - Urban roads: ConcreteRoad{type}.bmp
 *
 * See: doc/road_rendering_reference_data.md
 */

import { RoadTopology, RoadSurface } from './road-topology-analyzer';

/**
 * Road texture naming helper
 * Generates BMP filenames based on topology and surface
 */
export class RoadTextureMapper {
  /**
   * Get texture filename for a road tile
   * @param topology - Road topology type (16 types)
   * @param surface - Road surface type (11 types)
   * @returns BMP filename (e.g., "Roadhorz.bmp", "RoadhorzBridgeN.bmp")
   */
  static getTextureFilename(topology: RoadTopology, surface: RoadSurface): string {
    // Get base texture name from topology
    const baseName = this.getBaseTextureName(topology);

    // Apply surface modifier
    return this.applySurfaceModifier(baseName, surface);
  }

  /**
   * Get base texture name from topology
   * Returns the road type part (e.g., "horz", "vert", "cornerE")
   */
  private static getBaseTextureName(topology: RoadTopology): string {
    switch (topology) {
      case RoadTopology.NONE:
        return '';

      // North-South roads (vertical in isometric view - diagonal \)
      case RoadTopology.NS_START:
      case RoadTopology.NS_END:
      case RoadTopology.NS_MIDDLE:
        return 'vert';

      // West-East roads (horizontal in isometric view - diagonal /)
      case RoadTopology.WE_START:
      case RoadTopology.WE_END:
      case RoadTopology.WE_MIDDLE:
        return 'horz';

      // NorthWest-SouthEast diagonal (not fully implemented in base client)
      case RoadTopology.NWSE_START:
      case RoadTopology.NWSE_END:
      case RoadTopology.NWSE_MIDDLE:
        return 'vert';  // Fallback to vertical

      // NorthEast-SouthWest diagonal (not fully implemented in base client)
      case RoadTopology.NESW_START:
      case RoadTopology.NESW_END:
      case RoadTopology.NESW_MIDDLE:
        return 'horz';  // Fallback to horizontal

      // T-junctions (3-way)
      case RoadTopology.TCROSS:
        // T-junction direction would need neighbor analysis
        // For now, default to TN (opens to North)
        return 'TN';

      // 4-way intersection
      case RoadTopology.XCROSS:
        return 'cross';

      // Corner (2-way, not straight)
      case RoadTopology.TWOCROSS:
        // Corner direction would need neighbor analysis
        // For now, default to cornerE
        return 'cornerE';

      default:
        return 'horz';  // Safe fallback
    }
  }

  /**
   * Get T-junction texture name based on connections
   * T-junction opens towards the missing direction
   */
  static getTJunctionTextureName(
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): string {
    // T-junction has exactly 3 connections
    if (!hasNorth) return 'TS';  // Opens to South
    if (!hasEast) return 'TW';   // Opens to West
    if (!hasSouth) return 'TN';  // Opens to North
    if (!hasWest) return 'TE';   // Opens to East
    return 'TN';  // Fallback
  }

  /**
   * Get corner texture name based on connections
   * Corner name indicates the direction the road "turns towards"
   */
  static getCornerTextureName(
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): string {
    // Corner has exactly 2 connections (not straight)
    if (hasNorth && hasEast) return 'cornerE';   // Turns towards East
    if (hasEast && hasSouth) return 'cornerS';   // Turns towards South
    if (hasSouth && hasWest) return 'cornerW';   // Turns towards West
    if (hasWest && hasNorth) return 'cornerN';   // Turns towards North
    return 'cornerE';  // Fallback
  }

  /**
   * Apply surface modifier to base texture name
   * Generates final BMP filename
   */
  private static applySurfaceModifier(baseName: string, surface: RoadSurface): string {
    if (!baseName) return '';

    switch (surface) {
      case RoadSurface.LAND:
        // Regular land road: Road{type}.bmp
        return `Road${baseName}.bmp`;

      case RoadSurface.URBAN:
        // Urban/concrete road: ConcreteRoad{type}.bmp
        return `ConcreteRoad${baseName}.bmp`;

      case RoadSurface.BRIDGE_WATER_CENTER:
        return `Road${baseName}BridgeCenter.bmp`;

      case RoadSurface.BRIDGE_WATER_N:
        return `Road${baseName}BridgeN.bmp`;

      case RoadSurface.BRIDGE_WATER_E:
        return `Road${baseName}BridgeE.bmp`;

      case RoadSurface.BRIDGE_WATER_NE:
        return `Road${baseName}BridgeNE.bmp`;

      case RoadSurface.BRIDGE_WATER_S:
        return `Road${baseName}BridgeS.bmp`;

      case RoadSurface.BRIDGE_WATER_SW:
        return `Road${baseName}BridgeSW.bmp`;

      case RoadSurface.BRIDGE_WATER_W:
        return `Road${baseName}BridgeW.bmp`;

      case RoadSurface.BRIDGE_WATER_SE:
        return `Road${baseName}BridgeSE.bmp`;

      case RoadSurface.BRIDGE_WATER_NW:
        return `Road${baseName}BridgeNW.bmp`;

      case RoadSurface.SMOOTH:
        // Smooth corner transition
        return `Road${baseName}Smooth.bmp`;

      default:
        // Fallback to land road
        return `Road${baseName}.bmp`;
    }
  }

  /**
   * Get texture filename with neighbor analysis
   * This version analyzes neighbor connections to determine exact texture variant
   */
  static getTextureFilenameWithNeighbors(
    topology: RoadTopology,
    surface: RoadSurface,
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): string {
    let baseName: string;

    // For T-junctions and corners, use neighbor analysis
    if (topology === RoadTopology.TCROSS) {
      baseName = this.getTJunctionTextureName(hasNorth, hasEast, hasSouth, hasWest);
    } else if (topology === RoadTopology.TWOCROSS) {
      baseName = this.getCornerTextureName(hasNorth, hasEast, hasSouth, hasWest);
    } else {
      baseName = this.getBaseTextureName(topology);
    }

    return this.applySurfaceModifier(baseName, surface);
  }

  /**
   * Check if a texture file exists in the cache
   * (To be integrated with GameObjectTextureCache)
   */
  static textureExists(filename: string): boolean {
    // TODO: Integrate with texture cache
    // For now, assume all base textures exist
    const baseTextures = [
      'Roadhorz.bmp', 'Roadvert.bmp', 'Roadcross.bmp',
      'RoadcornerN.bmp', 'RoadcornerE.bmp', 'RoadcornerS.bmp', 'RoadcornerW.bmp',
      'RoadTN.bmp', 'RoadTE.bmp', 'RoadTS.bmp', 'RoadTW.bmp',
    ];
    return baseTextures.some(base => filename.includes(base.replace('.bmp', '')));
  }

  /**
   * Get fallback texture if primary texture doesn't exist
   * Falls back to simpler texture variant
   */
  static getFallbackTexture(filename: string): string {
    // Remove bridge/smooth/urban modifiers and fall back to basic road
    if (filename.includes('Bridge')) {
      // Remove "Bridge" + any following word (e.g., BridgeN, BridgeCenter)
      return filename.replace(/Bridge[A-Za-z]+/, '');
    }
    if (filename.includes('Smooth')) {
      return filename.replace('Smooth', '');
    }
    if (filename.includes('ConcreteRoad')) {
      return filename.replace('ConcreteRoad', 'Road');
    }
    return filename;
  }
}
