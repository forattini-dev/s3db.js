// Vitest setup file - minimal setup for compatibility
import { config } from 'dotenv';
import { beforeEach, afterEach, afterAll } from 'vitest';

config({
  quiet: true,
  debug: false,
});

process.env.NODE_ENV = 'test';
if (process.env.TEST_FORCE_MEMORY_CLIENT === undefined) {
  process.env.TEST_FORCE_MEMORY_CLIENT = 'true';
}
if (process.env.S3DB_DISABLE_CRON === undefined) {
  process.env.S3DB_DISABLE_CRON = 'true';
}

// Global test database tracking
global._testDatabases = global._testDatabases || new Set();

// Cleanup after each test
beforeEach(() => {
  // Reset any global state if needed
});

afterEach(async () => {
  const { MemoryClient } = await import('#src/clients/memory-client.class.js');

  // Disconnect test databases
  if (global._testDatabases && global._testDatabases.size > 0) {
    const databases = Array.from(global._testDatabases);
    await Promise.allSettled(databases.map(db => {
      if (db && typeof db.disconnect === 'function') {
        return db.disconnect().catch(() => {});
      }
    }));
  }

  // Clear storage
  MemoryClient.clearAllStorage();
});

afterAll(async () => {
  const { MemoryClient } = await import('#src/clients/memory-client.class.js');
  MemoryClient.clearAllStorage();

  // Force GC if available
  if (global.gc) {
    global.gc();
  }
});
