import { describe, it, expect, beforeEach } from '@jest/globals';
import * as THREE from 'three';
import { PreviewManager } from './PreviewManager';
import { CoordinateMapper3D } from './CoordinateMapper3D';

describe('PreviewManager', () => {
  let previewManager: PreviewManager;
  let scene: THREE.Scene;
  let coordinateMapper: CoordinateMapper3D;

  beforeEach(() => {
    scene = new THREE.Scene();
    coordinateMapper = new CoordinateMapper3D();
    coordinateMapper.setMapDimensions(200, 200);

    previewManager = new PreviewManager(
      scene,
      coordinateMapper,
      () => [], // No buildings
      () => []  // No segments
    );
  });

  describe('generateStaircasePath', () => {
    it('should generate horizontal path from (0,0) to (5,0)', () => {
      const path = previewManager.generateStaircasePath(0, 0, 5, 0);

      expect(path.length).toBe(6); // Start + 5 tiles
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[5]).toEqual({ x: 5, y: 0 });

      // Verify all tiles are on same row
      path.forEach(tile => {
        expect(tile.y).toBe(0);
      });
    });

    it('should generate vertical path from (0,0) to (0,5)', () => {
      const path = previewManager.generateStaircasePath(0, 0, 0, 5);

      expect(path.length).toBe(6);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[5]).toEqual({ x: 0, y: 5 });

      // Verify all tiles are on same column
      path.forEach(tile => {
        expect(tile.x).toBe(0);
      });
    });

    it('should generate diagonal staircase from (0,0) to (5,5)', () => {
      const path = previewManager.generateStaircasePath(0, 0, 5, 5);

      expect(path.length).toBe(11); // Start + 5 X moves + 5 Y moves
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[10]).toEqual({ x: 5, y: 5 });

      // Verify staircase pattern (prioritizes X when equal)
      // Should go: (0,0) -> (1,0) -> (1,1) -> (2,1) -> (2,2) -> ...
      expect(path[1]).toEqual({ x: 1, y: 0 }); // X first
      expect(path[2]).toEqual({ x: 1, y: 1 }); // Then Y
      expect(path[3]).toEqual({ x: 2, y: 1 }); // X again
    });

    it('should handle negative coordinates', () => {
      const path = previewManager.generateStaircasePath(0, 0, -3, -3);

      expect(path.length).toBe(7);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[6]).toEqual({ x: -3, y: -3 });
    });

    it('should handle single tile (same start and end)', () => {
      const path = previewManager.generateStaircasePath(5, 5, 5, 5);

      expect(path.length).toBe(1);
      expect(path[0]).toEqual({ x: 5, y: 5 });
    });
  });

  describe('validateRoadPath', () => {
    it('should return valid for first road (no connectivity requirement)', () => {
      const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
      const validation = previewManager.validateRoadPath(path);

      expect(validation.hasCollision).toBe(false);
      expect(validation.connectsToRoad).toBe(true); // First road always connects
    });

    it('should detect building collision', () => {
      // Create preview manager with a building
      const buildings = [{ x: 2, y: 2, visualClass: 'Test.Headquarters', name: 'Test HQ' }];
      const pmWithBuilding = new PreviewManager(
        scene,
        coordinateMapper,
        () => buildings as any,
        () => []
      );

      const path = [{ x: 2, y: 2 }]; // Overlaps building
      const validation = pmWithBuilding.validateRoadPath(path);

      expect(validation.hasCollision).toBe(true);
    });

    it('should validate road connectivity with existing roads', () => {
      // Create preview manager with an existing road segment
      const segments = [{ x1: 0, y1: 0, x2: 5, y2: 0 }];
      const pmWithRoad = new PreviewManager(
        scene,
        coordinateMapper,
        () => [],
        () => segments as any
      );

      // Path adjacent to existing road (8-neighbor)
      const adjacentPath = [{ x: 0, y: 1 }]; // One tile below existing road
      const adjacentValidation = pmWithRoad.validateRoadPath(adjacentPath);
      expect(adjacentValidation.connectsToRoad).toBe(true);

      // Path not adjacent to existing road
      const isolatedPath = [{ x: 10, y: 10 }];
      const isolatedValidation = pmWithRoad.validateRoadPath(isolatedPath);
      expect(isolatedValidation.connectsToRoad).toBe(false);
    });
  });

  describe('checkBuildingCollision', () => {
    it('should return false when no buildings or roads exist', () => {
      const hasCollision = previewManager.checkBuildingCollision(0, 0, 1, 1);
      expect(hasCollision).toBe(false);
    });

    it('should detect collision with single-tile building', () => {
      const buildings = [{ x: 5, y: 5, visualClass: 'Test.Building', name: 'Test' }];
      const pmWithBuilding = new PreviewManager(
        scene,
        coordinateMapper,
        () => buildings as any,
        () => []
      );

      // Colliding
      expect(pmWithBuilding.checkBuildingCollision(5, 5, 1, 1)).toBe(true);

      // Not colliding
      expect(pmWithBuilding.checkBuildingCollision(6, 6, 1, 1)).toBe(false);
    });

    it('should detect collision with multi-tile building (2x2)', () => {
      const buildings = [{ x: 5, y: 5, visualClass: 'Test.LargeBuilding', name: 'Test' }];
      const pmWithBuilding = new PreviewManager(
        scene,
        coordinateMapper,
        () => buildings as any,
        () => []
      );

      // Assuming getFacility returns 2x2 for this building
      // These positions should collide: (5,5), (5,6), (6,5), (6,6)
      expect(pmWithBuilding.checkBuildingCollision(5, 5, 1, 1)).toBe(true);
      expect(pmWithBuilding.checkBuildingCollision(6, 6, 1, 1)).toBe(true);

      // Just outside the 2x2 footprint
      expect(pmWithBuilding.checkBuildingCollision(7, 7, 1, 1)).toBe(false);
    });

    it('should detect collision with road segment', () => {
      const segments = [{ x1: 0, y1: 0, x2: 5, y2: 0 }]; // Horizontal road
      const pmWithRoad = new PreviewManager(
        scene,
        coordinateMapper,
        () => [],
        () => segments as any
      );

      // On the road
      expect(pmWithRoad.checkBuildingCollision(0, 2, 1, 1)).toBe(true);

      // Not on the road
      expect(pmWithRoad.checkBuildingCollision(1, 0, 1, 1)).toBe(false);
    });
  });
});
