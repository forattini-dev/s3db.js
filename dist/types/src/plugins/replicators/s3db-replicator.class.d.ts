import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface ResourceTransformConfig {
    resource: string;
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    actions?: string[];
}
export type ResourceMapEntry = string | ResourceTransformConfig | Array<string | ResourceTransformConfig> | ((data: Record<string, unknown>) => Record<string, unknown>);
export interface S3dbReplicatorConfig extends BaseReplicatorConfig {
    connectionString?: string;
    region?: string;
    keyPrefix?: string;
}
export interface ReplicateInput {
    resource: string;
    operation: string;
    data: Record<string, unknown>;
    id: string;
}
export interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    action?: string;
    destination?: string;
    error?: string;
    results?: unknown[];
    errors?: Array<{
        id: string;
        error: string;
    }>;
    total?: number;
}
interface ResourceLike {
    insert(data: Record<string, unknown>): Promise<unknown>;
    update(id: string, data: Record<string, unknown>): Promise<unknown>;
    delete(id: string): Promise<unknown>;
}
interface DatabaseLike {
    resources?: Record<string, ResourceLike>;
    connect(): Promise<void>;
    removeAllListeners(): void;
}
type ResourcesInput = string | string[] | Record<string, ResourceMapEntry>;
declare class S3dbReplicator extends BaseReplicator {
    instanceId: string;
    client: DatabaseLike | null;
    connectionString: string | undefined;
    region: string | undefined;
    keyPrefix: string | undefined;
    resourcesMap: Record<string, ResourceMapEntry> | ((data: Record<string, unknown>) => Record<string, unknown>);
    targetDatabase: DatabaseLike | null;
    constructor(config?: S3dbReplicatorConfig, resources?: ResourcesInput, client?: DatabaseLike | null);
    private _normalizeResources;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    replicate(resourceOrObj: string | ReplicateInput, operation?: string, data?: Record<string, unknown>, recordId?: string, beforeData?: unknown): Promise<ReplicateResult | ReplicateResult[]>;
    private _replicateToSingleDestination;
    private _applyTransformer;
    private _cleanInternalFields;
    private _resolveDestResource;
    private _getDestResourceObj;
    replicateBatch(resourceName: string, records: Array<{
        operation: string;
        id: string;
        data: Record<string, unknown>;
        beforeData?: unknown;
    }>): Promise<ReplicateResult>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        targetDatabase: string;
        resources: string[];
        totalreplicators: number;
        totalErrors: number;
    }>;
    cleanup(): Promise<void>;
    shouldReplicateResource(resource: string, action?: string): boolean;
}
export default S3dbReplicator;
//# sourceMappingURL=s3db-replicator.class.d.ts.map