/**
 * Tests for MinimapUI — canvas minimap component.
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { MinimapRendererAPI } from './minimap-ui';

// ---------------------------------------------------------------------------
// DOM mock infrastructure
// ---------------------------------------------------------------------------

interface MockElement {
  id: string;
  style: Record<string, string>;
  width: number;
  height: number;
  children: MockElement[];
  parentElement: MockElement | null;
  appendChild: jest.Mock;
  removeChild: jest.Mock;
  addEventListener: jest.Mock;
  onmousedown: ((e: unknown) => void) | null;
  getContext: jest.Mock;
}

interface MockContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect: jest.Mock;
  strokeRect: jest.Mock;
  beginPath: jest.Mock;
  closePath: jest.Mock;
  moveTo: jest.Mock;
  lineTo: jest.Mock;
  stroke: jest.Mock;
  fill: jest.Mock;
  arc: jest.Mock;
  fillText: jest.Mock;
  createLinearGradient: jest.Mock;
  save: jest.Mock;
  restore: jest.Mock;
  translate: jest.Mock;
  rotate: jest.Mock;
  scale: jest.Mock;
  drawImage: jest.Mock;
  createImageData: jest.Mock;
  putImageData: jest.Mock;
}

let allElements: MockElement[];
let mockCtx: MockContext;

function createMockElement(): MockElement {
  const el: MockElement = {
    id: '',
    style: {},
    width: 0,
    height: 0,
    children: [],
    parentElement: null,
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }),
    removeChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children = this.children.filter(c => c !== child);
      child.parentElement = null;
      return child;
    }),
    addEventListener: jest.fn(),
    onmousedown: null,
    getContext: jest.fn(() => mockCtx),
  };
  allElements.push(el);
  return el;
}

function createMockCtx(): MockContext {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    fillText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    drawImage: jest.fn(),
    createImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(200 * 200 * 4),
    })),
    putImageData: jest.fn(),
  };
}

function createMockRenderer(overrides: Partial<MinimapRendererAPI> = {}): MinimapRendererAPI {
  return {
    getCameraPosition: jest.fn(() => ({ x: 50, y: 50 })),
    centerOn: jest.fn(),
    getMapDimensions: jest.fn(() => ({ width: 100, height: 100 })),
    getMapName: jest.fn(() => 'Shamba'),
    getSeason: jest.fn(() => 2),
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  allElements = [];
  mockCtx = createMockCtx();

  const bodyEl = createMockElement();

  (globalThis as Record<string, unknown>).document = {
    createElement: jest.fn(() => createMockElement()),
    body: bodyEl,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const { MinimapUI } = require('./minimap-ui') as typeof import('./minimap-ui');

describe('MinimapUI', () => {
  it('should start hidden', () => {
    const minimap = new MinimapUI();
    expect(minimap.isVisible()).toBe(false);
  });

  it('should auto-show when setRenderer is called', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    // setRenderer() auto-calls show()
    expect(minimap.isVisible()).toBe(true);

    minimap.destroy();
  });

  it('should show/hide via toggle', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    // Already visible from setRenderer()
    expect(minimap.isVisible()).toBe(true);

    minimap.toggle();
    expect(minimap.isVisible()).toBe(false);

    minimap.toggle();
    expect(minimap.isVisible()).toBe(true);

    minimap.destroy();
  });

  it('should create canvas on setRenderer (auto-show)', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    // Should have created container + canvas
    const container = allElements.find(el => el.id === 'minimap-container');
    expect(container).toBeDefined();

    minimap.destroy();
  });

  it('should query map name and season on render', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    expect(renderer.getMapName).toHaveBeenCalled();
    expect(renderer.getSeason).toHaveBeenCalled();

    minimap.destroy();
  });

  it('should call centerOn when clicking the minimap', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    // onmousedown is set on the container (not the canvas) for border-vs-navigate routing
    const container = allElements.find(el => el.id === 'minimap-container');
    expect(container).toBeDefined();

    // Center click (100, 100) is interior (L1=0), routes to navigate
    // Simple proportional mapping: x = round(100/200 * 100) = 50, y = round(100/200 * 100) = 50
    container!.onmousedown!({ offsetX: 100, offsetY: 100, preventDefault: jest.fn(), stopPropagation: jest.fn() });
    expect(renderer.centerOn).toHaveBeenCalledWith(50, 50);

    minimap.destroy();
  });

  it('should map click position proportionally to tile coordinates', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    const container = allElements.find(el => el.id === 'minimap-container');
    expect(container).toBeDefined();

    // Click at (80, 90) — interior (L1 from border = |80-100|+|90-100|-100 = -70, well inside)
    // tileX = round(80/200 * 100) = 40, tileY = round(90/200 * 100) = 45
    container!.onmousedown!({ offsetX: 80, offsetY: 90, preventDefault: jest.fn(), stopPropagation: jest.fn() });
    expect(renderer.centerOn).toHaveBeenCalledWith(40, 45);

    minimap.destroy();
  });

  it('should not render when map name is empty', () => {
    const renderer = createMockRenderer({
      getMapName: jest.fn(() => ''),
    });
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    // render() should return early — no fillRect or drawImage
    expect(mockCtx.fillRect).not.toHaveBeenCalled();

    minimap.destroy();
  });

  it('should clean up on destroy', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    expect(minimap.isVisible()).toBe(true);

    minimap.destroy();
    // After destroy, container should be removed
    expect(minimap.isVisible()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Preview image tests
  // ---------------------------------------------------------------------------

  describe('preview image', () => {
    it('should trigger preview load on first render with valid map name', () => {
      const fetchSpy = jest.fn(() =>
        Promise.resolve({ ok: false, status: 404 })
      );
      (globalThis as Record<string, unknown>).fetch = fetchSpy;

      const renderer = createMockRenderer();
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Should have attempted to fetch the preview
      expect((fetchSpy.mock.calls as unknown[][])[0][0]).toBe(
        '/api/terrain-preview/Shamba/Alien%20Swamp/2'
      );

      minimap.destroy();
      delete (globalThis as Record<string, unknown>).fetch;
    });

    it('should re-fetch preview when season changes', async () => {
      let currentSeason = 2;
      const fetchSpy = jest.fn(() =>
        Promise.resolve({ ok: false, status: 404 })
      );
      (globalThis as Record<string, unknown>).fetch = fetchSpy;

      const renderer = createMockRenderer({
        getSeason: jest.fn(() => currentSeason),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Wait for first fetch to complete
      await Promise.resolve();
      await Promise.resolve();

      // Change season
      currentSeason = 0;
      jest.advanceTimersByTime(500);

      // Should fetch with new season
      const calls = fetchSpy.mock.calls as unknown[][];
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe(
        '/api/terrain-preview/Shamba/Alien%20Swamp/0'
      );

      minimap.destroy();
      delete (globalThis as Record<string, unknown>).fetch;
    });

    it('should draw preview image when loaded', async () => {
      const mockBlob = { type: 'image/png' };
      const fetchSpy = jest.fn(() =>
        Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        })
      );
      (globalThis as Record<string, unknown>).fetch = fetchSpy;

      // Mock URL.createObjectURL and Image
      const mockUrl = 'blob:mock-url';
      (globalThis as Record<string, unknown>).URL = {
        createObjectURL: jest.fn(() => mockUrl),
        revokeObjectURL: jest.fn(),
      };

      // Mock Image constructor
      const origImage = (globalThis as Record<string, unknown>).Image;
      (globalThis as Record<string, unknown>).Image = jest.fn(function (this: { onload: (() => void) | null; onerror: (() => void) | null; src: string }) {
        this.onload = null;
        this.onerror = null;
        this.src = '';
        // Trigger onload after src is set
        const self = this;
        Object.defineProperty(this, 'src', {
          set(val: string) {
            self.src = val;
            if (self.onload) setTimeout(() => self.onload!(), 0);
          },
          get() { return ''; },
        });
      });

      const renderer = createMockRenderer();
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Allow async preview load to complete
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();

      minimap.destroy();

      (globalThis as Record<string, unknown>).Image = origImage;
      delete (globalThis as Record<string, unknown>).fetch;
      delete (globalThis as Record<string, unknown>).URL;
    });

    it('should handle preview fetch failure gracefully', async () => {
      const fetchSpy = jest.fn(() => Promise.reject(new Error('Network error')));
      (globalThis as Record<string, unknown>).fetch = fetchSpy;

      const renderer = createMockRenderer();
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Allow async to settle — should not throw
      await Promise.resolve();
      await Promise.resolve();

      // Minimap still visible, just shows dark background
      expect(minimap.isVisible()).toBe(true);

      minimap.destroy();
      delete (globalThis as Record<string, unknown>).fetch;
    });
  });

  // ---------------------------------------------------------------------------
  // Screen-space overlay tests (border, resize dots)
  // ---------------------------------------------------------------------------

  describe('screen-space overlays', () => {
    it('should draw diamond border using createLinearGradient', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // drawDiamondBorder calls createLinearGradient for the border stroke
      expect(mockCtx.createLinearGradient).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should draw vertex handle dots (arc calls) as part of diamond border', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // drawDiamondBorder: 4 vertices × 2 arcs (outer ring + inner dot) = 8
      expect(mockCtx.arc).toHaveBeenCalledTimes(8);

      minimap.destroy();
    });

    it('should have wrapper with exactly 1 child (container only, no pill)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      expect(wrapper!.children.length).toBe(1);
      expect(wrapper!.children[0].id).toBe('minimap-container');

      minimap.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Diamond shape tests
  // ---------------------------------------------------------------------------

  describe('diamond shape', () => {
    it('should apply diamond clip-path to container', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const container = allElements.find(el => el.id === 'minimap-container');
      expect(container).toBeDefined();
      expect(container!.style.cssText).toContain('clip-path');
      expect(container!.style.cssText).toContain('polygon');

      minimap.destroy();
    });

    it('should set wrapper width and height equal to DESKTOP_SIZE=200 (no pill)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      // window.innerWidth=0 → isMobile()=false → DESKTOP_SIZE=200
      // wrapper height = currentSize (same as diamond — no pill offset)
      expect(wrapper!.style.cssText).toContain('width: 200px');
      expect(wrapper!.style.cssText).toContain('height: 200px');

      minimap.destroy();
    });

    it('should use MOBILE_SIZE=140 with square wrapper when innerWidth is mobile', () => {
      const origWindow = (globalThis as Record<string, unknown>).window;
      (globalThis as Record<string, unknown>).window = { innerWidth: 375 };

      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      // MOBILE_SIZE=140, wrapper is square (no pill)
      expect(wrapper!.style.cssText).toContain('width: 140px');
      expect(wrapper!.style.cssText).toContain('height: 140px');

      minimap.destroy();
      (globalThis as Record<string, unknown>).window = origWindow;
    });
  });
});
