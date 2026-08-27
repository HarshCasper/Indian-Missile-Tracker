/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative assets keep the static build portable across Cloudflare Pages and
// local `vite preview` alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The WebGL globe is intentionally lazy-loaded by App.tsx. Let Rolldown retain
  // that dynamic-import boundary instead of forcing its shared D3 dependencies
  // into an eager manual chunk.
  build: {
    chunkSizeWarningLimit: 3000,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
