/**
 * CoordinateMapper3D
 *
 * Maps between map tile coordinates (i, j) and Three.js world coordinates.
 * Replicates the isometric math from coordinate-mapper.ts but adapted for 3D space.
 *
 * Coordinate systems:
 * - Map: (i, j) where i=row, j=column, (0,0) is top-left
 * - World: (x, y, z) in Three.js space, y=0 is ground plane
 * - Screen: (x, y) pixels, handled by Three.js camera projection
 */

import * as THREE from 'three';
import { Point, TileBounds, ZOOM_LEVELS, ZoomConfig, Rect } from '../../../shared/map-config';

export class CoordinateMapper3D {
  // Reference tile size (zoom level 2, the default)
  // tileWidth = 32, tileHeight = 16
  private static readonly BASE_TILE_WIDTH = 32;
  private static readonly BASE_TILE_HEIGHT = 16;

  constructor(
    private mapWidth: number = 2000,
    private mapHeight: number = 2000
  ) {}

  /**
   * Convert map tile coordinates (i, j) to Three.js world position
   *
   * The isometric projection places tiles in a diamond pattern:
   * - Moving +i (down a row) moves world position left and back
   * - Moving +j (right a column) moves world position right and back
   *
   * @param i - Row index (0 to mapHeight-1)
   * @param j - Column index (0 to mapWidth-1)
   * @returns Three.js world position with y=0 (ground plane)
   */
  mapToWorld(i: number, j: number): THREE.Vector3 {
    const tileWidth = CoordinateMapper3D.BASE_TILE_WIDTH;
    const tileHeight = CoordinateMapper3D.BASE_TILE_HEIGHT;

    // Isometric projection formula:
    // X axis: j increases right, i increases left
    // Z axis: both i and j increase going "back" (negative Z in Three.js convention)
    const worldX = (j - i) * (tileWidth / 2);
    const worldY = 0; // Ground plane
    const worldZ = -(i + j) * (tileHeight / 2);

    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  /**
   * Convert Three.js world position to map tile coordinates (i, j)
   *
   * Inverse of mapToWorld:
   * Given: worldX = (j - i) * tileWidth/2
   *        worldZ = -(i + j) * tileHeight/2
   *
   * Solve for i, j:
   * Let A = worldX / (tileWidth/2) = j - i
   * Let B = -worldZ / (tileHeight/2) = i + j
   *
   * Then: i = (B - A) / 2
   *       j = (A + B) / 2
   *
   * @param worldX - X position in Three.js world
   * @param worldZ - Z position in Three.js world (y is ignored)
   * @returns Map coordinates as Point {x: i, y: j}
   */
  worldToMap(worldX: number, worldZ: number): Point {
    const tileWidth = CoordinateMapper3D.BASE_TILE_WIDTH;
    const tileHeight = CoordinateMapper3D.BASE_TILE_HEIGHT;

    const A = worldX / (tileWidth / 2);
    const B = -worldZ / (tileHeight / 2);

    const i = (B - A) / 2;
    const j = (A + B) / 2;

    return { x: Math.floor(i), y: Math.floor(j) };
  }

  /**
   * Get precise (floating point) map coordinates
   * Useful for smoother mouse tracking and hover detection
   */
  worldToMapPrecise(worldX: number, worldZ: number): { i: number; j: number } {
    const tileWidth = CoordinateMapper3D.BASE_TILE_WIDTH;
    const tileHeight = CoordinateMapper3D.BASE_TILE_HEIGHT;

    const A = worldX / (tileWidth / 2);
    const B = -worldZ / (tileHeight / 2);

    return {
      i: (B - A) / 2,
      j: (A + B) / 2
    };
  }

  /**
   * Get the center of the map in world coordinates
   */
  getMapCenterWorld(): THREE.Vector3 {
    const centerI = this.mapHeight / 2;
    const centerJ = this.mapWidth / 2;
    return this.mapToWorld(centerI, centerJ);
  }

  /**
   * Get the world bounds of a tile for creating geometry
   * Returns the four corners of the diamond tile in world space
   *
   * @param i - Row index
   * @param j - Column index
   * @returns Array of 4 corners [top, right, bottom, left] as THREE.Vector3
   */
  getTileCorners(i: number, j: number): THREE.Vector3[] {
    const tileWidth = CoordinateMapper3D.BASE_TILE_WIDTH;
    const tileHeight = CoordinateMapper3D.BASE_TILE_HEIGHT;

    // Center of the tile
    const center = this.mapToWorld(i, j);

    // Diamond corners (for an isometric tile)
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    return [
      new THREE.Vector3(center.x, 0, center.z - halfH), // Top
      new THREE.Vector3(center.x + halfW, 0, center.z), // Right
      new THREE.Vector3(center.x, 0, center.z + halfH), // Bottom
      new THREE.Vector3(center.x - halfW, 0, center.z)  // Left
    ];
  }

  /**
   * Calculate visible tile bounds for a given camera viewport
   * Used for frustum culling to determine which tiles to render
   *
   * @param camera - Three.js orthographic camera
   * @param renderer - Three.js WebGL renderer
   * @param padding - Extra tiles to include beyond viewport
   * @returns Tile bounds {minI, maxI, minJ, maxJ}
   */
  getVisibleBounds(
    camera: THREE.OrthographicCamera,
    renderer: THREE.WebGLRenderer,
    padding: number = 2
  ): TileBounds {
    // Get the frustum corners in world space
    const size = renderer.getSize(new THREE.Vector2());
    const aspect = size.x / size.y;

    // Camera frustum dimensions
    const frustumHeight = (camera.top - camera.bottom);
    const frustumWidth = frustumHeight * aspect;

    // Get camera target on ground plane (where camera is looking)
    // For orthographic camera, we need to project the camera's lookAt vector to y=0
    const cameraTarget = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Ray from camera position along view direction
    // Intersect with y=0 plane to find where camera is looking at ground
    // Formula: origin + t * direction = y
    // camera.position.y + t * direction.y = 0
    // t = -camera.position.y / direction.y
    const t = -camera.position.y / cameraDirection.y;
    cameraTarget.set(
      camera.position.x + cameraDirection.x * t,
      0,
      camera.position.z + cameraDirection.z * t
    );

    // Calculate the four corners of the view frustum on the ground plane
    const halfW = frustumWidth / 2;
    const halfH = frustumHeight / 2;

    const corners = [
      { x: cameraTarget.x - halfW, z: cameraTarget.z - halfH },
      { x: cameraTarget.x + halfW, z: cameraTarget.z - halfH },
      { x: cameraTarget.x - halfW, z: cameraTarget.z + halfH },
      { x: cameraTarget.x + halfW, z: cameraTarget.z + halfH }
    ];

    // Convert corners to map coordinates
    const mapCoords = corners.map(c => this.worldToMap(c.x, c.z));

    // Find bounding box
    const is = mapCoords.map(c => c.x);
    const js = mapCoords.map(c => c.y);

    const minI = Math.max(0, Math.floor(Math.min(...is)) - padding);
    const maxI = Math.min(this.mapHeight - 1, Math.ceil(Math.max(...is)) + padding);
    const minJ = Math.max(0, Math.floor(Math.min(...js)) - padding);
    const maxJ = Math.min(this.mapWidth - 1, Math.ceil(Math.max(...js)) + padding);

    return { minI, maxI, minJ, maxJ };
  }

  /**
   * Calculate the camera zoom required to show a certain number of tiles
   * @param tilesVisible - Number of tiles to show across the viewport
   * @param viewportWidth - Viewport width in pixels
   */
  calculateZoomForTiles(tilesVisible: number, viewportWidth: number): number {
    const tileWidth = CoordinateMapper3D.BASE_TILE_WIDTH;
    // World units needed to show N tiles
    const worldWidth = tilesVisible * tileWidth;
    // Zoom = viewport / world (for orthographic camera)
    return viewportWidth / worldWidth;
  }

  /**
   * Get the world dimensions of a building
   * @param xsize - Building width in tiles
   * @param ysize - Building height in tiles
   * @returns World dimensions {width, depth}
   */
  getBuildingWorldSize(xsize: number, ysize: number): { width: number; depth: number } {
    const tileWidth = CoordinateMapper3D.BASE_TILE_WIDTH;
    const tileHeight = CoordinateMapper3D.BASE_TILE_HEIGHT;

    return {
      width: (xsize + ysize) * (tileWidth / 2),
      depth: (xsize + ysize) * (tileHeight / 2)
    };
  }

  /**
   * Get the render order for painter's algorithm
   * Higher values render on top. Based on i+j sum.
   *
   * @param i - Row index
   * @param j - Column index
   * @param layer - Base layer (0=terrain, 1=concrete, 2=roads, 4=buildings)
   */
  getRenderOrder(i: number, j: number, layer: number): number {
    // Base order from layer (multiply by large number to separate layers)
    const layerBase = layer * 10000;
    // Within layer, sort by i+j (tiles further "back" render first)
    const depthOrder = i + j;
    return layerBase + depthOrder;
  }

  // Getters for map dimensions
  getMapWidth(): number {
    return this.mapWidth;
  }

  getMapHeight(): number {
    return this.mapHeight;
  }

  setMapDimensions(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
  }

  // Static getters for tile dimensions
  static getTileWidth(): number {
    return CoordinateMapper3D.BASE_TILE_WIDTH;
  }

  static getTileHeight(): number {
    return CoordinateMapper3D.BASE_TILE_HEIGHT;
  }
}
