import EventEmitter from 'events';
import { ReplicationError } from '../replicator.errors.js';
import type { Logger } from 'pino';
export interface BaseReplicatorConfig {
    enabled?: boolean;
    batchConcurrency?: number;
    logLevel?: string | false;
    logger?: Logger;
    [key: string]: unknown;
}
export interface ReplicatorStatus {
    name: string;
    config: BaseReplicatorConfig;
    connected: boolean;
    [key: string]: unknown;
}
export interface BatchProcessOptions {
    concurrency?: number;
    mapError?: (error: Error, record: unknown) => unknown;
}
export interface BatchProcessResult<T = unknown> {
    results: T[];
    errors: Array<{
        record: unknown;
        error: Error;
    } | unknown>;
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
export interface ErrorDetails {
    operation?: string;
    resourceName?: string;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    description?: string;
    docs?: string;
    hint?: string;
    metadata?: unknown;
    [key: string]: unknown;
}
interface DatabaseLike {
    [key: string]: unknown;
}
export declare class BaseReplicator extends EventEmitter {
    config: BaseReplicatorConfig;
    name: string;
    enabled: boolean;
    batchConcurrency: number;
    logger: Logger;
    database: DatabaseLike | null;
    constructor(config?: BaseReplicatorConfig);
    initialize(database: DatabaseLike): Promise<void>;
    replicate(resourceName: string, operation: string, data: unknown, id: string): Promise<unknown>;
    replicateBatch(resourceName: string, records: unknown[]): Promise<unknown>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus>;
    cleanup(): Promise<void>;
    setBatchConcurrency(value: number): void;
    processBatch<T = unknown, R = unknown>(records: T[] | undefined, handler: (record: T) => Promise<R>, { concurrency, mapError }?: BatchProcessOptions): Promise<BatchProcessResult<R>>;
    createError(message: string, details?: ErrorDetails): ReplicationError;
    validateConfig(): ValidationResult;
}
export default BaseReplicator;
//# sourceMappingURL=base-replicator.class.d.ts.map