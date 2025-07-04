import { join } from 'path';
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import Database from "../src/database.class.js";

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-existence-' + Date.now());

describe('Resource Existence Methods', () => {
  let db;

  beforeEach(async () => {
    db = new Database({
      verbose: false,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        ? process.env.BUCKET_CONNECTION_STRING
            .replace('USER', process.env.MINIO_USER || 'minioadmin')
            .replace('PASSWORD', process.env.MINIO_PASSWORD || 'minioadmin')
            + `/${testPrefix}`
        : 's3://test-bucket'
    });
    await db.connect();
  });

  afterEach(async () => {
    // Clean up resources
    if (db.resources) {
      for (const resourceName of Object.keys(db.resources)) {
        delete db.resources[resourceName];
      }
    }
  });

  describe('resourceExists', () => {
    test('should return false for non-existent resource', () => {
      const exists = db.resourceExists('non-existent');
      expect(exists).toBe(false);
    });

    test('should return true for existing resource', async () => {
      await db.createResource({
        name: 'test-resource',
        attributes: { name: 'string|required' }
      });

      const exists = db.resourceExists('test-resource');
      expect(exists).toBe(true);
    });
  });

  describe('resourceExistsWithSameHash', () => {
    test('should return correct result for non-existent resource', () => {
      const result = db.resourceExistsWithSameHash({
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
      
      await db.createResource({
        name: 'test-resource',
        attributes
      });

      const result = db.resourceExistsWithSameHash({
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
      
      await db.createResource({
        name: 'test-resource',
        attributes: originalAttributes
      });

      const differentAttributes = { name: 'string|required', email: 'string|required' };
      
      const result = db.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes: differentAttributes
      });

      expect(result.exists).toBe(true);
      expect(result.sameHash).toBe(false);
      expect(result.hash).not.toBe(result.existingHash);
    });

    test('should handle different behavior correctly', async () => {
      const attributes = { name: 'string|required' };
      
      await db.createResource({
        name: 'test-resource',
        attributes,
        behavior: 'user-management'
      });

      const result = db.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes,
        behavior: 'body-overflow'
      });

      expect(result.exists).toBe(true);
      expect(result.sameHash).toBe(false);
    });

    test('should handle different behavior correctly', async () => {
      const attributes = { name: 'string|required' };
      
      await db.createResource({
        name: 'test-resource',
        attributes,
        behavior: 'user-management'
      });

      const result = db.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes,
        behavior: 'body-overflow'
      });

      expect(result.exists).toBe(true);
      expect(result.sameHash).toBe(false);
    });
  });

  describe('createResource integration', () => {
    test('should create new resource when it does not exist', async () => {
      const attributes = { name: 'string|required' };
      // Limpar resource antes do teste
      delete db.resources['new-resource'];
      const resource = await db.createResource({
        name: 'new-resource',
        attributes
      });
      expect(resource).toBeDefined();
      expect(db.resourceExists('new-resource')).toBe(true);
    });

    test('should update resource when it exists with different attributes', async () => {
      const originalAttributes = { name: 'string|required' };
      
      // Create resource first time
      await db.createResource({
        name: 'test-resource',
        attributes: originalAttributes
      });

      const modifiedAttributes = { name: 'string|required', email: 'string|required' };
      
      // Update with different attributes
      const resource = await db.createResource({
        name: 'test-resource',
        attributes: modifiedAttributes
      });

      expect(resource).toBeDefined();
      
      // Verify attributes were updated
      const hashCheck = db.resourceExistsWithSameHash({
        name: 'test-resource',
        attributes: modifiedAttributes
      });
      expect(hashCheck.sameHash).toBe(true);
    });

    test('should handle options and behavior changes', async () => {
      const attributes = { name: 'string|required' };
      
      // Create with basic options
      await db.createResource({
        name: 'test-resource',
        attributes,
        timestamps: false
      });

      // Update with different options
      const resource = await db.createResource({
        name: 'test-resource',
        attributes,
        timestamps: true,
        behavior: 'body-overflow'
      });

      expect(resource).toBeDefined();
    });
  });

  describe('Integration with createResource', () => {
    test('createResource should not create unnecessary versions when hash is same', async () => {
      const attributes = { name: 'string|required' };
      
      // Create resource first time
      await db.createResource({
        name: 'test-resource',
        attributes
      });

      const initialVersion = db.resources['test-resource'].version;

      // Call createResource again with same attributes
      await db.createResource({
        name: 'test-resource',
        attributes
      });

      const finalVersion = db.resources['test-resource'].version;

      // Version should remain the same since hash didn't change
      expect(finalVersion).toBe(initialVersion);
    });

    test('createResource should create new version when hash changes', async () => {
      const originalAttributes = { name: 'string|required' };
      
      // Create resource first time
      await db.createResource({
        name: 'test-resource',
        attributes: originalAttributes
      });

      const initialVersion = db.resources['test-resource'].version;

      const modifiedAttributes = { name: 'string|required', email: 'string|required' };
      
      // Call createResource with different attributes
      await db.createResource({
        name: 'test-resource',
        attributes: modifiedAttributes
      });

      const finalVersion = db.resources['test-resource'].version;

      // Version should be different since hash changed
      expect(finalVersion).not.toBe(initialVersion);
    });
  });
}); 