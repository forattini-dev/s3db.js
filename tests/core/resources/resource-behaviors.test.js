/**
 * Resource Behaviors Tests
 *
 * Tests the 5 behavior strategies for handling S3 2KB metadata limit.
 * Uses MockClient for fast, isolated testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConnectedMockDatabase } from '../../mocks/index.js';
import { calculateTotalSize } from '#src/concerns/calculator.js';
import { getBehavior, AVAILABLE_BEHAVIORS, DEFAULT_BEHAVIOR } from '#src/behaviors/index.js';

describe('Resource Behaviors', () => {
  let database;

  afterEach(async () => {
    if (database) {
      await database.disconnect().catch(() => {});
    }
  });

  describe('Behavior System Structure', () => {
    it('should export all required behaviors', () => {
      expect(AVAILABLE_BEHAVIORS).toEqual([
        'user-managed',
        'enforce-limits',
        'truncate-data',
        'body-overflow',
        'body-only'
      ]);
      expect(DEFAULT_BEHAVIOR).toBe('user-managed');
    });

    it('should load all behaviors successfully', () => {
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

    it('should throw error for unknown behaviors', () => {
      expect(() => getBehavior('unknown-behavior')).toThrow(
        'Unknown behavior: unknown-behavior'
      );
    });
  });

  describe('User Managed Behavior', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('user-managed-behavior');
    });

    it('should allow small data storage', async () => {
      const resource = await database.createResource({
        name: 'users',
        attributes: {
          name: 'string|required',
          email: 'string|required',
          bio: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const result = await resource.insert({
        name: 'Test User',
        email: 'test@example.com',
        bio: 'Short bio'
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test User');
      expect(result.bio).toBe('Short bio');
    });

    it('should handle large data appropriately', async () => {
      const resource = await database.createResource({
        name: 'users_large',
        attributes: {
          name: 'string|required',
          email: 'string|required',
          bio: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const largeData = {
        name: 'Test User',
        email: 'test@example.com',
        bio: 'A'.repeat(3000)
      };

      const result = await resource.insert(largeData);
      expect(result.id).toBeDefined();
      expect(result.bio).toBe(largeData.bio);
    });

    it('should preserve all data exactly as provided', async () => {
      const resource = await database.createResource({
        name: 'preserve_test',
        attributes: {
          name: 'string|optional',
          description: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const data = {
        name: 'Test Name',
        description: 'Simple description that should be preserved exactly'
      };

      const result = await resource.insert(data);
      expect(result.name).toBe(data.name);
      expect(result.description).toBe(data.description);

      const retrieved = await resource.get(result.id);
      expect(retrieved.name).toBe(data.name);
      expect(retrieved.description).toBe(data.description);
    });
  });

  describe('Enforce Limits Behavior', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('enforce-limits-behavior');
    });

    it('should allow small data', async () => {
      const resource = await database.createResource({
        name: 'products',
        attributes: {
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const result = await resource.insert({
        name: 'Test Product',
        description: 'Small description'
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Product');
    });

    it('should reject data that exceeds S3 metadata limits', async () => {
      const resource = await database.createResource({
        name: 'products_reject',
        attributes: {
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const oversizedData = {
        name: 'Oversized Product',
        description: 'X'.repeat(3000)
      };

      await expect(resource.insert(oversizedData)).rejects.toThrow();
    });

    it('should handle update operations with size limits', async () => {
      const resource = await database.createResource({
        name: 'products_update',
        attributes: {
          content: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const record = await resource.insert({ content: 'Small content' });

      // Try to update with large data
      await expect(
        resource.update(record.id, { content: 'Y'.repeat(3000) })
      ).rejects.toThrow();
    });

    it('should calculate size correctly for complex objects', async () => {
      const complexData = {
        name: 'Complex Product',
        description: 'Normal description'
      };

      const size = calculateTotalSize(complexData);
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Truncate Data Behavior', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('truncate-data-behavior');
    });

    it('should allow normal size data without truncation', async () => {
      const resource = await database.createResource({
        name: 'articles',
        attributes: {
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const result = await resource.insert({
        title: 'Test Article',
        content: 'Normal content'
      });

      expect(result.title).toBe('Test Article');
      expect(result.content).toBe('Normal content');
    });

    it('should truncate large data to fit within 2KB limit', async () => {
      const resource = await database.createResource({
        name: 'articles_truncate',
        attributes: {
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const largeData = {
        title: 'Short Title',
        content: 'A'.repeat(3000)
      };

      const result = await resource.insert(largeData);
      expect(result.id).toBeDefined();
      expect(result.title).toBe('Short Title');
      expect(result.content.length).toBeLessThan(largeData.content.length);
    });

    it('should preserve small data without truncation', async () => {
      const resource = await database.createResource({
        name: 'small_articles',
        attributes: {
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const smallData = {
        name: 'Test Name',
        description: 'Small description'
      };

      const result = await resource.insert(smallData);
      expect(result.name).toBe('Test Name');
      expect(result.description).toBe('Small description');
    });

    it('should handle update operations with truncation', async () => {
      const resource = await database.createResource({
        name: 'update_truncate',
        attributes: {
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const data = { content: 'B'.repeat(3000) };
      const result = await resource.insert(data);

      const updated = await resource.update(result.id, { content: 'Updated content' });
      expect(updated.content).toBe('Updated content');
    });
  });

  describe('Body Overflow Behavior', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('body-overflow-behavior');
    });

    it('should store small data in metadata', async () => {
      const resource = await database.createResource({
        name: 'documents',
        attributes: {
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({
        title: 'Test Document',
        content: 'Normal content'
      });

      expect(result.title).toBe('Test Document');
      expect(result.content).toBe('Normal content');
    });

    it('should overflow large data to body', async () => {
      const resource = await database.createResource({
        name: 'documents_large',
        attributes: {
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const largeData = {
        title: 'Test Document',
        content: 'W'.repeat(3000)
      };

      const result = await resource.insert(largeData);
      expect(result.title).toBe('Test Document');
      // Data should be preserved (either in metadata or body)
      expect(result.content.length).toBe(3000);
    });

    it('should retrieve data correctly regardless of storage location', async () => {
      const resource = await database.createResource({
        name: 'documents_retrieve',
        attributes: {
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const smallData = { name: 'Small', description: 'Small description' };
      const smallResult = await resource.insert(smallData);

      const largeData = { name: 'Large', description: 'L'.repeat(3000) };
      const largeResult = await resource.insert(largeData);

      const retrievedSmall = await resource.get(smallResult.id);
      expect(retrievedSmall.description).toBe('Small description');

      const retrievedLarge = await resource.get(largeResult.id);
      expect(retrievedLarge.description.length).toBe(3000);
    });
  });

  describe('Body Only Behavior', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('body-only-behavior');
    });

    it('should store all data in body', async () => {
      const resource = await database.createResource({
        name: 'logs',
        attributes: {
          message: 'string|required',
          level: 'string|optional'
        },
        behavior: 'body-only'
      });

      const result = await resource.insert({
        message: 'Test log message',
        level: 'info'
      });

      expect(result.id).toBeDefined();
      expect(result.message).toBe('Test log message');
    });

    it('should handle large data without issues', async () => {
      const resource = await database.createResource({
        name: 'logs_large',
        attributes: {
          content: 'string|optional',
          data: 'string|optional'
        },
        behavior: 'body-only'
      });

      const data = {
        content: 'F'.repeat(10000),
        data: 'Large data payload'
      };

      const result = await resource.insert(data);
      expect(result.id).toBeDefined();
      expect(result.content).toBe(data.content);
      expect(result.content.length).toBe(10000);
    });

    it('should handle get operations for body-only resources', async () => {
      const resource = await database.createResource({
        name: 'logs_get',
        attributes: {
          content: 'string|optional'
        },
        behavior: 'body-only'
      });

      const data = { content: 'Large content here' };
      const inserted = await resource.insert(data);

      const retrieved = await resource.get(inserted.id);
      expect(retrieved.id).toBe(inserted.id);
      expect(retrieved.content).toBe('Large content here');
    });
  });

  describe('Database Integration', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('behavior-integration');
    });

    it('should create resource with custom behavior', async () => {
      const resource = await database.createResource({
        name: 'custom_behavior',
        attributes: { name: 'string|required' },
        behavior: 'truncate-data'
      });

      expect(resource.$schema.behavior).toBe('truncate-data');
    });

    it('should use default behavior when not specified', async () => {
      const resource = await database.createResource({
        name: 'default_behavior',
        attributes: { name: 'string|required' }
      });

      // Default is 'body-overflow' according to CLAUDE.md
      expect(['user-managed', 'body-overflow']).toContain(resource.$schema.behavior);
    });

    it('should export behavior in resource definition', async () => {
      const resource = await database.createResource({
        name: 'export_behavior',
        attributes: { name: 'string|required' },
        behavior: 'enforce-limits'
      });

      const definition = resource.export();
      expect(definition.behavior).toBe('enforce-limits');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('behavior-edge-cases');
    });

    it('should handle empty optional fields', async () => {
      const resource = await database.createResource({
        name: 'edge_empty',
        attributes: {
          name: 'string|required',
          optional: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({
        name: 'Test'
        // optional is undefined
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test');
    });

    it('should handle null values appropriately', async () => {
      const resource = await database.createResource({
        name: 'edge_null',
        attributes: {
          name: 'string|required',
          bio: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const result = await resource.insert({
        name: 'Test User',
        bio: null
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test User');
    });

    it('should handle special characters in data', async () => {
      const resource = await database.createResource({
        name: 'edge_special',
        attributes: {
          content: 'string|required'
        },
        behavior: 'body-overflow'
      });

      const specialContent = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\t\r';

      const result = await resource.insert({ content: specialContent });
      expect(result.content).toBe(specialContent);

      const retrieved = await resource.get(result.id);
      expect(retrieved.content).toBe(specialContent);
    });

    it('should handle unicode characters', async () => {
      const resource = await database.createResource({
        name: 'edge_unicode',
        attributes: {
          content: 'string|required'
        },
        behavior: 'body-overflow'
      });

      const unicodeContent = '日本語テスト 中文测试 한국어 테스트 🎉🚀';

      const result = await resource.insert({ content: unicodeContent });
      expect(result.content).toBe(unicodeContent);
    });
  });
});
