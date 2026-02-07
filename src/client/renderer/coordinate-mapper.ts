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
   * Based on Lander.pas algorithm, modified for seamless isometric tiling.
   *
   * For seamless tiles, adjacent tiles must overlap by half their dimensions:
   * - X step between tiles = tileWidth/2 = u
   * - Y step between tiles = tileHeight/2 = u/2
   *
   * @param i - Row index (0 to mapHeight-1)
   * @param j - Column index (0 to mapWidth-1)
   * @param zoomLevel - Zoom level (0-3)
   * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
   * @param origin - Camera position (screen origin offset)
   * @returns Screen coordinates {x, y} - top center point of the diamond tile
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
    const u = config.u; // 2 << zoomLevel (half of tileWidth)

    const rows = this.mapHeight;
    const cols = this.mapWidth;

    // Apply rotation transformation (90° snap: N/E/S/W)
    const rotated = this.rotateMapCoordinates(i, j, rotation);
    const ri = rotated.x;
    const rj = rotated.y;

    // Modified Lander.pas formula for seamless isometric tiling:
    // - X uses u (not 2*u) for step = tileWidth/2 between adjacent tiles
    // - Y uses u/2 for step = tileHeight/2 between adjacent tiles
    // This ensures tiles overlap by exactly half their dimensions.
    const x = u * (rows - ri + rj) - origin.x;
    const y = (u / 2) * ((rows - ri) + (cols - rj)) - origin.y;

    return { x, y };
  }

  /**
   * Convert screen pixel coordinates (x, y) to map tile coordinates (i, j)
   * Inverse of mapToScreen, derived from the seamless tiling formula.
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

    const rows = this.mapHeight;
    const cols = this.mapWidth;

    // Add origin back to screen coordinates (inverse of subtraction in mapToScreen)
    const screenX = x + origin.x;
    const screenY = y + origin.y;

    // Inverse of the seamless tiling formula:
    // screenX = u * (rows - i + j)
    // screenY = (u/2) * ((rows - i) + (cols - j))
    //
    // Let A = rows - i + j, B = (rows - i) + (cols - j)
    // screenX = u * A  =>  A = screenX / u
    // screenY = (u/2) * B  =>  B = 2 * screenY / u
    //
    // From A and B:
    // A + B = 2*rows - 2*i + cols  =>  i = (2*rows + cols - A - B) / 2
    // A - B = 2*j - cols  =>  j = (A - B + cols) / 2
    const A = screenX / u;
    const B = (2 * screenY) / u;

    const ri = Math.floor((2 * rows + cols - A - B) / 2);
    const rj = Math.floor((A - B + cols) / 2);

    // Apply inverse rotation to get back to original map coordinates
    const original = this.rotateMapCoordinates(ri, rj, this.getInverseRotation(rotation));
    return { x: original.x, y: original.y };
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
