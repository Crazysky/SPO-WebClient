/**
 * Protocol Validation: composeMail()
 *
 * Validates that the mail system RDO commands (NewMail, AddLine, Save, CloseMessage)
 * produce correct protocol strings matching captured mail-scenario exchanges.
 *
 * Approach: Build each command with RdoProtocol.format() (same as spo_session does),
 * feed through RdoMock.match() loaded with the mail scenario, and verify both
 * matching success and command format correctness.
 *
 * Flow under test:
 *   1. idof "MailServer"                                          -> objid="30437308"
 *   2. sel 30437308 call NewMail "^" "%from","%to","%subject"     -> res="#30430748"
 *   3. sel 30430748 call AddLine "*" "%body"                      -> (empty)
 *   4. idof "MailServer"                                          -> objid="30437308"
 *   5. sel 30437308 call Save "^" "%worldName","#messageId"       -> res="#-1"
 *   6. sel 30437308 call CloseMessage "*" "#messageId"            -> (empty)
 */

jest.mock('net', () => ({
  Socket: jest.fn(),
}));
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

/// <reference path="../../__tests__/matchers/rdo-matchers.d.ts" />
import { describe, it, expect, beforeEach } from '@jest/globals';
import { RdoMock } from '../../../mock-server/rdo-mock';
import { RdoProtocol } from '../../../server/rdo';
import { RdoVerb, RdoAction } from '../../../shared/types/protocol-types';
import { createMailScenario, CAPTURED_MAIL_SEND } from '../../../mock-server/scenarios/mail-scenario';
import { DEFAULT_VARIABLES } from '../../../mock-server/scenarios/scenario-variables';

