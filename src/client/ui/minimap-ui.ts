/**
 * MinimapUI — Isometric terrain preview minimap with click-to-navigate.
 *
 * Fetches the server-generated terrain preview image (stitched from Z0 chunks)
 * and draws it scaled to fill a diamond-shaped canvas. Automatically refreshes
 * when the season changes.
 *
 * Interaction:
 *  - Click/tap inside → re-center main camera on that map position
 *
 * Layout:
 *  Desktop (≥ 640 px): top-left, shifts right when the left panel is open
 *  Mobile  (< 640 px): bottom-left, above the BottomNav safe area
 *
 * Size is controlled via Settings (Small / Medium / Large preset).
 */

import { useUiStore } from '../store/ui-store';
import type { MinimapSize } from '../store/game-store';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Renderer interface — only the subset MinimapUI needs. */
export interface MinimapRendererAPI {
  getCameraPosition(): { x: number; y: number };
  centerOn(x: number, y: number): void;
  getMapDimensions(): { width: number; height: number };
  getMapName(): string;
  getSeason(): number;
  getTerrainType(): string;
  getVisibleTileBounds(): { minI: number; maxI: number; minJ: number; maxJ: number };
}

// ---------------------------------------------------------------------------
// Layout & interaction constants
// ---------------------------------------------------------------------------

const DESKTOP_PAD   = 12;   // px — screen-edge gap (desktop)
const MOBILE_PAD    = 8;    // px — screen-edge gap (mobile)
const MOBILE_SIZE   = 140;  // px — fixed diamond size (mobile)
const MIN_SIZE      = 120;  // px — minimum size
const MAX_SIZE      = 500;  // px — maximum size
const MOBILE_BP     = 640;  // px — viewport width breakpoint
const UPDATE_MS     = 500;  // ms — render interval

/** Pixel sizes for each preset. */
const SIZE_MAP: Record<MinimapSize, number> = {
  small:  160,
  medium: 220,
  large:  320,
};

// CSS filter strings for the container's drop-shadow glow
const FILTER_BASE = 'drop-shadow(0 0 10px rgba(56,189,248,0.28)) drop-shadow(0 0 2px rgba(148,163,184,0.5)) drop-shadow(0 4px 12px rgba(0,0,0,0.70))';

// ---------------------------------------------------------------------------
// MinimapUI class
// ---------------------------------------------------------------------------

export class MinimapUI {
  private wrapper: HTMLElement | null   = null;
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private renderer: MinimapRendererAPI | null = null;

  private visible = false;
  private updateTimer: ReturnType<typeof setInterval> | null = null;

  /** Current diamond bounding-box side (always square). */
  private currentSize: number = SIZE_MAP.medium;

  private unsubPanel: (() => void) | null = null;

  /** Cached terrain preview image fetched from the server. */
  private previewImage: HTMLImageElement | null = null;
  private previewCacheKey = '';
  private previewLoading = false;
  private previewObjectUrl = '';

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  public setRenderer(renderer: MinimapRendererAPI): void {
    this.renderer = renderer;
    this.show();
  }

