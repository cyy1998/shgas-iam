import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test-redis/**/*.test.ts"],
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
