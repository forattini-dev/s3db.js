export interface MetricsCollectorOptions {
    enabled?: boolean;
    logLevel?: string;
    maxPathsTracked?: number;
    resetInterval?: number;
    format?: 'json' | 'prometheus';
}
export interface RequestMetrics {
    method: string;
    path: string;
    status: number;
    duration: number;
}
export interface AuthMetrics {
    success: boolean;
    method: string;
}
export interface ResourceOperationMetrics {
    action: 'created' | 'updated' | 'deleted';
    resource: string;
}
export interface UserEventMetrics {
    action: 'login' | 'created';
}
export interface ErrorMetrics {
    error: string;
    type?: string;
}
interface AuthMethodStats {
    success: number;
    failure: number;
}
interface ResourceStats {
    created: number;
    updated: number;
    deleted: number;
}
interface TopPathEntry {
    path: string;
    count: number;
    avgDuration: string;
    errors: number;
    errorRate: string;
}
export interface MetricsSummary {
    uptime: {
        milliseconds: number;
        seconds: number;
        formatted: string;
    };
    requests: {
        total: number;
        rps: string;
        byMethod: Record<string, number>;
        byStatus: Record<string, number>;
        topPaths: TopPathEntry[];
        duration: {
            p50: number;
            p95: number;
            p99: number;
            avg: string | number;
        };
    };
    auth: {
        total: number;
        success: number;
        failure: number;
        successRate: string;
        byMethod: Record<string, AuthMethodStats>;
    };
    resources: {
        total: number;
        created: number;
        updated: number;
        deleted: number;
        byResource: Record<string, ResourceStats>;
    };
    users: {
        logins: number;
        newUsers: number;
    };
    errors: {
        total: number;
        rate: string;
        byType: Record<string, number>;
    };
}
export declare class MetricsCollector {
    private options;
    private metrics;
    private startTime;
    private cronManager;
    private resetJobName;
    constructor(options?: MetricsCollectorOptions);
    private _createEmptyMetrics;
    recordRequest({ method, path, status, duration }: RequestMetrics): void;
    recordAuth({ success, method }: AuthMetrics): void;
    recordResourceOperation({ action, resource }: ResourceOperationMetrics): void;
    recordUserEvent({ action }: UserEventMetrics): void;
    recordError({ error, type }: ErrorMetrics): void;
    private _percentile;
    getSummary(): MetricsSummary;
    getPrometheusMetrics(): string;
    private _getTopPaths;
    private _calculateRate;
    private _formatDuration;
    reset(): void;
    stop(): void;
}
export default MetricsCollector;
//# sourceMappingURL=metrics-collector.d.ts.map