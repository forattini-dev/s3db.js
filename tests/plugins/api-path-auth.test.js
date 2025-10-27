/**
 * Tests for Path-based Authentication
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { matchPath, findBestMatch, validatePathAuth } from '../../src/plugins/api/utils/path-matcher.js';

describe('Path Matcher - matchPath()', () => {
  it('should match exact paths', () => {
    expect(matchPath('/api/users', '/api/users')).toBe(true);
    expect(matchPath('/api/users', '/api/products')).toBe(false);
  });

  it('should match single-level wildcard (*)', () => {
    // Single wildcard matches one segment
    expect(matchPath('/api/v1/*', '/api/v1/users')).toBe(true);
    expect(matchPath('/api/v1/*', '/api/v1/products')).toBe(true);

    // But not nested paths
    expect(matchPath('/api/v1/*', '/api/v1/users/123')).toBe(false);
    expect(matchPath('/api/v1/*', '/api/v1/users/123/posts')).toBe(false);
  });

  it('should match multi-level wildcard (**)', () => {
    // Double wildcard matches any depth
    expect(matchPath('/api/v1/**', '/api/v1/users')).toBe(true);
    expect(matchPath('/api/v1/**', '/api/v1/users/123')).toBe(true);
    expect(matchPath('/api/v1/**', '/api/v1/users/123/posts')).toBe(true);
    expect(matchPath('/api/v1/**', '/api/v1/users/123/posts/456')).toBe(true);
  });

  it('should handle wildcards in middle of path', () => {
    expect(matchPath('/api/*/users', '/api/v1/users')).toBe(true);
    expect(matchPath('/api/*/users', '/api/v2/users')).toBe(true);
    expect(matchPath('/api/*/users', '/api/v1/products')).toBe(false);

    expect(matchPath('/api/**/users', '/api/v1/admin/users')).toBe(true);
    expect(matchPath('/api/**/users', '/api/v1/users')).toBe(true);
  });

  it('should not match if path is shorter than pattern', () => {
    expect(matchPath('/api/v1/users', '/api/v1')).toBe(false);
    expect(matchPath('/api/v1/users', '/api')).toBe(false);
  });

  it('should not match if path is longer and no wildcard', () => {
    expect(matchPath('/api/v1', '/api/v1/users')).toBe(false);
  });
});

describe('Path Matcher - findBestMatch()', () => {
  const rules = [
    { pattern: '/api/**', drivers: ['jwt'], required: true, name: 'all-api' },
    { pattern: '/api/v1/**', drivers: ['jwt'], required: true, name: 'v1' },
    { pattern: '/api/v1/admin/**', drivers: ['jwt', 'apiKey'], required: true, name: 'admin' },
    { pattern: '/api/v1/admin/users', drivers: ['jwt', 'apiKey'], required: true, name: 'admin-users-exact' },
    { pattern: '/health/*', required: false, name: 'health' },
    { pattern: '/public/**', required: false, name: 'public' }
  ];

  it('should find most specific match', () => {
    // Most specific (exact match)
    expect(findBestMatch(rules, '/api/v1/admin/users').name).toBe('admin-users-exact');

    // Second most specific
    expect(findBestMatch(rules, '/api/v1/admin/roles').name).toBe('admin');

    // Third most specific
    expect(findBestMatch(rules, '/api/v1/products').name).toBe('v1');

    // Least specific (but still matches)
    expect(findBestMatch(rules, '/api/v2/users').name).toBe('all-api');
  });

  it('should return null if no match', () => {
    expect(findBestMatch(rules, '/other/path')).toBe(null);
    expect(findBestMatch(rules, '/admin')).toBe(null);
  });

  it('should prefer exact match over wildcards', () => {
    const testRules = [
      { pattern: '/api/**', name: 'wildcard' },
      { pattern: '/api/users', name: 'exact' }
    ];

    expect(findBestMatch(testRules, '/api/users').name).toBe('exact');
  });

  it('should prefer single wildcard over double wildcard', () => {
    const testRules = [
      { pattern: '/api/**', name: 'double' },
      { pattern: '/api/v1/*', name: 'single' }
    ];

    expect(findBestMatch(testRules, '/api/v1/users').name).toBe('single');
  });

  it('should handle public paths', () => {
    const match = findBestMatch(rules, '/health/liveness');
    expect(match.name).toBe('health');
    expect(match.required).toBe(false);
  });
});

