import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.smoke.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
