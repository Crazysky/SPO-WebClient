/**
 * prebake — Developer pre-bake CLI
 *
 * Runs all asset generation (atlas baking + z3 chunk pre-rendering) as a
 * standalone one-shot process, using full CPU parallelism via worker_threads.
 * Intended to be run ONCE by developers before packaging an Electron release.
 *
 * Output goes to webclient-cache/ which is already:
 *   - Tracked by Git LFS (.gitattributes: webclient-cache/**\/*.png)
 *   - Bundled by electron-builder (textures, objects, chunks z3)
 *
 * Usage:
 *   npm run prebake                    # Full run (download + atlas + chunks)
 *   npm run prebake:fast               # Skip download (use existing cache)
 *   npm run prebake:atlases            # Only atlas baking
 *   npm run prebake:chunks             # Only z3 chunk generation
 *
 * Flags (pass after --):
 *   --skip-download    Skip UpdateService sync (use existing cache/)
 *   --only-atlases     Run phases 1-4 only (no chunk generation)
 *   --only-chunks      Run phase 5 only (requires pre-baked atlases)
 *   --concurrency N    Max worker threads (default: cpuCount - 1)
 *   --map MAPNAME      Limit chunk generation to one map
 *   --season N         Limit chunk generation to one season (0-3)
 *   --force            Re-generate chunks even if already cached
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { extractCabArchive } from './cab-extractor';
import { TextureExtractor } from './texture-extractor';
import { TerrainChunkRenderer, CHUNK_SIZE, KNOWN_MAPS } from './terrain-chunk-renderer';
import { decodePng, decodeBmpIndices } from './texture-alpha-baker';
import { WorkerPool, runWithConcurrency, defaultConcurrency } from './prebake-worker-pool';
import { getTerrainTypeForMap, SEASON_NAMES, Season } from '../shared/map-config';
import type { AtlasManifest } from './atlas-generator';

// ─── CLI argument parsing ────────────────────────────────────────────────────

export interface PrebakeOptions {
  skipDownload: boolean;
  onlyAtlases: boolean;
  onlyChunks: boolean;
  concurrency: number;
  mapFilter: string | null;
  seasonFilter: number | null;
  force: boolean;
  cacheDir: string;
  webClientCacheDir: string;
}

export function parseArgs(argv: string[]): PrebakeOptions {
  const opts: PrebakeOptions = {
    skipDownload: false,
    onlyAtlases: false,
    onlyChunks: false,
    concurrency: defaultConcurrency(),
    mapFilter: null,
    seasonFilter: null,
    force: false,
    cacheDir: path.join(process.cwd(), 'cache'),
    webClientCacheDir: path.join(process.cwd(), 'webclient-cache'),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--skip-download': opts.skipDownload = true; break;
      case '--only-atlases':  opts.onlyAtlases  = true; break;
      case '--only-chunks':   opts.onlyChunks   = true; break;
      case '--force':         opts.force         = true; break;
      case '--concurrency': {
        const val = parseInt(argv[++i] ?? '', 10);
        opts.concurrency = isNaN(val) || val < 1 ? 1 : val;
        break;
      }
      case '--map':    opts.mapFilter    = argv[++i] ?? null; break;
      case '--season': {
        const val = parseInt(argv[++i] ?? '', 10);
        opts.seasonFilter = isNaN(val) ? null : Math.max(0, Math.min(3, val));
        break;
      }
    }
  }

  return opts;
}

// ─── Phase 2: Parallel CAB extraction ───────────────────────────────────────

/**
 * Collect all .cab files under a directory (recursively, one level deep).
 * Returns [{cabPath, targetDir}] pairs where targetDir is the cab's directory.
 */
export function collectCabFiles(landImagesDir: string): Array<{ cabPath: string; targetDir: string }> {
  const results: Array<{ cabPath: string; targetDir: string }> = [];
  if (!fs.existsSync(landImagesDir)) return results;

  const terrainDirs = fs.readdirSync(landImagesDir, { withFileTypes: true })
    .filter(e => e.isDirectory());

  for (const terrainDir of terrainDirs) {
    const terrainPath = path.join(landImagesDir, terrainDir.name);
    const seasonDirs = fs.readdirSync(terrainPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^[0-3]$/.test(e.name));

    for (const seasonDir of seasonDirs) {
      const seasonPath = path.join(terrainPath, seasonDir.name);
      const cabs = fs.readdirSync(seasonPath).filter(f => f.endsWith('.cab'));
      for (const cab of cabs) {
        results.push({ cabPath: path.join(seasonPath, cab), targetDir: seasonPath });
      }
    }
  }

  return results;
}

