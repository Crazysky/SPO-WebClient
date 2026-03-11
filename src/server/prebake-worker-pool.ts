/**
 * WorkerPool
 *
 * Generic typed worker thread pool for CPU-bound batch tasks.
 * Workers are persistent — each handles multiple tasks via a message loop to
 * amortize spawn cost. The pool queues tasks and dispatches to idle workers.
 *
 * Usage:
 *   const pool = new WorkerPool<MyTask, MyResult>({ workerPath, concurrency });
 *   const results = await pool.runAll(tasks);
 *   await pool.shutdown();
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';

export interface WorkerPoolOptions {
  /** Absolute path to the compiled JS worker file */
  workerPath: string;
  /** Maximum simultaneous workers (must be >= 1) */
  concurrency: number;
  /** Data passed to every worker constructor via workerData */
  workerData?: Record<string, unknown>;
  /**
   * SharedArrayBuffers (or other transferables) to share with all workers.
   * These are passed via workerData — do NOT include them in transferList,
   * as transferring a SAB would break the shared-memory semantics.
   */
  transferList?: never[]; // Reserved for future use; SABs go in workerData
}

export interface WorkerTaskResult<TOutput> {
  taskIndex: number;
  output?: TOutput;
  error?: string;
  durationMs: number;
}

/**
 * Internal sentinel sent to a worker to signal shutdown.
 */
interface ShutdownMessage {
  type: 'shutdown';
}

/**
 * Internal wrapper sent to a worker to identify a task.
 */
interface TaskMessage<TInput> {
  type: 'task';
  taskIndex: number;
  payload: TInput;
}

/**
 * Internal message received from a worker.
 */
interface WorkerResultMessage<TOutput> {
  taskIndex: number;
  output?: TOutput;
  error?: string;
}

/**
 * Generic persistent-worker thread pool.
 *
 * @template TInput  Type of each task payload sent to workers
 * @template TOutput Type of each result payload received from workers
 */
export class WorkerPool<TInput, TOutput> {
  private readonly options: WorkerPoolOptions;
  private _completedCount: number = 0;
  private _pendingCount: number = 0;

  constructor(options: WorkerPoolOptions) {
    if (options.concurrency < 1) {
      throw new Error('WorkerPool: concurrency must be >= 1');
    }
    if (!fs.existsSync(options.workerPath)) {
      throw new Error(
        `WorkerPool: worker file not found: ${options.workerPath}\n` +
        'Run "npm run build:server" to compile workers first.'
      );
    }
    this.options = options;
  }

  get completedCount(): number { return this._completedCount; }
  get pendingCount(): number { return this._pendingCount; }

  /**
   * Execute all tasks with bounded concurrency.
   * Returns results indexed by task order (same length as tasks array).
   * Worker errors are captured as result.error (never thrown).
   */
  async runAll(tasks: TInput[]): Promise<WorkerTaskResult<TOutput>[]> {
    if (tasks.length === 0) return [];

    this._completedCount = 0;
    this._pendingCount = tasks.length;

    const results: WorkerTaskResult<TOutput>[] = new Array(tasks.length);
    const numWorkers = Math.min(this.options.concurrency, tasks.length);

    // Task queue and cursor
    let nextTaskIdx = 0;
    const taskStartTimes = new Map<number, number>();

    return new Promise<WorkerTaskResult<TOutput>[]>((resolve, reject) => {
      let settled = false;
      let activeWorkers = numWorkers;

      const workers: Worker[] = [];

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        // Terminate any remaining workers
        for (const w of workers) {
          w.terminate().catch(() => {/* ignore */});
        }
        if (err) reject(err);
        else resolve(results);
      };

      const sendNextTask = (worker: Worker) => {
        if (nextTaskIdx >= tasks.length) {
          // No more tasks — shut down this worker
          worker.postMessage({ type: 'shutdown' } satisfies ShutdownMessage);
          return;
        }
        const idx = nextTaskIdx++;
        taskStartTimes.set(idx, Date.now());
        const msg: TaskMessage<TInput> = { type: 'task', taskIndex: idx, payload: tasks[idx] };
        worker.postMessage(msg);
      };

      for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(this.options.workerPath, {
          workerData: this.options.workerData ?? {},
        });
        workers.push(worker);

        worker.on('message', (msg: WorkerResultMessage<TOutput>) => {
          const startTime = taskStartTimes.get(msg.taskIndex) ?? Date.now();
          results[msg.taskIndex] = {
            taskIndex: msg.taskIndex,
            output: msg.output,
            error: msg.error,
            durationMs: Date.now() - startTime,
          };
          this._completedCount++;
          this._pendingCount--;
          taskStartTimes.delete(msg.taskIndex);
          sendNextTask(worker);
        });

        worker.on('exit', (code) => {
          activeWorkers--;
          if (code !== 0 && !settled) {
            finish(new Error(`Worker exited with non-zero code: ${code}`));
          } else if (activeWorkers === 0) {
            finish();
          }
        });

        worker.on('error', (err: unknown) => {
          // Worker-level error (e.g., unhandled exception) — terminate all
          finish(err instanceof Error ? err : new Error(String(err)));
        });

        // Kick off the first task for this worker
        sendNextTask(worker);
      }
    });
  }

  /**
   * Shut down all workers gracefully (waits for current tasks to finish).
   * Call this after runAll() has resolved.
   */
  async shutdown(): Promise<void> {
    // runAll() already terminates workers — this is a no-op placeholder
    // kept for API symmetry and future cleanup hooks.
  }
}

/**
 * Return the default worker concurrency for this machine.
 * Uses os.cpus().length - 1, minimum 1.
 */
export function defaultConcurrency(): number {
  // Lazy import to avoid top-level side effects in worker threads
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require('os') as typeof import('os');
  return Math.max(1, os.cpus().length - 1);
}

/**
 * Run tasks in parallel with a concurrency limit (no worker threads).
 * Useful for I/O-bound tasks (e.g., parallel CAB extraction via subprocesses).
 *
 * @param tasks     Items to process
 * @param limit     Max simultaneous executions
 * @param fn        Async function to run per item
 */
export async function runWithConcurrency<T, R>(
  tasks: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(tasks.length);
  let nextIdx = 0;

  const worker = async () => {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await fn(tasks[idx], idx);
    }
  };

  const slots = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: slots }, worker));
  return results;
}
