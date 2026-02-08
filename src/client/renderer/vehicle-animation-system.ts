/**
 * Vehicle Animation System
 *
 * Animates vehicles on road tiles using pre-defined CarPaths from road block INI files.
 * Vehicles move tile-by-tile following path segments, spawning at viewport edges
 * and despawning when they leave the visible area or reach a dead end.
 *
 * Performance guarantees:
 * - Active only at Z2/Z3 (zero cost at Z0/Z1)
 * - Max 40 vehicles rendered per frame
 * - Viewport culling: only visible vehicles are drawn
 * - Pre-cached textures: no fetching during render
 * - Paused during camera movement
 * - deltaTime-based animation (frame-rate independent)
 */

import { CarClassManager, CarDirection } from './car-class-system';
import { RoadBlockClassManager, CarPath, RoadBlockId, RoadsRendering, roadBlockId } from './road-texture-system';
import { GameObjectTextureCache, ObjectAtlasRect } from './game-object-texture-cache';
import { PLATFORM_SHIFT } from './concrete-texture-system';
import { TileBounds, ZoomConfig } from '../../shared/map-config';

// =============================================================================
// TYPES
// =============================================================================

interface AnimatedVehicle {
  id: number;
  carClassId: number;
  // Current tile in the world (col, row)
  tileX: number;    // column (j)
  tileY: number;    // row (i)
  // Path traversal state
  currentPath: CarPath;
  segmentIndex: number;
  progress: number;  // 0-1 within current segment
  // Visual state
  direction: string; // Current sprite direction (N, NE, E, SE, S, SW, W, NW)
  pixelX: number;    // Pixel offset X within tile (relative to tile center, 64x32 base)
  pixelY: number;    // Pixel offset Y within tile
  speed: number;     // Tiles per second (how fast the vehicle crosses one tile)
  alive: boolean;
}

/**
 * Direction offsets for tile adjacency.
 * When a vehicle exits a tile going "N", it moves to tile (row-1, col-1) in isometric map coords.
 *
 * In the CarPaths system:
 * - N/S are the "vertical" road direction (Roadvert = NS)
 * - E/W are the "horizontal" road direction (Roadhorz = WE)
 *
 * Mapping exit direction to tile offset (row, col):
 * - Exit N: the vehicle moves toward smaller row AND smaller col → tile at (row, col-1) or (row-1, col)
 * - Exit S: opposite of N
 * - Exit E: toward smaller row, larger col
 * - Exit W: toward larger row, smaller col
 *
 * Based on the isometric road orientation:
 * - Roadhorz (WE road): N.GW means entering from N side going W, S.GE means entering from S going E
 *   This is a road that runs along the isometric "horizontal" axis
 * - Roadvert (NS road): road runs along the isometric "vertical" axis
 *
 * The exit direction maps to adjacent tiles as:
 */
const EXIT_DIRECTION_OFFSETS: Record<string, { dRow: number; dCol: number }> = {
  'N': { dRow: -1, dCol: 0 },  // North: previous row
  'S': { dRow: 1, dCol: 0 },   // South: next row
  'E': { dRow: 0, dCol: 1 },   // East: next column
  'W': { dRow: 0, dCol: -1 },  // West: previous column
};

/**
 * When entering from a direction, the entry key is the opposite of the exit.
 * If a vehicle exits tile A going "N", it enters tile B from "S".
 */
const OPPOSITE_DIRECTION: Record<string, string> = {
  'N': 'S',
  'S': 'N',
  'E': 'W',
  'W': 'E',
};

// =============================================================================
// VEHICLE ANIMATION SYSTEM
// =============================================================================

export class VehicleAnimationSystem {
  private vehicles: AnimatedVehicle[] = [];
  private nextVehicleId: number = 0;
  private maxVehicles: number = 40;
  private spawnCooldownRemaining: number = 0;
  private readonly SPAWN_COOLDOWN: number = 0.8; // seconds between spawn attempts
  private readonly VEHICLE_SPEED: number = 1.2;  // tiles per second
  private readonly MIN_SPAWN_PATH_LENGTH: number = 3; // minimum tiles a vehicle must be able to travel

  // State
  private paused: boolean = false;
  private enabled: boolean = true;

  // Dependencies
  private carClassManager: CarClassManager | null = null;
  private roadBlockClassManager: RoadBlockClassManager | null = null;
  private gameObjectTextureCache: GameObjectTextureCache | null = null;
  private roadTilesMap: Map<string, boolean> | null = null;
  private roadsRendering: RoadsRendering | null = null;
  private getLandId: ((col: number, row: number) => number) | null = null;
  private hasConcrete: ((col: number, row: number) => boolean) | null = null;

