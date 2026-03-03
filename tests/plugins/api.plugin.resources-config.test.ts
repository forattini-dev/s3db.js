/**
 * API Plugin - Resource Configuration Tests
 *
 * Ensures plugin-owned resources can be exposed via config and that
 * per-resource overrides behave as expected.
 */

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

    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
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
      logLevel: 'silent',
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
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

  it('supports cursor and page-number pagination on list endpoint', async () => {
    for (let i = 2; i <= 8; i++) {
      await db.resources.plg_internal_records.insert({
        id: `rec-${i}`,
        name: `Visible Record ${i}`
      });
    }

    apiPlugin = new ApiPlugin({
      logLevel: 'silent',
      port,
      host: '127.0.0.1',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['plg_internal_records']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const firstCursorPage = await fetch(`http://127.0.0.1:${port}/plg_internal_records?limit=3&cursor=`);
    expect(firstCursorPage.status).toBe(200);
    expect(firstCursorPage.headers.get('x-pagination-mode')).toBe('cursor');

    const firstBody = await firstCursorPage.json();
    expect(firstBody.success).toBe(true);
    expect(firstBody.data.length).toBe(3);
    expect(firstBody.pagination.total).toBeNull();
    expect(firstBody.pagination.page).toBeNull();
    expect(firstBody.pagination.pageCount).toBeNull();
    expect(firstBody.pagination.hasMore).toBe(true);
    expect(typeof firstBody.pagination.nextCursor).toBe('string');
    expect(firstCursorPage.headers.get('x-next-cursor')).toBe(firstBody.pagination.nextCursor);

    const secondCursorPage = await fetch(
      `http://127.0.0.1:${port}/plg_internal_records?limit=3&cursor=${encodeURIComponent(firstBody.pagination.nextCursor)}`
    );
    expect(secondCursorPage.status).toBe(200);
    expect(secondCursorPage.headers.get('x-pagination-mode')).toBe('cursor');

    const secondBody = await secondCursorPage.json();
    expect(secondBody.success).toBe(true);
    expect(secondBody.data.length).toBeGreaterThan(0);
    expect(secondBody.pagination.total).toBeNull();
    expect(secondBody.pagination.page).toBeNull();
    expect(secondBody.pagination.pageCount).toBeNull();
    expect(typeof secondBody.pagination.hasMore).toBe('boolean');

    const firstIds = new Set(firstBody.data.map((item: { id: string }) => item.id));
    const secondIds = secondBody.data.map((item: { id: string }) => item.id);
    expect(secondIds.some((id: string) => !firstIds.has(id))).toBe(true);

    const pageModeResponse = await fetch(`http://127.0.0.1:${port}/plg_internal_records?limit=3&page=2`);
    expect(pageModeResponse.status).toBe(200);
    expect(pageModeResponse.headers.get('x-pagination-mode')).toBe('cursor');

    const pageModeBody = await pageModeResponse.json();
    expect(pageModeBody.success).toBe(true);
    expect(pageModeBody.pagination.page).toBe(2);
    expect(pageModeBody.pagination.pageCount).toBeNull();
    expect(typeof pageModeBody.pagination.hasMore).toBe('boolean');

    const invalidMixedMode = await fetch(`http://127.0.0.1:${port}/plg_internal_records?limit=3&page=2&cursor=`);
    expect(invalidMixedMode.status).toBe(400);
    const invalidMixedModeBody = await invalidMixedMode.json();
    expect(invalidMixedModeBody.success).toBe(false);
    expect(invalidMixedModeBody.error.code).toBe('INVALID_PAGINATION');

    const offsetResponse = await fetch(`http://127.0.0.1:${port}/plg_internal_records?limit=2&offset=2`);
    expect(offsetResponse.status).toBe(400);

    const offsetBody = await offsetResponse.json();
    expect(offsetBody.success).toBe(false);
    expect(offsetBody.error.code).toBe('INVALID_PAGINATION');
  });

  it('skips plugin resources when explicitly disabled in config', async () => {
    apiPlugin = new ApiPlugin({
      logLevel: 'silent',
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
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
    const resourceMiddleware = vi.fn(async (c, next) => {
      c.header('X-Resource-Middleware', 'hit');
      await next();
    });

    apiPlugin = new ApiPlugin({
      logLevel: 'silent',
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
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
