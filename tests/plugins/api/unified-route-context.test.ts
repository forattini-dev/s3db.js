import { describe, expect, it } from 'vitest';
import { createDatabaseForTest } from '../../config.js';
import { startApiPlugin } from './helpers/server.js';

describe('API unified route context', () => {
  it('invokes plugin-level custom routes with capability-based RouteContext and no raw context mutation', async () => {
    const db = createDatabaseForTest(`api-plugin-route-ctx-${Date.now()}`, { logLevel: 'error' });
    await db.connect();

    let plugin;

    try {
      const started = await startApiPlugin(db, {
        routes: {
          'GET /ctx/plugin/:id?': function (c, ctx) {
            c.set('user', {
              sub: 'sa:plugin-test',
              roles: ['admin'],
              scopes: ['plugin:read', 'plugin:*'],
              token_use: 'service'
            });
            c.set('serviceAccount', {
              clientId: 'plugin-test',
              name: 'Plugin Test',
              scopes: ['plugin:*']
            });

            return c.json({
              argCount: arguments.length,
              requestId: ctx.requestId,
              input: {
                params: ctx.input.params,
                query: ctx.input.query,
                metadata: {
                  accept: ctx.input.metadata.accept ?? null
                }
              },
              services: {
                hasDb: !!ctx.services.db,
                hasResources: !!ctx.services.resources,
                hasPlugins: !!ctx.services.plugins,
                resource: ctx.services.resource ?? null
              },
              auth: {
                authenticated: ctx.auth.authenticated,
                principalId: ctx.auth.principalId,
                principalType: ctx.auth.principal?.type ?? null,
                hasAdminRole: ctx.auth.hasRole('admin'),
                hasWriteScope: ctx.auth.hasScope('plugin:write')
              },
              logger: {
                hasInfo: typeof ctx.logger.info === 'function',
                hasChild: typeof ctx.logger.child === 'function'
              },
              signalAborted: ctx.signal.aborted,
              customRouteContext: c.get('customRouteContext') ?? null,
              rawDb: Object.prototype.hasOwnProperty.call(c, 'db'),
              rawDatabase: Object.prototype.hasOwnProperty.call(c, 'database'),
              rawResources: Object.prototype.hasOwnProperty.call(c, 'resources')
            });
          }
        }
      }, 'api-plugin-route-context');

      plugin = started.plugin;
      const { port } = started;

      const response = await fetch(`http://127.0.0.1:${port}/ctx/plugin/plugin-1?view=admin`, {
        headers: {
          accept: 'application/json'
        }
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        argCount: 2,
        requestId: expect.any(String),
        input: {
          params: { id: 'plugin-1' },
          query: { view: 'admin' },
          metadata: { accept: 'application/json' }
        },
        services: {
          hasDb: true,
          hasResources: true,
          hasPlugins: true,
          resource: null
        },
        auth: {
          authenticated: true,
          principalId: 'sa:plugin-test',
          principalType: 'service',
          hasAdminRole: true,
          hasWriteScope: true
        },
        logger: {
          hasInfo: true,
          hasChild: true
        },
        signalAborted: false,
        customRouteContext: null,
        rawDb: false,
        rawDatabase: false,
        rawResources: false
      });
    } finally {
      await plugin?.stop();
      await db.disconnect();
    }
  });

  it('invokes resource-level custom routes with capability-based RouteContext and current resource', async () => {
    const db = createDatabaseForTest(`api-resource-route-ctx-${Date.now()}`, { logLevel: 'error' });
    await db.connect();
    const notes = await db.createResource({
      name: 'notes',
      attributes: {
        title: 'string|required'
      }
    });
    (notes.config as Record<string, unknown>).api = {
      'POST /meta/:section?': function (c, ctx) {
        return c.json({
          argCount: arguments.length,
          requestId: ctx.requestId,
          resourceName: (ctx.services.resource as { name?: string } | null)?.name ?? null,
          input: {
            params: ctx.input.params,
            query: ctx.input.query
          },
          logger: typeof ctx.logger.info === 'function',
          signalAborted: ctx.signal.aborted
        });
      }
    };

    let plugin;

    try {
      const started = await startApiPlugin(db, {}, 'api-resource-route-context');
      plugin = started.plugin;
      const { port } = started;

      const response = await fetch(`http://127.0.0.1:${port}/notes/meta/summary?format=full`, {
        method: 'POST'
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        argCount: 2,
        requestId: expect.any(String),
        resourceName: 'notes',
        input: {
          params: { section: 'summary' },
          query: { format: 'full' }
        },
        logger: true,
        signalAborted: false
      });
    } finally {
      await plugin?.stop();
      await db.disconnect();
    }
  });

  it('rejects resource.config.routes with migration guidance to resource.api', async () => {
    const db = createDatabaseForTest(`api-resource-routes-migration-${Date.now()}`, { logLevel: 'error' });
    await db.connect();
    const notes = await db.createResource({
      name: 'notes',
      attributes: {
        title: 'string|required'
      }
    });
    (notes.config as Record<string, unknown>).routes = {
      'POST /meta/summary': function (c) {
        return c.json({ ok: true });
      }
    };

    try {
      await expect(startApiPlugin(db, {}, 'api-resource-routes-migration')).rejects.toThrow(
        'resource.config.routes has been removed for resource "notes". Move custom resource routes into resource.api using "METHOD /path" keys.'
      );
    } finally {
      await db.disconnect();
    }
  });
});
