/**
 * Scenario 14: Mail System
 * RDO: idof MailServer, NewMail, AddLine, Save, CloseMessage
 * HTTP: MailFolder.asp (inbox frameset), MailFolderTop.asp (tabs + action buttons)
 * WS: REQ_MAIL_COMPOSE -> RESP_MAIL_SENT, REQ_MAIL_GET_FOLDER -> RESP_MAIL_FOLDER
 *
 * NOTE on Save vs Post (from MailServer.pas):
 *   - Save(WorldName, MessageId) → saves to DRAFT folder only
 *   - Post(WorldName, MessageId) → delivers to recipients' Inbox + copies to Sent
 *   The captured RDO below uses Save, which saves to Draft (not send).
 *   To test actual mail delivery, use Post instead of Save.
 *
 * Captured RDO (saving mail to draft):
 *   C 2172 idof "MailServer"; A2172 objid="30437308";
 *   C 2173 sel 30437308 call NewMail "^" "%Mayor of Olympus@Shamba.net","%Mayor of olympus","%test subjct";
 *   A2173 res="#30430748";
 *   C 2174 sel 30430748 call AddLine "*" "%test message"; A2174 ;
 *   C 2175 idof "MailServer"; A2175 objid="30437308";
 *   C 2176 sel 30437308 call Save "^" "%Shamba","#30430748"; A2176 res="#-1";
 *   C 2177 sel 30437308 call CloseMessage "*" "#30430748"; A2177 ;
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { HttpScenario } from '../types/http-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured data for a mail send operation */
export interface CapturedMailSendData {
  to: string;
  toName: string;
  subject: string;
  body: string;
  messageId: string;
}

export const CAPTURED_MAIL_SEND: CapturedMailSendData = {
  to: 'Mayor of Olympus@Shamba.net',
  toName: 'Mayor of olympus',
  subject: 'test subjct',
  body: 'test message',
  messageId: '30430748',
};

function buildMailFolderHtml(vars: ScenarioVariables): string {
  return `<html>
<head><title>Mail - Inbox</title></head>
<frameset rows="70,*" framespacing=0>
  <frame name="Top" src="MailFolderTop.asp?Folder=Inbox&WorldName=${vars.worldName}&Account=${vars.mailAccount}&Password=${vars.password}&TycoonName=${vars.username}" scrolling="no">
  <frame name="Main" src="MessageList.asp?Folder=Inbox&WorldName=${vars.worldName}&Account=${vars.mailAccount}&MsgId=&Action=" noresize>
</frameset>
</html>`;
}

function buildMailFolderTopHtml(vars: ScenarioVariables): string {
  const baseParams = `WorldName=${vars.worldName}&Account=${vars.mailAccount}&Password=${vars.password}&TycoonName=${vars.username}`;

  return `<html>
<head><title>Mail Folder Top</title>
<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>
<body style="margin: 0; padding: 0">
<table cellspacing="0" cellpadding="0" width="100%">
<tr>
  <td class="header2" style="padding-left: 10px; color: #FF9900">Mail</td>
</tr>
<tr>
  <td>
    <table cellspacing="0" cellpadding="2">
    <tr>
      <td class="tabSelected" style="padding: 2px 8px">
        <a href="MailFolder.asp?Folder=Inbox&${baseParams}" target="_parent">Inbox</a>
      </td>
      <td class="tab" style="padding: 2px 8px">
        <a href="MailFolder.asp?Folder=SENT&${baseParams}" target="_parent">Sent</a>
      </td>
      <td class="tab" style="padding: 2px 8px">
        <a href="MailFolder.asp?Folder=DRAFT&${baseParams}" target="_parent">Draft</a>
      </td>
    </tr>
    </table>
  </td>
</tr>
<tr>
  <td>
    <table cellspacing="0" cellpadding="2">
    <tr>
      <td class="link" style="padding: 2px 6px"
        info="http://local.asp?frame_Id=MailView&frame_Action=NewMail">New</td>
      <td class="link" style="padding: 2px 6px"
        info="http://local.asp?frame_Id=MailView&frame_Action=DeleteMail">Delete</td>
      <td class="link" style="padding: 2px 6px"
        info="http://local.asp?frame_Id=MailView&frame_Action=ReplyMail">Reply</td>
      <td class="link" style="padding: 2px 6px"
        info="http://local.asp?frame_Id=MailView&frame_Action=ForwardMail">Forward</td>
    </tr>
    </table>
  </td>
</tr>
</table>
</body>
</html>`;
}

