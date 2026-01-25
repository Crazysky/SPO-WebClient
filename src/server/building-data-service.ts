/**
 * Building Data Service - Manages building metadata from buildings.json
 * Replaces FacilityCSVParser with a more complete data format that includes texture filenames
 *
 * Key features:
 * - Loads building data from BuildingClasses/buildings.json
 * - Provides lookups by visualClass (runtime), baseVisualClass, and emptyVisualClass
 * - Caches data for efficient access
 * - Compatible with existing FacilityDimensions interface for backward compatibility
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../shared/logger';
import { BuildingData, BuildingDatabase } from '../shared/types/building-data';
import type { Service } from './service-registry';

const logger = createLogger('BuildingDataService');

/**
 * Backward-compatible interface with existing FacilityDimensions
 */
export interface FacilityDimensions {
  visualClass: string;
  name: string;
  facid: string;
  xsize: number;
  ysize: number;
  level: number;
  fidConstant?: number;
  textureFilename?: string;
  emptyTextureFilename?: string;
  constructionTextureFilename?: string;
}

/**
 * Building Data Service
 * Provides building metadata lookups for rendering and building placement
 */
export class BuildingDataService implements Service {
  public readonly name = 'buildings';

  /** Main cache: visualClass -> BuildingData */
  private cacheByVisualClass: Map<string, BuildingData> = new Map();

  /** Reverse lookup: baseVisualClass -> visualClass (complete) */
  private baseToComplete: Map<string, string> = new Map();

  /** Reverse lookup: emptyVisualClass -> visualClass (complete) */
  private emptyToComplete: Map<string, string> = new Map();

  /** Lookup by name */
  private cacheByName: Map<string, BuildingData> = new Map();

  private initialized: boolean = false;