  // Building positions for proximity-based spawning
  private buildingTiles: Set<string> = new Set();
  // Cached road tiles near buildings (within BUILDING_PROXIMITY radius)
  private nearBuildingRoadTiles: Array<{ col: number; row: number }> | null = null;
  private readonly BUILDING_PROXIMITY: number = 5;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  setCarClassManager(manager: CarClassManager): void {
    this.carClassManager = manager;
  }

  setRoadBlockClassManager(manager: RoadBlockClassManager): void {
    this.roadBlockClassManager = manager;
  }

  setGameObjectTextureCache(cache: GameObjectTextureCache): void {
    this.gameObjectTextureCache = cache;
  }

  setRoadData(
    roadTilesMap: Map<string, boolean>,
    roadsRendering: RoadsRendering | null,
    getLandId: (col: number, row: number) => number,
    hasConcrete: (col: number, row: number) => boolean
  ): void {
    // Invalidate cache if road data changed
    if (this.roadTilesMap !== roadTilesMap) {
      this.nearBuildingRoadTiles = null;
    }
    this.roadTilesMap = roadTilesMap;
    this.roadsRendering = roadsRendering;
    this.getLandId = getLandId;
    this.hasConcrete = hasConcrete;
  }

  /**
   * Set building tile positions for proximity-based vehicle spawning.
   * Buildings are passed as a Set of "col,row" strings.
   */
  setBuildingTiles(tiles: Set<string>): void {
    if (tiles.size !== this.buildingTiles.size) {
      this.nearBuildingRoadTiles = null; // Invalidate cache
    }
    this.buildingTiles = tiles;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.vehicles = [];
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isActive(): boolean {
    return this.enabled && this.vehicles.length > 0;
  }

  getVehicleCount(): number {
    return this.vehicles.length;
  }

  clear(): void {
    this.vehicles = [];
    this.spawnCooldownRemaining = 0;
    this.nearBuildingRoadTiles = null;
  }

  // ==========================================================================
  // UPDATE (called every frame)
  // ==========================================================================

  update(deltaTime: number, bounds: TileBounds): void {
    if (!this.enabled || this.paused) return;
    if (!this.carClassManager || !this.roadBlockClassManager || !this.roadTilesMap) return;

    // Cap deltaTime to prevent huge jumps after tab switch
    const dt = Math.min(deltaTime, 0.1);

    // Update existing vehicles
    for (const vehicle of this.vehicles) {
      this.updateVehicle(vehicle, dt);
    }

    // Remove dead vehicles
    this.vehicles = this.vehicles.filter(v => v.alive);

    // Try to spawn new vehicles
    this.spawnCooldownRemaining -= dt;
    if (this.spawnCooldownRemaining <= 0 && this.vehicles.length < this.maxVehicles) {
      this.trySpawnVehicle(bounds);
      this.spawnCooldownRemaining = this.SPAWN_COOLDOWN;
    }
  }

  // ==========================================================================
  // RENDER (called every frame after update)
  // ==========================================================================

  render(
    ctx: CanvasRenderingContext2D,
    mapToScreen: (i: number, j: number) => { x: number; y: number },
    zoomConfig: ZoomConfig,
    canvasWidth: number,
    canvasHeight: number,
    isOnWaterPlatform?: (col: number, row: number) => boolean
  ): void {
    if (!this.enabled || this.vehicles.length === 0) return;
    if (!this.gameObjectTextureCache) return;

    // CarPaths coordinates are in 64×32 tile image space.
    // scaleFactor converts from that space to the current zoom's screen space.
    const scaleFactor = zoomConfig.tileWidth / 64;
    const halfWidth = zoomConfig.tileWidth / 2;
    const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);

    for (const vehicle of this.vehicles) {
      // mapToScreen returns the tile's top diamond vertex (screen position).
      // CarPaths coordinates are in tile image space: (0,0) = top-left of 64x32 tile image.
      // The tile image is drawn at (sx - halfWidth, sy), so:
      //   tile image (px, py) → screen (sx - halfWidth + px*scale, sy + py*scale)
      const screenPos = mapToScreen(vehicle.tileY, vehicle.tileX);
      const screenX = screenPos.x - halfWidth + vehicle.pixelX * scaleFactor;
      // Vehicles on water platforms are elevated to match the platform
      const onPlatform = isOnWaterPlatform ? isOnWaterPlatform(vehicle.tileX, vehicle.tileY) : false;
      const screenY = screenPos.y + vehicle.pixelY * scaleFactor - (onPlatform ? platformYShift : 0);

      // Get sprite texture filename
      const filename = this.carClassManager!.getImageFilename(vehicle.carClassId, vehicle.direction);
      if (!filename) continue;

      // Car sprites are small (15-33px wide) — draw at their NATIVE pixel size,
      // centered on the CarPath screen position. No zoom scaling applied to sprite.
      const atlasRect = this.gameObjectTextureCache.getAtlasRect('CarImages', filename);
      if (atlasRect) {
        const sw = atlasRect.sw;
        const sh = atlasRect.sh;
        const drawX = Math.round(screenX - sw / 2);
        const drawY = Math.round(screenY - sh / 2);

        // Viewport culling
        if (drawX + sw < 0 || drawX > canvasWidth || drawY + sh < 0 || drawY > canvasHeight) continue;

        ctx.drawImage(
          atlasRect.atlas,
          atlasRect.sx, atlasRect.sy, sw, sh,
          drawX, drawY, sw, sh
        );
      } else {
        const texture = this.gameObjectTextureCache.getTextureSync('CarImages', filename);
        if (texture) {
          const drawX = Math.round(screenX - texture.width / 2);
          const drawY = Math.round(screenY - texture.height / 2);

          if (drawX + texture.width < 0 || drawX > canvasWidth ||
              drawY + texture.height < 0 || drawY > canvasHeight) continue;

          ctx.drawImage(texture, drawX, drawY);
        }
      }
    }
  }

