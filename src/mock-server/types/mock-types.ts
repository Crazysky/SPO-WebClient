/**
 * Core type definitions for the mock server system.
 * Used across all mock-server modules for scenario definition,
 * session tracking, and request/response matching.
 */

import type { WsMessage } from '@/shared/types/message-types';

/**
 * Session phases tracked by the mock server state machine.
 */
export enum MockSessionPhase {
  DISCONNECTED = 'DISCONNECTED',
  DIRECTORY_CONNECTED = 'DIRECTORY_CONNECTED',
  WORLD_CONNECTED = 'WORLD_CONNECTED',
  COMPANY_SELECTED = 'COMPANY_SELECTED',
  IN_GAME = 'IN_GAME',
}

/** State tracked by the replay engine across interactions */
export interface MockSessionState {
  phase: MockSessionPhase;
  currentWorld: string | null;
  currentCompany: string | null;
  username: string | null;
}

/** A single WS exchange: client request -> server response(s) */
export interface WsCaptureExchange {
  id: string;
  timestamp: string;
  request: WsMessage;
  responses: WsMessage[];
  delayMs?: number;
  tags?: string[];
}

/** A scheduled server-to-client push event */
export interface ScheduledEvent {
  afterMs: number;
  event: WsMessage;
  repeat?: { intervalMs: number; count: number };
}

/** Complete WebSocket capture scenario */
export interface WsCaptureScenario {
  name: string;
  description: string;
  capturedAt: string;
  serverInfo: { world: string; zone: string; date: string };
  exchanges: WsCaptureExchange[];
  scheduledEvents?: ScheduledEvent[];
}

/** Result from the replay engine matching */
export interface MatchResult {
  exchange: WsCaptureExchange;
  responses: WsMessage[];
  delayMs: number;
}

/** Message log entry for tracking sent/received messages */
export interface MessageLogEntry {
  direction: 'sent' | 'received';
  msg: WsMessage;
  timestamp: number;
}

/** Function signature for event handlers */
export type EventHandler = (msg: WsMessage) => void;
