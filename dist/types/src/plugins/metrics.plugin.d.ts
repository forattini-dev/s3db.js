import { Plugin } from './plugin.class.js';
import type { Server } from 'http';
interface Logger {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Resource {
    name: string;
    insert: (...args: unknown[]) => Promise<unknown>;
    _insert?: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
    _update?: (...args: unknown[]) => Promise<unknown>;
    delete: (...args: unknown[]) => Promise<unknown>;
    _delete?: (...args: unknown[]) => Promise<unknown>;
    deleteMany?: (...args: unknown[]) => Promise<unknown>;
    _deleteMany?: (...args: unknown[]) => Promise<unknown>;
    get: (...args: unknown[]) => Promise<unknown>;
    _get?: (...args: unknown[]) => Promise<unknown>;
    getMany?: (...args: unknown[]) => Promise<unknown>;
    _getMany?: (...args: unknown[]) => Promise<unknown>;
    getAll: () => Promise<MetricRecord[]>;
    _getAll?: () => Promise<MetricRecord[]>;
    list: (...args: unknown[]) => Promise<unknown[]>;
    _list?: (...args: unknown[]) => Promise<unknown[]>;
    listIds?: (...args: unknown[]) => Promise<string[]>;
    _listIds?: (...args: unknown[]) => Promise<string[]>;
    count?: (...args: unknown[]) => Promise<number>;
    _count?: (...args: unknown[]) => Promise<number>;
    page?: (...args: unknown[]) => Promise<unknown>;
    _page?: (...args: unknown[]) => Promise<unknown>;
    query: (filter: Record<string, unknown>) => Promise<MetricRecord[]>;
}
interface MetricRecord {
    id: string;
    type?: string;
    resourceName?: string;
    operation?: string;
    count?: number;
    totalTime?: number;
    errors?: number;
    avgTime?: number;
    timestamp?: string;
    createdAt?: string;
    duration?: number;
    error?: string;
    stack?: string;
    metadata?: Record<string, unknown>;
}
export interface PrometheusConfig {
    enabled?: boolean;
    mode?: 'auto' | 'integrated' | 'standalone';
    port?: number;
    path?: string;
    includeResourceLabels?: boolean;
    ipAllowlist?: string[];
    enforceIpAllowlist?: boolean;
}
export interface MetricsPluginOptions {
    resourceNames?: {
        metrics?: string;
        errors?: string;
        performance?: string;
    };
    resources?: {
        metrics?: string;
        errors?: string;
        performance?: string;
    };
    collectPerformance?: boolean;
    collectErrors?: boolean;
    collectUsage?: boolean;
    retentionDays?: number;
    flushInterval?: number;
    prometheus?: PrometheusConfig;
    logger?: Logger;
    logLevel?: string;
    [key: string]: unknown;
}
interface MetricsConfig {
    collectPerformance: boolean;
    collectErrors: boolean;
    collectUsage: boolean;
    retentionDays: number;
    flushInterval: number;
    prometheus: Required<PrometheusConfig>;
    logLevel?: string;
}
interface OperationMetrics {
    count: number;
    totalTime: number;
    errors: number;
}
interface PoolMetrics {
    tasksStarted: number;
    tasksCompleted: number;
    tasksFailed: number;
    tasksRetried: number;
    totalExecutionTime: number;
    avgExecutionTime: number;
}
interface PerformanceEntry {
    resourceName: string;
    operation: string;
    duration: number;
    timestamp: string;
}
interface ErrorEntry {
    resourceName: string;
    operation: string;
    error: string;
    stack?: string;
    timestamp: string;
}
interface MetricsData {
    operations: Record<string, OperationMetrics>;
    pool: PoolMetrics;
    resources: Record<string, Record<string, OperationMetrics>>;
    errors: ErrorEntry[];
    performance: PerformanceEntry[];
    startTime: string;
}
interface ResourceNames {
    metrics: string;
    errors: string;
    performance: string;
}
export interface MetricsQueryOptions {
    type?: string;
    resourceName?: string;
    operation?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
export interface ErrorLogsQueryOptions {
    resourceName?: string;
    operation?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
export interface PerformanceLogsQueryOptions {
    resourceName?: string;
    operation?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
interface OperationStats {
    count: number;
    errors: number;
    avgTime: number;
}
export interface MetricsStats {
    period: string;
    totalOperations: number;
    totalErrors: number;
    avgResponseTime: number;
    operationsByType: Record<string, OperationStats>;
    resources: Record<string, unknown>;
    pool: PoolMetrics;
    uptime: {
        startTime: string;
        duration: number;
    };
}
interface FlushTimer {
    stop?: () => void;
    destroy?: () => void;
}
export declare class MetricsPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: MetricsConfig;
    metrics: MetricsData;
    resourceNames: ResourceNames;
    metricsResource: Resource | null;
    errorsResource: Resource | null;
    performanceResource: Resource | null;
    flushJobName: string | null;
    flushTimer: FlushTimer | null;
    metricsServer: Server | null;
    private _resourceDescriptors;
    constructor(options?: MetricsPluginOptions);
    private _resolveResourceNames;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    start(): Promise<void>;
    private _setupOperationPoolListeners;
    stop(): Promise<void>;
    installDatabaseHooks(): void;
    removeDatabaseHooks(): void;
    isInternalResource(resourceName: string): boolean;
    installMetricsHooks(): void;
    installResourceHooks(resource: Resource): void;
    recordOperation(resourceName: string, operation: string, duration: number, isError: boolean): void;
    recordError(resourceName: string, operation: string, error: Error): void;
    startFlushTimer(): void;
    flushMetrics(): Promise<void>;
    resetMetrics(): void;
    getMetrics(options?: MetricsQueryOptions): Promise<MetricRecord[]>;
    getErrorLogs(options?: ErrorLogsQueryOptions): Promise<MetricRecord[]>;
    getPerformanceLogs(options?: PerformanceLogsQueryOptions): Promise<MetricRecord[]>;
    getStats(): Promise<MetricsStats>;
    cleanupOldData(): Promise<void>;
    getPrometheusMetrics(): Promise<string>;
    private _setupPrometheusExporter;
    private _setupIntegratedMetrics;
    private _setupStandaloneMetrics;
}
export {};
//# sourceMappingURL=metrics.plugin.d.ts.map