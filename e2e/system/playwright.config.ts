import { defineConfig, devices } from "@playwright/test";
import { requireEnvironment } from "./src/environment.ts";

const origin = requireEnvironment("IAM_E2E_ORIGIN");
const outputDir = requireEnvironment("IAM_E2E_PLAYWRIGHT_OUTPUT_DIR");
const journey = process.env.IAM_E2E_JOURNEY ?? "admin";
if (journey !== "admin" && journey !== "hr-admin" && journey !== "oidc")
  throw new Error("IAM_E2E_JOURNEY must be admin, hr-admin, or oidc");

export default defineConfig({
  expect: { timeout: 30_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: "list",
  retries: 0,
  testDir: ".",
  testMatch: journey === "oidc"
    ? "oidc-pkce.spec.ts"
    : journey === "hr-admin"
      ? "hr-admin-user-management.spec.ts"
      : "admin-custom-sso.spec.ts",
  timeout: 120_000,
  use: {
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: 1,
});
