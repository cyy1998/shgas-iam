import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test-integration/process/**/*.integration.test.ts"],
    maxWorkers: 1,
  },
});
