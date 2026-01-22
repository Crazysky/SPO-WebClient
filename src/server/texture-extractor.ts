/**
 * TextureExtractor
 *
 * Extracts terrain textures from CAB archives and builds a texture index.
 * Textures are extracted to webclient-cache/textures/<terrainType>/<season>/
 *
 * Season folders:
 * - 0 = Winter (Hiver)
 * - 1 = Spring (Printemps)
 * - 2 = Summer (Été)
 * - 3 = Autumn (Automne)
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
import { Season, SEASON_NAMES } from '../shared/map-config';
import type { Service } from './service-registry';

const execAsync = promisify(exec);

// Path to 7-Zip executable
const SEVENZIP_PATH = 'C:\\Program Files\\7-Zip\\7z.exe';

/**
 * Mapping from palette index to texture filename, parsed from LandClasses INI files
 */
export interface LandClassMapping {
  id: number;           // Palette index (0-255)
  mapColor: number;     // Color value for minimap
  filename: string;     // Texture filename (e.g., "land.0.GrassCenter0.bmp" or "GrassSpecial1.bmp")
}

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
  season: Season;
  textures: Map<number, TextureInfo[]>; // paletteIndex -> array of texture variants
}

export class TextureExtractor implements Service {
  public readonly name = 'textures';

  private cacheDir: string;
  private landImagesDir: string;
  private landClassesDir: string;
  private extractedDir: string;
  private textureIndex: Map<string, TextureIndex> = new Map(); // "terrainType-season" -> TextureIndex
  private landClassMappings: Map<number, LandClassMapping> = new Map(); // paletteIndex -> mapping
  private initialized: boolean = false;

  constructor(cacheDir: string = 'cache') {
    this.cacheDir = cacheDir;
    this.landImagesDir = path.join(cacheDir, 'landimages');
    this.landClassesDir = path.join(cacheDir, 'LandClasses');
    this.extractedDir = path.join('webclient-cache', 'textures');
  }

  /**
   * Initialize texture extraction for all terrain types and seasons
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[TextureExtractor] Already initialized');
      return;
    }

    console.log('[TextureExtractor] Initializing...');

    // Ensure extracted directory exists
    if (!fs.existsSync(this.extractedDir)) {
      fs.mkdirSync(this.extractedDir, { recursive: true });
    }

    // Parse LandClasses INI files to get authoritative palette→filename mapping
    await this.parseLandClassesINI();

    // Get available terrain types
    const terrainTypes = await this.getTerrainTypes();
    console.log(`[TextureExtractor] Found terrain types: ${terrainTypes.join(', ')}`);

    // Extract textures for each terrain type and season
    for (const terrainType of terrainTypes) {
      const seasons = await this.getAvailableSeasons(terrainType);

      for (const season of seasons) {
        await this.extractTerrainTextures(terrainType, season);
      }
    }

    this.initialized = true;
    console.log('[TextureExtractor] Initialization complete');
  }

  /**
   * Parse all INI files in cache/LandClasses/ to build palette→filename mapping
   * INI format:
   *   [General]
   *   Id=<paletteIndex>
   *   MapColor=<color>
   *   [Images]
   *   64x32=<filename>
   */
  private async parseLandClassesINI(): Promise<void> {
    if (!fs.existsSync(this.landClassesDir)) {
      console.log(`[TextureExtractor] LandClasses directory not found: ${this.landClassesDir}`);
      return;
    }

    const iniFiles = fs.readdirSync(this.landClassesDir)
      .filter(f => f.endsWith('.ini'));

    console.log(`[TextureExtractor] Parsing ${iniFiles.length} LandClasses INI files...`);

    for (const iniFile of iniFiles) {
      const filePath = path.join(this.landClassesDir, iniFile);
      const mapping = this.parseINIFile(filePath);

      if (mapping) {
        this.landClassMappings.set(mapping.id, mapping);
      }
    }

    console.log(`[TextureExtractor] Loaded ${this.landClassMappings.size} palette→filename mappings from INI files`);
  }

  /**
   * Parse a single INI file to extract Id, MapColor and 64x32 filename
   */
  private parseINIFile(filePath: string): LandClassMapping | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Extract Id from [General] section
      const idMatch = content.match(/^Id\s*=\s*(\d+)/m);
      if (!idMatch) {
        return null;
      }

      // Extract MapColor from [General] section
      const mapColorMatch = content.match(/^MapColor\s*=\s*(\d+)/m);

      // Extract filename from [Images] section (64x32=)
      const filenameMatch = content.match(/^64x32\s*=\s*(.+\.bmp)/mi);
      if (!filenameMatch) {
        return null;
      }