  // ==========================================================================
  // VEHICLE UPDATE LOGIC
  // ==========================================================================

  private updateVehicle(vehicle: AnimatedVehicle, dt: number): void {
    const segment = vehicle.currentPath.segments[vehicle.segmentIndex];
    if (!segment) {
      vehicle.alive = false;
      return;
    }

    // Advance progress based on speed and segment steps
    // Speed = tiles/sec, each segment has N steps within a tile
    const totalSteps = this.getTotalPathSteps(vehicle.currentPath);
    const segmentFraction = segment.steps / totalSteps;
    const progressPerSecond = vehicle.speed / segmentFraction;
    vehicle.progress += progressPerSecond * dt / segment.steps;

    if (vehicle.progress >= 1) {
      // Move to next segment
      vehicle.segmentIndex++;
      vehicle.progress = 0;

      if (vehicle.segmentIndex >= vehicle.currentPath.segments.length) {
        // Reached end of path → transition to next tile
        if (!this.transitionToNextTile(vehicle)) {
          vehicle.alive = false;
          return;
        }
      }
    }

    // Interpolate pixel position within current segment
    const seg = vehicle.currentPath.segments[vehicle.segmentIndex];
    if (seg) {
      const t = Math.min(vehicle.progress, 1);
      vehicle.pixelX = seg.startX + (seg.endX - seg.startX) * t;
      vehicle.pixelY = seg.startY + (seg.endY - seg.startY) * t;
      vehicle.direction = seg.direction;
    }
  }

  private getTotalPathSteps(path: CarPath): number {
    let total = 0;
    for (const seg of path.segments) {
      total += seg.steps;
    }
    return total || 1;
  }

  private transitionToNextTile(vehicle: AnimatedVehicle): boolean {
    const exitDir = vehicle.currentPath.exitDirection;
    const offset = EXIT_DIRECTION_OFFSETS[exitDir];
    if (!offset) return false;

    const newRow = vehicle.tileY + offset.dRow;
    const newCol = vehicle.tileX + offset.dCol;

    // Check if the next tile has a road
    if (!this.roadTilesMap?.has(`${newCol},${newRow}`)) return false;

    // Find a matching CarPath on the next tile
    const entryDir = OPPOSITE_DIRECTION[exitDir];
    const nextPath = this.findCarPathForTile(newCol, newRow, entryDir);
    if (!nextPath) return false;

    // Transition
    vehicle.tileX = newCol;
    vehicle.tileY = newRow;
    vehicle.currentPath = nextPath;
    vehicle.segmentIndex = 0;
    vehicle.progress = 0;

    return true;
  }

  // ==========================================================================
  // SPAWNING
  // ==========================================================================

  /**
   * Build cached list of road tiles near buildings (within BUILDING_PROXIMITY tiles).
   * This is cached and only rebuilt when buildings or roads change.
   */
  private buildNearBuildingRoadTiles(): Array<{ col: number; row: number }> {
    const result: Array<{ col: number; row: number }> = [];
    if (!this.roadTilesMap || this.buildingTiles.size === 0) return result;

    const radius = this.BUILDING_PROXIMITY;

    for (const [key] of this.roadTilesMap) {
      const [colStr, rowStr] = key.split(',');
      const col = parseInt(colStr, 10);
      const row = parseInt(rowStr, 10);

      // Check if any building tile is within radius
      let nearBuilding = false;
      for (let dr = -radius; dr <= radius && !nearBuilding; dr++) {
        for (let dc = -radius; dc <= radius && !nearBuilding; dc++) {
          if (this.buildingTiles.has(`${col + dc},${row + dr}`)) {
            nearBuilding = true;
          }
        }
      }

      if (nearBuilding) {
        result.push({ col, row });
      }
    }

    return result;
  }

