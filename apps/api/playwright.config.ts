import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test-integration/browser",
  testMatch: "*.spec.ts",
  outputDir: "./test-results/browser",
  timeout: 30000,
  workers: 1,
  retries: 0,
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
