/**
 * Tests for prebake CLI — argument parsing and task list helpers.
 * Integration phases (network, workers) are NOT tested here.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseArgs, collectBmpFiles, collectCabFiles, buildChunkTaskList } from './prebake';
import { defaultConcurrency } from './prebake-worker-pool';

// ─── parseArgs ───────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  test('defaults are sane', () => {
    const opts = parseArgs([]);
    expect(opts.skipDownload).toBe(false);
    expect(opts.onlyAtlases).toBe(false);
    expect(opts.onlyChunks).toBe(false);
    expect(opts.force).toBe(false);
    expect(opts.mapFilter).toBeNull();
    expect(opts.seasonFilter).toBeNull();
    expect(opts.concurrency).toBe(defaultConcurrency());
  });

  test('--skip-download sets skipDownload', () => {
    const opts = parseArgs(['--skip-download']);
    expect(opts.skipDownload).toBe(true);
  });

  test('--only-atlases sets onlyAtlases', () => {
    const opts = parseArgs(['--only-atlases']);
    expect(opts.onlyAtlases).toBe(true);
  });

  test('--only-chunks sets onlyChunks', () => {
    const opts = parseArgs(['--only-chunks']);
    expect(opts.onlyChunks).toBe(true);
  });

  test('--force sets force', () => {
    const opts = parseArgs(['--force']);
    expect(opts.force).toBe(true);
  });

  test('--concurrency N sets concurrency', () => {
    const opts = parseArgs(['--concurrency', '6']);
    expect(opts.concurrency).toBe(6);
  });

  test('--concurrency with invalid value falls back to 1', () => {
    const opts = parseArgs(['--concurrency', 'abc']);
    expect(opts.concurrency).toBe(1);
  });

  test('--concurrency 0 clamps to 1', () => {
    const opts = parseArgs(['--concurrency', '0']);
    expect(opts.concurrency).toBe(1);
  });

  test('--map sets mapFilter', () => {
    const opts = parseArgs(['--map', 'Shamba']);
    expect(opts.mapFilter).toBe('Shamba');
  });

  test('--season sets seasonFilter', () => {
    const opts = parseArgs(['--season', '2']);
    expect(opts.seasonFilter).toBe(2);
  });

  test('--season clamps to 0-3 range', () => {
    expect(parseArgs(['--season', '5']).seasonFilter).toBe(3);
    expect(parseArgs(['--season', '-1']).seasonFilter).toBe(0);
  });

  test('--season with invalid value gives null', () => {
    const opts = parseArgs(['--season', 'summer']);
    expect(opts.seasonFilter).toBeNull();
  });

  test('multiple flags combined', () => {
    const opts = parseArgs(['--skip-download', '--only-chunks', '--map', 'Zorcon', '--concurrency', '4']);
    expect(opts.skipDownload).toBe(true);
    expect(opts.onlyChunks).toBe(true);
    expect(opts.mapFilter).toBe('Zorcon');
    expect(opts.concurrency).toBe(4);
  });
});

// ─── collectBmpFiles ─────────────────────────────────────────────────────────

describe('collectBmpFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-prebake-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array for non-existent directory', () => {
    const result = collectBmpFiles([path.join(tmpDir, 'nonexistent')]);
    expect(result).toEqual([]);
  });

  test('collects BMP files that have no PNG', () => {
    const bmpPath = path.join(tmpDir, 'tile.bmp');
    fs.writeFileSync(bmpPath, Buffer.alloc(1));
    const result = collectBmpFiles([tmpDir]);
    expect(result).toHaveLength(1);
    expect(result[0].inputPath).toBe(bmpPath);
    expect(result[0].outputPath).toBe(path.join(tmpDir, 'tile.png'));
  });

  test('skips BMP when PNG is already newer', () => {
    const bmpPath = path.join(tmpDir, 'tile.bmp');
    const pngPath = path.join(tmpDir, 'tile.png');
    fs.writeFileSync(bmpPath, Buffer.alloc(1));
    fs.writeFileSync(pngPath, Buffer.alloc(1));
    // Make PNG newer by setting future mtime
    const futureTime = new Date(Date.now() + 60_000);
    fs.utimesSync(pngPath, futureTime, futureTime);
    const result = collectBmpFiles([tmpDir]);
    expect(result).toHaveLength(0);
  });

  test('includes BMP when PNG is older', () => {
    const bmpPath = path.join(tmpDir, 'tile.bmp');
    const pngPath = path.join(tmpDir, 'tile.png');
    fs.writeFileSync(bmpPath, Buffer.alloc(1));
    fs.writeFileSync(pngPath, Buffer.alloc(1));
    // Make BMP newer by setting future mtime
    const futureTime = new Date(Date.now() + 60_000);
    fs.utimesSync(bmpPath, futureTime, futureTime);
    const result = collectBmpFiles([tmpDir]);
    expect(result).toHaveLength(1);
  });

  test('ignores non-BMP files', () => {
    fs.writeFileSync(path.join(tmpDir, 'tile.png'), Buffer.alloc(1));
    fs.writeFileSync(path.join(tmpDir, 'tile.ini'), Buffer.alloc(1));
    const result = collectBmpFiles([tmpDir]);
    expect(result).toHaveLength(0);
  });

  test('collects from multiple directories', () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-prebake-test2-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'a.bmp'), Buffer.alloc(1));
      fs.writeFileSync(path.join(dir2, 'b.bmp'), Buffer.alloc(1));
      const result = collectBmpFiles([tmpDir, dir2]);
      expect(result).toHaveLength(2);
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  test('task has colorKey=null and tolerance=5', () => {
    fs.writeFileSync(path.join(tmpDir, 'x.bmp'), Buffer.alloc(1));
    const result = collectBmpFiles([tmpDir]);
    expect(result[0].colorKey).toBeNull();
    expect(result[0].tolerance).toBe(5);
  });
});

// ─── collectCabFiles ─────────────────────────────────────────────────────────

describe('collectCabFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-cab-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty for non-existent root', () => {
    const result = collectCabFiles(path.join(tmpDir, 'nonexistent'));
    expect(result).toEqual([]);
  });

  test('finds cab files under terrainType/season/ structure', () => {
    const seasonDir = path.join(tmpDir, 'Earth', '2');
    fs.mkdirSync(seasonDir, { recursive: true });
    const cabPath = path.join(seasonDir, 'textures.cab');
    fs.writeFileSync(cabPath, Buffer.alloc(1));

    const result = collectCabFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].cabPath).toBe(cabPath);
    expect(result[0].targetDir).toBe(seasonDir);
  });

  test('ignores season directories outside 0-3', () => {
    const validDir = path.join(tmpDir, 'Earth', '1');
    const invalidDir = path.join(tmpDir, 'Earth', '9');
    fs.mkdirSync(validDir, { recursive: true });
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(validDir, 'a.cab'), Buffer.alloc(1));
    fs.writeFileSync(path.join(invalidDir, 'b.cab'), Buffer.alloc(1));

    const result = collectCabFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].targetDir).toBe(validDir);
  });

  test('ignores non-cab files', () => {
    const seasonDir = path.join(tmpDir, 'Swamp', '0');
    fs.mkdirSync(seasonDir, { recursive: true });
    fs.writeFileSync(path.join(seasonDir, 'textures.zip'), Buffer.alloc(1));

    const result = collectCabFiles(tmpDir);
    expect(result).toHaveLength(0);
  });
});

// ─── buildChunkTaskList ──────────────────────────────────────────────────────

describe('buildChunkTaskList', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-chunk-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseParams = () => ({
    mapName: 'Shamba',
    terrainType: 'Alien Swamp',
    season: 2,
    mapWidth: 64,
    mapHeight: 64,
    webClientCacheDir: '',
    force: false,
  });

  test('returns all chunks when no files cached', () => {
    const params = { ...baseParams(), webClientCacheDir: tmpDir };
    const tasks = buildChunkTaskList(params);
    // 64/32 = 2 chunks per axis → 4 total
    expect(tasks).toHaveLength(4);
  });

  test('skips chunks that already exist when force=false', () => {
    const params = { ...baseParams(), webClientCacheDir: tmpDir };
    // Pre-create chunk (0,0)
    const z3Dir = path.join(tmpDir, 'chunks', 'Shamba', 'Alien Swamp', '2', 'z3');
    fs.mkdirSync(z3Dir, { recursive: true });
    fs.writeFileSync(path.join(z3Dir, 'chunk_0_0.png'), Buffer.alloc(1));

    const tasks = buildChunkTaskList(params);
    expect(tasks).toHaveLength(3); // 4 - 1 cached
    expect(tasks.find(t => t.chunkI === 0 && t.chunkJ === 0)).toBeUndefined();
  });

  test('includes all chunks when force=true even if cached', () => {
    const params = { ...baseParams(), webClientCacheDir: tmpDir, force: true };
    // Pre-create chunk (0,0)
    const z3Dir = path.join(tmpDir, 'chunks', 'Shamba', 'Alien Swamp', '2', 'z3');
    fs.mkdirSync(z3Dir, { recursive: true });
    fs.writeFileSync(path.join(z3Dir, 'chunk_0_0.png'), Buffer.alloc(1));

    const tasks = buildChunkTaskList(params);
    expect(tasks).toHaveLength(4); // All 4, force overrides cache
  });

  test('output paths follow expected pattern', () => {
    const params = { ...baseParams(), webClientCacheDir: tmpDir };
    const tasks = buildChunkTaskList(params);
    for (const task of tasks) {
      expect(task.z3OutputPath).toContain(path.join('chunks', 'Shamba', 'Alien Swamp', '2', 'z3'));
      expect(task.z3OutputPath).toMatch(/chunk_\d+_\d+\.png$/);
    }
  });

  test('chunk count matches ceil(height/32) * ceil(width/32)', () => {
    // Non-aligned map: 70×70 tiles → ceil(70/32)=3 per axis → 9 chunks
    const params = { ...baseParams(), mapWidth: 70, mapHeight: 70, webClientCacheDir: tmpDir };
    const tasks = buildChunkTaskList(params);
    expect(tasks).toHaveLength(9);
  });

  test('taskIndex fields are not present (tasks are plain objects)', () => {
    const params = { ...baseParams(), webClientCacheDir: tmpDir };
    const tasks = buildChunkTaskList(params);
    // Verify each task has chunkI, chunkJ, z3OutputPath
    for (const task of tasks) {
      expect(typeof task.chunkI).toBe('number');
      expect(typeof task.chunkJ).toBe('number');
      expect(typeof task.z3OutputPath).toBe('string');
    }
  });
});