  private trySpawnVehicle(bounds: TileBounds): void {
    if (!this.roadTilesMap || !this.carClassManager) return;

    // Build/use cached list of road tiles near buildings
    if (!this.nearBuildingRoadTiles) {
      this.nearBuildingRoadTiles = this.buildNearBuildingRoadTiles();
    }

    // Filter to visible tiles only
    const visibleCandidates = this.nearBuildingRoadTiles.filter(t =>
      t.col >= bounds.minJ && t.col <= bounds.maxJ &&
      t.row >= bounds.minI && t.row <= bounds.maxI
    );

    if (visibleCandidates.length === 0) return;

    // Try a few random candidates to find one with a long enough path
    const maxAttempts = Math.min(5, visibleCandidates.length);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const idx = Math.floor(Math.random() * visibleCandidates.length);
      const tile = visibleCandidates[idx];

      // Check if there's already a vehicle on this tile
      if (this.vehicles.some(v => v.tileX === tile.col && v.tileY === tile.row)) continue;

      // Try all 4 entry directions to find a valid CarPath with enough road ahead
      const directions = ['N', 'S', 'E', 'W'];
      const shuffled = directions.sort(() => Math.random() - 0.5);

      for (const entryDir of shuffled) {
        const carPath = this.findCarPathForTile(tile.col, tile.row, entryDir);
        if (!carPath) continue;

        // Validate that the vehicle can travel at least MIN_SPAWN_PATH_LENGTH tiles
        const pathLength = this.measurePathLength(tile.col, tile.row, carPath);
        if (pathLength < this.MIN_SPAWN_PATH_LENGTH) continue;

        // Pick a random car class
        const carClass = this.carClassManager.getRandomClass();
        if (!carClass) return;

        // Create the vehicle
        const firstSegment = carPath.segments[0];
        this.vehicles.push({
          id: this.nextVehicleId++,
          carClassId: carClass.id,
          tileX: tile.col,
          tileY: tile.row,
          currentPath: carPath,
          segmentIndex: 0,
          progress: 0,
          direction: firstSegment.direction,
          pixelX: firstSegment.startX,
          pixelY: firstSegment.startY,
          speed: this.VEHICLE_SPEED,
          alive: true
        });
        return;
      }
    }
  }

  /**
   * Measure how many tiles a vehicle can travel from a starting tile/path.
   * Simulates tile transitions without creating a vehicle.
   * Used to validate spawn locations for long enough journeys.
   */
  private measurePathLength(startCol: number, startRow: number, startPath: CarPath): number {
    let col = startCol;
    let row = startRow;
    let path = startPath;
    let length = 1; // Count the starting tile
    const maxCheck = 20; // Don't check more than 20 tiles ahead

    while (length < maxCheck) {
      const exitDir = path.exitDirection;
      const offset = EXIT_DIRECTION_OFFSETS[exitDir];
      if (!offset) break;

      const nextRow = row + offset.dRow;
      const nextCol = col + offset.dCol;

      if (!this.roadTilesMap?.has(`${nextCol},${nextRow}`)) break;

      const entryDir = OPPOSITE_DIRECTION[exitDir];
      const nextPath = this.findCarPathForTile(nextCol, nextRow, entryDir);
      if (!nextPath) break;

      col = nextCol;
      row = nextRow;
      path = nextPath;
      length++;
    }

    return length;
  }

  // ==========================================================================
  // PATH LOOKUP
  // ==========================================================================

  private findCarPathForTile(col: number, row: number, entryDirection: string): CarPath | null {
    if (!this.roadsRendering || !this.roadBlockClassManager) return null;

    // Get the road topology at this tile
    const topology = this.roadsRendering.get(row, col);
    if (topology === RoadBlockId.None) return null;

    // Get the full road block ID (includes land type, concrete, etc.)
    const landId = this.getLandId ? this.getLandId(col, row) : 0;
    const onConcrete = this.hasConcrete ? this.hasConcrete(col, row) : false;
    const fullRoadBlockId = roadBlockId(topology, landId, onConcrete, false, false);

    // Get the road block class config which contains CarPaths
    const config = this.roadBlockClassManager.getClass(fullRoadBlockId);
    if (!config || config.carPaths.length === 0) return null;

    // Find paths that match the entry direction
    const matchingPaths = config.carPaths.filter(p => p.entryDirection === entryDirection);
    if (matchingPaths.length === 0) return null;

    // Pick a random matching path
    return matchingPaths[Math.floor(Math.random() * matchingPaths.length)];
  }
}
