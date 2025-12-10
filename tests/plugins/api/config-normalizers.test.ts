import { describe, test, expect } from 'vitest';
import { normalizeAuthConfig } from '../../../src/plugins/api/config/normalize-auth.js';
import { normalizeResourcesConfig } from '../../../src/plugins/api/config/normalize-resources.js';
import { normalizeRateLimitRules } from '../../../src/plugins/api/config/normalize-ratelimit.js';
import { normalizeLoggingConfig } from '../../../src/plugins/api/config/normalize-logging.js';

describe('normalizeAuthConfig', () => {
  describe('empty/null input', () => {
    test('returns defaults for null', () => {
      const result = normalizeAuthConfig(null);
      expect(result).toEqual({
        drivers: [],
        pathRules: [],
        pathAuth: undefined,
        strategy: 'any',
        priorities: {},
        resource: null,
        driver: null,
        createResource: true
      });
    });

    test('returns defaults for undefined', () => {
      const result = normalizeAuthConfig(undefined);
      expect(result).toEqual({
        drivers: [],
        pathRules: [],
        pathAuth: undefined,
        strategy: 'any',
        priorities: {},
        resource: null,
        driver: null,
        createResource: true
      });
    });

    test('returns defaults for empty object', () => {
      const result = normalizeAuthConfig({});
      expect(result.drivers).toEqual([]);
      expect(result.strategy).toBe('any');
      expect(result.createResource).toBe(true);
    });
  });

  describe('drivers array', () => {
    test('handles string drivers', () => {
      const result = normalizeAuthConfig({
        drivers: ['jwt', 'api-key']
      });
      expect(result.drivers).toHaveLength(2);
      expect(result.drivers[0].driver).toBe('jwt');
      expect(result.drivers[0].config.resource).toBe('users');
      expect(result.drivers[1].driver).toBe('api-key');
      expect(result.driver).toBe('jwt');
    });

    test('handles object drivers with config', () => {
      const result = normalizeAuthConfig({
        drivers: [
          { driver: 'jwt', config: { resource: 'admins', secret: 'test' } }
        ]
      });
      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driver).toBe('jwt');
      expect(result.drivers[0].config.resource).toBe('admins');
      expect(result.drivers[0].config.secret).toBe('test');
    });

    test('deduplicates drivers', () => {
      const result = normalizeAuthConfig({
        drivers: ['jwt', 'jwt', 'api-key', 'jwt']
      });
      expect(result.drivers).toHaveLength(2);
      expect(result.drivers.map(d => d.driver)).toEqual(['jwt', 'api-key']);
    });

    test('ignores empty/null driver names', () => {
      const result = normalizeAuthConfig({
        drivers: ['jwt', '', null, undefined, 'api-key']
      });
      expect(result.drivers).toHaveLength(2);
    });

    test('trims driver names', () => {
      const result = normalizeAuthConfig({
        drivers: ['  jwt  ', '  api-key  ']
      });
      expect(result.drivers[0].driver).toBe('jwt');
      expect(result.drivers[1].driver).toBe('api-key');
    });
  });

  describe('single driver', () => {
    test('handles string driver', () => {
      const result = normalizeAuthConfig({
        driver: 'jwt'
      });
      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driver).toBe('jwt');
      expect(result.driver).toBe('jwt');
    });

    test('handles object driver', () => {
      const result = normalizeAuthConfig({
        driver: { driver: 'oidc', config: { issuer: 'https://auth.example.com' } }
      });
      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driver).toBe('oidc');
      expect(result.drivers[0].config.issuer).toBe('https://auth.example.com');
    });

    test('uses root config if driver object has no config', () => {
      const result = normalizeAuthConfig({
        driver: { driver: 'jwt' },
        config: { secret: 'root-secret' }
      });
      expect(result.drivers[0].config.secret).toBe('root-secret');
    });
  });

  describe('pathRules', () => {
    test('preserves pathRules array', () => {
      const pathRules = [
        { path: '/api/*', required: true },
        { pattern: '/public/*', required: false }
      ];
      const result = normalizeAuthConfig({ pathRules });
      expect(result.pathRules).toEqual(pathRules);
    });

    test('defaults to empty array for non-array', () => {
      const result = normalizeAuthConfig({ pathRules: 'invalid' });
      expect(result.pathRules).toEqual([]);
    });
  });

  describe('strategy and priorities', () => {
    test('uses provided strategy', () => {
      const result = normalizeAuthConfig({ strategy: 'all' });
      expect(result.strategy).toBe('all');
    });

    test('uses provided priorities', () => {
      const priorities = { jwt: 1, 'api-key': 2 };
      const result = normalizeAuthConfig({ priorities });
      expect(result.priorities).toEqual(priorities);
    });
  });

  describe('createResource', () => {
    test('defaults to true', () => {
      const result = normalizeAuthConfig({});
      expect(result.createResource).toBe(true);
    });

    test('can be set to false', () => {
      const result = normalizeAuthConfig({ createResource: false });
      expect(result.createResource).toBe(false);
    });
  });
});

