import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test-external/**/*.external.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
