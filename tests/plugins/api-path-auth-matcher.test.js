/**
 * Tests for Path-Based Auth Matcher
 *
 * Covers:
 * - Specificity calculation algorithm
 * - Pattern matching (glob, wildcards, params)
 * - Rule finding (most specific wins)
 * - Path-based auth middleware
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  matchPath,
  findAuthRule,
  createPathBasedAuthMiddleware
} from '../../src/plugins/api/auth/path-auth-matcher.js';

describe('Path-Auth Matcher - Specificity Algorithm', () => {
  describe('matchPath()', () => {
    it('should match exact paths', () => {
      expect(matchPath('/health', '/health')).toBe(true);
      expect(matchPath('/api/v1/users', '/api/v1/users')).toBe(true);
      expect(matchPath('/health', '/status')).toBe(false);
    });

    it('should match single wildcard (*)', () => {
      expect(matchPath('/api/users', '/api/*')).toBe(true);
      expect(matchPath('/api/posts', '/api/*')).toBe(true);
      expect(matchPath('/api/users/123', '/api/*')).toBe(false); // * doesn't match /
    });

    it('should match double wildcard (**)', () => {
      expect(matchPath('/app', '/app/**')).toBe(true);
      expect(matchPath('/app/dashboard', '/app/**')).toBe(true);
      expect(matchPath('/app/users/123', '/app/**')).toBe(true);
      expect(matchPath('/api/v1/users', '/app/**')).toBe(false);
    });

    it('should match route params (:id)', () => {
      expect(matchPath('/users/123', '/users/:id')).toBe(true);
      expect(matchPath('/users/abc', '/users/:id')).toBe(true);
      expect(matchPath('/posts/456/comments/789', '/posts/:postId/comments/:commentId')).toBe(true);
      expect(matchPath('/users', '/users/:id')).toBe(false);
    });

    it('should match complex patterns', () => {
      expect(matchPath('/api/v1/users/123/posts', '/api/v1/users/:id/**')).toBe(true);
      expect(matchPath('/api/v1/posts', '/api/*/posts')).toBe(true);
      expect(matchPath('/api/v2/posts', '/api/*/posts')).toBe(true);
    });

    it('should NOT match when path differs', () => {
      expect(matchPath('/api/users', '/app/**')).toBe(false);
      expect(matchPath('/users', '/users/123')).toBe(false);
      expect(matchPath('/api/v1', '/api/v2')).toBe(false);
    });
  });

  describe('findAuthRule() - Specificity', () => {
    it('should return null when no rules provided', () => {
      const result = findAuthRule('/any/path', []);
      expect(result).toBeNull();
    });

    it('should return null when no rules match', () => {
      const rules = [
        { path: '/app/**', methods: ['oidc'], required: true }
      ];
      const result = findAuthRule('/api/users', rules);
      expect(result).toBeNull();
    });

    it('should return the only matching rule', () => {
      const rules = [
        { path: '/app/**', methods: ['oidc'], required: true }
      ];
      const result = findAuthRule('/app/dashboard', rules);
      expect(result).not.toBeNull();
      expect(result.path).toBe('/app/**');
      expect(result.methods).toEqual(['oidc']);
    });

    it('should prioritize exact match over wildcards', () => {
      const rules = [
        { path: '/**', methods: ['any'], required: false },
        { path: '/health', methods: [], required: false }
      ];
      const result = findAuthRule('/health', rules);
      expect(result.path).toBe('/health');
      expect(result.methods).toEqual([]);
    });

    it('should prioritize more specific wildcard paths', () => {
      const rules = [
        { path: '/**', methods: ['any'], required: false },
        { path: '/api/**', methods: ['basic'], required: true },
        { path: '/api/v1/**', methods: ['basic', 'oidc'], required: true }
      ];

      // Most specific: /api/v1/**
      const result1 = findAuthRule('/api/v1/users', rules);
      expect(result1.path).toBe('/api/v1/**');

      // Next specific: /api/**
      const result2 = findAuthRule('/api/v2/users', rules);
      expect(result2.path).toBe('/api/**');

      // Least specific: /**
      const result3 = findAuthRule('/app/dashboard', rules);
      expect(result3.path).toBe('/**');
    });

    it('should prioritize longer paths (more segments)', () => {
      const rules = [
        { path: '/app/**', methods: ['oidc'], required: true },
        { path: '/app/public/**', methods: [], required: false }
      ];

      // /app/public/** has more segments, should win
      const result = findAuthRule('/app/public/landing', rules);
      expect(result.path).toBe('/app/public/**');
      expect(result.required).toBe(false);
    });

    it('should handle route params with lower priority than exact', () => {
      const rules = [
        { path: '/users/:id', methods: ['basic'], required: true },
        { path: '/users/me', methods: [], required: false } // exact match
      ];

      // Exact match wins
      const result1 = findAuthRule('/users/me', rules);
      expect(result1.path).toBe('/users/me');

      // Route param matches other IDs
      const result2 = findAuthRule('/users/123', rules);
      expect(result2.path).toBe('/users/:id');
    });

    it('should include specificity score in result', () => {
      const rules = [
        { path: '/health', methods: [], required: false },
        { path: '/**', methods: ['any'], required: false }
      ];

      const result = findAuthRule('/health', rules);
      expect(result.specificity).toBeGreaterThan(0);
      expect(result.specificity).toBeGreaterThan(10000); // Exact match
    });
  });

  describe('findAuthRule() - Real-world Scenarios', () => {
    const mrtShortnerRules = [
      { path: '/app/**', methods: ['oidc'], required: true },
      { path: '/api/v1/**', methods: ['basic', 'oidc'], required: true, priorities: { basic: 1, oidc: 2 } },
      { path: '/api/v1/public/**', methods: ['basic', 'oidc'], required: false },
      { path: '/health', methods: [], required: false },
      { path: '/', methods: [], required: false },
      { path: '/r/:shortId', methods: [], required: false },
      { path: '/**', methods: ['basic', 'oidc'], required: false }
    ];

    it('should route /app to OIDC only', () => {
      const result = findAuthRule('/app', mrtShortnerRules);
      expect(result.path).toBe('/app/**');
      expect(result.methods).toEqual(['oidc']);
      expect(result.required).toBe(true);
    });

    it('should route /app/dashboard to OIDC only', () => {
      const result = findAuthRule('/app/dashboard', mrtShortnerRules);
      expect(result.path).toBe('/app/**');
      expect(result.methods).toEqual(['oidc']);
    });

    it('should route /api/v1/users to Basic+OIDC with priority', () => {
      const result = findAuthRule('/api/v1/users', mrtShortnerRules);
      expect(result.path).toBe('/api/v1/**');
      expect(result.methods).toEqual(['basic', 'oidc']);
      expect(result.required).toBe(true);
      expect(result.priorities).toEqual({ basic: 1, oidc: 2 });
    });

    it('should route /api/v1/public/stats to optional auth (overrides /api/v1/**)', () => {
      const result = findAuthRule('/api/v1/public/stats', mrtShortnerRules);
      expect(result.path).toBe('/api/v1/public/**');
      expect(result.required).toBe(false); // ← Key difference!
    });

    it('should route /health to public (exact match wins)', () => {
      const result = findAuthRule('/health', mrtShortnerRules);
      expect(result.path).toBe('/health');
      expect(result.methods).toEqual([]);
      expect(result.required).toBe(false);
    });

    it('should route / to public (exact match wins)', () => {
      const result = findAuthRule('/', mrtShortnerRules);
      expect(result.path).toBe('/');
      expect(result.methods).toEqual([]);
    });

    it('should route /r/abc123 to public (route param)', () => {
      const result = findAuthRule('/r/abc123', mrtShortnerRules);
      expect(result.path).toBe('/r/:shortId');
      expect(result.required).toBe(false);
    });

    it('should route /unknown to fallback (/**)', () => {
      const result = findAuthRule('/unknown/path', mrtShortnerRules);
      expect(result.path).toBe('/**');
      expect(result.required).toBe(false);
    });
  });
});