async function phaseExtractCabs(opts: PrebakeOptions): Promise<void> {
  const landImagesDir = path.join(opts.cacheDir, 'landimages');
  const cabs = collectCabFiles(landImagesDir);

  if (cabs.length === 0) {
    console.log('[prebake] Phase 2: No CAB files found, skipping extraction.');
    return;
  }

  console.log(`[prebake] Phase 2: Extracting ${cabs.length} CAB file(s) (concurrency=4)...`);
  let done = 0;

  await runWithConcurrency(cabs, 4, async ({ cabPath, targetDir }) => {
    await extractCabArchive(cabPath, targetDir);
    done++;
    if (done % 4 === 0 || done === cabs.length) {
      console.log(`[prebake]   CAB extraction: ${done}/${cabs.length}`);
    }
  });

  console.log(`[prebake] Phase 2: CAB extraction complete.`);
}

// ─── Phase 3: Parallel BMP → PNG baking ─────────────────────────────────────

export interface BmpTask {
  inputPath: string;
  outputPath: string;
  colorKey: null; // auto-detect
  tolerance: number;
}

/**
 * Collect all BMP files that need alpha-baking (no up-to-date PNG exists).
 */
export function collectBmpFiles(dirs: string[]): BmpTask[] {
  const tasks: BmpTask[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const bmps = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.bmp'));

    for (const bmp of bmps) {
      const inputPath = path.join(dir, bmp);
      const outputPath = path.join(dir, bmp.replace(/\.bmp$/i, '.png'));

      // Skip if PNG is already newer than BMP
      if (fs.existsSync(outputPath)) {
        const bmpMtime = fs.statSync(inputPath).mtimeMs;
        const pngMtime = fs.statSync(outputPath).mtimeMs;
        if (pngMtime > bmpMtime) continue;
      }

      tasks.push({ inputPath, outputPath, colorKey: null, tolerance: 5 });
    }
  }

  return tasks;
}

async function phaseBakeAlpha(opts: PrebakeOptions): Promise<void> {
  const landImagesDir = path.join(opts.cacheDir, 'landimages');

  // Collect all leaf directories under landimages (terrainType/season/)
  const bmpDirs: string[] = [];

  if (fs.existsSync(landImagesDir)) {
    for (const terrain of fs.readdirSync(landImagesDir, { withFileTypes: true }).filter(e => e.isDirectory())) {
      const terrainPath = path.join(landImagesDir, terrain.name);
      for (const season of fs.readdirSync(terrainPath, { withFileTypes: true }).filter(e => e.isDirectory() && /^[0-3]$/.test(e.name))) {
        bmpDirs.push(path.join(terrainPath, season.name));
      }
    }
  }

  // Also include object image directories
  for (const sub of ['RoadBlockImages', 'ConcreteImages', 'CarImages']) {
    bmpDirs.push(path.join(opts.cacheDir, sub));
  }

  const tasks = collectBmpFiles(bmpDirs);

  if (tasks.length === 0) {
    console.log('[prebake] Phase 3: All BMPs already baked, skipping.');
    return;
  }

  console.log(`[prebake] Phase 3: Baking ${tasks.length} BMP file(s) (concurrency=${opts.concurrency})...`);

  const workerPath = path.join(__dirname, 'workers', 'bake-alpha-worker.js');
  if (!fs.existsSync(workerPath)) {
    throw new Error(`Worker not found: ${workerPath}\nRun "npm run build:server" first.`);
  }

  const pool = new WorkerPool<BmpTask, { success: boolean; inputPath: string; bytesWritten: number }>({
    workerPath,
    concurrency: opts.concurrency,
  });

  const results = await pool.runAll(tasks);
  await pool.shutdown();

  const failed = results.filter(r => r.error);
  console.log(`[prebake] Phase 3: Baked ${results.length - failed.length}/${results.length} files.`);
  if (failed.length > 0) {
    console.warn(`[prebake] Phase 3: ${failed.length} file(s) failed:`);
    for (const r of failed) {
      console.warn(`  [${r.taskIndex}] ${r.error}`);
    }
  }
}

// ─── Phase 4: Atlas generation (via TextureExtractor) ───────────────────────

async function phaseGenerateAtlases(opts: PrebakeOptions): Promise<void> {
  console.log('[prebake] Phase 4: Generating terrain + object atlases...');
  const extractor = new TextureExtractor(opts.cacheDir);
  // TextureExtractor skips work already done (checks index.json version + atlas cache)
  await extractor.initialize();
  console.log('[prebake] Phase 4: Atlas generation complete.');
}

