import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface DynamoDBCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
}
export interface DynamoDBTableConfig {
    table: string;
    actions: string[];
    primaryKey: string;
    sortKey?: string;
}
export interface DynamoDBResourceConfig {
    table?: string;
    actions?: string[];
    primaryKey?: string;
    sortKey?: string;
    [key: string]: unknown;
}
export interface DynamoDBReplicatorConfig extends BaseReplicatorConfig {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    credentials?: DynamoDBCredentials;
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
interface DynamoDBClientLike {
    send(command: unknown): Promise<unknown>;
    destroy(): void;
}
interface DynamoDBDocumentClientLike {
    send(command: unknown): Promise<unknown>;
}
type ResourcesInput = string | DynamoDBResourceConfig | DynamoDBResourceConfig[] | Record<string, string | DynamoDBResourceConfig | DynamoDBResourceConfig[]>;
declare class DynamoDBReplicator extends BaseReplicator {
    region: string;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    endpoint: string | undefined;
    credentials: DynamoDBCredentials | undefined;
    client: DynamoDBClientLike | null;
    docClient: DynamoDBDocumentClientLike | null;
    resources: Record<string, DynamoDBTableConfig[]>;
    PutCommand: unknown;
    UpdateCommand: unknown;
    DeleteCommand: unknown;
    constructor(config?: DynamoDBReplicatorConfig, resources?: Record<string, ResourcesInput>);
    parseResourcesConfig(resources: Record<string, ResourcesInput>): Record<string, DynamoDBTableConfig[]>;
    validateConfig(): ValidationResult;
    initialize(database: unknown): Promise<void>;
    shouldReplicateResource(resourceName: string): boolean;
    replicate(resourceName: string, operation: string, data: Record<string, unknown>, id: string): Promise<unknown>;
    private _putItem;
    private _updateItem;
    private _deleteItem;
    private _cleanInternalFields;
    replicateBatch(resourceName: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
    }>): Promise<ReplicateResult>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        region: string;
        endpoint: string;
        resources: string[];
    }>;
    cleanup(): Promise<void>;
}
export default DynamoDBReplicator;
//# sourceMappingURL=dynamodb-replicator.class.d.ts.map