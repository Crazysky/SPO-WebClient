import { describe, it, expect, beforeEach } from '@jest/globals';
import { CoordinateMapper } from './coordinate-mapper';
import { Rotation } from '../../shared/map-config';

describe('CoordinateMapper', () => {
  const MAP_SIZE = 200;
  let mapper: CoordinateMapper;

  beforeEach(() => {
    mapper = new CoordinateMapper(MAP_SIZE, MAP_SIZE);
  });

  describe('mapToScreen / screenToMap roundtrip', () => {
    const origin = { x: 0, y: 0 };
    const zoomLevel = 2; // u=16

    const testTiles = [
      { i: 100, j: 100, label: 'center' },
      { i: 0, j: 0, label: 'top-left' },
      { i: 0, j: 199, label: 'top-right' },
      { i: 199, j: 0, label: 'bottom-left' },
      { i: 199, j: 199, label: 'bottom-right' },
      { i: 50, j: 150, label: 'off-center' },
      { i: 10, j: 90, label: 'near-top' },
    ];

    const rotations: Rotation[] = [
      Rotation.NORTH,
      Rotation.EAST,
      Rotation.SOUTH,
      Rotation.WEST,
    ];

    for (const rot of rotations) {
      for (const tile of testTiles) {
        it(`roundtrip (${tile.label}: ${tile.i},${tile.j}) rotation=${Rotation[rot]}`, () => {
          const screen = mapper.mapToScreen(tile.i, tile.j, zoomLevel, rot, origin);
          const back = mapper.screenToMap(screen.x, screen.y, zoomLevel, rot, origin);
          expect(back.x).toBe(tile.i);
          expect(back.y).toBe(tile.j);
        });
      }
    }
  });

  describe('rotation changes screen position', () => {
    const origin = { x: 0, y: 0 };
    const zoomLevel = 2;

    it('off-center tile has different screen coords for each rotation', () => {
      const i = 50;
      const j = 150;

      const north = mapper.mapToScreen(i, j, zoomLevel, Rotation.NORTH, origin);
      const east = mapper.mapToScreen(i, j, zoomLevel, Rotation.EAST, origin);
      const south = mapper.mapToScreen(i, j, zoomLevel, Rotation.SOUTH, origin);
      const west = mapper.mapToScreen(i, j, zoomLevel, Rotation.WEST, origin);

      // All 4 rotations should produce different screen positions for an off-center tile
      const positions = [north, east, south, west];
      for (let a = 0; a < positions.length; a++) {
        for (let b = a + 1; b < positions.length; b++) {
          expect(
            positions[a].x !== positions[b].x || positions[a].y !== positions[b].y
          ).toBe(true);
        }
      }
    });

    it('center tile maps to same screen position for all rotations', () => {
      const center = MAP_SIZE / 2;

      const north = mapper.mapToScreen(center, center, zoomLevel, Rotation.NORTH, origin);
      const east = mapper.mapToScreen(center, center, zoomLevel, Rotation.EAST, origin);
      const south = mapper.mapToScreen(center, center, zoomLevel, Rotation.SOUTH, origin);
      const west = mapper.mapToScreen(center, center, zoomLevel, Rotation.WEST, origin);

      expect(east.x).toBe(north.x);
      expect(east.y).toBe(north.y);
      expect(south.x).toBe(north.x);
      expect(south.y).toBe(north.y);
      expect(west.x).toBe(north.x);
      expect(west.y).toBe(north.y);
    });
  });

  describe('180° rotation symmetry', () => {
    const origin = { x: 0, y: 0 };
    const zoomLevel = 2;

    it('SOUTH rotation of tile (i,j) equals NORTH rotation of mirrored tile', () => {
      const i = 30;
      const j = 170;

      const southScreen = mapper.mapToScreen(i, j, zoomLevel, Rotation.SOUTH, origin);

      // Mirrored tile relative to center: (200-i, 200-j)
      const mirrorI = MAP_SIZE - i;
      const mirrorJ = MAP_SIZE - j;
      const northScreen = mapper.mapToScreen(mirrorI, mirrorJ, zoomLevel, Rotation.NORTH, origin);

      expect(southScreen.x).toBe(northScreen.x);
      expect(southScreen.y).toBe(northScreen.y);
    });
  });

  describe('NORTH rotation is identity', () => {
    const origin = { x: 0, y: 0 };
    const zoomLevel = 2;

    it('NORTH rotation produces standard isometric formula result', () => {
      const i = 50;
      const j = 150;
      const u = 16; // zoom level 2
      const rows = MAP_SIZE;
      const cols = MAP_SIZE;

      const screen = mapper.mapToScreen(i, j, zoomLevel, Rotation.NORTH, origin);

      const expectedX = u * (rows - i + j);
      const expectedY = (u / 2) * ((rows - i) + (cols - j));

      expect(screen.x).toBe(expectedX);
      expect(screen.y).toBe(expectedY);
    });
  });

  describe('getVisibleBounds with rotation', () => {
    const zoomLevel = 2;
    const viewport = { x: 0, y: 0, width: 800, height: 600 };
    // Center the viewport on the map center (100,100) which is invariant across rotations
    // At zoom=2 (u=16), center screen coords = (3200, 1600), so origin shifts viewport there
    const origin = { x: 3200 - 400, y: 1600 - 300 };

    for (const rot of [Rotation.NORTH, Rotation.EAST, Rotation.SOUTH, Rotation.WEST]) {
      it(`returns valid bounds for rotation=${Rotation[rot]}`, () => {
        const bounds = mapper.getVisibleBounds(viewport, zoomLevel, rot, origin);

        expect(bounds.minI).toBeLessThanOrEqual(bounds.maxI);
        expect(bounds.minJ).toBeLessThanOrEqual(bounds.maxJ);
        expect(bounds.minI).toBeGreaterThanOrEqual(0);
        expect(bounds.minJ).toBeGreaterThanOrEqual(0);
        expect(bounds.maxI).toBeLessThan(MAP_SIZE);
        expect(bounds.maxJ).toBeLessThan(MAP_SIZE);
      });
    }
  });

  describe('zoom levels', () => {
    const origin = { x: 0, y: 0 };

    it('higher zoom level produces larger screen coordinates', () => {
      const i = 50;
      const j = 150;

      const screen0 = mapper.mapToScreen(i, j, 0, Rotation.NORTH, origin);
      const screen1 = mapper.mapToScreen(i, j, 1, Rotation.NORTH, origin);
      const screen2 = mapper.mapToScreen(i, j, 2, Rotation.NORTH, origin);
      const screen3 = mapper.mapToScreen(i, j, 3, Rotation.NORTH, origin);

      expect(screen1.x).toBe(screen0.x * 2);
      expect(screen1.y).toBe(screen0.y * 2);
      expect(screen2.x).toBe(screen0.x * 4);
      expect(screen2.y).toBe(screen0.y * 4);
      expect(screen3.x).toBe(screen0.x * 8);
      expect(screen3.y).toBe(screen0.y * 8);
    });

    it('roundtrip works for all zoom levels', () => {
      const i = 75;
      const j = 125;

      for (let z = 0; z < 4; z++) {
        const screen = mapper.mapToScreen(i, j, z, Rotation.NORTH, origin);
        const back = mapper.screenToMap(screen.x, screen.y, z, Rotation.NORTH, origin);
        expect(back.x).toBe(i);
        expect(back.y).toBe(j);
      }
    });
  });

  describe('origin offset', () => {
    it('origin shifts screen coordinates', () => {
      const i = 100;
      const j = 100;
      const zoomLevel = 2;

      const noOffset = mapper.mapToScreen(i, j, zoomLevel, Rotation.NORTH, { x: 0, y: 0 });
      const withOffset = mapper.mapToScreen(i, j, zoomLevel, Rotation.NORTH, { x: 100, y: 50 });

      expect(withOffset.x).toBe(noOffset.x - 100);
      expect(withOffset.y).toBe(noOffset.y - 50);
    });

    it('roundtrip works with non-zero origin', () => {
      const i = 80;
      const j = 120;
      const origin = { x: 500, y: 300 };

      for (const rot of [Rotation.NORTH, Rotation.EAST, Rotation.SOUTH, Rotation.WEST]) {
        const screen = mapper.mapToScreen(i, j, 2, rot, origin);
        const back = mapper.screenToMap(screen.x, screen.y, 2, rot, origin);
        expect(back.x).toBe(i);
        expect(back.y).toBe(j);
      }
    });
  });
});
