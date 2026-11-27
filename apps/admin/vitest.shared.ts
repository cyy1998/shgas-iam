import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const defaultMaxWorkers = process.env.CI ? 2 : Math.min(12, Math.max(2, Math.floor(availableParallelism() / 2)));

export const domTestOptions = {
  deps: {
    optimizer: {
      client: {
        enabled: true,
        include: ["react", "react/jsx-runtime", "react-dom", "antd", "@ant-design/pro-components"],
      },
    },
  },
  environment: "jsdom" as const,
};

export default defineConfig({
  resolve: {
    alias: {
      "@admin": resolve(__dirname, "src"),
      "~admin": __dirname,
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
