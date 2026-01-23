// @ts-nocheck
/**
 * RDO Protocol Tests - Company Selection and Session Management
 * Tests for SelectCompany and RDOEndSession commands
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockRdoSession } from '../../__mocks__/mock-rdo-session';
import { RdoValue } from '../../../shared/rdo-types';

describe('RDO Company and Session Management', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  describe('SelectCompany Command', () => {
    it('should format SelectCompany command correctly', async () => {
      const interfaceServerId = 6892548;
      const companyId = 12345;

      const cmd = await mockSession.simulateSelectCompany(interfaceServerId, companyId);

      expect(cmd).toMatchRdoCallFormat('SelectCompany');
      expect(cmd).toContain(`sel ${interfaceServerId}`);
      expect(cmd).toContain(`"#${companyId}"`);
    });

    it('should use integer type prefix for company ID', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 9876);

      expect(cmd).toContain('"#9876"');
    });

    it('should use method separator (^) for SelectCompany', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 123);

      expect(cmd).toContain('"^"');
    });

    it('should have exactly one argument (company ID)', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 456);

      // Extract arguments
      const match = cmd.match(/"[*^]" (.+);$/);
      expect(match).toBeDefined();

      const args = match![1].split(',');
      expect(args).toHaveLength(1);
    });

    it('should handle first company (ID 0)', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 0);

      expect(cmd).toContain('"#0"');
    });

    it('should handle large company IDs', async () => {
      const largeId = 999999;
      const cmd = await mockSession.simulateSelectCompany(1, largeId);

      expect(cmd).toContain(`"#${largeId}"`);
    });
  });

  describe('Company Switching Flow', () => {
    it('should select company after successful login', async () => {
      // Simulate login flow
      await mockSession.simulateLogin('testuser', 'password', 1);

      // Then select company
      await mockSession.simulateSelectCompany(1, 123);

      const commands = mockSession.getCommandHistory();

      // Should have 3 login commands + 1 select company
      expect(commands).toHaveLength(4);
      expect(commands[3]).toMatchRdoCallFormat('SelectCompany');
    });

    it('should re-authenticate for public office role switching', async () => {
      // Initial login as player
      await mockSession.simulateLogin('player1', 'password', 1);

      // Select player company
      await mockSession.simulateSelectCompany(1, 100);

      // Reset session (simulate socket cleanup)
      mockSession.reset();

      // Re-login as Mayor role
      await mockSession.simulateLogin('Mayor', 'password', 1);

      // Select public office company
      await mockSession.simulateSelectCompany(1, 200);

      const commands = mockSession.getCommandHistory();

      // Should have 3 login commands + 1 select company (after reset)
      expect(commands).toHaveLength(4);
      expect(commands).toContainRdoCommand('Logon', ['%Mayor']);
      expect(commands).toContainRdoCommand('SelectCompany', ['"#200"']);
    });
  });

  describe('RDOEndSession Command', () => {
    it('should format RDOEndSession command correctly', async () => {
      const interfaceServerId = 6892548;

      const cmd = await mockSession.simulateEndSession(interfaceServerId);

      expect(cmd).toMatchRdoCallFormat('RDOEndSession');
      expect(cmd).toContain(`sel ${interfaceServerId}`);
    });

    it('should use interfaceServerId (same as Logon target)', async () => {
      const interfaceServerId = 6892548; // Static, same as Logon target
      const worldContextId = 125086508; // From Logon response

      const cmd = await mockSession.simulateEndSession(interfaceServerId);

      expect(cmd).toContain(`sel ${interfaceServerId}`);
      expect(cmd).not.toContain(`sel ${worldContextId}`);
    });

    it('should have no arguments', async () => {
      const cmd = await mockSession.simulateEndSession(1);

      // Command should end with "^"; (no arguments)
      // Note: RdoCommand format is "^"; without space before semicolon
      expect(cmd).toMatch(/"[*^]";$/);
    });

    it('should use method separator (^) for RDOEndSession', async () => {
      const cmd = await mockSession.simulateEndSession(1);

      expect(cmd).toContain('"^"');
    });
  });

  describe('Logout Flow', () => {
    it('should send RDOEndSession before disconnect', async () => {
      // Simulate login
      await mockSession.simulateLogin('user', 'pass', 1);

      // Simulate session work...
      await mockSession.simulateBuildingFocus(1, 10, 20);

      // Logout - send RDOEndSession
      const interfaceServerId = 6892548;
      await mockSession.simulateEndSession(interfaceServerId);

      const commands = mockSession.getCommandHistory();

      // Last command should be RDOEndSession
      const lastCmd = commands[commands.length - 1];
      expect(lastCmd).toMatchRdoCallFormat('RDOEndSession');
    });

    it('should send RDOEndSession to world socket only', async () => {
      const interfaceServerId = 6892548;

      // End session on world socket
      await mockSession.simulateEndSession(interfaceServerId);

      const commands = mockSession.getCommandHistory();

      // Should have 1 RDOEndSession command (world socket only)
      const endSessionCmds = commands.filter(cmd => cmd.includes('RDOEndSession'));
      expect(endSessionCmds).toHaveLength(1);
    });
  });

  describe('Session ID Management', () => {
    it('should use static interfaceServerId for RDOEndSession (same as Logon target)', async () => {
      // interfaceServerId is static per world, same target as Logon
      const interfaceServerId = 6892548;

      await mockSession.simulateEndSession(interfaceServerId);

      const cmd = mockSession.getCommand(/RDOEndSession/);
      expect(cmd).toContain(`sel ${interfaceServerId}`);
    });

    it('should use worldContextId for building operations, interfaceServerId for RDOEndSession', async () => {
      const interfaceServerId = 6892548; // Static per world, used for Logon/RDOEndSession
      const worldContextId = 125086508; // Dynamic per session, used for building ops

      // Building operations use worldContextId
      await mockSession.simulateBuildingFocus(worldContextId, 10, 20);
      // RDOEndSession uses interfaceServerId (same as Logon)
      await mockSession.simulateEndSession(interfaceServerId);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        if (cmd.includes('RDOFocusObject')) {
          expect(cmd).toContain(`sel ${worldContextId}`);
        }
        if (cmd.includes('RDOEndSession')) {
          expect(cmd).toContain(`sel ${interfaceServerId}`);
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle logout without any session activity', async () => {
      // Login then immediately logout
      await mockSession.simulateLogin('user', 'pass', 1);
      const interfaceServerId = 6892548;
      await mockSession.simulateEndSession(interfaceServerId);

      const commands = mockSession.getCommandHistory();
      expect(commands).toHaveLength(4); // 3 login + 1 logout
    });

    it('should handle company ID 0 (first company)', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 0);

      expect(cmd).toContain('"#0"');
    });
  });

  describe('RDO Format Validation', () => {
    it('should generate valid RDO format for company/session commands', async () => {
      await mockSession.simulateSelectCompany(1, 123);
      await mockSession.simulateEndSession(6892548);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatchRdoFormat();
      });
    });
  });
});
