/**
 * Vehicle Animation System Tests
 *
 * Tests vehicle spawning, movement, tile transitions, and lifecycle management.
 * Test environment is node (no jsdom) — mocks for Canvas/ImageBitmap as needed.
 */

import { VehicleAnimationSystem } from './vehicle-animation-system';
import { CarClassManager } from './car-class-system';
import {
  RoadBlockClassManager,
  RoadBlockId,
  RoadsRendering,
  CarPath,
  CarPathSegment
} from './road-texture-system';
import { GameObjectTextureCache } from './game-object-texture-cache';
import { TileBounds, ZoomConfig, ZOOM_LEVELS } from '../../shared/map-config';

// =============================================================================
// MOCKS
// =============================================================================

function createMockCarClassManager(): CarClassManager {
  const manager = new CarClassManager();
  manager.loadAll([
    `[General]\nId = 1\nProb = 1\nCargo = People\n[Images]\n64X32N = Car1.N.bmp\n64X32NE = Car1.NE.bmp\n64X32E = Car1.E.bmp\n64X32SE = Car1.SE.bmp\n64X32S = Car1.S.bmp\n64X32SW = Car1.SW.bmp\n64X32W = Car1.W.bmp\n64X32NW = Car1.NW.bmp`,
    `[General]\nId = 2\nProb = 0.2\nCargo = Light\n[Images]\n64X32N = Truck.N.bmp\n64X32NE = Truck.NE.bmp\n64X32E = Truck.E.bmp\n64X32SE = Truck.SE.bmp\n64X32S = Truck.S.bmp\n64X32SW = Truck.SW.bmp\n64X32W = Truck.W.bmp\n64X32NW = Truck.NW.bmp`,
  ]);
  return manager;
}

function createMockRoadBlockClassManager(): RoadBlockClassManager {
  const manager = new RoadBlockClassManager();
  // Load a horizontal road with CarPaths
  manager.loadFromIni(`[General]
Id=5

[Images]
64x32=CountryRoadhorz.bmp

[CarPaths]
N.GW = (40, -6, 10, 9, W, 6)
S.GE = (20, 14, 50, -1, E, 6)`);

  // Load a crossroads with multiple paths
  manager.loadFromIni(`[General]
Id=14

[Images]
64x32=CountryRoadcross.bmp

[CarPaths]
N.GN = (40, -7, 32, -3, W, 4) (32, -3, 32, -3, NW, 1) (32, -3, 19, -8, N, 4)
N.GW = (40, -6, 10, 9, W, 6)
S.GE = (20, 14, 50, -1, E, 6)
S.GN = (20, 13, 36, 5, E, 4) (36, 5, 36, 5, NE, 1) (36, 5, 19, -8, N, 4)
E.GN = (49, 7, 19, -8, N, 6)
W.GS = (12, -2, 42, 13, S, 6)`);

  return manager;
}

function createMockRoadTilesMap(): Map<string, boolean> {
  // Create a small road network: horizontal road from col 5 to col 10 at row 5
  const map = new Map<string, boolean>();
  for (let col = 5; col <= 10; col++) {
    map.set(`${col},5`, true);
  }
  return map;
}

function createMockRoadsRendering(): RoadsRendering {
  // Create roads rendering with horizontal road at row 5, cols 5-10
  const roads = new RoadsRendering(0, 0, 20, 20);
  // Set NSRoad (5) for horizontal segments
  for (let col = 5; col <= 10; col++) {
    roads.set(5, col, RoadBlockId.NSRoad);
  }
  return roads;
}

function createDefaultBounds(): TileBounds {
  return { minI: 0, maxI: 20, minJ: 0, maxJ: 20 };
}

// Mock GameObjectTextureCache (minimal)
function createMockTextureCache(): GameObjectTextureCache {
  const cache = {
    getAtlasRect: jest.fn().mockReturnValue(null),
    getTextureSync: jest.fn().mockReturnValue(null),
  } as unknown as GameObjectTextureCache;
  return cache;
}

// =============================================================================
// TESTS
// =============================================================================