// ─── Phase 5: Parallel z3 chunk generation ──────────────────────────────────

/**
 * Build the list of z3 chunk PNG output paths for a map/terrain/season combo.
 * Excludes chunks that are already cached (unless --force).
 */
export function buildChunkTaskList(params: {
  mapName: string;
  terrainType: string;
  season: number;
  mapWidth: number;
  mapHeight: number;
  webClientCacheDir: string;
  force: boolean;
}): Array<{ chunkI: number; chunkJ: number; z3OutputPath: string }> {
  const { mapName, terrainType, season, mapWidth, mapHeight, webClientCacheDir, force } = params;
  const chunksI = Math.ceil(mapHeight / CHUNK_SIZE);
  const chunksJ = Math.ceil(mapWidth / CHUNK_SIZE);
  const tasks: Array<{ chunkI: number; chunkJ: number; z3OutputPath: string }> = [];

  for (let ci = 0; ci < chunksI; ci++) {
    for (let cj = 0; cj < chunksJ; cj++) {
      const z3Path = path.join(
        webClientCacheDir, 'chunks', mapName, terrainType,
        String(season), 'z3', `chunk_${ci}_${cj}.png`
      );
      if (!force && fs.existsSync(z3Path)) continue;
      tasks.push({ chunkI: ci, chunkJ: cj, z3OutputPath: z3Path });
    }
  }

  return tasks;
}

