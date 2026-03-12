import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDatabaseForTest } from '../../config.js';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createPathRulesAuthMiddleware } from '../../../src/plugins/api/auth/path-rules-middleware.js';
import { startApiPlugin } from './helpers/server.js';

type CtxStore = Map<string, unknown>;

interface MockContext {
  req: {
    path: string;
    header: (name: string) => string | undefined;
  };
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  cGet: () => CtxStore;
  json: (payload: Record<string, unknown>, status?: number) => { status: number; payload: Record<string, unknown> };
  redirect: (url: string, status?: number) => { status: number; location: string };
}

function createMockContext(path: string, accept = 'application/json'): MockContext {
  const store: CtxStore = new Map<string, unknown>();

  return {
    req: {
      path,
      header: (name: string): string | undefined => {
        if (name.toLowerCase() === 'accept') {
          return accept;
        }
        return undefined;
      }
    },
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => {
      store.set(key, value);
    },
    cGet: () => store,
    json: (payload, status = 200) => ({
      status,
      payload
    }),
    redirect: (url, status = 302) => ({
      status,
      location: url
    })
  };
}

function createAuthMiddlewareWithUser(user: Record<string, unknown>) {
  return async (c: MockContext, next: () => Promise<void>): Promise<void> => {
    c.set('user', user);
    await next();
  };
}

describe('createPathRulesAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows when user has required role', async () => {
    const ctx = createMockContext('/admin/dashboard');
    const next = vi.fn();

    const middleware = createPathRulesAuthMiddleware({
      rules: [{
        path: '/admin/**',
        required: true,
        methods: ['jwt'],
        roles: ['admin']
      }],
      authMiddlewares: {
        jwt: createAuthMiddlewareWithUser({ id: 'u1', roles: ['admin'] }) as any
      }
    });

    const response = await middleware(ctx as any, next);

    expect(response).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('denies when user lacks required role', async () => {
    const ctx = createMockContext('/admin/dashboard');
    const next = vi.fn();

    const middleware = createPathRulesAuthMiddleware({
      rules: [{
        path: '/admin/**',
        required: true,
        methods: ['jwt'],
        roles: ['admin']
      }],
      authMiddlewares: {
        jwt: createAuthMiddlewareWithUser({ id: 'u2', roles: ['reader'] }) as any
      },
      authorizeRequest: async (c: MockContext, rule) => {
        const user = c.get('user') as { roles?: string[]; scopes?: string[]; token_use?: string } | undefined;
        const roles = (user?.roles || []) as string[];
        const roleMatch = !rule.roles || rule.roles.some((role) => roles.includes(role));
        return roleMatch;
      }
    });

    const response = await middleware(ctx as any, next);

    expect(response).toEqual({
      status: 401,
      payload: {
        error: 'Unauthorized',
        message: 'Authentication required. Allowed methods: jwt'
      }
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows when user has required wildcard scope', async () => {
    const ctx = createMockContext('/reports/overview');
    const next = vi.fn();

    const middleware = createPathRulesAuthMiddleware({
      rules: [{
        path: '/reports/**',
        required: true,
        methods: ['jwt'],
        scopes: ['reports:*']
      }],
      authMiddlewares: {
        jwt: createAuthMiddlewareWithUser({ id: 'u3', scopes: ['reports:read'] }) as any
      }
    });

    const response = await middleware(ctx as any, next);

    expect(response).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('denies service account when allowServiceAccounts is false', async () => {
    const ctx = createMockContext('/admin/dashboard');
    const next = vi.fn();

    const middleware = createPathRulesAuthMiddleware({
      rules: [{
        path: '/admin/**',
        required: true,
        methods: ['jwt'],
        allowServiceAccounts: false
      }],
      authMiddlewares: {
        jwt: createAuthMiddlewareWithUser({ id: 'svc', token_use: 'service' }) as any
      },
      authorizeRequest: async (c: MockContext, rule) => {
        if (rule.allowServiceAccounts === false && c.get('user') && (c.get('user') as { token_use?: string }).token_use === 'service') {
          return false;
        }
        return true;
      }
    });

    const response = await middleware(ctx as any, next);

    expect(response).toEqual({
      status: 401,
      payload: {
        error: 'Unauthorized',
        message: 'Authentication required. Allowed methods: jwt'
      }
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('ApiPlugin auth.pathRules', () => {
  it('fails fast with migration guidance when auth.pathAuth is configured', () => {
    expect(() => new ApiPlugin({
      docs: { enabled: false },
      logging: { enabled: false },
      auth: {
        pathAuth: [{ pattern: '/secure/**', drivers: ['jwt'] }]
      } as any
    })).toThrow('auth.pathAuth has been removed. Use auth.pathRules instead.');
  });

  it('applies auth.pathRules to mounted resource routes', async () => {
    const db = createDatabaseForTest(`api-path-rules-${Date.now()}`, { logLevel: 'error' });
    await db.connect();
    await db.createResource({
      name: 'notes',
      attributes: {
        title: 'string|required'
      }
    });

    let plugin;

    try {
      const started = await startApiPlugin(db, {
        auth: {
          drivers: [
            {
              driver: 'header-secret',
              config: {
                secret: 'top-secret',
                subject: 'svc:internal',
                roles: ['admin']
              }
            }
          ],
          pathRules: [
            {
              path: '/notes/**',
              methods: ['header-secret'],
              required: true
            }
          ]
        }
      }, 'api-path-rules');

      plugin = started.plugin;
      const { port } = started;

      const unauthorized = await fetch(`http://127.0.0.1:${port}/notes`);
      expect(unauthorized.status).toBe(401);

      const authorized = await fetch(`http://127.0.0.1:${port}/notes`, {
        headers: {
          'x-admin-secret': 'top-secret'
        }
      });
      expect(authorized.status).toBe(200);
      await expect(authorized.json()).resolves.toMatchObject({ success: true });

      const publicResponse = await fetch(`http://127.0.0.1:${port}/health`);
      expect(publicResponse.status).toBe(200);
      await expect(publicResponse.json()).resolves.toMatchObject({
        success: true,
        data: { status: 'ok' }
      });
    } finally {
      await plugin?.stop();
      await db.disconnect();
    }
  });
});
