export interface AdaptiveTuningOptions {
    minConcurrency?: number;
    maxConcurrency?: number;
    targetLatency?: number;
    targetMemoryPercent?: number;
    adjustmentInterval?: number;
}
export interface TaskMetrics {
    latency: number;
    queueWait: number;
    success: boolean;
    retries: number;
    heapDelta: number;
}
export interface ConcurrencyAdjustment {
    timestamp: number;
    old: number;
    new: number;
    reason: string;
    metrics: {
        avgLatency: number;
        avgMemory: number;
        avgThroughput: number;
    };
}
export interface AdaptiveMetrics {
    latencies: number[];
    throughputs: number[];
    memoryUsages: number[];
    errorRates: number[];
    concurrencyHistory: ConcurrencyAdjustment[];
}
export interface MetricsSummary {
    current: number;
    avgLatency: number;
    avgMemory: number;
    avgThroughput: number;
    history: ConcurrencyAdjustment[];
}
export declare class AdaptiveTuning {
    minConcurrency: number;
    maxConcurrency: number;
    targetLatency: number;
    targetMemoryPercent: number;
    adjustmentInterval: number;
    metrics: AdaptiveMetrics;
    currentConcurrency: number;
    lastAdjustment: number;
    intervalId: ReturnType<typeof setInterval> | null;
    constructor(options?: AdaptiveTuningOptions);
    suggestInitial(): number;
    recordTaskMetrics(task: TaskMetrics): void;
    startMonitoring(): void;
    adjust(): number | null;
    getConcurrency(): number;
    getMetrics(): MetricsSummary;
    stop(): void;
    private _avg;
}
//# sourceMappingURL=adaptive-tuning.d.ts.map