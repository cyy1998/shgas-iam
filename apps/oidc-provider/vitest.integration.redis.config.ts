import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test-integration/redis/**/*.integration.test.ts"],
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
