import { defineConfig } from 'vitest/config';
import baseConfig, { domTestOptions } from './vitest.shared';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    ...domTestOptions,
    include: ['test-integration/component/**/*.integration.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
