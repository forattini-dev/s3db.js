import { describe, expect, test, vi } from 'vitest';
import { RouteContext } from '../../../src/plugins/api/concerns/route-context.js';

function createMockContext() {
  const store = new Map<string, unknown>([
    ['user', {
      sub: 'sa:admin-ui',
      role: 'admin',
      roles: ['admin'],
      scopes: ['admin:read', 'admin:*'],
      token_use: 'service'
    }],
    ['requestId', 'req-123'],
    ['authMethod', 'header-secret'],
    ['serviceAccount', { clientId: 'admin-ui', name: 'Admin UI' }],
    ['session', { id: 'sess-1' }],
    ['sessionId', 'sess-1']
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
      url: 'http://localhost/users',
      param(name?: string) {
        const params = { id: 'user-1' };
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
    jsonResponseSpy
  };
}

describe('RouteContext', () => {
  test('exposes request/response/auth helpers with cached body parsing', async () => {
    const { context, jsonSpy, jsonResponseSpy } = createMockContext();
    const routeContext = new RouteContext(
      context as any,
      { resources: { users: { name: 'users' } } } as any,
      null,
      {}
    );

    const bodyA = await routeContext.body();
    const bodyB = await routeContext.request.body();

    expect(bodyA).toEqual({ email: 'user@example.com' });
    expect(bodyB).toEqual({ email: 'user@example.com' });
    expect(jsonSpy).toHaveBeenCalledTimes(1);

    expect(routeContext.request.method).toBe('POST');
    expect(routeContext.request.path).toBe('/users');
    expect(routeContext.request.id).toBe('req-123');
    expect(routeContext.request.query('view')).toBe('admin');
    expect(routeContext.request.header('x-admin-secret')).toBe('top-secret');
    expect(routeContext.request.headers()).toMatchObject({
      'content-type': 'application/json',
      'x-admin-secret': 'top-secret'
    });

    expect(routeContext.auth.user?.sub).toBe('sa:admin-ui');
    expect(routeContext.auth.method).toBe('header-secret');
    expect(routeContext.auth.isAuthenticated).toBe(true);
    expect(routeContext.auth.isServiceAccount).toBe(true);
    expect(routeContext.auth.hasRole('admin')).toBe(true);
    expect(routeContext.auth.hasScope('admin:write')).toBe(true);

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
