/**
 * HTTP exchange types for the mock server.
 * Models captured HTTP request/response pairs from the game's ASP pages.
 */

/** A single captured HTTP exchange */
export interface HttpExchange {
  id: string;
  method: 'GET' | 'POST';
  /** URL path pattern — can contain variables like {{worldName}} */
  urlPattern: string;
  /** Query parameter patterns for matching (subset match) */
  queryPatterns?: Record<string, string>;
  /** Response status code */
  status: number;
  /** Response content type */
  contentType: string;
  /** Response body (for text/html responses) */
  body?: string;
  /** Response headers */
  headers?: Record<string, string>;
}

/** A complete HTTP scenario with multiple exchanges */
export interface HttpScenario {
  name: string;
  exchanges: HttpExchange[];
  variables: Record<string, string>;
}

/** Result from HTTP mock matching */
export interface HttpMatchResult {
  exchange: HttpExchange;
  body: string;
  status: number;
  contentType: string;
  headers: Record<string, string>;
}
