/**
 * Update Service - Downloads missing files from update.starpeaceonline.com
 * Maintains local cache synchronized with remote server content
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../shared/logger';

const logger = createLogger('UpdateService');

interface FileToDownload {
  url: string;
  localPath: string;
  size?: number;
}

export class UpdateService {
  private readonly UPDATE_SERVER_BASE = 'http://update.starpeaceonline.com/five/client/cache';
  private readonly CACHE_ROOT: string;
  private downloadedCount = 0;
  private skippedCount = 0;
  private failedCount = 0;

  /**
   * Critical directories to sync at startup (contains data files, not images)
   * Images will be downloaded on-demand by the image proxy
   */
  private readonly CRITICAL_DIRECTORIES = [
    'BuildingClasses',    // CLASSES.BIN (building metadata)
    'CarClasses',         // Car metadata
    'ConcreteClasses',    // Concrete metadata
    'EffectClasses',      // Effect metadata
    'Inventions',         // Invention data
    'LandClasses',        // Land metadata
    'PlaneClasses',       // Plane metadata
    'RoadBlockClasses',   // Road metadata
    'Translations',       // Translation files
  ];

  /**
   * Image directories (downloaded on-demand by image proxy, not at startup)
   */
  private readonly IMAGE_DIRECTORIES = [
    'BuildingImages',
    'CarImages',
    'ConcreteImages',
    'Cursors',
    'EffectImages',
    'landimages',
    'Maps',
    'misc',
    'OtherImages',
    'PlaneImages',
    'RoadBlockImages',
    'chaticons',
    'news'
  ];

  /**
   * Root-level files to download
   */
  private readonly ROOT_FILES = [
    'Default.ini',
    'folders.sync',
    'index.sync',
    'lang.dat',
    'web.config'
  ];

  constructor(cacheRoot?: string) {
    // Default to cache/ directory in project root
    this.CACHE_ROOT = cacheRoot || path.join(__dirname, '../../cache');
  }

  /**
   * Initialize cache directory structure
   */
  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.CACHE_ROOT)) {
      fs.mkdirSync(this.CACHE_ROOT, { recursive: true });
      logger.info(`[UpdateService] Created cache directory: ${this.CACHE_ROOT}`);
    }
  }

  /**
   * Parse HTML directory listing to extract file/directory names
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
      // Skip special files
      if (filename !== 'index.sync' && filename !== 'cindex.bat' && filename !== 'pack.bat') {
        files.push(filename);
      }
    }

    while ((match = dirRegex.exec(html)) !== null) {
      const dirname = match[1];
      directories.push(dirname);
    }

    return { files, directories };
  }

  /**
   * Download a single file if it doesn't exist locally
   */
  private async downloadFileIfMissing(remoteUrl: string, localPath: string): Promise<boolean> {
    // Check if file already exists
    if (fs.existsSync(localPath)) {
      this.skippedCount++;
      return true;
    }

    try {
      logger.info(`[UpdateService] Downloading: ${remoteUrl}`);

      const response = await fetch(remoteUrl);
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

      this.downloadedCount++;
      logger.info(`[UpdateService] Downloaded: ${path.basename(localPath)} (${buffer.length} bytes)`);
      return true;
    } catch (error) {
      this.failedCount++;
      logger.error(`[UpdateService] Failed to download ${remoteUrl}:`, error);
      return false;
    }
  }

  /**
   * Sync a directory recursively
   */
  private async syncDirectory(remotePath: string, localPath: string): Promise<void> {
    const remoteUrl = `${this.UPDATE_SERVER_BASE}/${remotePath}`;

    try {
      // Fetch directory listing
      const response = await fetch(remoteUrl);
      if (!response.ok) {
        logger.warn(`[UpdateService] Cannot access ${remotePath}: HTTP ${response.status}`);
        return;
      }

      const html = await response.text();
      const { files, directories } = this.parseDirectoryListing(html);

      logger.info(`[UpdateService] Syncing ${remotePath} (${files.length} files, ${directories.length} subdirectories)`);

      // Download files
      for (const file of files) {
        const fileRemoteUrl = `${this.UPDATE_SERVER_BASE}/${remotePath}/${file}`;
        const fileLocalPath = path.join(localPath, file);
        await this.downloadFileIfMissing(fileRemoteUrl, fileLocalPath);
      }

      // Recursively sync subdirectories (but don't recurse infinitely)
      // Only sync one level deep to avoid infinite loops
      for (const dir of directories) {
        const subRemotePath = `${remotePath}/${dir}`;
        const subLocalPath = path.join(localPath, dir);

        // Only sync first level of subdirectories
        const subRemoteUrl = `${this.UPDATE_SERVER_BASE}/${subRemotePath}`;
        const subResponse = await fetch(subRemoteUrl);
        if (subResponse.ok) {
          const subHtml = await subResponse.text();
          const { files: subFiles } = this.parseDirectoryListing(subHtml);

          for (const subFile of subFiles) {
            const subFileRemoteUrl = `${this.UPDATE_SERVER_BASE}/${subRemotePath}/${subFile}`;
            const subFileLocalPath = path.join(subLocalPath, subFile);
            await this.downloadFileIfMissing(subFileRemoteUrl, subFileLocalPath);
          }
        }
      }
    } catch (error) {
      logger.error(`[UpdateService] Error syncing ${remotePath}:`, error);
    }
  }

  /**
   * Sync all directories and files from update server
   */
  async syncAll(): Promise<void> {
    logger.info('[UpdateService] Starting update check...');
    this.downloadedCount = 0;
    this.skippedCount = 0;
    this.failedCount = 0;

    const startTime = Date.now();

    // Ensure cache directory exists
    this.ensureCacheDirectory();

    // Download root-level files
    logger.info('[UpdateService] Checking root-level files...');
    for (const file of this.ROOT_FILES) {
      const remoteUrl = `${this.UPDATE_SERVER_BASE}/${file}`;
      const localPath = path.join(this.CACHE_ROOT, file);
      await this.downloadFileIfMissing(remoteUrl, localPath);
    }

    // Sync only critical directories (data files, not images)
    // Images are downloaded on-demand by the image proxy
    for (const dir of this.CRITICAL_DIRECTORIES) {
      const localPath = path.join(this.CACHE_ROOT, dir);
      await this.syncDirectory(dir, localPath);
    }

    logger.info('[UpdateService] Image directories will be downloaded on-demand by image proxy');
    logger.info(`[UpdateService] Available image directories: ${this.IMAGE_DIRECTORIES.join(', ')}`)

    const duration = Date.now() - startTime;
    logger.info(`[UpdateService] Update check complete in ${duration}ms`);
    logger.info(`[UpdateService] Downloaded: ${this.downloadedCount} | Skipped: ${this.skippedCount} | Failed: ${this.failedCount}`);
  }

  /**
   * Get statistics about the last sync operation
   */
  getStats(): { downloaded: number; skipped: number; failed: number } {
    return {
      downloaded: this.downloadedCount,
      skipped: this.skippedCount,
      failed: this.failedCount
    };
  }
}
