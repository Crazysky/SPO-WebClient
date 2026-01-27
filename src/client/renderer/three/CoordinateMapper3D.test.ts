/**
 * Tests for CoordinateMapper3D
 *
 * Validates isometric coordinate conversions between:
 * - Map coordinates (i, j)
 * - Three.js world coordinates (x, y, z)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock THREE.Vector3 for testing
class MockVector3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
}

// Mock the three module
jest.mock('three', () => ({
  Vector3: MockVector3,
  Vector2: class MockVector2 {
    constructor(public x: number = 0, public y: number = 0) {}
  }
}));

import { CoordinateMapper3D } from './CoordinateMapper3D';

describe('CoordinateMapper3D', () => {
  let mapper: CoordinateMapper3D;

  beforeEach(() => {
    mapper = new CoordinateMapper3D(2000, 2000);
  });

  describe('mapToWorld', () => {
    it('should convert origin (0,0) to correct world position', () => {
      const world = mapper.mapToWorld(0, 0);
      // At (0,0): x = (0-0)*16 = 0, z = -(0+0)*8 = 0
      expect(world.x).toBeCloseTo(0);
      expect(world.y).toBeCloseTo(0);
      expect(world.z).toBeCloseTo(0);
    });

    it('should move left when i increases', () => {
      const pos0 = mapper.mapToWorld(0, 0);
      const pos1 = mapper.mapToWorld(1, 0);
      // i increases -> x decreases (moves left)
      expect(pos1.x).toBeLessThan(pos0.x);
    });

    it('should move right when j increases', () => {
      const pos0 = mapper.mapToWorld(0, 0);
      const pos1 = mapper.mapToWorld(0, 1);
      // j increases -> x increases (moves right)
      expect(pos1.x).toBeGreaterThan(pos0.x);
    });

    it('should move back (negative z) when i or j increases', () => {
      const pos0 = mapper.mapToWorld(0, 0);
      const pos1 = mapper.mapToWorld(1, 0);
      const pos2 = mapper.mapToWorld(0, 1);
      // Both i and j increase -> z decreases (moves back)
      expect(pos1.z).toBeLessThan(pos0.z);
      expect(pos2.z).toBeLessThan(pos0.z);
    });

    it('should have y=0 (ground plane)', () => {
      const pos = mapper.mapToWorld(50, 75);
      expect(pos.y).toBe(0);
    });

    it('should calculate diagonal movement correctly', () => {
      // Moving diagonally in map space (i+1, j+1) should move straight back in world
      const pos0 = mapper.mapToWorld(10, 10);
      const pos1 = mapper.mapToWorld(11, 11);
      // x should be same (i and j cancel out)
      expect(pos1.x).toBe(pos0.x);
      // z should decrease by tileHeight (16)
      expect(pos1.z).toBe(pos0.z - 16);
    });
  });

  describe('worldToMap', () => {
    it('should convert world origin to map (0,0)', () => {
      const map = mapper.worldToMap(0, 0);
      expect(map.x).toBeCloseTo(0);
      expect(map.y).toBeCloseTo(0);
    });

    it('should be inverse of mapToWorld', () => {
      const testCases = [
        { i: 0, j: 0 },
        { i: 100, j: 100 },
        { i: 50, j: 150 },
        { i: 1000, j: 1000 },
        { i: 0, j: 500 },
        { i: 500, j: 0 }
      ];

      for (const { i, j } of testCases) {
        const world = mapper.mapToWorld(i, j);
        const mapBack = mapper.worldToMap(world.x, world.z);
        expect(mapBack.x).toBe(i);
        expect(mapBack.y).toBe(j);
      }
    });
  });

  describe('worldToMapPrecise', () => {
    it('should return floating point coordinates', () => {
      const world = mapper.mapToWorld(10, 10);
      // Offset slightly
      const precise = mapper.worldToMapPrecise(world.x + 5, world.z - 2);
      expect(typeof precise.i).toBe('number');
      expect(typeof precise.j).toBe('number');
      // Should not be exact integers due to offset
      expect(precise.i % 1).not.toBe(0);
      expect(precise.j % 1).not.toBe(0);
    });
  });

  describe('getMapCenterWorld', () => {
    it('should return center of 2000x2000 map', () => {
      const center = mapper.getMapCenterWorld();
      const expected = mapper.mapToWorld(1000, 1000);
      expect(center.x).toBe(expected.x);
      expect(center.y).toBe(expected.y);
      expect(center.z).toBe(expected.z);
    });
  });

  describe('getTileCorners', () => {
    it('should return 4 corners', () => {
      const corners = mapper.getTileCorners(0, 0);
      expect(corners).toHaveLength(4);
    });

    it('should form a diamond shape', () => {
      const corners = mapper.getTileCorners(10, 10);
      const center = mapper.mapToWorld(10, 10);

      // Top should be above center (smaller z)
      expect(corners[0].z).toBeLessThan(center.z);
      // Bottom should be below center (larger z)
      expect(corners[2].z).toBeGreaterThan(center.z);
      // Right should be right of center (larger x)
      expect(corners[1].x).toBeGreaterThan(center.x);
      // Left should be left of center (smaller x)
      expect(corners[3].x).toBeLessThan(center.x);
    });

    it('should have all corners on ground plane (y=0)', () => {
      const corners = mapper.getTileCorners(50, 50);
      for (const corner of corners) {
        expect(corner.y).toBe(0);
      }
    });
  });

  describe('getRenderOrder', () => {
    it('should increase with higher layer', () => {
      const order0 = mapper.getRenderOrder(10, 10, 0);
      const order1 = mapper.getRenderOrder(10, 10, 1);
      const order2 = mapper.getRenderOrder(10, 10, 2);
      expect(order1).toBeGreaterThan(order0);
      expect(order2).toBeGreaterThan(order1);
    });

    it('should increase with higher i+j (depth)', () => {
      const orderNear = mapper.getRenderOrder(10, 10, 0);
      const orderFar = mapper.getRenderOrder(20, 20, 0);
      expect(orderFar).toBeGreaterThan(orderNear);
    });

    it('should separate layers by large margin', () => {
      const layer0Max = mapper.getRenderOrder(1999, 1999, 0);
      const layer1Min = mapper.getRenderOrder(0, 0, 1);
      expect(layer1Min).toBeGreaterThan(layer0Max);
    });
  });

  describe('map dimensions', () => {
    it('should return correct width and height', () => {
      expect(mapper.getMapWidth()).toBe(2000);
      expect(mapper.getMapHeight()).toBe(2000);
    });

    it('should allow setting dimensions', () => {
      mapper.setMapDimensions(500, 600);
      expect(mapper.getMapWidth()).toBe(500);
      expect(mapper.getMapHeight()).toBe(600);
    });
  });

  describe('static tile dimensions', () => {
    it('should return base tile dimensions', () => {
      expect(CoordinateMapper3D.getTileWidth()).toBe(32);
      expect(CoordinateMapper3D.getTileHeight()).toBe(16);
    });
  });

  describe('getBuildingWorldSize', () => {
    it('should calculate 1x1 building size', () => {
      const size = mapper.getBuildingWorldSize(1, 1);
      // 1x1: width = (1+1)*16 = 32, depth = (1+1)*8 = 16
      expect(size.width).toBe(32);
      expect(size.depth).toBe(16);
    });

    it('should calculate larger building size', () => {
      const size = mapper.getBuildingWorldSize(3, 2);
      // 3x2: width = (3+2)*16 = 80, depth = (3+2)*8 = 40
      expect(size.width).toBe(80);
      expect(size.depth).toBe(40);
    });
  });
});
