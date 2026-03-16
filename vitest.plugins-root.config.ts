import { defineConfig } from 'vitest/config';
import path from 'path';

const rootPluginExclusions = [
  'node_modules/**',
  'tests/plugins/eventual-consistency-recalculate/**',
  'tests/plugins/eventual-consistency-race/**',
];

export default defineConfig({
  resolve: {
    alias: {
      '#src': path.resolve(__dirname, './src'),
      '#tests': path.resolve(__dirname, './tests'),
    },
  },
  test: {
    globals: true,
    include: ['tests/plugins/*.test.ts'],
    exclude: rootPluginExclusions,
    testTimeout: 300000,
    hookTimeout: 120000,
    reporter: 'verbose',
    pool: 'forks',
    maxWorkers: 1,
    isolate: true,
    fileParallelism: false,
    environment: 'node',
    setupFiles: ['./tests/vitest.setup.ts'],
  },
});
