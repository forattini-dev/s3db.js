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
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '../../../concerns/logger.js';
import { bumpProcessMaxListeners } from '../../../concerns/process-max-listeners.js';
const execAsync = promisify(exec);
export class ProcessManager {
    processes;
    tempDirs;
    cleanupHandlersRegistered;
    logger;
    constructor() {
        this.processes = new Set();
        this.tempDirs = new Set();
        this.cleanupHandlersRegistered = false;
        this.logger = createLogger({ name: 'recon-process-manager' });
        this._setupCleanupHandlers();
    }
    track(childProcess, options = {}) {
        if (!childProcess || !childProcess.pid) {
            return;
        }
        this.processes.add({
            process: childProcess,
            pid: childProcess.pid,
            name: options.name || 'unknown',
            startTime: Date.now()
        });
        if (options.tempDir) {
            this.tempDirs.add(options.tempDir);
        }
        childProcess.on('exit', () => {
            this._removeProcess(childProcess.pid);
        });
        childProcess.on('error', (error) => {
            this.logger.error(`[ProcessManager] Process ${options.name || childProcess.pid} error: ${error.message}`);
            this._removeProcess(childProcess.pid);
        });
    }
    trackTempDir(dirPath) {
        this.tempDirs.add(dirPath);
    }
    _removeProcess(pid) {
        for (const tracked of this.processes) {
            if (tracked.pid === pid) {
                this.processes.delete(tracked);
                break;
            }
        }
    }
    _setupCleanupHandlers() {
        if (this.cleanupHandlersRegistered) {
            return;
        }
        const cleanup = async (signal) => {
            this.logger.info(`\n[ProcessManager] Received ${signal}, cleaning up...`);
            await this.cleanup();
            process.exit(0);
        };
        bumpProcessMaxListeners(6);
        process.on('SIGINT', () => cleanup('SIGINT'));
        process.on('SIGTERM', () => cleanup('SIGTERM'));
        process.on('SIGHUP', () => cleanup('SIGHUP'));
        process.on('uncaughtException', async (error) => {
            this.logger.error(`[ProcessManager] Uncaught exception: ${error.message}`);
            await this.cleanup();
            process.exit(1);
        });
        process.on('unhandledRejection', async (reason) => {
            this.logger.error(`[ProcessManager] Unhandled rejection: ${reason}`);
            await this.cleanup();
            process.exit(1);
        });
        process.on('beforeExit', async () => {
            await this.cleanup();
        });
        this.cleanupHandlersRegistered = true;
    }
    async cleanup(options = {}) {
        const { force = false, silent = false } = options;
        if (!silent && this.processes.size > 0) {
            this.logger.info(`[ProcessManager] Cleaning up ${this.processes.size} tracked process(es)...`);
        }
        const killPromises = [];
        for (const tracked of this.processes) {
            killPromises.push(this._killProcess(tracked, force, silent));
        }
        await Promise.allSettled(killPromises);
        if (this.tempDirs.size > 0 && !silent) {
            this.logger.info(`[ProcessManager] Cleaning up ${this.tempDirs.size} temporary directory(ies)...`);
        }
        const cleanupPromises = [];
        for (const dir of this.tempDirs) {
            cleanupPromises.push(this._cleanupTempDir(dir, silent));
        }
        await Promise.allSettled(cleanupPromises);
        await this._cleanupOrphanedPuppeteer(silent);
        this.processes.clear();
        this.tempDirs.clear();
        if (!silent) {
            this.logger.info('[ProcessManager] Cleanup complete');
        }
    }
    async _killProcess(tracked, force, silent) {
        const { process: childProcess, pid, name } = tracked;
        if (!this._isProcessRunning(pid)) {
            this._removeProcess(pid);
            return;
        }
        const signal = force ? 'SIGKILL' : 'SIGTERM';
        if (!silent) {
            this.logger.info(`[ProcessManager] Killing ${name} (PID: ${pid}) with ${signal}...`);
        }
        try {
            childProcess.kill(signal);
            if (!force) {
                await this._waitForProcessExit(pid, 5000);
                if (this._isProcessRunning(pid)) {
                    if (!silent) {
                        this.logger.info(`[ProcessManager] Force killing ${name} (PID: ${pid})...`);
                    }
                    childProcess.kill('SIGKILL');
                }
            }
        }
        catch (error) {
            if (error.code !== 'ESRCH') {
                this.logger.error(`[ProcessManager] Error killing ${name} (PID: ${pid}): ${error.message}`);
            }
        }
        this._removeProcess(pid);
    }
    _isProcessRunning(pid) {
        try {
            process.kill(pid, 0);
            return true;
        }
        catch {
            return false;
        }
    }
    async _waitForProcessExit(pid, timeout = 5000) {
        const startTime = Date.now();
        while (this._isProcessRunning(pid) && (Date.now() - startTime) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    async _cleanupTempDir(dir, silent) {
        try {
            const exists = await fs.access(dir).then(() => true).catch(() => false);
            if (exists) {
                await fs.rm(dir, { recursive: true, force: true });
                if (!silent) {
                    this.logger.info(`[ProcessManager] Removed temp directory: ${dir}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`[ProcessManager] Error cleaning up ${dir}: ${error.message}`);
        }
    }
    async _cleanupOrphanedPuppeteer(silent) {
        try {
            const { stdout } = await execAsync('pgrep -f "chrome.*puppeteer" || true');
            if (stdout.trim()) {
                const pids = stdout.trim().split('\n').filter(Boolean);
                if (!silent && pids.length > 0) {
                    this.logger.info(`[ProcessManager] Found ${pids.length} orphaned Puppeteer process(es), killing...`);
                }
                for (const pid of pids) {
                    try {
                        process.kill(parseInt(pid), 'SIGKILL');
                    }
                    catch {
                        // Ignore errors (process may have already exited)
                    }
                }
            }
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
                }
                catch {
                    // Ignore errors (may be in use or already deleted)
                }
            }
        }
        catch (error) {
            if (!silent) {
                this.logger.error(`[ProcessManager] Error during orphan cleanup: ${error.message}`);
            }
        }
    }
    getProcessCount() {
        return this.processes.size;
    }
    getProcesses() {
        return Array.from(this.processes).map(({ pid, name, startTime }) => ({
            pid,
            name,
            uptime: Date.now() - startTime
        }));
    }
    async forceCleanup() {
        await this.cleanup({ force: true, silent: false });
    }
}
//# sourceMappingURL=process-manager.js.map