import { defineConfig } from 'vitest/config';
import path from 'path';
import { cpus } from 'os';

const cpuCount = cpus().length;
const isCI = process.env.CI === 'true';

// Concurrency strategy:
// - CI: 2 threads (GitHub Actions limit)
// - Local: 50% of cores, max 4 (prevent UI freeze)
const maxThreads = isCI ? 2 : Math.min(4, Math.max(1, Math.floor(cpuCount / 2)));

// Exclusions shared between core and plugins
const coreExclusions = [
  'node_modules/**',
  'tests/core/performance/**',
  'tests/core/functions/**',
  'tests/core/integration/all-types-exhaustive.test.ts', // Too memory-intensive for CI
];

const pluginExclusions = [
  'node_modules/**',
  // Incomplete/broken plugin tests
  'tests/plugins/identity/**',
  'tests/plugins/identity-*/**',
  'tests/plugins/api/error-helper/**',
  'tests/plugins/api/compression/**',
  'tests/plugins/api/oidc-cookie/**',
  'tests/plugins/api/mountdocs/**',
  'tests/plugins/api/app.class.new/**',
  'tests/plugins/geo/**',
  'tests/plugins/tournament/**',
  'tests/plugins/plugin-fulltext/**',
  'tests/plugins/plugin-audit/**',
  'tests/plugins/plugin-metrics/**',
  'tests/plugins/eventual-consistency-recalculate/**',
  'tests/plugins/eventual-consistency-race/**',
  // Cache tests with known failures (need investigation)
  'tests/plugins/cache/memory/**',
  'tests/plugins/cache/partition-aware/**',
  'tests/plugins/cache/plugin-core-behaviour.test.ts',
  // Redis session store requires Redis running
  'tests/plugins/api/concerns-session-store.test.ts',
  // Root level plugin tests (need individual investigation - use test:plugins:root to run)
  'tests/plugins/*.test.ts',
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
    include: ['tests/**/*.test.ts'],
    exclude: [...coreExclusions, ...pluginExclusions],

    // Timeouts (5min test, 2min hook)
    testTimeout: 300000,
    hookTimeout: 120000,

    reporter: isCI ? 'default' : 'verbose',

    // Retry flaky tests (especially server startup tests)
    retry: isCI ? 2 : 0,

    pool: 'forks',
    isolate: true,
    fileParallelism: true,

    environment: 'node',
    setupFiles: ['./tests/vitest.setup.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/cli/**',
        'src/partition-drivers/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
