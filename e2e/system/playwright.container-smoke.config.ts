import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "container-smoke.spec.ts",
  outputDir: process.env.IAM_E2E_SMOKE_OUTPUT_DIR ?? "test-results/container-smoke",
  reporter: "line",
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.IAM_E2E_ORIGIN,
    launchOptions: { args: ["--host-resolver-rules=MAP external.iam.localhost 127.0.0.1"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
