/**
 * HTTP URL Pattern Matcher for the mock server.
 * Matches HTTP GET requests (to ASP pages) and returns captured HTML responses.
 */

import type { HttpExchange, HttpScenario, HttpMatchResult } from './types/http-exchange-types';
import { substituteVariables, mergeVariables } from './scenarios/scenario-variables';
import type { ScenarioVariables } from './scenarios/scenario-variables';

/**
 * HttpMock — matches HTTP requests to captured exchange data.
 */
export class HttpMock {
  private exchanges: HttpExchange[] = [];

  addScenario(scenario: HttpScenario): void {
    this.exchanges.push(...scenario.exchanges);
  }

  addExchange(exchange: HttpExchange): void {
    this.exchanges.push(exchange);
  }

  match(
    method: string,
    url: string,
    vars?: Partial<ScenarioVariables>
  ): HttpMatchResult | null {
    const resolved = mergeVariables(vars);
    const { pathname, queryParams } = this.parseUrl(url);

    for (const ex of this.exchanges) {
      if (ex.method !== method.toUpperCase()) continue;

      // Substitute variables in URL pattern before matching
      const resolvedPattern = substituteVariables(ex.urlPattern, resolved);

      if (!this.pathMatches(pathname, resolvedPattern)) continue;

      if (ex.queryPatterns) {
        const resolvedQueryPatterns: Record<string, string> = {};
        for (const [k, v] of Object.entries(ex.queryPatterns)) {
          resolvedQueryPatterns[k] = substituteVariables(v, resolved);
        }
        if (!this.queryMatches(queryParams, resolvedQueryPatterns)) continue;
      }

      const body = ex.body
        ? substituteVariables(ex.body, resolved)
        : '';

      return {
        exchange: ex,
        body,
        status: ex.status,
        contentType: ex.contentType,
        headers: ex.headers ?? {},
      };
    }

    return null;
  }

  getExchangeCount(): number {
    return this.exchanges.length;
  }

  reset(): void {
    this.exchanges = [];
  }

  private parseUrl(url: string): { pathname: string; queryParams: Map<string, string> } {
    const qIdx = url.indexOf('?');
    const pathname = qIdx >= 0 ? url.substring(0, qIdx) : url;
    const queryParams = new Map<string, string>();

    if (qIdx >= 0) {
      const queryString = url.substring(qIdx + 1);
      for (const pair of queryString.split('&')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx >= 0) {
          const key = decodeURIComponent(pair.substring(0, eqIdx));
          const value = decodeURIComponent(pair.substring(eqIdx + 1));
          queryParams.set(key, value);
        }
      }
    }

    return { pathname: pathname.toLowerCase(), queryParams };
  }

  private pathMatches(requestPath: string, pattern: string): boolean {
    const normalizedPattern = pattern.toLowerCase().split('?')[0];

    // Exact match
    if (requestPath === normalizedPattern) return true;

    // Wildcard match: pattern contains *
    if (normalizedPattern.includes('*')) {
      const regex = new RegExp(
        '^' + normalizedPattern.replace(/\*/g, '[^/]*') + '$'
      );
      return regex.test(requestPath);
    }

    // Partial path match (request ends with pattern)
    if (requestPath.endsWith(normalizedPattern)) return true;

    return false;
  }

  private queryMatches(
    actual: Map<string, string>,
    patterns: Record<string, string>
  ): boolean {
    // All pattern keys must be present in actual (subset match)
    for (const [key, expectedValue] of Object.entries(patterns)) {
      const actualValue = actual.get(key);
      if (actualValue === undefined) return false;
      if (expectedValue !== '*' && actualValue !== expectedValue) return false;
    }
    return true;
  }
}
