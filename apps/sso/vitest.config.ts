import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sso': resolve(__dirname, 'src'),
      '~sso': __dirname,
      '@umijs/max': resolve(__dirname, 'test/mocks/umijs-max.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'test/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      '**/*.smoke.test.{ts,tsx}',
      'dist/**',
      'e2e/**',
      'node_modules/**',
      'src/.umi/**',
      'src/.umi-production/**',
    ],
    maxWorkers: '25%',
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/.umi/**',
        'src/.umi-production/**',
        'src/assets/**',
      ],
    },
  },
});
