import { config } from 'dotenv';

config({ 
  quiet: true, 
  debug: false,
});

process.env.NODE_ENV = 'test';

// Global configurations to prevent deadlocks
global.originalSetTimeout = global.setTimeout;
global.originalSetInterval = global.setInterval;
global.originalClearTimeout = global.clearTimeout;
global.originalClearInterval = global.clearInterval;

// Force cleanup of all timers and resources
const forceCleanup = () => {
  try {
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

// Cleanup on various events
process.on('exit', forceCleanup);
process.on('beforeExit', forceCleanup);
process.on('SIGTERM', forceCleanup);
process.on('SIGINT', forceCleanup);

// Make cleanup function available globally
global.forceCleanup = forceCleanup;
