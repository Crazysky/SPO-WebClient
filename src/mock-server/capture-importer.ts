/**
 * CaptureImporter — parses structured capture text format into typed scenarios.
 * Handles both WS/RDO exchanges and HTTP captures.
 */

import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario, WsCaptureExchange, ScheduledEvent } from './types/mock-types';
import type { HttpExchange } from './types/http-exchange-types';

/** Intermediate parsed representation before building a scenario */
export interface ParsedCapture {
  header: {
    scenarioName: string;
    description: string;
    server: string;
    date: string;
  };
  wsMessages: ParsedWsMessage[];
  httpCaptures: ParsedHttpCapture[];
  delays: Map<number, number>;
  notes: string[];
}

export interface ParsedWsMessage {
  direction: 'client-to-server' | 'server-to-client';
  isEvent: boolean;
  linkedRequestId?: string;
  message: WsMessage;
}

export interface ParsedHttpCapture {
  method: string;
  url: string;
  status: number;
  contentType: string;
  body: string;
  bodyFile?: string;
}

// Markers in the capture text format
const SCENARIO_START = '=== SCENARIO:';
const SCENARIO_END = '=== END SCENARIO ===';
const WS_CLIENT_TO_SERVER = '--- WS CLIENT -> SERVER ---';
const WS_SERVER_TO_CLIENT = '--- WS SERVER -> CLIENT';
const WS_EVENT = '(event, no request)';
const DELAY_MARKER = '--- DELAY';
const NOTE_MARKER = '--- NOTE:';
const HTTP_MARKER = '--- HTTP';
const HTTP_RESPONSE = 'RESPONSE';

/**
 * Parse raw capture text into structured data.
 */
export function parseCaptureTxt(text: string): ParsedCapture {
  const lines = text.split('\n');
  const result: ParsedCapture = {
    header: { scenarioName: '', description: '', server: '', date: '' },
    wsMessages: [],
    httpCaptures: [],
    delays: new Map(),
    notes: [],
  };

  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Parse scenario header
    if (line.startsWith(SCENARIO_START)) {
      result.header.scenarioName = line
        .substring(SCENARIO_START.length)
        .replace(/===\s*$/, '')
        .trim();
      i++;
      continue;
    }

    // Parse description (line after header that starts with "Description:")
    if (line.startsWith('Description:')) {
      result.header.description = line.substring('Description:'.length).trim();
      i++;
      continue;
    }

    if (line.startsWith('Server:')) {
      result.header.server = line.substring('Server:'.length).trim();
      i++;
      continue;
    }

    if (line.startsWith('Date:')) {
      result.header.date = line.substring('Date:'.length).trim();
      i++;
      continue;
    }

    // Skip end marker
    if (line === SCENARIO_END) {
      i++;
      continue;
    }

    // Parse WS client -> server message
    if (line.startsWith(WS_CLIENT_TO_SERVER)) {
      i++;
      const msgLine = findNextJsonLine(lines, i);
      if (msgLine.json) {
        result.wsMessages.push({
          direction: 'client-to-server',
          isEvent: false,
          message: msgLine.json as WsMessage,
        });
        i = msgLine.nextIndex;
      }
      continue;
    }

    // Parse WS server -> client message
    if (line.startsWith(WS_SERVER_TO_CLIENT)) {
      const isEvent = line.includes(WS_EVENT);
      let linkedRequestId: string | undefined;

      if (!isEvent) {
        const ridMatch = line.match(/response to (\S+)\)/);
        if (ridMatch) {
          linkedRequestId = ridMatch[1];
        }
      }

      i++;
      const msgLine = findNextJsonLine(lines, i);
      if (msgLine.json) {
        result.wsMessages.push({
          direction: 'server-to-client',
          isEvent,
          linkedRequestId,
          message: msgLine.json as WsMessage,
        });
        i = msgLine.nextIndex;
      }
      continue;
    }

    // Parse delay marker
    if (line.startsWith(DELAY_MARKER)) {
      const delayMatch = line.match(/(\d+)ms/);
      if (delayMatch) {
        result.delays.set(result.wsMessages.length, parseInt(delayMatch[1], 10));
      }
      i++;
      continue;
    }

    // Parse note
    if (line.startsWith(NOTE_MARKER)) {
      result.notes.push(line.substring(NOTE_MARKER.length).trim());
      i++;
      continue;
    }

    // Parse HTTP capture
    if (line.startsWith(HTTP_MARKER)) {
      const httpMatch = line.match(/--- HTTP (\w+) (.+) ---/);
      if (httpMatch) {
        const method = httpMatch[1];
        const url = httpMatch[2];
        i++;

        // Look for RESPONSE line
        let status = 200;
        let contentType = 'text/html';
        let body = '';
        let bodyFile: string | undefined;

        while (i < lines.length) {
          const httpLine = lines[i].trim();
          if (httpLine.startsWith(HTTP_RESPONSE)) {
            const respMatch = httpLine.match(/RESPONSE (\d+) (.+)/);
            if (respMatch) {
              status = parseInt(respMatch[1], 10);
              contentType = respMatch[2];
            }
            i++;
            break;
          }
          i++;
        }

        // Collect body until next marker or empty line
        const bodyLines: string[] = [];
        while (i < lines.length) {
          const bodyLine = lines[i];
          if (
            bodyLine.trim().startsWith('---') ||
            bodyLine.trim().startsWith('===')
          ) {
            break;
          }
          // Check for FILE reference
          if (bodyLine.trim().startsWith('FILE:')) {
            bodyFile = bodyLine.trim().substring('FILE:'.length).trim();
            i++;
            break;
          }
          bodyLines.push(bodyLine);
          i++;
        }

        body = bodyLines.join('\n').trim();

        result.httpCaptures.push({ method, url, status, contentType, body, bodyFile });
      } else {
        i++;
      }
      continue;
    }

    i++;
  }

  return result;
}

