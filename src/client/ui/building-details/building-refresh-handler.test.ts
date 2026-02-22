/**
 * Unit tests for EVENT_BUILDING_REFRESH handler logic
 *
 * Tests the conditional matching and dispatch logic used in client.ts
 * for the RefreshObject push event. Since client.ts is a large integration
 * controller, we test the handler logic pattern in isolation.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type {
  BuildingFocusInfo,
  BuildingDetailsResponse,
  WsMessageType,
} from '../../../shared/types';

/**
 * Extract the handler logic from client.ts EVENT_BUILDING_REFRESH case
 * for isolated testing. This mirrors the exact logic at client.ts:373-391.
 */
function handleBuildingRefreshEvent(
  currentFocusedBuilding: BuildingFocusInfo | null,
  currentFocusedVisualClass: string | null,
  refreshBuildingId: string,
  requestBuildingDetails: (x: number, y: number, vc: string) => Promise<BuildingDetailsResponse | null>,
  updatePanel: (details: BuildingDetailsResponse) => void,
  logError: (msg: string) => void,
): void {
  if (currentFocusedBuilding &&
      currentFocusedBuilding.buildingId === refreshBuildingId) {
    requestBuildingDetails(
      currentFocusedBuilding.x,
      currentFocusedBuilding.y,
      currentFocusedVisualClass || '0'
    ).then(refreshedDetails => {
      if (refreshedDetails) {
        updatePanel(refreshedDetails);
      }
    }).catch(err => {
      logError(`Failed to refresh building: ${err}`);
    });
  }
}

/**
 * Extract the isOwner logic from client.ts for testing the
 * currentCompanyName → showBuildingDetailsPanel wiring.
 */
function computeIsOwner(
  ownerName: string,
  currentCompanyName: string | undefined
): boolean {
  if (!currentCompanyName) return false;
  return ownerName === currentCompanyName;
}

function makeFocusInfo(overrides: Partial<BuildingFocusInfo> = {}): BuildingFocusInfo {
  return {
    buildingId: 'b-123',
    buildingName: 'Factory',
    ownerName: 'TestCompany',
    salesInfo: '',
    revenue: '$1000',
    detailsText: '',
    hintsText: '',
    x: 100,
    y: 200,
    ...overrides,
  };
}

function makeDetails(overrides: Partial<BuildingDetailsResponse> = {}): BuildingDetailsResponse {
  return {
    buildingId: 'b-123',
    buildingName: 'Factory',
    ownerName: 'TestCompany',
    x: 100,
    y: 200,
    visualClass: '42',
    templateName: 'Industrial',
    securityId: '',
    tabs: [],
    groups: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('EVENT_BUILDING_REFRESH handler logic', () => {
  let requestBuildingDetails: jest.Mock;
  let updatePanel: jest.Mock;
  let logError: jest.Mock;

  beforeEach(() => {
    requestBuildingDetails = jest.fn();
    updatePanel = jest.fn();
    logError = jest.fn();
  });

  it('should re-fetch details when buildingId matches current focused building', async () => {
    const focusedBuilding = makeFocusInfo({ buildingId: 'b-123' });
    const details = makeDetails();
    requestBuildingDetails.mockResolvedValue(details);

    handleBuildingRefreshEvent(
      focusedBuilding, '42', 'b-123',
      requestBuildingDetails, updatePanel, logError
    );

    // Let promise resolve
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(requestBuildingDetails).toHaveBeenCalledWith(100, 200, '42');
    expect(updatePanel).toHaveBeenCalledWith(details);
  });

  it('should NOT fetch when no building is focused', async () => {
    handleBuildingRefreshEvent(
      null, null, 'b-123',
      requestBuildingDetails, updatePanel, logError
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(requestBuildingDetails).not.toHaveBeenCalled();
    expect(updatePanel).not.toHaveBeenCalled();
  });

  it('should NOT fetch when buildingId does not match', async () => {
    const focusedBuilding = makeFocusInfo({ buildingId: 'b-999' });

    handleBuildingRefreshEvent(
      focusedBuilding, '42', 'b-123',
      requestBuildingDetails, updatePanel, logError
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(requestBuildingDetails).not.toHaveBeenCalled();
  });

  it('should use visual class "0" when currentFocusedVisualClass is null', async () => {
    const focusedBuilding = makeFocusInfo({ buildingId: 'b-123' });
    requestBuildingDetails.mockResolvedValue(makeDetails());

    handleBuildingRefreshEvent(
      focusedBuilding, null, 'b-123',
      requestBuildingDetails, updatePanel, logError
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(requestBuildingDetails).toHaveBeenCalledWith(100, 200, '0');
  });

  it('should NOT update panel when requestBuildingDetails returns null', async () => {
    const focusedBuilding = makeFocusInfo({ buildingId: 'b-123' });
    requestBuildingDetails.mockResolvedValue(null);

    handleBuildingRefreshEvent(
      focusedBuilding, '42', 'b-123',
      requestBuildingDetails, updatePanel, logError
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(requestBuildingDetails).toHaveBeenCalled();
    expect(updatePanel).not.toHaveBeenCalled();
  });

  it('should log error when requestBuildingDetails rejects', async () => {
    const focusedBuilding = makeFocusInfo({ buildingId: 'b-123' });
    requestBuildingDetails.mockRejectedValue(new Error('Network error'));

    handleBuildingRefreshEvent(
      focusedBuilding, '42', 'b-123',
      requestBuildingDetails, updatePanel, logError
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to refresh building'));
  });

  it('should pass correct coordinates from focused building', async () => {
    const focusedBuilding = makeFocusInfo({ buildingId: 'b-456', x: 300, y: 400 });
    requestBuildingDetails.mockResolvedValue(makeDetails());

    handleBuildingRefreshEvent(
      focusedBuilding, '55', 'b-456',
      requestBuildingDetails, updatePanel, logError
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(requestBuildingDetails).toHaveBeenCalledWith(300, 400, '55');
  });
});

describe('isOwner computation (currentCompanyName wiring)', () => {
  it('should return true when ownerName matches currentCompanyName', () => {
    expect(computeIsOwner('MyCompany', 'MyCompany')).toBe(true);
  });

  it('should return false when ownerName differs from currentCompanyName', () => {
    expect(computeIsOwner('MyCompany', 'OtherCompany')).toBe(false);
  });

  it('should return false when currentCompanyName is undefined', () => {
    expect(computeIsOwner('MyCompany', undefined)).toBe(false);
  });

  it('should return false for empty string company name', () => {
    expect(computeIsOwner('MyCompany', '')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(computeIsOwner('MyCompany', 'mycompany')).toBe(false);
  });
});
