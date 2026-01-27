/**
 * Renderer Settings
 *
 * Controls which rendering engine to use: Canvas2D or Three.js WebGL
 */

export type RendererType = 'canvas2d' | 'threejs';

export interface RendererSettings {
  /**
   * Renderer type to use
   * - 'canvas2d': Original Canvas2D renderer
   * - 'threejs': New Three.js WebGL renderer (GPU-accelerated)
   */
  rendererType: RendererType;

  /**
   * Enable debug mode (FPS counter, performance stats)
   */
  enableDebug: boolean;

  /**
   * Show debug overlay on startup (Three.js only)
   * Press 'D' key to toggle
   */
  showDebugOverlay: boolean;
}

/**
 * Default renderer settings
 *
 * CHANGE THIS TO TOGGLE BETWEEN RENDERERS
 */
const defaultSettings: RendererSettings = {
  // Use 'canvas2d' for original renderer, 'threejs' for new WebGL renderer
  rendererType: 'threejs', // <-- CHANGE THIS TO SWITCH RENDERERS

  // Enable debug mode in development
  enableDebug: process.env.NODE_ENV === 'development',

  // Show debug overlay on startup (only in Three.js mode)
  showDebugOverlay: false
};

/**
 * Get current renderer settings
 */
export function getRendererSettings(): RendererSettings {
  // Could load from localStorage in the future for user preferences
  return { ...defaultSettings };
}

/**
 * Save renderer settings (for future use)
 */
export function saveRendererSettings(settings: RendererSettings): void {
  // Could save to localStorage for persistence
  console.log('[RendererSettings] Settings updated:', settings);
}
