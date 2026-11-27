import { defineConfig, devices } from "@playwright/test";
import { resolveLoopbackPort } from "../../scripts/test-resources/loopback-port.mjs";

const ssoTestLoginCredential = {
  IAM_SSO_WEB_LOGIN_CREDENTIAL_KID: "2026-05-primary",
  IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY:
    "04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc",
};

const port = resolveLoopbackPort("IAM_SSO_PW_PORT");
const baseURL = `http://127.0.0.1:${port}`;
const useDevServer = process.env.IAM_PW_DEV_SERVER === "1";

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
    command: useDevServer
      ? `exec pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`
      : `pnpm --dir ../.. exec turbo run build:test --filter=@iam/sso && exec pnpm exec vite preview --outDir dist-test --host 127.0.0.1 --port ${port} --strictPort`,
    ...(useDevServer ? { env: ssoTestLoginCredential } : {}),
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
