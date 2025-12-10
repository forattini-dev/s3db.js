type TaskFunction<T> = () => Promise<T>;
interface EnqueueOptions {
    priority?: number;
    retries?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
}
interface ProcessOptions<T = unknown> {
    onSuccess?: (item: T, result: unknown) => void;
    onError?: (item: T, error: Error) => void;
    priority?: number;
    retries?: number;
    timeout?: number;
    totalCount?: number;
    [key: string]: unknown;
}
interface ProcessResult<T> {
    results: T[];
    errors: (Error | {
        item?: unknown;
        error?: Error;
        index?: number;
    })[];
}
interface ExecutorStats {
    processed: number;
    errors: number;
    active: number;
    queued: number;
    [key: string]: unknown;
}
export declare abstract class TaskExecutor {
    abstract setConcurrency(concurrency: number): void;
    abstract getConcurrency(): number | 'auto';
    abstract enqueue<T>(fn: TaskFunction<T>, options?: EnqueueOptions): Promise<T>;
    abstract process<T, R>(items: T[], processor: (item: T, index?: number, executor?: unknown) => Promise<R>, options?: ProcessOptions<T>): Promise<ProcessResult<R>>;
    abstract pause(): void;
    abstract resume(): void;
    abstract stop(): void;
    abstract destroy(): Promise<void>;
    abstract getStats(): Record<string, unknown>;
}
export type { TaskFunction, EnqueueOptions, ProcessOptions, ProcessResult, ExecutorStats };
//# sourceMappingURL=task-executor.interface.d.ts.map