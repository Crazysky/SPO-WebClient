/**
 * Facility CSV Parser - Parses facility.csv for building dimensions
 * Replaces CLASSES.BIN parser with simpler CSV-based approach
 */

import * as fs from 'fs';
import { createLogger } from '../shared/logger';

const logger = createLogger('FacilityCSVParser');

export interface FacilityDimensions {
  visualClass: string;     // Numeric ID as string (matches VisualClass from ObjectsInArea response)
  name: string;            // Building name
  facid: string;           // Internal FacID constant name (e.g., FID_FoodStore)
  xsize: number;           // Building width in tiles
  ysize: number;           // Building height in tiles
  level: number;           // Building level/tier
  fidConstant: number;     // FID constant numeric value
}

export class FacilityCSVParser {
  private cacheByVisualClass: Map<string, FacilityDimensions> = new Map();
  private cacheByName: Map<string, FacilityDimensions> = new Map();

  /**
   * Parse facility_db.csv file and populate the cache
   * CSV Format: visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
   */
  async parseFile(filePath: string): Promise<Map<string, FacilityDimensions>> {
    logger.info(`[FacilityCSVParser] Parsing ${filePath}...`);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);

      let parsed = 0;
      let skipped = 0;

      // Skip header line (line 0)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        if (parts.length < 7) continue;

        const visualClass = parts[0].trim();

        // Skip entries with NOT_FOUND as visualClass
        if (visualClass === 'NOT_FOUND') {
          skipped++;
          logger.warn(`[FacilityCSVParser] Skipping NOT_FOUND entry at line ${i + 1}: ${parts[1].trim()}`);
          continue;
        }

        const facility: FacilityDimensions = {
          visualClass: visualClass,              // Column 0: Numeric ID as string
          name: parts[1].trim(),                 // Column 1: Building name
          facid: parts[2].trim(),                // Column 2: FacID constant name
          xsize: parseInt(parts[3].trim(), 10),  // Column 3: Width
          ysize: parseInt(parts[4].trim(), 10),  // Column 4: Height
          level: parseInt(parts[5].trim(), 10),  // Column 5: Level/tier
          fidConstant: parseInt(parts[6].trim(), 10) // Column 6: FID numeric constant
        };

        // Validate numeric fields
        if (isNaN(facility.xsize) || isNaN(facility.ysize) || isNaN(facility.level) || isNaN(facility.fidConstant)) {
          logger.warn(`[FacilityCSVParser] Invalid numeric data at line ${i + 1}, skipping`);
          skipped++;
          continue;
        }

        // Cache by visualClass (for lookups from ObjectsInArea)
        this.cacheByVisualClass.set(facility.visualClass, facility);

        // Cache by name (for building placement lookups)
        this.cacheByName.set(facility.name, facility);

        parsed++;
      }

      logger.info(`[FacilityCSVParser] Parsed ${parsed} facilities (${skipped} skipped)`);
      return this.cacheByVisualClass;
    } catch (error) {
      logger.error('[FacilityCSVParser] Parse error:', error);
      throw error;
    }
  }

  /**
   * Get facility dimensions by visualClass or name
   */
  getFacility(key: string): FacilityDimensions | undefined {
    // Try visualClass first (numeric string)
    let result = this.cacheByVisualClass.get(key);

    // If not found, try name lookup
    if (!result) {
      result = this.cacheByName.get(key);
    }

    return result;
  }

  /**
   * Get all facilities
   */
  getAllFacilities(): FacilityDimensions[] {
    return Array.from(this.cacheByVisualClass.values());
  }

  /**
   * Get cache (by visualClass)
   */
  getCache(): Map<string, FacilityDimensions> {
    return this.cacheByVisualClass;
  }

  /**
   * Get cache by name
   */
  getCacheByName(): Map<string, FacilityDimensions> {
    return this.cacheByName;
  }
}
