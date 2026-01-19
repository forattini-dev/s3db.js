import { EventEmitter } from 'events';
import { PluginStorage } from '../../concerns/plugin-storage.js';
import { LatencyBuffer, type LatencyStats } from '../../concerns/ring-buffer.js';
import type { Database } from '../../database.class.js';
import type { S3DBLogger } from '../../concerns/logger.js';
import type { S3Client } from '../../clients/s3-client.class.js';
export interface CircuitBreakerConfig {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenMaxAttempts?: number;
}
export interface ContentionConfig {
    enabled?: boolean;
    threshold?: number;
    rateLimitMs?: number;
}
export interface GlobalCoordinatorConfig {
    heartbeatInterval?: number;
    heartbeatJitter?: number;
    leaseTimeout?: number;
    workerTimeout?: number;
    diagnosticsEnabled?: boolean | string;
    circuitBreaker?: CircuitBreakerConfig;
    contention?: ContentionConfig;
    metricsBufferSize?: number;
    stateCacheTtl?: number;
}
export interface GlobalCoordinatorOptions {
    namespace: string;
    database: Database;
    config?: GlobalCoordinatorConfig;
}
export interface CoordinatorMetrics {
    heartbeatCount: number;
    electionCount: number;
    electionDurationMs: number;
    leaderChanges: number;
    workerRegistrations: number;
    workerTimeouts: number;
    startTime: number | null;
    lastHeartbeatTime: number | null;
    circuitBreakerTrips: number;
    circuitBreakerState: CircuitBreakerState;
    contentionEvents: number;
    epochDriftEvents: number;
}
export interface EnhancedCoordinatorMetrics extends CoordinatorMetrics {
    latency: LatencyStats;
    metricsWindowSize: number;
}
export interface ContentionEvent {
    namespace: string;
    duration: number;
    expected: number;
    ratio: number;
    threshold: number;
    timestamp: number;
}
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';
export interface CircuitBreakerInternalState {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    openedAt: number | null;
    failureThreshold: number;
    resetTimeout: number;
    halfOpenMaxAttempts: number;
}
export interface LeaderState {
    leaderId: string | null;
    leaderPod?: string;
    epoch: number;
    leaseStart?: number;
    leaseEnd?: number;
    electedBy?: string;
    electedAt?: number;
}
export interface WorkerData {
    workerId: string;
    pluginName: string;
    pod: string;
    lastHeartbeat: number;
    startTime: number | null;
    namespace: string;
}
export interface LeaderChangeEvent {
    namespace: string;
    previousLeader: string | null;
    newLeader: string | null;
    epoch: number;
    timestamp: number;
}
export interface CircuitBreakerEvent {
    namespace: string;
    failureCount: number;
}
export interface CircuitBreakerStatus {
    state: CircuitBreakerState;
    failureCount: number;
    failureThreshold: number;
    resetTimeout: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    openedAt: number | null;
    trips: number;
}
export interface SubscribablePlugin {
    workerId?: string;
    onGlobalLeaderChange?(isLeader: boolean, data: LeaderChangeEvent): void;
}
export interface ContentionState {
    lastEventTime: number;
    rateLimitMs: number;
}
export interface NormalizedConfig {
    heartbeatInterval: number;
    heartbeatJitter: number;
    leaseTimeout: number;
    workerTimeout: number;
    diagnosticsEnabled: boolean;
    contentionEnabled: boolean;
    contentionThreshold: number;
    contentionRateLimitMs: number;
    metricsBufferSize: number;
    stateCacheTtl: number;
}
export interface ElectionResult {
    leaderId: string | null;
    epoch: number;
}
export declare class GlobalCoordinatorService extends EventEmitter {
    namespace: string;
    database: Database;
    serviceId: string;
    workerId: string;
    isRunning: boolean;
    isLeader: boolean;
    currentLeaderId: string | null;
    currentEpoch: number;
    config: NormalizedConfig;
    heartbeatTimer: ReturnType<typeof setTimeout> | null;
    electionTimer: ReturnType<typeof setTimeout> | null;
    subscribedPlugins: Map<string, SubscribablePlugin>;
    metrics: CoordinatorMetrics;
    protected _circuitBreaker: CircuitBreakerInternalState;
    protected _contentionState: ContentionState;
    protected _latencyBuffer: LatencyBuffer;
    protected _heartbeatStartedAt: number;
    protected _heartbeatMutexTimeoutMs: number;
    protected _cachedState: LeaderState | null;
    protected _stateCacheTime: number;
    protected _stateCacheTtl: number;
    storage: CoordinatorPluginStorage | null;
    protected _pluginStorage: CoordinatorPluginStorage | null;
    logger: S3DBLogger;
    constructor({ namespace, database, config }: GlobalCoordinatorOptions);
    start(): Promise<void>;
    protected _startLoop(): Promise<void>;
    stop(): Promise<void>;
    subscribePlugin(pluginName: string, plugin: SubscribablePlugin): Promise<void>;
    unsubscribePlugin(pluginName: string): void;
    isLeaderCheck(workerId: string): Promise<boolean>;
    getLeader(): Promise<string | null>;
    getEpoch(): Promise<number>;
    getActiveWorkers(): Promise<WorkerData[]>;
    getMetrics(): EnhancedCoordinatorMetrics;
    incrementEpochDriftEvents(): void;
    protected _heartbeatCycle(): Promise<void>;
    protected _checkContention(durationMs: number): void;
    protected _conductElection(previousEpoch?: number): Promise<ElectionResult>;
    protected _registerWorker(): Promise<void>;
    protected _registerWorkerEntry(workerId: string, pluginName?: string | null): Promise<void>;
    protected _unregisterWorker(): Promise<void>;
    protected _unregisterWorkerEntry(workerId: string): Promise<void>;
    protected _getState(): Promise<LeaderState | null>;
    protected _invalidateStateCache(): void;
    protected _initializeMetadata(): Promise<void>;
    protected _notifyLeaderChange(previousLeaderId: string | null, newLeaderId: string | null): void;
    protected _notifyPlugin(pluginName: string, plugin: SubscribablePlugin, eventType: string, data: LeaderChangeEvent): void;
    protected _scheduleHeartbeat(): void;
    protected _getStorage(): CoordinatorPluginStorage;
    protected _getStateKey(): string;
    protected _getWorkersPrefix(): string;
    protected _getWorkerKey(workerId: string): string;
    protected _getMetadataKey(): string;
    protected _circuitBreakerAllows(): boolean;
    protected _circuitBreakerSuccess(): void;
    protected _circuitBreakerFailure(): void;
    getCircuitBreakerStatus(): CircuitBreakerStatus;
    protected _getWorkerPod(_workerId: string): string;
    protected _normalizeConfig(config: GlobalCoordinatorConfig): NormalizedConfig;
    protected _sleep(ms: number): Promise<void>;
    protected _log(...args: unknown[]): void;
    protected _logError(msg: string, err: Error): void;
    protected _generateWorkerId(): string;
}
export interface ListObjectsResult {
    Contents?: Array<{
        Key: string;
        LastModified?: string | Date;
    }>;
}
export interface StorageSetOptions {
    ttl?: number;
    behavior?: string;
}
export declare class CoordinatorPluginStorage extends PluginStorage {
    constructor(client: S3Client, pluginSlug?: string);
    list(prefix?: string, options?: {
        limit?: number;
    }): Promise<string[]>;
    listWithPrefix(prefix?: string, options?: {
        limit?: number;
    }): Promise<Record<string, unknown>[]>;
    protected _getActiveKeys(prefix: string, timeoutMs: number): Promise<string[]>;
    listActiveWorkers(prefix: string, timeoutMs: number): Promise<WorkerData[]>;
    listActiveWorkerIds(prefix: string, timeoutMs: number): Promise<string[]>;
    protected _deleteStaleWorkers(keys: string[]): Promise<void>;
}
export default GlobalCoordinatorService;
//# sourceMappingURL=global-coordinator-service.class.d.ts.map