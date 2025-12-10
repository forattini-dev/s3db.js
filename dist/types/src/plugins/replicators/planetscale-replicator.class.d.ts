import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface SchemaSyncConfig {
    enabled: boolean;
    strategy: 'alter' | 'drop-create' | 'validate-only';
    onMismatch: 'error' | 'warn' | 'ignore';
    autoCreateTable: boolean;
    autoCreateColumns: boolean;
}
export interface PlanetScaleTableConfig {
    table: string;
    actions: string[];
}
export interface PlanetScaleResourceConfig {
    table?: string;
    actions?: string[];
    [key: string]: unknown;
}
export interface PlanetScaleReplicatorConfig extends BaseReplicatorConfig {
    host: string;
    username: string;
    password: string;
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
interface PlanetScaleConnectionLike {
    execute(sql: string, values?: unknown[]): Promise<unknown>;
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
type ResourcesInput = string | PlanetScaleResourceConfig | PlanetScaleResourceConfig[] | Record<string, string | PlanetScaleResourceConfig | PlanetScaleResourceConfig[]>;
declare class PlanetScaleReplicator extends BaseReplicator {
    host: string;
    username: string;
    password: string;
    connection: PlanetScaleConnectionLike | null;
    schemaSync: SchemaSyncConfig;
    resources: Record<string, PlanetScaleTableConfig[]>;
    constructor(config: PlanetScaleReplicatorConfig, resources?: Record<string, ResourcesInput>);
    parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, PlanetScaleTableConfig[]>;
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
        host: string;
        resources: string[];
        schemaSync: SchemaSyncConfig;
    }>;
}
export default PlanetScaleReplicator;
//# sourceMappingURL=planetscale-replicator.class.d.ts.map