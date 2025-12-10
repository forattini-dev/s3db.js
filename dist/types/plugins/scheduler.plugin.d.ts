import { CoordinatorPlugin } from "./concerns/coordinator-plugin.class.js";
interface Logger {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Database {
    createResource(config: ResourceConfig): Promise<Resource>;
    resources: Record<string, Resource>;
}
interface Resource {
    name: string;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    query(filter: Record<string, unknown>, options?: QueryOptions): Promise<Record<string, unknown>[]>;
}
interface ResourceConfig {
    name: string;
    attributes: Record<string, string>;
    behavior?: string;
    partitions?: Record<string, PartitionConfig>;
}
interface PartitionConfig {
    fields: Record<string, string>;
}
interface QueryOptions {
    limit?: number;
    offset?: number;
}
type JobAction = (database: Database, context: JobContext, scheduler: SchedulerPlugin) => Promise<unknown>;
interface JobConfig {
    schedule: string;
    description?: string;
    action: JobAction;
    enabled?: boolean;
    retries?: number;
    timeout?: number;
}
interface JobData extends JobConfig {
    enabled: boolean;
    retries: number;
    timeout: number;
    lastRun: Date | null;
    nextRun: Date | null;
    runCount: number;
    successCount: number;
    errorCount: number;
}
interface JobContext {
    jobName: string;
    executionId: string;
    scheduledTime: Date;
    database: Database;
}
interface JobStatistics {
    totalRuns: number;
    totalSuccesses: number;
    totalErrors: number;
    avgDuration: number;
    lastRun: Date | null;
    lastSuccess: Date | null;
    lastError: JobError | null;
}
interface JobError {
    time: Date;
    message: string;
}
interface JobStatus {
    name: string;
    enabled: boolean;
    schedule: string;
    description?: string;
    lastRun: Date | null;
    nextRun: Date | null;
    isRunning: boolean;
    statistics: {
        totalRuns: number;
        totalSuccesses: number;
        totalErrors: number;
        successRate: number;
        avgDuration: number;
        lastSuccess: Date | null;
        lastError: JobError | null;
    };
}
interface JobHistoryEntry {
    id: string;
    status: string;
    startTime: Date;
    endTime: Date | null;
    duration: number;
    result: unknown;
    error: string | null;
    retryCount: number;
}
interface JobHistoryOptions {
    limit?: number;
    status?: string | null;
}
type JobStartHook = (jobName: string, context: JobContext) => void | Promise<void>;
type JobCompleteHook = (jobName: string, result: unknown, duration: number) => void | Promise<void>;
type JobErrorHook = (jobName: string, error: Error, attempt: number) => void | Promise<void>;
export interface SchedulerPluginOptions {
    timezone?: string;
    jobs?: Record<string, JobConfig>;
    defaultTimeout?: number;
    defaultRetries?: number;
    jobHistoryResource?: string;
    persistJobs?: boolean;
    onJobStart?: JobStartHook | null;
    onJobComplete?: JobCompleteHook | null;
    onJobError?: JobErrorHook | null;
    logLevel?: string;
    logger?: Logger;
}
interface SchedulerConfig {
    timezone: string;
    jobs: Record<string, JobConfig>;
    defaultTimeout: number;
    defaultRetries: number;
    jobHistoryResource: string;
    persistJobs: boolean;
    onJobStart: JobStartHook | null;
    onJobComplete: JobCompleteHook | null;
    onJobError: JobErrorHook | null;
    logLevel?: string;
}
export declare class SchedulerPlugin extends CoordinatorPlugin {
    namespace: string;
    logLevel: string;
    workerId: string;
    isCoordinator: boolean;
    config: SchedulerConfig;
    jobs: Map<string, JobData>;
    activeJobs: Map<string, string>;
    timers: Map<string, ReturnType<typeof setTimeout>>;
    statistics: Map<string, JobStatistics>;
    constructor(options?: SchedulerPluginOptions);
    private _isTestEnvironment;
    private _validateConfiguration;
    private _isValidCronExpression;
    onInstall(): Promise<void>;
    private _createJobHistoryResource;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    private _startScheduling;
    private _scheduleNextExecution;
    private _calculateNextRun;
    _calculateNextRunFromConfig(config?: {
        enabled?: boolean;
        schedule?: string;
        timezone?: string;
    }): Date | null;
    private _executeJob;
    private _persistJobExecution;
    private _executeHook;
    runJob(jobName: string, context?: Record<string, unknown>): Promise<void>;
    enableJob(jobName: string): void;
    disableJob(jobName: string): void;
    getJobStatus(jobName: string): JobStatus | null;
    getAllJobsStatus(): JobStatus[];
    getJobHistory(jobName: string, options?: JobHistoryOptions): Promise<JobHistoryEntry[]>;
    addJob(jobName: string, jobConfig: JobConfig): void;
    removeJob(jobName: string): void;
    getPlugin(pluginName: string): unknown;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export {};
//# sourceMappingURL=scheduler.plugin.d.ts.map