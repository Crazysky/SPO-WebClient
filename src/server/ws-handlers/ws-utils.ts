import type { WebSocket } from 'ws';
import { WsMessageType, type WsMessage, type WsRespError } from '../../shared/types';
import * as ErrorCodes from '../../shared/error-codes';
import { toErrorMessage } from '../../shared/error-utils';

/** Send a JSON response through the WebSocket. */
export function sendResponse(ws: WebSocket, response: WsMessage): void {
  ws.send(JSON.stringify(response));
}

/** Send an error response through the WebSocket. */
export function sendError(ws: WebSocket, wsRequestId: string | undefined, errorMessage: string, code: number = ErrorCodes.ERROR_Unknown): void {
  const errorResp: WsRespError = {
    type: WsMessageType.RESP_ERROR,
    wsRequestId,
    errorMessage,
    code,
  };
  ws.send(JSON.stringify(errorResp));
}

/**
 * Wrap an async handler body with standard error handling.
 * If the body throws, sends a WsRespError with the given default code.
 */
export async function withErrorHandler(
  ws: WebSocket,
  wsRequestId: string | undefined,
  defaultCode: number,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    console.error('[Gateway] Request handler error:', toErrorMessage(err));
    sendError(ws, wsRequestId, toErrorMessage(err) || 'Internal Server Error', defaultCode);
  }
}
