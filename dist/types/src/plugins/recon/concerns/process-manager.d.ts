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
import { type ChildProcess } from 'child_process';
export interface TrackOptions {
    name?: string;
    tempDir?: string;
}
export interface TrackedProcess {
    process: ChildProcess;
    pid: number;
    name: string;
    startTime: number;
}
export interface ProcessInfo {
    pid: number;
    name: string;
    uptime: number;
}
export interface CleanupOptions {
    force?: boolean;
    silent?: boolean;
}
export declare class ProcessManager {
    private processes;
    private tempDirs;
    private cleanupHandlersRegistered;
    private logger;
    constructor();
    track(childProcess: ChildProcess, options?: TrackOptions): void;
    trackTempDir(dirPath: string): void;
    private _removeProcess;
    private _setupCleanupHandlers;
    cleanup(options?: CleanupOptions): Promise<void>;
    private _killProcess;
    private _isProcessRunning;
    private _waitForProcessExit;
    private _cleanupTempDir;
    private _cleanupOrphanedPuppeteer;
    getProcessCount(): number;
    getProcesses(): ProcessInfo[];
    forceCleanup(): Promise<void>;
}
//# sourceMappingURL=process-manager.d.ts.map