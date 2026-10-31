import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // every source file counts, tested or not; the seed scripts are CLI tools, generated is Prisma's output
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/generated/**', 'src/seed/**'],
    },
  },
});
