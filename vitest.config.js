import { defineConfig } from 'vitest/config';
import path from 'path';
import { cpus } from 'os';

const cpuCount = cpus().length;
const isCI = process.env.CI === 'true';

// Strategy to prevent "Black Hole" resource usage:
// 1. Limit concurrency: Never use 100% CPU. Leave room for OS/Browser.
// 2. Enable Isolation: 'singleThread: false' ensures test files don't share global scope/memory forever.
// 3. Max Threads: 
//    - CI: 2 (GitHub Actions standard limit)
//    - Local: 50% of Cores, capped at 4. (e.g., 8 cores -> 4 threads). 
//      This prevents freezing the UI while tests run.

const maxThreads = isCI ? 2 : Math.min(4, Math.max(1, Math.floor(cpuCount / 2)));

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
      // Plugin exclusions
      'tests/plugins/identity/**',
      'tests/plugins/identity-*/**',
      'tests/plugins/api/error-helper/**',
      'tests/plugins/api/compression/**',
      'tests/plugins/api/oidc-cookie/**',
      'tests/plugins/api/mountdocs/**',
      'tests/plugins/geo/**',
      'tests/plugins/tournament/**',
      'tests/plugins/plugin-fulltext/**',
      'tests/plugins/eventual-consistency-recalculate/**',
      'tests/plugins/eventual-consistency-race/**',
      'tests/plugins/plugin-audit/**',
      'tests/plugins/api/app.class.new/**',
      'tests/plugins/plugin-metrics/**',
      // Core exclusions
      'tests/core/performance/**',
      'tests/core/functions/**',
    ],

    // Timeouts
    testTimeout: 120000,
    hookTimeout: 60000,

    // Reporter
    reporter: isCI ? 'default' : 'verbose',

    // Pool settings - use threads with controlled concurrency
    pool: 'threads',
    poolOptions: {
      threads: {
        // CRITICAL: Disable singleThread to ensure isolation and GC between files.
        // Enabling singleThread causes memory to accumulate indefinitely.
        singleThread: false,
        isolate: true,
        maxThreads: maxThreads,
        minThreads: 1,
        useAtomics: true
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