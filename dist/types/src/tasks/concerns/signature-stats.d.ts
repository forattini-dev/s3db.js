export interface SignatureStatsOptions {
    alpha?: number;
    maxEntries?: number;
}
export interface SignatureEntry {
    signature: string;
    count: number;
    avgQueueWait: number;
    avgExecution: number;
    successRate: number;
}
export interface SignatureMetrics {
    queueWait?: number;
    execution?: number;
    success?: boolean;
}
export interface SignatureSnapshot {
    signature: string;
    count: number;
    avgQueueWait: number;
    avgExecution: number;
    successRate: number;
}
export declare class SignatureStats {
    alpha: number;
    maxEntries: number;
    entries: Map<string, SignatureEntry>;
    constructor(options?: SignatureStatsOptions);
    record(signature: string, metrics?: SignatureMetrics): void;
    snapshot(limit?: number): SignatureSnapshot[];
    reset(): void;
    private _mix;
}
//# sourceMappingURL=signature-stats.d.ts.map