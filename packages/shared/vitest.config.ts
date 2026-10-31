import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // every source file counts, tested or not
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
