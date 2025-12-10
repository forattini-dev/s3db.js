export interface MemoryInfo {
    totalSystem: number;
    freeSystem: number;
    heapTotal: number;
    heapUsed: number;
    heapLimit: number;
    rss: number;
}
export interface MemoryLimitConfig {
    maxMemoryBytes?: number;
    maxMemoryPercent?: number;
    heapUsageThreshold?: number;
}
export declare function getMemoryInfo(): MemoryInfo;
export declare function calculateMaxMemoryFromPercent(percent: number): number;
export declare function formatBytes(bytes: number): string;
export declare function isHeapUnderPressure(threshold?: number): boolean;
export interface MemoryLimitResult {
    maxMemoryBytes: number;
    inferredPercent?: number;
    derivedFromPercent?: boolean;
    heapLimit: number;
}
export declare function resolveCacheMemoryLimit(config: MemoryLimitConfig): MemoryLimitResult;
//# sourceMappingURL=memory-limits.d.ts.map