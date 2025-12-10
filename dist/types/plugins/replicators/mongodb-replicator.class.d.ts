import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface MongoDBCollectionConfig {
    collection: string;
    actions: string[];
}
export interface MongoDBResourceConfig {
    collection?: string;
    actions?: string[];
    [key: string]: unknown;
}
export interface MongoDBReplicatorConfig extends BaseReplicatorConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    options?: Record<string, unknown>;
    logCollection?: string;
}
export interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    results?: unknown[];
    errors?: Array<{
        id: string;
        error: string;
    }>;
    total?: number;
    error?: string;
}
interface MongoClientLike {
    connect(): Promise<void>;
    db(name?: string): MongoDBLike;
    close(): Promise<void>;
}
interface MongoDBLike {
    admin(): {
        ping(): Promise<void>;
    };
    collection(name: string): CollectionLike;
    listCollections(filter?: {
        name: string;
    }): {
        toArray(): Promise<unknown[]>;
    };
    createCollection(name: string): Promise<void>;
}
interface CollectionLike {
    insertOne(doc: unknown): Promise<unknown>;
    updateOne(filter: unknown, update: unknown): Promise<unknown>;
    deleteOne(filter: unknown): Promise<unknown>;
    createIndexes(indexes: Array<{
        key: Record<string, number>;
    }>): Promise<void>;
}
type ResourcesInput = string | MongoDBResourceConfig | MongoDBResourceConfig[] | Record<string, string | MongoDBResourceConfig | MongoDBResourceConfig[]>;
declare class MongoDBReplicator extends BaseReplicator {
    connectionString: string | undefined;
    host: string;
    port: number;
    databaseName: string | undefined;
    username: string | undefined;
    password: string | undefined;
    options: Record<string, unknown>;
    client: MongoClientLike | null;
    db: MongoDBLike | null;
    logCollection: string | undefined;
    resources: Record<string, MongoDBCollectionConfig[]>;
    constructor(config?: MongoDBReplicatorConfig, resources?: Record<string, ResourcesInput>);
    parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, MongoDBCollectionConfig[]>;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    private _createLogCollection;
    replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string): Promise<unknown>;
    private _insertDocument;
    private _updateDocument;
    private _deleteDocument;
    private _logOperation;
    shouldReplicateResource(resourceName: string): boolean;
    private _cleanInternalFields;
    replicateBatch(resourceName: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
    }>): Promise<ReplicateResult>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        host: string;
        database: string | undefined;
        resources: string[];
    }>;
    cleanup(): Promise<void>;
}
export default MongoDBReplicator;
//# sourceMappingURL=mongodb-replicator.class.d.ts.map