describe('normalizeResourcesConfig', () => {
  describe('empty/null input', () => {
    test('returns empty object for null', () => {
      const result = normalizeResourcesConfig(null, null);
      expect(result).toEqual({});
    });

    test('returns empty object for undefined', () => {
      const result = normalizeResourcesConfig(undefined, null);
      expect(result).toEqual({});
    });
  });

  describe('array input', () => {
    test('handles string array', () => {
      const result = normalizeResourcesConfig(['users', 'posts'], null);
      expect(result).toEqual({
        users: {},
        posts: {}
      });
    });

    test('handles object array with name property', () => {
      const result = normalizeResourcesConfig([
        { name: 'users', enabled: true, methods: ['GET', 'POST'] },
        { name: 'posts', auth: ['jwt'] }
      ], null);
      expect(result.users).toEqual({ enabled: true, methods: ['GET', 'POST'] });
      expect(result.posts).toEqual({ auth: ['jwt'] });
    });

    test('ignores invalid entries in array', () => {
      const result = normalizeResourcesConfig(
        ['users', null, undefined, { invalid: true }, { name: 'posts' }],
        null
      );
      expect(Object.keys(result)).toEqual(['users', 'posts']);
    });

    test('ignores empty string names', () => {
      const result = normalizeResourcesConfig(['users', '', '  ', 'posts'], null);
      expect(Object.keys(result)).toEqual(['users', 'posts']);
    });
  });

  describe('object input', () => {
    test('handles boolean values', () => {
      const result = normalizeResourcesConfig({
        users: true,
        posts: false
      }, null);
      expect(result.users).toEqual({});
      expect(result.posts).toEqual({ enabled: false });
    });

    test('handles null/undefined values', () => {
      const result = normalizeResourcesConfig({
        users: null,
        posts: undefined
      }, null);
      expect(result.users).toEqual({});
      expect(result.posts).toEqual({});
    });

    test('handles object config', () => {
      const result = normalizeResourcesConfig({
        users: { methods: ['GET'], auth: ['jwt'] }
      }, null);
      expect(result.users).toEqual({ methods: ['GET'], auth: ['jwt'] });
    });
  });
});

describe('normalizeRateLimitRules', () => {
  describe('empty/null input', () => {
    test('returns empty array for null', () => {
      const result = normalizeRateLimitRules(null, null);
      expect(result).toEqual([]);
    });

    test('returns empty array for undefined', () => {
      const result = normalizeRateLimitRules(undefined, null);
      expect(result).toEqual([]);
    });

    test('returns empty array for empty array', () => {
      const result = normalizeRateLimitRules([], null);
      expect(result).toEqual([]);
    });
  });

  describe('rule normalization', () => {
    test('normalizes basic rule with path', () => {
      const result = normalizeRateLimitRules([
        { path: '/api/users', maxRequests: 100, windowMs: 60000 }
      ], null);
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('/api/users');
      expect(result[0].maxRequests).toBe(100);
      expect(result[0].windowMs).toBe(60000);
      expect(result[0].key).toBe('ip');
      expect(result[0].keyHeader).toBe('x-api-key');
    });

    test('normalizes rule with pattern instead of path', () => {
      const result = normalizeRateLimitRules([
        { pattern: '/api/*', maxRequests: 50 }
      ], null);
      expect(result[0].pattern).toBe('/api/*');
    });

    test('adds leading slash if missing', () => {
      const result = normalizeRateLimitRules([
        { path: 'api/users' }
      ], null);
      expect(result[0].pattern).toBe('/api/users');
    });

    test('preserves path if already starts with slash', () => {
      const result = normalizeRateLimitRules([
        { path: '///api/users' }
      ], null);
      // Implementation only normalizes paths not starting with /
      expect(result[0].pattern).toBe('///api/users');
    });

    test('uses scope as key fallback', () => {
      const result = normalizeRateLimitRules([
        { path: '/api', scope: 'user' }
      ], null);
      expect(result[0].key).toBe('user');
    });

    test('uses header as keyHeader fallback', () => {
      const result = normalizeRateLimitRules([
        { path: '/api', header: 'authorization' }
      ], null);
      expect(result[0].keyHeader).toBe('authorization');
    });

    test('preserves keyGenerator function', () => {
      const keyGen = (c) => c.req.header('x-custom');
      const result = normalizeRateLimitRules([
        { path: '/api', keyGenerator: keyGen }
      ], null);
      expect(result[0].keyGenerator).toBe(keyGen);
    });

    test('sets keyGenerator to null for non-function', () => {
      const result = normalizeRateLimitRules([
        { path: '/api', keyGenerator: 'not-a-function' }
      ], null);
      expect(result[0].keyGenerator).toBeNull();
    });

    test('generates unique id for each rule', () => {
      const result = normalizeRateLimitRules([
        { path: '/api/a' },
        { path: '/api/b' }
      ], null);
      expect(result[0].id).toBe('rate-limit-0-/api/a');
      expect(result[1].id).toBe('rate-limit-1-/api/b');
    });
  });

  describe('invalid rules', () => {
    test('ignores non-object rules', () => {
      const result = normalizeRateLimitRules(
        [null, undefined, 'string', 123, { path: '/valid' }],
        null
      );
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('/valid');
    });

    test('ignores rules without path/pattern', () => {
      const result = normalizeRateLimitRules([
        { maxRequests: 100 },
        { path: '/valid' }
      ], null);
      expect(result).toHaveLength(1);
    });

    test('ignores rules with empty path', () => {
      const result = normalizeRateLimitRules([
        { path: '' },
        { path: '   ' },
        { path: '/valid' }
      ], null);
      expect(result).toHaveLength(1);
    });
  });
});

