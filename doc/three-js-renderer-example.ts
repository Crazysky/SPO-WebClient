/**
 * Three.js Renderer Integration Example
 *
 * This file shows how to integrate the Three.js renderer into the game client.
 * Copy this pattern to your client initialization code.
 */

import { ThreeRendererAdapter, installDebugOverlayShortcut } from '@/client/renderer/three';
import type { MapBuilding, MapSegment } from '@/shared/types';

// ============================================
// EXAMPLE 1: Basic Integration
// ============================================

export function initializeRenderer(canvasId: string) {
  // Create renderer
  const renderer = new ThreeRendererAdapter(canvasId, {
    enableDebug: process.env.NODE_ENV === 'development'
  });

  // Set up zone loading callback
  renderer.setLoadZoneCallback((x, y, w, h) => {
    console.log(`[Renderer] Request zone: ${x},${y} ${w}x${h}`);

    // Call your API to fetch zone data
    fetch(`/api/zone?x=${x}&y=${y}&w=${w}&h=${h}`)
      .then(res => res.json())
      .then(data => {
        renderer.updateMapData({
          x, y, w, h,
          buildings: data.buildings || [],
          segments: data.segments || []
        });
      })
      .catch(err => {
        console.error('[Renderer] Failed to load zone:', err);
      });
  });

  // Set up building click callback
  renderer.setBuildingClickCallback((x, y, visualClass) => {
    console.log(`[Renderer] Building clicked: ${visualClass} at (${x}, ${y})`);

    // Open building details panel or whatever your game does
    // Example: showBuildingDetailsPanel(x, y, visualClass);
  });

  // Load the map
  renderer.loadMap('Shamba').then(() => {
    console.log('[Renderer] Map loaded successfully');

    // Trigger initial zone loading
    renderer.triggerZoneCheck();
  });

  return renderer;
}

// ============================================
// EXAMPLE 2: With Debug Overlay
// ============================================

export function initializeRendererWithDebug(canvasId: string) {
  const renderer = new ThreeRendererAdapter(canvasId, {
    enableDebug: true
  });

  // Install debug overlay (press 'D' to toggle)
  const debugOverlay = installDebugOverlayShortcut(renderer.getThreeRenderer());
  debugOverlay.show(); // Show immediately in development

  // Set up callbacks...
  renderer.setLoadZoneCallback((x, y, w, h) => {
    // Your zone loading logic
  });

  renderer.setBuildingClickCallback((x, y, visualClass) => {
    // Your building click logic
  });

  // Load map
  renderer.loadMap('Shamba').then(() => {
    renderer.triggerZoneCheck();
  });

  return { renderer, debugOverlay };
}

// ============================================
// EXAMPLE 3: Feature Flag Toggle
// ============================================

export function initializeRendererWithFeatureFlag(
  canvasId: string,
  useThreeJS: boolean
) {
  if (useThreeJS) {
    console.log('[Renderer] Using Three.js WebGL renderer');
    return initializeRenderer(canvasId);
  } else {
    console.log('[Renderer] Using Canvas2D renderer');
    // Import and use Canvas2D renderer
    // const { IsometricMapRenderer } = require('@/client/renderer/isometric-map-renderer');
    // return new IsometricMapRenderer(canvasId);
  }
}

// ============================================
// EXAMPLE 4: Complete Game Client Integration
// ============================================

export class GameMapController {
  private renderer: ThreeRendererAdapter;
  private debugOverlay: any | null = null;

  constructor(canvasId: string, options: { enableDebug?: boolean } = {}) {
    this.renderer = new ThreeRendererAdapter(canvasId, options);

    if (options.enableDebug) {
      this.debugOverlay = installDebugOverlayShortcut(this.renderer.getThreeRenderer());
    }

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    // Zone loading
    this.renderer.setLoadZoneCallback(this.onLoadZone.bind(this));

    // Building clicks
    this.renderer.setBuildingClickCallback(this.onBuildingClick.bind(this));
  }

  private async onLoadZone(x: number, y: number, w: number, h: number): Promise<void> {
    try {
      const response = await fetch(`/api/zone?x=${x}&y=${y}&w=${w}&h=${h}`);
      const data = await response.json();

      this.renderer.updateMapData({
        x, y, w, h,
        buildings: data.buildings || [],
        segments: data.segments || []
      });
    } catch (error) {
      console.error('[GameMap] Failed to load zone:', error);
    }
  }

  private onBuildingClick(x: number, y: number, visualClass?: string): void {
    console.log('[GameMap] Building clicked:', { x, y, visualClass });

    // Example: Show building details
    this.showBuildingDetails(x, y, visualClass);
  }

  private showBuildingDetails(x: number, y: number, visualClass?: string): void {
    // Your UI logic here
    // Example: open a modal, fetch building data from server, etc.
  }

  async initialize(mapName: string): Promise<void> {
    await this.renderer.loadMap(mapName);
    this.renderer.triggerZoneCheck();

    console.log('[GameMap] Initialized successfully');
  }

  // Camera controls
  centerOnBuilding(x: number, y: number): void {
    this.renderer.centerOn(x, y);
  }

  setZoomLevel(level: number): void {
    this.renderer.setZoom(level);
  }

  // Season control
  setSeason(season: 'summer' | 'fall' | 'winter' | 'spring'): void {
    this.renderer.setSeason(season);
  }

  // Debug
  toggleDebug(): void {
    if (this.debugOverlay) {
      this.debugOverlay.toggle();
    }
  }

  getPerformanceStats(): any {
    return this.renderer.getRenderStats();
  }

  // Cleanup
  destroy(): void {
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
    }
    this.renderer.destroy();
  }
}

// ============================================
// EXAMPLE 5: Usage in Main Client
// ============================================

/**
 * In your main client initialization file:
 *
 * import { GameMapController } from './game-map-controller';
 *
 * const gameMap = new GameMapController('game-canvas', {
 *   enableDebug: process.env.NODE_ENV === 'development'
 * });
 *
 * await gameMap.initialize('Shamba');
 *
 * // User clicks building
 * gameMap.centerOnBuilding(100, 100);
 *
 * // User changes zoom
 * gameMap.setZoomLevel(2);
 *
 * // User changes season
 * gameMap.setSeason('winter');
 *
 * // Toggle debug overlay (or press 'D' key)
 * gameMap.toggleDebug();
 *
 * // Get performance stats
 * const stats = gameMap.getPerformanceStats();
 * console.log('Buildings:', stats.buildings.visible);
 * console.log('FPS:', gameMap.renderer.getStats().fps);
 */