      return {
        id: parseInt(idMatch[1], 10),
        mapColor: mapColorMatch ? parseInt(mapColorMatch[1], 10) : 0,
        filename: filenameMatch[1].trim()
      };
    } catch (error) {
      console.error(`[TextureExtractor] Error parsing INI file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Service interface: Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && this.textureIndex.size > 0;
  }

  /**
   * Get available terrain types from landimages directory
   */
  private async getTerrainTypes(): Promise<string[]> {
    const entries = fs.readdirSync(this.landImagesDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => decodeURIComponent(e.name)); // Decode URL-encoded directory names
  }

  /**
   * Get available seasons for a terrain type
   * Returns Season enum values (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   */
  private async getAvailableSeasons(terrainType: string): Promise<Season[]> {
    // Use encoded name for filesystem access
    const encodedTerrainType = encodeURIComponent(terrainType);
    const terrainDir = path.join(this.landImagesDir, encodedTerrainType);
    const entries = fs.readdirSync(terrainDir, { withFileTypes: true });

    return entries
      .filter(e => e.isDirectory() && /^[0-3]$/.test(e.name))
      .map(e => parseInt(e.name, 10) as Season)
      .sort();
  }

  /**
   * Extract textures from CAB files for a specific terrain type and season
   */
  private async extractTerrainTextures(terrainType: string, season: Season): Promise<void> {
    // Use encoded name for filesystem access
    const encodedTerrainType = encodeURIComponent(terrainType);
    const sourceDir = path.join(this.landImagesDir, encodedTerrainType, String(season));
    const targetDir = path.join(this.extractedDir, terrainType, String(season));
    const seasonName = SEASON_NAMES[season];

    // Check if source directory exists
    if (!fs.existsSync(sourceDir)) {
      console.log(`[TextureExtractor] Source not found: ${sourceDir}`);
      return;
    }

    // Check if already extracted (by checking for index file with correct version)
    const indexFile = path.join(targetDir, 'index.json');
    if (fs.existsSync(indexFile)) {
      // Load existing index
      const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));

      // Check if index was built with INI mapping (version 2)
      if (indexData.version === 2) {
        const textureMap = new Map<number, TextureInfo[]>();

        for (const [key, value] of Object.entries(indexData.textures)) {
          textureMap.set(parseInt(key, 10), value as TextureInfo[]);
        }

        this.textureIndex.set(`${terrainType}-${season}`, {
          terrainType,
          season,
          textures: textureMap
        });

        console.log(`[TextureExtractor] Loaded cached index (v2): ${terrainType}/${seasonName}`);
        return;
      } else {
        console.log(`[TextureExtractor] Rebuilding index (old version): ${terrainType}/${seasonName}`);
      }
    }

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Get CAB files in source directory
    const cabFiles = fs.readdirSync(sourceDir)
      .filter(f => f.endsWith('.cab'));

    // Extract each CAB file
    for (const cabFile of cabFiles) {
      const cabPath = path.join(sourceDir, cabFile);

      try {
        await this.extractCab(cabPath, targetDir);
      } catch (error) {
        console.error(`[TextureExtractor] Failed to extract ${cabFile}:`, error);
      }
    }

    // Build texture map using INI mappings as source of truth
    const textureMap = new Map<number, TextureInfo[]>();

    // Get all extracted BMP files
    const extractedFiles = fs.readdirSync(targetDir)
      .filter(f => f.endsWith('.bmp'));

    // Create a case-insensitive filename lookup map
    const filenameLookup = new Map<string, string>();
    for (const file of extractedFiles) {
      filenameLookup.set(file.toLowerCase(), file);
    }

    // For each palette index in INI mappings, find the corresponding texture file
    for (const [paletteIndex, mapping] of this.landClassMappings) {
      const expectedFilename = mapping.filename;
      const actualFilename = filenameLookup.get(expectedFilename.toLowerCase());

      if (actualFilename) {
        const info = this.buildTextureInfo(paletteIndex, actualFilename, targetDir);
        if (!textureMap.has(paletteIndex)) {
          textureMap.set(paletteIndex, []);
        }
        textureMap.get(paletteIndex)!.push(info);
      }
    }

    // Store in memory index
    const index: TextureIndex = {
      terrainType,
      season,
      textures: textureMap
    };
    this.textureIndex.set(`${terrainType}-${season}`, index);

    // Save index to file for faster startup next time (version 2 = INI-based)
    const indexData = {
      version: 2,
      terrainType,
      season,
      seasonName,
      textures: Object.fromEntries(textureMap)
    };
    fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));

    console.log(`[TextureExtractor] Indexed ${textureMap.size} textures using INI mapping: ${terrainType}/${seasonName}`);
  }

  /**
   * Build TextureInfo from palette index and filename
   */
  private buildTextureInfo(paletteIndex: number, fileName: string, baseDir: string): TextureInfo {
    // Try to extract terrain type and direction from filename
    // Pattern: land.128.DryGroundCenter0.bmp or GrassSpecial1.bmp
    let terrainType = 'Unknown';
    let direction = 'Center';
    let variant = 0;

    // Try standard format: land.<index>.<Type><Direction><Variant>.bmp
    // Types: Grass, MidGrass, DryGround, Water
    // Directions: Center, NEi, NEo, NWi, NWo, SEi, SEo, SWi, SWo, Ni, No, Si, So, Ei, Eo, Wi, Wo
    const standardMatch = fileName.match(/^land\.\d+\.(Grass|MidGrass|DryGround|Water)(Center|[NS][EW]?[io])(\d)\.bmp$/i);
    if (standardMatch) {
      terrainType = standardMatch[1];
      direction = standardMatch[2] || 'Center';
      variant = parseInt(standardMatch[3], 10);
    } else {
      // Try special format: <Type>Special<N>.bmp
      const specialMatch = fileName.match(/^(Grass|MidGrass|DryGround|Water)Special(\d+)\.bmp$/i);
      if (specialMatch) {
        terrainType = specialMatch[1];
        direction = 'Special';
        variant = parseInt(specialMatch[2], 10);
      }
    }

    return {
      paletteIndex,
      terrainType,
      direction,
      variant,
      filePath: path.join(baseDir, fileName),
      fileName
    };
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
   * Get texture file path for a palette index
   * Returns the first matching texture (Center variant 0 preferred)
   *
   * @param terrainType - Terrain type (e.g., 'Earth', 'Alien Swamp')
   * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   * @param paletteIndex - Palette index from map BMP (0-255)
   */
  getTexturePath(terrainType: string, season: Season, paletteIndex: number): string | null {
    const key = `${terrainType}-${season}`;
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
  getTextureVariants(terrainType: string, season: Season, paletteIndex: number): TextureInfo[] {
    const key = `${terrainType}-${season}`;
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
   * Get all available palette indices for a terrain type and season
   */
  getAvailableIndices(terrainType: string, season: Season): number[] {
    const key = `${terrainType}-${season}`;
    const index = this.textureIndex.get(key);

    if (!index) {
      return [];
    }

    return Array.from(index.textures.keys()).sort((a, b) => a - b);
  }

  /**
   * Get statistics about extracted textures
   */
  getStats(): { terrainType: string; season: Season; seasonName: string; textureCount: number }[] {
    const stats: { terrainType: string; season: Season; seasonName: string; textureCount: number }[] = [];

    for (const [key, index] of this.textureIndex) {
      stats.push({
        terrainType: index.terrainType,
        season: index.season,
        seasonName: SEASON_NAMES[index.season],
        textureCount: index.textures.size
      });
    }

    return stats;
  }

  /**
   * Get available seasons for a terrain type from the loaded index
   * This queries the already-initialized texture index (fast, no filesystem access)
   *
   * @param terrainType - Terrain type (e.g., 'Earth', 'Alien Swamp')
   * @returns Array of available Season enum values
   */
  getAvailableSeasonsForTerrain(terrainType: string): Season[] {
    const seasons: Season[] = [];

    for (const [key, index] of this.textureIndex) {
      if (index.terrainType === terrainType && !seasons.includes(index.season)) {
        seasons.push(index.season);
      }
    }

    return seasons.sort((a, b) => a - b);
  }

  /**
   * Get terrain info including available seasons
   * Used by client to auto-select an available season
   */
  getTerrainInfo(terrainType: string): { terrainType: string; availableSeasons: Season[]; defaultSeason: Season } | null {
    const availableSeasons = this.getAvailableSeasonsForTerrain(terrainType);

    if (availableSeasons.length === 0) {
      return null;
    }

    // Default season priority: Summer (2) > Spring (1) > Autumn (3) > Winter (0)
    const seasonPriority = [Season.SUMMER, Season.SPRING, Season.AUTUMN, Season.WINTER];
    let defaultSeason = availableSeasons[0];

    for (const preferred of seasonPriority) {
      if (availableSeasons.includes(preferred)) {
        defaultSeason = preferred;
        break;
      }
    }

    return {
      terrainType,
      availableSeasons,
      defaultSeason
    };
  }
}
