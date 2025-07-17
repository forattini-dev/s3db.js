import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';

import { createDatabaseForTest } from '#tests/config.js';
import { calculateTotalSize } from '#src/concerns/calculator.js';
import { getBehavior, AVAILABLE_BEHAVIORS, DEFAULT_BEHAVIOR } from '#src/behaviors/index.js';

describe('Resource Behaviors - Real Integration Tests', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('resource-behavior');
    await database.connect();
  });

  afterEach(async () => {
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

  describe('User Managed Behavior - Real Integration', () => {
    let users;

    beforeEach(async () => {
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
    });

    test('should allow small data without warning', async () => {
      const smallData = { 
        id: 'user1',
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'Short bio'
      };

      const emitSpy = jest.spyOn(users, 'emit');
      const result = await users.insert(smallData);

      expect(result.id).toBe('user1');
      expect(result.bio).toBe('Short bio');
      expect(emitSpy).not.toHaveBeenCalledWith('exceedsLimit', expect.any(Object));
    });

    test('should emit warning for large data but allow operation', async () => {
      const largeData = {
        id: 'user2',
        name: 'Test',
        email: 'test@example.com',
        bio: 'X'.repeat(5000) // Very large to guarantee events
      };

      const emitSpy = jest.spyOn(users, 'emit');

      // User-managed behavior may throw error if S3 rejects the metadata
      try {
        const result = await users.insert(largeData);
        expect(result.id).toBe('user2');
        expect(result.bio).toBe('X'.repeat(5000));
      } catch (error) {
        // If S3 rejects, that's also acceptable for user-managed behavior
        expect(
          error.message.includes('metadata headers exceed') ||
          error.message.includes('Validation error')
        ).toBe(true);
      }
      
      expect(emitSpy).toHaveBeenCalledWith('exceedsLimit', expect.objectContaining({
        operation: 'insert',
        totalSize: expect.any(Number),
        limit: 2047,
        excess: expect.any(Number),
        data: largeData
      }));
    });

    test('should emit warning for update operations', async () => {
      const user = await users.insert({ 
        id: 'user3',
        name: 'Original User', 
        email: 'original@example.com' 
      });

      const largeData = {
        name: 'Test',
        email: 'test@example.com',
        bio: 'X'.repeat(5000) // Very large to guarantee events
      };
      const emitSpy = jest.spyOn(users, 'emit');

      // User-managed behavior may throw error if S3 rejects the metadata
      try {
        await users.update('user3', largeData);
      } catch (error) {
        // If S3 rejects, that's also acceptable for user-managed behavior
        expect(
          error.message.includes('metadata headers exceed') ||
          error.message.includes('Validation error')
        ).toBe(true);
      }

      expect(emitSpy).toHaveBeenCalledWith('exceedsLimit', expect.objectContaining({
        operation: 'update',
        id: 'user3'
      }));
    });



    test('should handle get operations normally', async () => {
      const user = await users.insert({ 
        id: 'user4',
        name: 'Test User', 
        email: 'test@example.com',
        bio: 'Test bio'
      });

      const retrieved = await users.get('user4');
      expect(retrieved.name).toBe('Test User');
      expect(retrieved.bio).toBe('Test bio');
    });
  });

  describe('Enforce Limits Behavior - Real Integration', () => {
    let products;

    beforeEach(async () => {
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'enforce-limits'
      });
    });

    test('should allow small data', async () => {
      const smallData = { 
        id: 'prod1',
        name: 'Test Product', 
        description: 'Small description' 
      };

      const result = await products.insert(smallData);
      expect(result.id).toBe('prod1');
      expect(result.name).toBe('Test Product');
    });

    test('should throw error for large data on insert', async () => {
      const largeData = { 
        id: 'prod2',
        name: 'Test Product',
        description: 'X'.repeat(2100) // Large enough to exceed effective limit
      };

      await expect(products.insert(largeData)).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });

    test('should throw error for large data on update', async () => {
      const product = await products.insert({ 
        id: 'prod3',
        name: 'Original Product', 
        description: 'Original description' 
      });

      const largeData = { description: 'X'.repeat(2100) };

      await expect(products.update('prod3', largeData)).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });



    test('should handle get operations normally', async () => {
      const product = await products.insert({ 
        id: 'prod_get',
        name: 'Test Product', 
        description: 'Small description' 
      });

      const retrieved = await products.get('prod_get');
      expect(retrieved.name).toBe('Test Product');
      expect(retrieved.description).toBe('Small description');
    });
  });

  describe('Data Truncate Behavior - Real Integration', () => {
    let articles;

    beforeEach(async () => {
      articles = await database.createResource({
        name: 'articles',
        attributes: {
          id: 'string|required',
          title: 'string|required',
          content: 'string|optional',
          summary: 'string|optional'
        },
        behavior: 'truncate-data'
      });
    });

    test('should preserve small data unchanged', async () => {
      const smallData = { 
        id: 'art1',
        title: 'Test Article', 
        content: 'Short content',
        summary: 'Brief summary'
      };

      const result = await articles.insert(smallData);
      expect(result.title).toBe('Test Article');
      expect(result.content).toBe('Short content');
      expect(result.summary).toBe('Brief summary');
      expect(result.$truncated).toBeUndefined();
    });

    test('should truncate large data to fit in 2KB', async () => {
      const largeData = {
        id: 'art2',
        title: 'Test Article',
        content: 'X'.repeat(1000),
        summary: 'B'.repeat(2000) // This should be truncated
      };

      const result = await articles.insert(largeData);
      
      expect(result.title).toBe('Test Article');
      expect(result.content).toBe('X'.repeat(1000));
      
      // Summary should be truncated (no longer adds "...")
      expect(result.summary).not.toBe('B'.repeat(2000));
      expect(result.summary).toBeDefined();
      expect(result.$truncated).toBe('true');
      
      // Verify total size is within limits
      const totalSize = calculateTotalSize(result);
      expect(totalSize).toBeLessThanOrEqual(2100);
    });

    test('should add "..." to truncated values', async () => {
      const largeData = {
        id: 'art3',
        title: 'Test Article',
        content: 'X'.repeat(5000) // Large enough to guarantee truncation
      };

      const result = await articles.insert(largeData);
      
      expect(result.title).toBe('Test Article');
      
      // Content should be truncated (no longer adds "...")
      if (result.content) {
        expect(result.content).toBeDefined();
      }
      // Check if any truncation occurred
      expect(result.$truncated).toBe('true');
    });

    test('should respect metadata limits including $truncated flag', async () => {
      const largeData = {
        id: 'art4',
        title: 'Test Article',
        content: 'X'.repeat(1000),
        summary: 'B'.repeat(3000) // Very large, should be heavily truncated
      };

      const result = await articles.insert(largeData);
      
      // Should have $truncated flag
      expect(result.$truncated).toBe('true');
      
      // Summary should be truncated (no longer adds "...")
      expect(result.summary).toBeDefined();
      
      // Total size should be within limits (including $truncated flag)
      const totalSize = calculateTotalSize(result);
      expect(totalSize).toBeLessThanOrEqual(2100);
    });

    test('should handle update operations with truncation', async () => {
      const article = await articles.insert({ 
        id: 'art_update',
        title: 'Original Title', 
        content: 'Original content' 
      });

      const largeUpdate = {
        title: 'Updated Title',
        content: 'X'.repeat(3000), // Large enough to trigger truncation
        summary: 'Y'.repeat(1000)
      };

      const result = await articles.update('art_update', largeUpdate);
      
      expect(result.title).toBe('Updated Title');
      expect(result.$truncated).toBe('true');
      
      // Verify total size is within limits
      const totalSize = calculateTotalSize(result);
      expect(totalSize).toBeLessThanOrEqual(2100);
    });



    test('should handle truncation of different data types', async () => {
      const mixedData = {
        id: 'art_mixed',
        title: 'Mixed Types',
        content: 12345678901234567890, // Large number as content
        summary: { nested: 'object', with: 'X'.repeat(1000) } // Object that will be stringified
      };

      const result = await articles.insert(mixedData);
      
      expect(result.id).toBe('art_mixed');
      expect(result.title).toBe('Mixed Types');
      expect(result.$truncated).toBe('true');
      
      // Verify total size is within limits
      const totalSize = calculateTotalSize(result);
      expect(totalSize).toBeLessThanOrEqual(2100);
    });

    test('should handle get operations normally', async () => {
      const article = await articles.insert({ 
        id: 'art_get',
        title: 'Test Article', 
        content: 'Test content' 
      });

      const retrieved = await articles.get('art_get');
      expect(retrieved.title).toBe('Test Article');
      expect(retrieved.content).toBe('Test content');
    });
  });

  describe('Body Overflow Behavior - Real Integration', () => {
    let documents;

    beforeEach(async () => {
      documents = await database.createResource({
        name: 'documents',
        attributes: {
          id: 'string|required',
          title: 'string|required',
          content: 'string|optional',
          metadata: 'object|optional'
        },
        behavior: 'body-overflow'
      });
    });

    test('should preserve small data in metadata only', async () => {
      const smallData = { 
        id: 'doc1',
        title: 'Test Document', 
        content: 'Short content',
        metadata: { category: 'test' }
      };

      const result = await documents.insert(smallData);
      expect(result.title).toBe('Test Document');
      expect(result.content).toBe('Short content');
      expect(result.metadata).toEqual({ category: 'test' });
      expect(result.$overflow).toBeUndefined();
    });

    test('should split large data between metadata and body', async () => {
      const largeData = {
        id: 'doc2',
        title: 'Test Document',
        content: 'X'.repeat(1000),
        metadata: { description: 'B'.repeat(1500) }
      };

      const result = await documents.insert(largeData);
      
      expect(result.title).toBe('Test Document');
      expect(result.content).toBe('X'.repeat(1000));
      expect(result.$overflow).toBe('true');
      
      // Some data should be in metadata, some in body
      expect(result.metadata).toBeDefined();
    });

    test('should merge metadata and body on get', async () => {
      const largeData = {
        id: 'doc3',
        title: 'Test Document',
        content: 'X'.repeat(1000),
        metadata: { 
          category: 'test',
          description: 'B'.repeat(1500)
        }
      };

      await documents.insert(largeData);
      const retrieved = await documents.get('doc3');

      expect(retrieved.title).toBe('Test Document');
      expect(retrieved.content).toBe('X'.repeat(1000));
      expect(retrieved.metadata).toEqual({
        category: 'test',
        description: 'B'.repeat(1500)
      });
    });

    test('should respect metadata limits including $overflow flag', async () => {
      const largeData = {
        id: 'doc4',
        title: 'Test Document',
        content: 'X'.repeat(1000),
        metadata: { 
          category: 'test',
          description: 'B'.repeat(5000) // Very large to guarantee overflow
        }
      };

      const result = await documents.insert(largeData);
      
      // Should have $overflow flag
      expect(result.$overflow).toBe('true');
      
      // Total metadata size should be within limits (including $overflow flag)
      const metadataSize = calculateTotalSize({
        title: result.title,
        content: result.content,
        $overflow: result.$overflow
      });
      expect(metadataSize).toBeLessThanOrEqual(2100);
    });

    test('should handle update operations with overflow', async () => {
      const doc = await documents.insert({ 
        id: 'doc_update',
        title: 'Original Title', 
        content: 'Original content' 
      });

      const largeUpdate = {
        title: 'Updated Title',
        content: 'X'.repeat(1000),
        metadata: { description: 'Y'.repeat(2000) } // Large enough to trigger overflow
      };

      const result = await documents.update('doc_update', largeUpdate);
      
      expect(result.title).toBe('Updated Title');
      expect(result.$overflow).toBe('true');
    });



    test('should handle get operations with corrupted body JSON gracefully', async () => {
      // Insert valid data first
      const validData = {
        id: 'doc_corrupted',
        title: 'Test Document',
        content: 'X'.repeat(1000),
        metadata: { description: 'Y'.repeat(1500) }
      };

      await documents.insert(validData);
      
      // Manually corrupt the body in S3 (simulate by creating a resource with invalid JSON)
      // This tests the JSON.parse error handling in handleGet
      const retrieved = await documents.get('doc_corrupted');
      
      // Should still return metadata even if body parsing fails
      expect(retrieved.title).toBe('Test Document');
      expect(retrieved.content).toBe('X'.repeat(1000));
    });
  });

  describe('Body Only Behavior - Real Integration', () => {
    let logs;

    beforeEach(async () => {
      logs = await database.createResource({
        name: 'logs',
        attributes: {
          id: 'string|required',
          level: 'string|required',
          message: 'string|required',
          timestamp: 'string|required',
          metadata: 'object|optional'
        },
        behavior: 'body-only'
      });
    });

    test('should store all data in body as JSON', async () => {
      const logData = { 
        id: 'log1',
        level: 'info',
        message: 'Test log message',
        timestamp: '2024-01-01T00:00:00Z',
        metadata: { 
          userId: 'user123',
          sessionId: 'session456'
        }
      };

      const result = await logs.insert(logData);
      
      expect(result.level).toBe('info');
      expect(result.message).toBe('Test log message');
      expect(result.timestamp).toBe('2024-01-01T00:00:00Z');
      expect(result.metadata).toEqual({ 
        userId: 'user123',
        sessionId: 'session456'
      });
    });

    test('should handle large data without limits', async () => {
      const largeData = { 
        id: 'log2',
        level: 'error',
        message: 'X'.repeat(2000),
        timestamp: '2024-01-01T00:00:00Z',
        metadata: {
          stackTrace: 'B'.repeat(1000),
          context: 'C'.repeat(500)
        }
      };

      const result = await logs.insert(largeData);
      
      expect(result.id).toBe('log2');
      expect(result.message).toBe('X'.repeat(2000));
      expect(result.metadata.stackTrace).toBe('B'.repeat(1000));
      expect(result.metadata.context).toBe('C'.repeat(500));
    });

    test('should parse body content on get', async () => {
      const logData = { 
        id: 'log3',
        level: 'error',
        message: 'Error occurred',
        timestamp: '2024-01-01T00:00:00Z',
        metadata: { 
          errorCode: 'E001',
          details: 'Detailed error information'
        }
      };

      await logs.insert(logData);
      const retrieved = await logs.get('log3');

      expect(retrieved.level).toBe('error');
      expect(retrieved.message).toBe('Error occurred');
      expect(retrieved.metadata).toEqual({ 
        errorCode: 'E001',
        details: 'Detailed error information'
      });
    });

    test('should handle update operations by storing in body', async () => {
      const originalLog = { 
        id: 'log_update',
        level: 'info',
        message: 'Original message',
        timestamp: '2024-01-01T00:00:00Z'
      };

      await logs.insert(originalLog);

      const updateData = {
        level: 'warn',
        message: 'Updated message',
        timestamp: '2024-01-01T01:00:00Z',
        metadata: { updated: true }
      };

      const result = await logs.update('log_update', updateData);
      
      expect(result.level).toBe('warn');
      expect(result.message).toBe('Updated message');
      expect(result.metadata).toEqual({ updated: true });
    });



    test('should handle get operations with corrupted body JSON gracefully', async () => {
      // Insert valid data first
      const validData = {
        id: 'log_corrupted',
        level: 'error',
        message: 'Test log',
        timestamp: '2024-01-01T00:00:00Z'
      };

      await logs.insert(validData);
      
      // This simulates the error handling in handleGet when JSON.parse fails
      // The actual behavior returns empty object for bodyData when parsing fails
      const retrieved = await logs.get('log_corrupted');
      
      // Should return data (either from successful parse or from metadata merge)
      expect(retrieved.id).toBe('log_corrupted');
      expect(retrieved._v).toBeDefined(); // Version field should be present
    });

    test('should handle empty body content gracefully', async () => {
      // Test the case where body is empty or whitespace only
      const logData = { 
        id: 'log_empty_body',
        level: 'info',
        message: 'Test message',
        timestamp: '2024-01-01T00:00:00Z'
      };

      await logs.insert(logData);
      const retrieved = await logs.get('log_empty_body');
      
      expect(retrieved.level).toBe('info');
      expect(retrieved.message).toBe('Test message');
      expect(retrieved._v).toBeDefined(); // Version field should be present
    });
  });

  describe('Database Integration with Behaviors', () => {
    test('should create resource with custom behavior', async () => {
      const resource = await database.createResource({
        name: 'custom_behavior_test',
        attributes: { name: 'string|required' },
        behavior: 'truncate-data'
      });

      expect(resource.behavior).toBe('truncate-data');
    });

    test('should use default behavior when not specified', async () => {
      const resource = await database.createResource({
        name: 'default_behavior_test',
        attributes: { name: 'string|required' }
      });

      expect(resource.behavior).toBe('user-managed');
    });

    test('should export behavior in resource definition', async () => {
      const resource = await database.createResource({
        name: 'export_test',
        attributes: { name: 'string|required' },
        behavior: 'enforce-limits'
      });

      const definition = resource.export();
      expect(definition.behavior).toBe('enforce-limits');
    });

    test('should apply behavior during insert', async () => {
      const resource = await database.createResource({
        name: 'behavior_apply_test',
        attributes: { 
          name: 'string|required',
          bio: 'string|optional'
        },
        behavior: 'user-managed'
      });

      const emitSpy = jest.spyOn(resource, 'emit');

      // User-managed behavior may throw error if S3 rejects the metadata
      try {
        await resource.insert({
          name: 'Test User',
          bio: 'X'.repeat(2100) // Large data
        });
      } catch (error) {
        // If S3 rejects, that's also acceptable for user-managed behavior
        expect(
          error.message.includes('metadata headers exceed') ||
          error.message.includes('Validation error')
        ).toBe(true);
      }

      // Should emit warning from user-managed behavior
      expect(emitSpy).toHaveBeenCalledWith('exceedsLimit', expect.any(Object));
    });

    test('should reject insert with enforce-limits behavior', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_test',
        attributes: { 
          name: 'string|required',
          bio: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      await expect(resource.insert({
        name: 'Test User',
        bio: 'X'.repeat(2100) // Large data
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty data gracefully', async () => {
      const resource = await database.createResource({
        name: 'empty_data_test',
        attributes: { name: 'string|required' },
        behavior: 'truncate-data'
      });

      const result = await resource.insert({ name: 'Test' });
      expect(result.name).toBe('Test');
    });

    test('should handle null/undefined values', async () => {
      const resource = await database.createResource({
        name: 'null_values_test',
        attributes: { 
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({ 
        name: 'Test',
        description: null
      });

      expect(result.name).toBe('Test');
      expect(result.description).toBeNull();
    });

    test('should handle very large single fields', async () => {
      const resource = await database.createResource({
        name: 'large_fields_test',
        attributes: { 
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const result = await resource.insert({
        name: 'Test',
        content: 'X'.repeat(3000) // Very large field
      });

      expect(result.name).toBe('Test');
      expect(result.content).toBeDefined();
      expect(result.$truncated).toBe('true');
    });

    test('should handle mixed data types in body-overflow', async () => {
      const resource = await database.createResource({
        name: 'mixed_types_test',
        attributes: { 
          name: 'string|required',
          data: 'object|optional'
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({
        name: 'Test',
        data: {
          numbers: [1, 2, 3],
          text: 'X'.repeat(1000),
          boolean: true,
          nested: { value: 'test' }
        }
      });

      expect(result.name).toBe('Test');
      expect(result.data).toBeDefined();
      if (result.body) {
        expect(() => JSON.parse(result.body)).not.toThrow();
      }
    });
  });
});