describe('normalizeLoggingConfig', () => {
  const DEFAULT_FORMAT = ':verb :url => :status (:elapsed ms, :res[content-length])';

  describe('boolean input', () => {
    test('true enables with defaults', () => {
      const result = normalizeLoggingConfig(true);
      expect(result.enabled).toBe(true);
      expect(result.format).toBe(DEFAULT_FORMAT);
      expect(result.logLevel).toBe('info');
      expect(result.colorize).toBe(true);
      expect(result.filter).toBeNull();
      expect(result.excludePaths).toEqual([]);
    });

    test('false disables with defaults', () => {
      const result = normalizeLoggingConfig(false);
      expect(result.enabled).toBe(false);
      expect(result.format).toBe(DEFAULT_FORMAT);
    });
  });

  describe('null/undefined input', () => {
    test('null disables logging', () => {
      const result = normalizeLoggingConfig(null);
      expect(result.enabled).toBe(false);
    });

    test('undefined disables logging', () => {
      const result = normalizeLoggingConfig(undefined);
      expect(result.enabled).toBe(false);
    });
  });

  describe('object input', () => {
    test('enabled defaults to true if not explicitly false', () => {
      const result = normalizeLoggingConfig({});
      expect(result.enabled).toBe(true);
    });

    test('enabled can be set to false', () => {
      const result = normalizeLoggingConfig({ enabled: false });
      expect(result.enabled).toBe(false);
    });

    test('uses custom format', () => {
      const result = normalizeLoggingConfig({ format: ':method :path' });
      expect(result.format).toBe(':method :path');
    });

    test('uses custom logLevel', () => {
      const result = normalizeLoggingConfig({ logLevel: 'debug' });
      expect(result.logLevel).toBe('debug');
    });

    test('colorize defaults to true', () => {
      const result = normalizeLoggingConfig({});
      expect(result.colorize).toBe(true);
    });

    test('colorize can be disabled', () => {
      const result = normalizeLoggingConfig({ colorize: false });
      expect(result.colorize).toBe(false);
    });

    test('preserves filter function', () => {
      const filter = (c) => c.req.path !== '/health';
      const result = normalizeLoggingConfig({ filter });
      expect(result.filter).toBe(filter);
    });

    test('sets filter to null for non-function', () => {
      const result = normalizeLoggingConfig({ filter: 'not-a-function' });
      expect(result.filter).toBeNull();
    });
  });

  describe('excludePaths normalization', () => {
    test('handles string excludePaths', () => {
      const result = normalizeLoggingConfig({ excludePaths: '/health' });
      expect(result.excludePaths).toEqual(['/health']);
    });

    test('handles array excludePaths', () => {
      const result = normalizeLoggingConfig({
        excludePaths: ['/health', '/metrics', '/ready']
      });
      expect(result.excludePaths).toEqual(['/health', '/metrics', '/ready']);
    });

    test('filters empty strings from array', () => {
      const result = normalizeLoggingConfig({
        excludePaths: ['/health', '', null, '/metrics']
      });
      expect(result.excludePaths).toEqual(['/health', '/metrics']);
    });

    test('trims paths', () => {
      const result = normalizeLoggingConfig({
        excludePaths: ['  /health  ', '  /metrics  ']
      });
      expect(result.excludePaths).toEqual(['/health', '/metrics']);
    });

    test('handles empty string', () => {
      const result = normalizeLoggingConfig({ excludePaths: '' });
      expect(result.excludePaths).toEqual([]);
    });

    test('handles whitespace-only string', () => {
      const result = normalizeLoggingConfig({ excludePaths: '   ' });
      expect(result.excludePaths).toEqual([]);
    });
  });
});
