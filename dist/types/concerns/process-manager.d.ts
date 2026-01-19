import { S3DBLogger, LogLevel } from './logger.js';
export interface ProcessManagerOptions {
    logLevel?: LogLevel;
    shutdownTimeout?: number;
    exitOnSignal?: boolean;
    logger?: S3DBLogger;
}
export interface IntervalEntry {
    id: ReturnType<typeof setTimeout>;
    fn: () => void;
    interval: number;
    precise: boolean;
}
export interface TimeoutEntry {
    id: ReturnType<typeof setTimeout>;
    fn: () => void;
    delay: number;
}
export type CleanupFn = () => Promise<void> | void;
export interface ProcessManagerStatus {
    isShuttingDown: boolean;
    intervals: string[];
    timeouts: string[];
    cleanups: string[];
    counts: {
        intervals: number;
        timeouts: number;
        cleanups: number;
    };
}
export interface ShutdownOptions {
    timeout?: number;
}
export declare class ProcessManager {
    private options;
    private logger;
    private intervals;
    private timeouts;
    private cleanups;
    private isShuttingDown;
    private shutdownPromise;
    private _boundSignalHandler;
    private _boundUncaughtHandler;
    private _boundUnhandledHandler;
    private _signalHandlersSetup;
    constructor(options?: ProcessManagerOptions);
    setInterval(fn: () => void, interval: number, name: string): ReturnType<typeof setTimeout>;
    clearInterval(name: string): void;
    setTimeout(fn: () => void, delay: number, name: string): ReturnType<typeof setTimeout>;
    clearTimeout(name: string): void;
    registerCleanup(cleanupFn: CleanupFn, name: string): void;
    unregisterCleanup(name: string): void;
    private _setupSignalHandlers;
    private _handleSignal;
    shutdown(options?: ShutdownOptions): Promise<void>;
    private _performShutdown;
    getStatus(): ProcessManagerStatus;
    removeSignalHandlers(): void;
}
export declare function getProcessManager(options?: ProcessManagerOptions): ProcessManager;
export declare function resetProcessManager(): void;
export default ProcessManager;
//# sourceMappingURL=process-manager.d.ts.map