/**
 * API Plugin - Error Helper Middleware Tests
 *
 * Verifies that c.error() method:
 * - Returns standardized error responses
 * - Auto-detects HTTP status codes from errors
 * - Includes stack traces in development
 * - Supports custom status codes and details
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from '@jest/globals';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

async function makeRequest(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const data = await response.json();
  return { status: response.status, data };
}

async function waitForServer(port, maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch (err) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server on port ${port} not ready after ${maxAttempts * 100}ms`);
}

describe('API Plugin - Error Helper Middleware', () => {
  let db;
  let apiPlugin;
  let port;
  let app;

  beforeEach(async () => {
    port = 3800 + Math.floor(Math.random() * 1000);
    const testName = `error-helper-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { verbose: false });
    await db.connect();

    // Create API plugin with minimal config
    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      verbose: false,
      docs: { enabled: false },
      logging: { enabled: false },
      resources: []
    });

    await db.usePlugin(apiPlugin);

    // Get Hono app instance to add test routes
    app = apiPlugin.app;

    // Test routes using c.error()
    app.get('/test/error-string', (c) => {
      return c.error('Something went wrong', 400);
    });

    app.get('/test/error-object', (c) => {
      const err = new Error('Database connection failed');
      return c.error(err, 500);
    });

    app.get('/test/error-auto-status', (c) => {
      const err = new Error('User not found');
      err.name = 'NotFoundError';
      return c.error(err);
    });

    app.get('/test/error-with-details', (c) => {
      const err = new Error('Validation failed');
      return c.error(err, 400, { field: 'email', rule: 'required' });
    });

    app.get('/test/error-validation', (c) => {
      const err = new Error('Invalid email format');
      err.name = 'ValidationError';
      return c.error(err);
    });

    await waitForServer(port);
  });

  afterEach(async () => {
    if (apiPlugin) {
      await apiPlugin.stop();
      apiPlugin = null;
    }

    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  it('should handle string errors with custom status code', async () => {
    const { status, data } = await makeRequest(port, '/test/error-string');

    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.message).toBe('Something went wrong');
    expect(data.error.status).toBe(400);
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('should handle Error objects with custom status code', async () => {
    const { status, data } = await makeRequest(port, '/test/error-object');

    expect(status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.message).toBe('Database connection failed');
    expect(data.error.status).toBe(500);
    expect(data.error.code).toBe('Error');
  });

  it('should auto-detect status code from error name', async () => {
    const { status, data } = await makeRequest(port, '/test/error-auto-status');

    expect(status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.message).toBe('User not found');
    expect(data.error.status).toBe(404);
    expect(data.error.code).toBe('NotFoundError');
  });

  it('should include custom details in error response', async () => {
    const { status, data } = await makeRequest(port, '/test/error-with-details');

    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.message).toBe('Validation failed');
    expect(data.error.details).toEqual({ field: 'email', rule: 'required' });
  });

  it('should auto-detect status 400 for ValidationError', async () => {
    const { status, data } = await makeRequest(port, '/test/error-validation');

    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.message).toBe('Invalid email format');
    expect(data.error.code).toBe('ValidationError');
  });

  it('should include stack trace in development mode', async () => {
    // Set NODE_ENV to development (test env defaults to test, which shows stacks)
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const { data } = await makeRequest(port, '/test/error-object');

      // Stack should be present in dev
      expect(data.error.stack).toBeDefined();
      expect(Array.isArray(data.error.stack)).toBe(true);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
