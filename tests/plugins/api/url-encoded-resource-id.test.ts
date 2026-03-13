import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createRelationalRoutes } from '../../../src/plugins/api/routes/resource-routes.js';
import { HttpApp } from '../../../src/plugins/shared/http-runtime.js';
import { createMemoryDatabaseForTest } from '../../config.js';

async function waitForServer(port: number, maxAttempts = 100): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch {
      // wait for boot
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`API server on port ${port} did not become ready in time`);
}

describe('API Plugin URL-encoded resource ids', () => {
  let db: any;
  let apiPlugin: ApiPlugin | null = null;
  let port: number;

  beforeEach(async () => {
    port = 5400 + Math.floor(Math.random() * 1000);
    db = createMemoryDatabaseForTest(`api-plugin-url-id-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
      logLevel: 'silent'
    });
    await db.connect();
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

  it('handles URL-encoded email ids across canonical item routes', async () => {
    const resource = await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        email: 'string|required|email',
        name: 'string|optional'
      },
      timestamps: true
    });

    const userId = 'filipe@forattini.com.br';
    await resource.insert({
      id: userId,
      email: userId,
      name: 'Filipe'
    });

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['users']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const encodedId = encodeURIComponent(userId);

    const getResponse = await fetch(`http://127.0.0.1:${port}/users/${encodedId}`);
    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.json();
    expect(getBody.data.id).toBe(userId);
    expect(getBody.data.email).toBe(userId);

    const putResponse = await fetch(`http://127.0.0.1:${port}/users/${encodedId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Filipe' })
    });
    expect(putResponse.status).toBe(200);
    const putBody = await putResponse.json();
    expect(putBody.data.id).toBe(userId);
    expect(putBody.data.name).toBe('Updated Filipe');

    const patchResponse = await fetch(`http://127.0.0.1:${port}/users/${encodedId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Patched Filipe' })
    });
    expect(patchResponse.status).toBe(200);
    const patchBody = await patchResponse.json();
    expect(patchBody.data.id).toBe(userId);
    expect(patchBody.data.name).toBe('Patched Filipe');

    const headResponse = await fetch(`http://127.0.0.1:${port}/users/${encodedId}`, {
      method: 'HEAD'
    });
    expect(headResponse.status).toBe(200);

    const deleteResponse = await fetch(`http://127.0.0.1:${port}/users/${encodedId}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBe(204);

    const getAfterDeleteResponse = await fetch(`http://127.0.0.1:${port}/users/${encodedId}`);
    expect(getAfterDeleteResponse.status).toBe(404);
  });

  it('keeps encoded ids only at the URL edge and uses decoded ids through handler, resource, client and response', async () => {
    const resource = await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        email: 'string|required|email',
        name: 'string|optional'
      },
      timestamps: true
    });

    const userId = 'filipe@forattini.com.br';
    await resource.insert({
      id: userId,
      email: userId,
      name: 'Filipe'
    });

    const getSpy = vi.spyOn(resource, 'get');
    const clientGetSpy = vi.spyOn(db.client, 'getObject');

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: false },
      logging: { enabled: false },
      resources: ['users'],
      routes: {
        'GET /trace/:id': async (c, ctx) => {
          const handlerId = c.req.param('id');
          const routeContextId = ctx.request.param('id');
          const inputId = ctx.input.params.id;
          const record = await ctx.services.resources.users.get(handlerId!);

          return c.json({
            rawUrl: c.req.url,
            rawPath: c.req.path,
            handlerId,
            routeContextId,
            inputId,
            recordId: record?.id ?? null
          });
        }
      }
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const encodedId = encodeURIComponent(userId);
    const response = await fetch(`http://127.0.0.1:${port}/trace/${encodedId}`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      rawUrl: expect.stringContaining(`/trace/${encodedId}`),
      rawPath: `/trace/${encodedId}`,
      handlerId: userId,
      routeContextId: userId,
      inputId: userId,
      recordId: userId
    });

    expect(getSpy).toHaveBeenCalledWith(userId);
    expect(clientGetSpy).toHaveBeenCalled();

    const keysRead = clientGetSpy.mock.calls.map(([key]) => String(key));
    expect(keysRead.some((key) => key.includes(`id=${userId}`))).toBe(true);
    expect(keysRead.some((key) => key.includes(encodedId))).toBe(false);
  });

  it('decodes URL-encoded parent ids for mounted relational routes', async () => {
    const parentId = 'filipe@forattini.com.br';
    const sourceResource = {
      name: 'users',
      get: vi.fn()
        .mockResolvedValueOnce({ id: parentId })
        .mockResolvedValueOnce({
          id: parentId,
          posts: [{ id: 'post-1', title: 'Hello' }]
        })
    };

    const relationApp = createRelationalRoutes(
      sourceResource as any,
      'posts',
      { type: 'hasMany', resource: 'posts' },
      'v1',
      HttpApp
    );

    const rootApp = new HttpApp();
    rootApp.route('/users/:id/posts', relationApp as any);

    const response = await rootApp.fetch(
      new Request(`http://localhost/users/${encodeURIComponent(parentId)}/posts`)
    );

    expect(response.status).toBe(200);
    expect(sourceResource.get).toHaveBeenNthCalledWith(1, parentId);
    expect(sourceResource.get).toHaveBeenNthCalledWith(2, parentId, {
      include: ['posts']
    });

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 'post-1', title: 'Hello' }]);
  });
});
