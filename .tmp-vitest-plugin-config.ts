import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '#src': path.resolve(process.cwd(), './src'),
      '#tests': path.resolve(process.cwd(), './tests')
    }
  },
  test: {
    globals: true,
    include: ['tests/plugins/plugin-s3-queue-concurrent.test.ts'],
    exclude: ['node_modules/**'],
    environment: 'node',
    setupFiles: ['./tests/vitest.setup.ts'],
    testTimeout: 300000,
    hookTimeout: 120000
  }
});
