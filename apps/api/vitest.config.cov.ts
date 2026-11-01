import { defineConfig } from 'vitest/config';

// Unit and e2e specs in one instrumented run: most services are only reached through HTTP, so a unit-only
// number would hide them. Needs the database the e2e suite uses (migrated and seeded).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    // every e2e file shares one database and cleans up after itself, so files run one at a time
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // generated is Prisma's output; modules and main.ts only wire things together. In seed/, bootstrap.ts runs on
      // every production start and is counted (test/bootstrap.e2e-spec.ts); the rest are CLI scripts, and the seed
      // they share is run by `db:seed` in its own, uninstrumented process before the tests
      exclude: [
        'src/**/*.spec.ts',
        'src/generated/**',
        'src/seed/!(bootstrap).ts',
        'src/main.ts',
        'src/**/*.module.ts',
      ],
      reporter: ['text-summary', 'text', 'json-summary', 'html'],
      // after the exclusions above; what stays uncovered is mostly decorator metadata and defensive branches
      thresholds: { lines: 90, branches: 90, statements: 90, functions: 90 },
    },
  },
});
