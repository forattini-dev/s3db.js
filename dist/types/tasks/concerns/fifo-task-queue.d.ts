export interface QueueItem<T = unknown> {
    task?: T;
    priority?: number;
    [key: string]: unknown;
}
export declare class FifoTaskQueue<T = unknown> {
    buffer: Array<T | undefined>;
    mask: number;
    head: number;
    tail: number;
    constructor(capacity?: number);
    get length(): number;
    enqueue(value: T): void;
    dequeue(): T | null;
    flush(callback?: (item: T) => void): void;
    clear(): void;
    setAgingMultiplier(_multiplier?: number): void;
    toArray(): T[];
    private _grow;
    private _normalizeCapacity;
}
//# sourceMappingURL=fifo-task-queue.d.ts.map