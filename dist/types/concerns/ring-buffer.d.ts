/**
 * Fixed-size circular buffer for efficient rolling metrics.
 * Used by GlobalCoordinatorService for latency percentile tracking.
 *
 * Inspired by etcd's histogram-based metrics but implemented as a simple
 * ring buffer to avoid external dependencies.
 */
export declare class RingBuffer<T> {
    private capacity;
    private buffer;
    private head;
    private _count;
    constructor(capacity: number);
    push(value: T): void;
    toArray(): T[];
    get count(): number;
    get isFull(): boolean;
    clear(): void;
}
/**
 * Specialized ring buffer for numeric latency tracking with percentile calculations.
 */
export declare class LatencyBuffer extends RingBuffer<number> {
    private sortedCache;
    private sortedCacheVersion;
    private currentVersion;
    constructor(capacity?: number);
    push(value: number): void;
    private getSorted;
    percentile(p: number): number;
    p50(): number;
    p95(): number;
    p99(): number;
    max(): number;
    min(): number;
    avg(): number;
    getStats(): LatencyStats;
    clear(): void;
}
export interface LatencyStats {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
}
//# sourceMappingURL=ring-buffer.d.ts.map