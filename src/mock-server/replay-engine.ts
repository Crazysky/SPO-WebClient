/**
 * ReplayEngine — WS Request Matching Engine.
 * Matches incoming WsMessage requests to captured exchanges,
 * rewrites wsRequestId, and tracks session state.
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type {
  WsCaptureExchange,
  MatchResult,
  MockSessionState,
} from './types/mock-types';
import { MockSessionPhase } from './types/mock-types';
import type { CaptureStore } from './capture-store';

/**
 * Key field extractors for specific message types.
 * Used to match requests beyond just the type.
 */
const KEY_FIELD_EXTRACTORS: Record<string, (msg: WsMessage) => Record<string, unknown>> = {
  [WsMessageType.REQ_LOGIN_WORLD]: (msg) => ({ worldName: (msg as unknown as Record<string, unknown>).worldName }),
  [WsMessageType.REQ_SELECT_COMPANY]: (msg) => ({ companyId: (msg as unknown as Record<string, unknown>).companyId }),
  [WsMessageType.REQ_BUILDING_FOCUS]: (msg) => ({ x: (msg as unknown as Record<string, unknown>).x, y: (msg as unknown as Record<string, unknown>).y }),
  [WsMessageType.REQ_GET_SURFACE]: (msg) => ({
    surfaceType: (msg as unknown as Record<string, unknown>).surfaceType,
    x1: (msg as unknown as Record<string, unknown>).x1,
    y1: (msg as unknown as Record<string, unknown>).y1,
  }),
};

export class ReplayEngine {
  private store: CaptureStore;
  private state: MockSessionState;
  private consumed: Set<string> = new Set();
  private consumptionCounters: Map<string, number> = new Map();

  constructor(store: CaptureStore) {
    this.store = store;
    this.state = {
      phase: MockSessionPhase.DISCONNECTED,
      currentWorld: null,
      currentCompany: null,
      username: null,
    };
  }

  /**
   * Match an incoming request to a captured exchange.
   * Returns null if no match found.
   */
  match(request: WsMessage): MatchResult | null {
    const type = request.type;
    const candidates = this.store.getExchangesByType(type);

    if (candidates.length === 0) return null;

    // Try key field match first
    const keyExtractor = KEY_FIELD_EXTRACTORS[type];
    let matched: WsCaptureExchange | null = null;

    if (keyExtractor) {
      const requestKeys = keyExtractor(request);
      matched = this.findByKeyFields(candidates, requestKeys);
    }

    // Fallback: first unconsumed or wrap-around
    if (!matched) {
      matched = this.findUnconsumed(candidates) ?? candidates[0];
    }

    if (!matched) return null;

    // Deep-clone responses and rewrite wsRequestId
    const responses = matched.responses.map(r => {
      const cloned = JSON.parse(JSON.stringify(r)) as WsMessage;
      if (request.wsRequestId) {
        cloned.wsRequestId = request.wsRequestId;
      }
      return cloned;
    });

    // Track consumption
    this.consumed.add(matched.id);
    const count = (this.consumptionCounters.get(matched.id) ?? 0) + 1;
    this.consumptionCounters.set(matched.id, count);

    // Update session state
    this.updateState(request, responses);

    return {
      exchange: matched,
      responses,
      delayMs: matched.delayMs ?? 0,
    };
  }

  getState(): MockSessionState {
    return { ...this.state };
  }

  getConsumedExchangeIds(): Set<string> {
    return new Set(this.consumed);
  }

  reset(): void {
    this.consumed.clear();
    this.consumptionCounters.clear();
    this.state = {
      phase: MockSessionPhase.DISCONNECTED,
      currentWorld: null,
      currentCompany: null,
      username: null,
    };
  }

  private findByKeyFields(
    candidates: WsCaptureExchange[],
    requestKeys: Record<string, unknown>
  ): WsCaptureExchange | null {
    for (const candidate of candidates) {
      const extractor = KEY_FIELD_EXTRACTORS[candidate.request.type];
      if (!extractor) continue;

      const capturedKeys = extractor(candidate.request);
      let allMatch = true;

      for (const [key, value] of Object.entries(requestKeys)) {
        if (capturedKeys[key] !== undefined && capturedKeys[key] !== value) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) return candidate;
    }
    return null;
  }

  private findUnconsumed(candidates: WsCaptureExchange[]): WsCaptureExchange | null {
    return candidates.find(c => !this.consumed.has(c.id)) ?? null;
  }

  private updateState(request: WsMessage, responses: WsMessage[]): void {
    const responseType = responses[0]?.type;

    switch (request.type) {
      case WsMessageType.REQ_CONNECT_DIRECTORY:
        if (responseType === WsMessageType.RESP_CONNECT_SUCCESS) {
          this.state.phase = MockSessionPhase.DIRECTORY_CONNECTED;
          this.state.username = (request as unknown as Record<string, unknown>).username as string ?? null;
        }
        break;

      case WsMessageType.REQ_LOGIN_WORLD:
        if (responseType === WsMessageType.RESP_LOGIN_SUCCESS) {
          this.state.phase = MockSessionPhase.WORLD_CONNECTED;
          this.state.currentWorld = (request as unknown as Record<string, unknown>).worldName as string ?? null;
        }
        break;

      case WsMessageType.REQ_SELECT_COMPANY:
        if (responseType === WsMessageType.RESP_RDO_RESULT) {
          this.state.phase = MockSessionPhase.COMPANY_SELECTED;
          this.state.currentCompany = (request as unknown as Record<string, unknown>).companyId as string ?? null;
        }
        break;
    }
  }
}
