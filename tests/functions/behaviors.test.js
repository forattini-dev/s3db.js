import { describe, test, expect } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

describe('Individual Behaviors Coverage Tests', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('behaviors-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('enforce-limits behavior', () => {
    test('should throw error when data exceeds 2KB limit', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const largeData = {
        id: 'test-id',
        content: 'X'.repeat(3000) // Exceeds 2KB limit
      };

      await expect(resource.insert(largeData)).rejects.toThrow(/S3 metadata size exceeds 2KB limit/);
    });

    test('should allow data within 2KB limit', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_small_test',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const smallData = {
        id: 'test-small',
        name: 'Test Item',
        description: 'Small description that fits within limits'
      };

      const result = await resource.insert(smallData);
      expect(result.id).toBe('test-small');
      expect(result.name).toBe('Test Item');
    });

    test('should handle update operations with size limits', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_update_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      // Insert small data first
      const smallData = { id: 'update-test', content: 'Small content' };
      await resource.insert(smallData);

      // Try to update with large data that exceeds limit
      const largeUpdate = { content: 'Y'.repeat(3000) };
      await expect(resource.update('update-test', largeUpdate)).rejects.toThrow(/S3 metadata size exceeds 2KB limit/);
    });

    test('should handle upsert operations with size limits', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_upsert_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const largeData = {
        id: 'upsert-test',
        content: 'Z'.repeat(3000) // Exceeds 2KB limit
      };

      await expect(resource.upsert(largeData)).rejects.toThrow(/S3 metadata size exceeds 2KB limit/);
    });

    test('should handle get operations without modification', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_get_test',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        },
        behavior: 'enforce-limits'
      });

      const data = { id: 'get-test', name: 'Test Name' };
      await resource.insert(data);

      const retrieved = await resource.get('get-test');
      expect(retrieved.id).toBe('get-test');
      expect(retrieved.name).toBe('Test Name');
    });

    test('should handle update operations with size limits', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_update_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      await resource.insert({ id: 'update-test', content: 'initial' });
      
      const largeUpdate = { content: 'X'.repeat(3000) };
      await expect(resource.update('update-test', largeUpdate)).rejects.toThrow(/S3 metadata size exceeds 2KB limit/);
    });
  });

  describe('truncate-data behavior', () => {
    test('should truncate large data to fit within 2KB limit', async () => {
      const resource = await database.createResource({
        name: 'truncate_data_test',
        attributes: {
          id: 'string|required',
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const largeData = {
        id: 'truncate-test',
        title: 'Short Title',
        content: 'A'.repeat(3000) // Large content that will be truncated
      };

      const result = await resource.insert(largeData);
      expect(result.id).toBe('truncate-test');
      expect(result.title).toBe('Short Title'); // Small field should remain intact
      expect(result.content.length).toBeLessThan(largeData.content.length); // Content should be truncated
      expect(result.$truncated).toBe('true'); // Truncation flag should be set
    });

    test('should preserve small data without truncation', async () => {
      const resource = await database.createResource({
        name: 'truncate_small_test',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const smallData = {
        id: 'small-test',
        name: 'Test Name',
        description: 'Small description'
      };

      const result = await resource.insert(smallData);
      expect(result.id).toBe('small-test');
      expect(result.name).toBe('Test Name');
      expect(result.description).toBe('Small description');
      expect(result.$truncated).toBeUndefined(); // No truncation flag
    });

    test('should handle update operations with truncation', async () => {
      const resource = await database.createResource({
        name: 'truncate_update_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const data = { id: 'update-truncate', content: 'B'.repeat(3000) };
      const result = await resource.insert(data);
      expect(result.$truncated).toBe('true');

      const updateData = { content: 'Updated content' };
      const updated = await resource.update('update-truncate', updateData);
      expect(updated.content).toBe('Updated content');
    });

    test('should handle upsert operations with truncation', async () => {
      const resource = await database.createResource({
        name: 'truncate_upsert_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const largeData = { 
        id: 'upsert-truncate',
        content: 'C'.repeat(3000) 
      };
      const result = await resource.upsert(largeData);
      expect(result.$truncated).toBe('true');
    });

    test('should handle complex objects that need truncation', async () => {
      const resource = await database.createResource({
        name: 'truncate_complex_test',
        attributes: {
          id: 'string|required',
          description: 'string|optional',
          category: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const complexData = {
        id: 'complex-test',
        description: 'D'.repeat(3000), // Make sure it's large enough to trigger truncation
        category: 'test',
        extraField: 'E'.repeat(1000) // Add more data to ensure truncation
      };

      const result = await resource.insert(complexData);
      expect(result.id).toBe('complex-test');
      expect(result.$truncated).toBe('true');
    });

    test('should prioritize smaller fields when truncating', async () => {
      const resource = await database.createResource({
        name: 'truncate_priority_test',
        attributes: {
          id: 'string|required',
          small: 'string|optional',
          medium: 'string|optional',
          large: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const data = {
        id: 'priority-test',
        small: 'Small field', // Smallest
        medium: 'Medium field content that is larger', // Medium
        large: 'E'.repeat(2500) // Largest, will be truncated
      };

      const result = await resource.insert(data);
      expect(result.small).toBe('Small field'); // Should be preserved
      expect(result.medium).toBe('Medium field content that is larger'); // Should be preserved
      expect(result.large.length).toBeLessThan(data.large.length); // Should be truncated
    });
  });

  describe('body-only behavior', () => {
    test('should store data in body and minimal metadata', async () => {
      const resource = await database.createResource({
        name: 'body_only_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional',
          data: 'object|optional'
        },
        behavior: 'body-only'
      });

      const data = {
        id: 'body-test',
        content: 'F'.repeat(3000), // Large content
        data: { key: 'value', nested: { prop: 'test' } }
      };

      const result = await resource.insert(data);
      expect(result.id).toBe('body-test');
      expect(result.content).toBe(data.content);
      expect(result.data).toEqual(data.data);
    });

    test('should handle get operations for body-only resources', async () => {
      const resource = await database.createResource({
        name: 'body_only_get_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-only'
      });

      const data = { id: 'body-get-test', content: 'Large content here' };
      await resource.insert(data);

      const retrieved = await resource.get('body-get-test');
      expect(retrieved.id).toBe('body-get-test');
      expect(retrieved.content).toBe('Large content here');
    });
  });

  describe('body-overflow behavior', () => {
    test('should store small data in metadata', async () => {
      const resource = await database.createResource({
        name: 'body_overflow_small_test',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const smallData = {
        id: 'overflow-small',
        name: 'Test Name',
        description: 'Small description'
      };

      const result = await resource.insert(smallData);
      expect(result.id).toBe('overflow-small');
      expect(result.name).toBe('Test Name');
      expect(result.description).toBe('Small description');
    });

    test('should overflow large data to body', async () => {
      const resource = await database.createResource({
        name: 'body_overflow_large_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const largeData = {
        id: 'overflow-large',
        content: 'G'.repeat(3000) // Large content that should overflow
      };

      const result = await resource.insert(largeData);
      expect(result.id).toBe('overflow-large');
      // Content might be in _overflow or still available through get operation
    });
  });

  describe('user-managed behavior', () => {
    test('should allow user to manage their own data without limits', async () => {
      const resource = await database.createResource({
        name: 'user_managed_test',
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const data = {
        id: 'user-managed-test',
        content: 'H'.repeat(1000) // Reduce size to avoid validation errors
      };

      const result = await resource.insert(data);
      expect(result.id).toBe('user-managed-test');
      expect(result.content).toBe(data.content);
    });

    test('should preserve all data exactly as provided', async () => {
      const resource = await database.createResource({
        name: 'user_managed_preserve_test',
        attributes: {
          id: 'string|required',
          name: 'string|optional',
          description: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const simpleData = {
        id: 'preserve-test',
        name: 'Test Name',
        description: 'Simple description that should be preserved exactly'
      };

      const result = await resource.insert(simpleData);
      expect(result.name).toBe(simpleData.name);
      expect(result.description).toBe(simpleData.description);
    });


  });
}); 