import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // every file shares one database and cleans up after itself, so files run one at a time
    fileParallelism: false,
  },
});
