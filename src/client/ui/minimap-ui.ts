/**
 * MinimapUI — Top-down terrain colormap minimap with diamond frame.
 *
 * Uses terrain pixel data from the renderer to build a client-side colormap.
 * The terrain grid is drawn rotated 45° to match the isometric view orientation:
 *   - Top vertex    = tile (0, 0)
 *   - Right vertex  = tile (0, maxJ)
 *   - Bottom vertex = tile (maxI, maxJ)
 *   - Left vertex   = tile (maxI, 0)
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
  getTerrainPixelData(): { pixelData: Uint8Array; width: number; height: number } | null;
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

/** Fraction of diamond size reserved as padding on each side. */
const DIAMOND_PAD = 0.06;

/** Max colormap resolution (tiles per side). */
const COLORMAP_MAX = 128;

const COS45 = Math.SQRT2 / 2;

/**
 * LandClass → RGB color for the minimap.
 * Index: 0=ZoneA (Grass), 1=ZoneB (MidGrass), 2=ZoneC (DryGround), 3=ZoneD (Water)
 */
const TERRAIN_COLORS: [number, number, number][] = [
  [74, 140, 82],    // Grass — green
  [128, 140, 68],   // MidGrass — olive
  [180, 148, 90],   // DryGround — sandy brown
  [24, 56, 90],     // Water — deep blue
];

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

  /** Cached downsampled terrain colormap canvas. */
  private terrainCanvas: HTMLCanvasElement | null = null;
  private terrainCacheKey = '';

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
    this.wrapper = null;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.terrainCanvas = null;
    this.terrainCacheKey = '';
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
  // Terrain colormap — built from pixel data, cached until map changes
  // ---------------------------------------------------------------------------

  private buildTerrainColormap(): void {
    if (!this.renderer) return;
    const data = this.renderer.getTerrainPixelData();
    if (!data) return;

    const { pixelData, width, height } = data;
    const mapName = this.renderer.getMapName();
    const key = `${mapName}:${width}:${height}`;
    if (this.terrainCacheKey === key && this.terrainCanvas) return;

    // Downsample to COLORMAP_MAX on the largest side
    const ds = Math.max(1, Math.ceil(Math.max(width, height) / COLORMAP_MAX));
    const cw = Math.ceil(width / ds);
    const ch = Math.ceil(height / ds);

    const offscreen = document.createElement('canvas');
    offscreen.width = cw;
    offscreen.height = ch;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(cw, ch);
    const px = imgData.data;

    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) {
        const sx = Math.min(dx * ds, width - 1);
        const sy = Math.min(dy * ds, height - 1);
        const landId = pixelData[sy * width + sx];
        const landClass = (landId >> 6) & 3;
        const [r, g, b] = TERRAIN_COLORS[landClass];
        const idx = (dy * cw + dx) * 4;
        px[idx]     = r;
        px[idx + 1] = g;
        px[idx + 2] = b;
        px[idx + 3] = 255;
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    this.terrainCanvas = offscreen;
    this.terrainCacheKey = key;
  }

  // ---------------------------------------------------------------------------
  // Transform helpers
  // ---------------------------------------------------------------------------

  /** Scale factor for terrain canvas → minimap canvas (with rotation and padding). */
  private getTerrainScale(): number {
    if (!this.terrainCanvas) return 1;
    const tW = this.terrainCanvas.width;
    const tH = this.terrainCanvas.height;
    const diagonal = Math.sqrt(tW * tW + tH * tH);
    const padPx = this.currentSize * DIAMOND_PAD;
    return (this.currentSize - 2 * padPx) / diagonal;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private render(): void {
    if (!this.ctx || !this.renderer) return;

    const mapName = this.renderer.getMapName();
    if (!mapName) return;

    // Build terrain colormap on first render (or if map changes)
    if (!this.terrainCanvas) this.buildTerrainColormap();

    const ctx = this.ctx;
    const s = this.currentSize;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, s, s);

    if (this.terrainCanvas) {
      const tW = this.terrainCanvas.width;
      const tH = this.terrainCanvas.height;
      const scale = this.getTerrainScale();

      // Draw terrain rotated 45° so the grid diamond aligns with the clip-path diamond
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.rotate(Math.PI / 4);
      ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.terrainCanvas, -tW / 2, -tH / 2);

      // Viewport indicator — drawn in the same rotated/scaled terrain space
      this.drawViewportInGrid(ctx, scale);

      ctx.restore();
    }

    // Screen-space diamond border (drawn after restore, in screen coords)
    this.drawDiamondBorder(ctx);
  }

  // ---------------------------------------------------------------------------
  // Draw helpers
  // ---------------------------------------------------------------------------

  /**
   * Draw the viewport indicator rectangle in terrain grid space.
   * Since the context is already transformed (translate + rotate + scale),
   * we can draw in terrain-canvas coordinates directly.
   */
  private drawViewportInGrid(ctx: CanvasRenderingContext2D, scale: number): void {
    if (!this.renderer || !this.terrainCanvas) return;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    const bounds = this.renderer.getVisibleTileBounds();
    const tW = this.terrainCanvas.width;
    const tH = this.terrainCanvas.height;

    // Map tile bounds → colormap coordinates (centered at origin since canvas is shifted by -tW/2,-tH/2)
    const scaleX = tW / dims.width;
    const scaleY = tH / dims.height;

    const x1 = bounds.minJ * scaleX - tW / 2;
    const y1 = bounds.minI * scaleY - tH / 2;
    const w  = (bounds.maxJ - bounds.minJ) * scaleX;
    const h  = (bounds.maxI - bounds.minI) * scaleY;

    ctx.fillStyle = 'rgba(245,158,11,0.12)';
    ctx.fillRect(x1, y1, w, h);

    // Adjust lineWidth for current scale so it appears ~1.5px on screen
    ctx.strokeStyle = 'rgba(245,158,11,0.85)';
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeRect(x1, y1, w, h);
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
    if (!this.renderer || !this.terrainCanvas) return;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    const s = this.currentSize;
    const tW = this.terrainCanvas.width;
    const tH = this.terrainCanvas.height;
    const scale = this.getTerrainScale();

    // Reverse transform: minimap pixel → terrain grid coordinate
    // 1. Undo translate (center of canvas)
    const dx = pixelX - s / 2;
    const dy = pixelY - s / 2;

    // 2. Undo rotate (-45°): cos(-45°) = cos45, sin(-45°) = -cos45
    const rx =  dx * COS45 + dy * COS45;
    const ry = -dx * COS45 + dy * COS45;

    // 3. Undo scale + centering offset
    const terrainX = rx / scale + tW / 2;
    const terrainY = ry / scale + tH / 2;

    // 4. Scale from colormap coords to tile coords
    const tileJ = (terrainX / tW) * dims.width;
    const tileI = (terrainY / tH) * dims.height;

    this.renderer.centerOn(
      Math.max(0, Math.min(dims.width  - 1, Math.round(tileJ))),
      Math.max(0, Math.min(dims.height - 1, Math.round(tileI))),
    );
  }
}
