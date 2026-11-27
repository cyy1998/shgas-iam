import { defineConfig, devices } from "@playwright/test";

const { IAM_E2E_ORIGIN: origin, IAM_E2E_PLAYWRIGHT_OUTPUT_DIR: outputDir } = process.env;
if (!origin?.trim()) throw new Error("IAM_E2E_ORIGIN is required");
if (!outputDir?.trim()) throw new Error("IAM_E2E_PLAYWRIGHT_OUTPUT_DIR is required");

export default defineConfig({
  expect: { timeout: 30_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir,
  preserveOutput: "never",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: "list",
  retries: 0,
  testDir: "./specs",
  testMatch: "managed-hosting.spec.ts",
  timeout: 120_000,
  use: {
    baseURL: origin,
    launchOptions: {
      args: ["--host-resolver-rules=MAP internal.iam.localhost 127.0.0.1, MAP external.iam.localhost 127.0.0.1"],
    },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  workers: 1,
});
