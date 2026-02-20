/**
 * MockWebSocketClient — High-level WebSocket client facade for tests.
 * Simulates WebSocket interactions using captured scenarios.
 */

import type { WsMessage, WsMessageType } from '@/shared/types/message-types';
import type {
  WsCaptureScenario,
  MockSessionState,
  MessageLogEntry,
  EventHandler,
  ScheduledEvent,
} from './types/mock-types';
import { CaptureStore } from './capture-store';
import { ReplayEngine } from './replay-engine';

export class MockWebSocketClient {
  private engine: ReplayEngine;
  private store: CaptureStore;
  private messageLog: MessageLogEntry[] = [];
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private scheduledTimers: ReturnType<typeof setTimeout>[] = [];
  private scenarios: WsCaptureScenario[];

  constructor(scenarios: WsCaptureScenario[]) {
    this.scenarios = scenarios;
    this.store = new CaptureStore();
    for (const scenario of scenarios) {
      this.store.addWsScenario(scenario);
    }
    this.engine = new ReplayEngine(this.store);
  }

  /**
   * Send a request and receive the first matched response.
   * Throws if no matching capture is found.
   */
  async send(request: WsMessage): Promise<WsMessage> {
    // Log the sent message
    this.messageLog.push({
      direction: 'sent',
      msg: request,
      timestamp: Date.now(),
    });

    const result = this.engine.match(request);
    if (!result) {
      throw new Error(`No matching capture for request type: ${request.type}`);
    }

    // Apply delay if specified
    if (result.delayMs > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, result.delayMs));
    }

    // Log all responses
    for (const response of result.responses) {
      this.messageLog.push({
        direction: 'received',
        msg: response,
        timestamp: Date.now(),
      });
    }

    // Emit additional responses as events
    if (result.responses.length > 1) {
      for (let i = 1; i < result.responses.length; i++) {
        this.emitEvent(result.responses[i]);
      }
    }

    // Return the first response
    return result.responses[0];
  }

  /**
   * Register an event handler for server push messages.
   */
  onEvent(type: WsMessageType | string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(type) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(type, handlers);
  }

  /**
   * Start emitting scheduled events from all loaded scenarios.
   */
  startScheduledEvents(): void {
    for (const scenario of this.scenarios) {
      if (!scenario.scheduledEvents) continue;

      for (const scheduled of scenario.scheduledEvents) {
        this.scheduleEvent(scheduled);
      }
    }
  }

  /**
   * Stop all scheduled event timers.
   */
  stopScheduledEvents(): void {
    for (const timer of this.scheduledTimers) {
      clearTimeout(timer);
    }
    this.scheduledTimers = [];
  }

  /**
   * Get the full message log (sent + received).
   */
  getMessageLog(): MessageLogEntry[] {
    return [...this.messageLog];
  }

  /**
   * Get only sent messages.
   */
  getSentMessages(): WsMessage[] {
    return this.messageLog
      .filter(entry => entry.direction === 'sent')
      .map(entry => entry.msg);
  }

  /**
   * Get only received messages.
   */
  getReceivedMessages(): WsMessage[] {
    return this.messageLog
      .filter(entry => entry.direction === 'received')
      .map(entry => entry.msg);
  }

  /**
   * Check if a message of the given type has been received.
   */
  hasReceived(type: WsMessageType | string): boolean {
    return this.messageLog.some(
      entry => entry.direction === 'received' && entry.msg.type === type
    );
  }

  /**
   * Get current session state.
   */
  getSessionState(): MockSessionState {
    return this.engine.getState();
  }

  /**
   * Reset all state: logs, consumed exchanges, session state.
   */
  reset(): void {
    this.messageLog = [];
    this.eventHandlers.clear();
    this.stopScheduledEvents();
    this.engine.reset();
  }

  private emitEvent(msg: WsMessage): void {
    const handlers = this.eventHandlers.get(msg.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(msg);
      }
    }
  }

  private scheduleEvent(scheduled: ScheduledEvent): void {
    if (scheduled.repeat) {
      let count = 0;
      const maxCount = scheduled.repeat.count;
      const interval = scheduled.repeat.intervalMs;

      const emitRepeat = (): void => {
        if (count >= maxCount) return;
        count++;

        this.messageLog.push({
          direction: 'received',
          msg: { ...scheduled.event },
          timestamp: Date.now(),
        });
        this.emitEvent(scheduled.event);

        if (count < maxCount) {
          const timer = setTimeout(emitRepeat, interval);
          this.scheduledTimers.push(timer);
        }
      };

      const firstTimer = setTimeout(emitRepeat, scheduled.afterMs);
      this.scheduledTimers.push(firstTimer);
    } else {
      const timer = setTimeout(() => {
        this.messageLog.push({
          direction: 'received',
          msg: { ...scheduled.event },
          timestamp: Date.now(),
        });
        this.emitEvent(scheduled.event);
      }, scheduled.afterMs);
      this.scheduledTimers.push(timer);
    }
  }
}
