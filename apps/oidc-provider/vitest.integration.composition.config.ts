import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test-integration/composition/**/*.integration.test.ts"],
    maxWorkers: 1,
  },
});
