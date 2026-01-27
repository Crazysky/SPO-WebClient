/**
 * DebugOverlay
 *
 * On-screen debug overlay that displays real-time performance stats.
 * Shows FPS, frame time, draw calls, and object counts.
 *
 * Usage:
 *   const overlay = new DebugOverlay(renderer);
 *   overlay.show();
 *   // Later:
 *   overlay.hide();
 *   overlay.destroy();
 */

import { IsometricThreeRenderer } from './IsometricThreeRenderer';

export class DebugOverlay {
  private renderer: IsometricThreeRenderer;
  private overlayElement: HTMLDivElement | null = null;
  private updateInterval: number | null = null;
  private isVisible: boolean = false;

  constructor(renderer: IsometricThreeRenderer) {
    this.renderer = renderer;
    this.createOverlay();
  }

  /**
   * Create overlay DOM element
   */
  private createOverlay(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'three-debug-overlay';
    this.overlayElement.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 10px 15px;
      border-radius: 4px;
      border: 1px solid #00ff00;
      z-index: 10000;
      min-width: 250px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      display: none;
    `;
    document.body.appendChild(this.overlayElement);
  }

  /**
   * Update overlay content
   */
  private updateContent(): void {
    if (!this.overlayElement) return;

    const stats = this.renderer.getStats();
    const renderStats = this.renderer.getRenderStats();
    const cameraPos = this.renderer.getCameraPosition();
    const zoom = this.renderer.getZoom();

    // Determine FPS color
    let fpsColor = '#00ff00'; // Green
    if (stats.fps < 60) fpsColor = '#ffff00'; // Yellow
    if (stats.fps < 30) fpsColor = '#ff0000'; // Red

    // Determine frame time color
    let frameTimeColor = '#00ff00';
    if (stats.frameTime > 16.67) frameTimeColor = '#ffff00'; // Above 60 FPS
    if (stats.frameTime > 33.33) frameTimeColor = '#ff0000'; // Below 30 FPS

    this.overlayElement.innerHTML = `
      <div style="margin-bottom: 8px; font-weight: bold; color: #00ffff;">
        🚀 THREE.JS RENDERER
      </div>
      <div style="margin-bottom: 4px;">
        <span style="color: ${fpsColor}; font-weight: bold;">${stats.fps} FPS</span>
        <span style="color: ${frameTimeColor}; margin-left: 10px;">${stats.frameTime.toFixed(2)}ms</span>
      </div>
      <div style="margin-bottom: 4px;">
        Draw Calls: <span style="color: #ffffff;">${stats.drawCalls}</span>
      </div>
      <div style="border-top: 1px solid #004400; margin: 8px 0;"></div>
      <div style="margin-bottom: 4px;">
        Buildings: <span style="color: #ffffff;">${renderStats.buildings.visible}/${renderStats.buildings.total}</span>
        ${renderStats.buildings.texturesLoaded ? '✓' : '⏳'}
      </div>
      <div style="margin-bottom: 4px;">
        Terrain: <span style="color: #ffffff;">${renderStats.terrain.visibleChunks}/${renderStats.terrain.chunks}</span> chunks
      </div>
      <div style="margin-bottom: 4px;">
        Roads: <span style="color: #ffffff;">${renderStats.roads.meshes}</span> meshes
      </div>
      <div style="margin-bottom: 4px;">
        Concrete: <span style="color: #ffffff;">${renderStats.concrete.meshes}</span> meshes
      </div>
      <div style="border-top: 1px solid #004400; margin: 8px 0;"></div>
      <div style="margin-bottom: 4px;">
        Camera: <span style="color: #ffffff;">(${cameraPos.x.toFixed(0)}, ${cameraPos.y.toFixed(0)})</span>
      </div>
      <div style="margin-bottom: 4px;">
        Zoom: <span style="color: #ffffff;">${['0.25x', '0.5x', '1x', '2x'][zoom]}</span>
      </div>
    `;
  }

  /**
   * Show overlay
   */
  show(): void {
    if (this.isVisible) return;
    this.isVisible = true;

    if (this.overlayElement) {
      this.overlayElement.style.display = 'block';
    }

    // Update every 100ms for smooth stats
    this.updateInterval = window.setInterval(() => {
      this.updateContent();
    }, 100);

    // Initial update
    this.updateContent();
  }

  /**
   * Hide overlay
   */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;

    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Toggle overlay visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if overlay is visible
   */
  isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.hide();

    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
      this.overlayElement = null;
    }
  }
}

/**
 * Install debug overlay keyboard shortcut
 * Press 'D' key to toggle debug overlay
 */
export function installDebugOverlayShortcut(renderer: IsometricThreeRenderer): DebugOverlay {
  const overlay = new DebugOverlay(renderer);

  // Listen for 'D' key to toggle debug overlay
  document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        overlay.toggle();
        console.log(`[DebugOverlay] ${overlay.isShowing() ? 'Shown' : 'Hidden'}`);
      }
    }
  });

  return overlay;
}
