import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { getBehavior, AVAILABLE_BEHAVIORS, DEFAULT_BEHAVIOR } from '../src/behaviors/index.js';
import { calculateTotalSize } from '../src/concerns/calculator.js';
import Resource from '../src/resource.class.js';
import { Database } from '../src/database.class.js';
import Client from '../src/client.class.js';

describe('Resource Behaviors', () => {
  describe('Behavior System Structure', () => {
    test('should export all required behaviors', () => {
      expect(AVAILABLE_BEHAVIORS).toEqual([
        'user-management',
        'enforce-limits', 
        'data-truncate',
        'body-overflow'
      ]);
      expect(DEFAULT_BEHAVIOR).toBe('user-management');
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

  describe('User Management Behavior', () => {
    let behavior;
    let mockResource;

    beforeEach(() => {
      behavior = getBehavior('user-management');
      mockResource = {
        emit: jest.fn(),
        behavior: 'user-management'
      };
    });

    test('should allow small data without warning', async () => {
      const smallData = { name: 'Test', email: 'test@example.com' };
      const mappedData = { name: 'Test', email: 'test@example.com' };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: smallData,
        mappedData
      });

      expect(result).toEqual({
        mappedData,
        body: ""
      });
      expect(mockResource.emit).not.toHaveBeenCalled();
    });

    test('should emit warning for large data but allow operation', async () => {
      const largeData = { 
        name: 'Test',
        bio: 'A'.repeat(3000) // > 2KB
      };
      const mappedData = { 
        name: 'Test',
        bio: 'A'.repeat(3000)
      };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData
      });

      expect(result).toEqual({
        mappedData,
        body: ""
      });
      
      expect(mockResource.emit).toHaveBeenCalledWith('exceedsLimit', {
        operation: 'insert',
        totalSize: calculateTotalSize(mappedData),
        limit: 2048,
        excess: calculateTotalSize(mappedData) - 2048,
        data: largeData
      });
    });

    test('should emit warning for update operations', async () => {
      const largeData = { bio: 'A'.repeat(3000) };
      const mappedData = { bio: 'A'.repeat(3000) };

      await behavior.handleUpdate({
        resource: mockResource,
        id: 'test-id',
        data: largeData,
        mappedData
      });

      expect(mockResource.emit).toHaveBeenCalledWith('exceedsLimit', expect.objectContaining({
        operation: 'update',
        id: 'test-id'
      }));
    });

    test('should emit warning for upsert operations', async () => {
      const largeData = { bio: 'A'.repeat(3000) };
      const mappedData = { bio: 'A'.repeat(3000) };

      await behavior.handleUpsert({
        resource: mockResource,
        id: 'test-id',
        data: largeData,
        mappedData
      });

      expect(mockResource.emit).toHaveBeenCalledWith('exceedsLimit', expect.objectContaining({
        operation: 'upsert',
        id: 'test-id'
      }));
    });

    test('should handle get operations normally', async () => {
      const metadata = { name: 'Test', bio: 'Bio' };
      const body = "";

      const result = await behavior.handleGet({
        resource: mockResource,
        metadata,
        body
      });

      expect(result).toEqual({ metadata, body });
    });
  });

  describe('Enforce Limits Behavior', () => {
    let behavior;
    let mockResource;

    beforeEach(() => {
      behavior = getBehavior('enforce-limits');
      mockResource = { behavior: 'enforce-limits' };
    });

    test('should allow small data', async () => {
      const smallData = { name: 'Test', email: 'test@example.com' };
      const mappedData = { name: 'Test', email: 'test@example.com' };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: smallData,
        mappedData
      });

      expect(result).toEqual({
        mappedData,
        body: ""
      });
    });

    test('should throw error for large data on insert', async () => {
      const largeData = { bio: 'A'.repeat(3000) };
      const mappedData = { bio: 'A'.repeat(3000) };

      await expect(behavior.handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });

    test('should throw error for large data on update', async () => {
      const largeData = { bio: 'A'.repeat(3000) };
      const mappedData = { bio: 'A'.repeat(3000) };

      await expect(behavior.handleUpdate({
        resource: mockResource,
        id: 'test-id',
        data: largeData,
        mappedData
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });

    test('should throw error for large data on upsert', async () => {
      const largeData = { bio: 'A'.repeat(3000) };
      const mappedData = { bio: 'A'.repeat(3000) };

      await expect(behavior.handleUpsert({
        resource: mockResource,
        id: 'test-id',
        data: largeData,
        mappedData
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');
    });

    test('should handle get operations normally', async () => {
      const metadata = { name: 'Test' };
      const body = "";

      const result = await behavior.handleGet({
        resource: mockResource,
        metadata,
        body
      });

      expect(result).toEqual({ metadata, body });
    });
  });

  describe('Data Truncate Behavior', () => {
    let behavior;
    let mockResource;

    beforeEach(() => {
      behavior = getBehavior('data-truncate');
      mockResource = { behavior: 'data-truncate' };
    });

    test('should preserve small data unchanged', async () => {
      const smallData = { name: 'Test', email: 'test@example.com' };
      const mappedData = { name: 'Test', email: 'test@example.com' };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: smallData,
        mappedData
      });

      expect(result).toEqual({
        mappedData,
        body: ""
      });
    });

    test('should truncate large data to fit in 2KB', async () => {
      const largeData = {
        name: 'Test', // Small field
        email: 'test@example.com', // Small field
        bio: 'A'.repeat(1000), // Medium field
        description: 'B'.repeat(2000) // Large field
      };
      const mappedData = {
        name: 'Test',
        email: 'test@example.com',
        bio: 'A'.repeat(1000),
        description: 'B'.repeat(2000)
      };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData
      });

      // Should have truncated some data
      expect(result.body).toBe("");
      expect(calculateTotalSize(result.mappedData)).toBeLessThanOrEqual(2100);
      
      // Should preserve smaller fields first
      expect(result.mappedData.name).toBe('Test');
      expect(result.mappedData.email).toBe('test@example.com');
      
      // Should truncate or omit larger fields
      const resultKeys = Object.keys(result.mappedData);
      expect(resultKeys.length).toBeGreaterThan(0);
      expect(resultKeys.length).toBeLessThanOrEqual(4);
    });

    test('should add "..." to truncated values', async () => {
      const largeData = {
        name: 'Test',
        bio: 'A'.repeat(2100) // Too large for 2KB
      };
      const mappedData = {
        name: 'Test',
        bio: 'A'.repeat(2100)
      };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData  
      });

      expect(result.mappedData.name).toBe('Test');
      
      // Bio should be truncated with "..."
      if (result.mappedData.bio) {
        expect(result.mappedData.bio).toMatch(/\.\.\.$/);
      }
    });

    test('should handle get operations normally', async () => {
      const metadata = { name: 'Test' };
      const body = "";

      const result = await behavior.handleGet({
        resource: mockResource,
        metadata,
        body
      });

      expect(result).toEqual({ metadata, body });
    });
  });

  describe('Body Overflow Behavior', () => {
    let behavior;
    let mockResource;

    beforeEach(() => {
      behavior = getBehavior('body-overflow');
      mockResource = { behavior: 'body-overflow' };
    });

    test('should preserve small data in metadata only', async () => {
      const smallData = { name: 'Test', email: 'test@example.com' };
      const mappedData = { name: 'Test', email: 'test@example.com' };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: smallData,
        mappedData
      });

      expect(result).toEqual({
        mappedData,
        body: ""
      });
    });

    test('should split large data between metadata and body', async () => {
      const largeData = {
        name: 'Test',
        email: 'test@example.com',
        bio: 'A'.repeat(1000),
        description: 'B'.repeat(1500),
        notes: 'C'.repeat(1000)
      };
      const mappedData = {
        name: 'Test',
        email: 'test@example.com',
        bio: 'A'.repeat(1000),
        description: 'B'.repeat(1500),
        notes: 'C'.repeat(1000)
      };

      const result = await behavior.handleInsert({
        resource: mockResource,
        data: largeData,
        mappedData
      });

      // Should have overflow flag in metadata
      expect(result.mappedData.$overflow).toBe('true');
      
      // Metadata should be <= 2KB
      expect(calculateTotalSize(result.mappedData)).toBeLessThanOrEqual(2100);
      
      // Should have body content
      expect(result.body).not.toBe("");
      
      // Body should be valid JSON
      expect(() => JSON.parse(result.body)).not.toThrow();
      
      const bodyData = JSON.parse(result.body);
      expect(typeof bodyData).toBe('object');
    });

    test('should merge metadata and body on get', async () => {
      const metadata = {
        $overflow: 'true',
        name: 'Test',
        email: 'test@example.com'
      };
      const body = JSON.stringify({
        bio: 'A'.repeat(1000),
        description: 'B'.repeat(1500)
      });

      const result = await behavior.handleGet({
        resource: mockResource,
        metadata,
        body
      });

      // Should merge all data
      expect(result.metadata).toEqual({
        name: 'Test',
        email: 'test@example.com',
        bio: 'A'.repeat(1000),
        description: 'B'.repeat(1500)
      });
      expect(result.body).toBe("");
    });

    test('should handle malformed body gracefully', async () => {
      const metadata = {
        $overflow: 'true',
        name: 'Test'
      };
      const body = "invalid json";

      const result = await behavior.handleGet({
        resource: mockResource,
        metadata,
        body
      });

      // Should return original metadata on parse error
      expect(result.metadata).toEqual(metadata);
      expect(result.body).toBe(body);
    });

    test('should handle get without overflow flag normally', async () => {
      const metadata = { name: 'Test', email: 'test@example.com' };
      const body = "";

      const result = await behavior.handleGet({
        resource: mockResource,
        metadata,
        body
      });

      expect(result).toEqual({ metadata, body });
    });
  });

  describe('Resource Integration', () => {
    let mockClient;
    let resource;

    beforeEach(() => {
      mockClient = {
        config: { bucket: 'test-bucket' },
        putObject: jest.fn().mockResolvedValue({}),
        getObject: jest.fn().mockResolvedValue({
          Body: { transformToByteArray: () => Promise.resolve(Buffer.from('')) },
          ContentLength: 0,
          ContentType: 'application/json'
        }),
        headObject: jest.fn().mockResolvedValue({
          Metadata: { name: 'Test', email: 'test@example.com' },
          ContentLength: 0,
          LastModified: new Date(),
          ContentType: 'application/json'
        })
      };
    });

    test('should create resource with custom behavior', () => {
      resource = new Resource({
        name: 'test-resource',
        client: mockClient,
        behavior: 'enforce-limits',
        attributes: { name: 'string', email: 'email' }
      });

      expect(resource.behavior).toBe('enforce-limits');
    });

    test('should use default behavior when not specified', () => {
      resource = new Resource({
        name: 'test-resource',
        client: mockClient,
        attributes: { name: 'string', email: 'email' }
      });

      expect(resource.behavior).toBe(DEFAULT_BEHAVIOR);
    });

    test('should export behavior in resource definition', () => {
      resource = new Resource({
        name: 'test-resource',
        client: mockClient,
        behavior: 'body-overflow',
        attributes: { name: 'string', email: 'email' }
      });

      const exported = resource.export();
      expect(exported.behavior).toBe('body-overflow');
    });

    test('should apply behavior during insert', async () => {
      resource = new Resource({
        name: 'test-resource',
        client: mockClient,
        behavior: 'user-management',
        attributes: { name: 'string', bio: 'string' }
      });

      const emitSpy = jest.spyOn(resource, 'emit');

      await resource.insert({
        name: 'Test',
        bio: 'A'.repeat(3000) // Large data
      });

      // Should emit warning from user-management behavior
      expect(emitSpy).toHaveBeenCalledWith('exceedsLimit', expect.any(Object));
      
      // Should still call putObject
      expect(mockClient.putObject).toHaveBeenCalled();
    });

    test('should reject insert with enforce-limits behavior', async () => {
      resource = new Resource({
        name: 'test-resource',
        client: mockClient,
        behavior: 'enforce-limits',
        attributes: { name: 'string', bio: 'string' }
      });

      await expect(resource.insert({
        name: 'Test',
        bio: 'A'.repeat(3000) // Large data
      })).rejects.toThrow('S3 metadata size exceeds 2KB limit');

      // Should not call putObject
      expect(mockClient.putObject).not.toHaveBeenCalled();
    });
  });

  describe('Database Integration', () => {
    let mockClient;
    let database;

    beforeEach(() => {
      mockClient = {
        config: { bucket: 'test-bucket' },
        exists: jest.fn().mockResolvedValue(false),
        getObject: jest.fn().mockResolvedValue({
          Body: { transformToString: () => Promise.resolve('{"version":"1","resources":{}}') }
        }),
        putObject: jest.fn().mockResolvedValue({})
      };

      database = new Database({
        client: mockClient,
        verbose: false
      });
    });

    test('should create resource with behavior parameter', async () => {
      const resource = await database.createResource({
        name: 'test-resource',
        behavior: 'body-overflow',
        attributes: { name: 'string', content: 'string' }
      });

      expect(resource.behavior).toBe('body-overflow');
    });

    test('should use default behavior when not specified', async () => {
      const resource = await database.createResource({
        name: 'test-resource',
        attributes: { name: 'string' }
      });

      expect(resource.behavior).toBe(DEFAULT_BEHAVIOR);
    });

    test('should persist behavior in metadata', async () => {
      await database.createResource({
        name: 'test-resource',
        behavior: 'data-truncate',
        attributes: { name: 'string', content: 'string' }
      });

      // Check that putObject was called with metadata containing behavior
      const putObjectCall = mockClient.putObject.mock.calls.find(call => 
        call[0].key === 's3db.json'
      );
      
      expect(putObjectCall).toBeDefined();
      expect(putObjectCall[0].body).toContain('data-truncate');
      
      // Verify the behavior is in the correct structure
      const metadata = JSON.parse(putObjectCall[0].body);
      expect(metadata.resources['test-resource'].versions.v0.behavior).toBe('data-truncate');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty data gracefully', async () => {
      const behavior = getBehavior('body-overflow');
      const result = await behavior.handleInsert({
        resource: { behavior: 'body-overflow' },
        data: {},
        mappedData: {}
      });

      expect(result.mappedData).toEqual({});
      expect(result.body).toBe("");
    });

    test('should handle null/undefined values', async () => {
      const behavior = getBehavior('data-truncate');
      const mappedData = { name: null, email: undefined, bio: 'test' };
      
      const result = await behavior.handleInsert({
        resource: { behavior: 'data-truncate' },
        data: { name: null, email: undefined, bio: 'test' },
        mappedData
      });

      expect(result.mappedData).toBeDefined();
      expect(result.body).toBe("");
    });

    test('should handle very large single fields', async () => {
      const behavior = getBehavior('data-truncate');
      const largeField = 'A'.repeat(5000); // Much larger than 2KB
      
      const result = await behavior.handleInsert({
        resource: { behavior: 'data-truncate' },
        data: { content: largeField },
        mappedData: { content: largeField }
      });

      expect(calculateTotalSize(result.mappedData)).toBeLessThanOrEqual(2100);
    });

    test('should handle mixed data types in body-overflow', async () => {
      const behavior = getBehavior('body-overflow');
      const mixedData = {
        string: 'A'.repeat(500),
        number: 12345,
        boolean: true,
        array: [1, 2, 3, 'A'.repeat(500)],
        object: { nested: 'B'.repeat(500) },
        null_value: null,
        undefined_value: undefined
      };
      
      const result = await behavior.handleInsert({
        resource: { behavior: 'body-overflow' },
        data: mixedData,
        mappedData: mixedData  
      });

      expect(result.mappedData).toBeDefined();
      if (result.body) {
        expect(() => JSON.parse(result.body)).not.toThrow();
      }
    });
  });
});