export function createMailScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario; http: HttpScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'mail',
    description: 'Mail system: send mail via idof/NewMail/AddLine/Save/CloseMessage',
    exchanges: [
      {
        id: 'mail-rdo-001',
        request: `C 2172 idof "MailServer"`,
        response: `A2172 objid="${vars.mailServerId}"`,
        matchKeys: { verb: 'idof', targetId: 'MailServer' },
      },
      {
        id: 'mail-rdo-002',
        request: `C 2173 sel ${vars.mailServerId} call NewMail "^" "%${CAPTURED_MAIL_SEND.to}","%${CAPTURED_MAIL_SEND.toName}","%${CAPTURED_MAIL_SEND.subject}"`,
        response: `A2173 res="#${CAPTURED_MAIL_SEND.messageId}"`,
        matchKeys: { verb: 'sel', action: 'call', member: 'NewMail' },
      },
      {
        id: 'mail-rdo-003',
        request: `C 2174 sel ${CAPTURED_MAIL_SEND.messageId} call AddLine "*" "%${CAPTURED_MAIL_SEND.body}"`,
        response: `A2174`,
        matchKeys: { verb: 'sel', action: 'call', member: 'AddLine' },
      },
      {
        id: 'mail-rdo-004',
        request: `C 2175 idof "MailServer"`,
        response: `A2175 objid="${vars.mailServerId}"`,
        matchKeys: { verb: 'idof', targetId: 'MailServer' },
      },
      {
        id: 'mail-rdo-005',
        request: `C 2176 sel ${vars.mailServerId} call Save "^" "%${vars.worldName}","#${CAPTURED_MAIL_SEND.messageId}"`,
        response: `A2176 res="#-1"`,
        matchKeys: { verb: 'sel', action: 'call', member: 'Save' },
      },
      {
        id: 'mail-rdo-006',
        request: `C 2177 sel ${vars.mailServerId} call CloseMessage "*" "#${CAPTURED_MAIL_SEND.messageId}"`,
        response: `A2177`,
        matchKeys: { verb: 'sel', action: 'call', member: 'CloseMessage' },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  const http: HttpScenario = {
    name: 'mail',
    exchanges: [
      {
        id: 'mail-http-001',
        method: 'GET',
        urlPattern: '/five/0/visual/voyager/mail/MailFolder.asp',
        queryPatterns: {
          Folder: 'Inbox',
        },
        status: 200,
        contentType: 'text/html',
        body: buildMailFolderHtml(vars),
      },
      {
        id: 'mail-http-002',
        method: 'GET',
        urlPattern: '/five/0/visual/voyager/mail/MailFolderTop.asp',
        queryPatterns: {
          Folder: 'Inbox',
        },
        status: 200,
        contentType: 'text/html',
        body: buildMailFolderTopHtml(vars),
      },
    ],
    variables: {},
  };

  const ws: WsCaptureScenario = {
    name: 'mail',
    description: 'Mail system: compose/send mail and view inbox',
    capturedAt: '2026-02-18',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
    exchanges: [
      {
        id: 'mail-ws-001',
        timestamp: '2026-02-18T21:35:00.000Z',
        request: {
          type: WsMessageType.REQ_MAIL_COMPOSE,
          wsRequestId: 'mail-001',
          to: CAPTURED_MAIL_SEND.to,
          subject: CAPTURED_MAIL_SEND.subject,
          body: [CAPTURED_MAIL_SEND.body],
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_MAIL_SENT,
            wsRequestId: 'mail-001',
            success: true,
          } as WsMessage,
        ],
        tags: ['mail'],
      },
      {
        id: 'mail-ws-002',
        timestamp: '2026-02-18T21:35:05.000Z',
        request: {
          type: WsMessageType.REQ_MAIL_GET_FOLDER,
          wsRequestId: 'mail-002',
          folder: 'Inbox',
        } as WsMessage,
        responses: [
          {
            type: WsMessageType.RESP_MAIL_FOLDER,
            wsRequestId: 'mail-002',
            folder: 'Inbox',
            messages: [],
          } as WsMessage,
        ],
        tags: ['mail'],
      },
    ],
  };

  return { ws, rdo, http };
}
