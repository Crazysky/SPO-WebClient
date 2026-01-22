// @ts-nocheck
/**
 * RDO Protocol Tests - Road Construction
 * Tests for CreateCircuitSeg command with staircase pattern
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockRdoSession } from '../../__mocks__/mock-rdo-session';
import { RdoValue } from '../../../shared/rdo-types';

describe('RDO Road Construction (CreateCircuitSeg)', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  describe('CreateCircuitSeg Command Format', () => {
    it('should format CreateCircuitSeg command correctly', async () => {
      const worldContextId = 125086508;
      const circuitId = 1; // Roads always use circuit ID 1
      const ownerId = 987654; // fTycoonProxyId
      const x1 = 462;
      const y1 = 492;
      const x2 = 463;
      const y2 = 492;
      const cost = 2000000;

      const cmd = await mockSession.simulateCreateRoadSegment(
        worldContextId,
        circuitId,
        ownerId,
        x1,
        y1,
        x2,
        y2,
        cost
      );

      expect(cmd).toMatchRdoCallFormat('CreateCircuitSeg');
      expect(cmd).toContain(`sel ${worldContextId}`);
    });

    it('should use worldContextId (dynamic) not interfaceServerId (static)', async () => {
      const worldContextId = 125086508; // From Logon response
      const interfaceServerId = 6892548; // Static per world

      const cmd = await mockSession.simulateCreateRoadSegment(
        worldContextId,
        1,
        123,
        0,
        0,
        1,
        0,
        2000000
      );

      expect(cmd).toContain(`sel ${worldContextId}`);
      expect(cmd).not.toContain(`sel ${interfaceServerId}`);
    });

    it('should include all 7 required arguments', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(
        1,
        1,
        123,
        10,
        20,
        11,
        20,
        2000000
      );

      // Extract arguments
      const match = cmd.match(/"[*^]" (.+);$/);
      expect(match).toBeDefined();

      const args = match![1].split(',');
      expect(args).toHaveLength(7);
    });

    it('should use integer type prefix for all arguments', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(
        1,
        1,
        123,
        10,
        20,
        11,
        20,
        2000000
      );

      // All 7 arguments should be integers
      const integerArgs = cmd.match(/"#\d+"/g);
      expect(integerArgs).toHaveLength(7);
    });
  });

  describe('Circuit ID (Roads)', () => {
    it('should use circuit ID 1 for roads', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, 2000000);

      // First argument should be circuit ID = 1
      expect(cmd).toMatch(/"[*^]" "#1"/);
    });
  });

  describe('Owner ID (fTycoonProxyId)', () => {
    it('should use fTycoonProxyId as owner', async () => {
      const fTycoonProxyId = 987654;

      const cmd = await mockSession.simulateCreateRoadSegment(
        1,
        1,
        fTycoonProxyId,
        0,
        0,
        1,
        0,
        2000000
      );

      expect(cmd).toContain(`"#${fTycoonProxyId}"`);
    });
  });

  describe('Road Coordinates', () => {
    it('should include start and end coordinates', async () => {
      const x1 = 100;
      const y1 = 200;
      const x2 = 101;
      const y2 = 200;

      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, x1, y1, x2, y2, 2000000);

      expect(cmd).toContain(`"#${x1}"`);
      expect(cmd).toContain(`"#${y1}"`);
      expect(cmd).toContain(`"#${x2}"`);
      expect(cmd).toContain(`"#${y2}"`);
    });

    it('should handle horizontal road segment', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 10, 20, 11, 20, 2000000);

      // Y coordinates should be same (horizontal)
      expect(cmd).toMatch(/"#10","#20","#11","#20"/);
    });

    it('should handle vertical road segment', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 10, 20, 10, 21, 2000000);

      // X coordinates should be same (vertical)
      expect(cmd).toMatch(/"#10","#20","#10","#21"/);
    });

    it('should handle diagonal road segment (1-tile step)', async () => {
      // Diagonal roads are built as 1-tile H/V segments (staircase)
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 462, 492, 463, 491, 2000000);

      // This is one segment of a staircase pattern
      expect(cmd).toContain('"#462","#492","#463","#491"');
    });
  });

  describe('Road Cost', () => {
    it('should include cost as last argument', async () => {
      const cost = 2000000; // $2M per tile

      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, cost);

      expect(cmd).toMatch(new RegExp(`"#${cost}";$`));
    });

    it('should handle single-tile cost ($2M)', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, 2000000);

      expect(cmd).toContain('"#2000000"');
    });

    it('should handle multi-tile cost', async () => {
      const tiles = 5;
      const costPerTile = 2000000;
      const totalCost = tiles * costPerTile;

      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 5, 0, totalCost);

      expect(cmd).toContain(`"#${totalCost}"`);
    });
  });

  describe('Staircase Pattern (Diagonal Roads)', () => {
    it('should generate multiple 1-tile segments for diagonal road', async () => {
      // Diagonal from (462, 492) to (465, 490) = 5 tiles
      // Should be 5 separate CreateCircuitSeg commands

      // Segment 1: H
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 462, 492, 463, 492, 2000000);
      // Segment 2: V
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 463, 492, 463, 491, 2000000);
      // Segment 3: H
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 463, 491, 464, 491, 2000000);
      // Segment 4: V
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 464, 491, 464, 490, 2000000);
      // Segment 5: H
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 464, 490, 465, 490, 2000000);

      const commands = mockSession.getCommandHistory();
      expect(commands).toHaveLength(5);

      // All commands should be CreateCircuitSeg
      commands.forEach(cmd => {
        expect(cmd).toMatchRdoCallFormat('CreateCircuitSeg');
      });
    });

    it('should alternate H and V segments in staircase', async () => {
      // Staircase pattern alternates horizontal and vertical moves

      await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, 2000000); // H
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 1, 0, 1, 1, 2000000); // V
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 1, 1, 2, 1, 2000000); // H

      const commands = mockSession.getCommandHistory();

      // Segment 1: y1 === y2 (horizontal)
      expect(commands[0]).toMatch(/"#0","#0","#1","#0"/);

      // Segment 2: x1 === x2 (vertical)
      expect(commands[1]).toMatch(/"#1","#0","#1","#1"/);

      // Segment 3: y1 === y2 (horizontal)
      expect(commands[2]).toMatch(/"#1","#1","#2","#1"/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle road at map edge (0, 0)', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, 2000000);

      expect(cmd).toContain('"#0","#0"');
    });

    it('should handle road at map boundary (1999, 1999)', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(
        1,
        1,
        123,
        1999,
        1999,
        1998,
        1999,
        2000000
      );

      expect(cmd).toContain('"#1999","#1999"');
    });

    it('should handle zero cost (edge case)', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, 0);

      expect(cmd).toContain('"#0";'); // Cost = 0
    });
  });

  describe('RDO Format Validation', () => {
    it('should generate valid RDO format for road segments', async () => {
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, 2000000);
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 10, 20, 10, 21, 2000000);
      await mockSession.simulateCreateRoadSegment(1, 1, 123, 50, 75, 51, 76, 2000000);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatchRdoFormat();
      });
    });

    it('should use method separator (^) for CreateCircuitSeg', async () => {
      const cmd = await mockSession.simulateCreateRoadSegment(1, 1, 123, 0, 0, 1, 0, 2000000);

      expect(cmd).toContain('"^"');
    });
  });
});
