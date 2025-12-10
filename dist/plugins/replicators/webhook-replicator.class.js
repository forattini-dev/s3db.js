import tryFn from '#src/concerns/try-fn.js';
import { createHttpClient } from '#src/concerns/http-client.js';
import BaseReplicator from './base-replicator.class.js';
class WebhookReplicator extends BaseReplicator {
    url;
    method;
    headers;
    timeout;
    retries;
    retryDelay;
    retryStrategy;
    retryOnStatus;
    batch;
    batchSize;
    auth;
    resources;
    stats;
    _httpClient;
    constructor(config, resources = [], client = null) {
        super(config);
        this.url = config.url;
        if (!this.url) {
            throw this.createError('WebhookReplicator requires a "url" configuration', {
                operation: 'constructor',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the webhook endpoint URL: new WebhookReplicator({ url: "https://example.com/webhook" })'
            });
        }
        this.method = (config.method || 'POST').toUpperCase();
        this.headers = config.headers || {};
        this.timeout = config.timeout || 5000;
        this.retries = config.retries ?? 3;
        this.retryDelay = config.retryDelay || 1000;
        this.retryStrategy = config.retryStrategy || 'exponential';
        this.retryOnStatus = config.retryOnStatus || [429, 500, 502, 503, 504];
        this.batch = config.batch || false;
        this.batchSize = config.batchSize || 100;
        this.auth = config.auth || null;
        if (Array.isArray(resources)) {
            this.resources = {};
            for (const resource of resources) {
                if (typeof resource === 'string') {
                    this.resources[resource] = true;
                }
                else if (typeof resource === 'object' && resource.name) {
                    this.resources[resource.name] = resource;
                }
            }
        }
        else if (typeof resources === 'object') {
            this.resources = resources;
        }
        else {
            this.resources = {};
        }
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retriedRequests: 0,
            totalRetries: 0
        };
        this._httpClient = null;
    }
    validateConfig() {
        const errors = [];
        if (!this.url) {
            errors.push('URL is required');
        }
        try {
            new URL(this.url);
        }
        catch (err) {
            errors.push(`Invalid URL format: ${this.url}`);
        }
        if (this.auth) {
            if (!this.auth.type) {
                errors.push('auth.type is required when auth is configured');
            }
            else if (!['bearer', 'basic', 'apikey'].includes(this.auth.type)) {
                errors.push('auth.type must be one of: bearer, basic, apikey');
            }
            if (this.auth.type === 'bearer' && !this.auth.token) {
                errors.push('auth.token is required for bearer authentication');
            }
            if (this.auth.type === 'basic' && (!this.auth.username || !this.auth.password)) {
                errors.push('auth.username and auth.password are required for basic authentication');
            }
            if (this.auth.type === 'apikey' && (!this.auth.header || !this.auth.value)) {
                errors.push('auth.header and auth.value are required for API key authentication');
            }
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    _applyTransformer(resource, data) {
        let cleanData = this._cleanInternalFields(data);
        const entry = this.resources[resource];
        let result = cleanData;
        if (!entry)
            return cleanData;
        if (typeof entry === 'object' && typeof entry.transform === 'function') {
            result = entry.transform(cleanData);
        }
        return result || cleanData;
    }
    _cleanInternalFields(data) {
        if (!data || typeof data !== 'object')
            return data;
        const cleanData = { ...data };
        Object.keys(cleanData).forEach(key => {
            if (key.startsWith('$') || key.startsWith('_')) {
                delete cleanData[key];
            }
        });
        return cleanData;
    }
    createPayload(resource, operation, data, id, beforeData = null) {
        const basePayload = {
            resource: resource,
            action: operation,
            timestamp: new Date().toISOString(),
            source: 's3db-webhook-replicator'
        };
        switch (operation) {
            case 'insert':
                return {
                    ...basePayload,
                    data: data
                };
            case 'update':
                return {
                    ...basePayload,
                    before: beforeData,
                    data: data
                };
            case 'delete':
                return {
                    ...basePayload,
                    data: data
                };
            default:
                return {
                    ...basePayload,
                    data: data
                };
        }
    }
    async _getHttpClient() {
        if (!this._httpClient) {
            this._httpClient = await createHttpClient({
                baseUrl: this.url,
                headers: {
                    'User-Agent': 's3db-webhook-replicator',
                    ...this.headers
                },
                timeout: this.timeout,
                auth: this.auth,
                retry: {
                    maxAttempts: this.retries,
                    delay: this.retryDelay,
                    backoff: this.retryStrategy,
                    jitter: true,
                    retryAfter: true,
                    retryOn: this.retryOnStatus
                }
            });
        }
        return this._httpClient;
    }
    async _makeRequest(payload) {
        this.stats.totalRequests++;
        try {
            const client = await this._getHttpClient();
            const response = await client.request('', {
                method: this.method,
                body: payload
            });
            if (response.ok) {
                this.stats.successfulRequests++;
                return {
                    success: true,
                    status: response.status,
                    statusText: response.statusText
                };
            }
            this.stats.failedRequests++;
            const errorText = await response.text().catch(() => '');
            return {
                success: false,
                status: response.status,
                statusText: response.statusText,
                error: errorText || `HTTP ${response.status}: ${response.statusText}`
            };
        }
        catch (error) {
            this.stats.failedRequests++;
            return {
                success: false,
                error: error.message
            };
        }
    }
    async initialize(database) {
        await super.initialize(database);
        const validation = this.validateConfig();
        if (!validation.isValid) {
            const error = new Error(`WebhookReplicator configuration is invalid: ${validation.errors.join(', ')}`);
            this.logger.error({ errors: validation.errors }, error.message);
            this.emit('initialization_error', {
                replicator: this.name,
                error: error.message,
                errors: validation.errors
            });
            throw error;
        }
        this.emit('db:plugin:initialized', {
            replicator: this.name,
            url: this.url,
            method: this.method,
            authType: this.auth?.type || 'none',
            resources: Object.keys(this.resources || {})
        });
    }
    async replicate(resource, operation, data, id, beforeData = null) {
        if (this.enabled === false) {
            return { skipped: true, reason: 'replicator_disabled' };
        }
        if (!this.shouldReplicateResource(resource)) {
            return { skipped: true, reason: 'resource_not_included' };
        }
        const [ok, err, result] = await tryFn(async () => {
            const transformedData = this._applyTransformer(resource, data);
            const payload = this.createPayload(resource, operation, transformedData, id, beforeData);
            const response = await this._makeRequest(payload);
            if (response.success) {
                this.emit('plg:replicator:replicated', {
                    replicator: this.name,
                    resource,
                    operation,
                    id,
                    url: this.url,
                    status: response.status,
                    success: true
                });
                return { success: true, status: response.status };
            }
            throw this.createError(response.error || `HTTP ${response.status}: ${response.statusText}`, {
                operation: 'replicate',
                resourceName: resource,
                statusCode: response.status ?? 502,
                retriable: this.retryOnStatus?.includes?.(response.status ?? 0) ?? false,
                suggestion: 'Inspect the webhook endpoint response and credentials, then retry after the remote service succeeds.',
                metadata: {
                    status: response.status,
                    statusText: response.statusText,
                    url: this.url
                }
            });
        });
        if (ok)
            return result;
        this.logger.warn({ resource, error: err.message }, 'Replication failed');
        this.emit('plg:replicator:error', {
            replicator: this.name,
            resource,
            operation,
            id,
            error: err.message
        });
        return { success: false, error: err.message };
    }
    async replicateBatch(resource, records) {
        if (this.enabled === false) {
            return { skipped: true, reason: 'replicator_disabled' };
        }
        if (!this.shouldReplicateResource(resource)) {
            return { skipped: true, reason: 'resource_not_included' };
        }
        const [ok, err, result] = await tryFn(async () => {
            if (this.batch) {
                const payloads = records.map(record => this.createPayload(resource, record.operation, this._applyTransformer(resource, record.data), record.id, record.beforeData));
                const response = await this._makeRequest({ batch: payloads });
                if (response.success) {
                    this.emit('batch_replicated', {
                        replicator: this.name,
                        resource,
                        url: this.url,
                        total: records.length,
                        successful: records.length,
                        errors: 0,
                        status: response.status
                    });
                    return {
                        success: true,
                        total: records.length,
                        successful: records.length,
                        errors: 0,
                        status: response.status
                    };
                }
                throw this.createError(response.error || `HTTP ${response.status}: ${response.statusText}`, {
                    operation: 'replicateBatch',
                    resourceName: resource,
                    statusCode: response.status ?? 502,
                    retriable: this.retryOnStatus?.includes?.(response.status ?? 0) ?? false,
                    suggestion: 'Check the webhook batch payload, remote rate limits, and retry policy before retrying.',
                    metadata: {
                        status: response.status,
                        statusText: response.statusText,
                        url: this.url,
                        batchSize: records.length
                    }
                });
            }
            const results = await Promise.allSettled(records.map(record => this.replicate(resource, record.operation, record.data, record.id, record.beforeData)));
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.length - successful;
            this.emit('batch_replicated', {
                replicator: this.name,
                resource,
                url: this.url,
                total: records.length,
                successful,
                errors: failed
            });
            return {
                success: failed === 0,
                total: records.length,
                successful,
                errors: failed,
                results
            };
        });
        if (ok)
            return result;
        this.logger.warn({ resource, error: err.message }, 'Batch replication failed');
        this.emit('batch_replicator_error', {
            replicator: this.name,
            resource,
            error: err.message
        });
        return { success: false, error: err.message };
    }
    async testConnection() {
        const [ok, err] = await tryFn(async () => {
            const testPayload = {
                test: true,
                timestamp: new Date().toISOString(),
                source: 's3db-webhook-replicator'
            };
            const response = await this._makeRequest(testPayload);
            if (!response.success) {
                throw this.createError(response.error || `HTTP ${response.status}: ${response.statusText}`, {
                    operation: 'testConnection',
                    statusCode: response.status ?? 502,
                    retriable: this.retryOnStatus?.includes?.(response.status ?? 0) ?? false,
                    suggestion: 'Confirm the webhook endpoint, authentication headers, and retryOnStatus settings before retrying.',
                    metadata: {
                        status: response.status,
                        statusText: response.statusText,
                        url: this.url
                    }
                });
            }
            return true;
        });
        if (ok)
            return true;
        this.logger.warn({ error: err.message }, 'Connection test failed');
        this.emit('connection_error', {
            replicator: this.name,
            error: err.message
        });
        return false;
    }
    async getStatus() {
        const baseStatus = await super.getStatus();
        return {
            ...baseStatus,
            url: this.url,
            method: this.method,
            authType: this.auth?.type || 'none',
            timeout: this.timeout,
            retries: this.retries,
            retryStrategy: this.retryStrategy,
            batchMode: this.batch,
            resources: Object.keys(this.resources || {}),
            stats: { ...this.stats }
        };
    }
    shouldReplicateResource(resource) {
        if (!this.resources || Object.keys(this.resources).length === 0) {
            return true;
        }
        return Object.keys(this.resources).includes(resource);
    }
}
export default WebhookReplicator;
//# sourceMappingURL=webhook-replicator.class.js.map