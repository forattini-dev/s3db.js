export interface TaskQueueStats {
    queueSize: number;
    activeCount: number;
    processedCount: number;
    errorCount: number;
    concurrency?: number;
    effectiveConcurrency?: number;
}
export interface PerformanceMetrics {
    avgExecution: number;
    p95Execution: number;
}
export interface SystemMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    uptime: number;
}
export interface Snapshot {
    timestamp: number;
    taskQueue: TaskQueueStats | null;
    performance: PerformanceMetrics | null;
    system: SystemMetrics;
}
export interface TaskQueueReport {
    totalProcessed: number;
    totalErrors: number;
    avgQueueSize: number;
    avgConcurrency: number;
}
export interface PerformanceReport {
    avgLatency: number;
    p95Latency: number;
}
export interface SystemReport {
    avgMemoryMB: number;
    peakMemoryMB: number;
}
export interface MonitorReport {
    duration: number;
    snapshots: number;
    taskQueue: TaskQueueReport | null;
    performance: PerformanceReport | null;
    system: SystemReport;
}
interface DatabaseClient {
    getQueueStats?: () => TaskQueueStats;
    getAggregateMetrics?: () => PerformanceMetrics;
}
interface DatabaseLike {
    client?: DatabaseClient;
}
export declare class PerformanceMonitor {
    db: DatabaseLike;
    snapshots: Snapshot[];
    intervalId: ReturnType<typeof setInterval> | null;
    constructor(database: DatabaseLike);
    start(intervalMs?: number): void;
    stop(): void;
    takeSnapshot(): Snapshot;
    getReport(): MonitorReport | null;
    private _avg;
}
export {};
//# sourceMappingURL=performance-monitor.d.ts.map