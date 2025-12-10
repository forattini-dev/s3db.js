export interface InsertStats {
    inserted: number;
    failed: number;
    partitionsPending: number;
    avgInsertTime: number;
}
export interface FullStats extends InsertStats {
    bufferSize: number;
    isProcessing: boolean;
    throughput: number;
}
export interface InsertResult {
    success: boolean;
    data?: Record<string, unknown>;
    error?: Error;
}
export interface QueuedItem {
    data: Record<string, unknown>;
    timestamp: number;
    promise: Promise<unknown> | null;
}
export interface PartitionQueueItem {
    operation: string;
    data: Record<string, unknown>;
    partitions: Record<string, unknown>;
}
export interface HighPerformanceInserterOptions {
    batchSize?: number;
    concurrency?: number;
    flushInterval?: number;
    disablePartitions?: boolean;
    useStreamMode?: boolean;
}
export interface BulkInsertResult {
    success: number;
    failed: number;
    errors: Error[];
}
export interface StreamInserterOptions {
    concurrency?: number;
    skipPartitions?: boolean;
    skipHooks?: boolean;
    skipValidation?: boolean;
}
interface ResourceLike {
    config: {
        asyncPartitions?: boolean;
        partitions?: Record<string, unknown>;
    };
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    createPartitionReferences(data: Record<string, unknown>): Promise<void>;
    emit(event: string, data: Record<string, unknown>): void;
    generateId(): string;
    getResourceKey(id: string): string;
    schema: {
        mapper(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
    client: {
        config: {
            bucket: string;
        };
        client: {
            send(command: unknown): Promise<void>;
        };
    };
}
export declare class HighPerformanceInserter {
    resource: ResourceLike;
    batchSize: number;
    concurrency: number;
    flushInterval: number;
    disablePartitions: boolean;
    useStreamMode: boolean;
    insertBuffer: QueuedItem[];
    partitionBuffer: Map<string, unknown>;
    stats: InsertStats;
    flushTimer: ReturnType<typeof setTimeout> | null;
    isProcessing: boolean;
    partitionQueue: PartitionQueueItem[];
    partitionProcessor: ReturnType<typeof setImmediate> | null;
    constructor(resource: ResourceLike, options?: HighPerformanceInserterOptions);
    add(data: Record<string, unknown>): Promise<{
        queued: boolean;
        position: number;
    }>;
    bulkAdd(items: Record<string, unknown>[]): Promise<{
        queued: number;
    }>;
    flush(): Promise<void>;
    performInsert(item: QueuedItem): Promise<InsertResult>;
    processPartitionsAsync(): Promise<void>;
    forceFlush(): Promise<void>;
    getStats(): FullStats;
    destroy(): void;
}
export declare class StreamInserter {
    resource: ResourceLike;
    concurrency: number;
    skipPartitions: boolean;
    skipHooks: boolean;
    skipValidation: boolean;
    constructor(resource: ResourceLike, options?: StreamInserterOptions);
    fastInsert(data: Record<string, unknown>): Promise<{
        id: string;
        inserted: boolean;
    }>;
    bulkInsert(items: Record<string, unknown>[]): Promise<BulkInsertResult>;
}
export {};
//# sourceMappingURL=high-performance-inserter.d.ts.map