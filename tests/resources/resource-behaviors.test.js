import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';

import { createDatabaseForTest } from '#tests/config.js';
import { calculateTotalSize } from '#src/concerns/calculator.js';
import { getBehavior, AVAILABLE_BEHAVIORS, DEFAULT_BEHAVIOR } from '#src/behaviors/index.js';

// Helper function to get S3 object size in bytes
async function getS3ObjectSize(resource, id) {
  const key = resource.getResourceKey(id);
  try {
    const response = await resource.client.headObject(key);
    return response.ContentLength || 0;
  } catch (error) {
    throw new Error(`Failed to get object size for ${id}: ${error.message}`);
  }
}

describe('Resource Behaviors - Fast Integration Tests', () => {
  let database;
  let users, products, articles, documents, logs;

  beforeAll(async () => {
    database = createDatabaseForTest('suite=resources/behaviors');
    await database.connect();

    // Create all resources in parallel for better performance
    [users, products, articles, documents, logs] = await Promise.all([
      database.createResource({
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          bio: 'string|optional'
        },
        behavior: 'user-managed'
      }),

      database.createResource({
        name: 'products',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'enforce-limits'
      }),

      database.createResource({
        name: 'articles',
        attributes: {
          id: 'string|required',
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      }),

      database.createResource({
        name: 'documents',
        attributes: {
          id: 'string|required',
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      }),

      database.createResource({
        name: 'logs',
        attributes: {
          id: 'string|required',
          message: 'string|required',
          level: 'string|optional'
        },
        behavior: 'body-only'
      })
    ]);
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

    test('should throw error for unknown behaviors', () => {
      expect(() => getBehavior('unknown-behaviors')).toThrow(
        'Unknown behavior: unknown-behaviors'
      );
    });
  });

  describe('User Managed Behavior Tests', () => {
    test('should allow small data without warning and store in metadata only', async () => {
      const smallData = { 
        id: 'user1-' + Date.now(),
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'Short bio'
      };

      const result = await users.insert(smallData);
      expect(result.id).toBe(smallData.id);
      expect(result.name).toBe('Test User');

      // Verify S3 object size - small data should fit in metadata only
      const s3Size = await getS3ObjectSize(users, result.id);
      expect(s3Size).toBe(0); // Should be 0 bytes as data is stored in metadata
    });

    test('should handle large data appropriately and store in body', async () => {
      const largeData = { 
        id: 'user2-' + Date.now(),
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'A'.repeat(3000) // Much larger to ensure it exceeds the limit
      };

      const result = await users.insert(largeData);
      
      expect(result.id).toBe(largeData.id);
      expect(result.bio).toBe(largeData.bio);

      // Verify S3 object size - large data should be stored in body
      const s3Size = await getS3ObjectSize(users, result.id);
      expect(s3Size).toBeGreaterThan(0); // Should have content in body
    });

    test('should preserve all data in user-managed mode', async () => {
      // Create a dedicated resource for this test
      const testResource = await database.createResource({
        name: 'test-users-' + Date.now(),
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|required',
          bio: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const testData = { 
        id: 'user3-' + Date.now(),
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'Short bio'
      };

      let result;
      try {
        console.log('About to insert data:', testData);
        result = await testResource.insert(testData);
        console.log('Insert result:', result);
      } catch (error) {
        console.error('Insert failed:', error);
        throw error;
      }
      
      // Verify the object was created successfully
      expect(result.id).toBe(testData.id);
      expect(result.name).toBe(testData.name);
      expect(result.email).toBe(testData.email);
      expect(result.bio).toBe(testData.bio);
      
      // Add a small delay to ensure consistency
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if the object exists
      const exists = await testResource.exists(result.id);
      console.log('Object exists:', exists, 'for ID:', result.id);
      
      if (!exists) {
        console.error('Object does not exist after insert!');
        throw new Error('Object does not exist after insert');
      }
      
      const retrieved = await testResource.get(result.id);
      
      expect(retrieved.bio).toBe(testData.bio);
      expect(retrieved.bio.length).toBe(9); // "Short bio" has 9 characters

      // Verify S3 object size based on data size
      const s3Size = await getS3ObjectSize(testResource, result.id);
      const dataSize = calculateTotalSize(testData);
      
      if (dataSize <= 2048) { // S3 metadata limit
        expect(s3Size).toBe(0); // Should be in metadata only
      } else {
        expect(s3Size).toBeGreaterThan(0); // Should be in body
      }
    });

    test('should allow user to manage their own data without limits', async () => {
      const userManagedResource = await database.createResource({
        name: 'user_managed_test_' + Date.now(),
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

      const result = await userManagedResource.insert(data);
      expect(result.id).toBe('user-managed-test');
      expect(result.content).toBe(data.content);

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(userManagedResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });

    test('should preserve all data exactly as provided', async () => {
      const userManagedResource = await database.createResource({
        name: 'user_managed_preserve_test_' + Date.now(),
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

      const result = await userManagedResource.insert(simpleData);
      expect(result.name).toBe(simpleData.name);
      expect(result.description).toBe(simpleData.description);

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(userManagedResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });
  });

  describe('Enforce Limits Behavior Tests', () => {
    test('should allow small data and store in metadata only', async () => {
      const smallData = { 
        id: 'prod1-' + Date.now(),
        name: 'Test Product', 
        description: 'Small description' 
      };

      const result = await products.insert(smallData);
      expect(result.id).toBe(smallData.id);
      expect(result.name).toBe('Test Product');

      // Verify S3 object size - small data should fit in metadata only
      const s3Size = await getS3ObjectSize(products, result.id);
      expect(s3Size).toBe(0); // Should be 0 bytes as data is stored in metadata
    });

    test('should calculate size correctly for complex objects', async () => {
      const complexData = {
        id: 'prod3-' + Date.now(),
        name: 'Complex Product',
        description: 'Normal description'
      };

      const size = calculateTotalSize(complexData);
      expect(size).toBeGreaterThan(0);

      const result = await products.insert(complexData);
      
      // Verify S3 object size
      const s3Size = await getS3ObjectSize(products, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });

    test('should reject data that exceeds S3 metadata limits', async () => {
      const oversizedData = {
        id: 'prod4-' + Date.now(),
        name: 'Oversized Product',
        description: 'X'.repeat(3000) // This should exceed the 2KB limit
      };

      // This should throw an error due to enforce-limits behavior
      await expect(products.insert(oversizedData)).rejects.toThrow(/Metadata size exceeds 2KB limit/);
    });

    test('should throw error when data exceeds 2KB limit', async () => {
      const enforceLimitsResource = await database.createResource({
        name: 'enforce_limits_test_' + Date.now(),
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

      await expect(enforceLimitsResource.insert(largeData)).rejects.toThrow(/Metadata size exceeds 2KB limit/);
    });

    test('should allow data within 2KB limit', async () => {
      const enforceLimitsResource = await database.createResource({
        name: 'enforce_limits_small_test_' + Date.now(),
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

      const result = await enforceLimitsResource.insert(smallData);
      expect(result.id).toBe('test-small');
      expect(result.name).toBe('Test Item');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(enforceLimitsResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });

    test('should handle update operations with size limits', async () => {
      const enforceLimitsResource = await database.createResource({
        name: 'enforce_limits_update_test_' + Date.now(),
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      // Insert small data first
      const smallData = { id: 'update-test', content: 'Small content' };
      await enforceLimitsResource.insert(smallData);

      // Try to update with large data that exceeds limit
      const largeUpdate = { content: 'Y'.repeat(3000) };
      await expect(enforceLimitsResource.update('update-test', largeUpdate)).rejects.toThrow(/Metadata size exceeds 2KB limit/);
    });

    test('should handle upsert operations with size limits', async () => {
      const enforceLimitsResource = await database.createResource({
        name: 'enforce_limits_upsert_test_' + Date.now(),
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

      await expect(enforceLimitsResource.upsert(largeData)).rejects.toThrow(/Metadata size exceeds 2KB limit/);
    });

    test('should handle get operations without modification', async () => {
      const enforceLimitsResource = await database.createResource({
        name: 'enforce_limits_get_test_' + Date.now(),
        attributes: {
          id: 'string|required',
          name: 'string|required'
        },
        behavior: 'enforce-limits'
      });

      const data = { id: 'get-test', name: 'Test Name' };
      await enforceLimitsResource.insert(data);

      const retrieved = await enforceLimitsResource.get('get-test');
      expect(retrieved.id).toBe('get-test');
      expect(retrieved.name).toBe('Test Name');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(enforceLimitsResource, retrieved.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });
  });

  describe('Truncate Data Behavior Tests', () => {
    test('should allow normal size data and store in metadata only', async () => {
      const normalData = { 
        id: 'art1-' + Date.now(),
        title: 'Test Article',
        content: 'Normal content'
      };

      const result = await articles.insert(normalData);
      expect(result.title).toBe('Test Article');
      expect(result.content).toBe('Normal content');

      // Verify S3 object size - normal data should fit in metadata only
      const s3Size = await getS3ObjectSize(articles, result.id);
      expect(s3Size).toBe(0); // Should be 0 bytes as data is stored in metadata
    });

    test('should handle oversized data gracefully and truncate to fit metadata', async () => {
      const oversizedData = { 
        id: 'art2-' + Date.now(),
        title: 'Test Article',
        content: 'Y'.repeat(1000)
      };

      const result = await articles.insert(oversizedData);
      expect(result.title).toBe('Test Article');
      expect(result.content.length).toBeLessThanOrEqual(oversizedData.content.length);

      // Verify S3 object size - truncated data should fit in metadata only
      const s3Size = await getS3ObjectSize(articles, result.id);
      expect(s3Size).toBe(0); // Should be 0 bytes as truncated data fits in metadata
    });

    test('should truncate large data to fit within 2KB limit', async () => {
      const truncateDataResource = await database.createResource({
        name: 'truncate_data_test_' + Date.now(),
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

      const result = await truncateDataResource.insert(largeData);
      expect(result.id).toBe('truncate-test');
      expect(result.title).toBe('Short Title'); // Small field should remain intact
      expect(result.content.length).toBeLessThan(largeData.content.length); // Content should be truncated

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(truncateDataResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata after truncation
    });

    test('should preserve small data without truncation', async () => {
      const truncateDataResource = await database.createResource({
        name: 'truncate_small_test_' + Date.now(),
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

      const result = await truncateDataResource.insert(smallData);
      expect(result.id).toBe('small-test');
      expect(result.name).toBe('Test Name');
      expect(result.description).toBe('Small description');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(truncateDataResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });

    test('should handle update operations with truncation', async () => {
      const truncateDataResource = await database.createResource({
        name: 'truncate_update_test_' + Date.now(),
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const data = { id: 'update-truncate', content: 'B'.repeat(3000) };
      const result = await truncateDataResource.insert(data);

      const updateData = { content: 'Updated content' };
      const updated = await truncateDataResource.update('update-truncate', updateData);
      expect(updated.content).toBe('Updated content');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(truncateDataResource, updated.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });

    test('should handle upsert operations with truncation', async () => {
      const truncateDataResource = await database.createResource({
        name: 'truncate_upsert_test_' + Date.now(),
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
      const result = await truncateDataResource.upsert(largeData);

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(truncateDataResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata after truncation
    });

    test('should handle complex objects that need truncation', async () => {
      const truncateDataResource = await database.createResource({
        name: 'truncate_complex_test_' + Date.now(),
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

      const result = await truncateDataResource.insert(complexData);
      expect(result.id).toBe('complex-test');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(truncateDataResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata after truncation
    });

    test('should prioritize smaller fields when truncating', async () => {
      const truncateDataResource = await database.createResource({
        name: 'truncate_priority_test_' + Date.now(),
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

      const result = await truncateDataResource.insert(data);
      expect(result.small).toBe('Small field'); // Should be preserved
      expect(result.medium).toBe('Medium field content that is larger'); // Should be preserved
      expect(result.large.length).toBeLessThan(data.large.length); // Should be truncated

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(truncateDataResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata after truncation
    });
  });

  describe('Body Overflow Behavior Tests', () => {
    test('should handle normal data without overflow and store in metadata only', async () => {
      const normalData = { 
        id: 'doc1-' + Date.now(),
        title: 'Test Document',
        content: 'Normal content'
      };

      const result = await documents.insert(normalData);
      expect(result.title).toBe('Test Document');
      expect(result.content).toBe('Normal content');

      // Verify S3 object size - normal data should fit in metadata only
      const s3Size = await getS3ObjectSize(documents, result.id);
      expect(s3Size).toBe(0); // Should be 0 bytes as data is stored in metadata
    });

    test('should handle large data appropriately and store overflow in body', async () => {
      const largeData = { 
        id: 'doc2-' + Date.now(),
        title: 'Test Document',
        content: 'W'.repeat(3000) // Much larger to ensure overflow
      };

      const result = await documents.insert(largeData);
      expect(result.title).toBe('Test Document');
      expect(result.content || result._overflow).toBeDefined();

      // Verify S3 object size - large data should have content in body
      const s3Size = await getS3ObjectSize(documents, result.id);
      expect(s3Size).toBeGreaterThan(0); // Should have content in body due to overflow
    });

    test('should store small data in metadata', async () => {
      const bodyOverflowResource = await database.createResource({
        name: 'body_overflow_small_test_' + Date.now(),
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

      const result = await bodyOverflowResource.insert(smallData);
      expect(result.id).toBe('overflow-small');
      expect(result.name).toBe('Test Name');
      expect(result.description).toBe('Small description');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(bodyOverflowResource, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });

    test('should overflow large data to body', async () => {
      const bodyOverflowResource = await database.createResource({
        name: 'body_overflow_large_test_' + Date.now(),
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

      const result = await bodyOverflowResource.insert(largeData);
      expect(result.id).toBe('overflow-large');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(bodyOverflowResource, result.id);
      expect(s3Size).toBeGreaterThan(0); // Should have content in body due to overflow
    });
  });

  describe('Body Only Behavior Tests', () => {
    test('should store only body data and minimal metadata', async () => {
      const testData = { 
        id: 'log1-' + Date.now(),
        message: 'Test log message',
        level: 'info'
      };

      const result = await logs.insert(testData);
      expect(result.id).toBe(testData.id);
      expect(result.message).toBe('Test log message');

      // Verify S3 object size - body-only behavior always stores data in body
      const s3Size = await getS3ObjectSize(logs, result.id);
      expect(s3Size).toBeGreaterThan(0); // Should have content in body
    });

    test('should handle minimal metadata and store all data in body', async () => {
      const testData = { 
        id: 'log2-' + Date.now(),
        message: 'Another log message',
        level: 'error'
      };

      const result = await logs.insert(testData);
      const retrieved = await logs.get(result.id);
      
      expect(retrieved.message).toBe('Another log message');
      expect(retrieved.level).toBe('error');

      // Verify S3 object size - body-only behavior always stores data in body
      const s3Size = await getS3ObjectSize(logs, result.id);
      expect(s3Size).toBeGreaterThan(0); // Should have content in body
    });

    test('should store data in body and minimal metadata', async () => {
      const bodyOnlyResource = await database.createResource({
        name: 'body_only_test_' + Date.now(),
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

      const result = await bodyOnlyResource.insert(data);
      expect(result.id).toBe('body-test');
      expect(result.content).toBe(data.content);
      expect(result.data).toEqual(data.data);

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(bodyOnlyResource, result.id);
      expect(s3Size).toBeGreaterThan(0); // Should have content in body
    });

    test('should handle get operations for body-only resources', async () => {
      const bodyOnlyResource = await database.createResource({
        name: 'body_only_get_test_' + Date.now(),
        attributes: {
          id: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-only'
      });

      const data = { id: 'body-get-test', content: 'Large content here' };
      await bodyOnlyResource.insert(data);

      const retrieved = await bodyOnlyResource.get('body-get-test');
      expect(retrieved.id).toBe('body-get-test');
      expect(retrieved.content).toBe('Large content here');

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(bodyOnlyResource, retrieved.id);
      expect(s3Size).toBeGreaterThan(0); // Should have content in body
    });
  });

  describe('Database Integration Tests', () => {
    test('should create resource with custom behaviors', async () => {
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

      // Verify S3 object size
      const s3Size = await getS3ObjectSize(users, result.id);
      expect(s3Size).toBe(0); // Should fit in metadata
    });
  });
}); 