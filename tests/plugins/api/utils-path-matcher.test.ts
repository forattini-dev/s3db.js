import { describe, test, expect } from 'vitest';
import { matchPath, findBestMatch, validatePathAuth } from '../../../src/plugins/api/utils/path-matcher.js';

describe('matchPath', () => {
  describe('exact matching', () => {
    test('matches exact path', () => {
      expect(matchPath('/api/users', '/api/users')).toBe(true);
    });

    test('does not match different path', () => {
      expect(matchPath('/api/users', '/api/posts')).toBe(false);
    });

    test('matches root path', () => {
      expect(matchPath('/', '/')).toBe(true);
    });

    test('does not match partial paths', () => {
      expect(matchPath('/api', '/api/users')).toBe(false);
    });
  });

  describe('single wildcard (*)', () => {
    test('matches single segment', () => {
      expect(matchPath('/api/*/info', '/api/users/info')).toBe(true);
    });

    test('does not match multiple segments', () => {
      expect(matchPath('/api/*/info', '/api/users/123/info')).toBe(false);
    });

    test('matches at end of path', () => {
      expect(matchPath('/api/users/*', '/api/users/123')).toBe(true);
    });

    test('does not match empty segment', () => {
      expect(matchPath('/api/users/*', '/api/users/')).toBe(false);
    });

    test('multiple single wildcards', () => {
      expect(matchPath('/api/*/items/*', '/api/users/items/123')).toBe(true);
    });
  });

  describe('double wildcard (**)', () => {
    test('matches multiple segments', () => {
      expect(matchPath('/api/**', '/api/users/123/profile')).toBe(true);
    });

    test('matches single segment', () => {
      expect(matchPath('/api/**', '/api/users')).toBe(true);
    });

    test('matches empty after base', () => {
      expect(matchPath('/api/**', '/api/')).toBe(true);
    });

    test('at end of pattern', () => {
      expect(matchPath('/api/v1/**', '/api/v1/users/list/all')).toBe(true);
    });

    test('in middle of pattern', () => {
      expect(matchPath('/api/**/info', '/api/users/123/profile/info')).toBe(true);
    });
  });

  describe('special characters', () => {
    test('handles dots in path', () => {
      expect(matchPath('/api/v1.0/users', '/api/v1.0/users')).toBe(true);
    });

    test('handles query-like paths', () => {
      expect(matchPath('/api/search', '/api/search')).toBe(true);
    });
  });
});

describe('findBestMatch', () => {
  describe('empty/null input', () => {
    test('returns null for null rules', () => {
      const result = findBestMatch(null, '/api/users');
      expect(result).toBeNull();
    });

    test('returns null for undefined rules', () => {
      const result = findBestMatch(undefined, '/api/users');
      expect(result).toBeNull();
    });

    test('returns null for empty array', () => {
      const result = findBestMatch([], '/api/users');
      expect(result).toBeNull();
    });
  });

  describe('single rule matching', () => {
    test('matches single rule', () => {
      const rules = [{ pattern: '/api/users', required: true }];
      const result = findBestMatch(rules, '/api/users');
      expect(result).toEqual({ pattern: '/api/users', required: true });
    });

    test('returns null when no match', () => {
      const rules = [{ pattern: '/api/posts' }];
      const result = findBestMatch(rules, '/api/users');
      expect(result).toBeNull();
    });
  });

  describe('specificity ordering', () => {
    test('prefers exact match over wildcard', () => {
      const rules = [
        { pattern: '/api/*', drivers: ['jwt'] },
        { pattern: '/api/users', drivers: ['apiKey'] }
      ];
      const result = findBestMatch(rules, '/api/users');
      expect(result?.drivers).toEqual(['apiKey']);
    });

    test('prefers single wildcard over double wildcard', () => {
      const rules = [
        { pattern: '/api/**', drivers: ['jwt'] },
        { pattern: '/api/*', drivers: ['apiKey'] }
      ];
      const result = findBestMatch(rules, '/api/users');
      expect(result?.drivers).toEqual(['apiKey']);
    });

    test('prefers more specific path', () => {
      const rules = [
        { pattern: '/api/*', drivers: ['jwt'] },
        { pattern: '/api/users/*', drivers: ['apiKey'] }
      ];
      const result = findBestMatch(rules, '/api/users/123');
      expect(result?.drivers).toEqual(['apiKey']);
    });

    test('prefers longer exact paths', () => {
      const rules = [
        { pattern: '/api', drivers: ['jwt'] },
        { pattern: '/api/users', drivers: ['apiKey'] },
        { pattern: '/api/users/admin', drivers: ['basic'] }
      ];
      const result = findBestMatch(rules, '/api/users/admin');
      expect(result?.drivers).toEqual(['basic']);
    });
  });

  describe('rule properties preserved', () => {
    test('preserves all rule properties', () => {
      const rules = [
        {
          pattern: '/api/secure/**',
          drivers: ['jwt', 'apiKey'],
          required: true,
          customField: 'test'
        }
      ];
      const result = findBestMatch(rules, '/api/secure/data');
      expect(result).toEqual(rules[0]);
    });
  });
});

