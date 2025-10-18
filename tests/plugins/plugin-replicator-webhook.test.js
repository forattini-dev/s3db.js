import { describe, test, expect } from '@jest/globals';
import WebhookReplicator from '../../src/plugins/replicators/webhook-replicator.class.js';

describe('WebhookReplicator - Configuration and Validation Tests', () => {
  test('should create webhook replicator with basic config', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    }, ['users']);

    expect(replicator.url).toBe('https://api.example.com/webhook');
    expect(replicator.method).toBe('POST');
    expect(replicator.timeout).toBe(5000);
    expect(replicator.retries).toBe(3);
  });

  test('should validate configuration correctly', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      auth: {
        type: 'bearer',
        token: 'test-token'
      }
    });

    const validation = replicator.validateConfig();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should throw error without URL', () => {
    expect(() => {
      new WebhookReplicator({
        // Missing URL
      });
    }).toThrow('WebhookReplicator requires a "url" configuration');
  });

  test('should fail validation with invalid URL format', () => {
    const replicator = new WebhookReplicator({
      url: 'not-a-valid-url'
    });

    const validation = replicator.validateConfig();
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('Invalid URL format'))).toBe(true);
  });

  test('should fail validation for bearer auth without token', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      auth: {
        type: 'bearer'
        // Missing token
      }
    });

    const validation = replicator.validateConfig();
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('auth.token is required for bearer authentication');
  });

  test('should fail validation for basic auth without credentials', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      auth: {
        type: 'basic',
        username: 'user'
        // Missing password
      }
    });

    const validation = replicator.validateConfig();
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('auth.username and auth.password are required for basic authentication');
  });

  test('should fail validation for apikey auth without header or value', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      auth: {
        type: 'apikey',
        header: 'X-API-Key'
        // Missing value
      }
    });

    const validation = replicator.validateConfig();
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('auth.header and auth.value are required for API key authentication');
  });

  test('should build headers with bearer authentication', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      auth: {
        type: 'bearer',
        token: 'secret-token'
      }
    });

    const headers = replicator._buildHeaders();
    expect(headers['Authorization']).toBe('Bearer secret-token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toBe('s3db-webhook-replicator');
  });

  test('should build headers with basic authentication', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      auth: {
        type: 'basic',
        username: 'user',
        password: 'pass'
      }
    });

    const headers = replicator._buildHeaders();
    const expectedAuth = 'Basic ' + Buffer.from('user:pass').toString('base64');
    expect(headers['Authorization']).toBe(expectedAuth);
  });

  test('should build headers with API key authentication', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      auth: {
        type: 'apikey',
        header: 'X-API-Key',
        value: 'my-api-key'
      }
    });

    const headers = replicator._buildHeaders();
    expect(headers['X-API-Key']).toBe('my-api-key');
  });

  test('should include custom headers', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      headers: {
        'X-Custom-Header': 'custom-value',
        'X-Environment': 'test'
      }
    });

    const headers = replicator._buildHeaders();
    expect(headers['X-Custom-Header']).toBe('custom-value');
    expect(headers['X-Environment']).toBe('test');
  });

  test('should create correct payload structure', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    });

    const payload = replicator.createPayload(
      'users',
      'insert',
      { id: 'user-1', name: 'John Doe' },
      'user-1'
    );

    expect(payload.resource).toBe('users');
    expect(payload.action).toBe('insert');
    expect(payload.source).toBe('s3db-webhook-replicator');
    expect(payload.data).toEqual({ id: 'user-1', name: 'John Doe' });
    expect(payload.timestamp).toBeDefined();
  });

  test('should create update payload with before data', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    });

    const payload = replicator.createPayload(
      'users',
      'update',
      { id: 'user-1', name: 'John Doe Updated' },
      'user-1',
      { id: 'user-1', name: 'John Doe' }
    );

    expect(payload.action).toBe('update');
    expect(payload.before).toEqual({ id: 'user-1', name: 'John Doe' });
    expect(payload.data).toEqual({ id: 'user-1', name: 'John Doe Updated' });
  });

  test('should clean internal fields from data', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    });

    const data = {
      id: 'user-1',
      name: 'John',
      $metadata: 'should be removed',
      _internal: 'should be removed',
      email: 'john@example.com'
    };

    const cleaned = replicator._cleanInternalFields(data);
    expect(cleaned.id).toBe('user-1');
    expect(cleaned.name).toBe('John');
    expect(cleaned.email).toBe('john@example.com');
    expect(cleaned.$metadata).toBeUndefined();
    expect(cleaned._internal).toBeUndefined();
  });

  test('should apply resource transformer', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    }, {
      users: {
        transform: (data) => ({
          ...data,
          transformed: true,
          fullName: `${data.firstName} ${data.lastName}`
        })
      }
    });

    const data = { id: 'user-1', firstName: 'John', lastName: 'Doe' };
    const transformed = replicator._applyTransformer('users', data);

    expect(transformed.transformed).toBe(true);
    expect(transformed.fullName).toBe('John Doe');
  });

  test('should handle resource filtering correctly', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    }, ['users', 'orders']);

    expect(replicator.shouldReplicateResource('users')).toBe(true);
    expect(replicator.shouldReplicateResource('orders')).toBe(true);
    expect(replicator.shouldReplicateResource('products')).toBe(false);
  });

  test('should replicate all resources when none specified', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    });

    expect(replicator.shouldReplicateResource('users')).toBe(true);
    expect(replicator.shouldReplicateResource('orders')).toBe(true);
    expect(replicator.shouldReplicateResource('anything')).toBe(true);
  });

  test('should return correct status', async () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      method: 'POST',
      auth: {
        type: 'bearer',
        token: 'test-token'
      },
      timeout: 10000,
      retries: 5,
      batch: true
    }, ['users', 'orders']);

    const status = await replicator.getStatus();

    expect(status.url).toBe('https://api.example.com/webhook');
    expect(status.method).toBe('POST');
    expect(status.authType).toBe('bearer');
    expect(status.timeout).toBe(10000);
    expect(status.retries).toBe(5);
    expect(status.retryStrategy).toBe('exponential');
    expect(status.batchMode).toBe(true);
    expect(status.resources).toEqual(['users', 'orders']);
    expect(status.stats).toBeDefined();
  });

  test('should configure retry strategy correctly', () => {
    const exponentialReplicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      retryStrategy: 'exponential',
      retryDelay: 1000
    });

    const fixedReplicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      retryStrategy: 'fixed',
      retryDelay: 500
    });

    expect(exponentialReplicator.retryStrategy).toBe('exponential');
    expect(exponentialReplicator.retryDelay).toBe(1000);
    expect(fixedReplicator.retryStrategy).toBe('fixed');
    expect(fixedReplicator.retryDelay).toBe(500);
  });

  test('should configure custom retry status codes', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      retryOnStatus: [408, 429, 500, 502, 503, 504]
    });

    expect(replicator.retryOnStatus).toEqual([408, 429, 500, 502, 503, 504]);
  });

  test('should use default retry status codes', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    });

    expect(replicator.retryOnStatus).toEqual([429, 500, 502, 503, 504]);
  });

  test('should configure batch settings', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook',
      batch: true,
      batchSize: 50
    });

    expect(replicator.batch).toBe(true);
    expect(replicator.batchSize).toBe(50);
  });

  test('should initialize stats correctly', () => {
    const replicator = new WebhookReplicator({
      url: 'https://api.example.com/webhook'
    });

    expect(replicator.stats).toEqual({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      totalRetries: 0
    });
  });
});
