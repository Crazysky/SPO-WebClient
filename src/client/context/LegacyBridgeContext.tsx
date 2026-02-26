/**
 * LegacyBridgeContext — React context for legacy client callbacks.
 *
 * Replaces the Phase 1 `window.__spoReactCallbacks` global with a proper
 * React context. The context value is a mutable ref-like object whose
 * `.current` property is populated at runtime when the legacy client
 * calls `window.__spoSetBridgeCallbacks()`.
 *
 * Components access callbacks in event handlers via:
 *   const bridge = useLegacyBridge();
 *   bridge.current?.onSomething(args);
 */

import { createContext, useContext } from 'react';
import type { ClientCallbacks } from '../bridge/client-bridge';

/** Ref-like wrapper holding the callbacks object. */
export type BridgeRef = { current: ClientCallbacks | null };

/**
 * Context that holds the bridge ref.
 * Default value is a ref with null — safe for SSR and pre-initialization.
 */
export const LegacyBridgeContext = createContext<BridgeRef>({ current: null });

/**
 * Hook to access legacy client callbacks from any React component.
 *
 * Returns a ref-like object. Access `.current` in event handlers
 * (not during render) — it's null before client.ts has initialized.
 */
export function useLegacyBridge(): BridgeRef {
  return useContext(LegacyBridgeContext);
}
