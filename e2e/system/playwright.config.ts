import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import type { E2ERunContext } from "./src/e2e-context.ts";
import { createFailureReporters } from "./src/failure-report/reporter-config.ts";
import { wecomMobileCertificatePin } from "./src/wecom-mobile-tls.ts";

const contextPath = process.env.IAM_E2E_CONTEXT_PATH;
const context: E2ERunContext | undefined = contextPath ? JSON.parse(readFileSync(contextPath, "utf8")) : undefined;

export default defineConfig({
  expect: { timeout: 30_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: contextPath ? join(dirname(contextPath), "playwright") : "test-results/playwright",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: createFailureReporters(
    context && {
      compose: {
        project: context.project,
        composeFile: context.composeFile,
        projectDirectory: context.projectDirectory,
        services: context.logServices,
        includeApisix: true,
      },
    },
    process.env.IAM_E2E_INTERACTIVE === undefined ? process.stdout.isTTY : process.env.IAM_E2E_INTERACTIVE === "1",
  ),
  retries: process.env.CI ? 1 : 0,
  testDir: ".",
  testMatch: [
    "admin-custom-sso.spec.ts",
    "application-admission.spec.ts",
    "directory-custom-attributes.spec.ts",
    "dual-entry.spec.ts",
    "hr-admin-user-management.spec.ts",
    "oidc-pkce.spec.ts",
    "wecom-qr-binding.spec.ts",
    "wecom-qr-oidc.spec.ts",
    "wecom-qr.spec.ts",
  ],
  testIgnore: "**/test-results/**",
  timeout: 120_000,
  use: {
    baseURL: context?.origin,
    launchOptions: {
      args: [
        "--host-resolver-rules=MAP internal.iam.localhost 127.0.0.1, MAP external.iam.localhost 127.0.0.1",
        `--ignore-certificate-errors-spki-list=${wecomMobileCertificatePin()}`,
      ],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: 1,
});
