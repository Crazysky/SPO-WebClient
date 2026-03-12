/**
 * MinimapUI — Isometric terrain preview minimap with click-to-navigate.
 *
 * Fetches the server-generated terrain preview image (stitched from Z0 chunks)
 * and draws it scaled to fill a diamond-shaped canvas. Automatically refreshes
 * when the season changes.
 *
 * Interaction:
 *  - Click/tap inside  → re-center main camera on that map position
 *  - Click/tap border  → drag to resize the minimap (grab cursor, radial scaling)
 *
 * Layout:
 *  Desktop (≥ 640 px): top-left, shifts right when the left panel is open
 *  Mobile  (< 640 px): bottom-left, above the BottomNav safe area
 *
 * The border is the only resize affordance; no buttons are shown on the minimap.
 */

import { getTerrainTypeForMap } from '../../shared/map-config';
import { useUiStore } from '../store/ui-store';

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
}

// ---------------------------------------------------------------------------
// Layout & interaction constants
// ---------------------------------------------------------------------------

const DESKTOP_PAD   = 12;   // px — screen-edge gap (desktop)
const MOBILE_PAD    = 8;    // px — screen-edge gap (mobile)
const DESKTOP_SIZE  = 200;  // px — default diamond size (desktop)
const MOBILE_SIZE   = 140;  // px — default diamond size (mobile)
const MIN_SIZE      = 120;  // px — minimum size so the minimap cannot be accidentally hidden
const MAX_SIZE      = 500;  // px — maximum size
const MOBILE_BP     = 640;  // px — viewport width breakpoint
const UPDATE_MS     = 500;  // ms — render interval

/**
 * Hit zone for the border resize interaction.
 * Click within BORDER_HIT px of the diamond perimeter = resize intent.
 */
const BORDER_HIT = 14; // px

