import { defineConfig, devices } from '@playwright/test';

// Expects the stack to be running: API on :3000, the web build on :5173 (vite preview), Mailpit on :8025.
// CI starts them; locally: docker compose up -d, npm run build, then start the API and `vite preview --port 5173`.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalTeardown: './tests/teardown.ts',
  use: {
    baseURL: process.env['WEB_URL'] ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /shopper/ },
  ],
});
