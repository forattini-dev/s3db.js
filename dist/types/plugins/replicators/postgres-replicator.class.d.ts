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
export interface PostgresReplicatorConfig extends BaseReplicatorConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: Record<string, unknown> | boolean;
    logTable?: string;
    schemaSync?: Partial<SchemaSyncConfig>;
}
export interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    results?: Array<{
        table: string;
        success: boolean;
        rows: unknown[];
        rowCount: number;
    }>;
    errors?: Array<{
        table: string;
        error: string;
    }>;
    tables?: string[];
    error?: string;
}
type ResourceConfig = string | TableConfig | Array<string | TableConfig>;
interface PostgresClient {
    query(sql: string, params?: unknown[]): Promise<{
        rows: unknown[];
        rowCount: number;
    }>;
    connect(): Promise<void>;
    end(): Promise<void>;
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
declare class PostgresReplicator extends BaseReplicator {
    connectionString: string | undefined;
    host: string | undefined;
    port: number;
    databaseName: string | undefined;
    user: string | undefined;
    password: string | undefined;
    client: PostgresClient | null;
    ssl: Record<string, unknown> | boolean | undefined;
    logTable: string | undefined;
    schemaSync: SchemaSyncConfig;
    resources: Record<string, TableConfig[]>;
    constructor(config?: PostgresReplicatorConfig, resources?: Record<string, ResourceConfig>);
    private parseResourcesConfig;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    private createLogTableIfNotExists;
    syncSchemas(database: DatabaseLike): Promise<void>;
    private syncTableSchema;
    shouldReplicateResource(resourceName: string): boolean;
    shouldReplicateAction(resourceName: string, operation: string): boolean;
    getTablesForResource(resourceName: string, operation: string): string[];
    replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string, beforeData?: unknown): Promise<ReplicateResult>;
    replicateBatch(resourceName: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
        beforeData?: unknown;
    }>): Promise<{
        success: boolean;
        results: unknown[];
        errors: unknown[];
    }>;
    testConnection(): Promise<boolean>;
    private _cleanInternalFields;
    cleanup(): Promise<void>;
    getStatus(): Promise<ReplicatorStatus>;
}
export default PostgresReplicator;
//# sourceMappingURL=postgres-replicator.class.d.ts.map