  public show(): void {
    if (this.visible) return;
    this.visible = true;
    this.ensureDOM();
    if (this.wrapper) this.wrapper.style.display = 'block';
    this.startUpdating();
  }

  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.wrapper) this.wrapper.style.display = 'none';
    this.stopUpdating();
  }

  public toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  public isVisible(): boolean {
    return this.visible;
  }

  /** Apply a size preset from Settings. Mobile ignores this. */
  public setSize(preset: MinimapSize): void {
    if (this.isMobile()) return;
    const px = SIZE_MAP[preset] ?? SIZE_MAP.medium;
    this.applySize(px);
  }

  public destroy(): void {
    this.visible = false;
    this.stopUpdating();
    if (this.unsubPanel) { this.unsubPanel(); this.unsubPanel = null; }
    if (this.wrapper?.parentElement) {
      this.wrapper.parentElement.removeChild(this.wrapper);
    }
    this.revokePreviewUrl();
    this.wrapper = null;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.previewImage = null;
    this.previewCacheKey = '';
  }

  // ---------------------------------------------------------------------------
  // Viewport helpers
  // ---------------------------------------------------------------------------

  private isMobile(): boolean {
    return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < MOBILE_BP;
  }

  // ---------------------------------------------------------------------------
  // Positioning
  // ---------------------------------------------------------------------------

  private applyPositioning(): void {
    if (!this.wrapper) return;
    if (this.isMobile()) {
      this.wrapper.style.top    = '';
      this.wrapper.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + 56px + ${MOBILE_PAD}px)`;
      this.wrapper.style.left   = `${MOBILE_PAD}px`;
    } else {
      this.wrapper.style.bottom = '';
      this.wrapper.style.top    = `${DESKTOP_PAD}px`;
      const panelOpen = useUiStore.getState().leftPanel !== null;
      if (panelOpen) {
        const w = getComputedStyle(document.documentElement)
          .getPropertyValue('--panel-width-desktop').trim() || '420px';
        this.wrapper.style.left = `calc(${w} + ${DESKTOP_PAD}px)`;
      } else {
        this.wrapper.style.left = `${DESKTOP_PAD}px`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DOM setup
  // ---------------------------------------------------------------------------

  private ensureDOM(): void {
    if (this.canvas) return;

    if (this.isMobile()) this.currentSize = MOBILE_SIZE;

    // ── Outer wrapper ─────────────────────────────────────────────────────────
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'minimap-wrapper';
    this.wrapper.style.cssText = `
      position: fixed;
      top: ${DESKTOP_PAD}px;
      left: ${DESKTOP_PAD}px;
      width: ${this.currentSize}px;
      height: ${this.currentSize}px;
      overflow: visible;
      z-index: 100;
      pointer-events: none;
      transition: left 250ms cubic-bezier(0.16,1,0.3,1),
                  bottom 250ms cubic-bezier(0.16,1,0.3,1);
    `;

    // ── Inner diamond container ────────────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      overflow: hidden;
      cursor: crosshair;
      background: #0f172a;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
      filter: ${FILTER_BASE};
      pointer-events: auto;
      transition: filter 200ms;
    `;

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width  = this.currentSize;
    this.canvas.height = this.currentSize;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');

    this.container.appendChild(this.canvas);
    this.wrapper.appendChild(this.container);

    // ── Interaction: click-to-navigate ───────────────────────────────────────
    this.attachInteractionListeners();

    // ── Position + panel subscription ─────────────────────────────────────────
    this.applyPositioning();
    this.unsubPanel = useUiStore.subscribe(() => this.applyPositioning());

    document.body.appendChild(this.wrapper);
  }

  // ---------------------------------------------------------------------------
  // Interaction: click navigate
  // ---------------------------------------------------------------------------

  private attachInteractionListeners(): void {
    if (!this.container) return;

    // ── Mouse: click → navigate ─────────────────────────────────────────────
    this.container.onmousedown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleClick(e.offsetX, e.offsetY);
    };

    // ── Touch: tap → navigate ───────────────────────────────────────────────
    this.container.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const rect = (this.container as HTMLElement & { getBoundingClientRect?(): DOMRect }).getBoundingClientRect?.();
      const ox = rect ? touch.clientX - rect.left : touch.clientX;
      const oy = rect ? touch.clientY - rect.top  : touch.clientY;
      this.handleClick(ox, oy);
    }, { passive: false });
  }

  // ---------------------------------------------------------------------------
  // Size helpers
  // ---------------------------------------------------------------------------

  private applySize(newSize: number): void {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newSize));
    this.currentSize = clamped;
    if (this.wrapper) {
      this.wrapper.style.width  = `${clamped}px`;
      this.wrapper.style.height = `${clamped}px`;
    }
    if (this.container) {
      this.container.style.width  = `${clamped}px`;
      this.container.style.height = `${clamped}px`;
    }
    if (this.canvas) {
      this.canvas.width  = clamped;
      this.canvas.height = clamped;
    }
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Periodic rendering
  // ---------------------------------------------------------------------------

  private startUpdating(): void {
    this.stopUpdating();
    this.render();
    this.updateTimer = setInterval(() => this.render(), UPDATE_MS);
  }

  private stopUpdating(): void {
    if (this.updateTimer !== null) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Preview image loading
  // ---------------------------------------------------------------------------

  private revokePreviewUrl(): void {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = '';
    }
  }

  private async loadPreview(mapName: string, season: number): Promise<void> {
    if (this.previewLoading) return;
    this.previewLoading = true;

    const terrainType = this.renderer?.getTerrainType() ?? 'Earth';
    const url = `/api/terrain-preview/${encodeURIComponent(mapName)}/${encodeURIComponent(terrainType)}/${season}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return;

      const blob = await response.blob();
      this.revokePreviewUrl();
      this.previewObjectUrl = URL.createObjectURL(blob);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to decode preview image'));
        img.src = this.previewObjectUrl;
      });

      this.previewImage = img;
      this.previewCacheKey = `${mapName}:${season}`;
      this.render();
    } catch {
      // Preview not available — minimap shows dark background
    } finally {
      this.previewLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private render(): void {
    if (!this.ctx || !this.renderer) return;

    const ctx = this.ctx;
    const mapName = this.renderer.getMapName();
    if (!mapName) return;

    // Check if preview needs (re)loading (season change or new map)
    const season = this.renderer.getSeason();
    const cacheKey = `${mapName}:${season}`;
    if (this.previewCacheKey !== cacheKey && !this.previewLoading) {
      this.loadPreview(mapName, season);
    }

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.currentSize, this.currentSize);

    // Draw preview image stretched to fill canvas
    if (this.previewImage) {
      ctx.drawImage(this.previewImage, 0, 0, this.currentSize, this.currentSize);
    }

    // Viewport indicator
    this.drawViewportIndicator(ctx);

    // Screen-space diamond border
    this.drawDiamondBorder(ctx);
  }

  // ---------------------------------------------------------------------------
  // Draw helpers
  // ---------------------------------------------------------------------------

  /**
   * Draw a gold/amber rectangle showing the currently visible area on the map.
   */
  private drawViewportIndicator(ctx: CanvasRenderingContext2D): void {
    if (!this.renderer) return;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    const bounds = this.renderer.getVisibleTileBounds();
    const scaleX = this.currentSize / dims.width;
    const scaleY = this.currentSize / dims.height;

    const x1 = bounds.minJ * scaleX;
    const y1 = bounds.minI * scaleY;
    const x2 = bounds.maxJ * scaleX;
    const y2 = bounds.maxI * scaleY;

    ctx.save();
    // Subtle fill
    ctx.fillStyle = 'rgba(245,158,11,0.10)';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    // Outline
    ctx.strokeStyle = 'rgba(245,158,11,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.restore();
  }

  /**
   * Diamond border drawn in screen space.
   *
   * Two layers for visual polish:
   *  1. Outer glow  — wide soft stroke in sky-blue
   *  2. Main edge   — crisp 2 px gradient stroke
   */
  private drawDiamondBorder(ctx: CanvasRenderingContext2D): void {
    const s  = this.currentSize;
    const cx = s / 2;
    const cy = s / 2;

    ctx.save();

    // Diamond path (inset 1 px so stroke doesn't clip)
    const drawPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx,     1);
      ctx.lineTo(s - 1,  cy);
      ctx.lineTo(cx,     s - 1);
      ctx.lineTo(1,      cy);
      ctx.closePath();
    };

    // Layer 1: outer glow
    drawPath();
    ctx.strokeStyle = 'rgba(56,189,248,0.20)';
    ctx.lineWidth   = 8;
    ctx.lineJoin    = 'miter';
    ctx.stroke();

    // Layer 2: crisp gradient edge
    drawPath();
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0,   'rgba(56,189,248,0.80)');
    grad.addColorStop(0.5, 'rgba(148,163,184,0.45)');
    grad.addColorStop(1,   'rgba(56,189,248,0.80)');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Click → navigate
  // ---------------------------------------------------------------------------

  private handleClick(pixelX: number, pixelY: number): void {
    if (!this.renderer) return;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    this.renderer.centerOn(
      Math.max(0, Math.min(dims.width  - 1, Math.round((pixelX / this.currentSize) * dims.width))),
      Math.max(0, Math.min(dims.height - 1, Math.round((pixelY / this.currentSize) * dims.height))),
    );
  }
}
