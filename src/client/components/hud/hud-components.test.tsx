/**
 * Smoke tests for HUD components (LeftRail, RightRail, InfoWidget, StatusTicker, OverlayMenu).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../../__tests__/setup/render-helpers';
import { useGameStore } from '../../store/game-store';
import { useBuildingStore } from '../../store/building-store';
import { LeftRail } from './LeftRail';
import { RightRail } from './RightRail';
import { InfoWidget } from './InfoWidget';
import { StatusTicker } from './StatusTicker';
import { OverlayMenu } from './OverlayMenu';

describe('LeftRail', () => {
  beforeEach(resetStores);

  it('renders nav with game actions label', () => {
    renderWithProviders(<LeftRail />);
    expect(screen.getByLabelText('Game actions')).toBeTruthy();
  });

  it('renders Build button', () => {
    renderWithProviders(<LeftRail />);
    expect(screen.getByLabelText('Build (B)')).toBeTruthy();
  });

  it('renders Search button', () => {
    renderWithProviders(<LeftRail />);
    expect(screen.getByLabelText('Search')).toBeTruthy();
  });

  it('renders Mail and Settings buttons', () => {
    renderWithProviders(<LeftRail />);
    expect(screen.getByLabelText('Mail (M)')).toBeTruthy();
    expect(screen.getByLabelText('Settings')).toBeTruthy();
  });
});

describe('RightRail', () => {
  beforeEach(resetStores);

  it('renders nav with map controls label', () => {
    renderWithProviders(<RightRail />);
    expect(screen.getByLabelText('Map controls')).toBeTruthy();
  });

  it('renders zoom buttons', () => {
    renderWithProviders(<RightRail />);
    expect(screen.getByLabelText('Zoom In (+)')).toBeTruthy();
    expect(screen.getByLabelText('Zoom Out (-)')).toBeTruthy();
  });

  it('renders debug and refresh buttons', () => {
    renderWithProviders(<RightRail />);
    expect(screen.getByLabelText('Debug (D)')).toBeTruthy();
    expect(screen.getByLabelText('Refresh (R)')).toBeTruthy();
  });
});

describe('InfoWidget', () => {
  beforeEach(resetStores);

  it('renders without crashing when no data', () => {
    const { container } = renderWithProviders(<InfoWidget />);
    expect(container).toBeTruthy();
    expect(screen.getByText('No Company')).toBeTruthy();
  });

  it('renders company name when set', () => {
    useGameStore.setState({ companyName: 'TestCo Industries' });
    renderWithProviders(<InfoWidget />);
    expect(screen.getByText('TestCo Industries')).toBeTruthy();
  });

  it('renders tycoon stats', () => {
    useGameStore.setState({
      username: 'TestPlayer',
      tycoonStats: {
        username: 'TestPlayer',
        ranking: 5,
        cash: '1,234,567',
        incomePerHour: '+$500',
        buildingCount: 12,
        maxBuildings: 50,
        failureLevel: 0,
      },
    });
    renderWithProviders(<InfoWidget />);
    expect(screen.getByText('#5')).toBeTruthy();
    expect(screen.getByText('TestPlayer')).toBeTruthy();
    expect(screen.getByText('12/50 facilities')).toBeTruthy();
    expect(screen.getByText('$1,234,567')).toBeTruthy();
  });
});

describe('StatusTicker', () => {
  beforeEach(resetStores);

  it('renders nothing when no building focused', () => {
    const { container } = renderWithProviders(<StatusTicker />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when not in overlay mode', () => {
    useBuildingStore.getState().setFocus({
      buildingId: 'bld-1', buildingName: 'Factory', ownerName: 'Owner',
      salesInfo: '', revenue: '', detailsText: 'Details here', hintsText: 'Hint here',
      x: 10, y: 20, xsize: 2, ysize: 2, visualClass: '100',
    });
    useBuildingStore.setState({ isOverlayMode: false });
    const { container } = renderWithProviders(<StatusTicker />);
    expect(container.innerHTML).toBe('');
  });

  it('renders details and hints when in overlay mode', () => {
    useBuildingStore.getState().setFocus({
      buildingId: 'bld-1', buildingName: 'Factory', ownerName: 'Owner',
      salesInfo: '', revenue: '', detailsText: 'Producing goods', hintsText: 'Running well',
      x: 10, y: 20, xsize: 2, ysize: 2, visualClass: '100',
    });
    useBuildingStore.setState({ isOverlayMode: true });
    renderWithProviders(<StatusTicker />);
    expect(screen.getByText('Producing goods')).toBeTruthy();
    expect(screen.getByText('Running well')).toBeTruthy();
  });
});

describe('OverlayMenu', () => {
  beforeEach(resetStores);

  it('renders overlay menu with categories', () => {
    renderWithProviders(<OverlayMenu />);
    expect(screen.getByLabelText('Map Overlays')).toBeTruthy();
  });

  it('renders category headers', () => {
    renderWithProviders(<OverlayMenu />);
    expect(screen.getByText('Special')).toBeTruthy();
    expect(screen.getByText('Environment')).toBeTruthy();
  });
});
