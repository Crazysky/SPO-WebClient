/**
 * Tests for LegacyBridgeContext — the React context that replaces
 * window.__spoReactCallbacks for bridge communication.
 */

import { LegacyBridgeContext, useLegacyBridge, type BridgeRef } from './LegacyBridgeContext';

describe('LegacyBridgeContext', () => {
  it('should be defined', () => {
    expect(LegacyBridgeContext).toBeDefined();
  });

  it('should have a default value with null current', () => {
    // createContext's default is { current: null }
    // Access the internal default via Consumer pattern
    const defaultValue = (LegacyBridgeContext as unknown as { _defaultValue: BridgeRef })._defaultValue
      ?? (LegacyBridgeContext as unknown as { _currentValue: BridgeRef })._currentValue;
    expect(defaultValue).toEqual({ current: null });
  });
});

describe('BridgeRef', () => {
  it('should allow setting current to a callbacks object', () => {
    const ref: BridgeRef = { current: null };
    expect(ref.current).toBeNull();

    // Simulate what client.ts does
    const mockCallbacks = {
      onRefreshMap: jest.fn(),
      onBuildRoad: jest.fn(),
    };
    ref.current = mockCallbacks as unknown as BridgeRef['current'];
    expect(ref.current).toBe(mockCallbacks);
  });

  it('should support optional chaining pattern used by components', () => {
    const ref: BridgeRef = { current: null };

    // Before callbacks are injected, optional chaining should not throw
    ref.current?.onRefreshMap();

    // After injection, callbacks should be callable
    const mockCallbacks = {
      onRefreshMap: jest.fn(),
    };
    ref.current = mockCallbacks as unknown as BridgeRef['current'];
    ref.current?.onRefreshMap();
    expect(mockCallbacks.onRefreshMap).toHaveBeenCalledTimes(1);
  });
});

describe('useLegacyBridge', () => {
  it('should be a function', () => {
    expect(typeof useLegacyBridge).toBe('function');
  });
});
