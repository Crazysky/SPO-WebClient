/**
 * Update Service - Automatic synchronization with update.starpeaceonline.com
 * Dynamically discovers and mirrors the complete server structure without hardcoded lists
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../shared/logger';

const logger = createLogger('UpdateService');

interface RemoteItem {
  type: 'file' | 'directory';
  name: string;
  path: string; // Relative path from cache root (e.g., "BuildingClasses/classes.cab")
  url: string;  // Full remote URL
}

interface SyncStats {
  downloaded: number;
  deleted: number;
  skipped: number;
  failed: number;
}

export class UpdateService {
  private readonly UPDATE_SERVER_BASE = 'http://update.starpeaceonline.com/five/client/cache';
  private readonly CACHE_ROOT: string;
  private stats: SyncStats = { downloaded: 0, deleted: 0, skipped: 0, failed: 0 };

  /**
   * Files to exclude from synchronization (local customizations)
   */
  private readonly EXCLUDED_FILES = [
    'BuildingClasses/facility_db.csv'  // Local custom file, not on server
  ];

  /**
   * Files/patterns to ignore when parsing directory listings
   */
  private readonly IGNORED_PATTERNS = [
    'index.sync',    // Server index files
    'cindex.bat',    // Server batch scripts
    'pack.bat',      // Server batch scripts
    '..',            // Parent directory link
    '.'              // Current directory link
  ];

  constructor(cacheRoot?: string) {
    // Default to cache/ directory in project root
    // This mirrors the exact structure from update.starpeaceonline.com/five/client/cache/
    this.CACHE_ROOT = cacheRoot || path.join(__dirname, '../../cache');
  }

  /**
   * Parse HTML directory listing to extract files and subdirectories
   */
  private parseDirectoryListing(html: string): { files: string[], directories: string[] } {
    const files: string[] = [];
    const directories: string[] = [];

    // Match: <A HREF="/path/filename.ext">filename.ext</A>
    const fileRegex = /<A HREF="[^"]+\/([^/"]+\.[^/"]+)">([^<]+)<\/A>/gi;
    // Match: <A HREF="/path/dirname/">dirname</A>
    const dirRegex = /<A HREF="[^"]+\/([^/"]+)\/">([^<]+)<\/A>/gi;

    let match;
    while ((match = fileRegex.exec(html)) !== null) {
      const filename = match[1];
      if (!this.IGNORED_PATTERNS.includes(filename)) {
        files.push(filename);
      }
    }

    while ((match = dirRegex.exec(html)) !== null) {
      const dirname = match[1];
      if (!this.IGNORED_PATTERNS.includes(dirname)) {
        directories.push(dirname);
      }
    }

    return { files, directories };
  }

  /**
   * Recursively discover all files and directories on remote server
   */
  private async discoverRemoteStructure(relativePath: string = '', depth: number = 0): Promise<RemoteItem[]> {
    const MAX_DEPTH = 10; // Safety limit to prevent infinite recursion
    if (depth > MAX_DEPTH) {
      logger.warn(`[UpdateService] Maximum recursion depth reached at ${relativePath}`);
      return [];
    }

    const items: RemoteItem[] = [];
    const remoteUrl = relativePath
      ? `${this.UPDATE_SERVER_BASE}/${relativePath}`
      : this.UPDATE_SERVER_BASE;

    try {
      const response = await fetch(remoteUrl);
      if (!response.ok) {
        logger.warn(`[UpdateService] Cannot access ${relativePath || 'root'}: HTTP ${response.status}`);
        return items;
      }

      const html = await response.text();
      const { files, directories } = this.parseDirectoryListing(html);

      // Add files
      for (const file of files) {
        const itemPath = relativePath ? `${relativePath}/${file}` : file;
        items.push({
          type: 'file',
          name: file,
          path: itemPath,
          url: `${this.UPDATE_SERVER_BASE}/${itemPath}`
        });
      }

      // Add directories and recurse
      for (const dir of directories) {
        const itemPath = relativePath ? `${relativePath}/${dir}` : dir;
        items.push({
          type: 'directory',
          name: dir,
          path: itemPath,
          url: `${this.UPDATE_SERVER_BASE}/${itemPath}`
        });

        // Recursively discover subdirectory contents
        const subItems = await this.discoverRemoteStructure(itemPath, depth + 1);
        items.push(...subItems);
      }

      if (depth === 0) {
        logger.info(`[UpdateService] Discovered ${items.filter(i => i.type === 'file').length} files and ${items.filter(i => i.type === 'directory').length} directories on remote server`);
      }

    } catch (error) {
      logger.error(`[UpdateService] Error discovering ${relativePath || 'root'}:`, error);
    }

    return items;
  }

  /**
   * Build inventory of local cache files
   */
  private buildLocalInventory(dir: string = this.CACHE_ROOT, baseDir: string = this.CACHE_ROOT): string[] {
    const items: string[] = [];

    if (!fs.existsSync(dir)) {
      return items;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        items.push(relativePath);
        // Recurse into subdirectory
        const subItems = this.buildLocalInventory(fullPath, baseDir);
        items.push(...subItems);
      } else if (entry.isFile()) {
        items.push(relativePath);
      }
    }

    return items;
  }

  /**
   * Download a single file
   */
  private async downloadFile(item: RemoteItem): Promise<boolean> {
    const localPath = path.join(this.CACHE_ROOT, item.path);

    try {
      logger.info(`[UpdateService] Downloading: ${item.path}`);

      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Ensure directory exists
      const dirPath = path.dirname(localPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Write file
      fs.writeFileSync(localPath, buffer);

      this.stats.downloaded++;
      logger.info(`[UpdateService] ✓ Downloaded: ${item.path} (${buffer.length} bytes)`);
      return true;
    } catch (error) {
      this.stats.failed++;
      logger.error(`[UpdateService] ✗ Failed to download ${item.path}:`, error);
      return false;
    }
  }

  /**
   * Delete a local file or directory
   */
  private deleteLocal(relativePath: string): boolean {
    const localPath = path.join(this.CACHE_ROOT, relativePath);

    try {
      if (!fs.existsSync(localPath)) {
        return true; // Already deleted
      }

      const stats = fs.statSync(localPath);
      if (stats.isDirectory()) {
        fs.rmSync(localPath, { recursive: true, force: true });
        logger.info(`[UpdateService] 🗑 Deleted directory: ${relativePath}`);
      } else {
        fs.unlinkSync(localPath);
        logger.info(`[UpdateService] 🗑 Deleted file: ${relativePath}`);
      }

      this.stats.deleted++;
      return true;
    } catch (error) {
      logger.error(`[UpdateService] Failed to delete ${relativePath}:`, error);
      return false;
    }
  }

  /**
   * Check if a path should be excluded from sync
   */
  private isExcluded(relativePath: string): boolean {
    return this.EXCLUDED_FILES.some(excluded =>
      relativePath === excluded || relativePath.startsWith(excluded + '/')
    );
  }

  /**
   * Synchronize cache with remote server
   */
  async syncAll(): Promise<void> {
    logger.info('[UpdateService] Starting automatic synchronization...');
    this.stats = { downloaded: 0, deleted: 0, skipped: 0, failed: 0 };

    const startTime = Date.now();

    // Ensure cache directory exists
    if (!fs.existsSync(this.CACHE_ROOT)) {
      fs.mkdirSync(this.CACHE_ROOT, { recursive: true });
      logger.info(`[UpdateService] Created cache directory: ${this.CACHE_ROOT}`);
    }

    // Step 1: Discover remote structure
    logger.info('[UpdateService] Step 1/4: Discovering remote structure...');
    const remoteItems = await this.discoverRemoteStructure();
    const remoteFiles = remoteItems.filter(i => i.type === 'file');
    const remoteDirs = remoteItems.filter(i => i.type === 'directory');

    // Step 2: Build local inventory
    logger.info('[UpdateService] Step 2/4: Scanning local cache...');
    const localItems = this.buildLocalInventory();
    const localFiles = localItems.filter(p => {
      const fullPath = path.join(this.CACHE_ROOT, p);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
    });
    const localDirs = localItems.filter(p => {
      const fullPath = path.join(this.CACHE_ROOT, p);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    });

    logger.info(`[UpdateService] Remote: ${remoteFiles.length} files, ${remoteDirs.length} directories`);
    logger.info(`[UpdateService] Local: ${localFiles.length} files, ${localDirs.length} directories`);

    // Step 3: Download missing files
    logger.info('[UpdateService] Step 3/4: Downloading missing files...');
    const remoteFilePaths = new Set(remoteFiles.map(f => f.path));

    for (const remoteFile of remoteFiles) {
      if (this.isExcluded(remoteFile.path)) {
        logger.info(`[UpdateService] ⊘ Excluded: ${remoteFile.path}`);
        continue;
      }

      const localPath = path.join(this.CACHE_ROOT, remoteFile.path);
      if (fs.existsSync(localPath)) {
        this.stats.skipped++;
        // File exists, skip
      } else {
        // File missing, download
        await this.downloadFile(remoteFile);
      }
    }

    // Step 4: Remove orphaned files (files that exist locally but not on remote)
    logger.info('[UpdateService] Step 4/4: Removing orphaned files...');

    for (const localFile of localFiles) {
      if (this.isExcluded(localFile)) {
        continue;
      }

      if (!remoteFilePaths.has(localFile)) {
        logger.info(`[UpdateService] Found orphaned file: ${localFile}`);
        this.deleteLocal(localFile);
      }
    }

    // Remove empty directories
    const remoteDirPaths = new Set(remoteDirs.map(d => d.path));
    // Sort by depth (deepest first) to delete child directories before parents
    const sortedLocalDirs = localDirs.sort((a, b) => {
      const depthA = a.split('/').length;
      const depthB = b.split('/').length;
      return depthB - depthA;
    });

    for (const localDir of sortedLocalDirs) {
      if (this.isExcluded(localDir)) {
        continue;
      }

      const fullPath = path.join(this.CACHE_ROOT, localDir);
      if (!remoteDirPaths.has(localDir) && fs.existsSync(fullPath)) {
        // Check if directory is empty
        const entries = fs.readdirSync(fullPath);
        if (entries.length === 0) {
          logger.info(`[UpdateService] Found empty orphaned directory: ${localDir}`);
          this.deleteLocal(localDir);
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[UpdateService] Synchronization complete in ${duration}ms`);
    logger.info(`[UpdateService] Downloaded: ${this.stats.downloaded} | Deleted: ${this.stats.deleted} | Skipped: ${this.stats.skipped} | Failed: ${this.stats.failed}`);
  }

  /**
   * Get statistics about the last sync operation
   */
  getStats(): SyncStats {
    return { ...this.stats };
  }
}
