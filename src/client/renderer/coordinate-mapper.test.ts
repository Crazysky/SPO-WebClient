/**
 * Unit tests for CoordinateMapper
 * Tests the Lander.pas isometric transformation algorithm
 */

import { CoordinateMapper } from './coordinate-mapper';
import { Rotation } from '../../shared/map-config';

describe('CoordinateMapper', () => {
  let mapper: CoordinateMapper;

  beforeEach(() => {
    mapper = new CoordinateMapper(2000, 2000);
  });

  describe('mapToScreen', () => {
    it('should convert map origin (0,0) to screen coordinates at zoom level 2', () => {
      const result = mapper.mapToScreen(0, 0, 2, Rotation.NORTH, { x: 0, y: 0 });
      expect(result.x).toBe(2 * 16 * (2000 - 0 + 0)); // 64000
      expect(result.y).toBe(16 * ((2000 - 0) + (2000 - 0))); // 64000
    });

    it('should convert map center (1000,1000) to screen coordinates', () => {
      const result = mapper.mapToScreen(1000, 1000, 2, Rotation.NORTH, { x: 0, y: 0 });
      expect(result.x).toBe(2 * 16 * (2000 - 1000 + 1000)); // 64000
      expect(result.y).toBe(16 * ((2000 - 1000) + (2000 - 1000))); // 32000
    });

    it('should scale properly at different zoom levels', () => {
      const point = { i: 100, j: 100 };
      const origin = { x: 0, y: 0 };

      const zoom0 = mapper.mapToScreen(point.i, point.j, 0, Rotation.NORTH, origin);
      const zoom1 = mapper.mapToScreen(point.i, point.j, 1, Rotation.NORTH, origin);
      const zoom2 = mapper.mapToScreen(point.i, point.j, 2, Rotation.NORTH, origin);
      const zoom3 = mapper.mapToScreen(point.i, point.j, 3, Rotation.NORTH, origin);

      // Each zoom level should double the coordinates
      expect(zoom1.x).toBe(zoom0.x * 2);
      expect(zoom1.y).toBe(zoom0.y * 2);
      expect(zoom2.x).toBe(zoom1.x * 2);
      expect(zoom2.y).toBe(zoom1.y * 2);
      expect(zoom3.x).toBe(zoom2.x * 2);
      expect(zoom3.y).toBe(zoom2.y * 2);
    });
  });

  describe('screenToMap', () => {
    it('should convert screen coordinates back to map coordinates (roundtrip test)', () => {
      const original = { i: 500, j: 750 };
      const origin = { x: 0, y: 0 };

      for (let zoom = 0; zoom <= 3; zoom++) {
        const screen = mapper.mapToScreen(original.i, original.j, zoom, Rotation.NORTH, origin);
        const result = mapper.screenToMap(screen.x, screen.y, zoom, Rotation.NORTH, origin);

        expect(result.x).toBe(original.i);
        expect(result.y).toBe(original.j);
      }
    });

    it('should work with camera offset (roundtrip test)', () => {
      const original = { i: 1200, j: 800 };
      const origin = { x: 12345, y: 67890 };

      const screen = mapper.mapToScreen(original.i, original.j, 2, Rotation.NORTH, origin);
      const result = mapper.screenToMap(screen.x, screen.y, 2, Rotation.NORTH, origin);

      expect(result.x).toBe(original.i);
      expect(result.y).toBe(original.j);
    });

    it('should work at map boundaries (roundtrip test)', () => {
      const origin = { x: 0, y: 0 };
      const testPoints = [
        { i: 0, j: 0 },           // Top-left corner
        { i: 0, j: 1999 },        // Top-right corner
        { i: 1999, j: 0 },        // Bottom-left corner
        { i: 1999, j: 1999 },     // Bottom-right corner
        { i: 1000, j: 1000 }      // Center
      ];

      for (const point of testPoints) {
        const screen = mapper.mapToScreen(point.i, point.j, 2, Rotation.NORTH, origin);
        const result = mapper.screenToMap(screen.x, screen.y, 2, Rotation.NORTH, origin);

        expect(result.x).toBe(point.i);
        expect(result.y).toBe(point.j);
      }
    });
  });

  describe.skip('rotation', () => {
    // TODO: Implement rotation correctly after studying original client behavior
    it('should preserve coordinates after 4 rotations (360 degrees)', () => {
      const original = { i: 500, j: 750 };
      const origin = { x: 0, y: 0 };

      // Apply all 4 rotations in sequence
      const north = mapper.mapToScreen(original.i, original.j, 2, Rotation.NORTH, origin);
      const east = mapper.mapToScreen(original.i, original.j, 2, Rotation.EAST, origin);
      const south = mapper.mapToScreen(original.i, original.j, 2, Rotation.SOUTH, origin);
      const west = mapper.mapToScreen(original.i, original.j, 2, Rotation.WEST, origin);

      // All should be different
      expect(north).not.toEqual(east);
      expect(east).not.toEqual(south);
      expect(south).not.toEqual(west);

      // But converting back from any rotation should give original coordinates
      const fromNorth = mapper.screenToMap(north.x, north.y, 2, Rotation.NORTH, origin);
      const fromEast = mapper.screenToMap(east.x, east.y, 2, Rotation.EAST, origin);
      const fromSouth = mapper.screenToMap(south.x, south.y, 2, Rotation.SOUTH, origin);
      const fromWest = mapper.screenToMap(west.x, west.y, 2, Rotation.WEST, origin);

      expect(fromNorth.x).toBe(original.i);
      expect(fromNorth.y).toBe(original.j);
      expect(fromEast.x).toBe(original.i);
      expect(fromEast.y).toBe(original.j);
      expect(fromSouth.x).toBe(original.i);
      expect(fromSouth.y).toBe(original.j);
      expect(fromWest.x).toBe(original.i);
      expect(fromWest.y).toBe(original.j);
    });
  });

  describe('getVisibleBounds', () => {
    it('should return valid bounds for a viewport', () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const origin = { x: 0, y: 0 };

      const bounds = mapper.getVisibleBounds(viewport, 2, Rotation.NORTH, origin);

      expect(bounds.minI).toBeGreaterThanOrEqual(0);
      expect(bounds.maxI).toBeLessThan(2000);
      expect(bounds.minJ).toBeGreaterThanOrEqual(0);
      expect(bounds.maxJ).toBeLessThan(2000);
      expect(bounds.minI).toBeLessThanOrEqual(bounds.maxI);
      expect(bounds.minJ).toBeLessThanOrEqual(bounds.maxJ);
    });

    it('should return smaller bounds at higher zoom levels', () => {
      const viewport = { x: 0, y: 0, width: 800, height: 600 };
      const origin = { x: 32000, y: 32000 }; // Center of map

      const bounds0 = mapper.getVisibleBounds(viewport, 0, Rotation.NORTH, origin);
      const bounds3 = mapper.getVisibleBounds(viewport, 3, Rotation.NORTH, origin);

      const area0 = (bounds0.maxI - bounds0.minI) * (bounds0.maxJ - bounds0.minJ);
      const area3 = (bounds3.maxI - bounds3.minI) * (bounds3.maxJ - bounds3.minJ);

      // Higher zoom (3) should show fewer tiles than lower zoom (0)
      expect(area3).toBeLessThan(area0);
    });

    it('should clamp bounds to map limits', () => {
      const viewport = { x: -10000, y: -10000, width: 100000, height: 100000 };
      const origin = { x: 0, y: 0 };

      const bounds = mapper.getVisibleBounds(viewport, 2, Rotation.NORTH, origin);

      expect(bounds.minI).toBeGreaterThanOrEqual(0);
      expect(bounds.maxI).toBeLessThanOrEqual(1999);
      expect(bounds.minJ).toBeGreaterThanOrEqual(0);
      expect(bounds.maxJ).toBeLessThanOrEqual(1999);
    });
  });
});
