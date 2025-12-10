import { DistributedLock } from './distributed-lock.js';
export interface SequenceDefaults {
    initialValue?: number;
    increment?: number;
    lockTimeout?: number;
    lockTTL?: number;
}
export interface SequenceData {
    value: number;
    name: string;
    createdAt: number;
    updatedAt?: number;
    resetAt?: number;
    [key: string]: unknown;
}
export interface SequenceStorageAdapter {
    get(key: string): Promise<SequenceData | null>;
    set(key: string, data: SequenceData, options?: {
        behavior?: string;
    }): Promise<void>;
    delete(key: string): Promise<void>;
}
export interface DistributedSequenceOptions {
    valueKeyGenerator?: (name: string) => string;
    lockKeyGenerator?: (name: string) => string;
    defaults?: SequenceDefaults;
}
export interface NextOptions extends SequenceDefaults {
    metadata?: Record<string, unknown>;
}
export interface ResetOptions {
    lockTimeout?: number;
    lockTTL?: number;
    metadata?: Record<string, unknown>;
}
export interface CreateSequenceOptions {
    prefix?: string;
    resourceName?: string;
    pluginSlug?: string;
    valueKeyGenerator?: (name: string) => string;
    lockKeyGenerator?: (name: string) => string;
    defaults?: SequenceDefaults;
}
export declare class DistributedSequence {
    storage: SequenceStorageAdapter;
    valueKeyGenerator: (name: string) => string;
    lockKeyGenerator: (name: string) => string;
    defaults: Required<SequenceDefaults>;
    lock: DistributedLock;
    constructor(storage: SequenceStorageAdapter, options?: DistributedSequenceOptions);
    next(name: string, options?: NextOptions): Promise<number>;
    get(name: string): Promise<number | null>;
    getData(name: string): Promise<SequenceData | null>;
    reset(name: string, value: number, options?: ResetOptions): Promise<boolean>;
    set(name: string, value: number, options?: ResetOptions): Promise<boolean>;
    delete(name: string): Promise<void>;
    exists(name: string): Promise<boolean>;
    increment(name: string, options?: NextOptions): Promise<number>;
}
export declare function createSequence(storage: SequenceStorageAdapter, options?: CreateSequenceOptions): DistributedSequence;
export default DistributedSequence;
//# sourceMappingURL=distributed-sequence.d.ts.map