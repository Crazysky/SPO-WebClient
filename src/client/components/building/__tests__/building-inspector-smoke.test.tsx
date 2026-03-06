/**
 * Smoke tests for the Building Inspector component tree.
 *
 * These tests verify that components render without crashing —
 * the minimum bar that prevents "component throws on mount" regressions.
 * They run in jsdom and use @testing-library/react.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../../../__tests__/setup/render-helpers';
import { useBuildingStore } from '../../../store/building-store';
import { BuildingInspector } from '../BuildingInspector';
import { QuickStats } from '../QuickStats';
import { InspectorTabs } from '../InspectorTabs';
import { ActionBar } from '../ActionBar';
import type { BuildingFocusInfo, BuildingDetailsResponse, BuildingDetailsTab } from '@/shared/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockFocus: BuildingFocusInfo = {
  buildingId: 'bld-1',
  buildingName: 'Small Factory',
  ownerName: 'TestCo',
  salesInfo: '$1,200',
  revenue: '$500',
  detailsText: 'Producing goods',
  hintsText: 'Running well',
  x: 100,
  y: 200,
  xsize: 2,
  ysize: 2,
  visualClass: '300',
};

const mockTabs: BuildingDetailsTab[] = [
  { id: 'general', name: 'GENERAL', order: 0, icon: 'G', handlerName: 'SrvGeneral' },
  { id: 'supplies', name: 'SUPPLIES', order: 1, icon: 'S', handlerName: 'compInputs' },
];

const mockDetails: BuildingDetailsResponse = {
  buildingId: 'bld-1',
  x: 100,
  y: 200,
  visualClass: '300',
  templateName: 'SrvGeneral',
  buildingName: 'Small Factory',
  ownerName: 'TestCo',
  securityId: 'sec-1',
  tabs: mockTabs,
  groups: {
    general: [
      { name: 'Trouble', value: '0' },
      { name: 'Workers', value: '25' },
    ],
    supplies: [],
  },
  timestamp: Date.now(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildingInspector smoke tests', () => {
  beforeEach(() => {
    resetStores();
  });

  it('renders empty state when no building is focused', () => {
    const { container } = renderWithProviders(<BuildingInspector />);
    expect(container.textContent).toContain('Click a building');
  });

  it('renders loading skeleton when building is focused but details not yet loaded', () => {
    useBuildingStore.getState().setFocus(mockFocus);
    useBuildingStore.setState({ isLoading: true });

    const { container } = renderWithProviders(<BuildingInspector />);
    // Should render skeletons, not crash
    expect(container.querySelector('[class*="loading"]')).toBeTruthy();
  });

  it('renders full inspector when details are loaded', () => {
    useBuildingStore.getState().setFocus(mockFocus);
    useBuildingStore.setState({ details: mockDetails, isLoading: false });

    renderWithProviders(<BuildingInspector />);
    expect(screen.getByText('Small Factory')).toBeTruthy();
    expect(screen.getByText('TestCo')).toBeTruthy();
  });

  it('renders without header when hideHeader is true', () => {
    useBuildingStore.getState().setFocus(mockFocus);
    useBuildingStore.setState({ details: mockDetails, isLoading: false });

    const { container } = renderWithProviders(<BuildingInspector hideHeader />);
    // Component should render without crashing
    expect(container).toBeTruthy();
    // Building name should NOT appear in header (modal provides its own)
    const headers = container.querySelectorAll('h3');
    expect(headers.length).toBe(0);
  });

  it('renders tabs when details include multiple tabs', () => {
    useBuildingStore.getState().setFocus(mockFocus);
    useBuildingStore.setState({ details: mockDetails, isLoading: false });

    renderWithProviders(<BuildingInspector />);
    expect(screen.getByText('GENERAL')).toBeTruthy();
    expect(screen.getByText('SUPPLIES')).toBeTruthy();
  });
});

describe('QuickStats smoke test', () => {
  it('renders revenue and sales info', () => {
    renderWithProviders(<QuickStats focus={mockFocus} />);
    expect(screen.getByText('$500')).toBeTruthy();
    expect(screen.getByText('$1,200')).toBeTruthy();
  });

  it('renders construction progress bar', () => {
    const constructionFocus = { ...mockFocus, salesInfo: '45% completed.' };
    renderWithProviders(<QuickStats focus={constructionFocus} />);
    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('Construction')).toBeTruthy();
  });
});

describe('InspectorTabs smoke test', () => {
  it('renders tab buttons without crashing', () => {
    const onTabChange = () => {};
    renderWithProviders(
      <InspectorTabs tabs={mockTabs} activeTab="general" onTabChange={onTabChange} />,
    );
    expect(screen.getByText('GENERAL')).toBeTruthy();
    expect(screen.getByText('SUPPLIES')).toBeTruthy();
  });

  it('marks the active tab with aria-selected', () => {
    const onTabChange = () => {};
    renderWithProviders(
      <InspectorTabs tabs={mockTabs} activeTab="general" onTabChange={onTabChange} />,
    );
    const generalTab = screen.getByText('GENERAL').closest('[role="tab"]');
    expect(generalTab?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('ActionBar smoke test', () => {
  beforeEach(() => {
    resetStores();
  });

  it('renders without crashing for non-owner', () => {
    useBuildingStore.setState({ isOwner: false, details: mockDetails });
    const { container } = renderWithProviders(
      <ActionBar buildingX={100} buildingY={200} securityId="sec-1" />,
    );
    // Should have refresh button but no owner actions
    expect(container.textContent).not.toContain('Rename');
    expect(container.textContent).not.toContain('Delete');
  });

  it('renders owner actions when user owns the building', () => {
    useBuildingStore.setState({ isOwner: true, details: mockDetails });
    renderWithProviders(
      <ActionBar buildingX={100} buildingY={200} securityId="sec-1" />,
    );
    // Owner should see rename and delete buttons (via aria-label)
    expect(screen.getByLabelText('Rename')).toBeTruthy();
    expect(screen.getByLabelText('Delete')).toBeTruthy();
    expect(screen.getByLabelText('Refresh')).toBeTruthy();
  });
});
