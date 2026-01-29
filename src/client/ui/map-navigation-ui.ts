/**
 * MapNavigationUI - Handles map display and interactions
 *
 * Supports two rendering engines:
 * - PixiJS (WebGL) - Default, GPU-accelerated for performance
 * - Canvas 2D - Legacy fallback (disabled by default)
 */

import { IsometricMapRenderer } from '../renderer/isometric-map-renderer';
import { PixiMapRendererAdapter } from '../renderer/pixi';
import { FacilityDimensions } from '../../shared/types';

/** Renderer type configuration */
export type RendererType = 'pixi' | 'canvas';

/** Common renderer interface */
interface MapRenderer {
  loadMap(mapName: string): Promise<unknown>;
  setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void): void;
  setBuildingClickCallback(callback: (x: number, y: number, visualClass?: string) => void): void;
  setFetchFacilityDimensionsCallback(callback: (visualClass: string) => Promise<FacilityDimensions | null>): void;
  triggerZoneCheck(): void;
  // Additional methods available on both renderers
  updateMapData?(mapData: { x: number; y: number; w: number; h: number; buildings: unknown[]; segments: unknown[] }): void;
  setZoom?(level: number): void;
  getZoom?(): number;
  centerOn?(x: number, y: number): void;
  getCameraPosition?(): { x: number; y: number };
  setPlacementMode?(enabled: boolean, building?: unknown, facilityDimensions?: FacilityDimensions): void;
  setRoadDrawingMode?(enabled: boolean): void;
  setZoneOverlay?(enabled: boolean, data?: unknown, x1?: number, y1?: number): void;
  setRoadSegmentCompleteCallback?(callback: (x1: number, y1: number, x2: number, y2: number) => void): void;
  setCancelPlacementCallback?(callback: () => void): void;
  setCancelRoadDrawingCallback?(callback: () => void): void;
  setFacilityDimensionsCache?(cache: Map<string, FacilityDimensions>): void;
  destroy?(): void;
}

export class MapNavigationUI {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: MapRenderer | null = null;
  private rendererType: RendererType = 'pixi'; // Default to PixiJS

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;

  constructor(private gamePanel: HTMLElement, rendererType: RendererType = 'pixi') {
    this.rendererType = rendererType;
  }

  /**
   * Set callback for loading new zones
   */
  public setOnLoadZone(callback: (x: number, y: number, w: number, h: number) => void) {
    this.onLoadZone = callback;
    console.log('[MapNavigationUI] onLoadZone callback set');

    // Trigger initial zone loading now that callback is set
    if (this.renderer) {
      console.log('[MapNavigationUI] Triggering initial zone load');
      setTimeout(() => {
        this.renderer?.triggerZoneCheck();
      }, 100);
    }
  }

  /**
   * Set callback for building clicks
   */
  public setOnBuildingClick(callback: (x: number, y: number, visualClass?: string) => void) {
    this.onBuildingClick = callback;
  }

  /**
   * Set callback for fetching facility dimensions
   */
  public setOnFetchFacilityDimensions(callback: (visualClass: string) => Promise<FacilityDimensions | null>) {
    this.onFetchFacilityDimensions = callback;
  }

  /**
   * Initialize the canvas and renderer
   */
  public init() {
    // Remove placeholder
    const placeholder = this.gamePanel.querySelector('div');
    if (placeholder) {
      placeholder.remove();
    }

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    this.canvas.style.flex = '1';
    this.canvas.style.width = '100%';
    this.canvas.style.backgroundColor = '#111';
    this.gamePanel.appendChild(this.canvas);

    // Initialize renderer based on type
    if (this.rendererType === 'pixi') {
      this.initPixiRenderer();
    } else {
      this.initCanvasRenderer();
    }
  }

  /**
   * Initialize PixiJS WebGL renderer
   */
  private initPixiRenderer() {
    console.log('[MapNavigationUI] Initializing PixiJS WebGL renderer');

    try {
      this.renderer = new PixiMapRendererAdapter('game-canvas');
      this.setupRendererCallbacks();

      // Load map
      this.renderer.loadMap('Shamba').then(() => {
        console.log('[MapNavigationUI] PixiJS terrain loaded successfully');
      }).catch((err) => {
        console.error('[MapNavigationUI] Failed to load terrain with PixiJS:', err);
      });
    } catch (err) {
      console.error('[MapNavigationUI] PixiJS initialization failed:', err);
      // Note: No fallback as per user request
      throw err;
    }
  }

  /**
   * Initialize Canvas 2D renderer (legacy)
   */
  private initCanvasRenderer() {
    console.log('[MapNavigationUI] Initializing Canvas 2D renderer (legacy)');

    this.renderer = new IsometricMapRenderer('game-canvas');
    this.setupRendererCallbacks();

    // Load map
    this.renderer.loadMap('Shamba').then(() => {
      console.log('[MapNavigationUI] Canvas terrain loaded successfully');
    }).catch((err) => {
      console.error('[MapNavigationUI] Failed to load terrain:', err);
    });
  }

  /**
   * Setup renderer callbacks (common for both renderer types)
   */
  private setupRendererCallbacks() {
    if (!this.renderer) return;

    this.renderer.setLoadZoneCallback((x, y, w, h) => {
      console.log(`[MapNavigationUI] Zone callback triggered: (${x}, ${y}) ${w}x${h}, onLoadZone=${!!this.onLoadZone}`);
      if (this.onLoadZone) {
        this.onLoadZone(x, y, w, h);
      } else {
        console.warn('[MapNavigationUI] onLoadZone callback not set yet!');
      }
    });

    this.renderer.setBuildingClickCallback((x, y, visualClass) => {
      if (this.onBuildingClick) this.onBuildingClick(x, y, visualClass);
    });

    this.renderer.setFetchFacilityDimensionsCallback(async (visualClass) => {
      if (this.onFetchFacilityDimensions) {
        return await this.onFetchFacilityDimensions(visualClass);
      }
      return null;
    });
  }

  /**
   * Get the renderer (for map data operations)
   */
  public getRenderer(): MapRenderer | null {
    return this.renderer;
  }

  /**
   * Get the renderer as IsometricMapRenderer (for type compatibility)
   * @deprecated Use getRenderer() and type-check instead
   */
  public getCanvasRenderer(): IsometricMapRenderer | null {
    if (this.rendererType === 'canvas' && this.renderer) {
      return this.renderer as IsometricMapRenderer;
    }
    return null;
  }

  /**
   * Get current renderer type
   */
  public getRendererType(): RendererType {
    return this.rendererType;
  }

  /**
   * Check if using WebGL renderer
   */
  public isWebGL(): boolean {
    return this.rendererType === 'pixi';
  }

  /**
   * Destroy renderer and cleanup
   */
  public destroy() {
    if (this.renderer?.destroy) {
      this.renderer.destroy();
    }
    this.renderer = null;
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
  }
}
