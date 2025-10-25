import tryFn from "#src/concerns/try-fn.js";
import BaseReplicator from './base-replicator.class.js';

/**
 * Webhook Replicator - Send data changes to HTTP endpoints
 *
 * Sends database changes to webhook endpoints via HTTP POST requests.
 * Supports multiple authentication methods, custom headers, retries, and transformers.
 *
 * Configuration:
 * @param {string} url - Webhook endpoint URL (required)
 * @param {string} method - HTTP method (default: 'POST')
 * @param {Object} auth - Authentication configuration
 * @param {string} auth.type - Auth type: 'bearer', 'basic', 'apikey'
 * @param {string} auth.token - Bearer token
 * @param {string} auth.username - Basic auth username
 * @param {string} auth.password - Basic auth password
 * @param {string} auth.header - API key header name
 * @param {string} auth.value - API key value
 * @param {Object} headers - Custom headers to send
 * @param {number} timeout - Request timeout in ms (default: 5000)
 * @param {number} retries - Number of retry attempts (default: 3)
 * @param {number} retryDelay - Delay between retries in ms (default: 1000)
 * @param {string} retryStrategy - 'fixed' or 'exponential' (default: 'exponential')
 * @param {Array<number>} retryOnStatus - Status codes to retry (default: [429, 500, 502, 503, 504])
 * @param {boolean} batch - Enable batch mode (default: false)
 * @param {number} batchSize - Max records per batch request (default: 100)
 *
 * @example
 * // Bearer token authentication
 * new WebhookReplicator({
 *   url: 'https://api.example.com/webhook',
 *   auth: {
 *     type: 'bearer',
 *     token: 'your-secret-token'
 *   },
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'X-Custom-Header': 'value'
 *   },
 *   timeout: 10000,
 *   retries: 3
 * }, ['users', 'orders'])
 *
 * @example
 * // Basic authentication
 * new WebhookReplicator({
 *   url: 'https://api.example.com/webhook',
 *   auth: {
 *     type: 'basic',
 *     username: 'user',
 *     password: 'pass'
 *   }
 * })
 *
 * @example
 * // API Key authentication
 * new WebhookReplicator({
 *   url: 'https://api.example.com/webhook',
 *   auth: {
 *     type: 'apikey',
 *     header: 'X-API-Key',
 *     value: 'your-api-key'
 *   }
 * })
 *
 * @example
 * // With resource transformers
 * new WebhookReplicator({
 *   url: 'https://api.example.com/webhook',
 *   resources: {
 *     users: (data) => ({
 *       ...data,
 *       source: 's3db',
 *       transformedAt: new Date().toISOString()
 *     })
 *   }
 * })
 */
