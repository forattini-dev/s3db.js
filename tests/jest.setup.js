import { config } from 'dotenv';

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

// Global configurations to prevent deadlocks
global.originalSetTimeout = global.setTimeout;
global.originalSetInterval = global.setInterval;
global.originalClearTimeout = global.clearTimeout;
global.originalClearInterval = global.clearInterval;

// Force cleanup of all timers and resources
const forceCleanup = async () => {
  try {
    // Cleanup all test databases (prevents resource leaks)
    if (global._testDatabases && global._testDatabases.size > 0) {
      console.log(`[Cleanup] Disconnecting ${global._testDatabases.size} test databases`);
      const databases = Array.from(global._testDatabases);
      await Promise.allSettled(databases.map(db => {
        if (db && typeof db.disconnect === 'function') {
          return db.disconnect().catch(() => {});
        }
      }));
      global._testDatabases.clear();
      console.log('[Cleanup] All databases disconnected');
    }

    // Clear all MemoryClient storage (brute-force for OOM in tests)
    const { MemoryClient } = await import('#src/clients/memory-client.class.js');
    MemoryClient.clearAllStorage();
    console.log('[Cleanup] MemoryClient storage cleared');

    // Clear all timers
    if (typeof jest !== 'undefined' && jest.clearAllTimers) {
      jest.clearAllTimers();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Clear open handles
    if (process.stdout && process.stdout.destroy) {
      // Just force flush, don't destroy stdout
      process.stdout.write('');
    }
  } catch (e) {
    // Ignore cleanup errors
  }
};

// Track if cleanup has already run to prevent double execution
let cleanupExecuted = false;

// Async cleanup for signals that support it
const asyncCleanupSignals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK', 'uncaughtException', 'unhandledRejection'];
asyncCleanupSignals.forEach(signal => {
  process.on(signal, async (error) => {
    if (cleanupExecuted) return;
    cleanupExecuted = true;

    try {
      await forceCleanup();
    } catch (e) {
      // Ignore cleanup errors
    }

    // For error signals, exit silently (logging after tests causes Jest warnings)
    if (signal === 'uncaughtException' || signal === 'unhandledRejection') {
      // Don't log here - Jest already finished and logging causes "Cannot log after tests are done"
      // The error was already caught by Jest's error handling
      process.exit(1);
    } else {
      // For termination signals, exit gracefully
      process.exit(0);
    }
  });
});

// Sync cleanup for exit events (async not supported)
process.on('exit', (code) => {
  if (cleanupExecuted) return;

  // Synchronous cleanup only - disconnect databases synchronously if possible
  try {
    if (global._testDatabases && global._testDatabases.size > 0) {
      const databases = Array.from(global._testDatabases);
      databases.forEach(db => {
        if (db && typeof db.disconnect === 'function') {
          // Try to call disconnect but don't wait (exit doesn't allow async)
          db.disconnect().catch(() => {});
        }
        // Remove listeners synchronously
        if (db.client && typeof db.client.removeAllListeners === 'function') {
          db.client.removeAllListeners();
        }
        if (typeof db.removeAllListeners === 'function') {
          db.removeAllListeners();
        }
      });
      global._testDatabases.clear();
    }

    // Clear timers
    if (typeof jest !== 'undefined' && jest.clearAllTimers) {
      jest.clearAllTimers();
    }
  } catch (e) {
    // Ignore cleanup errors on exit
  }
});

// BeforeExit allows async operations
process.on('beforeExit', async (code) => {
  if (cleanupExecuted) return;
  cleanupExecuted = true;

  try {
    await forceCleanup();
  } catch (e) {
    // Ignore cleanup errors
  }
});

// Make cleanup function available globally
global.forceCleanup = forceCleanup;

// CRITICAL: Add global afterEach to prevent database leaks
// This runs after EVERY test to ensure databases are disconnected
    if (typeof afterEach !== 'undefined') {
      afterEach(async () => {
        const { MemoryClient } = await import('#src/clients/memory-client.class.js');
        if (global._testDatabases && global._testDatabases.size > 0) {
          const databases = Array.from(global._testDatabases);
          await Promise.allSettled(databases.map(db => {
            if (db && typeof db.disconnect === 'function') {
              return db.disconnect().catch(() => {});
            }
          }));
          // Don't clear the set, just disconnect. Individual tests will remove themselves.
        }
        // Aggressively clear ALL MemoryClient storage after each test
        MemoryClient.clearAllStorage();
      });
    }
