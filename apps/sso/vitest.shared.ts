import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const defaultMaxWorkers = process.env.CI ? 2 : Math.min(12, Math.max(2, Math.floor(availableParallelism() / 2)));

export const domTestOptions = {
  deps: {
    optimizer: {
      client: {
        enabled: true,
        include: ["react", "react/jsx-runtime", "react-dom", "antd"],
      },
    },
  },
  environment: "jsdom" as const,
  env: {
    IAM_SSO_WEB_LOGIN_CREDENTIAL_KID: "2026-05-primary",
    IAM_SSO_WEB_LOGIN_CREDENTIAL_PUBLIC_KEY:
      "04112ddd8854e8262db2520bba112535844884c03348a45fcf4ee0f9a967979be52bd46caf43be697ae557ed2e4fa5b4dca8d2dbfa08c0f2f710c0f61591bb17dc",
  },
};

export default defineConfig({
  resolve: {
    alias: {
      "@sso": resolve(import.meta.dirname, "src"),
      "~sso": import.meta.dirname,
    },
  },
  test: {
    exclude: ["dist/**", "node_modules/**"],
    maxWorkers: defaultMaxWorkers,
    testTimeout: process.env.CI ? 20_000 : 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/assets/**"],
    },
  },
});
