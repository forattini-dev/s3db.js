import { S3DBLogger, LogLevel } from './logger.js';
export interface CronManagerOptions {
    logLevel?: LogLevel;
    shutdownTimeout?: number;
    exitOnSignal?: boolean;
    disabled?: boolean;
    logger?: S3DBLogger;
}
export interface CronJobEntry {
    task: CronTask;
    expression: string;
    fn: () => void | Promise<void>;
    options: ScheduleOptions;
    createdAt: number;
}
export interface CronTask {
    start(): void;
    stop(): void;
    destroy?(): void;
    run?(...args: unknown[]): Promise<void>;
}
export interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
    recoverMissedExecutions?: boolean;
    replace?: boolean;
}
export interface JobStats {
    name: string;
    expression: string;
    createdAt: number;
    uptime: number;
}
export interface CronStats {
    totalJobs: number;
    jobs: JobStats[];
    isDestroyed: boolean;
}
export interface CronShutdownOptions {
    timeout?: number;
    signal?: string;
    error?: Error;
}
export declare function intervalToCron(ms: number): string;
export declare const CRON_PRESETS: {
    readonly EVERY_SECOND: "* * * * * *";
    readonly EVERY_5_SECONDS: `${string} * * * * *`;
    readonly EVERY_10_SECONDS: `${string} * * * * *`;
    readonly EVERY_15_SECONDS: `${string} * * * * *`;
    readonly EVERY_30_SECONDS: `${string} * * * * *`;
    readonly EVERY_MINUTE: "* * * * *";
    readonly EVERY_5_MINUTES: `${string} * * * *`;
    readonly EVERY_10_MINUTES: `${string} * * * *`;
    readonly EVERY_15_MINUTES: `${string} * * * *`;
    readonly EVERY_30_MINUTES: `${string} * * * *`;
    readonly EVERY_HOUR: "0 * * * *";
    readonly EVERY_2_HOURS: string;
    readonly EVERY_6_HOURS: string;
    readonly EVERY_12_HOURS: string;
    readonly EVERY_DAY: "0 0 * * *";
    readonly EVERY_DAY_NOON: "0 12 * * *";
    readonly EVERY_WEEK: "0 0 * * 0";
    readonly EVERY_MONTH: "0 0 1 * *";
    readonly BUSINESS_HOURS_START: "0 9 * * 1-5";
    readonly BUSINESS_HOURS_END: "0 17 * * 1-5";
};
export declare class CronManager {
    private options;
    private logger;
    private jobs;
    private _cron;
    private _destroyed;
    private _signalHandlersSetup;
    private _boundShutdownHandler?;
    private _boundErrorHandler?;
    disabled: boolean;
    constructor(options?: CronManagerOptions);
    private _setupSignalHandlers;
    removeSignalHandlers(): void;
    private _handleShutdown;
    private _handleError;
    private _loadCron;
    schedule(expression: string, fn: () => void | Promise<void>, name: string, options?: ScheduleOptions): Promise<CronTask | null>;
    scheduleInterval(ms: number, fn: () => void | Promise<void>, name: string, options?: ScheduleOptions): Promise<CronTask | null>;
    stop(name: string): boolean;
    getStats(): CronStats;
    isDestroyed(): boolean;
    shutdown(options?: CronShutdownOptions): Promise<void>;
    private _createStubTask;
    private _inferIntervalFromExpression;
    private _createTestCronStub;
}
export declare function getCronManager(options?: CronManagerOptions): CronManager;
export declare function resetCronManager(): void;
export declare function createCronManager(options?: CronManagerOptions): CronManager;
//# sourceMappingURL=cron-manager.d.ts.map