  /**
   * Initialize the service by loading buildings.json
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('[BuildingDataService] Already initialized');
      return;
    }

    try {
      logger.info('[BuildingDataService] Initializing...');

      const jsonPath = path.join(__dirname, '../../BuildingClasses/buildings.json');
      await this.loadFromJson(jsonPath);

      this.initialized = true;
      logger.info('[BuildingDataService] Initialization complete');
      this.logStats();
    } catch (error) {
      logger.error('[BuildingDataService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load building data from JSON file
   */
  private async loadFromJson(filePath: string): Promise<void> {
    logger.info(`[BuildingDataService] Loading ${filePath}...`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const database: BuildingDatabase = JSON.parse(content);

    logger.info(`[BuildingDataService] Loaded database version ${database.version}`);

    // Populate caches
    for (const [visualClass, building] of Object.entries(database.buildings)) {
      // Main cache
      this.cacheByVisualClass.set(visualClass, building);

      // Name lookup
      this.cacheByName.set(building.name, building);

      // Base -> Complete lookup
      this.baseToComplete.set(building.baseVisualClass, visualClass);

      // Empty -> Complete lookup (for residential buildings)
      if (building.emptyVisualClass) {
        this.emptyToComplete.set(building.emptyVisualClass, visualClass);
      }
    }

    logger.info(`[BuildingDataService] Loaded ${this.cacheByVisualClass.size} buildings`);
  }

  /**
   * Get building data by visualClass (the runtime VisualClass from ObjectsInArea)
   * Also checks if the visualClass is a construction or empty state
   */
  getBuilding(visualClass: string): BuildingData | undefined {
    // Try direct lookup first (complete building)
    let building = this.cacheByVisualClass.get(visualClass);
    if (building) {
      return building;
    }

    // Check if this is a base/construction visualClass
    const completeFromBase = this.baseToComplete.get(visualClass);
    if (completeFromBase) {
      return this.cacheByVisualClass.get(completeFromBase);
    }

    // Check if this is an empty visualClass
    const completeFromEmpty = this.emptyToComplete.get(visualClass);
    if (completeFromEmpty) {
      return this.cacheByVisualClass.get(completeFromEmpty);
    }

    return undefined;
  }

  /**
   * Get building by name
   */
  getBuildingByName(name: string): BuildingData | undefined {
    return this.cacheByName.get(name);
  }

  /**
   * Get texture filename for a visualClass
   * Handles construction, empty, and complete states
   */
  getTextureFilename(visualClass: string): string | undefined {
    // Direct lookup
    const building = this.cacheByVisualClass.get(visualClass);
    if (building) {
      return building.textureFilename;
    }

    // Check if this is a construction state (base visualClass)
    const completeFromBase = this.baseToComplete.get(visualClass);
    if (completeFromBase) {
      const completeBuilding = this.cacheByVisualClass.get(completeFromBase);
      if (completeBuilding) {
        return completeBuilding.constructionTextureFilename;
      }
    }

    // Check if this is an empty state
    const completeFromEmpty = this.emptyToComplete.get(visualClass);
    if (completeFromEmpty) {
      const completeBuilding = this.cacheByVisualClass.get(completeFromEmpty);
      if (completeBuilding?.emptyTextureFilename) {
        return completeBuilding.emptyTextureFilename;
      }
    }

    return undefined;
  }

  /**
   * Check if a visualClass represents a construction state
   */
  isConstructionState(visualClass: string): boolean {
    return this.baseToComplete.has(visualClass) && !this.cacheByVisualClass.has(visualClass);
  }

  /**
   * Check if a visualClass represents an empty residential state
   */
  isEmptyState(visualClass: string): boolean {
    return this.emptyToComplete.has(visualClass) && !this.cacheByVisualClass.has(visualClass);
  }

  /**
   * Get backward-compatible FacilityDimensions object
   */
  getFacility(visualClass: string): FacilityDimensions | undefined {
    const building = this.getBuilding(visualClass);
    if (!building) {
      return undefined;
    }

    return {
      visualClass: building.visualClass,
      name: building.name,
      facid: building.category || '',
      xsize: building.xsize,
      ysize: building.ysize,
      level: building.visualStages,
      textureFilename: building.textureFilename,
      emptyTextureFilename: building.emptyTextureFilename,
      constructionTextureFilename: building.constructionTextureFilename
    };
  }

  /**
   * Get all buildings
   */
  getAllBuildings(): BuildingData[] {
    return Array.from(this.cacheByVisualClass.values());
  }

  /**
   * Get buildings by cluster
   */
  getBuildingsByCluster(cluster: string): BuildingData[] {
    return this.getAllBuildings().filter(b => b.cluster === cluster);
  }

  /**
   * Get buildings by category
   */
  getBuildingsByCategory(category: string): BuildingData[] {
    return this.getAllBuildings().filter(b => b.category === category);
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && this.cacheByVisualClass.size > 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; clusters: Record<string, number>; categories: Record<string, number> } {
    const clusters: Record<string, number> = {};
    const categories: Record<string, number> = {};

    for (const building of this.cacheByVisualClass.values()) {
      const cluster = building.cluster || 'unknown';
      const category = building.category || 'unknown';

      clusters[cluster] = (clusters[cluster] || 0) + 1;
      categories[category] = (categories[category] || 0) + 1;
    }

    return {
      total: this.cacheByVisualClass.size,
      clusters,
      categories
    };
  }

  /**
   * Log cache statistics
   */
  private logStats(): void {
    const stats = this.getStats();
    logger.info(`[BuildingDataService] Total buildings: ${stats.total}`);
    logger.info(`[BuildingDataService] By cluster: ${JSON.stringify(stats.clusters)}`);
    logger.info(`[BuildingDataService] By category: ${JSON.stringify(stats.categories)}`);
  }

  /**
   * Get all buildings as a plain object (for client preload)
   */
  getAllBuildingsAsObject(): Record<string, BuildingData> {
    const result: Record<string, BuildingData> = {};
    for (const [key, value] of this.cacheByVisualClass) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Get the main cache
   */
  getCache(): Map<string, BuildingData> {
    return this.cacheByVisualClass;
  }
}
