import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createPathBasedAuthMiddleware } from '../../../src/plugins/api/auth/path-auth-matcher.js';

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
    redirect: (url: string, status = 302) => ({
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

describe('createPathBasedAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('allows when user has required role', async () => {
    const ctx = createMockContext('/admin/dashboard');
    const next = vi.fn();

    const middleware = createPathBasedAuthMiddleware({
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

  test('denies when user lacks required role', async () => {
    const ctx = createMockContext('/admin/dashboard');
    const next = vi.fn();

    const middleware = createPathBasedAuthMiddleware({
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

  test('allows when user has required wildcard scope', async () => {
    const ctx = createMockContext('/reports/overview');
    const next = vi.fn();

    const middleware = createPathBasedAuthMiddleware({
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

  test('denies service account when allowServiceAccounts is false', async () => {
    const ctx = createMockContext('/admin/dashboard');
    const next = vi.fn();

    const middleware = createPathBasedAuthMiddleware({
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