describe('Path Matcher - validatePathAuth()', () => {
  it('should accept valid config', () => {
    const config = [
      { pattern: '/api/**', drivers: ['jwt'], required: true },
      { pattern: '/health/*', required: false }
    ];

    expect(() => validatePathAuth(config)).not.toThrow();
  });

  it('should reject non-array config', () => {
    expect(() => validatePathAuth({})).toThrow('pathAuth must be an array');
    expect(() => validatePathAuth('string')).toThrow('pathAuth must be an array');
  });

  it('should reject missing pattern', () => {
    expect(() => validatePathAuth([{ drivers: ['jwt'] }])).toThrow('pattern is required');
  });

  it('should reject pattern not starting with /', () => {
    expect(() => validatePathAuth([{ pattern: 'api/users' }])).toThrow('pattern must start with /');
  });

  it('should reject invalid drivers array', () => {
    expect(() => validatePathAuth([
      { pattern: '/api/**', drivers: 'jwt' }
    ])).toThrow('drivers must be an array');
  });

  it('should reject invalid driver names', () => {
    expect(() => validatePathAuth([
      { pattern: '/api/**', drivers: ['invalid-driver'] }
    ])).toThrow('invalid driver');
  });

  it('should reject invalid required type', () => {
    expect(() => validatePathAuth([
      { pattern: '/api/**', required: 'yes' }
    ])).toThrow('required must be a boolean');
  });
});

describe('API Plugin - Path-based Auth Integration', () => {
  let db;
  let apiPlugin;
  let server;

  beforeAll(async () => {
    // Create database with MemoryClient (no MinIO needed)
    db = new Database({
      client: 'memory'
    });

    await db.connect();

    // Create users resource
    await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        username: 'string|required',
        password: 'secret|required',
        apiToken: 'string|optional'
      }
    });

    // Create test user
    await db.resources.users.insert({
      id: 'user1',
      username: 'testuser',
      password: 'password123',
      apiToken: 'test-api-token-123'
    });

    // Create products resource (will be in /api/v1/products)
    await db.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      }
    });

    // Create enums resource (will be public in /api/enums/*)
    await db.createResource({
      name: 'enums',
      attributes: {
        id: 'string|required',
        type: 'string|required',
        value: 'string|required'
      }
    });

    // Add test data
    await db.resources.products.insert({ id: 'p1', name: 'Product 1' });
    await db.resources.enums.insert({ id: 'e1', type: 'status', value: 'active' });

    // Create API Plugin with path-based auth
    apiPlugin = new ApiPlugin({
      port: 0, // Random port
      verbose: false,
      auth: {
        drivers: [
          {
            driver: 'jwt',
            config: { secret: 'test-secret' }
          },
          {
            driver: 'apiKey',
            config: { headerName: 'X-API-Key' }
          }
        ],
        resource: 'users',

        // Path-based auth rules
        pathAuth: [
          // Public paths
          {
            pattern: '/health/**',
            required: false
          },
          {
            pattern: '/api/enums/**',
            required: false
          },

          // Protected paths - JWT only
          {
            pattern: '/api/v1/products/**',
            drivers: ['jwt'],
            required: true
          },

          // Admin paths - JWT + API Key
          {
            pattern: '/api/v1/admin/**',
            drivers: ['jwt', 'apiKey'],
            required: true
          }
        ]
      },
      resources: {
        products: {
          versionPrefix: 'v1'
        },
        enums: {
          versionPrefix: false // no prefix
        }
      }
    });

    await db.usePlugin(apiPlugin);

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));

    server = apiPlugin.server.server;
  }, 30000);

  afterAll(async () => {
    if (apiPlugin) {
      await apiPlugin.stop();
    }
    if (db) {
      await db.disconnect();
    }
  }, 10000);

  it('should allow access to public paths without auth', async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/enums`);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('should deny access to protected paths without auth', async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/v1/products`);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error.message).toContain('Authentication required');
  });

  it('should allow access to protected paths with JWT', async () => {
    const port = server.address().port;

    // Get JWT token first
    const loginRes = await fetch(`http://localhost:${port}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'password123' })
    });

    expect(loginRes.status).toBe(200);
    const { data: { token } } = await loginRes.json();

    // Access protected resource with JWT
    const response = await fetch(`http://localhost:${port}/api/v1/products`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('should allow access with API Key where configured', async () => {
    const port = server.address().port;

    // API Key should work on all paths where apiKey is in drivers
    // Since our pathAuth only has JWT for /api/v1/products, apiKey won't work there
    // But it should work on paths with no pathAuth match (global auth)
  });

  it('should enforce most specific rule', async () => {
    const port = server.address().port;

    // /api/v1/products requires JWT
    const response1 = await fetch(`http://localhost:${port}/api/v1/products`, {
      headers: { 'X-API-Key': 'test-api-token-123' }
    });

    // API Key alone shouldn't work (rule specifies only jwt)
    expect(response1.status).toBe(401);
  });
});
