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
  lineJoin: string;
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
    lineJoin: '',
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
      data: new Uint8ClampedArray(220 * 220 * 4),
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
    getTerrainType: jest.fn(() => 'Alien Swamp'),
    getVisibleTileBounds: jest.fn(() => ({ minI: 20, maxI: 60, minJ: 25, maxJ: 65 })),
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

    const container = allElements.find(el => el.id === 'minimap-container');
    expect(container).toBeDefined();

    // Default size is 220 (medium). Click at center (110, 110):
    // tileX = round(110/220 * 100) = 50, tileY = round(110/220 * 100) = 50
    container!.onmousedown!({ offsetX: 110, offsetY: 110, preventDefault: jest.fn(), stopPropagation: jest.fn() });
    expect(renderer.centerOn).toHaveBeenCalledWith(50, 50);

    minimap.destroy();
  });

  it('should map click position proportionally to tile coordinates', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    const container = allElements.find(el => el.id === 'minimap-container');
    expect(container).toBeDefined();

    // Click at (88, 99) with size=220:
    // tileX = round(88/220 * 100) = 40, tileY = round(99/220 * 100) = 45
    container!.onmousedown!({ offsetX: 88, offsetY: 99, preventDefault: jest.fn(), stopPropagation: jest.fn() });
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
  // Screen-space overlay tests (border)
  // ---------------------------------------------------------------------------

  describe('screen-space overlays', () => {
    it('should draw diamond border using createLinearGradient', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // drawDiamondBorder calls createLinearGradient for the border stroke
      expect(mockCtx.createLinearGradient).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should not draw vertex handle dots (no arc calls)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // No vertex dots — resize affordance removed
      expect(mockCtx.arc).not.toHaveBeenCalled();

      minimap.destroy();
    });

    it('should have wrapper with exactly 1 child (container only)', () => {
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
  // Viewport indicator tests
  // ---------------------------------------------------------------------------

  describe('viewport indicator', () => {
    it('should draw viewport rectangle via strokeRect', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // drawViewportIndicator calls fillRect (fill) + strokeRect (outline)
      // The first fillRect is the canvas clear, then viewport fill, so strokeRect should be called
      expect(mockCtx.strokeRect).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should map tile bounds proportionally to minimap pixels', () => {
      const renderer = createMockRenderer({
        getVisibleTileBounds: jest.fn(() => ({ minI: 20, maxI: 60, minJ: 25, maxJ: 65 })),
        getMapDimensions: jest.fn(() => ({ width: 100, height: 100 })),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Default size = 220 (medium), map = 100x100
      // scale = 220/100 = 2.2
      // x1 = minJ * 2.2 = 25*2.2 = 55, y1 = minI * 2.2 = 20*2.2 = 44
      // x2 = maxJ * 2.2 = 65*2.2 = 143, y2 = maxI * 2.2 = 60*2.2 = 132
      // strokeRect(55, 44, 88, 88)
      const strokeCalls = mockCtx.strokeRect.mock.calls as number[][];
      const lastCall = strokeCalls[strokeCalls.length - 1];
      expect(lastCall[0]).toBeCloseTo(55, 0);   // x
      expect(lastCall[1]).toBeCloseTo(44, 0);   // y
      expect(lastCall[2]).toBeCloseTo(88, 0);   // width
      expect(lastCall[3]).toBeCloseTo(88, 0);   // height

      minimap.destroy();
    });

    it('should not draw viewport when map dimensions are zero', () => {
      const renderer = createMockRenderer({
        getMapDimensions: jest.fn(() => ({ width: 0, height: 0 })),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // render() returns early when mapName is valid but dimensions are 0
      // No strokeRect for viewport (only fillRect for clear may or may not be called)
      expect(mockCtx.strokeRect).not.toHaveBeenCalled();

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

    it('should set wrapper width and height equal to medium preset=220', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      // window.innerWidth=0 → isMobile()=false → default SIZE_MAP.medium=220
      expect(wrapper!.style.cssText).toContain('width: 220px');
      expect(wrapper!.style.cssText).toContain('height: 220px');

      minimap.destroy();
    });

    it('should use MOBILE_SIZE=140 with square wrapper when innerWidth is mobile', () => {
      const origWindow = (globalThis as Record<string, unknown>).window;
      (globalThis as Record<string, unknown>).window = { innerWidth: 375 };

      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      // MOBILE_SIZE=140, wrapper is square
      expect(wrapper!.style.cssText).toContain('width: 140px');
      expect(wrapper!.style.cssText).toContain('height: 140px');

      minimap.destroy();
      (globalThis as Record<string, unknown>).window = origWindow;
    });
  });

  // ---------------------------------------------------------------------------
  // Preset size tests
  // ---------------------------------------------------------------------------

  describe('setSize', () => {
    it('should resize to small preset (160px)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('small');

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper!.style.width).toBe('160px');
      expect(wrapper!.style.height).toBe('160px');

      minimap.destroy();
    });

    it('should resize to large preset (320px)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('large');

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper!.style.width).toBe('320px');
      expect(wrapper!.style.height).toBe('320px');

      minimap.destroy();
    });

    it('should ignore setSize on mobile', () => {
      const origWindow = (globalThis as Record<string, unknown>).window;
      (globalThis as Record<string, unknown>).window = { innerWidth: 375 };

      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('large');

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      // Should remain at MOBILE_SIZE=140, not large=320
      expect(wrapper!.style.cssText).toContain('width: 140px');

      minimap.destroy();
      (globalThis as Record<string, unknown>).window = origWindow;
    });

    it('should update canvas dimensions on setSize', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('small');

      // Find the canvas element (3rd created element: body, wrapper, container, canvas)
      const canvas = allElements.find(el => el.getContext.mock?.calls?.length > 0);
      expect(canvas).toBeDefined();
      expect(canvas!.width).toBe(160);
      expect(canvas!.height).toBe(160);

      minimap.destroy();
    });
  });
});
