export interface MemoryUsageStats {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
    totalHeapSize: number;
    totalHeapSizeExecutable: number;
    totalPhysicalSize: number;
    totalAvailableSize: number;
    usedHeapSize: number;
    heapSizeLimit: number;
    mallocedMemory: number;
    peakMallocedMemory: number;
    rssMB: number;
    heapTotalMB: number;
    heapUsedMB: number;
    externalMB: number;
    heapSizeLimitMB: number;
}
export interface MemorySample {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedMB: number;
}
export interface MemorySamplerOptions {
    maxSamples?: number;
    sampleIntervalMs?: number;
}
export interface SamplerStats {
    sampleCount: number;
    minHeapUsedMB: number;
    maxHeapUsedMB: number;
    avgHeapUsedMB: number;
    currentHeapUsedMB: number;
    timeRangeMs: number;
}
export interface LeakDetectionResult {
    detected: boolean;
    growthRate: number;
    startHeapMB: number;
    endHeapMB: number;
    samples: number;
    timeRangeMs: number;
}
export interface MemoryComparison {
    diff: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    diffMB: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    before: {
        heapUsedMB: number;
        heapTotalMB: number;
        externalMB: number;
        rssMB: number;
    };
    after: {
        heapUsedMB: number;
        heapTotalMB: number;
        externalMB: number;
        rssMB: number;
    };
}
export interface MeasureMemoryResult<T> {
    result: T | undefined;
    error: Error | undefined;
    duration: number;
    memory: MemoryComparison;
    heapGrowthMB: number;
}
export declare function getMemoryUsage(): MemoryUsageStats;
export declare function bytesToMB(bytes: number): number;
export declare function captureHeapSnapshot(outputDir: string, prefix?: string): Promise<string>;
export declare function formatMemoryUsage(): string;
export declare class MemorySampler {
    samples: MemorySample[];
    maxSamples: number;
    sampleInterval: number;
    timer: ReturnType<typeof setInterval> | null;
    isRunning: boolean;
    constructor(options?: MemorySamplerOptions);
    start(): void;
    stop(): void;
    sample(): MemorySample;
    getSamples(): MemorySample[];
    getStats(): SamplerStats | null;
    detectLeak(threshold?: number): false | LeakDetectionResult;
    reset(): void;
}
export declare function compareMemorySnapshots(before: MemoryUsageStats, after: MemoryUsageStats): MemoryComparison;
export declare function forceGC(): boolean;
export declare function measureMemory<T>(fn: () => Promise<T>, withGC?: boolean): Promise<MeasureMemoryResult<T>>;
declare const _default: {
    getMemoryUsage: typeof getMemoryUsage;
    bytesToMB: typeof bytesToMB;
    captureHeapSnapshot: typeof captureHeapSnapshot;
    formatMemoryUsage: typeof formatMemoryUsage;
    MemorySampler: typeof MemorySampler;
    compareMemorySnapshots: typeof compareMemorySnapshots;
    forceGC: typeof forceGC;
    measureMemory: typeof measureMemory;
};
export default _default;
//# sourceMappingURL=memory-profiler.d.ts.map