// CSS filter strings for the container's drop-shadow glow
const FILTER_BASE  = 'drop-shadow(0 0 10px rgba(56,189,248,0.28)) drop-shadow(0 0 2px rgba(148,163,184,0.5)) drop-shadow(0 4px 12px rgba(0,0,0,0.70))';
const FILTER_HOVER = 'drop-shadow(0 0 18px rgba(56,189,248,0.75)) drop-shadow(0 0 4px rgba(56,189,248,0.9))  drop-shadow(0 4px 16px rgba(0,0,0,0.80))';

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
  private currentSize: number = DESKTOP_SIZE;

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

    // ── Interaction: border-resize vs click-navigate ───────────────────────────
    this.attachInteractionListeners();

    // ── Position + panel subscription ─────────────────────────────────────────
    this.applyPositioning();
    this.unsubPanel = useUiStore.subscribe(() => this.applyPositioning());

    document.body.appendChild(this.wrapper);
  }

  // ---------------------------------------------------------------------------
  // Interaction: border resize + click navigate
  // ---------------------------------------------------------------------------

  /**
   * Returns true when (pixelX, pixelY) — in container-local coords — is within
   * BORDER_HIT pixels of the diamond perimeter.
   *
   * Diamond perimeter in L1 norm: |dx| + |dy| = size/2  (where dx,dy are offsets from center)
   */
  private isNearBorder(pixelX: number, pixelY: number): boolean {
    const half = this.currentSize / 2;
    const dx = Math.abs(pixelX - half);
    const dy = Math.abs(pixelY - half);
    return Math.abs(dx + dy - half) <= BORDER_HIT;
  }

  private attachInteractionListeners(): void {
    if (!this.container) return;

    // ── Mouse: hover feedback ──────────────────────────────────────────────────
    this.container.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.container) return;
      if (this.isNearBorder(e.offsetX, e.offsetY)) {
        this.container.style.cursor = 'grab';
        this.container.style.filter = FILTER_HOVER;
      } else {
        this.container.style.cursor = 'crosshair';
        this.container.style.filter = FILTER_BASE;
      }
    });

    this.container.addEventListener('mouseleave', () => {
      if (!this.container) return;
      this.container.style.cursor = 'crosshair';
      this.container.style.filter = FILTER_BASE;
    });

    // ── Mouse: click → resize or navigate ─────────────────────────────────────
    // Use onmousedown (not just addEventListener) so tests can invoke the handler directly.
    this.container.onmousedown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.isNearBorder(e.offsetX, e.offsetY)) {
        this.startMouseResize(e);
      } else {
        this.handleClick(e.offsetX, e.offsetY);
      }
    };

    // ── Touch: tap → navigate; border tap → resize ────────────────────────────
    this.container.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const rect = (this.container as HTMLElement & { getBoundingClientRect?(): DOMRect }).getBoundingClientRect?.();
      const ox = rect ? touch.clientX - rect.left : touch.clientX;
      const oy = rect ? touch.clientY - rect.top  : touch.clientY;
      // Border tap starts resize; interior tap navigates
      if (!this.isNearBorder(ox, oy)) {
        this.handleClick(ox, oy);
      }
    }, { passive: false });

    this.container.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const rect = (this.container as HTMLElement & { getBoundingClientRect?(): DOMRect }).getBoundingClientRect?.();
      const ox = rect ? touch.clientX - rect.left : touch.clientX;
      const oy = rect ? touch.clientY - rect.top  : touch.clientY;
      if (this.isNearBorder(ox, oy)) {
        e.preventDefault();
        e.stopPropagation();
        this.startTouchResize(e);
      }
    }, { passive: false });
  }

  // ---------------------------------------------------------------------------
  // Resize helpers
  // ---------------------------------------------------------------------------

  /**
   * Resize by tracking the mouse/touch distance from the diamond center.
   * newSize = 2 × distance-from-center (radial scaling).
   * All 4 diamond vertices are exactly at distance = currentSize/2 from center,
   * so dragging any vertex outward/inward naturally scales the minimap.
   */
  private startMouseResize(startEvent: MouseEvent): void {
    // Capture center in page coordinates at drag start
    const centerX = startEvent.clientX - startEvent.offsetX + this.currentSize / 2;
    const centerY = startEvent.clientY - startEvent.offsetY + this.currentSize / 2;

    if (this.container) this.container.style.cursor = 'grabbing';

    const onMove = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
      this.applySize(Math.round(dist * 2));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (this.container) this.container.style.cursor = 'crosshair';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private startTouchResize(startEvent: TouchEvent): void {
    if (startEvent.touches.length === 0) return;
    const rect = (this.container as HTMLElement & { getBoundingClientRect?(): DOMRect }).getBoundingClientRect?.();
    const centerX = rect
      ? rect.left + this.currentSize / 2
      : startEvent.touches[0].clientX; // fallback for test env
    const centerY = rect
      ? rect.top + this.currentSize / 2
      : startEvent.touches[0].clientY;

    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - centerX, e.touches[0].clientY - centerY);
      this.applySize(Math.round(dist * 2));
    };
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

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

    const terrainType = getTerrainTypeForMap(mapName);
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

    // Screen-space diamond border
    this.drawDiamondBorder(ctx);
  }

  // ---------------------------------------------------------------------------
  // Draw helpers
  // ---------------------------------------------------------------------------

  /**
   * Diamond border drawn in screen space.
   *
   * Three layers to communicate "this edge is interactive":
   *  1. Outer glow  — wide soft stroke in sky-blue
   *  2. Main edge   — crisp 2 px gradient stroke
   *  3. Vertex dots — small filled circles at each vertex (resize handle affordance)
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

    // Layer 3: vertex handle dots (resize affordance indicator)
    const vertices: [number, number][] = [[cx, 3], [s - 3, cy], [cx, s - 3], [3, cy]];
    for (const [vx, vy] of vertices) {
      // Outer ring
      ctx.beginPath();
      ctx.arc(vx, vy, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15,23,42,0.80)';
      ctx.fill();
      // Inner dot
      ctx.beginPath();
      ctx.arc(vx, vy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56,189,248,0.90)';
      ctx.fill();
    }

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
