import { v4 as uuidv4 } from 'uuid';
import { describe, expect, test, beforeEach, jest, afterEach } from '@jest/globals';

import { ResourceError } from '#src/errors.js';
import { Resource } from '#src/resource.class.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('Custom ID Generators - Real Integration Tests', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=resources/ids');
    await database.connect();
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('idSize parameter', () => {
    test('should generate IDs with custom size', async () => {
      const resource = await database.createResource({
        name: 'test-resource',
        attributes: { name: 'string|required' },
        idSize: 8
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(8);
      expect(typeof result.id).toBe('string');
    });

    test('should use default size (22) when idSize is not specified', async () => {
      const resource = await database.createResource({
        name: 'default-resource',
        attributes: { name: 'string|required' }
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(22);
      expect(typeof result.id).toBe('string');
    });

    test('should generate different IDs for different sizes', async () => {
      const shortResource = await database.createResource({
        name: 'short-resource',
        attributes: { name: 'string|required' },
        idSize: 8
      });

      const longResource = await database.createResource({
        name: 'long-resource',
        attributes: { name: 'string|required' },
        idSize: 32
      });

      const shortResult = await shortResource.insert({ name: 'Short User' });
      const longResult = await longResource.insert({ name: 'Long User' });

      expect(shortResult.id.length).toBe(8);
      expect(longResult.id.length).toBe(32);
      expect(shortResult.id).not.toBe(longResult.id);
    });
  });

  describe('idGenerator parameter', () => {
    test('should use custom function as ID generator', async () => {
      const customGenerator = jest.fn(() => 'custom-id-123');
      
      const resource = await database.createResource({
        name: 'custom-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(customGenerator).toHaveBeenCalled();
      expect(result.id).toBe('custom-id-123');
    });

    test('should use UUID v4 as ID generator', async () => {
      const resource = await database.createResource({
        name: 'uuid-resource',
        attributes: { name: 'string|required' },
        idGenerator: uuidv4
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(36);
      // Check UUID v4 format
      expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id)).toBe(true);
    });

    test('should use number as ID generator size', async () => {
      const resource = await database.createResource({
        name: 'number-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: 16
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(16);
    });

    test('should generate unique IDs with custom generator', async () => {
      let counter = 0;
      const customGenerator = () => `id-${++counter}`;
      
      const resource = await database.createResource({
        name: 'unique-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const result1 = await resource.insert({ name: 'User 1' });
      const result2 = await resource.insert({ name: 'User 2' });

      expect(result1.id).toBe('id-1');
      expect(result2.id).toBe('id-2');
    });

    test('should generate unique IDs with timestamp-based generator', async () => {
      const timestampGenerator = () => `ts-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      const resource = await database.createResource({
        name: 'timestamp-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: timestampGenerator
      });

      const result1 = await resource.insert({ name: 'User 1' });
      const result2 = await resource.insert({ name: 'User 2' });

      expect(result1.id).toMatch(/^ts-\d+-\w{5}$/);
      expect(result2.id).toMatch(/^ts-\d+-\w{5}$/);
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('validation', () => {
    test('should throw error for invalid idGenerator type', async () => {
      let error;
      try {
        await database.createResource({
          name: 'invalid-generator-resource',
          attributes: { name: 'string|required' },
          idGenerator: 'invalid'
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idGenerator' must be a function or a number (size)")
        ])
      );
    });

    test('should throw error for invalid idSize type', async () => {
      let error;
      try {
        await database.createResource({
          name: 'invalid-size-resource',
          attributes: { name: 'string|required' },
          idSize: 'invalid'
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idSize' must be an integer")
        ])
      );
    });

    test('should throw error for negative idSize', async () => {
      let error;
      try {
        await database.createResource({
          name: 'negative-size-resource',
          attributes: { name: 'string|required' },
          idSize: -1
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idSize' must be greater than 0")
        ])
      );
    });

    test('should throw error for zero idSize', async () => {
      let error;
      try {
        await database.createResource({
          name: 'zero-size-resource',
          attributes: { name: 'string|required' },
          idSize: 0
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idSize' must be greater than 0")
        ])
      );
    });

    test('should throw error for negative idGenerator size', async () => {
      let error;
      try {
        await database.createResource({
          name: 'negative-generator-resource',
          attributes: { name: 'string|required' },
          idGenerator: -1
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idGenerator' size must be greater than 0")
        ])
      );
    });
  });

  describe('priority and precedence', () => {
    test('should prioritize idGenerator function over idSize', async () => {
      const customGenerator = jest.fn(() => 'custom-id');
      
      const resource = await database.createResource({
        name: 'priority-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator,
        idSize: 16
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(customGenerator).toHaveBeenCalled();
      expect(result.id).toBe('custom-id');
    });

    test('should use idSize when idGenerator is not a function', async () => {
      const resource = await database.createResource({
        name: 'number-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: 12,
        idSize: 16
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id.length).toBe(12); // Uses idGenerator value
    });
  });

  describe('bulk operations', () => {
    test('should use custom ID generator for bulk insert', async () => {
      let counter = 0;
      const customGenerator = () => `bulk-id-${++counter}`;
      
      const resource = await database.createResource({
        name: 'bulk-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const users = [
        { name: 'User 1' },
        { name: 'User 2' },
        { name: 'User 3' }
      ];

      const results = await resource.insertMany(users);
      
      expect(results).toHaveLength(3);
      // Verify that all IDs were generated correctly, but don't depend on order
      const ids = results.map(r => r.id);
      expect(ids).toContain('bulk-id-1');
      expect(ids).toContain('bulk-id-2');
      expect(ids).toContain('bulk-id-3');
      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[1]).not.toBe(ids[2]);
      expect(ids[0]).not.toBe(ids[2]);
    });

    test('should use UUID generator for bulk insert', async () => {
      const resource = await database.createResource({
        name: 'bulk-uuid-resource',
        attributes: { name: 'string|required' },
        idGenerator: uuidv4
      });

      const users = [
        { name: 'User 1' },
        { name: 'User 2' }
      ];

      const results = await resource.insertMany(users);
      
      expect(results).toHaveLength(2);
      expect(results[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(results[1].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(results[0].id).not.toBe(results[1].id);
    });
  });

  describe('ID persistence and retrieval', () => {
    test('should persist and retrieve custom IDs', async () => {
      const customGenerator = () => `persistent-id-${Date.now()}`;
      
      const resource = await database.createResource({
        name: 'persistent-id-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const inserted = await resource.insert({ name: 'Test User' });
      expect(inserted.id).toMatch(/^persistent-id-\d+$/);

      const retrieved = await resource.get(inserted.id);
      expect(retrieved.id).toBe(inserted.id);
      expect(retrieved.name).toBe('Test User');
    });

    test('should handle ID conflicts gracefully', async () => {
      let counter = 0;
      const conflictingGenerator = () => {
        counter++;
        return counter <= 2 ? 'conflict-id' : `unique-id-${counter}`;
      };
      
      const resource = await database.createResource({
        name: 'conflict-resource',
        attributes: { name: 'string|required' },
        idGenerator: conflictingGenerator
      });

      // First insert should work
      const result1 = await resource.insert({ name: 'User 1' });
      expect(result1.id).toBe('conflict-id');

      // Second insert should also work (handles conflict internally)
      const result2 = await resource.insert({ name: 'User 2' });
      expect(result2.id).toBe('conflict-id'); // Both should get the same ID since it's the generator's behavior
    });
  });

  describe('ID format validation', () => {
    test('should generate alphanumeric IDs by default', async () => {
      const resource = await database.createResource({
        name: 'alphanumeric-resource',
        attributes: { name: 'string|required' }
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(result.id.length).toBe(22);
    });

    test('should generate custom format IDs', async () => {
      const formatGenerator = () => `USER-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      const resource = await database.createResource({
        name: 'format-resource',
        attributes: { name: 'string|required' },
        idGenerator: formatGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toMatch(/^USER-\d+-[A-Z0-9]{6}$/);
    });
  });

  describe('Performance with custom ID generators', () => {
    test('should handle multiple inserts with custom generator efficiently', async () => {
      let counter = 0;
      const fastGenerator = () => `fast-${++counter}`;
      
      const resource = await database.createResource({
        name: 'performance-resource',
        attributes: { name: 'string|required' },
        idGenerator: fastGenerator
      });

      const startTime = Date.now();
      
      // Insert multiple items
      const promises = Array.from({ length: 10 }, (_, i) => 
        resource.insert({ name: `User ${i}` }).catch(err => {
          return null;
        })
      );
      
      const allResults = await Promise.all(promises);
      const results = allResults.filter(r => r !== null);
      
      const endTime = Date.now();

      // Sort results by ID number since parallel operations can complete out of order
      const sortedResults = results.sort((a, b) => {
        const numA = parseInt(a.id.split('-')[1]);
        const numB = parseInt(b.id.split('-')[1]);
        return numA - numB;
      });

      expect(sortedResults).toHaveLength(10);
      expect(sortedResults[0].id).toBe('fast-1');
      expect(sortedResults[9].id).toBe('fast-10');
      
      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('Comprehensive ID Size Testing', () => {
    test('should generate very short IDs (3 characters)', async () => {
      const resource = await database.createResource({
        name: 'very-short-resource',
        attributes: { name: 'string|required' },
        idSize: 3
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(3);
      expect(typeof result.id).toBe('string');
      expect(result.id).toMatch(/^[a-zA-Z0-9_-]{3}$/);
    });

    test('should generate 5-character IDs exactly', async () => {
      const resource = await database.createResource({
        name: 'five-char-resource',
        attributes: { name: 'string|required' },
        idSize: 5
      });

      const results = await Promise.all([
        resource.insert({ name: 'User 1' }),
        resource.insert({ name: 'User 2' }),
        resource.insert({ name: 'User 3' })
      ]);

      results.forEach((result, index) => {
        expect(result.id.length).toBe(5);
        expect(result.id).toMatch(/^[a-zA-Z0-9_-]{5}$/);
      });

      // Ensure they're all unique
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    test('should generate exact size IDs for various sizes', async () => {
      const sizes = [1, 4, 6, 10, 15, 20, 25, 30, 40, 50];
      
      for (const size of sizes) {
        const resource = await database.createResource({
          name: `size-${size}-resource`,
          attributes: { name: 'string|required' },
          idSize: size
        });

        const result = await resource.insert({ name: `Test User Size ${size}` });
        
        expect(result.id.length).toBe(size);
        expect(result.id).toMatch(new RegExp(`^[a-zA-Z0-9_-]{${size}}$`));
      }
    }, 30000);

    test('should handle idGenerator as number for various sizes', async () => {
      const sizes = [2, 7, 12, 18, 24, 35];
      
      for (const size of sizes) {
        const resource = await database.createResource({
          name: `generator-size-${size}-resource`,
          attributes: { name: 'string|required' },
          idGenerator: size // Pass size as number
        });

        const result = await resource.insert({ name: `Test User Gen Size ${size}` });
        
        expect(result.id.length).toBe(size);
        expect(result.id).toMatch(new RegExp(`^[a-zA-Z0-9_-]{${size}}$`));
      }
    }, 20000);
  });

  describe('User-specific scenarios (reproducing reported issues)', () => {
    test('should work with generateConviteCode function', async () => {
      function generateConviteCode() {
        return 'CONV' + Math.random().toString(36).substring(2, 7).toUpperCase();
      }

      const resource = await database.createResource({
        name: 'invitations',
        idGenerator: generateConviteCode,
        attributes: {
          email: 'string|required',
          message: 'string|optional'
        }
      });

      const results = await Promise.all([
        resource.insert({ email: 'test1@example.com', message: 'Welcome!' }),
        resource.insert({ email: 'test2@example.com', message: 'Hello!' }),
        resource.insert({ email: 'test3@example.com', message: 'Hi!' })
      ]);

      results.forEach((result, index) => {
        expect(result.id).toMatch(/^CONV[A-Z0-9]{5}$/);
        expect(result.id.length).toBe(9); // CONV + 5 chars
        expect(result.id.startsWith('CONV')).toBe(true);
      });

      // Ensure uniqueness
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    test('should NOT generate 22-char IDs when idSize is 5', async () => {
      const resource = await database.createResource({
        name: 'not-22-chars',
        attributes: { name: 'string|required' },
        idSize: 5
      });

      // Test multiple inserts to be absolutely sure
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => 
          resource.insert({ name: `User ${i}` })
        )
      );

      results.forEach((result, index) => {
        expect(result.id.length).toBe(5);
        expect(result.id.length).not.toBe(22);
      });
    });

    test('should work with various custom prefix generators', async () => {
      const generators = [
        {
          name: 'user-prefix',
          fn: () => `USER_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          pattern: /^USER_[A-Z0-9]{6}$/,
          expectedLength: 11
        },
        {
          name: 'order-prefix', 
          fn: () => `ORD${Date.now().toString(36).toUpperCase()}`,
          pattern: /^ORD[A-Z0-9]+$/,
          expectedLength: null // Variable length
        },
        {
          name: 'ticket-prefix',
          fn: () => `TKT-${Math.random().toString(36).substring(2, 5).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
          pattern: /^TKT-[A-Z0-9]{3}-[A-Z0-9]{3}$/,
          expectedLength: 11
        }
      ];

      for (const gen of generators) {
        const resource = await database.createResource({
          name: gen.name,
          idGenerator: gen.fn,
          attributes: { name: 'string|required' }
        });

        const result = await resource.insert({ name: 'Test User' });
        
        expect(result.id).toMatch(gen.pattern);
        if (gen.expectedLength) {
          expect(result.id.length).toBe(gen.expectedLength);
        }
      }
    });

    test('should preserve resource-specific ID generators between multiple creates', async () => {
      // Create resource with size 5
      const shortResource = await database.createResource({
        name: 'persistent-short',
        attributes: { name: 'string|required' },
        idSize: 5
      });

      // Create resource with custom generator
      function customGen() {
        return `CUSTOM_${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
      }

      const customResource = await database.createResource({
        name: 'persistent-custom',
        attributes: { name: 'string|required' },
        idGenerator: customGen
      });

      // Test that each maintains its configuration
      const shortResult = await shortResource.insert({ name: 'Short User' });
      const customResult = await customResource.insert({ name: 'Custom User' });

      expect(shortResult.id.length).toBe(5);
      expect(customResult.id).toMatch(/^CUSTOM_[A-Z0-9]{2}$/);
      expect(customResult.id.length).toBe(9);

    });
  });

  describe('Edge cases and error scenarios', () => {
    test('should handle extremely large ID sizes', async () => {
      const resource = await database.createResource({
        name: 'huge-id-resource',
        attributes: { name: 'string|required' },
        idSize: 100
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id.length).toBe(100);
      expect(result.id).toMatch(/^[a-zA-Z0-9_-]{100}$/);
    });

    test('should handle generator functions that return empty strings', async () => {
      const emptyGenerator = () => '';

      const resource = await database.createResource({
        name: 'empty-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: emptyGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      // Should still create an ID (possibly fallback to default)
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    test('should handle generator functions that return non-string values', async () => {
      const numberGenerator = () => 12345;

      const resource = await database.createResource({
        name: 'number-generator-resource', 
        attributes: { name: 'string|required' },
        idGenerator: numberGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBe('12345');
      expect(typeof result.id).toBe('string');
    });

    test('should handle complex generator with special characters', async () => {
      const complexGenerator = () => `ID-${Date.now()}-${Math.random().toString(36).substring(2, 8)}_SPECIAL!@#$%`;

      const resource = await database.createResource({
        name: 'complex-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: complexGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toMatch(/^ID-\d+-[a-z0-9]{6}_SPECIAL!@#\$%$/);
    });
  });

  describe('Stress testing and consistency', () => {
    test('should maintain ID size consistency across many inserts', async () => {
      const resource = await database.createResource({
        name: 'consistency-resource',
        attributes: { name: 'string|required' },
        idSize: 8
      });

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => 
          resource.insert({ name: `User ${i}` })
        )
      );

      results.forEach((result, index) => {
        expect(result.id.length).toBe(8);
        expect(result.id).toMatch(/^[a-zA-Z0-9_-]{8}$/);
      });

      // Check uniqueness across all 20 IDs
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(20);

    });

    test('should handle rapid successive ID generation', async () => {
      let counter = 0;
      const sequentialGenerator = () => `SEQ_${String(++counter).padStart(6, '0')}`;

      const resource = await database.createResource({
        name: 'rapid-resource',
        attributes: { name: 'string|required' },
        idGenerator: sequentialGenerator
      });

      const startTime = Date.now();
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => 
          resource.insert({ name: `Rapid User ${i}` })
        )
      );
      const endTime = Date.now();

      results.forEach((result, index) => {
        expect(result.id).toMatch(/^SEQ_\d{6}$/);
        expect(result.id.length).toBe(10);
      });

      // Verify sequential numbering (though order might vary due to parallel execution)
      const ids = results.map(r => r.id).sort();
      expect(ids[0]).toBe('SEQ_000001');
      expect(ids[19]).toBe('SEQ_000020');

    });

    test('should handle mixed ID generation strategies in same database', async () => {
      // Create multiple resources with different ID strategies
      const defaultResource = await database.createResource({
        name: 'mixed-default',
        attributes: { name: 'string|required' }
      });

      const shortResource = await database.createResource({
        name: 'mixed-short',
        attributes: { name: 'string|required' },
        idSize: 6
      });

      const customResource = await database.createResource({
        name: 'mixed-custom',
        attributes: { name: 'string|required' },
        idGenerator: () => `MIX_${Math.random().toString(36).substring(2, 5)}`
      });

      const uuidResource = await database.createResource({
        name: 'mixed-uuid',
        attributes: { name: 'string|required' },
        idGenerator: uuidv4
      });

      // Insert into each
      const [defaultResult, shortResult, customResult, uuidResult] = await Promise.all([
        defaultResource.insert({ name: 'Default User' }),
        shortResource.insert({ name: 'Short User' }),
        customResource.insert({ name: 'Custom User' }),
        uuidResource.insert({ name: 'UUID User' })
      ]);

      // Verify each maintains its strategy
      expect(defaultResult.id.length).toBe(22);
      expect(shortResult.id.length).toBe(6);
      expect(customResult.id).toMatch(/^MIX_[a-z0-9]{3}$/);
      expect(uuidResult.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    });
  });

  describe('ID Configuration Persistence Across Reconnections', () => {
    test('should persist idSize configuration through database reconnections', async () => {
      // === FASE 1: Criar resource com idSize customizado ===
      
      const testResource = await database.createResource({
        name: 'test_idsize_persistence',
        idSize: 6, // 6-character IDs
        attributes: {
          name: 'string|required',
          description: 'string|optional'
        }
      });

      expect(testResource.idSize).toBe(6);
      expect(testResource.idGeneratorType).toBe(6);

      // Insert a few items in the first connection
      const item1 = await testResource.insert({ 
        name: 'Item 1', 
        description: 'First insert' 
      });
      const item2 = await testResource.insert({ 
        name: 'Item 2', 
        description: 'Second insert' 
      });

      expect(item1.id.length).toBe(6);
      expect(item2.id.length).toBe(6);
      expect(item1.id).toMatch(/^[a-zA-Z0-9_-]{6}$/);
      expect(item2.id).toMatch(/^[a-zA-Z0-9_-]{6}$/);


      // === PHASE 2: Simulate reconnection by loading the resource from metadata ===
      
      // Pegar o metadata que seria salvo
      await database.uploadMetadataFile();
      const savedMetadata = database.savedMetadata;
      
      expect(savedMetadata).toBeDefined();
      expect(savedMetadata.resources['test_idsize_persistence']).toBeDefined();
      
      const resourceMetadata = savedMetadata.resources['test_idsize_persistence'];
      const currentVersion = resourceMetadata.currentVersion;
      const versionData = resourceMetadata.versions[currentVersion];
      
      expect(versionData.idSize).toBe(6);
      expect(versionData.idGenerator).toBe(6);

      // === PHASE 3: Simulate creating the resource from metadata (same as connect) ===
      
             // Restore ID generator configuration (como no database.class.js)
       let restoredIdGenerator, restoredIdSize;
       if (versionData.idGenerator !== undefined) {
         if (versionData.idGenerator === 'custom_function') {
           restoredIdGenerator = undefined;
           restoredIdSize = versionData.idSize || 22;
         } else if (typeof versionData.idGenerator === 'number') {
           restoredIdGenerator = versionData.idGenerator;
           restoredIdSize = versionData.idSize || versionData.idGenerator;
         }
       } else {
         restoredIdSize = versionData.idSize || 22;
       }

      // Create a new resource to mirror what happens during connect
      const restoredResource = new Resource({
        name: 'test_idsize_persistence',
        client: database.client,
        version: currentVersion,
        attributes: versionData.attributes,
        behavior: versionData.behavior || 'user-managed',
        parallelism: database.parallelism,
        passphrase: database.passphrase,
        observers: [database],
        cache: database.cache,
        timestamps: versionData.timestamps !== undefined ? versionData.timestamps : false,
        partitions: versionData.partitions || {},
        paranoid: versionData.paranoid !== undefined ? versionData.paranoid : true,
        allNestedObjectsOptional: versionData.allNestedObjectsOptional !== undefined ? versionData.allNestedObjectsOptional : true,
        autoDecrypt: versionData.autoDecrypt !== undefined ? versionData.autoDecrypt : true,
        hooks: versionData.hooks || {},
        versioningEnabled: database.versioningEnabled,
        map: versionData.map,
        idGenerator: restoredIdGenerator,
        idSize: restoredIdSize
      });

      expect(restoredResource.idSize).toBe(6);
      expect(restoredResource.idGeneratorType).toBe(6);

      // === PHASE 4: Test ID generation with the restored resource ===
      
      const item3 = await restoredResource.insert({ 
        name: 'Item 3', 
        description: 'After restore' 
      });
      const item4 = await restoredResource.insert({ 
        name: 'Item 4', 
        description: 'Confirmation' 
      });

      expect(item3.id.length).toBe(6);
      expect(item4.id.length).toBe(6);
      expect(item3.id).toMatch(/^[a-zA-Z0-9_-]{6}$/);
      expect(item4.id).toMatch(/^[a-zA-Z0-9_-]{6}$/);


      // === PHASE 5: Ensure old data remains accessible ===
      
      const retrievedItem1 = await restoredResource.get(item1.id);
      const retrievedItem2 = await restoredResource.get(item2.id);
      
      expect(retrievedItem1.name).toBe('Item 1');
      expect(retrievedItem2.name).toBe('Item 2');
      expect(retrievedItem1.description).toBe('First insert');
      expect(retrievedItem2.description).toBe('Second insert');

      // === PHASE 6: Validate overall consistency ===
      
      const allIds = [item1.id, item2.id, item3.id, item4.id];
      const allSizesCorrect = allIds.every(id => id.length === 6);
      const uniqueIds = new Set(allIds);
      
      expect(allSizesCorrect).toBe(true);
      expect(uniqueIds.size).toBe(4);

    });

    test('should persist idGenerator number configuration through metadata', async () => {
      
      // Create a resource with a numeric idGenerator
      const resource = await database.createResource({
        name: 'test_idgenerator_number_persistence',
        idGenerator: 8, // Number interpreted as ID size
        attributes: {
          name: 'string|required'
        }
      });

      expect(resource.idSize).toBe(8);
      expect(resource.idGeneratorType).toBe(8);

      // Insert an item
      const item1 = await resource.insert({ name: 'Test Item' });
      expect(item1.id.length).toBe(8);

      // Force a metadata upload
      await database.uploadMetadataFile();
      const metadata = database.savedMetadata;
      
      const resourceMeta = metadata.resources['test_idgenerator_number_persistence'];
      const versionData = resourceMeta.versions[resourceMeta.currentVersion];
      
      expect(versionData.idSize).toBe(8);
      expect(versionData.idGenerator).toBe(8);

    });

    test('should handle custom function idGenerator persistence (fallback to default)', async () => {
      
      function customIdGenerator() {
        return 'CUSTOM' + Math.random().toString(36).substring(2, 6).toUpperCase();
      }

      // Create a resource with a custom function
      const resource = await database.createResource({
        name: 'test_custom_function_persistence',
        idGenerator: customIdGenerator,
        attributes: {
          name: 'string|required'
        }
      });

      expect(resource.idGeneratorType).toBe('custom_function');
      expect(resource.idSize).toBe(22); // Default size stored

      // Insert an item
      const item1 = await resource.insert({ name: 'Test Item' });
      expect(item1.id).toMatch(/^CUSTOM[A-Z0-9]{4}$/);
      expect(item1.id.length).toBe(10);

      // Force a metadata upload
      await database.uploadMetadataFile();
      const metadata = database.savedMetadata;
      
      const resourceMeta = metadata.resources['test_custom_function_persistence'];
      const versionData = resourceMeta.versions[resourceMeta.currentVersion];
      
      expect(versionData.idSize).toBe(22);
      expect(versionData.idGenerator).toBe('custom_function');

    });

    test('should maintain different ID configurations for multiple resources', async () => {
      
      // Create multiple resources with different configurations
      const shortResource = await database.createResource({
        name: 'multi_test_short',
        idSize: 4,
        attributes: { name: 'string|required' }
      });

      const mediumResource = await database.createResource({
        name: 'multi_test_medium', 
        idGenerator: 10,
        attributes: { name: 'string|required' }
      });

      const defaultResource = await database.createResource({
        name: 'multi_test_default',
        attributes: { name: 'string|required' }
      });

      // Insert entries
      const shortItem = await shortResource.insert({ name: 'Short' });
      const mediumItem = await mediumResource.insert({ name: 'Medium' });
      const defaultItem = await defaultResource.insert({ name: 'Default' });

      // Verify lengths
      expect(shortItem.id.length).toBe(4);
      expect(mediumItem.id.length).toBe(10);
      expect(defaultItem.id.length).toBe(22);

      // Force a metadata upload
      await database.uploadMetadataFile();
      const metadata = database.savedMetadata;

      // Inspect the saved metadata
      const shortMeta = metadata.resources['multi_test_short'];
      const mediumMeta = metadata.resources['multi_test_medium'];
      const defaultMeta = metadata.resources['multi_test_default'];

      expect(shortMeta.versions[shortMeta.currentVersion].idSize).toBe(4);
      expect(mediumMeta.versions[mediumMeta.currentVersion].idSize).toBe(10);
      expect(defaultMeta.versions[defaultMeta.currentVersion].idSize).toBe(22);

    });
  });
}); 
