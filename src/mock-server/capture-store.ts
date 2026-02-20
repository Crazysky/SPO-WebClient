/**
 * CaptureStore — central storage for all loaded mock scenarios.
 * Stores WebSocket, RDO, and HTTP scenarios for lookup.
 */

import type { WsMessageType } from '@/shared/types/message-types';
import type { WsCaptureScenario, WsCaptureExchange } from './types/mock-types';
import type { RdoScenario } from './types/rdo-exchange-types';
import type { HttpScenario, HttpExchange } from './types/http-exchange-types';

export class CaptureStore {
  private wsScenarios: WsCaptureScenario[] = [];
  private rdoScenarios: RdoScenario[] = [];
  private httpScenarios: HttpScenario[] = [];

  addWsScenario(scenario: WsCaptureScenario): void {
    this.wsScenarios.push(scenario);
  }

  addRdoScenario(scenario: RdoScenario): void {
    this.rdoScenarios.push(scenario);
  }

  addHttpScenario(scenario: HttpScenario): void {
    this.httpScenarios.push(scenario);
  }

  getWsScenarios(): WsCaptureScenario[] {
    return [...this.wsScenarios];
  }

  getRdoScenarios(): RdoScenario[] {
    return [...this.rdoScenarios];
  }

  getHttpScenarios(): HttpScenario[] {
    return [...this.httpScenarios];
  }

  /** Find all WS exchanges matching a given message type */
  getExchangesByType(type: WsMessageType | string): WsCaptureExchange[] {
    const results: WsCaptureExchange[] = [];
    for (const scenario of this.wsScenarios) {
      for (const exchange of scenario.exchanges) {
        if (exchange.request.type === type) {
          results.push(exchange);
        }
      }
    }
    return results;
  }

  /** Find first HTTP exchange matching a URL path */
  getHttpExchangeForUrl(method: string, urlPath: string): HttpExchange | null {
    const normalizedPath = urlPath.toLowerCase().split('?')[0];

    for (const scenario of this.httpScenarios) {
      for (const exchange of scenario.exchanges) {
        if (exchange.method !== method.toUpperCase()) continue;
        const pattern = exchange.urlPattern.toLowerCase().split('?')[0];
        if (normalizedPath === pattern || normalizedPath.endsWith(pattern)) {
          return exchange;
        }
      }
    }
    return null;
  }

  /** Total number of WS exchanges across all scenarios */
  getWsExchangeCount(): number {
    return this.wsScenarios.reduce((sum, s) => sum + s.exchanges.length, 0);
  }

  clear(): void {
    this.wsScenarios = [];
    this.rdoScenarios = [];
    this.httpScenarios = [];
  }
}