/**
 * Build a WsCaptureScenario from parsed data.
 * Pairs requests with their responses by wsRequestId.
 */
export function buildScenario(parsed: ParsedCapture): {
  scenario: WsCaptureScenario;
  httpResponses: HttpExchange[];
} {
  const exchanges: WsCaptureExchange[] = [];
  const scheduledEvents: ScheduledEvent[] = [];
  let exchangeCounter = 0;

  // Group WS messages: pair requests with responses
  const requests = parsed.wsMessages.filter(m => m.direction === 'client-to-server');
  const responses = parsed.wsMessages.filter(m => m.direction === 'server-to-client');

  for (const req of requests) {
    const reqId = req.message.wsRequestId;
    const matchingResponses = responses.filter(
      r => !r.isEvent && r.linkedRequestId === reqId
    );

    exchangeCounter++;
    const exchange: WsCaptureExchange = {
      id: `ex-${String(exchangeCounter).padStart(3, '0')}`,
      timestamp: new Date().toISOString(),
      request: req.message,
      responses: matchingResponses.map(r => r.message),
      delayMs: parsed.delays.get(exchangeCounter - 1) ?? 0,
    };
    exchanges.push(exchange);
  }

  // Events become scheduled events
  const events = responses.filter(r => r.isEvent);
  for (const event of events) {
    scheduledEvents.push({
      afterMs: 1000, // Default delay for events
      event: event.message,
    });
  }

  // Build HTTP exchanges
  const httpResponses: HttpExchange[] = parsed.httpCaptures.map((h, idx) => ({
    id: `http-${String(idx + 1).padStart(3, '0')}`,
    method: h.method as 'GET' | 'POST',
    urlPattern: h.url,
    status: h.status,
    contentType: h.contentType,
    body: h.body,
  }));

  const scenario: WsCaptureScenario = {
    name: parsed.header.scenarioName,
    description: parsed.header.description,
    capturedAt: parsed.header.date || new Date().toISOString(),
    serverInfo: {
      world: parsed.header.server,
      zone: '',
      date: parsed.header.date,
    },
    exchanges,
    scheduledEvents: scheduledEvents.length > 0 ? scheduledEvents : undefined,
  };

  return { scenario, httpResponses };
}

/**
 * End-to-end: parse capture text and build scenario.
 */
export function importCaptureTxt(text: string): {
  scenario: WsCaptureScenario;
  httpResponses: HttpExchange[];
} {
  const parsed = parseCaptureTxt(text);
  return buildScenario(parsed);
}

/** Find the next line that looks like JSON */
function findNextJsonLine(
  lines: string[],
  startIdx: number
): { json: unknown; nextIndex: number } {
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('{')) {
      try {
        // Try to parse single-line JSON
        const json = JSON.parse(trimmed);
        return { json, nextIndex: i + 1 };
      } catch {
        // Try multi-line JSON
        let jsonStr = '';
        let depth = 0;
        for (let j = i; j < lines.length; j++) {
          jsonStr += lines[j];
          for (const ch of lines[j]) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          if (depth === 0) {
            try {
              const json = JSON.parse(jsonStr);
              return { json, nextIndex: j + 1 };
            } catch {
              break;
            }
          }
        }
      }
    }
  }
  return { json: null, nextIndex: startIdx + 1 };
}
