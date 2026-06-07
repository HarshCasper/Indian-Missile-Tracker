/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base keeps the static build portable across GitHub Pages project
// sites (username.github.io/<repo>/) and local `vite preview` alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  // three is used only transitively (via react-globe.gl, which bundles its own
  // copy); we don't depend on it directly. Splitting the globe stack into its own
  // chunk improves caching, and the size limit is raised since the WebGL globe is
  // inherently large.
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: {
          globe: ['react-globe.gl'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
