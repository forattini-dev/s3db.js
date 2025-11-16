/**
 * ProcessManager
 *
 * Manages child processes and cleanup for ReconPlugin.
 * Ensures all spawned processes (Chrome/Puppeteer, external tools) are properly terminated
 * when the parent process exits or when operations complete.
 *
 * Key Features:
 * - Tracks all spawned child processes
 * - Automatic cleanup on process exit (SIGINT, SIGTERM, uncaughtException)
 * - Force kill orphaned processes
 * - Cleanup temporary directories (Puppeteer profiles, etc.)
 * - Prevents zombie processes
 *
 * Usage:
 * const processManager = new ProcessManager();
 * processManager.track(childProcess);
 * processManager.cleanup(); // Manual cleanup
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export class ProcessManager {
  constructor() {
    this.processes = new Set();
    this.tempDirs = new Set();
    this.cleanupHandlersRegistered = false;
    this._setupCleanupHandlers();
  }

  /**
   * Track a child process for automatic cleanup
   * @param {ChildProcess} process - Child process to track
   * @param {Object} options - Tracking options
   * @param {string} options.name - Process name for logging
   * @param {string} options.tempDir - Temporary directory to cleanup
   */
  track(process, options = {}) {
    if (!process || !process.pid) {
      return;
    }

    this.processes.add({
      process,
      pid: process.pid,
      name: options.name || 'unknown',
      startTime: Date.now()
    });

    if (options.tempDir) {
      this.tempDirs.add(options.tempDir);
    }

    // Auto-remove when process exits
    process.on('exit', () => {
      this._removeProcess(process.pid);
    });

    // Handle errors
    process.on('error', (error) => {
      this.logger.error(`[ProcessManager] Process ${options.name || process.pid} error:`, error.message);
      this._removeProcess(process.pid);
    });
  }

  /**
   * Track a temporary directory for cleanup
   * @param {string} dirPath - Directory path
   */
  trackTempDir(dirPath) {
    this.tempDirs.add(dirPath);
  }

  /**
   * Remove process from tracking
   * @private
   */
  _removeProcess(pid) {
    for (const tracked of this.processes) {
      if (tracked.pid === pid) {
        this.processes.delete(tracked);
        break;
      }
    }
  }

  /**
   * Setup cleanup handlers for process exit
   * @private
   */
  _setupCleanupHandlers() {
    if (this.cleanupHandlersRegistered) {
      return;
    }

    const cleanup = async (signal) => {
      this.logger.info(`\n[ProcessManager] Received ${signal}, cleaning up...`);
      await this.cleanup();
      process.exit(0);
    };

    // Handle various exit signals
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGHUP', () => cleanup('SIGHUP'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      this.logger.error('[ProcessManager] Uncaught exception:', error);
      await this.cleanup();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      this.logger.error('[ProcessManager] Unhandled rejection:', reason);
      await this.cleanup();
      process.exit(1);
    });

    // Handle process exit
    process.on('beforeExit', async () => {
      await this.cleanup();
    });

    this.cleanupHandlersRegistered = true;
  }

  /**
   * Cleanup all tracked processes and temporary directories
   * @param {Object} options - Cleanup options
   * @param {boolean} options.force - Force kill processes (SIGKILL)
   * @param {boolean} options.silent - Suppress logging
   */
  async cleanup(options = {}) {
    const { force = false, silent = false } = options;

    if (!silent && this.processes.size > 0) {
      this.logger.info(`[ProcessManager] Cleaning up ${this.processes.size} tracked process(es)...`);
    }

    // Kill all tracked processes
    const killPromises = [];
    for (const tracked of this.processes) {
      killPromises.push(this._killProcess(tracked, force, silent));
    }
    await Promise.allSettled(killPromises);

    // Cleanup temporary directories
    if (this.tempDirs.size > 0 && !silent) {
      this.logger.info(`[ProcessManager] Cleaning up ${this.tempDirs.size} temporary directory(ies)...`);
    }

    const cleanupPromises = [];
    for (const dir of this.tempDirs) {
      cleanupPromises.push(this._cleanupTempDir(dir, silent));
    }
    await Promise.allSettled(cleanupPromises);

    // Cleanup orphaned Puppeteer processes
    await this._cleanupOrphanedPuppeteer(silent);

    this.processes.clear();
    this.tempDirs.clear();

    if (!silent) {
      this.logger.info('[ProcessManager] Cleanup complete');
    }
  }

  /**
   * Kill a tracked process
   * @private
   */
  async _killProcess(tracked, force, silent) {
    const { process, pid, name } = tracked;

    if (!this._isProcessRunning(pid)) {
      this._removeProcess(pid);
      return;
    }

    const signal = force ? 'SIGKILL' : 'SIGTERM';

    if (!silent) {
      this.logger.info(`[ProcessManager] Killing ${name} (PID: ${pid}) with ${signal}...`);
    }

    try {
      process.kill(signal);

      // Wait up to 5 seconds for graceful termination
      if (!force) {
        await this._waitForProcessExit(pid, 5000);

        // If still running, force kill
        if (this._isProcessRunning(pid)) {
          if (!silent) {
            this.logger.info(`[ProcessManager] Force killing ${name} (PID: ${pid})...`);
          }
          process.kill('SIGKILL');
        }
      }
    } catch (error) {
      if (error.code !== 'ESRCH') { // Ignore "process not found" errors
        this.logger.error(`[ProcessManager] Error killing ${name} (PID: ${pid}):`, error.message);
      }
    }

    this._removeProcess(pid);
  }

  /**
   * Check if process is running
   * @private
   */
  _isProcessRunning(pid) {
    try {
      process.kill(pid, 0); // Signal 0 checks existence without killing
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for process to exit
   * @private
   */
  async _waitForProcessExit(pid, timeout = 5000) {
    const startTime = Date.now();
    while (this._isProcessRunning(pid) && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Cleanup temporary directory
   * @private
   */
  async _cleanupTempDir(dir, silent) {
    try {
      const exists = await fs.access(dir).then(() => true).catch(() => false);
      if (exists) {
        await fs.rm(dir, { recursive: true, force: true });
        if (!silent) {
          this.logger.info(`[ProcessManager] Removed temp directory: ${dir}`);
        }
      }
    } catch (error) {
      this.logger.error(`[ProcessManager] Error cleaning up ${dir}:`, error.message);
    }
  }

  /**
   * Cleanup orphaned Puppeteer processes and temp directories
   * @private
   */
  async _cleanupOrphanedPuppeteer(silent) {
    try {
      // Kill orphaned Chrome/Puppeteer processes
      const { stdout } = await execAsync('pgrep -f "chrome.*puppeteer" || true');
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n').filter(Boolean);
        if (!silent && pids.length > 0) {
          this.logger.info(`[ProcessManager] Found ${pids.length} orphaned Puppeteer process(es), killing...`);
        }
        for (const pid of pids) {
          try {
            process.kill(parseInt(pid), 'SIGKILL');
          } catch (error) {
            // Ignore errors (process may have already exited)
          }
        }
      }

      // Cleanup orphaned Puppeteer temp directories
      const tmpDir = os.tmpdir();
      const puppeteerPattern = /^puppeteer_dev_profile-/;

      const entries = await fs.readdir(tmpDir, { withFileTypes: true });
      const puppeteerDirs = entries
        .filter(entry => entry.isDirectory() && puppeteerPattern.test(entry.name))
        .map(entry => path.join(tmpDir, entry.name));

      if (puppeteerDirs.length > 0 && !silent) {
        this.logger.info(`[ProcessManager] Cleaning up ${puppeteerDirs.length} orphaned Puppeteer temp dir(s)...`);
      }

      for (const dir of puppeteerDirs) {
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch (error) {
          // Ignore errors (may be in use or already deleted)
        }
      }
    } catch (error) {
      // Silently ignore errors in orphan cleanup
      if (!silent) {
        this.logger.error('[ProcessManager] Error during orphan cleanup:', error.message);
      }
    }
  }

  /**
   * Get count of tracked processes
   */
  getProcessCount() {
    return this.processes.size;
  }

  /**
   * Get list of tracked processes
   */
  getProcesses() {
    return Array.from(this.processes).map(({ pid, name, startTime }) => ({
      pid,
      name,
      uptime: Date.now() - startTime
    }));
  }

  /**
   * Force cleanup all processes immediately
   */
  async forceCleanup() {
    await this.cleanup({ force: true, silent: false });
  }
}

// NOTE: Singleton export removed to prevent auto-initialization on import.
// ProcessManager is now lazy-initialized inside ReconPlugin constructor.
// This prevents global signal handlers from being registered when s3db.js is imported.