describe('Path-Based Auth Middleware', () => {
  describe('createPathBasedAuthMiddleware()', () => {
    it('should allow request when no rules match', async () => {
      const middleware = createPathBasedAuthMiddleware({
        rules: [
          { path: '/app/**', methods: ['oidc'], required: true }
        ],
        authMiddlewares: {}
      });

      let nextCalled = false;
      const mockContext = {
        req: { path: '/api/users' },
        get: () => null
      };

      await middleware(mockContext, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should allow request when rule says not required', async () => {
      const middleware = createPathBasedAuthMiddleware({
        rules: [
          { path: '/health', methods: [], required: false }
        ],
        authMiddlewares: {}
      });

      let nextCalled = false;
      const mockContext = {
        req: { path: '/health' },
        get: () => null
      };

      await middleware(mockContext, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should return 500 when rule requires auth but has no methods', async () => {
      const middleware = createPathBasedAuthMiddleware({
        rules: [
          { path: '/app/**', methods: [], required: true } // Invalid!
        ],
        authMiddlewares: {}
      });

      const mockContext = {
        req: { path: '/app/dashboard' },
        get: () => null,
        json: (data, status) => ({ _data: data, _status: status })
      };

      const result = await middleware(mockContext, async () => {});

      expect(result._status).toBe(500);
      expect(result._data.error).toContain('Configuration error');
    });

    it('should try auth middlewares in order', async () => {
      const authOrder = [];

      const middleware = createPathBasedAuthMiddleware({
        rules: [
          {
            path: '/api/**',
            methods: ['basic', 'oidc'],
            required: true,
            strategy: 'priority',
            priorities: { basic: 1, oidc: 2 }
          }
        ],
        authMiddlewares: {
          basic: async (c, next) => {
            authOrder.push('basic');
            // Don't set user - fail
          },
          oidc: async (c, next) => {
            authOrder.push('oidc');
            // Don't set user - fail
          }
        }
      });

      const mockContext = {
        req: { path: '/api/users' },
        get: () => null,
        json: (data, status) => ({ _data: data, _status: status })
      };

      await middleware(mockContext, async () => {});

      // Both tried, in priority order
      expect(authOrder).toEqual(['basic', 'oidc']);
    });

    it('should succeed when auth middleware sets user', async () => {
      const middleware = createPathBasedAuthMiddleware({
        rules: [
          { path: '/api/**', methods: ['basic'], required: true }
        ],
        authMiddlewares: {
          basic: async (c, next) => {
            c._user = { id: '123', email: 'test@test.com' };
            await next();
          }
        }
      });

      let nextCalled = false;
      const mockContext = {
        req: { path: '/api/users' },
        get: (key) => key === 'user' ? mockContext._user : null
      };

      await middleware(mockContext, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should call unauthorizedHandler when all auth fails', async () => {
      let handlerCalled = false;
      let handlerMessage = '';

      const middleware = createPathBasedAuthMiddleware({
        rules: [
          { path: '/api/**', methods: ['basic'], required: true }
        ],
        authMiddlewares: {
          basic: async (c, next) => {
            // Don't set user - fail
          }
        },
        unauthorizedHandler: (c, message) => {
          handlerCalled = true;
          handlerMessage = message;
          return { error: 'Unauthorized', message };
        }
      });

      const mockContext = {
        req: { path: '/api/users' },
        get: () => null
      };

      const result = await middleware(mockContext, async () => {});

      expect(handlerCalled).toBe(true);
      expect(handlerMessage).toContain('basic');
    });

    it('should use default 401 when no unauthorizedHandler', async () => {
      const middleware = createPathBasedAuthMiddleware({
        rules: [
          { path: '/api/**', methods: ['basic'], required: true }
        ],
        authMiddlewares: {
          basic: async (c, next) => {
            // Fail
          }
        }
      });

      const mockContext = {
        req: { path: '/api/users' },
        get: () => null,
        json: (data, status) => ({ _data: data, _status: status })
      };

      const result = await middleware(mockContext, async () => {});

      expect(result._status).toBe(401);
      expect(result._data.error).toBe('Unauthorized');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle paths with trailing slashes', () => {
    expect(matchPath('/api/users/', '/api/users')).toBe(false);
    expect(matchPath('/api/users', '/api/users/')).toBe(false);
    expect(matchPath('/api/users/', '/api/users/**')).toBe(true);
  });

  it('should handle empty path', () => {
    expect(matchPath('', '/')).toBe(false);
    expect(matchPath('/', '/')).toBe(true);
  });

  it('should handle very long paths', () => {
    const longPath = '/api/' + 'segment/'.repeat(100) + 'end';
    expect(matchPath(longPath, '/api/**')).toBe(true);
  });

  it('should handle special characters in route params', () => {
    expect(matchPath('/users/test@example.com', '/users/:email')).toBe(true);
    expect(matchPath('/posts/hello-world-123', '/posts/:slug')).toBe(true);
  });

  it('should handle multiple consecutive wildcards', () => {
    expect(matchPath('/a/b/c/d', '/**/c/**')).toBe(true);
    expect(matchPath('/a/b/c/d', '/**/**/**')).toBe(true);
  });
});
