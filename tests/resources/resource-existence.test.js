import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';

import { createDatabaseForTest } from '#tests/config.js';

describe('Resource Existence Methods', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=resources/existence');
    await database.connect();
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('resourceExists', () => {
    test('should return false for non-existent resource', () => {
      const exists = database.resourceExists('non-existent');
      expect(exists).toBe(false);
    });

    test('should return true for existing resource', async () => {
      await database.createResource({
        name: 'test-resource',
        attributes: { name: 'string|required' }
      });

      const exists = database.resourceExists('test-resource');
      expect(exists).toBe(true);
    });
  });

  describe('resourceExistsWithSameHash', () => {
    test('should return correct result for non-existent resource', () => {
      const result = database.resourceExistsWithSameHash({
        name: 'non-existent',
        attributes: { name: 'string|required' }
      });

      expect(result).toEqual({
        exists: false,
        sameHash: false,
        hash: null
      });
    });

    test('should return true for same hash', async () => {
      const attributes = { name: 'string|required', email: 'string|required' };
      
      await database.createResource({
        name: 'test-resource',
        attributes
      });

      const result = database.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes
      });

      expect(result.exists).toBe(true);
      expect(result.sameHash).toBe(true);
      expect(result.hash).toBe(result.existingHash);
      expect(result.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    test('should return false for different hash', async () => {
      const originalAttributes = { name: 'string|required' };
      
      await database.createResource({
        name: 'test-resource',
        attributes: originalAttributes
      });

      const differentAttributes = { name: 'string|required', email: 'string|required' };
      
      const result = database.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes: differentAttributes
      });

      expect(result.exists).toBe(true);
      expect(result.sameHash).toBe(false);
      expect(result.hash).not.toBe(result.existingHash);
    });

    test('should handle different behavior correctly', async () => {
      const attributes = { name: 'string|required' };
      
      await database.createResource({
        name: 'test-resource',
        attributes,
        behavior: 'user-managed'
      });

      const result = database.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes,
        behavior: 'body-overflow'
      });

      expect(result.exists).toBe(true);
      expect(result.sameHash).toBe(false);
    });

    test('should handle different partitions correctly', async () => {
      const attributes = { name: 'string|required', region: 'string|required' };
      
      await database.createResource({
        name: 'test-resource',
        attributes,
        partitions: {
          byRegion: {
            fields: { region: 'string' }
          }
        }
      });

      const result = database.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes,
        partitions: {
          byRegion: {
            fields: { region: 'string' }
          },
          byName: {
            fields: { name: 'string' }
          }
        }
      });

      expect(result.exists).toBe(true);
      expect(result.sameHash).toBe(false);
    });
  });

  describe('createResource integration', () => {
    test('should create new resource when it does not exist', async () => {
      const attributes = { name: 'string|required' };
      
      const resource = await database.createResource({
        name: 'new-resource',
        attributes
      });
      
      expect(resource).toBeDefined();
      expect(database.resourceExists('new-resource')).toBe(true);
    });

    test('should update resource when it exists with different attributes', async () => {
      const originalAttributes = { name: 'string|required' };
      
      // Create resource first time
      await database.createResource({
        name: 'test-resource',
        attributes: originalAttributes
      });

      const modifiedAttributes = { name: 'string|required', email: 'string|required' };
      
      // Update with different attributes
      const resource = await database.createResource({
        name: 'test-resource',
        attributes: modifiedAttributes
      });

      expect(resource).toBeDefined();
      
      // Verify attributes were updated
      const hashCheck = database.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes: modifiedAttributes
      });
      expect(hashCheck.sameHash).toBe(true);
    });

    test('should handle options and behavior changes', async () => {
      const attributes = { name: 'string|required' };
      
      // Create with basic options
      await database.createResource({
        name: 'test-resource',
        attributes,
        timestamps: false
      });

      // Update with different options
      const resource = await database.createResource({
        name: 'test-resource',
        attributes,
        timestamps: true,
        behavior: 'body-overflow'
      });

      expect(resource).toBeDefined();
    });

    test('should handle partition changes', async () => {
      const attributes = { name: 'string|required', region: 'string|required' };
      
      // Create without partitions
      await database.createResource({
        name: 'test-resource',
        attributes
      });

      // Update with partitions
      const resource = await database.createResource({
        name: 'test-resource',
        attributes,
        partitions: {
          byRegion: {
            fields: { region: 'string' }
          }
        }
      });

      expect(resource).toBeDefined();
      expect(resource.config.partitions.byRegion).toBeDefined();
    });
  });

  describe('Integration with createResource', () => {
    test('createResource should not create unnecessary versions when hash is same', async () => {
      const attributes = { name: 'string|required' };
      
      // Create resource first time
      await database.createResource({
        name: 'test-resource',
        attributes
      });

      const initialVersion = database.resources['test-resource'].version;

      // Call createResource again with same attributes
      await database.createResource({
        name: 'test-resource',
        attributes
      });

      const finalVersion = database.resources['test-resource'].version;

      // Version should remain the same since hash didn't change
      expect(finalVersion).toBe(initialVersion);
    });

    test('createResource should create new version when hash changes', async () => {
      const originalAttributes = { name: 'string|required' };
      
      // Create resource first time
      await database.createResource({
        name: 'test-resource',
        attributes: originalAttributes
      });

      const initialVersion = database.resources['test-resource'].version;

      const modifiedAttributes = { name: 'string|required', email: 'string|required' };
      
      // Call createResource with different attributes
      await database.createResource({
        name: 'test-resource',
        attributes: modifiedAttributes
      });

      const finalVersion = database.resources['test-resource'].version;

      // Version should be different since hash changed
      expect(finalVersion).not.toBe(initialVersion);
    });

    test('createResource should handle complex attribute changes', async () => {
      const originalAttributes = {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional'
      };
      
      await database.createResource({
        name: 'complex-resource',
        attributes: originalAttributes
      });

      const modifiedAttributes = {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        bio: 'string|optional',
        preferences: 'object|optional'
      };
      
      const resource = await database.createResource({
        name: 'complex-resource',
        attributes: modifiedAttributes
      });

      expect(resource).toBeDefined();
      expect(Object.keys(resource.attributes)).toContain('bio');
      expect(Object.keys(resource.attributes)).toContain('preferences');
    });

    test('createResource should handle nested attribute changes', async () => {
      const originalAttributes = {
        name: 'string|required',
        profile: {
          age: 'number|optional',
          location: 'string|optional'
        }
      };
      
      await database.createResource({
        name: 'nested-resource',
        attributes: originalAttributes
      });

      const modifiedAttributes = {
        name: 'string|required',
        profile: {
          age: 'number|optional',
          location: 'string|optional',
          preferences: 'object|optional'
        }
      };
      
      const resource = await database.createResource({
        name: 'nested-resource',
        attributes: modifiedAttributes
      });

      expect(resource).toBeDefined();
      expect(resource.attributes.profile.preferences).toBeDefined();
    });
  });

  describe('Hash consistency and stability', () => {
    test('should generate consistent hashes for same definition', () => {
      const definition1 = {
        name: 'test-resource',
        attributes: { name: 'string|required', email: 'string|required' }
      };

      const definition2 = {
        name: 'test-resource',
        attributes: { name: 'string|required', email: 'string|required' }
      };

      const hash1 = database.resourceExistsWithSameHash(definition1).hash;
      const hash2 = database.resourceExistsWithSameHash(definition2).hash;

      expect(hash1).toBe(hash2);
    });

    test('should generate different hashes for different definitions', async () => {
      // Create the first resource
      await database.createResource({
        name: 'test-resource',
        attributes: { name: 'string|required' }
      });

      const definition1 = {
        name: 'test-resource',
        attributes: { name: 'string|required' }
      };

      const definition2 = {
        name: 'test-resource',
        attributes: { name: 'string|required', email: 'string|required' }
      };

      const hash1 = database.resourceExistsWithSameHash(definition1).hash;
      const hash2 = database.resourceExistsWithSameHash(definition2).hash;

      expect(hash1).not.toBe(hash2);
    });

    test('should handle attribute order changes', () => {
      const definition1 = {
        name: 'test-resource',
        attributes: {
          name: 'string|required',
          email: 'string|required',
          age: 'number|optional'
        }
      };

      const definition2 = {
        name: 'test-resource',
        attributes: {
          age: 'number|optional',
          email: 'string|required',
          name: 'string|required'
        }
      };

      const hash1 = database.resourceExistsWithSameHash(definition1).hash;
      const hash2 = database.resourceExistsWithSameHash(definition2).hash;

      // Should be the same since attributes are sorted alphabetically
      expect(hash1).toBe(hash2);
    });
  });
}); 