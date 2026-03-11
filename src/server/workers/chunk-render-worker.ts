/**
 * chunk-render-worker
 *
 * Worker thread for parallel z3 terrain chunk generation.
 * Receives atlas pixels + map indices via SharedArrayBuffer (zero-copy),
 * renders each assigned chunk, encodes as PNG, writes to disk.
 *
 * Init data (workerData, set once at spawn):
 *   atlasSab:         SharedArrayBuffer  — atlas RGBA pixels (read-only)
 *   atlasWidth:       number
 *   atlasManifestJson: string            — JSON-serialised AtlasManifest
 *   mapSab:           SharedArrayBuffer  — map palette indices (read-only)
 *   mapWidth:         number
 *   mapHeight:        number
 *
 * Protocol (per task):
 *   Main → Worker: TaskMessage
 *   Worker → Main: ResultMessage
 */

import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import { encodePng } from '../texture-alpha-baker';
import { generateChunkRGBAPure } from '../chunk-render-pure';
import { CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT } from '../terrain-chunk-renderer';
import type { AtlasManifest } from '../atlas-generator';
import { toErrorMessage } from '../../shared/error-utils';

if (!parentPort) {
  throw new Error('chunk-render-worker must run inside worker_threads');
}

// ─── Init from workerData (once per worker lifetime) ────────────────────────

interface ChunkWorkerInit {
  atlasSab: SharedArrayBuffer;
  atlasWidth: number;
  atlasManifestJson: string;
  mapSab: SharedArrayBuffer;
  mapWidth: number;
  mapHeight: number;
}

const init = workerData as ChunkWorkerInit;

// Wrap SABs as Buffer/Uint8Array views — zero-copy, shared memory
const atlasPixels = Buffer.from(new Uint8Array(init.atlasSab));
const atlasWidth  = init.atlasWidth;
const manifest: AtlasManifest = JSON.parse(init.atlasManifestJson);
const mapIndices  = new Uint8Array(init.mapSab);
const mapWidth    = init.mapWidth;
const mapHeight   = init.mapHeight;

// ─── Task protocol ───────────────────────────────────────────────────────────

export interface ChunkRenderTask {
  type: 'task';
  taskIndex: number;
  payload: {
    chunkI: number;
    chunkJ: number;
    z3OutputPath: string;
  };
}

export interface ChunkRenderResult {
  taskIndex: number;
  output?: {
    chunkI: number;
    chunkJ: number;
    bytesWritten: number;
  };
  error?: string;
}

interface ShutdownMessage {
  type: 'shutdown';
}

// ─── Message loop ────────────────────────────────────────────────────────────

parentPort.on('message', (msg: ChunkRenderTask | ShutdownMessage) => {
  if (msg.type === 'shutdown') {
    process.exit(0);
  }

  const { taskIndex, payload } = msg;
  const { chunkI, chunkJ, z3OutputPath } = payload;

  try {
    // Render z3 RGBA from atlas + map (pure function, no class instance needed)
    const rgba = generateChunkRGBAPure(
      atlasPixels, atlasWidth, manifest,
      mapIndices, mapWidth, mapHeight,
      chunkI, chunkJ
    );

    if (!rgba) {
      const reply: ChunkRenderResult = {
        taskIndex,
        error: `generateChunkRGBAPure returned null for chunk (${chunkI},${chunkJ})`,
      };
      parentPort!.postMessage(reply);
      return;
    }

    // Encode as PNG
    const png = encodePng(CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT, rgba);

    // Write to disk (directory was pre-created by main process)
    fs.writeFileSync(z3OutputPath, png);

    const reply: ChunkRenderResult = {
      taskIndex,
      output: { chunkI, chunkJ, bytesWritten: png.length },
    };
    parentPort!.postMessage(reply);
  } catch (err: unknown) {
    const reply: ChunkRenderResult = {
      taskIndex,
      error: toErrorMessage(err),
    };
    parentPort!.postMessage(reply);
  }
});
