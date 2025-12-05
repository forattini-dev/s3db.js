import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '#src': path.resolve(__dirname, './src'),
      '#tests': path.resolve(__dirname, './tests'),
    },
  },
  test: {
    // Globals like Jest (describe, it, expect)
    globals: true,

    // Use same test patterns as Jest
    include: ['tests/**/*.test.js'],
    exclude: [
      'node_modules/**',
      'tests/typescript/**',
      'tests/plugins/identity/**',
      'tests/plugins/identity-*/**',
      'tests/plugins/api/error-helper/**',
      'tests/plugins/api/compression/**',
      'tests/plugins/api/oidc-cookie/**',
      'tests/plugins/api/mountdocs/**',
      'tests/plugins/geo/**',
      'tests/plugins/tournament/**',
      'tests/plugins/plugin-fulltext/**',
      'tests/performance/**',
      'tests/plugins/eventual-consistency-recalculate/**',
      'tests/plugins/eventual-consistency-race/**',
      'tests/plugins/plugin-audit/**',
      'tests/plugins/api/app.class.new/**',
      'tests/functions/**',
      'tests/plugins/plugin-metrics/**',
    ],

    // Timeouts
    testTimeout: 120000,
    hookTimeout: 30000,

    // Reporter
    reporter: 'verbose',

    // Pool settings - use threads with single worker for lower memory usage
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
        minThreads: 1,
      }
    },

    // Environment
    environment: 'node',

    // Setup files
    setupFiles: ['./tests/vitest.setup.js'],

    // Coverage with 90% minimum threshold
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/index.js',
        'src/cli/**',
        'src/partition-drivers/**',
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
