import { Plugin, PluginConfig } from '../plugin.class.js';
import { S3DBLogger } from '../../concerns/logger.js';
import type { GlobalCoordinatorService, LeaderChangeEvent } from './global-coordinator-service.class.js';
export interface CoordinatorConfig extends PluginConfig {
    enableCoordinator?: boolean;
    startupJitterMin?: number;
    startupJitterMax?: number;
    coldStartDuration?: number;
    skipColdStart?: boolean;
    coordinatorWorkInterval?: number | null;
    heartbeatInterval?: number;
    heartbeatJitter?: number;
    leaseTimeout?: number;
    workerTimeout?: number;
    logger?: S3DBLogger;
    epochFencingEnabled?: boolean;
    epochGracePeriodMs?: number;
}
export interface NormalizedCoordinatorConfig {
    enableCoordinator: boolean;
    startupJitterMin: number;
    startupJitterMax: number;
    coldStartDuration: number;
    skipColdStart: boolean;
    coordinatorWorkInterval: number | null;
    heartbeatInterval: number;
    heartbeatJitter: number;
    leaseTimeout: number;
    workerTimeout: number;
    epochFencingEnabled: boolean;
    epochGracePeriodMs: number;
}
export interface EpochValidationResult {
    valid: boolean;
    reason?: 'stale' | 'grace_period' | 'current';
    taskEpoch: number;
    currentEpoch: number;
}
export type ColdStartPhase = 'not_started' | 'observing' | 'election' | 'preparation' | 'ready';
export interface IntervalHandle {
    type: 'cron' | 'manual';
    jobName?: string;
    timer?: ReturnType<typeof setInterval>;
}
export type { LeaderChangeEvent } from './global-coordinator-service.class.js';
export interface CoordinatorEventData {
    workerId: string;
    timestamp: number;
    pluginName: string;
}
export interface ColdStartPhaseEventData extends CoordinatorEventData {
    phase: ColdStartPhase;
    workersDiscovered?: number;
    leaderId?: string | null;
    isLeader?: boolean;
}
export interface ColdStartCompleteEventData extends CoordinatorEventData {
    duration: number;
    isLeader: boolean;
}
export declare class CoordinatorPlugin<TOptions extends CoordinatorConfig = CoordinatorConfig> extends Plugin<TOptions> {
    slug: string;
    workerId: string;
    workerStartTime: number;
    isCoordinator: boolean;
    currentLeaderId: string | null;
    protected _globalCoordinator: GlobalCoordinatorService | null;
    protected _leaderChangeListener: ((event: LeaderChangeEvent) => Promise<void>) | null;
    protected _heartbeatHandle: IntervalHandle | null;
    protected _coordinatorWorkHandle: IntervalHandle | null;
    coldStartPhase: ColdStartPhase;
    coldStartCompleted: boolean;
    protected _coordinatorConfig: NormalizedCoordinatorConfig;
    protected _coordinationStarted: boolean;
    protected _lastKnownEpoch: number;
    protected _lastEpochChangeTime: number;
    constructor(config?: TOptions);
    protected _normalizeConfig(config: CoordinatorConfig): NormalizedCoordinatorConfig;
    onBecomeCoordinator(): Promise<void>;
    onStopBeingCoordinator(): Promise<void>;
    coordinatorWork(): Promise<void>;
    get coordinatorConfig(): NormalizedCoordinatorConfig;
    get enableCoordinator(): boolean;
    startCoordination(): Promise<void>;
    protected _runBackgroundElection(): Promise<void>;
    stopCoordination(): Promise<void>;
    isLeader(): Promise<boolean>;
    getLeader(): Promise<string | null>;
    getActiveWorkers(): Promise<unknown[]>;
    getCurrentEpoch(): Promise<number>;
    /**
     * Validates if a task should be processed based on its epoch.
     * Inspired by etcd Raft's Term fencing mechanism.
     *
     * Returns true if the task should be processed, false if it should be rejected.
     * Tasks from stale epochs are rejected to prevent split-brain scenarios.
     */
    validateEpoch(taskEpoch: number, taskTimestamp?: number): EpochValidationResult;
    /**
     * Convenience method that returns boolean only.
     */
    isEpochValid(taskEpoch: number, taskTimestamp?: number): boolean;
    protected _initializeGlobalCoordinator(): Promise<void>;
    protected _setupLeaderChangeListener(): void;
    protected _clearLeaderChangeListener(): void;
    protected _executeColdStart(): Promise<void>;
    protected _startCoordinatorWork(): Promise<void>;
    protected _scheduleInterval(fn: () => Promise<void>, intervalMs: number, name: string): Promise<IntervalHandle>;
    protected _clearIntervalHandle(handle: IntervalHandle | null): void;
    protected _sleep(ms: number): Promise<void>;
    protected _generateWorkerId(): string;
}
//# sourceMappingURL=coordinator-plugin.class.d.ts.map