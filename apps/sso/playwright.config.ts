import { defineConfig, devices } from '@playwright/test';

const port = 8000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './test-integration/browser',
  timeout: 180_000,
  expect: {
    timeout: 120_000,
  },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['line']] : 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev:e2e',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    url: `${baseURL}/portal/login?client=iam-admin`,
  },
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
