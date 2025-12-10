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
    putObject(params: {
        key: string;
        metadata: StringRecord<string>;
        body: string;
        contentType: string | undefined;
    }): Promise<void>;
    headObject(key: string): Promise<unknown>;
    deleteObject(key: string): Promise<void>;
    deleteObjects(keys: string[]): Promise<void>;
    getAllKeys(params: {
        prefix: string;
    }): Promise<string[]>;
}
export interface HooksCollection {
    afterInsert?: Array<(data: ResourceData) => Promise<ResourceData>>;
    afterDelete?: Array<(data: ResourceData) => Promise<ResourceData>>;
    [hookName: string]: unknown;
}
export interface HooksModule {
    getHooks(): HooksCollection;
}
export interface ResourceData extends StringRecord {
    id?: string;
    _partition?: string;
    _partitionValues?: StringRecord;
}
export interface Resource {
    name: string;
    version: number;
    client: S3Client;
    config: ResourceConfig;
    attributes: StringRecord;
    get(id: string): Promise<ResourceData>;
    emit(event: string, ...args: unknown[]): void;
    _emitStandardized(event: string, data: unknown, id?: string): void;
}
export interface PartitionsConfigOptions {
    partitions?: PartitionsConfig;
    strictValidation?: boolean;
}
export interface GetKeyParams {
    partitionName: string;
    id?: string;
    data: ResourceData;
}
export interface GetFromPartitionParams {
    id: string;
    partitionName: string;
    partitionValues?: StringRecord;
}
export interface OrphanedPartition {
    missingFields: string[];
    definition: PartitionDefinition;
    allFields: string[];
}
export interface OrphanedPartitions {
    [partitionName: string]: OrphanedPartition;
}
export interface RemoveOrphanedOptions {
    dryRun?: boolean;
}
export interface ReferenceUpdateResult {
    partitionName: string;
    error?: Error;
    success?: boolean;
}
export declare class ResourcePartitions {
    resource: Resource;
    private _strictValidation;
    constructor(resource: Resource, config?: PartitionsConfigOptions);
    getPartitions(): PartitionsConfig;
    hasPartitions(): boolean;
    setupHooks(hooksModule: HooksModule): void;
    validate(): void;
    fieldExistsInAttributes(fieldName: string): boolean;
    findOrphaned(): OrphanedPartitions;
    removeOrphaned({ dryRun }?: RemoveOrphanedOptions): OrphanedPartitions;
    applyRule(value: unknown, rule: string): unknown;
    getNestedFieldValue(data: StringRecord, fieldPath: string): unknown;
    getKey({ partitionName, id, data }: GetKeyParams): string | null;
    buildPrefix(partition: string, partitionDef: PartitionDefinition, partitionValues: StringRecord): string;
    extractValuesFromKey(id: string, keys: string[], sortedFields: Array<[string, string]>): StringRecord;
    createReferences(data: ResourceData): Promise<void>;
    deleteReferences(data: ResourceData): Promise<void>;
    updateReferences(data: ResourceData): Promise<void>;
    handleReferenceUpdates(oldData: ResourceData, newData: ResourceData): Promise<void>;
    handleReferenceUpdate(partitionName: string, partition: PartitionDefinition, oldData: ResourceData, newData: ResourceData): Promise<void>;
    getFromPartition({ id, partitionName, partitionValues }: GetFromPartitionParams): Promise<ResourceData>;
}
export default ResourcePartitions;
//# sourceMappingURL=resource-partitions.class.d.ts.map