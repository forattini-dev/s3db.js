import BaseReplicator from './base-replicator.class.js';
import type { BaseReplicatorConfig, ValidationResult, ReplicatorStatus } from './base-replicator.class.js';
export interface WebhookAuthConfig {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    header?: string;
    value?: string;
}
export interface WebhookResourceConfig {
    name?: string;
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    [key: string]: unknown;
}
export interface WebhookReplicatorConfig extends BaseReplicatorConfig {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    retryStrategy?: 'fixed' | 'exponential';
    retryOnStatus?: number[];
    batch?: boolean;
    batchSize?: number;
    auth?: WebhookAuthConfig | null;
}
export interface WebhookPayload {
    resource: string;
    action: string;
    timestamp: string;
    source: string;
    data?: unknown;
    before?: unknown;
}
export interface WebhookRequestResult {
    success: boolean;
    status?: number;
    statusText?: string;
    error?: string;
}
export interface WebhookStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    retriedRequests: number;
    totalRetries: number;
}
export interface ReplicateResult {
    success?: boolean;
    skipped?: boolean;
    reason?: string;
    status?: number;
    error?: string;
    total?: number;
    successful?: number;
    errors?: number;
    results?: unknown[];
}
type ResourcesInput = string[] | Array<{
    name: string;
    [key: string]: unknown;
}> | Record<string, WebhookResourceConfig | boolean>;
declare class WebhookReplicator extends BaseReplicator {
    url: string;
    method: string;
    headers: Record<string, string>;
    timeout: number;
    retries: number;
    retryDelay: number;
    retryStrategy: 'fixed' | 'exponential';
    retryOnStatus: number[];
    batch: boolean;
    batchSize: number;
    auth: WebhookAuthConfig | null;
    resources: Record<string, WebhookResourceConfig | boolean>;
    stats: WebhookStats;
    private _httpClient;
    constructor(config: WebhookReplicatorConfig, resources?: ResourcesInput, client?: unknown);
    validateConfig(): ValidationResult;
    private _applyTransformer;
    private _cleanInternalFields;
    createPayload(resource: string, operation: string, data: unknown, id: string, beforeData?: unknown): WebhookPayload;
    private _getHttpClient;
    private _makeRequest;
    initialize(database: unknown): Promise<void>;
    replicate(resource: string, operation: string, data: Record<string, unknown>, id: string, beforeData?: unknown): Promise<ReplicateResult>;
    replicateBatch(resource: string, records: Array<{
        operation: string;
        data: Record<string, unknown>;
        id: string;
        beforeData?: unknown;
    }>): Promise<ReplicateResult>;
    testConnection(): Promise<boolean>;
    getStatus(): Promise<ReplicatorStatus & {
        url: string;
        method: string;
        authType: string;
        timeout: number;
        retries: number;
        retryStrategy: string;
        batchMode: boolean;
        resources: string[];
        stats: WebhookStats;
    }>;
    shouldReplicateResource(resource: string): boolean;
}
export default WebhookReplicator;
//# sourceMappingURL=webhook-replicator.class.d.ts.map