import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';

import { createDatabaseForTest } from '#tests/config.js';
import { calculateTotalSize } from '#src/concerns/calculator.js';
import { getBehavior, AVAILABLE_BEHAVIORS, DEFAULT_BEHAVIOR } from '#src/behaviors/index.js';

describe('Resource Behaviors - Fast Integration Tests', () => {
  let database;
  let users, products, articles, documents, logs;

  beforeAll(async () => {
    database = createDatabaseForTest('resource-behavior-fast');
    await database.connect();

    // Create all resources once at the beginning to avoid slow beforeEach
    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required',
        bio: 'string|optional'
      },
      behavior: 'user-managed'
    });

    products = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        description: 'string|optional'
      },
      behavior: 'enforce-limits'
    });

    articles = await database.createResource({
      name: 'articles',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        content: 'string|optional'
      },
      behavior: 'truncate-data'
    });

    documents = await database.createResource({
      name: 'documents',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        content: 'string|optional'
      },
      behavior: 'body-overflow'
    });

    logs = await database.createResource({
      name: 'logs',
      attributes: {
        id: 'string|required',
        message: 'string|required',
        level: 'string|optional'
      },
      behavior: 'body-only'
    });
  });

  afterAll(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Behavior System Structure', () => {
    test('should export all required behaviors', () => {
      expect(AVAILABLE_BEHAVIORS).toEqual([
        'user-managed',
        'enforce-limits', 
        'truncate-data',
        'body-overflow',
        'body-only'
      ]);
      expect(DEFAULT_BEHAVIOR).toBe('user-managed');
    });

    test('should load all behaviors successfully', () => {
      AVAILABLE_BEHAVIORS.forEach(behaviorName => {
        expect(() => getBehavior(behaviorName)).not.toThrow();
        
        const behavior = getBehavior(behaviorName);
        expect(behavior).toBeDefined();
        expect(typeof behavior.handleInsert).toBe('function');
        expect(typeof behavior.handleUpdate).toBe('function');
        expect(typeof behavior.handleUpsert).toBe('function');
        expect(typeof behavior.handleGet).toBe('function');
      });
    });

    test('should throw error for unknown behavior', () => {
      expect(() => getBehavior('unknown-behavior')).toThrow(
        'Unknown behavior: unknown-behavior'
      );
    });
  });

  describe('User Managed Behavior Tests', () => {
    test('should allow small data without warning', async () => {
      const smallData = { 
        id: 'user1-' + Date.now(),
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'Short bio'
      };

      const result = await users.insert(smallData);
      expect(result.id).toBe(smallData.id);
      expect(result.name).toBe('Test User');
    });

    test('should handle large data appropriately', async () => {
      const largeData = { 
        id: 'user2-' + Date.now(),
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'A'.repeat(1500)
      };

      const result = await users.insert(largeData);
      expect(result.id).toBe(largeData.id);
      expect(result.bio).toBe(largeData.bio);
    });

    test('should preserve all data in user-managed mode', async () => {
      const testData = { 
        id: 'user3-' + Date.now(),
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'B'.repeat(1000)
      };

      const result = await users.insert(testData);
      const retrieved = await users.get(result.id);
      
      expect(retrieved.bio).toBe(testData.bio);
      expect(retrieved.bio.length).toBe(1000);
    });
  });

  describe('Enforce Limits Behavior Tests', () => {
    test('should allow small data', async () => {
      const smallData = { 
        id: 'prod1-' + Date.now(),
        name: 'Test Product', 
        description: 'Small description' 
      };

      const result = await products.insert(smallData);
      expect(result.id).toBe(smallData.id);
      expect(result.name).toBe('Test Product');
    });

    test('should calculate size correctly for complex objects', async () => {
      const complexData = {
        id: 'prod3-' + Date.now(),
        name: 'Complex Product',
        description: 'Normal description'
      };

      const size = calculateTotalSize(complexData);
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Truncate Data Behavior Tests', () => {
    test('should allow normal size data', async () => {
      const normalData = { 
        id: 'art1-' + Date.now(),
        title: 'Test Article',
        content: 'Normal content'
      };

      const result = await articles.insert(normalData);
      expect(result.title).toBe('Test Article');
      expect(result.content).toBe('Normal content');
    });

    test('should handle oversized data gracefully', async () => {
      const oversizedData = { 
        id: 'art2-' + Date.now(),
        title: 'Test Article',
        content: 'Y'.repeat(1000)
      };

      const result = await articles.insert(oversizedData);
      expect(result.title).toBe('Test Article');
      expect(result.content.length).toBeLessThanOrEqual(oversizedData.content.length);
    });
  });

  describe('Body Overflow Behavior Tests', () => {
    test('should handle normal data without overflow', async () => {
      const normalData = { 
        id: 'doc1-' + Date.now(),
        title: 'Test Document',
        content: 'Normal content'
      };

      const result = await documents.insert(normalData);
      expect(result.title).toBe('Test Document');
      expect(result.content).toBe('Normal content');
    });

    test('should handle large data appropriately', async () => {
      const largeData = { 
        id: 'doc2-' + Date.now(),
        title: 'Test Document',
        content: 'W'.repeat(1000)
      };

      const result = await documents.insert(largeData);
      expect(result.title).toBe('Test Document');
      expect(result.content || result._overflow).toBeDefined();
    });
  });

  describe('Body Only Behavior Tests', () => {
    test('should store only body data', async () => {
      const testData = { 
        id: 'log1-' + Date.now(),
        message: 'Test log message',
        level: 'info'
      };

      const result = await logs.insert(testData);
      expect(result.id).toBe(testData.id);
      expect(result.message).toBe('Test log message');
    });

    test('should handle minimal metadata', async () => {
      const testData = { 
        id: 'log2-' + Date.now(),
        message: 'Another log message',
        level: 'error'
      };

      const result = await logs.insert(testData);
      const retrieved = await logs.get(result.id);
      
      expect(retrieved.message).toBe('Another log message');
      expect(retrieved.level).toBe('error');
    });
  });

  describe('Database Integration Tests', () => {
    test('should create resource with custom behavior', async () => {
      const resource = await database.createResource({
        name: 'custom_behavior_test_' + Date.now(),
        attributes: { name: 'string|required' },
        behavior: 'truncate-data'
      });

      expect(resource.behavior).toBe('truncate-data');
    });

    test('should use default behavior when not specified', async () => {
      const resource = await database.createResource({
        name: 'default_behavior_test_' + Date.now(),
        attributes: { name: 'string|required' }
      });

      expect(resource.behavior).toBe('user-managed');
    });

    test('should export behavior in resource definition', async () => {
      const resource = await database.createResource({
        name: 'export_test_' + Date.now(),
        attributes: { name: 'string|required' },
        behavior: 'enforce-limits'
      });

      const definition = resource.export();
      expect(definition.behavior).toBe('enforce-limits');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty data objects gracefully', async () => {
      const emptyData = { id: 'empty-' + Date.now() };
      
      await expect(users.insert(emptyData)).rejects.toThrow();
    });

    test('should handle null values appropriately', async () => {
      const dataWithNull = { 
        id: 'null-test-' + Date.now(),
        name: 'Test User',
        email: 'test@example.com',
        bio: null
      };

      const result = await users.insert(dataWithNull);
      expect(result.id).toBe(dataWithNull.id);
    });
  });
}); 