describe('Protocol Validation: composeMail()', () => {
  let rdoMock: RdoMock;
  const scenario = createMailScenario();
  const mailServerId = DEFAULT_VARIABLES.mailServerId; // '30437308'
  const mailAccount = DEFAULT_VARIABLES.mailAccount;   // 'Crazz@Shamba.net'
  const worldName = DEFAULT_VARIABLES.worldName;       // 'Shamba'
  const messageId = CAPTURED_MAIL_SEND.messageId;      // '30430748'

  beforeEach(() => {
    rdoMock = new RdoMock();
    rdoMock.addScenario(scenario.rdo);
  });

  describe('NewMail CALL command', () => {
    it('should match NewMail scenario when formatted with from/to/subject args', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2173,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'NewMail',
        separator: '"^"',
        args: [
          `%${CAPTURED_MAIL_SEND.to}`,
          `%${CAPTURED_MAIL_SEND.toName}`,
          `%${CAPTURED_MAIL_SEND.subject}`,
        ],
      });

      const result = rdoMock.match(command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-002');
    });

    it('should use "^" method separator for NewMail (request-response pattern)', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2173,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'NewMail',
        separator: '"^"',
        args: [
          `%${CAPTURED_MAIL_SEND.to}`,
          `%${CAPTURED_MAIL_SEND.toName}`,
          `%${CAPTURED_MAIL_SEND.subject}`,
        ],
      });

      // NewMail uses "^" (method separator) because it expects a response (res=)
      expect(command).toContain('"^"');
      // Must NOT contain push separator "*"
      expect(command).not.toContain('"*"');
    });

    it('should pass all three args as OLE strings (% prefix)', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2173,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'NewMail',
        separator: '"^"',
        args: [
          `%${CAPTURED_MAIL_SEND.to}`,
          `%${CAPTURED_MAIL_SEND.toName}`,
          `%${CAPTURED_MAIL_SEND.subject}`,
        ],
      });

      // All three args should be OLE strings with % prefix
      expect(command).toContain(`"%${CAPTURED_MAIL_SEND.to}"`);
      expect(command).toContain(`"%${CAPTURED_MAIL_SEND.toName}"`);
      expect(command).toContain(`"%${CAPTURED_MAIL_SEND.subject}"`);
    });
  });

  describe('AddLine CALL command', () => {
    it('should match AddLine scenario when formatted with message body', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2174,
        verb: RdoVerb.SEL,
        targetId: messageId,
        action: RdoAction.CALL,
        member: 'AddLine',
        separator: '"*"',
        args: [`%${CAPTURED_MAIL_SEND.body}`],
      });

      const result = rdoMock.match(command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-003');
    });

    it('should target the messageId (NOT mailServerId) for AddLine', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2174,
        verb: RdoVerb.SEL,
        targetId: messageId,
        action: RdoAction.CALL,
        member: 'AddLine',
        separator: '"*"',
        args: [`%${CAPTURED_MAIL_SEND.body}`],
      });

      // AddLine targets the messageId returned from NewMail, not the mailServerId
      const parsed = RdoProtocol.parse(command);
      expect(parsed.targetId).toBe(messageId);
      expect(parsed.targetId).not.toBe(mailServerId);
    });

    it('should use "*" push separator for AddLine', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2174,
        verb: RdoVerb.SEL,
        targetId: messageId,
        action: RdoAction.CALL,
        member: 'AddLine',
        separator: '"*"',
        args: [`%${CAPTURED_MAIL_SEND.body}`],
      });

      // AddLine uses "*" push separator (fire-and-forget, no res= expected)
      expect(command).toContain('"*"');
    });
  });

  describe('Save/Post CALL command', () => {
    it('should match Save scenario with worldName and messageId', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2176,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      const result = rdoMock.match(command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-005');
    });

    it('should use integer type (#) for messageId in Save args', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2176,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      // messageId must be passed as integer (#) type in Save
      expect(command).toContain(`"#${messageId}"`);
    });

    it('should use string type (%) for worldName in Save args', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2176,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      // worldName must be passed as OLE string (%) type in Save
      expect(command).toContain(`"%${worldName}"`);
    });
  });

  describe('CloseMessage CALL command', () => {
    it('should match CloseMessage scenario with messageId as integer', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2177,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'CloseMessage',
        separator: '"*"',
        args: [`#${messageId}`],
      });

      const result = rdoMock.match(command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-006');
    });
  });

  describe('Mail command targeting', () => {
    it('should target mailServerId for NewMail, Save, and CloseMessage', () => {
      const newMailCmd = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2173,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'NewMail',
        separator: '"^"',
        args: [
          `%${CAPTURED_MAIL_SEND.to}`,
          `%${CAPTURED_MAIL_SEND.toName}`,
          `%${CAPTURED_MAIL_SEND.subject}`,
        ],
      });

      const saveCmd = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2176,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      const closeCmd = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2177,
        verb: RdoVerb.SEL,
        targetId: mailServerId,
        action: RdoAction.CALL,
        member: 'CloseMessage',
        separator: '"*"',
        args: [`#${messageId}`],
      });

      // All three commands should target the mailServerId
      const parsedNewMail = RdoProtocol.parse(newMailCmd);
      const parsedSave = RdoProtocol.parse(saveCmd);
      const parsedClose = RdoProtocol.parse(closeCmd);

      expect(parsedNewMail.targetId).toBe(mailServerId);
      expect(parsedSave.targetId).toBe(mailServerId);
      expect(parsedClose.targetId).toBe(mailServerId);
    });

    it('should target messageId for AddLine (not mailServerId)', () => {
      const addLineCmd = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 2174,
        verb: RdoVerb.SEL,
        targetId: messageId,
        action: RdoAction.CALL,
        member: 'AddLine',
        separator: '"*"',
        args: [`%${CAPTURED_MAIL_SEND.body}`],
      });

      const parsed = RdoProtocol.parse(addLineCmd);

      // AddLine targets the in-memory message object, not the mail server
      expect(parsed.targetId).toBe(messageId);
      expect(parsed.targetId).not.toBe(mailServerId);
    });
  });
});
