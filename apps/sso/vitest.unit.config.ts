import { defineConfig } from 'vitest/config';
import baseConfig, { domTestOptions } from './vitest.shared';

const sharedExclude = baseConfig.test?.exclude ?? [];

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    maxWorkers: 4,
    projects: [
      {
        resolve: baseConfig.resolve,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...sharedExclude, 'src/**/*.dom.test.{ts,tsx}'],
        },
      },
      {
        resolve: baseConfig.resolve,
        test: {
          name: 'dom',
          ...domTestOptions,
          include: ['src/**/*.dom.test.{ts,tsx}'],
          exclude: sharedExclude,
          setupFiles: ['./test/setup-dom.ts'],
        },
      },
    ],
  },
});
