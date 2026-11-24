import { defineConfig, devices } from "@playwright/test";

const port = 8000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./test-integration",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/browser",
  timeout: 180_000,
  fullyParallel: true,
  expect: {
    timeout: 120_000,
  },
  reporter: process.env.CI ? [["html", { open: "never" }], ["line"]] : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      process.env.IAM_PW_DEV_SERVER === "1"
        ? "pnpm dev:e2e"
        : `bun --no-env-file ../../e2e/system/src/frontend/integration-frontend.ts sso ${port}`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    stdout: "pipe",
    timeout: 240_000,
    url: `${baseURL}/portal/`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
