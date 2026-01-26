import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    proxy: {
      // Proxy texture requests to main server
      '/cache': 'http://localhost:3000',
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    target: 'esnext'
  }
});
