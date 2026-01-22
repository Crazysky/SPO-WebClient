/**
 * Client-side Facility Dimensions Cache
 * Stores all building dimensions in memory for instant lookup
 */

import { FacilityDimensions } from '../shared/types';
import { createLogger } from '../shared/logger';

const logger = createLogger('FacilityDimensionsCache[Client]');

/**
 * Client-side cache for facility dimensions
 * Preloaded once on startup, no network requests after that
 */
export class ClientFacilityDimensionsCache {
  private cache: Map<string, FacilityDimensions> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize cache with all facility dimensions
   */
  initialize(dimensions: Record<string, FacilityDimensions>): void {
    if (this.initialized) {
      logger.warn('[ClientFacilityDimensionsCache] Already initialized, skipping');
      return;
    }

    // Convert plain object to Map
    for (const [visualClass, facility] of Object.entries(dimensions)) {
      this.cache.set(visualClass, facility);
    }

    this.initialized = true;
    logger.info(`[ClientFacilityDimensionsCache] Initialized with ${this.cache.size} facilities`);
  }

  /**
   * Get facility dimensions by visualClass
   * Returns undefined if not found
   */
  getFacility(visualClass: string): FacilityDimensions | undefined {
    if (!this.initialized) {
      logger.warn('[ClientFacilityDimensionsCache] Cache not initialized, returning undefined');
      return undefined;
    }

    return this.cache.get(visualClass);
  }

  /**
   * Check if cache is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get cache size
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Clear cache (for testing)
   */
  clear(): void {
    this.cache.clear();
    this.initialized = false;
    logger.info('[ClientFacilityDimensionsCache] Cache cleared');
  }
}

// Singleton instance
let cacheInstance: ClientFacilityDimensionsCache | null = null;

/**
 * Get singleton cache instance
 */
export function getFacilityDimensionsCache(): ClientFacilityDimensionsCache {
  if (!cacheInstance) {
    cacheInstance = new ClientFacilityDimensionsCache();
  }
  return cacheInstance;
}
