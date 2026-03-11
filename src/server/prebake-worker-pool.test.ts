/**
 * WorkerPool tests
 *
 * Workers are created with eval:true (Node.js Worker option) so we don't need
 * to write .js files to disk. The worker code is a minimal message-loop that
 * mirrors the protocol expected by WorkerPool.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { WorkerPool, runWithConcurrency, defaultConcurrency } from './prebake-worker-pool';
import { Worker } from 'worker_threads';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Write a temporary JS worker file and return its path. Caller must clean up. */
function writeTempWorker(code: string): string {
  const dir = os.tmpdir();
  const file = path.join(dir, `spo-test-worker-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(file, code);
  return file;
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('WorkerPool', () => {
  // A minimal worker that echoes {value: payload.value * 2}
  let doubleWorkerPath: string;
  // A worker that always fails with an error message
  let errorWorkerPath: string;
  // A worker that sleeps briefly then echoes
  let slowWorkerPath: string;

  beforeAll(() => {
    doubleWorkerPath = writeTempWorker(`
const { workerData, parentPort } = require('worker_threads');
parentPort.on('message', (msg) => {
  if (msg.type === 'shutdown') { process.exit(0); return; }
  parentPort.postMessage({ taskIndex: msg.taskIndex, output: { value: msg.payload.value * 2 } });
});
`);
    errorWorkerPath = writeTempWorker(`
const { parentPort } = require('worker_threads');
parentPort.on('message', (msg) => {
  if (msg.type === 'shutdown') { process.exit(0); return; }
  parentPort.postMessage({ taskIndex: msg.taskIndex, error: 'intentional error' });
});
`);
    slowWorkerPath = writeTempWorker(`
const { parentPort } = require('worker_threads');
parentPort.on('message', (msg) => {
  if (msg.type === 'shutdown') { process.exit(0); return; }
  setTimeout(() => {
    parentPort.postMessage({ taskIndex: msg.taskIndex, output: { done: true } });
  }, 5);
});
`);
  });

  afterAll(() => {
    for (const p of [doubleWorkerPath, errorWorkerPath, slowWorkerPath]) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  });

  test('runAll with zero tasks returns empty array', async () => {
    const pool = new WorkerPool({ workerPath: doubleWorkerPath, concurrency: 2 });
    const results = await pool.runAll([]);
    expect(results).toEqual([]);
    await pool.shutdown();
  });

  test('runAll processes tasks with concurrency=1 (serial)', async () => {
    const pool = new WorkerPool({ workerPath: doubleWorkerPath, concurrency: 1 });
    const tasks = [{ value: 1 }, { value: 2 }, { value: 3 }];
    const results = await pool.runAll(tasks);

    expect(results).toHaveLength(3);
    expect(results[0].output).toEqual({ value: 2 });
    expect(results[1].output).toEqual({ value: 4 });
    expect(results[2].output).toEqual({ value: 6 });
    expect(results.every(r => !r.error)).toBe(true);
    await pool.shutdown();
  });

  test('runAll processes tasks with concurrency=N (fully parallel)', async () => {
    const pool = new WorkerPool({ workerPath: doubleWorkerPath, concurrency: 4 });
    const tasks = Array.from({ length: 8 }, (_, i) => ({ value: i + 1 }));
    const results = await pool.runAll(tasks);

    expect(results).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(results[i].taskIndex).toBe(i);
      expect(results[i].output).toEqual({ value: (i + 1) * 2 });
    }
    await pool.shutdown();
  });

  test('runAll with concurrency=2 and 5 tasks (partial parallelism)', async () => {
    const pool = new WorkerPool({ workerPath: doubleWorkerPath, concurrency: 2 });
    const tasks = Array.from({ length: 5 }, (_, i) => ({ value: i }));
    const results = await pool.runAll(tasks);

    expect(results).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(results[i].output).toEqual({ value: i * 2 });
    }
    await pool.shutdown();
  });

  test('worker error propagates as result.error (not thrown)', async () => {
    const pool = new WorkerPool({ workerPath: errorWorkerPath, concurrency: 2 });
    const tasks = [{ value: 1 }, { value: 2 }];
    const results = await pool.runAll(tasks);

    expect(results).toHaveLength(2);
    expect(results[0].error).toBe('intentional error');
    expect(results[1].error).toBe('intentional error');
    await pool.shutdown();
  });

  test('completedCount updates after each task', async () => {
    const pool = new WorkerPool({ workerPath: doubleWorkerPath, concurrency: 1 });
    expect(pool.completedCount).toBe(0);
    await pool.runAll([{ value: 1 }, { value: 2 }, { value: 3 }]);
    expect(pool.completedCount).toBe(3);
    await pool.shutdown();
  });

  test('results have non-negative durationMs', async () => {
    const pool = new WorkerPool({ workerPath: slowWorkerPath, concurrency: 2 });
    const results = await pool.runAll([{}, {}]);
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(results[1].durationMs).toBeGreaterThanOrEqual(0);
    await pool.shutdown();
  });

  test('constructor throws if concurrency < 1', () => {
    expect(() => new WorkerPool({ workerPath: doubleWorkerPath, concurrency: 0 }))
      .toThrow('concurrency must be >= 1');
  });

  test('constructor throws if worker file does not exist', () => {
    expect(() => new WorkerPool({ workerPath: '/nonexistent/worker.js', concurrency: 1 }))
      .toThrow('worker file not found');
  });

  test('shutdown() is a no-op (idempotent)', async () => {
    const pool = new WorkerPool({ workerPath: doubleWorkerPath, concurrency: 1 });
    await pool.runAll([{ value: 5 }]);
    await pool.shutdown();
    await pool.shutdown(); // second call must not throw
  });

  test('workerData is passed to all workers', async () => {
    const workerPath = writeTempWorker(`
const { workerData, parentPort } = require('worker_threads');
parentPort.on('message', (msg) => {
  if (msg.type === 'shutdown') { process.exit(0); return; }
  parentPort.postMessage({ taskIndex: msg.taskIndex, output: { multiplier: workerData.multiplier } });
});
`);
    try {
      const pool = new WorkerPool({
        workerPath,
        concurrency: 2,
        workerData: { multiplier: 7 },
      });
      const results = await pool.runAll([{}, {}]);
      expect(results[0].output).toEqual({ multiplier: 7 });
      expect(results[1].output).toEqual({ multiplier: 7 });
      await pool.shutdown();
    } finally {
      fs.unlinkSync(workerPath);
    }
  });
});

// ─── runWithConcurrency ──────────────────────────────────────────────────────

describe('runWithConcurrency', () => {
  test('processes all items', async () => {
    const results = await runWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (n) => n * 10
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  test('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    await runWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async (n) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 5));
        concurrent--;
        return n;
      }
    );

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  test('empty array returns empty result', async () => {
    const results = await runWithConcurrency([], 4, async (x) => x);
    expect(results).toEqual([]);
  });

  test('passes index to callback', async () => {
    const indices: number[] = [];
    await runWithConcurrency(['a', 'b', 'c'], 1, async (item, idx) => {
      indices.push(idx);
      return item;
    });
    expect(indices).toEqual([0, 1, 2]);
  });
});

// ─── defaultConcurrency ─────────────────────────────────────────────────────

describe('defaultConcurrency', () => {
  test('returns at least 1', () => {
    expect(defaultConcurrency()).toBeGreaterThanOrEqual(1);
  });

  test('returns cpus-1 or 1 minimum', () => {
    const cpus = os.cpus().length;
    const expected = Math.max(1, cpus - 1);
    expect(defaultConcurrency()).toBe(expected);
  });
});