class WebhookReplicator extends BaseReplicator {
  constructor(config = {}, resources = [], client = null) {
    super(config);

    // Required
    this.url = config.url;
    if (!this.url) {
      throw new Error('WebhookReplicator requires a "url" configuration');
    }

    // HTTP settings
    this.method = (config.method || 'POST').toUpperCase();
    this.headers = config.headers || {};
    this.timeout = config.timeout || 5000;

    // Retry settings
    this.retries = config.retries ?? 3;
    this.retryDelay = config.retryDelay || 1000;
    this.retryStrategy = config.retryStrategy || 'exponential';
    this.retryOnStatus = config.retryOnStatus || [429, 500, 502, 503, 504];

    // Batch settings
    this.batch = config.batch || false;
    this.batchSize = config.batchSize || 100;

    // Authentication
    this.auth = config.auth || null;

    // Resource configuration
    if (Array.isArray(resources)) {
      this.resources = {};
      for (const resource of resources) {
        if (typeof resource === 'string') {
          this.resources[resource] = true;
        } else if (typeof resource === 'object' && resource.name) {
          this.resources[resource.name] = resource;
        }
      }
    } else if (typeof resources === 'object') {
      this.resources = resources;
    } else {
      this.resources = {};
    }

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      totalRetries: 0
    };
  }

  validateConfig() {
    const errors = [];

    if (!this.url) {
      errors.push('URL is required');
    }

    // Validate URL format
    try {
      new URL(this.url);
    } catch (err) {
      errors.push(`Invalid URL format: ${this.url}`);
    }

    // Validate auth configuration
    if (this.auth) {
      if (!this.auth.type) {
        errors.push('auth.type is required when auth is configured');
      } else if (!['bearer', 'basic', 'apikey'].includes(this.auth.type)) {
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

  /**
   * Build headers with authentication
   * @returns {Object} Headers object
   */
  _buildHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 's3db-webhook-replicator',
      ...this.headers
    };

    if (this.auth) {
      switch (this.auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${this.auth.token}`;
          break;

        case 'basic':
          const credentials = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
          break;

        case 'apikey':
          headers[this.auth.header] = this.auth.value;
          break;
      }
    }

    return headers;
  }

  /**
   * Apply resource transformer if configured
   * @param {string} resource - Resource name
   * @param {Object} data - Data to transform
   * @returns {Object} Transformed data
   */
  _applyTransformer(resource, data) {
    // Clean internal fields
    let cleanData = this._cleanInternalFields(data);

    const entry = this.resources[resource];
    let result = cleanData;

    if (!entry) return cleanData;

    // Apply transform function if configured
    if (typeof entry.transform === 'function') {
      result = entry.transform(cleanData);
    }

    return result || cleanData;
  }

  /**
   * Remove internal fields from data
   * @param {Object} data - Data object
   * @returns {Object} Cleaned data
   */
  _cleanInternalFields(data) {
    if (!data || typeof data !== 'object') return data;

    const cleanData = { ...data };

    // Remove fields starting with $ or _
    Object.keys(cleanData).forEach(key => {
      if (key.startsWith('$') || key.startsWith('_')) {
        delete cleanData[key];
      }
    });

    return cleanData;
  }

  /**
   * Create standardized webhook payload
   * @param {string} resource - Resource name
   * @param {string} operation - Operation type
   * @param {Object} data - Record data
   * @param {string} id - Record ID
   * @param {Object} beforeData - Before data (for updates)
   * @returns {Object} Webhook payload
   */
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

  /**
   * Make HTTP request with retries
   * @param {Object} payload - Request payload
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Object>} Response
   */
  async _makeRequest(payload, attempt = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: this.method,
        headers: this._buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      this.stats.totalRequests++;

      // Check if response is OK
      if (response.ok) {
        this.stats.successfulRequests++;
        return {
          success: true,
          status: response.status,
          statusText: response.statusText
        };
      }

      // Check if we should retry this status code
      if (this.retryOnStatus.includes(response.status) && attempt < this.retries) {
        this.stats.retriedRequests++;
        this.stats.totalRetries++;

        // Calculate retry delay
        const delay = this.retryStrategy === 'exponential'
          ? this.retryDelay * Math.pow(2, attempt)
          : this.retryDelay;

        if (this.config.verbose) {
          console.log(`[WebhookReplicator] Retrying request (attempt ${attempt + 1}/${this.retries}) after ${delay}ms - Status: ${response.status}`);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        return this._makeRequest(payload, attempt + 1);
      }

      // Failed without retry
      this.stats.failedRequests++;
      const errorText = await response.text().catch(() => '');

      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        error: errorText || `HTTP ${response.status}: ${response.statusText}`
      };

    } catch (error) {
      clearTimeout(timeoutId);

      // Retry on network errors
      if (attempt < this.retries) {
        this.stats.retriedRequests++;
        this.stats.totalRetries++;

        const delay = this.retryStrategy === 'exponential'
          ? this.retryDelay * Math.pow(2, attempt)
          : this.retryDelay;

        if (this.config.verbose) {
          console.log(`[WebhookReplicator] Retrying request (attempt ${attempt + 1}/${this.retries}) after ${delay}ms - Error: ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        return this._makeRequest(payload, attempt + 1);
      }

      this.stats.failedRequests++;
      this.stats.totalRequests++;

      return {
        success: false,
        error: error.message
      };
    }
  }

  async initialize(database) {
    await super.initialize(database);

    // Validate configuration
    const validation = this.validateConfig();
    if (!validation.isValid) {
      const error = new Error(`WebhookReplicator configuration is invalid: ${validation.errors.join(', ')}`);

      if (this.config.verbose) {
        console.error(`[WebhookReplicator] ${error.message}`);
      }

      this.emit('initialization_error', {
        replicator: this.name,
        error: error.message,
        errors: validation.errors
      });

      throw error;
    }

    this.emit('initialized', {
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
      // Apply transformation
      const transformedData = this._applyTransformer(resource, data);

      // Create payload
      const payload = this.createPayload(resource, operation, transformedData, id, beforeData);

      // Make request
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

      throw new Error(response.error || `HTTP ${response.status}: ${response.statusText}`);
    });

    if (ok) return result;

    if (this.config.verbose) {
      console.warn(`[WebhookReplicator] Replication failed for ${resource}: ${err.message}`);
    }

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
      // If batch mode is enabled, send all records in one request
      if (this.batch) {
        const payloads = records.map(record =>
          this.createPayload(
            resource,
            record.operation,
            this._applyTransformer(resource, record.data),
            record.id,
            record.beforeData
          )
        );

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

        throw new Error(response.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Otherwise, send individual requests (parallel)
      const results = await Promise.allSettled(
        records.map(record =>
          this.replicate(resource, record.operation, record.data, record.id, record.beforeData)
        )
      );

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

    if (ok) return result;

    if (this.config.verbose) {
      console.warn(`[WebhookReplicator] Batch replication failed for ${resource}: ${err.message}`);
    }

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
        throw new Error(response.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    });

    if (ok) return true;

    if (this.config.verbose) {
      console.warn(`[WebhookReplicator] Connection test failed: ${err.message}`);
    }

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
    // If no resources configured, replicate all
    if (!this.resources || Object.keys(this.resources).length === 0) {
      return true;
    }

    // Check if resource is in the list
    return Object.keys(this.resources).includes(resource);
  }
}

export default WebhookReplicator;
