/**
 * MapNavigationUI - Gère l'affichage et les interactions avec la carte
 */

import { IsometricMapRenderer } from '../renderer/isometric-map-renderer';
import { ThreeRendererAdapter, installDebugOverlayShortcut } from '../renderer/three';
import { getRendererSettings } from '../renderer-settings';
import { FacilityDimensions } from '../../shared/types';

export class MapNavigationUI {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: IsometricMapRenderer | ThreeRendererAdapter | null = null;
  private debugOverlay: any | null = null; // Three.js debug overlay (if enabled)

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;

  constructor(private gamePanel: HTMLElement) {}

  /**
   * Définit le callback pour charger une nouvelle zone
   */
  public setOnLoadZone(callback: (x: number, y: number, w: number, h: number) => void) {
    this.onLoadZone = callback;
    console.log('[MapNavigationUI] onLoadZone callback set');

    // Trigger initial zone loading now that callback is set
    if (this.renderer) {
      console.log('[MapNavigationUI] Triggering initial zone load');
      // Small delay to ensure all callbacks are set up
      setTimeout(() => {
        this.renderer?.triggerZoneCheck();
      }, 100);
    }
  }

  /**
   * Définit le callback pour le clic sur un bâtiment
   */
  public setOnBuildingClick(callback: (x: number, y: number, visualClass?: string) => void) {
    this.onBuildingClick = callback;
  }

  /**
   * Définit le callback pour récupérer les dimensions de facility
   */
  public setOnFetchFacilityDimensions(callback: (visualClass: string) => Promise<FacilityDimensions | null>) {
    this.onFetchFacilityDimensions = callback;
  }

  /**
   * Initialise le canvas et le renderer
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
    this.canvas.style.height = '100%';
    this.canvas.style.backgroundColor = '#111';
    this.gamePanel.appendChild(this.canvas);

    // Get renderer settings
    const settings = getRendererSettings();

    // Init Renderer based on settings
    if (settings.rendererType === 'threejs') {
      console.log('[MapNavigationUI] Initializing Three.js WebGL renderer');
      this.renderer = new ThreeRendererAdapter('game-canvas', {
        enableDebug: settings.enableDebug
      });

      // Install debug overlay if enabled
      if (settings.showDebugOverlay) {
        const threeRenderer = (this.renderer as ThreeRendererAdapter).getThreeRenderer();
        this.debugOverlay = installDebugOverlayShortcut(threeRenderer);
        this.debugOverlay.show();
      } else if (settings.enableDebug) {
        // Install shortcut but don't show initially (user can press 'D' to toggle)
        const threeRenderer = (this.renderer as ThreeRendererAdapter).getThreeRenderer();
        this.debugOverlay = installDebugOverlayShortcut(threeRenderer);
      }
    } else {
      console.log('[MapNavigationUI] Initializing Canvas2D renderer');
      this.renderer = new IsometricMapRenderer('game-canvas');
    }

    // Load map terrain (default to Shamba for now - can be made dynamic later)
    this.renderer.loadMap('Shamba').then(() => {
      console.log('[MapNavigationUI] Terrain loaded successfully');
    }).catch((err) => {
      console.error('[MapNavigationUI] Failed to load terrain:', err);
    });

    // FIX: Define callbacks WITHOUT condition (they will be called via this.onLoadZone)
    // Callbacks can be defined AFTER initialization via setOnLoadZone/setOnBuildingClick
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
   * Retourne le renderer (pour les opérations map data)
   */
  public getRenderer(): IsometricMapRenderer | ThreeRendererAdapter | null {
    return this.renderer;
  }

  /**
   * Toggle debug overlay (Three.js only)
   */
  public toggleDebugOverlay(): void {
    if (this.debugOverlay) {
      this.debugOverlay.toggle();
    }
  }

  /**
   * Cleanup on destroy
   */
  public destroy(): void {
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
      this.debugOverlay = null;
    }

    if (this.renderer) {
      this.renderer.destroy?.();
      this.renderer = null;
    }
  }
}
