export interface PriorityTaskQueueOptions {
    agingMs?: number;
    maxAgingBoost?: number;
}
export interface PriorityNode<T = unknown> {
    task: T;
    priority: number;
    order: number;
    enqueuedAt?: number;
}
export interface TaskWithPriority {
    priority?: number;
}
export declare class PriorityTaskQueue<T extends TaskWithPriority = TaskWithPriority> {
    heap: PriorityNode<T>[];
    counter: number;
    agingMs: number;
    maxAgingBoost: number;
    agingMultiplier: number;
    private _agingEnabled;
    constructor(options?: PriorityTaskQueueOptions);
    get length(): number;
    enqueue(task: T): void;
    dequeue(): T | null;
    flush(callback?: (task: T) => void): void;
    clear(): void;
    setAgingMultiplier(multiplier: number): void;
    private _bubbleUp;
    private _bubbleDown;
    private _isHigherPriority;
    private _priorityValue;
    private _swap;
    private _agingTimestamp;
    private _agingBase;
}
//# sourceMappingURL=priority-task-queue.d.ts.map