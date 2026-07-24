import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/*.smoke.test.{ts,tsx}"],
    maxWorkers: "25%",
    testTimeout: 10_000,
  },
});
