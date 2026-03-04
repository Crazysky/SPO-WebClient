/**
 * Tests for placement validation logic.
 *
 * Rules:
 * - Building/road collision: ANY single tile overlapping = blocked
 * - Reserved zone (ZoneType.RESERVED = 1): ANY single tile = blocked
 * - Zone requirement mismatch: only blocked when ALL tiles are in a wrong zone
 *   (a tile "passes" if it matches the required zone or is "no zone" = 0)
 */

import { ZoneType } from '../../shared/types';
import { validatePlacementZones, PlacementTileZone } from './placement-validation';

describe('validatePlacementZones', () => {
  // Helpers
  const tile = (zoneValue: number | undefined): PlacementTileZone => ({ zoneValue });

  describe('no zone requirement (requiredZoneValue = 0)', () => {
    it('should be valid when no collision and no reserved zones', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.COMMERCIAL), tile(ZoneType.NONE)],
        0,
        false,
      );
      expect(result.isInvalid).toBe(false);
      expect(result.hasZoneMismatch).toBe(false);
      expect(result.hasReservedZone).toBe(false);
    });

    it('should be invalid when collision exists', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.NONE)],
        0,
        true,
      );
      expect(result.isInvalid).toBe(true);
      expect(result.hasCollision).toBe(true);
    });
  });

  describe('reserved zone blocking', () => {
    it('should block when ANY single tile is on reserved zone', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.COMMERCIAL), tile(ZoneType.RESERVED), tile(ZoneType.COMMERCIAL)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.isInvalid).toBe(true);
      expect(result.hasReservedZone).toBe(true);
    });

    it('should block even when the only tile is reserved', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.RESERVED)],
        0,
        false,
      );
      expect(result.isInvalid).toBe(true);
      expect(result.hasReservedZone).toBe(true);
    });

    it('should not block when no tiles are reserved', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.INDUSTRIAL), tile(ZoneType.NONE)],
        0,
        false,
      );
      expect(result.hasReservedZone).toBe(false);
      expect(result.isInvalid).toBe(false);
    });
  });

  describe('zone requirement — all-tiles-mismatched rule', () => {
    it('should be valid when all tiles match the required zone', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.COMMERCIAL), tile(ZoneType.COMMERCIAL)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.hasZoneMismatch).toBe(false);
      expect(result.isInvalid).toBe(false);
    });

    it('should be valid when some tiles are "no zone" (0)', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.COMMERCIAL), tile(ZoneType.NONE)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.hasZoneMismatch).toBe(false);
      expect(result.isInvalid).toBe(false);
    });

    it('should be valid when at least one tile matches the required zone (partial mismatch)', () => {
      // 2 tiles: one is industrial (wrong), one is commercial (right)
      const result = validatePlacementZones(
        [tile(ZoneType.INDUSTRIAL), tile(ZoneType.COMMERCIAL)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.hasZoneMismatch).toBe(false);
      expect(result.isInvalid).toBe(false);
    });

    it('should be valid when at least one tile is "no zone" among wrong zones', () => {
      // 3 tiles: two industrial (wrong), one "no zone" (passes)
      const result = validatePlacementZones(
        [tile(ZoneType.INDUSTRIAL), tile(ZoneType.NONE), tile(ZoneType.INDUSTRIAL)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.hasZoneMismatch).toBe(false);
      expect(result.isInvalid).toBe(false);
    });

    it('should block when ALL tiles are in a wrong zone', () => {
      // All tiles are industrial, but we need commercial
      const result = validatePlacementZones(
        [tile(ZoneType.INDUSTRIAL), tile(ZoneType.RESIDENTIAL), tile(ZoneType.INDUSTRIAL)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.hasZoneMismatch).toBe(true);
      expect(result.isInvalid).toBe(true);
    });

    it('should block when single tile is in a wrong zone', () => {
      // 1x1 building with one tile in wrong zone = all tiles mismatched
      const result = validatePlacementZones(
        [tile(ZoneType.INDUSTRIAL)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.hasZoneMismatch).toBe(true);
      expect(result.isInvalid).toBe(true);
    });
  });

  describe('tiles with undefined zone data', () => {
    it('should skip tiles with no zone data', () => {
      const result = validatePlacementZones(
        [tile(undefined), tile(undefined)],
        ZoneType.COMMERCIAL,
        false,
      );
      // No tiles checked, so no mismatch
      expect(result.hasZoneMismatch).toBe(false);
      expect(result.isInvalid).toBe(false);
    });

    it('should only check tiles with zone data', () => {
      // 1 tile with wrong zone + 1 tile with no data → 1/1 checked = all mismatched
      const result = validatePlacementZones(
        [tile(ZoneType.INDUSTRIAL), tile(undefined)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.hasZoneMismatch).toBe(true);
      expect(result.isInvalid).toBe(true);
    });
  });

  describe('combined scenarios', () => {
    it('collision takes priority even when zones are fine', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.COMMERCIAL)],
        ZoneType.COMMERCIAL,
        true,
      );
      expect(result.isInvalid).toBe(true);
      expect(result.hasCollision).toBe(true);
      expect(result.hasZoneMismatch).toBe(false);
    });

    it('reserved + zone mismatch both flag', () => {
      const result = validatePlacementZones(
        [tile(ZoneType.RESERVED), tile(ZoneType.INDUSTRIAL)],
        ZoneType.COMMERCIAL,
        false,
      );
      expect(result.isInvalid).toBe(true);
      expect(result.hasReservedZone).toBe(true);
      expect(result.hasZoneMismatch).toBe(true);
    });

    it('real-world: 3x3 building mostly in right zone with one wrong tile', () => {
      // 9 tiles: 8 commercial + 1 residential → NOT all mismatched → valid
      const tiles = [
        tile(ZoneType.COMMERCIAL), tile(ZoneType.COMMERCIAL), tile(ZoneType.COMMERCIAL),
        tile(ZoneType.COMMERCIAL), tile(ZoneType.RESIDENTIAL), tile(ZoneType.COMMERCIAL),
        tile(ZoneType.COMMERCIAL), tile(ZoneType.COMMERCIAL), tile(ZoneType.COMMERCIAL),
      ];
      const result = validatePlacementZones(tiles, ZoneType.COMMERCIAL, false);
      expect(result.hasZoneMismatch).toBe(false);
      expect(result.isInvalid).toBe(false);
    });

    it('real-world: 2x2 building entirely in wrong zone', () => {
      const tiles = [
        tile(ZoneType.INDUSTRIAL), tile(ZoneType.INDUSTRIAL),
        tile(ZoneType.INDUSTRIAL), tile(ZoneType.INDUSTRIAL),
      ];
      const result = validatePlacementZones(tiles, ZoneType.COMMERCIAL, false);
      expect(result.hasZoneMismatch).toBe(true);
      expect(result.isInvalid).toBe(true);
    });
  });
});
