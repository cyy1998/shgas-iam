import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    maxWorkers: "25%",
    testTimeout: 10_000,
  },
});
