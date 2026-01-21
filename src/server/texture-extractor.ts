/**
 * TextureExtractor
 *
 * Extracts terrain textures from CAB archives and builds a texture index.
 * Textures are extracted to webclient-cache/textures/<terrainType>/<zoom>/
 *
 * Texture naming convention in CAB files:
 * - land.<paletteIndex>.<TerrainType><Direction><Variant>.bmp
 * - Example: land.128.DryGroundCenter0.bmp
 *
 * Palette ranges (Earth terrain):
 * - 0-63: Grass variants
 * - 64-127: MidGrass (transitions)
 * - 128-191: DryGround
 * - 192-255: Water
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Path to 7-Zip executable
const SEVENZIP_PATH = 'C:\\Program Files\\7-Zip\\7z.exe';

export interface TextureInfo {
  paletteIndex: number;
  terrainType: string;
  direction: string;
  variant: number;
  filePath: string;
  fileName: string;
}

export interface TextureIndex {
  terrainType: string;
  zoomLevel: number;
  textures: Map<number, TextureInfo[]>; // paletteIndex -> array of texture variants
}

export class TextureExtractor {
  private cacheDir: string;
  private landImagesDir: string;
  private extractedDir: string;
  private textureIndex: Map<string, TextureIndex> = new Map(); // "terrainType-zoom" -> TextureIndex

  constructor(cacheDir: string = 'cache') {
    this.cacheDir = cacheDir;
    this.landImagesDir = path.join(cacheDir, 'landimages');
    this.extractedDir = path.join('webclient-cache', 'textures');
  }

  /**
   * Initialize texture extraction for all terrain types and zoom levels
   */
  async initialize(): Promise<void> {
    console.log('[TextureExtractor] Initializing...');

    // Ensure extracted directory exists
    if (!fs.existsSync(this.extractedDir)) {
      fs.mkdirSync(this.extractedDir, { recursive: true });
    }

    // Get available terrain types
    const terrainTypes = await this.getTerrainTypes();
    console.log(`[TextureExtractor] Found terrain types: ${terrainTypes.join(', ')}`);

    // Extract textures for each terrain type and zoom level
    for (const terrainType of terrainTypes) {
      const zoomLevels = await this.getZoomLevels(terrainType);

      for (const zoom of zoomLevels) {
        await this.extractTerrainTextures(terrainType, zoom);
      }
    }

    console.log('[TextureExtractor] Initialization complete');
  }

  /**
   * Get available terrain types from landimages directory
   */
  private async getTerrainTypes(): Promise<string[]> {
    const entries = fs.readdirSync(this.landImagesDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);
  }

  /**
   * Get available zoom levels for a terrain type
   */
  private async getZoomLevels(terrainType: string): Promise<number[]> {
    const terrainDir = path.join(this.landImagesDir, terrainType);
    const entries = fs.readdirSync(terrainDir, { withFileTypes: true });

    return entries
      .filter(e => e.isDirectory() && /^[0-3]$/.test(e.name))
      .map(e => parseInt(e.name, 10))
      .sort();
  }

  /**
   * Extract textures from CAB files for a specific terrain type and zoom level
   */
  private async extractTerrainTextures(terrainType: string, zoomLevel: number): Promise<void> {
    const sourceDir = path.join(this.landImagesDir, terrainType, String(zoomLevel));
    const targetDir = path.join(this.extractedDir, terrainType, String(zoomLevel));

    // Check if source directory exists
    if (!fs.existsSync(sourceDir)) {
      console.log(`[TextureExtractor] Source not found: ${sourceDir}`);
      return;
    }

    // Check if already extracted (by checking for index file)
    const indexFile = path.join(targetDir, 'index.json');
    if (fs.existsSync(indexFile)) {
      // Load existing index
      const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      const textureMap = new Map<number, TextureInfo[]>();

      for (const [key, value] of Object.entries(indexData.textures)) {
        textureMap.set(parseInt(key, 10), value as TextureInfo[]);
      }

      this.textureIndex.set(`${terrainType}-${zoomLevel}`, {
        terrainType,
        zoomLevel,
        textures: textureMap
      });

      console.log(`[TextureExtractor] Loaded cached index: ${terrainType}/${zoomLevel}`);
      return;
    }

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Get CAB files in source directory
    const cabFiles = fs.readdirSync(sourceDir)
      .filter(f => f.endsWith('.cab'));

    const textureMap = new Map<number, TextureInfo[]>();

    // Extract each CAB file
    for (const cabFile of cabFiles) {
      const cabPath = path.join(sourceDir, cabFile);

      try {
        await this.extractCab(cabPath, targetDir);

        // Parse extracted files
        const extracted = fs.readdirSync(targetDir)
          .filter(f => f.endsWith('.bmp') && f.startsWith('land.'));

        for (const file of extracted) {
          const info = this.parseTextureFileName(file, targetDir);
          if (info) {
            if (!textureMap.has(info.paletteIndex)) {
              textureMap.set(info.paletteIndex, []);
            }
            textureMap.get(info.paletteIndex)!.push(info);
          }
        }
      } catch (error) {
        console.error(`[TextureExtractor] Failed to extract ${cabFile}:`, error);
      }
    }

    // Store in memory index
    const index: TextureIndex = {
      terrainType,
      zoomLevel,
      textures: textureMap
    };
    this.textureIndex.set(`${terrainType}-${zoomLevel}`, index);

    // Save index to file for faster startup next time
    const indexData = {
      terrainType,
      zoomLevel,
      textures: Object.fromEntries(textureMap)
    };
    fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));

    console.log(`[TextureExtractor] Extracted ${textureMap.size} textures: ${terrainType}/${zoomLevel}`);
  }

  /**
   * Extract a CAB file using 7-Zip
   */
  private async extractCab(cabPath: string, targetDir: string): Promise<void> {
    const cmd = `"${SEVENZIP_PATH}" x -y -o"${targetDir}" "${cabPath}"`;

    try {
      await execAsync(cmd);
    } catch (error: any) {
      // 7z may return non-zero for warnings, check if files were extracted
      if (!error.stdout?.includes('Everything is Ok')) {
        throw error;
      }
    }
  }

  /**
   * Parse texture file name to extract metadata
   * Format: land.<paletteIndex>.<TerrainType><Direction><Variant>.bmp
   */
  private parseTextureFileName(fileName: string, baseDir: string): TextureInfo | null {
    // Pattern: land.128.DryGroundCenter0.bmp
    const match = fileName.match(/^land\.(\d+)\.(\w+?)([A-Z][a-z]*[io]?)(\d)\.bmp$/);

    if (!match) {
      // Try alternate pattern without direction: land.0.GrassCenter0.bmp
      const altMatch = fileName.match(/^land\.(\d+)\.(\w+)(\d)\.bmp$/);
      if (altMatch) {
        return {
          paletteIndex: parseInt(altMatch[1], 10),
          terrainType: altMatch[2].replace(/\d$/, ''),
          direction: 'Center',
          variant: parseInt(altMatch[3], 10),
          filePath: path.join(baseDir, fileName),
          fileName
        };
      }
      return null;
    }

    return {
      paletteIndex: parseInt(match[1], 10),
      terrainType: match[2],
      direction: match[3] || 'Center',
      variant: parseInt(match[4], 10),
      filePath: path.join(baseDir, fileName),
      fileName
    };
  }

  /**
   * Get texture file path for a palette index
   * Returns the first matching texture (Center variant 0 preferred)
   */
  getTexturePath(terrainType: string, zoomLevel: number, paletteIndex: number): string | null {
    const key = `${terrainType}-${zoomLevel}`;
    const index = this.textureIndex.get(key);

    if (!index) {
      return null;
    }

    const textures = index.textures.get(paletteIndex);
    if (!textures || textures.length === 0) {
      return null;
    }

    // Prefer Center variant 0
    const preferred = textures.find(t => t.direction === 'Center' && t.variant === 0)
      || textures.find(t => t.direction.includes('Center'))
      || textures[0];

    return preferred.filePath;
  }

  /**
   * Get all texture variants for a palette index
   */
  getTextureVariants(terrainType: string, zoomLevel: number, paletteIndex: number): TextureInfo[] {
    const key = `${terrainType}-${zoomLevel}`;
    const index = this.textureIndex.get(key);

    if (!index) {
      return [];
    }

    return index.textures.get(paletteIndex) || [];
  }

  /**
   * Check if textures are available for a terrain type
   */
  hasTerrainType(terrainType: string): boolean {
    return Array.from(this.textureIndex.keys()).some(k => k.startsWith(terrainType + '-'));
  }

  /**
   * Get all available palette indices for a terrain type and zoom level
   */
  getAvailableIndices(terrainType: string, zoomLevel: number): number[] {
    const key = `${terrainType}-${zoomLevel}`;
    const index = this.textureIndex.get(key);

    if (!index) {
      return [];
    }

    return Array.from(index.textures.keys()).sort((a, b) => a - b);
  }

  /**
   * Get statistics about extracted textures
   */
  getStats(): { terrainType: string; zoomLevel: number; textureCount: number }[] {
    const stats: { terrainType: string; zoomLevel: number; textureCount: number }[] = [];

    for (const [key, index] of this.textureIndex) {
      stats.push({
        terrainType: index.terrainType,
        zoomLevel: index.zoomLevel,
        textureCount: index.textures.size
      });
    }

    return stats;
  }
}
