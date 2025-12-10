import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface SchemaSyncConfig {
    enabled: boolean;
    strategy: 'alter' | 'drop-create' | 'validate-only';
    onMismatch: 'error' | 'warn' | 'ignore';
    autoCreateTable: boolean;
    autoCreateColumns: boolean;
}
export interface TursoTableConfig {
    table: string;
    actions: string[];
}
export interface TursoResourceConfig {
    table?: string;
    actions?: string[];
    [key: string]: unknown;
}
export interface TursoReplicatorConfig extends BaseReplicatorConfig {
    url: string;
    authToken: string;
    schemaSync?: Partial<SchemaSyncConfig>;
}
export interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    results?: Array<{
        table: string;
        success: boolean;
    }>;
    errors?: Array<{
        table: string;
        error: string;
    }>;
    tables?: string[];
    error?: string;
}
interface TursoClientLike {
    execute(query: string | {
        sql: string;
        args: unknown[];
    }): Promise<{
        rows: Array<{
            name?: string;
            type?: string;
            [key: string]: unknown;
        }>;
    }>;
    close(): void;
}
interface DatabaseLike {
    getResource(name: string): Promise<ResourceLike>;
    [key: string]: unknown;
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
    [key: string]: unknown;
}
type ResourcesInput = string | TursoResourceConfig | TursoResourceConfig[] | Record<string, string | TursoResourceConfig | TursoResourceConfig[]>;
declare class TursoReplicator extends BaseReplicator {
    url: string;
    authToken: string;
    client: TursoClientLike | null;
    schemaSync: SchemaSyncConfig;
    resources: Record<string, TursoTableConfig[]>;
    constructor(config: TursoReplicatorConfig, resources?: Record<string, ResourcesInput>);
    parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, TursoTableConfig[]>;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    syncSchemas(database: DatabaseLike): Promise<void>;
    syncTableSchema(tableName: string, attributes: Record<string, unknown>): Promise<void>;
    shouldReplicateResource(resourceName: string): boolean;
    shouldReplicateAction(resourceName: string, operation: string): boolean;
    getTablesForResource(resourceName: string, operation: string): string[];
    replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string, beforeData?: unknown): Promise<ReplicateResult>;
    private _cleanInternalFields;
    cleanup(): Promise<void>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        url: string;
        resources: string[];
        schemaSync: SchemaSyncConfig;
    }>;
}
export default TursoReplicator;
//# sourceMappingURL=turso-replicator.class.d.ts.map