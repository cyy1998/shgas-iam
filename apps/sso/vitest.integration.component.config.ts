import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.shared';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['test-integration/component/**/*.integration.test.{ts,tsx}'],
  },
});
