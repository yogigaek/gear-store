import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // every source file counts, tested or not, screens included
    coverage: {
      include: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', 'src/test/**'],
      // the logic in lib/ is held to 90%; screens and components stay in the report unthresholded (UI). One
      // exception: part-stills.ts is Metro's require() table of images, which Node cannot load (its entries are
      // checked against the files by part-stills.test.ts)
      thresholds: {
        'src/lib/!(part-stills).ts': { lines: 90, branches: 90, statements: 90, functions: 90 },
      },
    },
  },
});
