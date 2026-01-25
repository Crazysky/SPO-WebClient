/**
 * Unit Tests for Building Data Service
 * Tests for BuildingDataService class
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { BuildingDataService, FacilityDimensions } from './building-data-service';

// Mock logger to prevent console spam during tests
jest.mock('../shared/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

describe('BuildingDataService', () => {
  let service: BuildingDataService;

  beforeAll(async () => {
    service = new BuildingDataService();
    await service.initialize();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(service.isInitialized()).toBe(true);
    });

    it('should be healthy after initialization', () => {
      expect(service.isHealthy()).toBe(true);
    });

    it('should load buildings into cache', () => {
      const stats = service.getStats();
      expect(stats.total).toBeGreaterThan(0);
    });

    it('should have clusters in stats', () => {
      const stats = service.getStats();
      expect(stats.clusters).toBeDefined();
      expect(Object.keys(stats.clusters).length).toBeGreaterThan(0);
    });

    it('should not re-initialize if already initialized', async () => {
      const service2 = new BuildingDataService();
      await service2.initialize();
      await service2.initialize(); // Should not throw
      expect(service2.isInitialized()).toBe(true);
    });
  });

  describe('getBuilding() - Lookup by visualClass', () => {
    it('should find building by complete visualClass', () => {
      // PGI Food Store has visualClass 4602 (Base: 4601, VS: 1)
      const building = service.getBuilding('4602');
      expect(building).toBeDefined();
      expect(building!.name).toBe('PGIFoodStore');
    });

    it('should find building by base visualClass (construction)', () => {
      // Base visualClass 4601 should resolve to the complete building
      const building = service.getBuilding('4601');
      expect(building).toBeDefined();
      expect(building!.name).toBe('PGIFoodStore');
    });

    it('should return undefined for unknown visualClass', () => {
      const building = service.getBuilding('99999');
      expect(building).toBeUndefined();
    });

    it('should find multiple buildings from different clusters', () => {
      // PGI building
      const pgiBuilding = service.getBuilding('4602');
      expect(pgiBuilding?.cluster).toBe('PGI');

      // Moab building - MoabTownHall at visualClass 1501
      const moabBuilding = service.getBuilding('1501');
      expect(moabBuilding?.cluster).toBe('Moab');
    });
  });

  describe('getBuildingByName()', () => {
    it('should find building by name', () => {
      const building = service.getBuildingByName('PGIFoodStore');
      expect(building).toBeDefined();
      expect(building!.visualClass).toBe('4602');
    });

    it('should return undefined for unknown name', () => {
      const building = service.getBuildingByName('NonExistentBuilding');
      expect(building).toBeUndefined();
    });
  });

  describe('getTextureFilename()', () => {
    it('should return texture filename for complete building', () => {
      const texture = service.getTextureFilename('4602');
      expect(texture).toBe('MapPGIFoodStore64x32x0.gif');
    });

    it('should return construction texture for base visualClass', () => {
      // Base visualClass 4601 should return construction texture
      const texture = service.getTextureFilename('4601');
      expect(texture).toBe('Construction64.gif');
    });

    it('should return undefined for unknown visualClass', () => {
      const texture = service.getTextureFilename('99999');
      expect(texture).toBeUndefined();
    });
  });

  describe('isConstructionState()', () => {
    it('should return true for base visualClass', () => {
      // 4601 is base visualClass for PGIFoodStore
      expect(service.isConstructionState('4601')).toBe(true);
    });

    it('should return false for complete visualClass', () => {
      // 4602 is complete visualClass for PGIFoodStore
      expect(service.isConstructionState('4602')).toBe(false);
    });

    it('should return false for unknown visualClass', () => {
      expect(service.isConstructionState('99999')).toBe(false);
    });
  });

  describe('isEmptyState()', () => {
    it('should return true for empty residential visualClass', () => {
      // Find a residential building with empty state
      const allBuildings = service.getAllBuildings();
      const residentialWithEmpty = allBuildings.find(b => b.emptyVisualClass);

      if (residentialWithEmpty) {
        expect(service.isEmptyState(residentialWithEmpty.emptyVisualClass!)).toBe(true);
      }
    });

    it('should return false for complete visualClass', () => {
      expect(service.isEmptyState('4602')).toBe(false);
    });

    it('should return false for unknown visualClass', () => {
      expect(service.isEmptyState('99999')).toBe(false);
    });
  });

  describe('getFacility() - Backward compatibility', () => {
    it('should return FacilityDimensions for valid visualClass', () => {
      const facility = service.getFacility('4602');
      expect(facility).toBeDefined();
      expect(facility!.visualClass).toBe('4602');
      expect(facility!.name).toBe('PGIFoodStore');
      expect(facility!.xsize).toBeGreaterThan(0);
      expect(facility!.ysize).toBeGreaterThan(0);
    });

    it('should include texture filenames in FacilityDimensions', () => {
      const facility = service.getFacility('4602');
      expect(facility).toBeDefined();
      expect(facility!.textureFilename).toBe('MapPGIFoodStore64x32x0.gif');
      expect(facility!.constructionTextureFilename).toBe('Construction64.gif');
    });

    it('should return undefined for unknown visualClass', () => {
      const facility = service.getFacility('99999');
      expect(facility).toBeUndefined();
    });

    it('should have required FacilityDimensions properties', () => {
      const facility = service.getFacility('4602');
      expect(facility).toBeDefined();

      // Check all required properties exist
      expect(typeof facility!.visualClass).toBe('string');
      expect(typeof facility!.name).toBe('string');
      expect(typeof facility!.facid).toBe('string');
      expect(typeof facility!.xsize).toBe('number');
      expect(typeof facility!.ysize).toBe('number');
      expect(typeof facility!.level).toBe('number');
    });
  });

  describe('getAllBuildings()', () => {
    it('should return array of all buildings', () => {
      const buildings = service.getAllBuildings();
      expect(Array.isArray(buildings)).toBe(true);
      expect(buildings.length).toBeGreaterThan(0);
    });

    it('should return buildings with all required properties', () => {
      const buildings = service.getAllBuildings();
      const building = buildings[0];

      expect(building.visualClass).toBeDefined();
      expect(building.name).toBeDefined();
      expect(building.xsize).toBeDefined();
      expect(building.ysize).toBeDefined();
      expect(building.textureFilename).toBeDefined();
    });
  });

  describe('getBuildingsByCluster()', () => {
    it('should return only buildings from specified cluster', () => {
      const pgiBuildings = service.getBuildingsByCluster('PGI');
      expect(pgiBuildings.length).toBeGreaterThan(0);
      expect(pgiBuildings.every(b => b.cluster === 'PGI')).toBe(true);
    });

    it('should return empty array for unknown cluster', () => {
      const buildings = service.getBuildingsByCluster('NonExistentCluster');
      expect(buildings).toEqual([]);
    });
  });

  describe('getBuildingsByCategory()', () => {
    it('should return only buildings from specified category', () => {
      const commerceBuildings = service.getBuildingsByCategory('commerce');
      expect(commerceBuildings.length).toBeGreaterThan(0);
      expect(commerceBuildings.every(b => b.category === 'commerce')).toBe(true);
    });

    it('should return empty array for unknown category', () => {
      const buildings = service.getBuildingsByCategory('NonExistentCategory');
      expect(buildings).toEqual([]);
    });
  });

  describe('getCache() and getAllBuildingsAsObject()', () => {
    it('should return Map from getCache()', () => {
      const cache = service.getCache();
      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBeGreaterThan(0);
    });

    it('should return plain object from getAllBuildingsAsObject()', () => {
      const obj = service.getAllBuildingsAsObject();
      expect(typeof obj).toBe('object');
      expect(Object.keys(obj).length).toBeGreaterThan(0);
    });

    it('should have same number of entries in both', () => {
      const cache = service.getCache();
      const obj = service.getAllBuildingsAsObject();
      expect(cache.size).toBe(Object.keys(obj).length);
    });
  });

  describe('Building data integrity', () => {
    it('should have valid xsize and ysize for all buildings', () => {
      const buildings = service.getAllBuildings();
      for (const building of buildings) {
        expect(building.xsize).toBeGreaterThan(0);
        expect(building.ysize).toBeGreaterThan(0);
      }
    });

    it('should have valid texture filenames', () => {
      const buildings = service.getAllBuildings();
      for (const building of buildings) {
        expect(building.textureFilename).toMatch(/\.gif$/i); // case-insensitive
        expect(building.constructionTextureFilename).toMatch(/Construction\d+\.gif$/i);
      }
    });

    it('should have consistent visualClass formula', () => {
      // For all buildings: Complete = Base + VisualStages
      const buildings = service.getAllBuildings();
      for (const building of buildings) {
        const base = parseInt(building.baseVisualClass, 10);
        const complete = parseInt(building.visualClass, 10);
        const visualStages = building.visualStages;

        expect(complete).toBe(base + visualStages);
      }
    });
  });

  describe('Specific building types', () => {
    it('should have PGI commerce buildings', () => {
      const foodStore = service.getBuilding('4602');
      expect(foodStore).toBeDefined();
      expect(foodStore!.name).toBe('PGIFoodStore');
      expect(foodStore!.xsize).toBe(1); // 1x1 store from CSV
      expect(foodStore!.ysize).toBe(1);
    });

    it('should have Moab buildings', () => {
      const moabBuildings = service.getBuildingsByCluster('Moab');
      expect(moabBuildings.length).toBeGreaterThan(0);
    });

    it('should have various building sizes', () => {
      const buildings = service.getAllBuildings();
      const sizes = new Set<string>();

      for (const building of buildings) {
        sizes.add(`${building.xsize}x${building.ysize}`);
      }

      // Should have multiple different sizes
      expect(sizes.size).toBeGreaterThan(1);
    });
  });
});
