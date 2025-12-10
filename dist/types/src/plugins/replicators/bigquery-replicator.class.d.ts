import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface BigQueryCredentials {
    client_email: string;
    private_key: string;
    project_id?: string;
    [key: string]: unknown;
}
export interface SchemaSyncConfig {
    enabled: boolean;
    strategy: 'alter' | 'drop-create' | 'validate-only';
    onMismatch: 'error' | 'warn' | 'ignore';
    autoCreateTable: boolean;
    autoCreateColumns: boolean;
}
export interface TableOptions {
    timePartitioning?: {
        type: string;
        field?: string;
        expirationMs?: number;
    };
    clustering?: {
        fields: string[];
    };
    [key: string]: unknown;
}
export interface BigQueryTableConfig {
    table: string;
    actions: string[];
    transform: ((data: Record<string, unknown>) => Record<string, unknown>) | null;
    mutability: 'append-only' | 'mutable' | 'immutable';
    tableOptions: TableOptions | null;
}
export interface BigQueryResourceConfig {
    table?: string;
    actions?: string[];
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    mutability?: 'append-only' | 'mutable' | 'immutable';
    tableOptions?: TableOptions;
    [key: string]: unknown;
}
export interface BigQueryReplicatorConfig extends BaseReplicatorConfig {
    projectId: string;
    datasetId: string;
    credentials?: BigQueryCredentials;
    location?: string;
    logTable?: string;
    mutability?: 'append-only' | 'mutable' | 'immutable';
    schemaSync?: Partial<SchemaSyncConfig>;
}
export interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    results?: Array<{
        table: string;
        success: boolean;
        jobId?: string;
    }>;
    errors?: Array<{
        table: string;
        error: string;
    }>;
    tables?: string[];
    error?: string;
}
interface BigQueryClientLike {
    dataset(datasetId: string): DatasetLike;
    createQueryJob(options: {
        query: string;
        params: Record<string, unknown>;
        location: string;
    }): Promise<[JobLike]>;
}
interface DatasetLike {
    getMetadata(): Promise<[unknown]>;
    table(tableName: string): TableLike;
    createTable(tableName: string, options: {
        schema: unknown;
        timePartitioning?: unknown;
        clustering?: unknown;
    }): Promise<void>;
}
interface TableLike {
    exists(): Promise<[boolean]>;
    getMetadata(): Promise<[{
        schema: {
            fields: unknown[];
        };
    }]>;
    setMetadata(metadata: {
        schema: unknown[];
    }): Promise<void>;
    delete(): Promise<void>;
    insert(rows: unknown[]): Promise<[unknown]>;
}
interface JobLike {
    id?: string;
    getQueryResults(): Promise<void>;
}
interface DatabaseLike {
    getResource(name: string): Promise<ResourceLike>;
    [key: string]: unknown;
}
interface ResourceLike {
    $schema: {
        attributes?: Record<string, unknown>;
        _pluginAttributes?: Record<string, string[]>;
    };
    [key: string]: unknown;
}
type ResourcesInput = string | BigQueryResourceConfig | BigQueryResourceConfig[] | Record<string, string | BigQueryResourceConfig | BigQueryResourceConfig[]>;
declare class BigqueryReplicator extends BaseReplicator {
    projectId: string;
    datasetId: string;
    bigqueryClient: BigQueryClientLike | null;
    credentials: BigQueryCredentials | undefined;
    location: string;
    logTable: string | undefined;
    mutability: 'append-only' | 'mutable' | 'immutable';
    schemaSync: SchemaSyncConfig;
    resources: Record<string, BigQueryTableConfig[]>;
    versionCounters: Map<string, number>;
    constructor(config: BigQueryReplicatorConfig, resources?: Record<string, ResourcesInput>);
    private _validateMutability;
    parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, BigQueryTableConfig[]>;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    syncSchemas(database: DatabaseLike): Promise<void>;
    syncTableSchema(tableName: string, attributes: Record<string, unknown>, mutability?: string, tableOptions?: TableOptions | null): Promise<void>;
    shouldReplicateResource(resourceName: string): boolean;
    shouldReplicateAction(resourceName: string, operation: string): boolean;
    getTablesForResource(resourceName: string, operation: string): Array<{
        table: string;
        transform: ((data: Record<string, unknown>) => Record<string, unknown>) | null;
        mutability: string;
        tableOptions: TableOptions | null;
    }>;
    applyTransform(data: Record<string, unknown>, transformFn: ((data: Record<string, unknown>) => Record<string, unknown>) | null): Record<string, unknown>;
    private _cleanInternalFields;
    private _addTrackingFields;
    private _getNextVersion;
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
    private _parseGcpError;
    private _getCredentialsSuggestion;
    testConnection(): Promise<boolean>;
    cleanup(): Promise<void>;
    getStatus(): Promise<ReplicatorStatus & {
        projectId: string;
        datasetId: string;
        resources: Record<string, BigQueryTableConfig[]>;
        logTable: string | undefined;
        schemaSync: SchemaSyncConfig;
        mutability: string;
    }>;
}
export default BigqueryReplicator;
//# sourceMappingURL=bigquery-replicator.class.d.ts.map