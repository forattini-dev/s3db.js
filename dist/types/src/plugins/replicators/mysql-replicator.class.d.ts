import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface TableConfig {
    table: string;
    actions: string[];
}
export interface SchemaSyncConfig {
    enabled: boolean;
    strategy: 'alter' | 'drop-create' | 'validate-only';
    onMismatch: 'error' | 'warn' | 'ignore';
    autoCreateTable: boolean;
    autoCreateColumns: boolean;
    dropMissingColumns: boolean;
}
export interface MySQLReplicatorConfig extends BaseReplicatorConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: Record<string, unknown> | boolean;
    connectionLimit?: number;
    logTable?: string;
    schemaSync?: Partial<SchemaSyncConfig>;
}
export interface ReplicateResult {
    insertId?: number;
    affectedRows?: number;
    changedRows?: number;
}
type ResourceConfig = string | TableConfig | Array<string | TableConfig>;
interface MySQLPoolConnection {
    ping(): Promise<void>;
    release(): void;
    query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
}
interface MySQLPool {
    promise(): {
        getConnection(): Promise<MySQLPoolConnection>;
        query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
    };
    end(): Promise<void>;
    pool: {
        allConnections: unknown[];
    };
}
interface ResourceLike {
    config: {
        versions: Record<string, {
            attributes?: Record<string, unknown>;
        }>;
        currentVersion: string;
    };
    schema?: {
        _pluginAttributes?: Record<string, string[]>;
    };
}
interface DatabaseLike {
    getResource(name: string): Promise<ResourceLike>;
}
declare class MySQLReplicator extends BaseReplicator {
    connectionString: string | undefined;
    host: string;
    port: number;
    databaseName: string | undefined;
    user: string | undefined;
    password: string | undefined;
    pool: MySQLPool | null;
    ssl: Record<string, unknown> | boolean | undefined;
    connectionLimit: number;
    logTable: string | undefined;
    schemaSync: SchemaSyncConfig;
    resources: Record<string, TableConfig[]>;
    constructor(config?: MySQLReplicatorConfig, resources?: Record<string, ResourceConfig>);
    private parseResourcesConfig;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    syncSchemas(database: DatabaseLike): Promise<void>;
    private syncTableSchema;
    shouldReplicateResource(resourceName: string): boolean;
    private _createLogTable;
    replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string): Promise<ReplicateResult | null | undefined>;
    private _insertRecord;
    private _updateRecord;
    private _deleteRecord;
    private _logOperation;
    private _cleanInternalFields;
    replicateBatch(resourceName: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
    }>): Promise<{
        success: boolean;
        results: unknown[];
        errors: unknown[];
        total: number;
    }>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        host: string;
        database: string | undefined;
        resources: string[];
        poolConnections: number;
        schemaSync: SchemaSyncConfig;
    }>;
    cleanup(): Promise<void>;
}
export default MySQLReplicator;
//# sourceMappingURL=mysql-replicator.class.d.ts.map