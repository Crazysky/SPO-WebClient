/**
 * Client entry point for Vite — React UI layer.
 *
 * Mounts the React app with a LegacyBridgeContext provider.
 * The legacy client.ts populates the bridge ref at runtime
 * via window.__spoSetBridgeCallbacks().
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LegacyBridgeContext, type BridgeRef } from './context';
import type { ClientCallbacks } from './bridge/client-bridge';

// Global styles (new green design system)
import './styles/design-tokens.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/animations.css';

// Cross-bundle API: legacy client.ts calls this to inject callbacks
declare global {
  interface Window {
    __spoSetBridgeCallbacks?: (callbacks: ClientCallbacks) => void;
  }
}

// Mutable ref — initially null, populated when client.ts calls __spoSetBridgeCallbacks
const bridgeRef: BridgeRef = { current: null };

// Expose setter for the legacy client to inject callbacks
window.__spoSetBridgeCallbacks = (callbacks: ClientCallbacks) => {
  bridgeRef.current = callbacks;
};

// Mount React app
const rootElement = document.getElementById('react-root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <LegacyBridgeContext.Provider value={bridgeRef}>
        <App />
      </LegacyBridgeContext.Provider>
    </StrictMode>
  );
}
