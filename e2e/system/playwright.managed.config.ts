import { defineConfig, devices } from "@playwright/test";
import { requireEnvironment } from "./src/environment.ts";

export default defineConfig({
  expect: { timeout: 30_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: requireEnvironment("IAM_E2E_PLAYWRIGHT_OUTPUT_DIR"),
  preserveOutput: "never",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: "list",
  retries: 0,
  testDir: ".",
  testMatch: "managed-hosting.spec.ts",
  timeout: 120_000,
  use: {
    baseURL: requireEnvironment("IAM_E2E_ORIGIN"),
    launchOptions: {
      args: ["--host-resolver-rules=MAP internal.iam.localhost 127.0.0.1, MAP external.iam.localhost 127.0.0.1"],
    },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  workers: 1,
});
