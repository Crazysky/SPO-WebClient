/**
 * Tests for StatusTicker visibility logic via store state.
 *
 * React rendering is not tested (node env, no jsdom) — only store-driven
 * visibility patterns that mirror the component's conditional rendering.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useBuildingStore } from '../../store/building-store';
import type { BuildingFocusInfo } from '@/shared/types';

const baseMockBuilding: BuildingFocusInfo = {
  buildingId: '129625108',
  buildingName: 'Company Headquarters',
  ownerName: 'Yellow Inc.',
  salesInfo: '8% research completed',
  revenue: '(-$201,337/h)',
  detailsText: '',
  hintsText: '',
  x: 100,
  y: 200,
  xsize: 3,
  ysize: 3,
  visualClass: '5678',
};

/** Replicate the component's visibility check. */
function isTickerVisible(building: BuildingFocusInfo | null): boolean {
  if (!building) return false;
  const detailsText = building.detailsText || '';
  const hintsText = building.hintsText || '';
  return detailsText !== '' || hintsText !== '';
}

describe('StatusTicker — visibility logic', () => {
  beforeEach(() => {
    useBuildingStore.setState({
      focusedBuilding: null,
      isOverlayMode: false,
      details: null,
      currentTab: 'overview',
      isLoading: false,
      currentCompanyName: '',
      isOwner: false,
      connectionPicker: null,
      research: null,
    });
  });

  it('not visible when no building is focused', () => {
    const state = useBuildingStore.getState();
    expect(isTickerVisible(state.focusedBuilding)).toBe(false);
  });

  it('not visible when building has empty detailsText and empty hintsText', () => {
    useBuildingStore.getState().setFocus(baseMockBuilding);
    const state = useBuildingStore.getState();
    expect(isTickerVisible(state.focusedBuilding)).toBe(false);
  });

  it('visible when building has detailsText', () => {
    const building: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: 'Researching Water Quest Licenses. Cost: $10,000,000.',
    };
    useBuildingStore.getState().setFocus(building);
    const state = useBuildingStore.getState();
    expect(isTickerVisible(state.focusedBuilding)).toBe(true);
    expect(state.focusedBuilding?.detailsText).toBe(
      'Researching Water Quest Licenses. Cost: $10,000,000.'
    );
  });

  it('visible when building has hintsText', () => {
    const building: BuildingFocusInfo = {
      ...baseMockBuilding,
      hintsText: 'Crazz, please wait while research is completed...',
    };
    useBuildingStore.getState().setFocus(building);
    const state = useBuildingStore.getState();
    expect(isTickerVisible(state.focusedBuilding)).toBe(true);
    expect(state.focusedBuilding?.hintsText).toBe(
      'Crazz, please wait while research is completed...'
    );
  });

  it('visible when building has both detailsText and hintsText', () => {
    const building: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: 'Researching Water Quest Licenses. Cost: $10,000,000. Company supported at 200%. Research Implementation: $171.',
      hintsText: 'Crazz, please wait while research is completed...',
    };
    useBuildingStore.getState().setFocus(building);
    const state = useBuildingStore.getState();
    expect(isTickerVisible(state.focusedBuilding)).toBe(true);
  });

  it('visible regardless of overlay mode (always shows when text present)', () => {
    const building: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: 'Some details',
    };
    useBuildingStore.getState().setFocus(building);

    // Overlay off
    useBuildingStore.getState().setOverlayMode(false);
    expect(isTickerVisible(useBuildingStore.getState().focusedBuilding)).toBe(true);

    // Overlay on
    useBuildingStore.getState().setOverlayMode(true);
    expect(isTickerVisible(useBuildingStore.getState().focusedBuilding)).toBe(true);
  });

  it('hides when building is unfocused (clearFocus)', () => {
    const building: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: 'Some details',
      hintsText: 'Some hints',
    };
    useBuildingStore.getState().setFocus(building);
    expect(isTickerVisible(useBuildingStore.getState().focusedBuilding)).toBe(true);

    useBuildingStore.getState().clearFocus();
    expect(isTickerVisible(useBuildingStore.getState().focusedBuilding)).toBe(false);
  });

  it('updates when building refreshes with new text', () => {
    const initial: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: 'Researching item A.',
      hintsText: 'Please wait...',
    };
    useBuildingStore.getState().setFocus(initial);

    const refreshed: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: 'Researching item B. Cost: $5,000,000.',
      hintsText: 'Almost done...',
    };
    useBuildingStore.getState().setFocus(refreshed);

    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.detailsText).toBe('Researching item B. Cost: $5,000,000.');
    expect(state.focusedBuilding?.hintsText).toBe('Almost done...');
    expect(isTickerVisible(state.focusedBuilding)).toBe(true);
  });

  it('hides when building refreshes with cleared text (research complete)', () => {
    const researching: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: 'Researching Water Quest Licenses.',
      hintsText: 'Please wait...',
    };
    useBuildingStore.getState().setFocus(researching);
    expect(isTickerVisible(useBuildingStore.getState().focusedBuilding)).toBe(true);

    // After research completes, RefreshObject sends empty text
    const completed: BuildingFocusInfo = {
      ...baseMockBuilding,
      detailsText: '',
      hintsText: '',
    };
    useBuildingStore.getState().setFocus(completed);
    expect(isTickerVisible(useBuildingStore.getState().focusedBuilding)).toBe(false);
  });

  it('handles non-research details (regular building info)', () => {
    const building: BuildingFocusInfo = {
      ...baseMockBuilding,
      buildingName: 'Drug Store',
      detailsText: 'Drug Store.  Upgrade Level: 1  Efficiency: 87%  Desirability: 46',
      hintsText: 'Hint: Try to attract more customers by offering better quality and prices.',
    };
    useBuildingStore.getState().setFocus(building);

    const state = useBuildingStore.getState();
    expect(isTickerVisible(state.focusedBuilding)).toBe(true);
    expect(state.focusedBuilding?.detailsText).toContain('Efficiency: 87%');
    expect(state.focusedBuilding?.hintsText).toContain('better quality');
  });
});
