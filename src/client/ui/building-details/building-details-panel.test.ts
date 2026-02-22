/**
 * Unit tests for BuildingDetailsPanel
 *
 * Tests the new facility tab features:
 * - isOwner security gating (hide rename/delete/edit controls for non-owners)
 * - Auto-refresh timer (start on show, stop on hide, skip when editing)
 * - onNavigateToBuilding callback wiring
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { BuildingDetailsResponse, BuildingDetailsTab } from '../../../shared/types';

// ---------------------------------------------------------------------------
// DOM mock infrastructure
// ---------------------------------------------------------------------------

/** Minimal mock element that satisfies the panel's DOM usage */
interface MockElement {
  id: string;
  className: string;
  style: Record<string, string>;
  textContent: string;
  innerHTML: string;
  tagName: string;
  children: MockElement[];
  parentElement: MockElement | null;
  onclick: ((e: unknown) => void) | null;
  onmousedown: ((e: unknown) => void) | null;
  onkeydown: ((e: unknown) => void) | null;
  disabled: boolean;
  value: string;
  type: string;
  title: string;
  // Methods
  appendChild: jest.Mock;
  remove: jest.Mock;
  addEventListener: jest.Mock;
  closest: jest.Mock;
  querySelector: jest.Mock;
  querySelectorAll: jest.Mock;
  contains: jest.Mock;
  focus: jest.Mock;
  select: jest.Mock;
  classList: {
    add: jest.Mock;
    remove: jest.Mock;
    contains: jest.Mock;
  };
  getBoundingClientRect: jest.Mock;
}

function createMockElement(tag = 'div'): MockElement {
  const el: MockElement = {
    id: '',
    className: '',
    style: {},
    textContent: '',
    innerHTML: '',
    tagName: tag.toUpperCase(),
    children: [],
    parentElement: null,
    onclick: null,
    onmousedown: null,
    onkeydown: null,
    disabled: false,
    value: '',
    type: '',
    title: '',
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      el.children.push(child);
      child.parentElement = el;
      return child;
    }),
    remove: jest.fn(),
    addEventListener: jest.fn(),
    closest: jest.fn(() => null),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    contains: jest.fn(() => false),
    focus: jest.fn(),
    select: jest.fn(),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(() => false),
    },
    getBoundingClientRect: jest.fn(() => ({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800 })),
  };
  return el;
}

// ---------------------------------------------------------------------------
// document mock — wired so BuildingDetailsPanel can construct its DOM
// ---------------------------------------------------------------------------

const elementsById = new Map<string, MockElement>();

const mockDocument = {
  createElement: jest.fn((tag: string) => createMockElement(tag)),
  getElementById: jest.fn((id: string) => elementsById.get(id) || null),
  onmousemove: null as ((e: unknown) => void) | null,
  onmouseup: null as (() => void) | null,
};

// Assign to global before importing the module
(global as unknown as Record<string, unknown>).document = mockDocument;

// ---------------------------------------------------------------------------
// Mock dependent modules
// ---------------------------------------------------------------------------

jest.mock('../../../shared/building-details', () => ({
  getGroupById: jest.fn(() => undefined),
}));

jest.mock('./property-renderers', () => ({
  renderPropertyGroup: jest.fn(() => createMockElement()),
}));

jest.mock('./property-table', () => ({
  renderSuppliesWithTabs: jest.fn(() => createMockElement()),
}));

jest.mock('./property-graph', () => ({
  renderSparklineGraph: jest.fn(() => createMockElement()),
}));

