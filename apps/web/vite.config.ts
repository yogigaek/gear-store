/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // same-origin /api in development, so cookies and CORS behave as they will behind one domain
    proxy: { '/api': 'http://localhost:3000' },
  },
  // `vite preview` serves the production build the same way, for Lighthouse and the browser e2e tests
  preview: { proxy: { '/api': 'http://localhost:3000' } },
  test: {
    // every source file counts, tested or not; the 3D scene in three/ is left to the browser tests
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/three/**', 'src/test/**'],
      // the logic is held to 90%: lib/ and the two stores outside it. Components and pages stay in the report
      // unthresholded: they are UI, left to the browser tests (no component test framework here)
      thresholds: {
        '{src/lib/**,src/components/cart/cart-drawer-store.ts,src/components/layout/page-tone.ts}': {
          lines: 90,
          branches: 90,
          statements: 90,
          functions: 90,
        },
      },
    },
  },
});
