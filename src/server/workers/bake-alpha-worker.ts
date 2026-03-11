/**
 * bake-alpha-worker
 *
 * Worker thread for parallel BMP → PNG alpha baking.
 * Runs as a persistent worker: loops on parentPort messages, processes one
 * BMP file per task, replies with success/error, then waits for the next task.
 *
 * Protocol:
 *   Main → Worker: TaskMessage | ShutdownMessage
 *   Worker → Main: ResultMessage
 */

import { parentPort } from 'worker_threads';
import { bakeAlpha } from '../texture-alpha-baker';
import type { ColorKey } from '../texture-alpha-baker';
import { toErrorMessage } from '../../shared/error-utils';

if (!parentPort) {
  throw new Error('bake-alpha-worker must run inside worker_threads');
}

export interface BakeAlphaTask {
  type: 'task';
  taskIndex: number;
  payload: {
    inputPath: string;
    outputPath: string;
    /** null = auto-detect from corner pixel */
    colorKey: ColorKey | null;
    tolerance?: number;
  };
}

export interface BakeAlphaResult {
  taskIndex: number;
  output?: {
    success: boolean;
    inputPath: string;
    bytesWritten: number;
  };
  error?: string;
}

interface ShutdownMessage {
  type: 'shutdown';
}

parentPort.on('message', (msg: BakeAlphaTask | ShutdownMessage) => {
  if (msg.type === 'shutdown') {
    process.exit(0);
  }

  const { taskIndex, payload } = msg;
  const { inputPath, outputPath, colorKey, tolerance } = payload;

  try {
    const result = bakeAlpha(inputPath, outputPath, colorKey, tolerance ?? 5);

    const reply: BakeAlphaResult = {
      taskIndex,
      output: {
        success: result.success,
        inputPath: result.inputPath,
        bytesWritten: result.success ? result.width * result.height * 4 : 0,
      },
    };

    if (!result.success && result.error) {
      reply.error = result.error;
    }

    parentPort!.postMessage(reply);
  } catch (err: unknown) {
    const reply: BakeAlphaResult = {
      taskIndex,
      error: toErrorMessage(err),
    };
    parentPort!.postMessage(reply);
  }
});
