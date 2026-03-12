import { describe, expect, test, vi } from 'vitest';
import { RouteContext } from '../../../src/plugins/api/concerns/route-context.js';

function createMockLogger() {
  const logger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => logger)
  };

  return logger;
}

function createMockContext() {
  const signalController = new AbortController();
  const logger = createMockLogger();
  const store = new Map<string, unknown>([
    ['user', {
      sub: 'sa:admin-ui',
      role: 'admin',
      roles: ['admin'],
      scopes: ['admin:read', 'admin:*'],
      token_use: 'service',
      tenantId: 'tenant-1'
    }],
    ['requestId', 'req-123'],
    ['authMethod', 'header-secret'],
    ['serviceAccount', { clientId: 'admin-ui', name: 'Admin UI', scopes: ['admin:*'] }],
    ['session', { id: 'sess-1' }],
    ['sessionId', 'sess-1'],
    ['logger', logger]
  ]);

  const jsonSpy = vi.fn(async () => ({ email: 'user@example.com' }));
  const textSpy = vi.fn(async () => 'raw-body');
  const formDataSpy = vi.fn(async () => new FormData());
  const jsonResponseSpy = vi.fn((data, status) => ({ data, status }));

  const context = {
    get(key: string) {
      return store.get(key);
    },
    set(key: string, value: unknown) {
      store.set(key, value);
    },
    req: {
      method: 'POST',
      path: '/users',
      url: 'http://localhost/users?view=admin',
      param(name?: string) {
        const params = { id: 'user%40example.com' };
        return name ? params[name as keyof typeof params] : params;
      },
      query(name?: string) {
        const query = { view: 'admin' };
        return name ? query[name as keyof typeof query] : query;
      },
      header(name: string) {
        return new Headers([
          ['content-type', 'application/json'],
          ['x-admin-secret', 'top-secret']
        ]).get(name) || undefined;
      },
      json: jsonSpy,
      text: textSpy,
      formData: formDataSpy,
      raw: {
        signal: signalController.signal,
        headers: new Headers([
          ['content-type', 'application/json'],
          ['x-admin-secret', 'top-secret']
        ])
      }
    },
    res: { status: 200 },
    json: jsonResponseSpy,
    html(content: string, status: number) {
      return { content, status, type: 'html' };
    },
    redirect(url: string, status: number) {
      return { url, status, type: 'redirect' };
    }
  };

  return {
    context,
    jsonSpy,
    textSpy,
    formDataSpy,
    jsonResponseSpy,
    logger,
    signal: signalController.signal
  };
}

describe('RouteContext', () => {
  test('exposes capability-based auth, input, services, logger and signal with cached body parsing', async () => {
    const { context, jsonSpy, jsonResponseSpy, logger, signal } = createMockContext();
    const routeContext = new RouteContext(
      context as any,
      { resources: { users: { name: 'users' } }, pluginRegistry: { audit: { enabled: true } } } as any,
      { name: 'users' } as any,
      { audit: { enabled: true } }
    );

    const bodyA = await routeContext.body();
    const bodyB = await routeContext.input.body();

    expect(bodyA).toEqual({ email: 'user@example.com' });
    expect(bodyB).toEqual({ email: 'user@example.com' });
    expect(jsonSpy).toHaveBeenCalledTimes(1);

    expect(routeContext.input.params).toEqual({ id: 'user@example.com' });
    expect(routeContext.input.query).toEqual({ view: 'admin' });
    expect(routeContext.input.metadata).toMatchObject({
      'content-type': 'application/json',
      'x-admin-secret': 'top-secret'
    });

    expect(routeContext.request.method).toBe('POST');
    expect(routeContext.request.path).toBe('/users');
    expect(routeContext.request.id).toBe('req-123');
    expect(routeContext.request.param('id')).toBe('user@example.com');
    expect(routeContext.request.query('view')).toBe('admin');
    expect(routeContext.request.header('x-admin-secret')).toBe('top-secret');
    expect(routeContext.request.headers()).toMatchObject({
      'content-type': 'application/json',
      'x-admin-secret': 'top-secret'
    });

    expect(routeContext.services.db).toBe(routeContext.db);
    expect(routeContext.services.database).toBe(routeContext.database);
    expect(routeContext.services.resources.users).toEqual({ name: 'users' });
    expect(routeContext.services.resource).toEqual({ name: 'users' });
    expect(routeContext.services.plugins).toMatchObject({ audit: { enabled: true } });
    expect(routeContext.services.pluginRegistry).toMatchObject({ audit: { enabled: true } });

    expect(routeContext.auth.user?.sub).toBe('sa:admin-ui');
    expect(routeContext.auth.method).toBe('header-secret');
    expect(routeContext.auth.authenticated).toBe(true);
    expect(routeContext.auth.isAuthenticated).toBe(true);
    expect(routeContext.auth.isServiceAccount).toBe(true);
    expect(routeContext.auth.principalId).toBe('sa:admin-ui');
    expect(routeContext.auth.principal).toMatchObject({
      type: 'service',
      id: 'sa:admin-ui',
      tenantId: 'tenant-1'
    });
    expect(routeContext.auth.roles).toEqual(['admin']);
    expect(routeContext.auth.scopes).toEqual(['admin:read', 'admin:*']);
    expect(routeContext.auth.claims).toMatchObject({
      sub: 'sa:admin-ui',
      tenantId: 'tenant-1'
    });
    expect(routeContext.auth.hasRole('admin')).toBe(true);
    expect(routeContext.auth.hasScope('admin:write')).toBe(true);
    expect(routeContext.auth.require({ roles: ['admin'], scopes: ['admin:write'] })).toMatchObject({
      id: 'sa:admin-ui'
    });

    expect(routeContext.logger.info).toBeTypeOf('function');
    expect(routeContext.logger.child).toBeTypeOf('function');
    routeContext.logger.child({ route: 'users' }).info({ ok: true }, 'request');
    expect(logger.child).toHaveBeenCalledWith({ route: 'users' });
    expect(routeContext.signal).toBe(signal);
    expect(routeContext.signal.aborted).toBe(false);

    routeContext.auth.requireAuth();
    routeContext.auth.requireRole('admin');
    routeContext.auth.requireScope('admin:write');

    routeContext.response.success({ ok: true }, 201);
    expect(jsonResponseSpy).toHaveBeenCalledWith({
      success: true,
      data: { ok: true }
    }, 201);
  });
});
