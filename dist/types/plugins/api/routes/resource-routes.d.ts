import type { Hono as HonoType, MiddlewareHandler } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
import type { GuardsConfig } from '../utils/guards.js';
export interface ResourceLike {
    name: string;
    version?: string;
    config?: {
        currentVersion?: string;
        attributes?: Record<string, unknown>;
        partitions?: Record<string, unknown>;
        api?: Record<string, unknown>;
        [key: string]: unknown;
    };
    schema?: {
        attributes?: Record<string, unknown>;
        [key: string]: unknown;
    };
    $schema?: {
        api?: {
            guard?: GuardsConfig;
            protected?: string[];
            description?: unknown;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    _relations?: Record<string, RelationDefinition>;
    database?: DatabaseLike;
    list(options?: {
        limit?: number;
        offset?: number;
    }): Promise<Record<string, unknown>[]>;
    listPartition(options: unknown): Promise<Record<string, unknown>[]>;
    query(filters: Record<string, unknown>, options?: {
        limit?: number;
        offset?: number;
    }): Promise<Record<string, unknown>[]>;
    get(id: string, options?: {
        include?: string[];
    }): Promise<Record<string, unknown> | null>;
    getFromPartition(options: {
        id: string;
        partitionName: string;
        partitionValues: unknown;
    }): Promise<Record<string, unknown> | null>;
    insert(data: Record<string, unknown>, options?: {
        user?: unknown;
        request?: unknown;
    }): Promise<Record<string, unknown>>;
    update(id: string, data: Record<string, unknown>, options?: {
        user?: unknown;
        request?: unknown;
    }): Promise<Record<string, unknown>>;
    delete(id: string): Promise<void>;
    count(): Promise<number>;
}
export interface DatabaseLike {
    resources?: Record<string, ResourceLike>;
    logger?: Logger;
}
export interface RelationDefinition {
    type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
    resource: string;
    foreignKey?: string;
    [key: string]: unknown;
}
export interface RelationsPluginLike {
    relations?: Record<string, Record<string, RelationDefinition>>;
    database?: DatabaseLike;
    populate(resource: ResourceLike, items: Record<string, unknown> | Record<string, unknown>[], includes: Record<string, unknown>): Promise<void>;
}
export interface EventsEmitter {
    emitResourceEvent(event: string, data: Record<string, unknown>): void;
}
export interface ResourceRoutesConfig {
    methods?: string[];
    customMiddleware?: MiddlewareHandler[];
    enableValidation?: boolean;
    versionPrefix?: string;
    events?: EventsEmitter | null;
    relationsPlugin?: RelationsPluginLike | null;
    globalGuards?: GuardsConfig | null;
    logLevel?: string;
}
export declare function createResourceRoutes(resource: ResourceLike, version: string, config: ResourceRoutesConfig | undefined, Hono: new () => HonoType): HonoType;
export interface RelationConfig {
    type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
    resource: string;
    [key: string]: unknown;
}
export declare function createRelationalRoutes(sourceResource: ResourceLike, relationName: string, relationConfig: RelationConfig, version: string, Hono: new () => HonoType): HonoType;
declare const _default: {
    createResourceRoutes: typeof createResourceRoutes;
    createRelationalRoutes: typeof createRelationalRoutes;
};
export default _default;
//# sourceMappingURL=resource-routes.d.ts.map