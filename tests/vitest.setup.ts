// Vitest setup file - minimal setup for compatibility
import { config } from 'dotenv';
import { beforeEach, afterEach, afterAll } from 'vitest';

config({
  quiet: true,
  debug: false,
});

process.env.NODE_ENV = 'test';
if (process.env.TEST_FORCE_MEMORY_CLIENT === undefined) {
  process.env.TEST_FORCE_MEMORY_CLIENT = 'false';
}
if (process.env.TEST_USE_FILESYSTEM_CLIENT === undefined) {
  process.env.TEST_USE_FILESYSTEM_CLIENT = 'true';
}
if (process.env.S3DB_DISABLE_CRON === undefined) {
  process.env.S3DB_DISABLE_CRON = 'true';
}

// Global test database tracking
global._testDatabases = global._testDatabases || new Set();

// Cleanup after each test
// NOTE: Do NOT disconnect databases here - tests using beforeAll/afterAll
// manage their own lifecycle. Disconnecting here breaks shared test fixtures.
beforeEach(() => {
  // Reset any global state if needed
});

afterEach(async () => {
  // Do NOT disconnect databases here!
  // Tests using beforeAll need their databases to persist across tests.
  // Each test file is responsible for cleanup in afterAll.
});

afterAll(async () => {
  const { MemoryClient } = await import('#src/clients/memory-client.class.js');
  MemoryClient.clearAllStorage();

  // Force GC if available
  if (global.gc) {
    global.gc();
  }
});