describe('validatePathAuth', () => {
  describe('array validation', () => {
    test('throws for non-array input', () => {
      expect(() => validatePathAuth('not-array')).toThrow('must be an array');
    });

    test('throws for null', () => {
      expect(() => validatePathAuth(null)).toThrow('must be an array');
    });

    test('accepts empty array', () => {
      expect(() => validatePathAuth([])).not.toThrow();
    });
  });

  describe('pattern validation', () => {
    test('throws for missing pattern', () => {
      expect(() => validatePathAuth([{ drivers: ['jwt'] }])).toThrow('pattern is required');
    });

    test('throws for non-string pattern', () => {
      expect(() => validatePathAuth([{ pattern: 123 }])).toThrow('must be a string');
    });

    test('throws for pattern not starting with /', () => {
      expect(() => validatePathAuth([{ pattern: 'api/users' }])).toThrow('must start with /');
    });

    test('accepts valid pattern', () => {
      expect(() => validatePathAuth([{ pattern: '/api/users' }])).not.toThrow();
    });
  });

  describe('drivers validation', () => {
    test('throws for non-array drivers', () => {
      expect(() => validatePathAuth([{ pattern: '/api', drivers: 'jwt' }])).toThrow('must be an array');
    });

    test('throws for invalid driver name', () => {
      expect(() => validatePathAuth([{ pattern: '/api', drivers: ['invalid'] }])).toThrow("invalid driver 'invalid'");
    });

    test('accepts valid drivers', () => {
      expect(() => validatePathAuth([
        { pattern: '/api', drivers: ['jwt', 'apiKey', 'basic', 'oauth2', 'oidc'] }
      ])).not.toThrow();
    });

    test('accepts undefined drivers', () => {
      expect(() => validatePathAuth([{ pattern: '/api' }])).not.toThrow();
    });
  });

  describe('required validation', () => {
    test('throws for non-boolean required', () => {
      expect(() => validatePathAuth([{ pattern: '/api', required: 'yes' }])).toThrow('must be a boolean');
    });

    test('accepts boolean required', () => {
      expect(() => validatePathAuth([
        { pattern: '/api', required: true },
        { pattern: '/public', required: false }
      ])).not.toThrow();
    });

    test('accepts undefined required', () => {
      expect(() => validatePathAuth([{ pattern: '/api' }])).not.toThrow();
    });
  });

  describe('error messages include index', () => {
    test('includes index for pattern error', () => {
      expect(() => validatePathAuth([
        { pattern: '/valid' },
        { pattern: 'invalid' }
      ])).toThrow('pathAuth[1]');
    });

    test('includes index for drivers error', () => {
      expect(() => validatePathAuth([
        { pattern: '/first', drivers: ['jwt'] },
        { pattern: '/second', drivers: ['invalid'] }
      ])).toThrow('pathAuth[1]');
    });
  });

  describe('multiple rules', () => {
    test('validates all rules in array', () => {
      expect(() => validatePathAuth([
        { pattern: '/api/public/**', required: false },
        { pattern: '/api/admin/**', drivers: ['jwt'], required: true },
        { pattern: '/api/users/*', drivers: ['jwt', 'apiKey'] }
      ])).not.toThrow();
    });
  });
});
