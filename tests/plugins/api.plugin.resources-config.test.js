/**
 * API Plugin - Resource Configuration Tests
 *
 * Ensures plugin-owned resources can be exposed via config and that
 * per-resource overrides behave as expected.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest
} from '@jest/globals';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../config.js';

async function waitForServer(port, maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch (err) {
      // swallow connection errors until server is ready
      if (attempt % 10 === 0) {
        console.log(`[waitForServer] Attempt ${attempt}/${maxAttempts} for port ${port} - ${err.code || err.message}`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server on port ${port} did not become ready in time after ${maxAttempts * 100}ms`);
}

describe('API Plugin - resource configuration', () => {
  let db;
  let apiPlugin;
  let port;

  beforeEach(async () => {
    port = 3300 + Math.floor(Math.random() * 1000);
    const testName = `api-plugin-resources-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { verbose: false });
    await db.connect();

    await db.createResource({
      name: 'plg_internal_records',
      attributes: {
        id: 'string|optional',
        name: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: true
    });

    await db.resources.plg_internal_records.insert({
      id: 'rec-1',
      name: 'Visible Record'
    });
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

  it('exposes plugin resources when configured via array syntax', async () => {
    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      verbose: false,
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['plg_internal_records']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const response = await fetch(`http://127.0.0.1:${port}/plg_internal_records`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({ id: 'rec-1', name: 'Visible Record' });
  });

  it('skips plugin resources when explicitly disabled in config', async () => {
    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      verbose: false,
      docs: { enabled: false },
      logging: { enabled: false },
      resources: {
        plg_internal_records: { enabled: false }
      }
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const response = await fetch(`http://127.0.0.1:${port}/plg_internal_records`);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toEqual(
      expect.objectContaining({
        message: 'Route not found',
        code: 'NOT_FOUND'
      })
    );
  });

  it('applies per-resource overrides (methods, middleware, version prefix)', async () => {
    const resourceMiddleware = jest.fn(async (c, next) => {
      c.header('X-Resource-Middleware', 'hit');
      await next();
    });

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      verbose: false,
      docs: { enabled: false },
      logging: { enabled: false },
      versionPrefix: false,
      resources: {
        plg_internal_records: {
          methods: ['GET'],
          versionPrefix: 'api/v99',
          customMiddleware: resourceMiddleware
        }
      }
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const baseUrl = `http://127.0.0.1:${port}/api/v99/plg_internal_records`;

    const getResponse = await fetch(baseUrl);
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('x-resource-middleware')).toBe('hit');

    const getBody = await getResponse.json();
    expect(getBody.success).toBe(true);
    expect(getBody.data[0].id).toBe('rec-1');
    expect(resourceMiddleware).toHaveBeenCalledTimes(1);

    resourceMiddleware.mockClear();

    const postResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'rec-2', name: 'New Record' })
    });

    expect(postResponse.status).toBe(404);
  });
});
