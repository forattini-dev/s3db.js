import type { StringRecord } from '../types/common.types.js';
export interface PartitionFields {
    [fieldName: string]: string;
}
export interface PartitionDefinition {
    fields: PartitionFields;
}
export interface PartitionsConfig {
    [partitionName: string]: PartitionDefinition;
}
export interface ResourceConfig {
    partitions?: PartitionsConfig;
}
export interface S3Client {
    count(params: {
        prefix: string;
    }): Promise<number>;
    getKeysPage(params: {
        prefix: string;
        offset: number;
        amount: number;
    }): Promise<string[]>;
}
export interface Observer {
    emit(event: string, ...args: unknown[]): void;
}
export interface BatchOptions {
    onItemError?: (error: Error, index: number) => void | StringRecord;
}
export interface BatchResult<T> {
    results: Array<T | null>;
    errors: Array<{
        error: Error;
        index: number;
    }>;
}
export interface ResourceData extends StringRecord {
    id?: string;
    _partition?: string;
    _partitionValues?: StringRecord;
    _decryptionFailed?: boolean;
    _error?: string;
}
export interface Resource {
    name: string;
    client: S3Client;
    config: ResourceConfig;
    observers: Observer[];
    executeHooks(hookName: string, data: unknown): Promise<unknown>;
    get(id: string): Promise<ResourceData>;
    applyPartitionRule(value: unknown, rule: string): string;
    buildPartitionPrefix(partition: string, partitionDef: PartitionDefinition, partitionValues: StringRecord): string;
    extractPartitionValuesFromKey(id: string, keys: string[], sortedFields: Array<[string, string]>): StringRecord;
    emit(event: string, ...args: unknown[]): void;
    _emitStandardized(event: string, data: unknown): void;
    _executeBatchHelper<T>(operations: Array<() => Promise<T>>, options?: BatchOptions): Promise<BatchResult<T>>;
}
export interface CountParams {
    partition?: string | null;
    partitionValues?: StringRecord;
}
export interface ListIdsParams {
    partition?: string | null;
    partitionValues?: StringRecord;
    limit?: number;
    offset?: number;
}
export interface ListParams {
    partition?: string | null;
    partitionValues?: StringRecord;
    limit?: number;
    offset?: number;
}
export interface PageParams {
    offset?: number;
    size?: number;
    partition?: string | null;
    partitionValues?: StringRecord;
    skipCount?: boolean;
}
export interface PageResult {
    items: ResourceData[];
    totalItems: number | null;
    page: number;
    pageSize: number;
    totalPages: number | null;
    hasMore: boolean;
    _debug: {
        requestedSize: number;
        requestedOffset: number;
        actualItemsReturned: number;
        skipCount: boolean;
        hasTotalItems: boolean;
        error?: string;
    };
}
export interface QueryOptions {
    limit?: number;
    offset?: number;
    partition?: string | null;
    partitionValues?: StringRecord;
}
export declare class ResourceQuery {
    resource: Resource;
    constructor(resource: Resource);
    get client(): S3Client;
    get partitions(): PartitionsConfig;
    count({ partition, partitionValues }?: CountParams): Promise<number>;
    listIds({ partition, partitionValues, limit, offset }?: ListIdsParams): Promise<string[]>;
    list({ partition, partitionValues, limit, offset }?: ListParams): Promise<ResourceData[]>;
    listMain({ limit, offset }: {
        limit?: number;
        offset?: number;
    }): Promise<ResourceData[]>;
    listPartition({ partition, partitionValues, limit, offset }: {
        partition: string;
        partitionValues: StringRecord;
        limit?: number;
        offset?: number;
    }): Promise<ResourceData[]>;
    extractIdsFromKeys(keys: string[]): string[];
    processListResults(ids: string[], context?: string): Promise<ResourceData[]>;
    processPartitionResults(ids: string[], partition: string, partitionDef: PartitionDefinition, keys: string[]): Promise<ResourceData[]>;
    handleResourceError(error: Error, id: string, context: string): ResourceData;
    handleListError(error: Error, { partition, partitionValues }: {
        partition: string | null;
        partitionValues: StringRecord;
    }): ResourceData[];
    getMany(ids: string[]): Promise<ResourceData[]>;
    getAll(): Promise<ResourceData[]>;
    page({ offset, size, partition, partitionValues, skipCount }?: PageParams): Promise<PageResult>;
    query(filter?: StringRecord, { limit, offset, partition, partitionValues }?: QueryOptions): Promise<ResourceData[]>;
}
export default ResourceQuery;
//# sourceMappingURL=resource-query.class.d.ts.map