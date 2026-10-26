import { defineConfig, devices } from "@playwright/test";
import { requireEnvironment } from "./src/environment.ts";
import { wecomMobileCertificatePin } from "./src/wecom-mobile-tls.ts";

const origin = requireEnvironment("IAM_E2E_ORIGIN");
const outputDir = requireEnvironment("IAM_E2E_PLAYWRIGHT_OUTPUT_DIR");
const journey = process.env.IAM_E2E_JOURNEY ?? "admin";
if (journey !== "admin" && journey !== "hr-admin" && journey !== "oidc" && journey !== "managed")
  throw new Error("IAM_E2E_JOURNEY must be admin, hr-admin, oidc, or managed");

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
  testMatch:
    journey === "oidc"
      ? [
          "oidc-pkce.spec.ts",
          "dual-entry.spec.ts",
          "application-admission.spec.ts",
          "wecom-qr.spec.ts",
          "wecom-qr-oidc.spec.ts",
          "wecom-qr-binding.spec.ts",
        ]
      : journey === "hr-admin"
        ? "hr-admin-user-management.spec.ts"
        : "admin-custom-sso.spec.ts",
  timeout: 120_000,
  use: {
    baseURL: origin,
    launchOptions: {
      args: [
        "--host-resolver-rules=MAP internal.iam.localhost 127.0.0.1, MAP external.iam.localhost 127.0.0.1",
        ...(journey === "oidc" ? [`--ignore-certificate-errors-spki-list=${wecomMobileCertificatePin()}`] : []),
      ],
    },
    screenshot: "only-on-failure",
    trace: journey === "managed" ? "off" : "retain-on-failure",
    video: journey === "managed" ? "off" : "retain-on-failure",
  },
  workers: 1,
});
