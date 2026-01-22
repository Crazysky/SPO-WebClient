/**
 * Handler Utilities - Common patterns for WebSocket message handlers
 * Reduces boilerplate in server.ts message handlers
 */

import type { WebSocket } from 'ws';
import type { WsMessage, WsRespError } from '../../shared/types';
import { WsMessageType } from '../../shared/types';
import * as ErrorCodes from '../../shared/error-codes';

// Re-export error codes for convenience
export { ErrorCodes };

/**
 * Send a JSON response to the WebSocket client
 */
export function sendResponse<T extends WsMessage>(ws: WebSocket, response: T): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

/**
 * Send an error response to the WebSocket client
 */
export function sendError(
  ws: WebSocket,
  errorMessage: string,
  code: number = ErrorCodes.ERROR_Unknown,
  wsRequestId?: string,
): void {
  const errorResp: WsRespError = {
    type: WsMessageType.RESP_ERROR,
    wsRequestId,
    errorMessage,
    code,
  };
  sendResponse(ws, errorResp);
}

/**
 * Wrap a handler with error handling
 * Returns the result of the handler or null if an error occurred
 */
export async function withErrorHandler<T>(
  ws: WebSocket,
  wsRequestId: string | undefined,
  handler: () => Promise<T>,
  errorMessage: string = 'Request failed',
): Promise<T | null> {
  try {
    return await handler();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Handler] Error: ${errorMessage}`, message);
    sendError(ws, `${errorMessage}: ${message}`, ErrorCodes.ERROR_Unknown, wsRequestId);
    return null;
  }
}

/**
 * Create a standard success response with type safety
 */
export function createResponse<T extends WsMessage>(
  type: WsMessageType,
  wsRequestId: string | undefined,
  data: Omit<T, 'type' | 'wsRequestId'>,
): T {
  return {
    type,
    wsRequestId,
    ...data,
  } as T;
}