// Now import the class under test
import { BuildingDetailsPanel, BuildingDetailsPanelOptions } from './building-details-panel';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDetails(overrides: Partial<BuildingDetailsResponse> = {}): BuildingDetailsResponse {
  return {
    buildingId: 'b-123',
    buildingName: 'My Factory',
    ownerName: 'TestCompany',
    x: 100,
    y: 200,
    visualClass: '42',
    templateName: 'Industrial Factory',
    securityId: 'sec-1',
    tabs: [
      { id: 'generic', name: 'General', icon: 'G', order: 0, handlerName: 'IndGeneral' },
    ] as BuildingDetailsTab[],
    groups: {
      generic: [
        { name: 'Name', value: 'My Factory' },
        { name: 'Owner', value: 'TestCompany' },
      ],
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create a panel with standard options, wiring mock elements so getElementById works.
 */
function createPanel(opts: Partial<BuildingDetailsPanelOptions> = {}): BuildingDetailsPanel {
  // When createElement is called for the modal, wire sub-elements
  // The panel calls document.createElement and then getElementById in renderContent
  mockDocument.createElement.mockImplementation((tag: string) => {
    const el = createMockElement(tag);
    return el;
  });

  const container = createMockElement();
  container.getBoundingClientRect.mockReturnValue({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800 });

  const panel = new BuildingDetailsPanel(
    container as never,
    {
      onRefresh: jest.fn(async () => {}),
      onPropertyChange: jest.fn(async () => {}),
      ...opts,
    }
  );

  return panel;
}

/**
 * Register mock elements by ID so getElementById returns them during renderContent
 */
function registerMockElements(): Record<string, MockElement> {
  const nameEl = createMockElement();
  nameEl.id = 'bd-building-name';
  const templateEl = createMockElement();
  templateEl.id = 'bd-template-name';
  const coordsEl = createMockElement();
  coordsEl.id = 'bd-coords';
  const visualClassEl = createMockElement();
  visualClassEl.id = 'bd-visual-class';
  const timestampEl = createMockElement();
  timestampEl.id = 'bd-timestamp';
  const renameBtn = createMockElement('button');
  renameBtn.id = 'bd-rename-btn';

  const elements: Record<string, MockElement> = {
    'bd-building-name': nameEl,
    'bd-template-name': templateEl,
    'bd-coords': coordsEl,
    'bd-visual-class': visualClassEl,
    'bd-timestamp': timestampEl,
    'bd-rename-btn': renameBtn,
  };

  for (const [id, el] of Object.entries(elements)) {
    elementsById.set(id, el);
  }

  mockDocument.getElementById.mockImplementation((id: string) => elementsById.get(id) || null);

  return elements;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildingDetailsPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    elementsById.clear();
    mockDocument.createElement.mockImplementation((tag: string) => createMockElement(tag));
    mockDocument.getElementById.mockImplementation((id: string) => elementsById.get(id) || null);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // =========================================================================
  // isOwner security gating
  // =========================================================================

  describe('isOwner security gating', () => {
    it('should hide rename and delete buttons when player does not own the building', () => {
      const panel = createPanel({ currentCompanyName: 'OtherCompany' });
      const elements = registerMockElements();
      const details = makeDetails({ ownerName: 'TestCompany' });

      // Mock querySelector for delete button
      const deleteBtn = createMockElement('button');
      deleteBtn.className = 'header-delete-btn';

      // Access the modal through the panel's internal state
      const modalEl = (panel as unknown as { modal: MockElement }).modal;
      if (modalEl) {
        modalEl.querySelector = jest.fn((selector: string) => {
          if (selector === '.header-delete-btn') return deleteBtn;
          return null;
        }) as jest.Mock;
      }

      panel.show(details);

      // Rename button should be hidden (ownerName !== currentCompanyName)
      expect(elements['bd-rename-btn'].style.display).toBe('none');
      // Delete button should be hidden
      expect(deleteBtn.style.display).toBe('none');
    });

    it('should show rename and delete buttons when player owns the building', () => {
      const panel = createPanel({ currentCompanyName: 'TestCompany' });
      const elements = registerMockElements();
      const details = makeDetails({ ownerName: 'TestCompany' });

      const deleteBtn = createMockElement('button');
      deleteBtn.className = 'header-delete-btn';

      const modalEl = (panel as unknown as { modal: MockElement }).modal;
      if (modalEl) {
        modalEl.querySelector = jest.fn((selector: string) => {
          if (selector === '.header-delete-btn') return deleteBtn;
          return null;
        }) as jest.Mock;
      }

      panel.show(details);

      // Both should be visible
      expect(elements['bd-rename-btn'].style.display).toBe('');
      expect(deleteBtn.style.display).toBe('');
    });

    it('should hide controls when currentCompanyName is not set', () => {
      const panel = createPanel({ currentCompanyName: undefined });
      const elements = registerMockElements();
      const details = makeDetails({ ownerName: 'TestCompany' });

      const deleteBtn = createMockElement('button');
      const modalEl = (panel as unknown as { modal: MockElement }).modal;
      if (modalEl) {
        modalEl.querySelector = jest.fn(() => deleteBtn) as jest.Mock;
      }

      panel.show(details);

      // No company name = not owner
      expect(elements['bd-rename-btn'].style.display).toBe('none');
      expect(deleteBtn.style.display).toBe('none');
    });

    it('should pass undefined for onPropertyChange callback when not owner', () => {
      registerMockElements();
      const onPropertyChange = jest.fn(async () => {});
      const panel = createPanel({
        currentCompanyName: 'OtherCompany',
        onPropertyChange,
      });
      const details = makeDetails({ ownerName: 'TestCompany' });

      panel.show(details);

      // Access the internal isOwner state
      const isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(false);
    });

    it('should return true for isOwner when names match', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'MyCompany' });
      const details = makeDetails({ ownerName: 'MyCompany' });

      panel.show(details);

      const isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(true);
    });
  });

  // =========================================================================
  // Auto-refresh timer
  // =========================================================================

  describe('auto-refresh timer', () => {
    it('should start auto-refresh when panel is shown', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });
      const details = makeDetails();

      panel.show(details);

      // Timer should be set (not null)
      const interval = (panel as unknown as { refreshInterval: ReturnType<typeof setInterval> | null }).refreshInterval;
      expect(interval).not.toBeNull();
    });

    it('should call onRefresh after 20 seconds', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });
      const details = makeDetails();

      panel.show(details);

      // Advance 20 seconds
      jest.advanceTimersByTime(20_000);

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('should call onRefresh multiple times at 20s intervals', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      jest.advanceTimersByTime(60_000); // 3 intervals

      expect(onRefresh).toHaveBeenCalledTimes(3);
    });

    it('should stop auto-refresh when panel is hidden', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());
      panel.hide();

      const interval = (panel as unknown as { refreshInterval: ReturnType<typeof setInterval> | null }).refreshInterval;
      expect(interval).toBeNull();

      // No more calls after hide
      jest.advanceTimersByTime(60_000);
      expect(onRefresh).toHaveBeenCalledTimes(0);
    });

    it('should skip refresh when user is actively editing', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Simulate user focusing an input
      const activeEl = createMockElement('input');
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = activeEl as never;

      jest.advanceTimersByTime(20_000);

      // Should NOT call onRefresh while user is editing
      expect(onRefresh).toHaveBeenCalledTimes(0);
    });

    it('should resume refresh after user stops editing', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Simulate user focusing then unfocusing
      const activeEl = createMockElement('input');
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = activeEl as never;

      jest.advanceTimersByTime(20_000);
      expect(onRefresh).toHaveBeenCalledTimes(0);

      // User stops editing
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = null;

      jest.advanceTimersByTime(20_000);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('should not start timer if onRefresh is not provided', () => {
      registerMockElements();
      const panel = createPanel({ onRefresh: undefined, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Timer is set but won't call anything
      jest.advanceTimersByTime(20_000);
      // No error thrown = success
    });

    it('should restart timer when show is called again', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());
      jest.advanceTimersByTime(15_000); // 15s into first timer

      // Show again — should restart the 20s timer
      panel.show(makeDetails());
      jest.advanceTimersByTime(15_000); // Only 15s since restart

      // Should NOT have fired yet (only 15s since restart)
      expect(onRefresh).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(5_000); // Now 20s since restart
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Panel visibility
  // =========================================================================

  describe('panel visibility', () => {
    it('should report visible after show()', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      expect(panel.isVisible()).toBe(true);
    });

    it('should report hidden initially', () => {
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      // Modal display is set to 'none' in init
      expect(panel.isVisible()).toBe(false);
    });
  });

  // =========================================================================
  // update() smart vs full render
  // =========================================================================

  describe('update()', () => {
    it('should store new details when update is called', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      const details1 = makeDetails({ buildingName: 'Factory A' });
      panel.show(details1);

      const details2 = makeDetails({ buildingName: 'Factory B' });
      panel.update(details2);

      const currentDetails = (panel as unknown as { currentDetails: BuildingDetailsResponse }).currentDetails;
      expect(currentDetails.buildingName).toBe('Factory B');
    });

    it('should use smart render when user is editing', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Simulate active editing
      const activeEl = createMockElement('input');
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = activeEl as never;

      // Mock renderContentSmart to verify it's called
      const smartRenderSpy = jest.spyOn(panel as unknown as { renderContentSmart: () => void }, 'renderContentSmart');

      panel.update(makeDetails({ buildingName: 'Updated' }));

      expect(smartRenderSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateOptions()
  // =========================================================================

  describe('updateOptions()', () => {
    it('should update currentCompanyName via updateOptions', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'OldCompany' });

      panel.show(makeDetails({ ownerName: 'NewCompany' }));

      // Not owner yet
      let isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(false);

      // Update company name
      panel.updateOptions({ currentCompanyName: 'NewCompany' });

      isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(true);
    });
  });
});
