/**
 * Database Unit Tests
 *
 * Isolated unit tests for Database class internal methods.
 * Tests utility functions without requiring S3/database connection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Database } from '#src/database.class.js';

describe('Database Unit Tests', () => {
  describe('_deepMerge', () => {
    let database;

    beforeEach(() => {
      database = new Database({
        connectionString: 'memory://test/db',
        logLevel: 'silent'
      });
    });

    it('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };

      const result = database._deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should recursively merge nested objects', () => {
      const target = {
        level1: { a: 1, b: 2 },
        other: 'value'
      };
      const source = {
        level1: { b: 3, c: 4 },
        new: 'field'
      };

      const result = database._deepMerge(target, source);

      expect(result).toEqual({
        level1: { a: 1, b: 3, c: 4 },
        other: 'value',
        new: 'field'
      });
    });

    it('should overwrite arrays (not merge them)', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };

      const result = database._deepMerge(target, source);

      expect(result.arr).toEqual([4, 5]);
    });

    it('should ignore undefined values', () => {
      const target = { a: 1, b: 2 };
      const source = { b: undefined, c: 3 };

      const result = database._deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should handle null values', () => {
      const target = { a: { nested: 1 } };
      const source = { a: null };

      const result = database._deepMerge(target, source);

      expect(result.a).toBe(null);
    });

    it('should handle deeply nested objects', () => {
      const target = {
        level1: {
          level2: {
            level3: { a: 1 }
          }
        }
      };
      const source = {
        level1: {
          level2: {
            level3: { b: 2 }
          }
        }
      };

      const result = database._deepMerge(target, source);

      expect(result.level1.level2.level3).toEqual({ a: 1, b: 2 });
    });

    it('should not mutate original objects', () => {
      const target = { a: 1 };
      const source = { b: 2 };

      const result = database._deepMerge(target, source);

      expect(target).toEqual({ a: 1 });
      expect(source).toEqual({ b: 2 });
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should handle empty objects', () => {
      expect(database._deepMerge({}, { a: 1 })).toEqual({ a: 1 });
      expect(database._deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
      expect(database._deepMerge({}, {})).toEqual({});
    });
  });

  describe('_normalizeParallelism', () => {
    let database;

    beforeEach(() => {
      database = new Database({
        connectionString: 'memory://test/db',
        logLevel: 'silent'
      });
    });

    it('should return fallback for undefined', () => {
      const result = database._normalizeParallelism(undefined, 10);
      expect(result).toBe(10);
    });

    it('should return fallback for null', () => {
      const result = database._normalizeParallelism(null, 10);
      expect(result).toBe(10);
    });

    it('should return fallback for empty string', () => {
      const result = database._normalizeParallelism('', 10);
      expect(result).toBe(10);
    });

    it('should parse string numbers', () => {
      const result = database._normalizeParallelism('50', 10);
      expect(result).toBe(50);
    });

    it('should return number directly', () => {
      const result = database._normalizeParallelism(25, 10);
      expect(result).toBe(25);
    });

    it('should use default fallback of 10', () => {
      const result = database._normalizeParallelism(undefined);
      expect(result).toBe(10);
    });
  });

  describe('_attemptJsonRecovery', () => {
    let database;

    beforeEach(() => {
      database = new Database({
        connectionString: 'memory://test/db',
        logLevel: 'silent'
      });
    });

    it('should return null for empty content', async () => {
      const healingLog = [];
      const result = await database._attemptJsonRecovery('', healingLog);

      expect(result).toBe(null);
      expect(healingLog).toContain('Content is empty or not a string');
    });

    it('should return null for non-string content', async () => {
      const healingLog = [];
      const result = await database._attemptJsonRecovery(null, healingLog);

      expect(result).toBe(null);
    });

    it('should fix trailing commas', async () => {
      const healingLog = [];
      const content = '{"a": 1, "b": 2,}';

      const result = await database._attemptJsonRecovery(content, healingLog);

      expect(result).toEqual({ a: 1, b: 2 });
      expect(healingLog.some(log => log.includes('successful'))).toBe(true);
    });

    it('should fix missing quotes on keys', async () => {
      const healingLog = [];
      const content = '{name: "John", age: 30}';

      const result = await database._attemptJsonRecovery(content, healingLog);

      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should fix missing closing braces', async () => {
      const healingLog = [];
      const content = '{"a": 1, "b": {"c": 2}';

      const result = await database._attemptJsonRecovery(content, healingLog);

      expect(result).toEqual({ a: 1, b: { c: 2 } });
    });

    it('should fix missing closing brackets', async () => {
      const healingLog = [];
      // Note: brackets are appended at the END, so input must be truncated (not have misplaced brackets)
      const content = '{"items": [1, 2, 3';

      const result = await database._attemptJsonRecovery(content, healingLog);

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('should return null for unrecoverable JSON', async () => {
      const healingLog = [];
      const content = 'completely invalid { [ } ]';

      const result = await database._attemptJsonRecovery(content, healingLog);

      expect(result).toBe(null);
      expect(healingLog).toContain('All JSON recovery attempts failed');
    });

    it('should parse valid JSON without changes', async () => {
      const healingLog = [];
      const content = '{"name": "test", "value": 123}';

      const result = await database._attemptJsonRecovery(content, healingLog);

      expect(result).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('_validateAndHealMetadata', () => {
    let database;

    beforeEach(() => {
      database = new Database({
        connectionString: 'memory://test/db',
        logLevel: 'silent'
      });
    });

    it('should return blank structure for null metadata', async () => {
      const healingLog = [];
      const result = await database._validateAndHealMetadata(null, healingLog);

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('resources');
      expect(healingLog).toContain('Metadata is not an object - using blank structure');
    });

    it('should return blank structure for non-object metadata', async () => {
      const healingLog = [];
      const result = await database._validateAndHealMetadata('not an object', healingLog);

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('resources');
    });

    it('should add missing version field', async () => {
      const healingLog = [];
      const metadata = { resources: {} };

      const result = await database._validateAndHealMetadata(metadata, healingLog);

      expect(result.version).toBe('1');
      expect(healingLog.some(log => log.includes('version'))).toBe(true);
    });

    it('should convert numeric version to string', async () => {
      const healingLog = [];
      const metadata = { version: 1, resources: {} };

      const result = await database._validateAndHealMetadata(metadata, healingLog);

      expect(result.version).toBe('1');
      expect(healingLog).toContain('Converted version from number to string');
    });

    it('should fix invalid resources field', async () => {
      const healingLog = [];
      const metadata = { version: '1', resources: 'not-an-object' };

      const result = await database._validateAndHealMetadata(metadata, healingLog);

      expect(result.resources).toEqual({});
      expect(healingLog).toContain('Fixed invalid resources field');
    });

    it('should fix array resources field', async () => {
      const healingLog = [];
      const metadata = { version: '1', resources: [] };

      const result = await database._validateAndHealMetadata(metadata, healingLog);

      expect(result.resources).toEqual({});
    });

    it('should add missing lastUpdated field', async () => {
      const healingLog = [];
      const metadata = { version: '1', resources: {} };

      const result = await database._validateAndHealMetadata(metadata, healingLog);

      expect(result.lastUpdated).toBeDefined();
      expect(healingLog.some(log => log.includes('lastUpdated'))).toBe(true);
    });

    it('should preserve valid metadata', async () => {
      const healingLog = [];
      const metadata = {
        version: '1',
        s3dbVersion: '16.0.0',
        resources: {},
        lastUpdated: '2024-01-01T00:00:00Z'
      };

      const result = await database._validateAndHealMetadata(metadata, healingLog);

      expect(result.version).toBe('1');
      expect(result.s3dbVersion).toBe('16.0.0');
      expect(result.lastUpdated).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('blankMetadataStructure', () => {
    let database;

    beforeEach(() => {
      database = new Database({
        connectionString: 'memory://test/db',
        logLevel: 'silent'
      });
    });

    it('should return valid metadata structure', () => {
      const blank = database.blankMetadataStructure();

      expect(blank).toHaveProperty('version', '1');
      expect(blank).toHaveProperty('s3dbVersion');
      expect(blank).toHaveProperty('resources');
      expect(blank).toHaveProperty('lastUpdated');
      expect(typeof blank.resources).toBe('object');
    });

    it('should return new object each time', () => {
      const blank1 = database.blankMetadataStructure();
      const blank2 = database.blankMetadataStructure();

      expect(blank1).not.toBe(blank2);
      blank1.resources.test = 'modified';
      expect(blank2.resources.test).toBeUndefined();
    });
  });

  describe('Constructor', () => {
    it('should create database with connection string', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(database).toBeDefined();
      expect(database.id).toBeDefined();
      expect(database.version).toBe('1');
    });

    it('should generate unique ID for each instance', () => {
      const db1 = new Database({
        connectionString: 'memory://bucket/path1',
        logLevel: 'silent'
      });
      const db2 = new Database({
        connectionString: 'memory://bucket/path2',
        logLevel: 'silent'
      });

      expect(db1.id).not.toBe(db2.id);
    });

    it('should use default parallelism', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(database._parallelism).toBeGreaterThan(0);
    });

    it('should accept custom parallelism', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        parallelism: 50,
        logLevel: 'silent'
      });

      expect(database._parallelism).toBe(50);
    });

    it('should use default passphrase', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(database.passphrase).toBe('secret');
    });

    it('should accept custom passphrase', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        passphrase: 'my-custom-passphrase',
        logLevel: 'silent'
      });

      expect(database.passphrase).toBe('my-custom-passphrase');
    });

    it('should initialize empty resources map', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(Object.keys(database._resourcesMap).length).toBe(0);
    });

    it('should create proxied resources object', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(database.resources).toBeDefined();
      expect(database.resources.nonExistent).toBeUndefined();
    });
  });

  describe('Resources Proxy', () => {
    let database;

    beforeEach(() => {
      database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });
    });

    it('should return undefined for non-existent resources', () => {
      expect(database.resources.unknown).toBeUndefined();
    });

    it('should support Object.keys()', () => {
      database._resourcesMap.users = { name: 'users' };
      database._resourcesMap.posts = { name: 'posts' };

      const keys = Object.keys(database.resources);

      expect(keys).toContain('users');
      expect(keys).toContain('posts');
    });

    it('should return resource when exists', () => {
      const mockResource = { name: 'users', insert: vi.fn() };
      database._resourcesMap.users = mockResource;

      expect(database.resources.users).toBe(mockResource);
    });

    it('should support optional chaining', () => {
      expect(database.resources.users?.name).toBeUndefined();
    });
  });

  describe('Plugin Registry', () => {
    let database;

    beforeEach(() => {
      database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });
    });

    it('should initialize empty plugin registry', () => {
      expect(database.pluginRegistry).toEqual({});
    });

    it('should alias pluginRegistry as plugins', () => {
      expect(database.plugins).toBe(database.pluginRegistry);
    });
  });

  describe('Options', () => {
    it('should store strictValidation option', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        strictValidation: false,
        logLevel: 'silent'
      });

      expect(database.strictValidation).toBe(false);
    });

    it('should default strictValidation to true', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(database.strictValidation).toBe(true);
    });

    it('should store versioningEnabled option', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        versioningEnabled: true,
        logLevel: 'silent'
      });

      expect(database.versioningEnabled).toBe(true);
    });

    it('should default versioningEnabled to false', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(database.versioningEnabled).toBe(false);
    });

    it('should store bcryptRounds option', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        bcryptRounds: 12,
        logLevel: 'silent'
      });

      expect(database.bcryptRounds).toBe(12);
    });

    it('should default bcryptRounds to 10', () => {
      const database = new Database({
        connectionString: 'memory://bucket/path',
        logLevel: 'silent'
      });

      expect(database.bcryptRounds).toBe(10);
    });
  });
});
