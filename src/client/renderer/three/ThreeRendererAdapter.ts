/**
 * ThreeRendererAdapter
 *
 * Adapter class that wraps IsometricThreeRenderer to match the exact interface
 * expected by the game client. This allows seamless switching between Canvas2D
 * and Three.js renderers via feature flag.
 *
 * Usage:
 *   const useThreeJS = settings.get('useThreeJSRenderer', false);
 *   const renderer = useThreeJS
 *     ? new ThreeRendererAdapter('game-canvas')
 *     : new IsometricMapRenderer('game-canvas');
 */

import { IsometricThreeRenderer } from './IsometricThreeRenderer';
import type { Season } from '../../../shared/map-config';
import type { MapBuilding, MapSegment } from '../../../shared/types';

export class ThreeRendererAdapter {
  private renderer: IsometricThreeRenderer;
  private debugStatsInterval: number | null = null;

  constructor(canvasId: string, options: { enableDebug?: boolean } = {}) {
    // Create Three.js renderer with options
    this.renderer = new IsometricThreeRenderer(canvasId, {
      antialias: true,
      backgroundColor: 0x1a1a2e,
      enableDebug: options.enableDebug ?? false
    });

    // Start continuous rendering
    this.renderer.startRenderLoop();

    // Set up debug stats logging if enabled
    if (options.enableDebug) {
      this.startDebugLogging();
    }
  }

  /**
   * Start logging debug stats to console
   */
  private startDebugLogging(): void {
    if (this.debugStatsInterval) return;

    this.debugStatsInterval = window.setInterval(() => {
      const stats = this.renderer.getStats();
      const renderStats = this.renderer.getRenderStats();

      console.log('[ThreeRenderer] Performance Stats:', {
        fps: stats.fps,
        frameTime: `${stats.frameTime.toFixed(2)}ms`,
        drawCalls: stats.drawCalls,
        buildings: `${renderStats.buildings.visible}/${renderStats.buildings.total}`,
        terrain: `${renderStats.terrain.visibleChunks}/${renderStats.terrain.chunks} chunks`,
        roads: renderStats.roads.meshes,
        concrete: renderStats.concrete.meshes
      });
    }, 5000); // Log every 5 seconds
  }

  /**
   * Stop debug logging
   */
  private stopDebugLogging(): void {
    if (this.debugStatsInterval) {
      clearInterval(this.debugStatsInterval);
      this.debugStatsInterval = null;
    }
  }

  // ============================================
  // Public API (matches IsometricMapRenderer)
  // ============================================

  /**
   * Load a map
   */
  async loadMap(mapName: string): Promise<any> {
    return await this.renderer.loadMap(mapName);
  }

  /**
   * Check if map is loaded
   */
  isLoaded(): boolean {
    return this.renderer.isLoaded();
  }

  /**
   * Update map data with buildings and road segments
   */
  updateMapData(mapData: {
    x: number;
    y: number;
    w: number;
    h: number;
    buildings: MapBuilding[];
    segments: MapSegment[];
  }): void {
    this.renderer.updateMapData(mapData);
  }

  /**
   * Set callback for zone loading
   */
  setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void): void {
    this.renderer.setLoadZoneCallback(callback);
  }

  /**
   * Trigger zone check (call after setting callbacks)
   */
  triggerZoneCheck(): void {
    this.renderer.triggerZoneCheck();
  }

  /**
   * Set callback for building clicks
   */
  setBuildingClickCallback(callback: (x: number, y: number, visualClass?: string) => void): void {
    this.renderer.setBuildingClickCallback(callback);
  }

  /**
   * Set callback for fetching facility dimensions
   */
  setFetchFacilityDimensionsCallback(callback: (visualClass: string) => Promise<any>): void {
    this.renderer.setFetchFacilityDimensionsCallback(callback);
  }

  /**
   * Set callback for canceling building placement
   */
  setCancelPlacementCallback(callback: () => void): void {
    this.renderer.setCancelPlacementCallback(callback);
  }

  /**
   * Set callback for road segment completion
   */
  setRoadSegmentCompleteCallback(callback: (x1: number, y1: number, x2: number, y2: number) => void): void {
    this.renderer.setRoadSegmentCompleteCallback(callback);
  }

  /**
   * Set callback for canceling road drawing
   */
  setCancelRoadDrawingCallback(callback: () => void): void {
    this.renderer.setCancelRoadDrawingCallback(callback);
  }

  /**
   * Center camera on coordinates
   */
  centerOn(x: number, y: number): void {
    this.renderer.centerOn(x, y);
  }

  /**
   * Get camera position
   */
  getCameraPosition(): { x: number; y: number } {
    return this.renderer.getCameraPosition();
  }

  /**
   * Set zoom level (0-3)
   */
  setZoom(level: number): void {
    this.renderer.setZoom(level);
  }

  /**
   * Get zoom level
   */
  getZoom(): number {
    return this.renderer.getZoom();
  }

  /**
   * Set season
   */
  setSeason(season: Season): void {
    this.renderer.setSeason(season);
  }

  /**
   * Get season
   */
  getSeason(): Season {
    return this.renderer.getSeason();
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.renderer.setDebugMode(enabled);

    if (enabled) {
      this.startDebugLogging();
    } else {
      this.stopDebugLogging();
    }
  }

  /**
   * Get performance stats
   */
  getStats(): { fps: number; drawCalls: number; frameTime: number } {
    return this.renderer.getStats();
  }

  /**
   * Get detailed render stats
   */
  getRenderStats(): {
    terrain: { chunks: number; visibleChunks: number; texturesLoaded: number };
    buildings: { total: number; visible: number; texturesLoaded: boolean };
    roads: { total: number; meshes: number };
    concrete: { meshes: number };
  } {
    return this.renderer.getRenderStats();
  }

  /**
   * Get the underlying Three.js renderer (advanced usage)
   */
  getThreeRenderer(): IsometricThreeRenderer {
    return this.renderer;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopDebugLogging();
    this.renderer.destroy();
  }
}
