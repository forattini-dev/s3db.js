import { rm as rmdir } from 'fs/promises';

export class TestCleanupHelper {
  constructor() {
    this.directoriesToCleanup = new Set();
    this.cachesToCleanup = new Set();
    this.databasesToDisconnect = new Set();
    this.timersToCancel = new Set();
  }

  addDirectory(dirPath) {
    this.directoriesToCleanup.add(dirPath);
  }

  addCache(cache) {
    this.cachesToCleanup.add(cache);
  }

  addDatabase(db) {
    this.databasesToDisconnect.add(db);
  }

  addTimer(timerId) {
    this.timersToCancel.add(timerId);
  }

  async cleanup() {
    // Clear all timers first
    for (const timerId of this.timersToCancel) {
      try {
        clearTimeout(timerId);
        clearInterval(timerId);
      } catch (e) {
        // Ignore
      }
    }
    this.timersToCancel.clear();

    // Clear all caches
    for (const cache of this.cachesToCleanup) {
      try {
        if (cache && cache.clear) {
          await cache.clear();
        }
        if (cache && cache.destroy) {
          cache.destroy();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    this.cachesToCleanup.clear();

    // Disconnect all databases
    for (const db of this.databasesToDisconnect) {
      try {
        if (db && db.disconnect) {
          await db.disconnect();
        }
      } catch (e) {
        // Ignore disconnect errors
      }
    }
    this.databasesToDisconnect.clear();

    // Clean all directories
    for (const dirPath of this.directoriesToCleanup) {
      try {
        await rmdir(dirPath, { recursive: true });
      } catch (e) {
        // Ignore directory cleanup errors
      }
    }
    this.directoriesToCleanup.clear();
  }

  static async forceJestExit() {
    // Force Jest to exit after a short delay
    setTimeout(() => {
      process.exit(0);
    }, 100);
  }
}

export default TestCleanupHelper; 