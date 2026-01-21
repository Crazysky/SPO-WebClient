/**
 * Coordinate Mapper
 * Implements Lander.pas isometric transformation algorithm
 * Converts between map tiles (i, j) and screen pixels (x, y)
 */

import { Point, Rect, TileBounds, ZOOM_LEVELS, Rotation } from '../../shared/map-config';

export class CoordinateMapper {
  constructor(
    private mapWidth: number = 2000,
    private mapHeight: number = 2000
  ) {}

  /**
   * Convert map tile coordinates (i, j) to screen pixel coordinates (x, y)
   * Based on Lander.pas algorithm
   *
   * @param i - Row index (0 to mapHeight-1)
   * @param j - Column index (0 to mapWidth-1)
   * @param zoomLevel - Zoom level (0-3)
   * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
   * @param origin - Camera position (screen origin offset)
   * @returns Screen coordinates {x, y}
   */
  mapToScreen(
    i: number,
    j: number,
    zoomLevel: number,
    rotation: Rotation,
    origin: Point
  ): Point {
    // Get zoom configuration
    const config = ZOOM_LEVELS[zoomLevel];
    const u = config.u; // 2 << zoomLevel

    const rows = this.mapHeight;
    const cols = this.mapWidth;

    // TODO: Apply rotation transformation (disabled for now)
    // const rotated = this.rotateMapCoordinates(i, j, rotation);
    // const ri = rotated.x;
    // const rj = rotated.y;

    // Lander.pas formula (without rotation for now):
    // x = 2*u*(rows - i + j) - origin.x
    // y = u*((rows - i) + (cols - j)) - origin.y
    const x = 2 * u * (rows - i + j) - origin.x;
    const y = u * ((rows - i) + (cols - j)) - origin.y;

    return { x, y };
  }

  /**
   * Convert screen pixel coordinates (x, y) to map tile coordinates (i, j)
   * Based on Lander.pas algorithm
   *
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @param zoomLevel - Zoom level (0-3)
   * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
   * @param origin - Camera position (screen origin offset)
   * @returns Map coordinates {x: i, y: j}
   */
  screenToMap(
    x: number,
    y: number,
    zoomLevel: number,
    rotation: Rotation,
    origin: Point
  ): Point {
    // Get zoom configuration
    const config = ZOOM_LEVELS[zoomLevel];
    const u = config.u; // 2 << zoomLevel
    const tu = u << 2; // 4 * u

    const rows = this.mapHeight;
    const cols = this.mapWidth;

    // Add origin back to screen coordinates (inverse of subtraction in mapToScreen)
    const screenX = x + origin.x;
    const screenY = y + origin.y;

    // Lander.pas formula (without rotation for now):
    // aux = 2*(u*cols - y)
    // h1 = aux + tu*(rows + 1) - x
    // i = h1 / tu
    // h2 = aux + x
    // j = h2 / tu
    const aux = 2 * (u * cols - screenY);
    const h1 = aux + tu * (rows + 1) - screenX;
    const i = Math.floor(h1 / tu);

    const h2 = aux + screenX;
    const j = Math.floor(h2 / tu);

    // TODO: Apply inverse rotation (disabled for now)
    // const original = this.rotateMapCoordinates(i, j, this.getInverseRotation(rotation));
    // return { x: original.x, y: original.y };

    return { x: i, y: j };
  }

  /**
   * Calculate visible tile bounds for a given viewport
   * Used for viewport culling to determine which tiles to render
   *
   * @param viewport - Screen viewport rectangle
   * @param zoomLevel - Zoom level (0-3)
   * @param rotation - Rotation (0-3)
   * @param origin - Camera position
   * @returns Tile bounds {minI, maxI, minJ, maxJ}
   */
  getVisibleBounds(
    viewport: Rect,
    zoomLevel: number,
    rotation: Rotation,
    origin: Point
  ): TileBounds {
    // Convert viewport corners to map coordinates
    const corners = [
      this.screenToMap(viewport.x, viewport.y, zoomLevel, rotation, origin),
      this.screenToMap(viewport.x + viewport.width, viewport.y, zoomLevel, rotation, origin),
      this.screenToMap(viewport.x, viewport.y + viewport.height, zoomLevel, rotation, origin),
      this.screenToMap(viewport.x + viewport.width, viewport.y + viewport.height, zoomLevel, rotation, origin)
    ];

    // Find bounding box
    const is = corners.map(c => c.x);
    const js = corners.map(c => c.y);

    const minI = Math.max(0, Math.floor(Math.min(...is)) - 1);
    const maxI = Math.min(this.mapHeight - 1, Math.ceil(Math.max(...is)) + 1);
    const minJ = Math.max(0, Math.floor(Math.min(...js)) - 1);
    const maxJ = Math.min(this.mapWidth - 1, Math.ceil(Math.max(...js)) + 1);

    return { minI, maxI, minJ, maxJ };
  }

  /**
   * Apply rotation transformation to map coordinates
   * Rotates around map center
   *
   * @param i - Row index
   * @param j - Column index
   * @param rotation - Rotation (0-3)
   * @returns Rotated coordinates {x: i, y: j}
   */
  private rotateMapCoordinates(i: number, j: number, rotation: Rotation): Point {
    const centerI = this.mapHeight / 2;
    const centerJ = this.mapWidth / 2;

    // Relative to center
    const relI = i - centerI;
    const relJ = j - centerJ;

    let newI: number;
    let newJ: number;

    switch (rotation) {
      case Rotation.NORTH: // 0 degrees (default)
        newI = relI;
        newJ = relJ;
        break;

      case Rotation.EAST: // 90 degrees clockwise
        newI = relJ;
        newJ = -relI;
        break;

      case Rotation.SOUTH: // 180 degrees
        newI = -relI;
        newJ = -relJ;
        break;

      case Rotation.WEST: // 270 degrees clockwise (90 counter-clockwise)
        newI = -relJ;
        newJ = relI;
        break;

      default:
        newI = relI;
        newJ = relJ;
    }

    // Back to absolute coordinates
    return {
      x: newI + centerI,
      y: newJ + centerJ
    };
  }

  /**
   * Get inverse rotation
   * @param rotation - Original rotation
   * @returns Inverse rotation
   */
  private getInverseRotation(rotation: Rotation): Rotation {
    switch (rotation) {
      case Rotation.NORTH: return Rotation.NORTH;
      case Rotation.EAST: return Rotation.WEST;
      case Rotation.SOUTH: return Rotation.SOUTH;
      case Rotation.WEST: return Rotation.EAST;
      default: return Rotation.NORTH;
    }
  }
}
