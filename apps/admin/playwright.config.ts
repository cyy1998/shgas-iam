import { defineConfig, devices } from "@playwright/test";
import { resolveLoopbackPort } from "../../scripts/test-resources/loopback-port.mjs";

const port = resolveLoopbackPort("IAM_ADMIN_PW_PORT");
const baseURL = `http://127.0.0.1:${port}`;
const useDevServer = process.env.IAM_PW_DEV_SERVER === "1";

export default defineConfig({
  testDir: "./test-integration",
  testMatch: "**/*.spec.ts",
  timeout: 180_000,
  fullyParallel: true,
  retries: 0,
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
      : `pnpm --dir ../.. exec turbo run build:test --filter=@iam/admin && exec pnpm exec vite preview --outDir dist-test --host 127.0.0.1 --port ${port} --strictPort`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    stdout: "pipe",
    timeout: 240_000,
    url: `${baseURL}/iam-admin/users`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
