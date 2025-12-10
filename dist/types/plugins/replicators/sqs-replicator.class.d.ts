import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface SqsResourceConfig {
    name?: string;
    queueUrl?: string;
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    [key: string]: unknown;
}
export interface SqsReplicatorConfig extends BaseReplicatorConfig {
    region?: string;
    queueUrl?: string;
    queues?: Record<string, string>;
    defaultQueue?: string | null;
    messageGroupId?: string;
    deduplicationId?: boolean;
    resourceQueueMap?: Record<string, string[]> | null;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
}
export interface SqsMessage {
    resource: string;
    action: string;
    timestamp: string;
    source: string;
    data?: unknown;
    before?: unknown;
}
export interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    error?: string;
    results?: Array<{
        queueUrl: string;
        messageId: string;
    }>;
    total?: number;
    queueUrl?: string;
    errors?: Array<{
        batch: number;
        error: string;
    }>;
}
interface SQSClientLike {
    send(command: unknown): Promise<{
        MessageId?: string;
    }>;
    destroy(): void;
}
type ResourcesInput = string[] | Array<{
    name: string;
    queueUrl?: string;
    [key: string]: unknown;
}> | Record<string, SqsResourceConfig | boolean>;
declare class SqsReplicator extends BaseReplicator {
    client: SQSClientLike | null;
    queueUrl: string | undefined;
    queues: Record<string, string>;
    defaultQueue: string | null;
    region: string;
    sqsClient: SQSClientLike | null;
    messageGroupId: string | undefined;
    deduplicationId: boolean | undefined;
    resourceQueueMap: Record<string, string[]> | null;
    resources: Record<string, SqsResourceConfig | boolean>;
    constructor(config?: SqsReplicatorConfig, resources?: ResourcesInput, client?: SQSClientLike | null);
    validateConfig(): ValidationResult;
    getQueueUrlsForResource(resource: string): string[];
    private _applyTransformer;
    private _cleanInternalFields;
    createMessage(resource: string, operation: string, data: unknown, id: string, beforeData?: unknown): SqsMessage;
    initialize(database: unknown, client?: SQSClientLike): Promise<void>;
    replicate(resource: string, operation: string, data: Record<string, unknown>, id: string, beforeData?: unknown): Promise<ReplicateResult>;
    replicateBatch(resource: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
        beforeData?: unknown;
    }>): Promise<ReplicateResult>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        connected: boolean;
        queueUrl: string | undefined;
        region: string;
        resources: string[];
        totalreplicators: number;
        totalErrors: number;
    }>;
    cleanup(): Promise<void>;
    shouldReplicateResource(resource: string): boolean;
}
export default SqsReplicator;
//# sourceMappingURL=sqs-replicator.class.d.ts.map