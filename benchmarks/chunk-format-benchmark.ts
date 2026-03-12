/**
 * Chunk Format Benchmark
 *
 * Compares terrain chunk encoding formats for disk size and encode speed.
 * Reads existing cached PNG chunks, re-encodes in multiple formats, and
 * prints a comparison table.
 *
 * Scenarios:
 *   0. Baseline — Current PNG (Up filter, zlib 9)
 *   1. WebP Lossless — via webp-wasm (pure WASM)
 *   2. WebP Near-Lossless (q80) — via webp-wasm
 *   3. PNG Adaptive Filter — per-row best-of-5 filter selection
 *
 * Usage:
 *   npx tsx benchmarks/chunk-format-benchmark.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// Import project's PNG codec
import { encodePng, decodePng } from '../src/server/texture-alpha-baker';

// ============================================================================
// Configuration
// ============================================================================

const CACHE_BASE = path.resolve(__dirname, '..', 'webclient-cache', 'chunks');
const MAP_NAME = 'shamba';
const TERRAIN_TYPE = 'Earth';
const SEASON = '2';

// Sample coords per zoom level — diverse terrain (corners, center, edges)
const SAMPLE_COORDS = [
  { i: 0, j: 0 },     // corner — likely water/edge
  { i: 16, j: 16 },   // center — likely city
  { i: 0, j: 15 },    // edge
  { i: 8, j: 24 },    // mixed area
  { i: 31, j: 31 },   // far corner
];

const ZOOM_LEVELS = [0, 1, 2, 3];
const ITERATIONS = 3; // encode iterations per scenario (take median)

// Chunk canvas dimensions per zoom level
const CHUNK_DIMS: Record<number, { width: number; height: number }> = {
  3: { width: 2080, height: 1056 },
  2: { width: 1040, height: 528 },
  1: { width: 520, height: 264 },
  0: { width: 260, height: 132 },
};

// ============================================================================
// CRC32 (duplicate from texture-alpha-baker — needed for adaptive PNG encoder)
// ============================================================================

const CRC_TABLE: Uint32Array = new Uint32Array(256);
(function initCrcTable() {
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) { c = 0xEDB88320 ^ (c >>> 1); } else { c = c >>> 1; }
    }
    CRC_TABLE[n] = c >>> 0;
  }
})();

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcValue = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crcValue, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// ============================================================================
// PNG Adaptive Filter Encoder (Scenario 3)
// ============================================================================

/** Apply PNG filter to a single row, returns Buffer with filter byte prefix */
function applyPngFilter(
  filterType: number,
  y: number,
  rowBytes: number,
  rgba: Buffer
): Buffer {
  const row = Buffer.alloc(1 + rowBytes);
  row[0] = filterType;
  const currRow = y * rowBytes;
  const prevRow = (y - 1) * rowBytes;

  switch (filterType) {
    case 0: // None
      rgba.copy(row, 1, currRow, currRow + rowBytes);
      break;

    case 1: // Sub
      for (let x = 0; x < rowBytes; x++) {
        const a = x >= 4 ? rgba[currRow + x - 4] : 0;
        row[1 + x] = (rgba[currRow + x] - a) & 0xFF;
      }
      break;

    case 2: // Up
      for (let x = 0; x < rowBytes; x++) {
        const b = y > 0 ? rgba[prevRow + x] : 0;
        row[1 + x] = (rgba[currRow + x] - b) & 0xFF;
      }
      break;

    case 3: // Average
      for (let x = 0; x < rowBytes; x++) {
        const a = x >= 4 ? rgba[currRow + x - 4] : 0;
        const b = y > 0 ? rgba[prevRow + x] : 0;
        row[1 + x] = (rgba[currRow + x] - ((a + b) >>> 1)) & 0xFF;
      }
      break;

    case 4: // Paeth
      for (let x = 0; x < rowBytes; x++) {
        const a = x >= 4 ? rgba[currRow + x - 4] : 0;
        const b = y > 0 ? rgba[prevRow + x] : 0;
        const c = (x >= 4 && y > 0) ? rgba[prevRow + x - 4] : 0;
        row[1 + x] = (rgba[currRow + x] - paethPredictor(a, b, c)) & 0xFF;
      }
      break;
  }

  return row;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Encode PNG with adaptive per-row filter selection.
 * For each row, tries all 5 PNG filters, picks the one producing smallest
 * trial-compressed output (zlib level 1 for speed), then compresses the
 * full image at zlib level 9.
 */
function encodePngAdaptive(width: number, height: number, rgba: Buffer): Buffer {
  const rowBytes = width * 4;
  const filteredRows: Buffer[] = [];

  for (let y = 0; y < height; y++) {
    let bestLen = Infinity;
    let bestRow: Buffer = Buffer.alloc(0);

    for (let filterType = 0; filterType <= 4; filterType++) {
      const filtered = applyPngFilter(filterType, y, rowBytes, rgba);
      // Quick trial compress to estimate which filter produces best compression
      const trial = zlib.deflateSync(filtered, { level: 1 });
      if (trial.length < bestLen) {
        bestLen = trial.length;
        bestRow = filtered;
      }
    }

    filteredRows.push(bestRow);
  }

  const rawData = Buffer.concat(filteredRows);
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // Build PNG
  const chunks: Buffer[] = [];
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); // signature

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace
  chunks.push(createPngChunk('IHDR', ihdr));
  chunks.push(createPngChunk('IDAT', compressed));
  chunks.push(createPngChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

// ============================================================================
// Benchmark Runner
// ============================================================================

interface ChunkSample {
  zoom: number;
  i: number;
  j: number;
  filePath: string;
  fileSize: number;
  width: number;
  height: number;
  rgba: Buffer;
}

interface ScenarioResult {
  name: string;
  outputBytes: number;
  encodeTimeMs: number; // median
  vsBaseline: number;   // ratio (outputBytes / baselineBytes)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatKB(bytes: number): string {
  return (bytes / 1024).toFixed(1).padStart(8) + ' KB';
}

function formatMs(ms: number): string {
  return ms.toFixed(0).padStart(6) + ' ms';
}

function formatPct(ratio: number): string {
  return (ratio * 100).toFixed(1).padStart(6) + '%';
}

async function loadSamples(): Promise<ChunkSample[]> {
  const samples: ChunkSample[] = [];

  for (const zoom of ZOOM_LEVELS) {
    const dir = path.join(CACHE_BASE, MAP_NAME, TERRAIN_TYPE, SEASON, `z${zoom}`);
    if (!fs.existsSync(dir)) {
      console.warn(`  [WARN] Missing cache dir: ${dir}`);
      continue;
    }

    const available = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
    let selectedCoords = SAMPLE_COORDS;

    // Fall back to first-N if specific coords don't exist
    const existing = selectedCoords.filter(c =>
      available.includes(`chunk_${c.i}_${c.j}.png`)
    );

    if (existing.length < 3) {
      // Parse available chunk coords and pick evenly spaced ones
      const parsed = available.map(f => {
        const m = f.match(/chunk_(\d+)_(\d+)\.png/);
        return m ? { i: parseInt(m[1]), j: parseInt(m[2]) } : null;
      }).filter(Boolean) as { i: number; j: number }[];

      const step = Math.max(1, Math.floor(parsed.length / 5));
      selectedCoords = [];
      for (let k = 0; k < Math.min(5, parsed.length); k++) {
        selectedCoords.push(parsed[k * step]);
      }
    } else {
      selectedCoords = existing;
    }

    const dims = CHUNK_DIMS[zoom];

    for (const coord of selectedCoords) {
      const filePath = path.join(dir, `chunk_${coord.i}_${coord.j}.png`);
      if (!fs.existsSync(filePath)) continue;

      const pngBuf = fs.readFileSync(filePath);
      const decoded = decodePng(pngBuf);

      samples.push({
        zoom,
        i: coord.i,
        j: coord.j,
        filePath,
        fileSize: pngBuf.length,
        width: decoded.width,
        height: decoded.height,
        rgba: decoded.pixels,
      });
    }
  }

  return samples;
}

async function benchmarkScenarios(sample: ChunkSample): Promise<{
  baseline: ScenarioResult;
  webpLossless: ScenarioResult;
  webpNearLossless: ScenarioResult;
  pngAdaptive: ScenarioResult;
}> {
  const { width, height, rgba } = sample;

  // Lazily import webp-wasm
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webp = require('webp-wasm');
  const imageData = {
    data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    width,
    height,
  };

  // --- Scenario 0: Baseline PNG ---
  const baselineTimes: number[] = [];
  let baselineOutput: Buffer = Buffer.alloc(0);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const t0 = performance.now();
    baselineOutput = encodePng(width, height, rgba);
    baselineTimes.push(performance.now() - t0);
  }

  const baselineBytes = baselineOutput.length;

  // --- Scenario 1: WebP Lossless ---
  const webpLLTimes: number[] = [];
  let webpLLOutput: Buffer = Buffer.alloc(0);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const t0 = performance.now();
    webpLLOutput = await webp.encode(imageData, {
      lossless: 1,
      quality: 100,
      method: 6, // best compression (0=fast, 6=best)
      exact: 1,  // preserve alpha for transparent pixels
    });
    webpLLTimes.push(performance.now() - t0);
  }

  // --- Scenario 2: WebP Near-Lossless ---
  const webpNLTimes: number[] = [];
  let webpNLOutput: Buffer = Buffer.alloc(0);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const t0 = performance.now();
    webpNLOutput = await webp.encode(imageData, {
      lossless: 1,
      near_lossless: 80,
      quality: 100,
      method: 6,
      exact: 1,
    });
    webpNLTimes.push(performance.now() - t0);
  }

  // --- Scenario 3: PNG Adaptive Filter ---
  const adaptiveTimes: number[] = [];
  let adaptiveOutput: Buffer = Buffer.alloc(0);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const t0 = performance.now();
    adaptiveOutput = encodePngAdaptive(width, height, rgba);
    adaptiveTimes.push(performance.now() - t0);
  }

  return {
    baseline: {
      name: 'Baseline PNG',
      outputBytes: baselineBytes,
      encodeTimeMs: median(baselineTimes),
      vsBaseline: 1.0,
    },
    webpLossless: {
      name: 'WebP Lossless',
      outputBytes: webpLLOutput.length,
      encodeTimeMs: median(webpLLTimes),
      vsBaseline: webpLLOutput.length / baselineBytes,
    },
    webpNearLossless: {
      name: 'WebP Near-LL',
      outputBytes: webpNLOutput.length,
      encodeTimeMs: median(webpNLTimes),
      vsBaseline: webpNLOutput.length / baselineBytes,
    },
    pngAdaptive: {
      name: 'PNG Adaptive',
      outputBytes: adaptiveOutput.length,
      encodeTimeMs: median(adaptiveTimes),
      vsBaseline: adaptiveOutput.length / baselineBytes,
    },
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('=== Chunk Format Benchmark ===\n');
  console.log(`Cache: ${CACHE_BASE}`);
  console.log(`Map: ${MAP_NAME}/${TERRAIN_TYPE}, Season: ${SEASON}`);
  console.log(`Iterations per scenario: ${ITERATIONS} (median)\n`);

  // Load samples
  console.log('Loading samples...');
  const samples = await loadSamples();
  console.log(`Loaded ${samples.length} chunks\n`);

  if (samples.length === 0) {
    console.error('ERROR: No chunk samples found. Run the server first to pre-generate chunks.');
    process.exit(1);
  }

  // Per-chunk results
  const allResults: Array<{
    sample: ChunkSample;
    results: Awaited<ReturnType<typeof benchmarkScenarios>>;
  }> = [];

  console.log('=== Per-Chunk Results ===\n');

  for (const sample of samples) {
    const rawBytes = sample.width * sample.height * 4;
    console.log(
      `z${sample.zoom}/chunk_${sample.i}_${sample.j} ` +
      `(${sample.width}×${sample.height}, ${(rawBytes / 1024 / 1024).toFixed(1)} MB raw, ` +
      `disk: ${formatKB(sample.fileSize).trim()})`
    );

    const results = await benchmarkScenarios(sample);
    allResults.push({ sample, results });

    const scenarios = [results.baseline, results.webpLossless, results.webpNearLossless, results.pngAdaptive];
    for (const s of scenarios) {
      const vsStr = s.vsBaseline === 1.0 ? '        ' : `vs base: ${formatPct(s.vsBaseline).trim()}`;
      console.log(
        `  ${s.name.padEnd(16)} ${formatKB(s.outputBytes).trim().padStart(10)}  ` +
        `encode: ${formatMs(s.encodeTimeMs).trim().padStart(8)}  ${vsStr}`
      );
    }
    console.log('');
  }

  // Summary by zoom level
  console.log('=== Summary by Zoom Level (averages) ===\n');
  console.log(
    'Zoom'.padEnd(6) +
    'Baseline'.padStart(10) +
    'WebP-LL'.padStart(10) +
    'WebP-NL'.padStart(10) +
    'PNG-Adpt'.padStart(10) +
    '  │ ' +
    'WP-LL %'.padStart(8) +
    'WP-NL %'.padStart(8) +
    'Adpt %'.padStart(8)
  );
  console.log('─'.repeat(82));

  const zoomTotals: Record<number, {
    count: number;
    baseline: number;
    webpLL: number;
    webpNL: number;
    adaptive: number;
  }> = {};

  for (const { sample, results } of allResults) {
    if (!zoomTotals[sample.zoom]) {
      zoomTotals[sample.zoom] = { count: 0, baseline: 0, webpLL: 0, webpNL: 0, adaptive: 0 };
    }
    const t = zoomTotals[sample.zoom];
    t.count++;
    t.baseline += results.baseline.outputBytes;
    t.webpLL += results.webpLossless.outputBytes;
    t.webpNL += results.webpNearLossless.outputBytes;
    t.adaptive += results.pngAdaptive.outputBytes;
  }

  let grandBaseline = 0;
  let grandWebpLL = 0;
  let grandWebpNL = 0;
  let grandAdaptive = 0;

  for (const zoom of ZOOM_LEVELS) {
    const t = zoomTotals[zoom];
    if (!t) continue;

    const avgBase = t.baseline / t.count;
    const avgLL = t.webpLL / t.count;
    const avgNL = t.webpNL / t.count;
    const avgAd = t.adaptive / t.count;

    grandBaseline += t.baseline;
    grandWebpLL += t.webpLL;
    grandWebpNL += t.webpNL;
    grandAdaptive += t.adaptive;

    console.log(
      `z${zoom}`.padEnd(6) +
      formatKB(avgBase).trim().padStart(10) +
      formatKB(avgLL).trim().padStart(10) +
      formatKB(avgNL).trim().padStart(10) +
      formatKB(avgAd).trim().padStart(10) +
      '  │ ' +
      formatPct(avgLL / avgBase).trim().padStart(8) +
      formatPct(avgNL / avgBase).trim().padStart(8) +
      formatPct(avgAd / avgBase).trim().padStart(8)
    );
  }

  console.log('─'.repeat(82));
  const totalSamples = allResults.length;
  if (totalSamples > 0) {
    console.log(
      'AVG'.padEnd(6) +
      formatKB(grandBaseline / totalSamples).trim().padStart(10) +
      formatKB(grandWebpLL / totalSamples).trim().padStart(10) +
      formatKB(grandWebpNL / totalSamples).trim().padStart(10) +
      formatKB(grandAdaptive / totalSamples).trim().padStart(10) +
      '  │ ' +
      formatPct(grandWebpLL / grandBaseline).trim().padStart(8) +
      formatPct(grandWebpNL / grandBaseline).trim().padStart(8) +
      formatPct(grandAdaptive / grandBaseline).trim().padStart(8)
    );
  }

  // Projected total disk usage
  console.log('\n=== Projected Total Disk Usage ===\n');
  const chunksPerZoom = 1024; // shamba/Earth has 1024 chunks per zoom
  const totalChunks = chunksPerZoom * ZOOM_LEVELS.length;

  for (const zoom of ZOOM_LEVELS) {
    const t = zoomTotals[zoom];
    if (!t) continue;

    const avgBase = t.baseline / t.count;
    const avgLL = t.webpLL / t.count;
    const avgNL = t.webpNL / t.count;
    const avgAd = t.adaptive / t.count;

    const projBase = (avgBase * chunksPerZoom) / (1024 * 1024);
    const projLL = (avgLL * chunksPerZoom) / (1024 * 1024);
    const projNL = (avgNL * chunksPerZoom) / (1024 * 1024);
    const projAd = (avgAd * chunksPerZoom) / (1024 * 1024);

    console.log(`z${zoom} (${chunksPerZoom} chunks):`);
    console.log(`  Baseline:           ${projBase.toFixed(1)} MB`);
    console.log(`  WebP Lossless:      ${projLL.toFixed(1)} MB  (${((1 - avgLL / avgBase) * 100).toFixed(0)}% saved)`);
    console.log(`  WebP Near-Lossless: ${projNL.toFixed(1)} MB  (${((1 - avgNL / avgBase) * 100).toFixed(0)}% saved)`);
    console.log(`  PNG Adaptive:       ${projAd.toFixed(1)} MB  (${((1 - avgAd / avgBase) * 100).toFixed(0)}% saved)`);
  }

  // Grand total projection
  let projTotalBase = 0, projTotalLL = 0, projTotalNL = 0, projTotalAd = 0;
  for (const zoom of ZOOM_LEVELS) {
    const t = zoomTotals[zoom];
    if (!t) continue;
    projTotalBase += (t.baseline / t.count) * chunksPerZoom;
    projTotalLL += (t.webpLL / t.count) * chunksPerZoom;
    projTotalNL += (t.webpNL / t.count) * chunksPerZoom;
    projTotalAd += (t.adaptive / t.count) * chunksPerZoom;
  }

  const toGB = (b: number) => (b / (1024 * 1024 * 1024)).toFixed(2);
  console.log(`\nTotal (${MAP_NAME}/${TERRAIN_TYPE}, ${totalChunks} chunks):`);
  console.log(`  Baseline:           ${toGB(projTotalBase)} GB`);
  console.log(`  WebP Lossless:      ${toGB(projTotalLL)} GB  (${((1 - projTotalLL / projTotalBase) * 100).toFixed(0)}% saved)`);
  console.log(`  WebP Near-Lossless: ${toGB(projTotalNL)} GB  (${((1 - projTotalNL / projTotalBase) * 100).toFixed(0)}% saved)`);
  console.log(`  PNG Adaptive:       ${toGB(projTotalAd)} GB  (${((1 - projTotalAd / projTotalBase) * 100).toFixed(0)}% saved)`);

  // Extrapolate to full cache (all maps)
  console.log('\n=== Full Cache Extrapolation (all maps) ===\n');
  const llRatio = projTotalLL / projTotalBase;
  const nlRatio = projTotalNL / projTotalBase;
  const adRatio = projTotalAd / projTotalBase;

  // Count total cache size on disk
  let totalCacheSize = 0;
  for (const mapDir of fs.readdirSync(CACHE_BASE)) {
    const mapPath = path.join(CACHE_BASE, mapDir);
    if (!fs.statSync(mapPath).isDirectory()) continue;
    for (const terrainDir of fs.readdirSync(mapPath)) {
      const terrainPath = path.join(mapPath, terrainDir);
      if (!fs.statSync(terrainPath).isDirectory()) continue;
      for (const seasonDir of fs.readdirSync(terrainPath)) {
        const seasonPath = path.join(terrainPath, seasonDir);
        if (!fs.statSync(seasonPath).isDirectory()) continue;
        for (const zoomDir of fs.readdirSync(seasonPath)) {
          const zoomPath = path.join(seasonPath, zoomDir);
          if (!fs.statSync(zoomPath).isDirectory()) continue;
          for (const file of fs.readdirSync(zoomPath)) {
            if (file.endsWith('.png')) {
              totalCacheSize += fs.statSync(path.join(zoomPath, file)).length;
            }
          }
        }
      }
    }
  }

  console.log(`Current total cache:  ${toGB(totalCacheSize)} GB`);
  console.log(`WebP Lossless est:    ${toGB(totalCacheSize * llRatio)} GB  (${((1 - llRatio) * 100).toFixed(0)}% saved)`);
  console.log(`WebP Near-LL est:     ${toGB(totalCacheSize * nlRatio)} GB  (${((1 - nlRatio) * 100).toFixed(0)}% saved)`);
  console.log(`PNG Adaptive est:     ${toGB(totalCacheSize * adRatio)} GB  (${((1 - adRatio) * 100).toFixed(0)}% saved)`);

  console.log('\n=== Benchmark Complete ===');
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