async function phaseGenerateChunks(opts: PrebakeOptions): Promise<void> {
  console.log('[prebake] Phase 5: Pre-generating z3 chunk PNGs...');

  const workerPath = path.join(__dirname, 'workers', 'chunk-render-worker.js');
  if (!fs.existsSync(workerPath)) {
    throw new Error(`Worker not found: ${workerPath}\nRun "npm run build:server" first.`);
  }

  const mapsDir = path.join(opts.cacheDir, 'Maps');
  if (!fs.existsSync(mapsDir)) {
    console.log('[prebake] Phase 5: No maps directory found, skipping.');
    return;
  }

  // Determine which maps to process
  const allMaps = Array.from(KNOWN_MAPS).filter(mapName => {
    if (opts.mapFilter && mapName !== opts.mapFilter) return false;
    const bmpPath = path.join(mapsDir, mapName, `${mapName}.bmp`);
    return fs.existsSync(bmpPath);
  });

  if (allMaps.length === 0) {
    console.log('[prebake] Phase 5: No matching maps found, skipping.');
    return;
  }

  // Determine season range
  const seasons = opts.seasonFilter !== null
    ? [opts.seasonFilter]
    : [Season.WINTER, Season.SPRING, Season.SUMMER, Season.AUTUMN];

  const textureDir = path.join(opts.webClientCacheDir, 'textures');
  let totalGenerated = 0;

  // Process each (map, season) combo sequentially to bound SAB memory usage
  for (const mapName of allMaps) {
    const terrainType = getTerrainTypeForMap(mapName);

    // Load map BMP once (reused across all seasons)
    const bmpPath = path.join(mapsDir, mapName, `${mapName}.bmp`);
    let mapWidth: number;
    let mapHeight: number;
    let mapSab: SharedArrayBuffer;

    try {
      const bmpBuf = fs.readFileSync(bmpPath);
      const mapData = decodeBmpIndices(bmpBuf);
      mapWidth  = mapData.width;
      mapHeight = mapData.height;
      mapSab = new SharedArrayBuffer(mapData.indices.length);
      new Uint8Array(mapSab).set(mapData.indices);
      console.log(`[prebake]   Map loaded: ${mapName} (${mapWidth}×${mapHeight})`);
    } catch (err: unknown) {
      console.error(`[prebake] Failed to load map BMP ${mapName}:`, err);
      continue;
    }

    for (const season of seasons) {
      const atlasPath   = path.join(textureDir, terrainType, String(season), 'atlas.png');
      const manifestPath = path.join(textureDir, terrainType, String(season), 'atlas.json');

      if (!fs.existsSync(atlasPath) || !fs.existsSync(manifestPath)) {
        console.warn(`[prebake]   Atlas missing for ${terrainType}/${SEASON_NAMES[season as Season]}. Run npm run prebake:atlases first.`);
        continue;
      }

      // Load atlas once per season
      let atlasWidth: number;
      let atlasManifestJson: string;
      let atlasSab: SharedArrayBuffer;

      try {
        const pngBuf = fs.readFileSync(atlasPath);
        const pngData = decodePng(pngBuf);
        atlasWidth = pngData.width;
        atlasSab = new SharedArrayBuffer(pngData.pixels.length);
        new Uint8Array(atlasSab).set(pngData.pixels);
        atlasManifestJson = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: AtlasManifest = JSON.parse(atlasManifestJson);
        const tileCount = Object.keys(manifest.tiles).length;
        console.log(`[prebake]   Atlas loaded: ${terrainType}/${SEASON_NAMES[season as Season]} (${tileCount} tiles, ${pngData.width}×${pngData.height})`);
      } catch (err: unknown) {
        console.error(`[prebake] Failed to load atlas ${terrainType}/${season}:`, err);
        continue;
      }

      // Build task list
      const tasks = buildChunkTaskList({
        mapName, terrainType, season,
        mapWidth, mapHeight,
        webClientCacheDir: opts.webClientCacheDir,
        force: opts.force,
      });

      const totalChunks = Math.ceil(mapHeight / CHUNK_SIZE) * Math.ceil(mapWidth / CHUNK_SIZE);
      if (tasks.length === 0) {
        console.log(`[prebake]   ${mapName}/${SEASON_NAMES[season as Season]}: all ${totalChunks} chunks cached.`);
        continue;
      }

      console.log(`[prebake]   ${mapName}/${SEASON_NAMES[season as Season]}: generating ${tasks.length}/${totalChunks} chunks (${opts.concurrency} workers)...`);

      // Pre-create z3 output directory (avoid mkdir races inside workers)
      const z3Dir = path.join(opts.webClientCacheDir, 'chunks', mapName, terrainType, String(season), 'z3');
      fs.mkdirSync(z3Dir, { recursive: true });

      // Run worker pool
      const pool = new WorkerPool<
        { chunkI: number; chunkJ: number; z3OutputPath: string },
        { chunkI: number; chunkJ: number; bytesWritten: number }
      >({
        workerPath,
        concurrency: opts.concurrency,
        workerData: {
          atlasSab,
          atlasWidth,
          atlasManifestJson,
          mapSab,
          mapWidth,
          mapHeight,
        } as Record<string, unknown>,
      });

      const t0 = Date.now();
      let lastPct = 0;

      // runAll doesn't support progress callbacks, so we poll completedCount
      // via a lightweight interval while awaiting.
      const progressInterval = setInterval(() => {
        const pct = Math.floor((pool.completedCount / tasks.length) * 100);
        if (pct >= lastPct + 10) {
          lastPct = pct - (pct % 10);
          console.log(`[prebake]   ${mapName}/${SEASON_NAMES[season as Season]}: ${lastPct}% (${pool.completedCount}/${tasks.length})`);
        }
      }, 500);

      const results = await pool.runAll(tasks);
      clearInterval(progressInterval);
      await pool.shutdown();

      const failed = results.filter(r => r.error);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[prebake]   ${mapName}/${SEASON_NAMES[season as Season]}: done ${results.length - failed.length}/${tasks.length} in ${dt}s`);
      if (failed.length > 0) {
        console.warn(`[prebake]   ${failed.length} chunk(s) failed.`);
      }
      totalGenerated += results.length - failed.length;
    }
  }

  console.log(`[prebake] Phase 5: Complete — ${totalGenerated} z3 chunk(s) generated.`);
}

// ─── Main orchestration ──────────────────────────────────────────────────────

export async function runPrebake(opts: PrebakeOptions): Promise<void> {
  const t0 = Date.now();
  console.log(`[prebake] Starting (concurrency=${opts.concurrency}, cpus=${os.cpus().length})`);

  if (!opts.onlyChunks) {
    // Phase 1: Download
    if (!opts.skipDownload) {
      console.log('[prebake] Phase 1: Syncing assets from update server...');
      // Dynamic import to avoid loading the full server stack at module load time
      const { UpdateService } = await import('./update-service');
      const svc = new UpdateService(opts.cacheDir);
      await svc.initialize();
      console.log('[prebake] Phase 1: Sync complete.');
    } else {
      console.log('[prebake] Phase 1: Skipped (--skip-download).');
    }

    // Phase 2: Parallel CAB extraction
    await phaseExtractCabs(opts);

    // Phase 3: Parallel BMP → PNG baking
    await phaseBakeAlpha(opts);

    // Phase 4: Atlas generation (sequential, fast)
    await phaseGenerateAtlases(opts);
  }

  if (!opts.onlyAtlases) {
    // Phase 5: Parallel z3 chunk generation
    await phaseGenerateChunks(opts);
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[prebake] All phases complete in ${dt}s.`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  runPrebake(opts).catch(err => {
    console.error('[prebake] Fatal error:', err);
    process.exit(1);
  });
}
