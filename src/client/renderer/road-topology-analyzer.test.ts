/**
 * Unit tests for RoadTopologyAnalyzer
 */

import {
  RoadTopology,
  RoadSurface,
  RoadTransitionTables,
  RoadTopologyAnalyzer,
  type ConnectionIndex,
} from './road-topology-analyzer';

describe('RoadTopologyAnalyzer', () => {
  describe('getConnectionIndex', () => {
    it('should return 0 for no connections', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(false, false, false, false)).toBe(0);
    });

    it('should return 1 for North only', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(true, false, false, false)).toBe(1);
    });

    it('should return 2 for East only', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(false, true, false, false)).toBe(2);
    });

    it('should return 4 for South only', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(false, false, true, false)).toBe(4);
    });

    it('should return 8 for West only', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(false, false, false, true)).toBe(8);
    });

    it('should return 5 for North-South (1 + 4)', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(true, false, true, false)).toBe(5);
    });

    it('should return 10 for East-West (2 + 8)', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(false, true, false, true)).toBe(10);
    });

    it('should return 15 for all connections (1 + 2 + 4 + 8)', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(true, true, true, true)).toBe(15);
    });

    it('should return 3 for North-East (1 + 2)', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(true, true, false, false)).toBe(3);
    });

    it('should return 12 for South-West (4 + 8)', () => {
      expect(RoadTopologyAnalyzer.getConnectionIndex(false, false, true, true)).toBe(12);
    });
  });

  describe('initializeTopology', () => {
    it('should return WE_START for isolated road (no connections)', () => {
      // Isolated road tiles default to horizontal start for display
      expect(RoadTopologyAnalyzer.initializeTopology(false, false, false, false)).toBe(RoadTopology.WE_START);
    });

    it('should return NS_START for South only', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(false, false, true, false)).toBe(RoadTopology.NS_START);
    });

    it('should return NS_END for North only', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(true, false, false, false)).toBe(RoadTopology.NS_END);
    });

    it('should return WE_START for West only', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(false, false, false, true)).toBe(RoadTopology.WE_START);
    });

    it('should return WE_END for East only', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(false, true, false, false)).toBe(RoadTopology.WE_END);
    });

    it('should return NS_MIDDLE for North-South', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(true, false, true, false)).toBe(RoadTopology.NS_MIDDLE);
    });

    it('should return WE_MIDDLE for East-West', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(false, true, false, true)).toBe(RoadTopology.WE_MIDDLE);
    });

    it('should return TWOCROSS for corners (North-East)', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(true, true, false, false)).toBe(RoadTopology.TWOCROSS);
    });

    it('should return TWOCROSS for corners (South-West)', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(false, false, true, true)).toBe(RoadTopology.TWOCROSS);
    });

    it('should return TCROSS for T-junctions (3 connections)', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(true, true, true, false)).toBe(RoadTopology.TCROSS);
      expect(RoadTopologyAnalyzer.initializeTopology(true, false, true, true)).toBe(RoadTopology.TCROSS);
    });

    it('should return XCROSS for 4-way intersections', () => {
      expect(RoadTopologyAnalyzer.initializeTopology(true, true, true, true)).toBe(RoadTopology.XCROSS);
    });
  });

  describe('detectTopology', () => {
    describe('NS_START transitions', () => {
      it('should transition to NS_END when North connection added', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          true, false, false, false
        );
        expect(result).toBe(RoadTopology.NS_END);
      });

      it('should stay NS_START when only South connection', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          false, false, true, false
        );
        expect(result).toBe(RoadTopology.NS_START);
      });

      it('should transition to NS_MIDDLE when both N-S connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          true, false, true, false
        );
        expect(result).toBe(RoadTopology.NS_MIDDLE);
      });

      it('should transition to TWOCROSS for corner (E or W added)', () => {
        const resultE = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          false, true, false, false
        );
        expect(resultE).toBe(RoadTopology.TWOCROSS);

        const resultW = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          false, false, false, true
        );
        expect(resultW).toBe(RoadTopology.TWOCROSS);
      });

      it('should transition to TCROSS for T-junction', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          true, true, false, false
        );
        expect(result).toBe(RoadTopology.TCROSS);
      });

      it('should transition to XCROSS for 4-way', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          true, true, true, true
        );
        expect(result).toBe(RoadTopology.XCROSS);
      });

      it('should transition to WE_MIDDLE for E-W connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_START,
          false, true, false, true
        );
        expect(result).toBe(RoadTopology.WE_MIDDLE);
      });
    });

    describe('WE_START transitions', () => {
      it('should transition to WE_END when East connection added', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_START,
          false, true, false, false
        );
        expect(result).toBe(RoadTopology.WE_END);
      });

      it('should stay WE_START when only West connection', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_START,
          false, false, false, true
        );
        expect(result).toBe(RoadTopology.WE_START);
      });

      it('should transition to WE_MIDDLE when both E-W connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_START,
          false, true, false, true
        );
        expect(result).toBe(RoadTopology.WE_MIDDLE);
      });

      it('should transition to TWOCROSS for corner (N or S added)', () => {
        const resultN = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_START,
          true, false, false, false
        );
        expect(resultN).toBe(RoadTopology.TWOCROSS);

        const resultS = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_START,
          false, false, true, false
        );
        expect(resultS).toBe(RoadTopology.TWOCROSS);
      });

      it('should transition to NS_MIDDLE for N-S connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_START,
          true, false, true, false
        );
        expect(result).toBe(RoadTopology.NS_MIDDLE);
      });
    });

    describe('NS_MIDDLE transitions', () => {
      it('should stay NS_MIDDLE for N-S connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_MIDDLE,
          true, false, true, false
        );
        expect(result).toBe(RoadTopology.NS_MIDDLE);
      });

      it('should transition to NS_START when only South', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_MIDDLE,
          false, false, true, false
        );
        expect(result).toBe(RoadTopology.NS_START);
      });

      it('should transition to NS_END when only North', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_MIDDLE,
          true, false, false, false
        );
        expect(result).toBe(RoadTopology.NS_END);
      });

      it('should transition to WE_MIDDLE for E-W connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.NS_MIDDLE,
          false, true, false, true
        );
        expect(result).toBe(RoadTopology.WE_MIDDLE);
      });
    });

    describe('WE_MIDDLE transitions', () => {
      it('should stay WE_MIDDLE for E-W connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_MIDDLE,
          false, true, false, true
        );
        expect(result).toBe(RoadTopology.WE_MIDDLE);
      });

      it('should transition to WE_START when only West', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_MIDDLE,
          false, false, false, true
        );
        expect(result).toBe(RoadTopology.WE_START);
      });

      it('should transition to WE_END when only East', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_MIDDLE,
          false, true, false, false
        );
        expect(result).toBe(RoadTopology.WE_END);
      });

      it('should transition to NS_MIDDLE for N-S connections', () => {
        const result = RoadTopologyAnalyzer.detectTopology(
          RoadTopology.WE_MIDDLE,
          true, false, true, false
        );
        expect(result).toBe(RoadTopology.NS_MIDDLE);
      });
    });
  });

  describe('encodeTextureId', () => {
    it('should throw error for NONE topology', () => {
      expect(() => {
        RoadTopologyAnalyzer.encodeTextureId(RoadTopology.NONE, RoadSurface.LAND);
      }).toThrow('Cannot encode NONE topology');
    });

    it('should encode NS_START + LAND correctly', () => {
      // NS_START = 1, LAND = 0
      // (1 - 1) | (0 << 4) = 0 | 0 = 0
      expect(RoadTopologyAnalyzer.encodeTextureId(RoadTopology.NS_START, RoadSurface.LAND)).toBe(0);
    });

    it('should encode NS_END + LAND correctly', () => {
      // NS_END = 2, LAND = 0
      // (2 - 1) | (0 << 4) = 1 | 0 = 1
      expect(RoadTopologyAnalyzer.encodeTextureId(RoadTopology.NS_END, RoadSurface.LAND)).toBe(1);
    });

    it('should encode NS_START + URBAN correctly', () => {
      // NS_START = 1, URBAN = 1
      // (1 - 1) | (1 << 4) = 0 | 16 = 16
      expect(RoadTopologyAnalyzer.encodeTextureId(RoadTopology.NS_START, RoadSurface.URBAN)).toBe(16);
    });

    it('should encode XCROSS + BRIDGE_WATER_CENTER correctly', () => {
      // XCROSS = 14, BRIDGE_WATER_CENTER = 2
      // (14 - 1) | (2 << 4) = 13 | 32 = 45
      expect(RoadTopologyAnalyzer.encodeTextureId(RoadTopology.XCROSS, RoadSurface.BRIDGE_WATER_CENTER)).toBe(45);
    });

    it('should encode TCROSS + SMOOTH correctly', () => {
      // TCROSS = 13, SMOOTH = 12
      // (13 - 1) | (12 << 4) = 12 | 192 = 204
      expect(RoadTopologyAnalyzer.encodeTextureId(RoadTopology.TCROSS, RoadSurface.SMOOTH)).toBe(204);
    });
  });

  describe('decodeTextureId', () => {
    it('should decode 0 as NS_START + LAND', () => {
      const result = RoadTopologyAnalyzer.decodeTextureId(0);
      expect(result.topology).toBe(RoadTopology.NS_START);
      expect(result.surface).toBe(RoadSurface.LAND);
    });

    it('should decode 1 as NS_END + LAND', () => {
      const result = RoadTopologyAnalyzer.decodeTextureId(1);
      expect(result.topology).toBe(RoadTopology.NS_END);
      expect(result.surface).toBe(RoadSurface.LAND);
    });

    it('should decode 16 as NS_START + URBAN', () => {
      const result = RoadTopologyAnalyzer.decodeTextureId(16);
      expect(result.topology).toBe(RoadTopology.NS_START);
      expect(result.surface).toBe(RoadSurface.URBAN);
    });

    it('should decode 45 as XCROSS + BRIDGE_WATER_CENTER', () => {
      const result = RoadTopologyAnalyzer.decodeTextureId(45);
      expect(result.topology).toBe(RoadTopology.XCROSS);
      expect(result.surface).toBe(RoadSurface.BRIDGE_WATER_CENTER);
    });

    it('should decode 204 as TCROSS + SMOOTH', () => {
      const result = RoadTopologyAnalyzer.decodeTextureId(204);
      expect(result.topology).toBe(RoadTopology.TCROSS);
      expect(result.surface).toBe(RoadSurface.SMOOTH);
    });

    it('should roundtrip encode/decode correctly', () => {
      const testCases = [
        { topology: RoadTopology.NS_START, surface: RoadSurface.LAND },
        { topology: RoadTopology.NS_MIDDLE, surface: RoadSurface.URBAN },
        { topology: RoadTopology.XCROSS, surface: RoadSurface.BRIDGE_WATER_N },
        { topology: RoadTopology.TCROSS, surface: RoadSurface.SMOOTH },
        { topology: RoadTopology.TWOCROSS, surface: RoadSurface.BRIDGE_WATER_CENTER },
      ];

      testCases.forEach(({ topology, surface }) => {
        const encoded = RoadTopologyAnalyzer.encodeTextureId(topology, surface);
        const decoded = RoadTopologyAnalyzer.decodeTextureId(encoded);
        expect(decoded.topology).toBe(topology);
        expect(decoded.surface).toBe(surface);
      });
    });
  });

  describe('RoadTransitionTables', () => {
    it('should have exactly 16 entries per table', () => {
      expect(Object.keys(RoadTransitionTables.NS_START).length).toBe(16);
      expect(Object.keys(RoadTransitionTables.NS_END).length).toBe(16);
      expect(Object.keys(RoadTransitionTables.NS_MIDDLE).length).toBe(16);
      expect(Object.keys(RoadTransitionTables.WE_START).length).toBe(16);
      expect(Object.keys(RoadTransitionTables.WE_END).length).toBe(16);
      expect(Object.keys(RoadTransitionTables.WE_MIDDLE).length).toBe(16);
    });

    it('should return correct table for each topology', () => {
      expect(RoadTransitionTables.getTable(RoadTopology.NS_START)).toBe(RoadTransitionTables.NS_START);
      expect(RoadTransitionTables.getTable(RoadTopology.NS_END)).toBe(RoadTransitionTables.NS_END);
      expect(RoadTransitionTables.getTable(RoadTopology.NS_MIDDLE)).toBe(RoadTransitionTables.NS_MIDDLE);
      expect(RoadTransitionTables.getTable(RoadTopology.WE_START)).toBe(RoadTransitionTables.WE_START);
      expect(RoadTransitionTables.getTable(RoadTopology.WE_END)).toBe(RoadTransitionTables.WE_END);
      expect(RoadTransitionTables.getTable(RoadTopology.WE_MIDDLE)).toBe(RoadTransitionTables.WE_MIDDLE);
    });

    it('should return null for topologies without transition tables', () => {
      expect(RoadTransitionTables.getTable(RoadTopology.NONE)).toBeNull();
      expect(RoadTransitionTables.getTable(RoadTopology.TCROSS)).toBeNull();
      expect(RoadTransitionTables.getTable(RoadTopology.XCROSS)).toBeNull();
      expect(RoadTransitionTables.getTable(RoadTopology.TWOCROSS)).toBeNull();
    });

    it('should have valid topology values in all tables', () => {
      const tables = [
        RoadTransitionTables.NS_START,
        RoadTransitionTables.NS_END,
        RoadTransitionTables.NS_MIDDLE,
        RoadTransitionTables.WE_START,
        RoadTransitionTables.WE_END,
        RoadTransitionTables.WE_MIDDLE,
      ];

      tables.forEach(table => {
        Object.values(table).forEach(topology => {
          expect(topology).toBeGreaterThanOrEqual(0);
          expect(topology).toBeLessThanOrEqual(15);
        });
      });
    });
  });
});
