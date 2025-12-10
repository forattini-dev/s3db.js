import type { StringRecord } from '../types/common.types.js';
export interface ResourceData extends StringRecord {
    id?: string;
    _contentLength?: number;
    _lastModified?: Date;
    _hasContent?: boolean;
    _mimeType?: string | null;
    _etag?: string;
    _v?: string | number;
    _versionId?: string;
    _expiresAt?: string;
    _definitionHash?: string;
    $before?: ResourceData;
    $after?: ResourceData | null;
}
export interface InsertParams extends StringRecord {
    id?: string;
}
export interface ValidationResult {
    errors?: Array<{
        message?: string;
        field?: string;
    }>;
    isValid: boolean;
    data: ResourceData;
}
export interface BehaviorResult {
    mappedData: StringRecord<string>;
    body: string;
}
export interface BehaviorHandleParams {
    resource: Resource;
    data?: StringRecord;
    mappedData?: StringRecord<string>;
    originalData?: StringRecord;
    metadata?: StringRecord;
    body?: string;
    id?: string;
}
export interface Behavior {
    handleInsert(params: BehaviorHandleParams): Promise<BehaviorResult>;
    handleUpdate(params: BehaviorHandleParams): Promise<BehaviorResult>;
    handleGet(params: BehaviorHandleParams): Promise<{
        metadata: StringRecord<string>;
    }>;
}
export interface S3ClientConfig {
    bucket: string;
}
export interface S3Response {
    Metadata?: StringRecord<string>;
    ContentLength?: number;
    ContentType?: string;
    LastModified?: Date;
    ETag?: string;
    VersionId?: string;
    Expiration?: string;
    Body?: {
        transformToByteArray(): Promise<Uint8Array>;
    };
}
export interface PutObjectParams {
    key: string;
    body?: string | Buffer;
    contentType?: string;
    metadata: StringRecord<string>;
    ifMatch?: string;
}
export interface CopyObjectParams {
    from: string;
    to: string;
    metadataDirective: 'REPLACE' | 'COPY';
    metadata: StringRecord<string>;
}
export interface S3Client {
    config: S3ClientConfig;
    putObject(params: PutObjectParams): Promise<{
        ETag?: string;
    }>;
    getObject(key: string): Promise<S3Response>;
    headObject(key: string): Promise<S3Response>;
    deleteObject(key: string): Promise<unknown>;
    copyObject(params: CopyObjectParams): Promise<unknown>;
    deleteAll(params: {
        prefix: string;
    }): Promise<number>;
    _executeBatch?<T>(operations: Array<() => Promise<T>>, options?: BatchOptions): Promise<BatchResult<T>>;
}
export interface Schema {
    mapper(data: StringRecord): Promise<StringRecord<string>>;
    unmapper(metadata: StringRecord<string>): Promise<StringRecord>;
}
export interface ResourceValidator {
    applyDefaults(data: StringRecord): StringRecord;
    validate(data: StringRecord): Promise<ValidationResult>;
}
export interface ResourceConfig {
    timestamps?: boolean;
    partitions?: StringRecord;
    strictPartitions?: boolean;
    asyncPartitions?: boolean;
    paranoid?: boolean;
}
export interface HooksCollection {
    afterInsert: Array<(data: ResourceData) => Promise<ResourceData>>;
    afterDelete: Array<(data: ResourceData) => Promise<ResourceData>>;
    afterUpdate: Array<(data: ResourceData) => Promise<ResourceData>>;
}
export interface Logger {
    trace(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
}
export interface Observer {
    emit(event: string, ...args: unknown[]): void;
}
export interface Resource {
    client: S3Client;
    schema: Schema;
    validator: ResourceValidator;
    config: ResourceConfig;
    name: string;
    version: string | number;
    behavior: string;
    hooks: HooksCollection;
    logger: Logger;
    idGenerator: () => string | Promise<string>;
    versioningEnabled: boolean;
    observers: Observer[];
    executeHooks(hookName: string, data: unknown): Promise<unknown>;
    validate(data: StringRecord, options?: {
        includeId?: boolean;
    }): Promise<ValidationResult>;
    getResourceKey(id: string): string;
    getSchemaForVersion(version: string | number): Promise<Schema>;
    composeFullObjectFromWrite(params: {
        id: string;
        metadata: StringRecord<string>;
        body: string | Buffer;
        behavior: string;
    }): Promise<ResourceData>;
    createPartitionReferences(data: ResourceData): Promise<void>;
    deletePartitionReferences(data: ResourceData): Promise<void>;
    handlePartitionReferenceUpdates(oldData: ResourceData, newData: ResourceData): Promise<void>;
    applyVersionMapping(data: ResourceData, fromVersion: string | number, toVersion: string | number): Promise<ResourceData>;
    createHistoricalVersion(id: string, data: ResourceData): Promise<void>;
    getDefinitionHash(): string;
    emit(event: string, ...args: unknown[]): void;
    _emitStandardized(event: string, data: unknown, id?: string): void;
}
export interface PatchOptions {
    partition?: string;
    partitionValues?: StringRecord;
}
export interface ReplaceOptions {
    partition?: string;
    partitionValues?: StringRecord;
}
export interface UpdateConditionalOptions {
    ifMatch: string;
}
export interface UpdateConditionalResult {
    success: boolean;
    data?: ResourceData;
    etag?: string;
    error?: string;
    validationErrors?: Array<{
        message?: string;
        field?: string;
    }>;
}
export interface BatchOptions {
    onItemError?: (error: Error, index: number) => void;
}
export interface BatchResult<T> {
    results: Array<T | null>;
    errors: Array<{
        error: Error;
        index: number;
    }>;
}
export interface DeleteManyResult {
    deleted: number;
    errors: number;
}
export interface DeleteAllResult {
    deletedCount: number;
    version?: string | number;
    resource?: string;
}
export declare class ResourcePersistence {
    resource: Resource;
    constructor(resource: Resource);
    get client(): S3Client;
    get schema(): Schema;
    get validator(): ResourceValidator;
    get config(): ResourceConfig;
    get name(): string;
    get version(): string | number;
    get behavior(): string;
    get hooks(): HooksCollection;
    get logger(): Logger;
    get idGenerator(): () => string | Promise<string>;
    get versioningEnabled(): boolean;
    get observers(): Observer[];
    insert({ id, ...attributes }: InsertParams): Promise<ResourceData>;
    get(id: string): Promise<ResourceData>;
    getOrNull(id: string): Promise<ResourceData | null>;
    getOrThrow(id: string): Promise<ResourceData>;
    exists(id: string): Promise<boolean>;
    delete(id: string): Promise<unknown>;
    upsert({ id, ...attributes }: InsertParams): Promise<ResourceData>;
    insertMany(objects: InsertParams[]): Promise<ResourceData[]>;
    deleteMany(ids: string[]): Promise<DeleteManyResult>;
    update(id: string, attributes: StringRecord): Promise<ResourceData>;
    _executeBatchHelper<T>(operations: Array<() => Promise<T>>, options?: BatchOptions): Promise<BatchResult<T>>;
    patch(id: string, fields: StringRecord, options?: PatchOptions): Promise<ResourceData>;
    _patchViaCopyObject(id: string, fields: StringRecord, options?: PatchOptions): Promise<ResourceData>;
    replace(id: string, fullData: StringRecord, options?: ReplaceOptions): Promise<ResourceData>;
    updateConditional(id: string, attributes: StringRecord, options: UpdateConditionalOptions): Promise<UpdateConditionalResult>;
    deleteAll(): Promise<DeleteAllResult>;
    deleteAllData(): Promise<DeleteAllResult>;
}
export default ResourcePersistence;
//# sourceMappingURL=resource-persistence.class.d.ts.map