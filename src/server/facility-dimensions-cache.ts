/**
 * Facility Dimensions Cache Manager - Manages building dimensions from CSV
 * Replaces complex CLASSES.BIN parsing with simple CSV approach
 */

import * as path from 'path';
import { createLogger } from '../shared/logger';
import { FacilityCSVParser, FacilityDimensions } from './facility-csv-parser';
import type { Service } from './service-registry';

const logger = createLogger('FacilityDimensionsCache');

export class FacilityDimensionsCache implements Service {
  public readonly name = 'facilities';

  private cache: Map<string, FacilityDimensions> = new Map();
  private parser: FacilityCSVParser;
  private initialized: boolean = false;

  constructor() {
    this.parser = new FacilityCSVParser();
  }

  /**
   * Initialize the cache - parse facility_db.csv
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('[FacilityDimensionsCache] Already initialized');
      return;
    }

    try {
      logger.info('[FacilityDimensionsCache] Initializing...');

      // Parse facility_db.csv
      const csvPath = path.join(__dirname, '../../BuildingClasses/facility_db.csv');
      this.cache = await this.parser.parseFile(csvPath);

      this.initialized = true;
      logger.info('[FacilityDimensionsCache] Initialization complete');
      this.logCacheStats();
    } catch (error) {
      logger.error('[FacilityDimensionsCache] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get facility dimensions by visualClass or name
   */
  getFacility(key: string): FacilityDimensions | undefined {
    return this.parser.getFacility(key);
  }

  /**
   * Get all facilities
   */
  getAllFacilities(): FacilityDimensions[] {
    return Array.from(this.cache.values());
  }

  /**
   * Check if cache is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the entire cache
   */
  getCache(): Map<string, FacilityDimensions> {
    return this.cache;
  }

  /**
   * Log cache statistics
   */
  private logCacheStats(): void {
    logger.info(`[FacilityDimensionsCache] Cache Statistics:`);
    logger.info(`  Total: ${this.cache.size} facilities`);
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number } {
    return {
      total: this.cache.size
    };
  }

  /**
   * Service interface: Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && this.cache.size > 0;
  }
}
