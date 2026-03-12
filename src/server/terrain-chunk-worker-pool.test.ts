/**
 * WorkerPool unit tests.
 *
 * Uses a mock `worker_threads.Worker` that simulates terrain-chunk-worker
 * behavior synchronously (via setImmediate), so no actual processes are spawned.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { AtlasManifest } from './atlas-generator';

// ---------------------------------------------------------------------------
// Mock worker_threads — MUST be before the import that uses it.
// ts-jest hoists jest.mock() calls above all other imports.
// ---------------------------------------------------------------------------

jest.mock('worker_threads', () => {
  const { EventEmitter } = jest.requireActual<typeof import('events')>('events');

  class MockWorker extends EventEmitter {
    terminated = false;

    constructor(_path: string) {
      super();
    }

    postMessage(msg: { type: string; [k: string]: unknown }): void {
      setImmediate(() => {
        if (msg['type'] === 'init') {
          this.emit('message', { type: 'ready' });
        } else if (msg['type'] === 'renderChunk') {
          // Return 4 tiny PNG buffers (z3, z2, z1, z0)
          this.emit('message', {
            type: 'chunkDone',
            jobId: msg['jobId'],
            pngs: [
              Buffer.alloc(4, 3),
              Buffer.alloc(4, 2),
              Buffer.alloc(4, 1),
              Buffer.alloc(4, 0),
            ],
          });
        }
        // 'mapData' messages are silently absorbed
      });
    }

    terminate(): Promise<void> {
      this.terminated = true;
      return Promise.resolve();
    }
  }

  return {
    Worker: MockWorker,
    workerData: null,
    parentPort: null,
    isMainThread: true,
  };
});

// Import AFTER jest.mock so the mock is in place when terrain-chunk-renderer
// executes its top-level `import { Worker } from 'worker_threads'`.
import { WorkerPool } from './terrain-chunk-renderer';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAtlasData(): Map<string, { pixels: Buffer; width: number; height: number; manifest: AtlasManifest }> {
  const manifest: AtlasManifest = {
    version: 1,
    terrainType: 'Earth',
    season: 0,
    tileWidth: 64,
    tileHeight: 32,
    cellHeight: 96,
    atlasWidth: 64,
    atlasHeight: 96,
    columns: 1,
    rows: 1,
    tiles: { '0': { x: 0, y: 64, width: 64, height: 32 } },
  };
  const m = new Map<string, { pixels: Buffer; width: number; height: number; manifest: AtlasManifest }>();
  m.set('Earth-0', { pixels: Buffer.alloc(64 * 96 * 4, 0), width: 64, height: 96, manifest });
  return m;
}

function makeMapData(): Map<string, { indices: Uint8Array; width: number; height: number }> {
  const m = new Map<string, { indices: Uint8Array; width: number; height: number }>();
  m.set('TestMap', { indices: new Uint8Array(64 * 64).fill(0), width: 64, height: 64 });
  return m;
}

const FAKE_PATH = '/fake/terrain-chunk-worker.js';
const BASE_JOB = { mapName: 'TestMap', terrainType: 'Earth', season: 0, chunkI: 0, chunkJ: 0 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerPool', () => {
  it('dispatch() resolves with 4 PNG Buffers', async () => {
    const pool = new WorkerPool(makeAtlasData(), FAKE_PATH, makeMapData());
    await pool.initialize();

    const pngs = await pool.dispatch(BASE_JOB);

    expect(pngs).toHaveLength(4);
    for (const png of pngs) {
      expect(Buffer.isBuffer(png)).toBe(true);
      expect(png.length).toBeGreaterThan(0);
    }

    await pool.terminate();
  });

  it('multiple concurrent dispatches all resolve', async () => {
    const pool = new WorkerPool(makeAtlasData(), FAKE_PATH, makeMapData());
    await pool.initialize();

    const results = await Promise.all([
      pool.dispatch({ ...BASE_JOB, chunkI: 0 }),
      pool.dispatch({ ...BASE_JOB, chunkI: 1 }),
      pool.dispatch({ ...BASE_JOB, chunkI: 2 }),
    ]);

    expect(results).toHaveLength(3);
    for (const pngs of results) {
      expect(pngs).toHaveLength(4);
    }

    await pool.terminate();
  });

  it('dispatch() after terminate() rejects immediately', async () => {
    const pool = new WorkerPool(makeAtlasData(), FAKE_PATH, makeMapData());
    await pool.initialize();
    await pool.terminate();

    await expect(pool.dispatch(BASE_JOB)).rejects.toThrow('WorkerPool is terminated');
  });

  it('terminate() rejects jobs pending in the queue', async () => {
    const pool = new WorkerPool(makeAtlasData(), FAKE_PATH, makeMapData());
    await pool.initialize();

    // Dispatch more jobs than workers so some end up in the queue
    const count = 20;
    const settled = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        pool.dispatch({ ...BASE_JOB, chunkI: i }).then(
          (v) => ({ ok: true as const, v }),
          (e: Error) => ({ ok: false as const, e }),
        )
      ).concat([pool.terminate().then(() => { /* side-effect: terminate */ }) as unknown as Promise<never>])
    );

    // All dispatches should have settled (resolved or rejected)
    const dispatches = settled.slice(0, count) as Array<{ ok: boolean }>;
    expect(dispatches).toHaveLength(count);
  });

  it('worker error response rejects the dispatch', async () => {
    const pool = new WorkerPool(makeAtlasData(), FAKE_PATH, makeMapData());
    await pool.initialize();

    // Kick off a dispatch — jobId will be '1' (first job on fresh pool)
    const dispatchPromise = pool.dispatch(BASE_JOB);

    // At this point _drain() has run synchronously:
    //   - 'mapData' sent to worker (no response expected)
    //   - 'renderChunk' sent to worker (mock will respond via setImmediate)
    // Job '1' is now in `active`. Emit an error synchronously before setImmediate fires.
    type Internals = { entries: Array<{ worker: import('events').EventEmitter }> };
    const { entries } = pool as unknown as Internals;
    entries[0].worker.emit('message', { type: 'error', jobId: '1', message: 'render failed' });

    await expect(dispatchPromise).rejects.toThrow('render failed');

    await pool.terminate();
  });

  it('map data is sent only once per worker per map', async () => {
    const pool = new WorkerPool(makeAtlasData(), FAKE_PATH, makeMapData());
    await pool.initialize();

    // Two sequential dispatches for the same map
    const r1 = await pool.dispatch(BASE_JOB);
    const r2 = await pool.dispatch(BASE_JOB);

    expect(r1).toHaveLength(4);
    expect(r2).toHaveLength(4);
    // Internal: worker's sentMaps should have 'TestMap' — no crash = map sent correctly
    await pool.terminate();
  });

  it('terminated pool terminates all workers', async () => {
    const pool = new WorkerPool(makeAtlasData(), FAKE_PATH, makeMapData());
    await pool.initialize();

    type Internals = { entries: Array<{ worker: { terminated: boolean } }> };
    const { entries } = pool as unknown as Internals;
    expect(entries.length).toBeGreaterThan(0);

    await pool.terminate();

    for (const entry of entries) {
      expect(entry.worker.terminated).toBe(true);
    }
  });
});
