/// <reference types="vite/client" />

// Extend Window interface for global app reference
interface Window {
  app: import('./main').Starpeace3DApp;
}
