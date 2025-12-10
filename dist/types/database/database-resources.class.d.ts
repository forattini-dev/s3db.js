import Resource from '../resource.class.js';
import type { BehaviorType } from '../behaviors/types.js';
import type { ResourceExport } from '../resource.class.js';
import type { HooksCollection } from '../core/resource-hooks.class.js';
import type { PartitionsConfig } from '../core/resource-query.class.js';
import type { AttributesSchema } from '../core/resource-validator.class.js';
import type { MiddlewareFunction } from '../core/resource-middleware.class.js';
import type { StringRecord, EventHandler } from '../types/common.types.js';
import type { DatabaseRef } from './types.js';
import type { DatabaseMetadata } from './database-metadata.class.js';
import type { DatabaseCoordinators } from './database-coordinators.class.js';
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
export interface CreateResourceConfig {
    name: string;
    attributes: AttributesSchema;
    behavior?: BehaviorType;
    hooks?: Partial<HooksCollection>;
    middlewares?: MiddlewareFunction[] | StringRecord<MiddlewareFunction | MiddlewareFunction[]>;
    timestamps?: boolean;
    partitions?: PartitionsConfig | string[];
    paranoid?: boolean;
    cache?: boolean;
    autoDecrypt?: boolean;
    asyncEvents?: boolean;
    asyncPartitions?: boolean;
    strictValidation?: boolean;
    passphrase?: string;
    bcryptRounds?: number;
    idGenerator?: ((size?: number) => string) | number | string;
    idSize?: number;
    map?: StringRecord<string>;
    events?: StringRecord<EventHandler | EventHandler[]>;
    disableEvents?: boolean;
    createdBy?: string;
    version?: string;
    allNestedObjectsOptional?: boolean;
    api?: ResourceApiConfig;
    description?: string;
}
export interface HashExistsResult {
    exists: boolean;
    sameHash: boolean;
    hash: string | null;
    existingHash?: string;
}
export declare class DatabaseResources {
    private database;
    private metadata;
    private coordinators;
    constructor(database: DatabaseRef, metadata: DatabaseMetadata, coordinators: DatabaseCoordinators);
    resourceExists(name: string): boolean;
    resourceExistsWithSameHash({ name, attributes, behavior, partitions }: {
        name: string;
        attributes: AttributesSchema;
        behavior?: BehaviorType;
        partitions?: PartitionsConfig;
    }): HashExistsResult;
    createResource({ name, attributes, behavior, hooks, middlewares, ...config }: CreateResourceConfig): Promise<Resource>;
    listResources(): Promise<ResourceExport[]>;
    getResource(name: string): Promise<Resource>;
    private _normalizePartitions;
    private _applyMiddlewares;
}
//# sourceMappingURL=database-resources.class.d.ts.map