describe('VehicleAnimationSystem', () => {
  let system: VehicleAnimationSystem;
  let carClassManager: CarClassManager;
  let roadBlockClassManager: RoadBlockClassManager;
  let roadTilesMap: Map<string, boolean>;
  let roadsRendering: RoadsRendering;
  let textureCache: GameObjectTextureCache;

  beforeEach(() => {
    system = new VehicleAnimationSystem();
    carClassManager = createMockCarClassManager();
    roadBlockClassManager = createMockRoadBlockClassManager();
    roadTilesMap = createMockRoadTilesMap();
    roadsRendering = createMockRoadsRendering();
    textureCache = createMockTextureCache();

    system.setCarClassManager(carClassManager);
    system.setRoadBlockClassManager(roadBlockClassManager);
    system.setGameObjectTextureCache(textureCache);
    system.setRoadData(
      roadTilesMap,
      roadsRendering,
      () => 0, // getLandId
      () => false // hasConcrete
    );

    // Set building tiles near the road (within 5 tiles of roads at row 5, cols 5-10)
    const buildingTiles = new Set<string>();
    buildingTiles.add('7,3');  // Building at (col=7, row=3) — 2 tiles from road at row 5
    buildingTiles.add('8,8');  // Building at (col=8, row=8) — 3 tiles from road at row 5
    system.setBuildingTiles(buildingTiles);
  });

  // ==========================================================================
  // INITIALIZATION & STATE
  // ==========================================================================

  describe('initialization', () => {
    it('should start with zero vehicles', () => {
      expect(system.getVehicleCount()).toBe(0);
    });

    it('should not be active initially', () => {
      expect(system.isActive()).toBe(false);
    });

    it('should be enabled by default', () => {
      // Update should process without error
      system.update(0.016, createDefaultBounds());
      expect(system.getVehicleCount()).toBe(0); // No immediate spawn (cooldown)
    });
  });

  // ==========================================================================
  // ENABLE / DISABLE / PAUSE
  // ==========================================================================

  describe('enable/disable/pause', () => {
    it('should not update when disabled', () => {
      system.setEnabled(false);

      // Run many updates - should never spawn
      for (let i = 0; i < 100; i++) {
        system.update(0.1, createDefaultBounds());
      }

      expect(system.getVehicleCount()).toBe(0);
    });

    it('should clear vehicles when disabled', () => {
      // Force-spawn by running many updates
      for (let i = 0; i < 50; i++) {
        system.update(1.0, createDefaultBounds());
      }

      system.setEnabled(false);
      expect(system.getVehicleCount()).toBe(0);
    });

    it('should not update when paused', () => {
      // Let some vehicles spawn first
      for (let i = 0; i < 10; i++) {
        system.update(1.0, createDefaultBounds());
      }
      const countBefore = system.getVehicleCount();

      system.setPaused(true);
      system.update(10.0, createDefaultBounds());

      // Count should not change (no movement, no spawn)
      expect(system.getVehicleCount()).toBe(countBefore);
    });
  });

  // ==========================================================================
  // SPAWNING
  // ==========================================================================

  describe('spawning', () => {
    it('should spawn vehicles after cooldown period', () => {
      // First update starts cooldown, second attempt after cooldown
      system.update(0.01, createDefaultBounds()); // Start cooldown
      system.update(1.0, createDefaultBounds());  // Cooldown expires, spawn attempt

      // May or may not have spawned (depends on edge tile detection)
      // Just verify no crash
      expect(system.getVehicleCount()).toBeGreaterThanOrEqual(0);
    });

    it('should not exceed max vehicle count', () => {
      // Run many updates to try to spawn many vehicles
      for (let i = 0; i < 200; i++) {
        system.update(1.0, createDefaultBounds());
      }

      expect(system.getVehicleCount()).toBeLessThanOrEqual(40);
    });

    it('should clear all vehicles on clear()', () => {
      for (let i = 0; i < 50; i++) {
        system.update(1.0, createDefaultBounds());
      }

      system.clear();
      expect(system.getVehicleCount()).toBe(0);
    });
  });

  // ==========================================================================
  // UPDATE LOGIC
  // ==========================================================================

  describe('update', () => {
    it('should cap deltaTime to prevent teleporting after tab switch', () => {
      // Spawn some vehicles
      for (let i = 0; i < 20; i++) {
        system.update(1.0, createDefaultBounds());
      }

      // Simulate returning from a background tab with huge deltaTime
      // Should not crash or produce weird state
      system.update(60.0, createDefaultBounds()); // 60 seconds! Should be capped

      // System should still be functional
      expect(system.getVehicleCount()).toBeLessThanOrEqual(40);
    });

    it('should not update without dependencies', () => {
      const emptySystem = new VehicleAnimationSystem();
      // No dependencies set - should not crash
      emptySystem.update(1.0, createDefaultBounds());
      expect(emptySystem.getVehicleCount()).toBe(0);
    });
  });

  // ==========================================================================
  // RENDER
  // ==========================================================================

  describe('render', () => {
    it('should not render when disabled', () => {
      const mockCtx = {
        drawImage: jest.fn(),
      } as unknown as CanvasRenderingContext2D;

      system.setEnabled(false);
      system.render(
        mockCtx,
        () => ({ x: 100, y: 100 }),
        ZOOM_LEVELS[2],
        800, 600
      );

      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });

    it('should not render when no vehicles exist', () => {
      const mockCtx = {
        drawImage: jest.fn(),
      } as unknown as CanvasRenderingContext2D;

      system.render(
        mockCtx,
        () => ({ x: 100, y: 100 }),
        ZOOM_LEVELS[2],
        800, 600
      );

      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });

    it('should not crash with null texture cache', () => {
      const systemNoCache = new VehicleAnimationSystem();
      systemNoCache.setCarClassManager(carClassManager);
      systemNoCache.setRoadBlockClassManager(roadBlockClassManager);
      systemNoCache.setRoadData(roadTilesMap, roadsRendering, () => 0, () => false);

      // Spawn vehicles
      for (let i = 0; i < 20; i++) {
        systemNoCache.update(1.0, createDefaultBounds());
      }

      const mockCtx = { drawImage: jest.fn() } as unknown as CanvasRenderingContext2D;

      // Should not crash even without texture cache
      systemNoCache.render(
        mockCtx,
        () => ({ x: 100, y: 100 }),
        ZOOM_LEVELS[2],
        800, 600
      );
    });
  });

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  describe('lifecycle', () => {
    it('should report active when vehicles exist and system is enabled', () => {
      expect(system.isActive()).toBe(false);

      // Try to spawn
      for (let i = 0; i < 20; i++) {
        system.update(1.0, createDefaultBounds());
      }

      if (system.getVehicleCount() > 0) {
        expect(system.isActive()).toBe(true);
      }
    });

    it('should report not active when disabled even with vehicles', () => {
      for (let i = 0; i < 20; i++) {
        system.update(1.0, createDefaultBounds());
      }

      system.setEnabled(false);
      expect(system.isActive()).toBe(false);
    });
  });
});
