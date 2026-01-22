// @ts-nocheck
/**
 * RDO Protocol Tests - Building Operations
 * Tests for building focus, property updates, deletion, and rename
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockRdoSession } from '../../__mocks__/mock-rdo-session';
import { RdoValue } from '../../../shared/rdo-types';

describe('RDO Building Operations', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  describe('Building Focus (RDOFocusObject)', () => {
    it('should format RDOFocusObject command correctly', async () => {
      const worldId = 123456;
      const x = 100;
      const y = 200;

      const cmd = await mockSession.simulateBuildingFocus(worldId, x, y);

      expect(cmd).toMatchRdoCallFormat('RDOFocusObject');
      expect(cmd).toContain(`#${x}`);
      expect(cmd).toContain(`#${y}`);
    });

    it('should use integer type prefix for coordinates', async () => {
      const cmd = await mockSession.simulateBuildingFocus(1, 50, 75);

      expect(cmd).toContain('"#50"');
      expect(cmd).toContain('"#75"');
    });

    it('should use method separator (^) for RDOFocusObject', async () => {
      const cmd = await mockSession.simulateBuildingFocus(1, 100, 200);

      expect(cmd).toContain('"^"');
    });

    it('should handle edge coordinates', async () => {
      // Test corners of map
      await mockSession.simulateBuildingFocus(1, 0, 0);
      await mockSession.simulateBuildingFocus(1, 1999, 1999);

      const commands = mockSession.getCommandHistory();
      expect(commands[0]).toContain('"#0","#0"');
      expect(commands[1]).toContain('"#1999","#1999"');
    });
  });

  describe('Building Property Updates (RDOSetPrice)', () => {
    it('should format RDOSetPrice command correctly', async () => {
      const buildingId = 100575368;
      const newPrice = 220;

      const cmd = await mockSession.simulateBuildingUpdate(buildingId, 'RDOSetPrice', newPrice);

      expect(cmd).toMatchRdoCallFormat('RDOSetPrice');
      expect(cmd).toContain(`sel ${buildingId}`);
      expect(cmd).toContain('"#0"'); // Price index
      expect(cmd).toContain(`"#${newPrice}"`);
    });

    it('should include price index as first argument', async () => {
      const cmd = await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', 100);

      // First argument should be #0 (price index)
      const match = cmd.match(/"[*^]" (.+);$/);
      expect(match).toBeDefined();
      expect(match![1]).toMatch(/^"#0"/);
    });

    it('should handle price value 0', async () => {
      const cmd = await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', 0);

      expect(cmd).toContain('"#0","#0"'); // index=0, value=0
    });

    it('should handle large price values', async () => {
      const largePrice = 999999999;
      const cmd = await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', largePrice);

      expect(cmd).toContain(`"#${largePrice}"`);
    });
  });

  describe('Building Salary Updates (RDOSetSalaries)', () => {
    it('should format RDOSetSalaries with all 3 salary values', async () => {
      const buildingId = 123456;
      const salaries: [number, number, number] = [100, 120, 150];

      const cmd = await mockSession.simulateSetSalaries(buildingId, salaries);

      expect(cmd).toMatchRdoCallFormat('RDOSetSalaries');
      expect(cmd).toContain('"#100"');
      expect(cmd).toContain('"#120"');
      expect(cmd).toContain('"#150"');
    });

    it('should maintain salary order (Executives, Professionals, Workers)', async () => {
      const cmd = await mockSession.simulateSetSalaries(1, [50, 75, 100]);

      // Extract arguments
      const match = cmd.match(/"[*^]" (.+);$/);
      expect(match![1]).toBe('"#50","#75","#100"');
    });

    it('should handle zero salaries', async () => {
      const cmd = await mockSession.simulateSetSalaries(1, [0, 0, 0]);

      expect(cmd).toContain('"#0","#0","#0"');
    });

    it('should handle percentage salary values', async () => {
      const salaries: [number, number, number] = [150, 175, 200]; // 150%, 175%, 200%
      const cmd = await mockSession.simulateSetSalaries(1, salaries);

      expect(cmd).toContain('"#150","#175","#200"');
    });
  });

  describe('Building Deletion (RDODelFacility)', () => {
    it('should format RDODelFacility command correctly', async () => {
      const worldId = 123456;
      const x = 100;
      const y = 200;

      const cmd = await mockSession.simulateDeleteBuilding(worldId, x, y);

      expect(cmd).toMatchRdoCallFormat('RDODelFacility');
      expect(cmd).toContain(`sel ${worldId}`);
      expect(cmd).toContain(`"#${x}"`);
      expect(cmd).toContain(`"#${y}"`);
    });

    it('should use integer type prefix for coordinates', async () => {
      const cmd = await mockSession.simulateDeleteBuilding(1, 50, 75);

      expect(cmd).toContain('"#50"');
      expect(cmd).toContain('"#75"');
    });

    it('should use method separator (^) for RDODelFacility', async () => {
      const cmd = await mockSession.simulateDeleteBuilding(1, 100, 200);

      expect(cmd).toContain('"^"');
    });

    it('should use worldId for sel parameter (not buildingId)', async () => {
      const worldId = 999;
      const buildingId = 888;

      const cmd = await mockSession.simulateDeleteBuilding(worldId, 10, 20);

      expect(cmd).toContain(`sel ${worldId}`);
      expect(cmd).not.toContain(`sel ${buildingId}`);
    });
  });

  describe('Building Rename (SET Name)', () => {
    it('should format SET Name command correctly', async () => {
      const buildingId = 100575368;
      const newName = 'My Office';

      const cmd = mockSession.simulateRenameBuilding(buildingId, newName);

      expect(cmd).toMatchRdoSetFormat('Name');
      expect(cmd).toContain(`sel ${buildingId}`);
      expect(cmd).toContain(`%${newName}`);
    });

    it('should use OLEString type prefix for building name', async () => {
      const cmd = mockSession.simulateRenameBuilding(1, 'Test Building');

      expect(cmd).toContain('%Test Building');
    });

    it('should use SET verb instead of CALL', async () => {
      const cmd = mockSession.simulateRenameBuilding(1, 'Test');

      expect(cmd).toMatch(/set Name=/);
      expect(cmd).not.toMatch(/call Name/);
    });

    it('should handle empty name', async () => {
      const cmd = mockSession.simulateRenameBuilding(1, '');

      expect(cmd).toContain('Name="%"'); // Empty OLEString
    });

    it('should handle special characters in name', async () => {
      const specialName = 'Office & Co. (Ltd.)';
      const cmd = mockSession.simulateRenameBuilding(1, specialName);

      expect(cmd).toContain(`%${specialName}`);
    });

    it('should handle long building names', async () => {
      const longName = 'A'.repeat(100);
      const cmd = mockSession.simulateRenameBuilding(1, longName);

      expect(cmd).toContain(`%${longName}`);
    });
  });

  describe('Upgrade Operations', () => {
    it('should format RDOStartUpgrades command correctly', async () => {
      const buildingId = 123456;
      const count = 5;

      const cmd = await mockSession.simulateStartUpgrade(buildingId, count);

      expect(cmd).toMatchRdoCallFormat('RDOStartUpgrades');
      expect(cmd).toContain(`"#${count}"`);
    });

    it('should handle single upgrade', async () => {
      const cmd = await mockSession.simulateStartUpgrade(1, 1);

      expect(cmd).toContain('"#1"');
    });

    it('should handle multiple upgrades', async () => {
      const cmd = await mockSession.simulateStartUpgrade(1, 10);

      expect(cmd).toContain('"#10"');
    });

    it('should format RDOStopUpgrade command correctly', async () => {
      const buildingId = 123456;
      const cmd = await mockSession.simulateStopUpgrade(buildingId);

      expect(cmd).toMatchRdoCallFormat('RDOStopUpgrade');
      expect(cmd).toMatch(/"[*^]" ;$/); // No arguments
    });

    it('should format RDODowngrade command correctly', async () => {
      const buildingId = 123456;
      const cmd = await mockSession.simulateDowngrade(buildingId);

      expect(cmd).toMatchRdoCallFormat('RDODowngrade');
      expect(cmd).toMatch(/"[*^]" ;$/); // No arguments
    });
  });

  describe('RDO Format Validation', () => {
    it('should generate valid RDO format for all building commands', async () => {
      await mockSession.simulateBuildingFocus(1, 10, 20);
      await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', 100);
      await mockSession.simulateSetSalaries(1, [50, 75, 100]);
      await mockSession.simulateDeleteBuilding(1, 30, 40);
      mockSession.simulateRenameBuilding(1, 'Test');
      await mockSession.simulateStartUpgrade(1, 1);
      await mockSession.simulateStopUpgrade(1);
      await mockSession.simulateDowngrade(1);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatchRdoFormat();
      });
    });
  });
});
