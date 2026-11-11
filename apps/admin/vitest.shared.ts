import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

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
    exclude: ["dist/**", "test-integration/**", "node_modules/**"],
    maxWorkers: "25%",
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/assets/**"],
    },
  },
});
