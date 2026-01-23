/**
 * Road Surface Detector
 *
 * Detects road surface type based on terrain data:
 * - LAND: Default land road
 * - URBAN: Road in concrete/urban area
 * - BRIDGE_WATER_*: Bridge over water (9 types based on water direction)
 * - SMOOTH: Smooth corner transition
 *
 * Based on Roads.pas surface detection logic from official Delphi client
 * See: doc/road_rendering_reference_data.md
 */

import { RoadSurface } from './road-topology-analyzer';
import { RoadTerrainData, WaterType } from './road-terrain-grid';

/**
 * Road surface detector
 * Determines surface type based on terrain grids
 */
export class RoadSurfaceDetector {
  private terrainData: RoadTerrainData;

  constructor(terrainData: RoadTerrainData) {
    this.terrainData = terrainData;
  }

  /**
   * Detect surface type at given coordinates
   * Priority: SMOOTH > BRIDGE > URBAN > LAND
   */
  detectSurface(
    x: number,
    y: number,
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): RoadSurface {
    // Check for smooth corners first (highest priority)
    const smoothSurface = this.detectSmoothCorner(x, y, hasNorth, hasEast, hasSouth, hasWest);
    if (smoothSurface !== null) {
      return smoothSurface;
    }

    // Check for bridge over water
    const waterType = this.terrainData.getWaterType(x, y);
    if (waterType !== WaterType.NONE) {
      return this.waterTypeToBridgeSurface(waterType);
    }

    // Check for urban/concrete road
    if (this.terrainData.hasConcrete(x, y)) {
      return RoadSurface.URBAN;
    }

    // Default to land road
    return RoadSurface.LAND;
  }

  /**
   * Detect smooth corner transitions
   * Smooth corners occur at 2-way connections (corners) where:
   * - The corner would normally use TWOCROSS topology
   * - The adjacent tiles in the corner's "outside" directions have different connectivity
   *
   * This creates a smoother visual transition at corners instead of sharp angles.
   */
  private detectSmoothCorner(
    x: number,
    y: number,
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): RoadSurface | null {
    const connectionCount = [hasNorth, hasEast, hasSouth, hasWest].filter(Boolean).length;

    // Smooth only applies to 2-way connections (corners)
    if (connectionCount !== 2) {
      return null;
    }

    // Check if it's a corner (not a straight road)
    const isStraight = (hasNorth && hasSouth) || (hasEast && hasWest);
    if (isStraight) {
      return null;
    }

    // For each corner type, check if adjacent "outside" tiles suggest a smooth transition
    // This is a simplified heuristic - full algorithm would check more context

    // North-East corner
    if (hasNorth && hasEast) {
      // Check if SW tile (opposite corner) would benefit from smooth transition
      const swHasRoad = this.hasRoadAt(x - 1, y + 1);
      if (swHasRoad) {
        return RoadSurface.SMOOTH;
      }
    }

    // East-South corner
    if (hasEast && hasSouth) {
      // Check if NW tile (opposite corner)
      const nwHasRoad = this.hasRoadAt(x - 1, y - 1);
      if (nwHasRoad) {
        return RoadSurface.SMOOTH;
      }
    }

    // South-West corner
    if (hasSouth && hasWest) {
      // Check if NE tile (opposite corner)
      const neHasRoad = this.hasRoadAt(x + 1, y - 1);
      if (neHasRoad) {
        return RoadSurface.SMOOTH;
      }
    }

    // West-North corner
    if (hasWest && hasNorth) {
      // Check if SE tile (opposite corner)
      const seHasRoad = this.hasRoadAt(x + 1, y + 1);
      if (seHasRoad) {
        return RoadSurface.SMOOTH;
      }
    }

    return null;
  }

  /**
   * Check if there's a road at given coordinates
   * (Requires access to road grid - to be provided by caller)
   *
   * For now, this is a stub that always returns false.
   * In full implementation, this would check the actual road grid.
   */
  private hasRoadAt(x: number, y: number): boolean {
    // TODO: Implement road grid lookup
    // This requires the road renderer to pass road existence data
    return false;
  }

  /**
   * Map water type to bridge surface type
   */
  private waterTypeToBridgeSurface(waterType: WaterType): RoadSurface {
    switch (waterType) {
      case WaterType.CENTER:
        return RoadSurface.BRIDGE_WATER_CENTER;
      case WaterType.N:
        return RoadSurface.BRIDGE_WATER_N;
      case WaterType.E:
        return RoadSurface.BRIDGE_WATER_E;
      case WaterType.NE:
        return RoadSurface.BRIDGE_WATER_NE;
      case WaterType.S:
        return RoadSurface.BRIDGE_WATER_S;
      case WaterType.SW:
        return RoadSurface.BRIDGE_WATER_SW;
      case WaterType.W:
        return RoadSurface.BRIDGE_WATER_W;
      case WaterType.SE:
        return RoadSurface.BRIDGE_WATER_SE;
      case WaterType.NW:
        return RoadSurface.BRIDGE_WATER_NW;
      default:
        return RoadSurface.LAND;
    }
  }

  /**
   * Update terrain data (when map changes or buildings update)
   */
  setTerrainData(terrainData: RoadTerrainData): void {
    this.terrainData = terrainData;
  }
}

/**
 * Helper function to detect surface type without creating detector instance
 */
export function detectRoadSurface(
  terrainData: RoadTerrainData,
  x: number,
  y: number,
  hasNorth: boolean,
  hasEast: boolean,
  hasSouth: boolean,
  hasWest: boolean
): RoadSurface {
  const detector = new RoadSurfaceDetector(terrainData);
  return detector.detectSurface(x, y, hasNorth, hasEast, hasSouth, hasWest);
}
