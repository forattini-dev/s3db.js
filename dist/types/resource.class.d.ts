import { AsyncEventEmitter } from './concerns/async-event-emitter.js';
import Schema from './schema.class.js';
import { ResourceValidator } from './core/resource-validator.class.js';
import { ResourceReader, ResourceWriter } from './stream/index.js';
import { type Logger, type LogLevel as LoggerLogLevel } from './concerns/logger.js';
import type { Client } from './clients/types.js';
import type { BehaviorType } from './behaviors/types.js';
import type { LogLevel, StringRecord, EventHandler, Disposable } from './types/common.types.js';
import type { HookFunction, BoundHookFunction, HooksCollection, HookEvent } from './core/resource-hooks.class.js';
import type { GuardConfig, GuardContext, JWTUser } from './core/resource-guards.class.js';
import type { MiddlewareFunction, SupportedMethod } from './core/resource-middleware.class.js';
import type { PartitionDefinition, PartitionsConfig } from './core/resource-query.class.js';
import type { OrphanedPartitions } from './core/resource-partitions.class.js';
import type { ValidationResult, ValidationOptions, AttributesSchema } from './core/resource-validator.class.js';
import type { EventListeners } from './core/resource-events.class.js';
import type { IdGeneratorFunction, IdGeneratorConfig, IncrementalGenerator, SequenceInfo } from './core/resource-id-generator.class.js';
export interface ResourceConfig {
    name: string;
    client: Client;
    database?: Database;
    version?: string;
    attributes?: AttributesSchema;
    behavior?: BehaviorType;
    passphrase?: string;
    bcryptRounds?: number;
    observers?: Database[];
    cache?: boolean;
    autoEncrypt?: boolean;
    autoDecrypt?: boolean;
    timestamps?: boolean;
    partitions?: PartitionsConfig | string[];
    paranoid?: boolean;
    allNestedObjectsOptional?: boolean;
    hooks?: Partial<HooksCollection>;
    idGenerator?: IdGeneratorFunction | number | string;
    idSize?: number;
    versioningEnabled?: boolean;
    strictValidation?: boolean;
    events?: EventListeners;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    strictPartitions?: boolean;
    createdBy?: string;
    guard?: GuardConfig;
    logLevel?: LogLevel;
    map?: StringRecord<string>;
    disableEvents?: boolean;
    disableResourceEvents?: boolean;
    api?: ResourceApiConfig;
    description?: string;
    /** Schema registry for stable attribute indices - loaded from s3db.json */
    schemaRegistry?: import('./schema.class.js').SchemaRegistry;
    /** Plugin schema registries for stable plugin attribute indices */
    pluginSchemaRegistry?: Record<string, import('./schema.class.js').PluginSchemaRegistry | import('./schema.class.js').SchemaRegistry>;
}
export interface ResourceApiConfig {
    enabled?: boolean;
    path?: string;
    operations?: {
        list?: boolean;
        get?: boolean;
        insert?: boolean;
        update?: boolean;
        delete?: boolean;
        query?: boolean;
    };
    middleware?: MiddlewareFunction[];
}
export interface ResourceInternalConfig {
    cache: boolean;
    hooks: Partial<HooksCollection>;
    paranoid: boolean;
    timestamps: boolean;
    partitions: PartitionsConfig;
    autoEncrypt: boolean;
    autoDecrypt: boolean;
    allNestedObjectsOptional: boolean;
    asyncEvents: boolean;
    asyncPartitions: boolean;
    strictPartitions: boolean;
    createdBy: string;
}
export interface ResourceExport {
    name: string;
    attributes: AttributesSchema;
    behavior: BehaviorType;
    timestamps: boolean;
    partitions: PartitionsConfig;
    paranoid: boolean;
    allNestedObjectsOptional: boolean;
    autoDecrypt: boolean;
    cache: boolean;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    hooks: Partial<HooksCollection>;
    map?: StringRecord<string>;
}
export interface ResourceData {
    id: string;
    [key: string]: unknown;
}
export interface ContentResult {
    buffer: Buffer | null;
    contentType: string | null;
}
export interface SetContentParams {
    id: string;
    buffer: Buffer | string;
    contentType?: string;
}
export interface PageResult {
    items: ResourceData[];
    total: number;
    offset: number;
    size: number;
    hasMore: boolean;
}
export interface QueryFilter {
    [key: string]: unknown;
}
export interface QueryOptions {
    limit?: number;
    offset?: number;
    partition?: string | null;
    partitionValues?: StringRecord;
}
export interface ListOptions {
    partition?: string | null;
    partitionValues?: StringRecord;
    limit?: number;
    offset?: number;
}
export interface CountOptions {
    partition?: string | null;
    partitionValues?: StringRecord;
}
export interface UpdateConditionalResult {
    success: boolean;
    data?: ResourceData;
    error?: string;
    currentETag?: string;
}
export interface DeleteManyResult {
    deleted: number;
    failed: number;
    errors?: unknown[];
}
export interface PageOptions {
    offset?: number;
    size?: number;
    partition?: string | null;
    partitionValues?: StringRecord;
    skipCount?: boolean;
}
export interface UpdateConditionalResult {
    success: boolean;
    data?: ResourceData;
    etag?: string;
    error?: string;
}
export interface ComposeFullObjectParams {
    id: string;
    metadata: StringRecord;
    body: string;
    behavior: BehaviorType;
}
export interface GetFromPartitionParams {
    id: string;
    partitionName: string;
    partitionValues?: StringRecord;
}
interface Database {
    id: string;
    logger: Logger;
    getChildLogger(name: string, bindings?: Record<string, unknown>): Logger;
    emit(event: string, data: unknown): void;
    savedMetadata?: SavedMetadata | null;
}
interface SavedMetadata {
    resources?: StringRecord<ResourceMetadata>;
}
interface ResourceMetadata {
    currentVersion?: string;
    versions?: StringRecord<VersionData>;
}
interface VersionData {
    hash?: string;
    attributes?: AttributesSchema;
}
export declare class Resource extends AsyncEventEmitter implements Disposable {
    name: string;
    client: Client;
    version: string;
    logLevel: LoggerLogLevel;
    logger: Logger;
    behavior: BehaviorType;
    private _resourceAsyncEvents;
    observers: Database[];
    passphrase: string;
    bcryptRounds: number;
    versioningEnabled: boolean;
    strictValidation: boolean;
    asyncEvents: boolean;
    idGenerator: IdGeneratorFunction | IncrementalGenerator | null;
    idSize: number;
    idGeneratorType: IdGeneratorConfig | undefined;
    config: ResourceInternalConfig;
    validator: ResourceValidator;
    schema: Schema;
    $schema: Readonly<Omit<ResourceConfig, 'database' | 'observers' | 'client'>>;
    hooks: HooksCollection;
    attributes: AttributesSchema;
    guard: GuardConfig | null;
    eventsDisabled: boolean;
    database?: Database;
    map?: StringRecord<string>;
    private _schemaRegistry?;
    private _pluginSchemaRegistry?;
    private _instanceId;
    private _idGenerator;
    private _hooksModule;
    private _partitions;
    private _eventsModule;
    private _guards;
    private _middleware;
    private _query;
    private _content;
    private _streams;
    private _persistence;
    constructor(config?: ResourceConfig);
    private _normalizePartitionsInput;
    configureIdGenerator(customIdGenerator: IdGeneratorFunction | number | string | undefined, idSize: number): IdGeneratorFunction | IncrementalGenerator | null;
    private _initIncrementalIdGenerator;
    hasAsyncIdGenerator(): boolean;
    getIdGeneratorType(customIdGenerator: IdGeneratorFunction | number | undefined, idSize: number): IdGeneratorConfig | undefined;
    export(): ResourceExport;
    applyConfiguration({ map }?: {
        map?: StringRecord<string>;
    }): void;
    updateAttributes(newAttributes: AttributesSchema): {
        oldAttributes: AttributesSchema;
        newAttributes: AttributesSchema;
    };
    addPluginAttribute(name: string, definition: string | Record<string, unknown>, pluginName: string): void;
    removePluginAttribute(name: string, pluginName?: string | null): boolean;
    addHook(event: HookEvent, fn: HookFunction): void;
    executeHooks(event: HookEvent, data: unknown): Promise<unknown>;
    _bindHook(fn: HookFunction): BoundHookFunction<unknown> | null;
    setupPartitionHooks(): void;
    validate(data: Record<string, unknown>, options?: ValidationOptions): Promise<ValidationResult>;
    validatePartitions(): void;
    fieldExistsInAttributes(fieldName: string): boolean;
    findOrphanedPartitions(): OrphanedPartitions;
    removeOrphanedPartitions({ dryRun }?: {
        dryRun?: boolean | undefined;
    }): OrphanedPartitions;
    applyPartitionRule(value: unknown, rule: string): unknown;
    getResourceKey(id: string): string;
    getPartitionKey({ partitionName, id, data }: {
        partitionName: string;
        id: string;
        data: Record<string, unknown>;
    }): string | null;
    getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    calculateContentLength(body: string | Buffer | object | null | undefined): number;
    _emitStandardized(event: string, payload: unknown, id?: string | null): void;
    _ensureEventsWired(): void;
    on(eventName: string, listener: EventHandler): this;
    addListener(eventName: string, listener: EventHandler): this;
    once(eventName: string, listener: EventHandler): this;
    emit(eventName: string, ...args: unknown[]): boolean;
    insert({ id, ...attributes }: {
        id?: string;
    } & Record<string, unknown>): Promise<ResourceData>;
    get(id: string): Promise<ResourceData>;
    getOrNull(id: string): Promise<ResourceData | null>;
    getOrThrow(id: string): Promise<ResourceData>;
    exists(id: string): Promise<boolean>;
    update(id: string, attributes: Record<string, unknown>): Promise<ResourceData>;
    patch(id: string, fields: Record<string, unknown>, options?: {
        partition?: string;
        partitionValues?: StringRecord;
    }): Promise<ResourceData>;
    _patchViaCopyObject(id: string, fields: Record<string, unknown>, options?: Record<string, unknown>): Promise<ResourceData>;
    replace(id: string, fullData: Record<string, unknown>, options?: {
        partition?: string;
        partitionValues?: StringRecord;
    }): Promise<ResourceData>;
    updateConditional(id: string, attributes: Record<string, unknown>, options?: {
        ifMatch?: string;
    }): Promise<UpdateConditionalResult>;
    delete(id: string): Promise<unknown>;
    upsert({ id, ...attributes }: {
        id: string;
    } & Record<string, unknown>): Promise<ResourceData>;
    count({ partition, partitionValues }?: CountOptions): Promise<number>;
    insertMany(objects: Record<string, unknown>[]): Promise<ResourceData[]>;
    _executeBatchHelper(operations: unknown[], options?: Record<string, unknown>): Promise<unknown>;
    deleteMany(ids: string[]): Promise<DeleteManyResult>;
    deleteAll(): Promise<{
        deletedCount: number;
    }>;
    deleteAllData(): Promise<{
        deletedCount: number;
    }>;
    listIds({ partition, partitionValues, limit, offset }?: ListOptions): Promise<string[]>;
    list({ partition, partitionValues, limit, offset }?: ListOptions): Promise<ResourceData[]>;
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
    buildPartitionPrefix(partition: string, partitionDef: PartitionDefinition, partitionValues: StringRecord): string;
    extractIdsFromKeys(keys: string[]): string[];
    processListResults(ids: string[], context?: string): Promise<ResourceData[]>;
    processPartitionResults(ids: string[], partition: string, partitionDef: PartitionDefinition, keys: string[]): Promise<ResourceData[]>;
    extractPartitionValuesFromKey(id: string, keys: string[], sortedFields: string[]): StringRecord;
    handleResourceError(error: Error, id: string, context: string): ResourceData;
    handleListError(error: Error, { partition, partitionValues }: {
        partition: string | null;
        partitionValues: StringRecord;
    }): ResourceData[];
    getMany(ids: string[]): Promise<ResourceData[]>;
    getAll(): Promise<ResourceData[]>;
    page({ offset, size, partition, partitionValues, skipCount }?: PageOptions): Promise<PageResult>;
    readable(): ResourceReader;
    writable(): ResourceWriter;
    setContent({ id, buffer, contentType }: SetContentParams): Promise<ResourceData>;
    content(id: string): Promise<ContentResult>;
    hasContent(id: string): Promise<boolean>;
    deleteContent(id: string): Promise<unknown>;
    getDefinitionHash(): string;
    extractVersionFromKey(key: string): string | null;
    getSchemaForVersion(version: string): Promise<Schema>;
    createPartitionReferences(data: ResourceData): Promise<void>;
    deletePartitionReferences(data: ResourceData): Promise<void>;
    query(filter?: QueryFilter, { limit, offset, partition, partitionValues }?: QueryOptions): Promise<ResourceData[]>;
    handlePartitionReferenceUpdates(oldData: ResourceData, newData: ResourceData): Promise<void>;
    handlePartitionReferenceUpdate(partitionName: string, partition: PartitionDefinition, oldData: ResourceData, newData: ResourceData): Promise<void>;
    updatePartitionReferences(data: ResourceData): Promise<void>;
    getFromPartition({ id, partitionName, partitionValues }: GetFromPartitionParams): Promise<ResourceData>;
    createHistoricalVersion(id: string, data: ResourceData): Promise<void>;
    applyVersionMapping(data: ResourceData, fromVersion: string, toVersion: string): Promise<ResourceData>;
    composeFullObjectFromWrite({ id, metadata, body, behavior }: ComposeFullObjectParams): Promise<ResourceData>;
    _normalizeGuard(guard: GuardConfig): GuardConfig | null;
    executeGuard(operation: string, context: GuardContext, resource?: ResourceData | null): Promise<boolean>;
    _checkRolesScopes(requiredRolesScopes: string[], user: JWTUser): boolean;
    _initMiddleware(): void;
    useMiddleware(method: SupportedMethod, fn: MiddlewareFunction): void;
    applyDefaults(data: Record<string, unknown>): Record<string, unknown>;
    getSequenceValue(fieldName?: string): Promise<number | null>;
    resetSequence(fieldName: string, value: number): Promise<boolean>;
    listSequences(): Promise<SequenceInfo[] | null>;
    reserveIdBatch(count?: number): Promise<{
        start: number;
        end: number;
        current: number;
    } | null>;
    getBatchStatus(fieldName?: string): {
        start: number;
        end: number;
        current: number;
        remaining: number;
    } | null;
    releaseBatch(fieldName?: string): void;
    dispose(): void;
}
export default Resource;
//# sourceMappingURL=resource.class.d.ts.map