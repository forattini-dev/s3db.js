import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';

import Database from '../src/database.class.js';
import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';

// Mock S3 client
const mockS3Client = {
  send: jest.fn().mockResolvedValue({}),
  putObject: jest.fn().mockResolvedValue({}),
  headObject: jest.fn().mockResolvedValue({
    Metadata: {},
    ContentLength: 0,
    LastModified: new Date()
  }),
  getObject: jest.fn().mockResolvedValue({
    Body: {
      transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array())
    },
    ContentType: 'application/json'
  }),
  deleteObject: jest.fn().mockResolvedValue({}),
  deleteObjects: jest.fn().mockResolvedValue({}),
  listObjects: jest.fn().mockResolvedValue({ Contents: [] }),
  getAllKeys: jest.fn().mockResolvedValue([]),
  getKeysPage: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
  deleteAll: jest.fn().mockResolvedValue(0),
  config: { bucket: 'test-bucket' },
  parallelism: 10
};

describe('Custom ID Generators', () => {
  let database;
  let client;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    client = new Client({
      connectionString: 's3://test-bucket',
      AwsS3Client: mockS3Client
    });

    database = new Database({
      client,
      name: 'test-db'
    });
  });

  describe('idSize parameter', () => {
    test('should generate IDs with custom size', async () => {
      const resource = new Resource({
        name: 'test-resource',
        client,
        attributes: { name: 'string|required' },
        idSize: 8
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(8);
      expect(typeof result.id).toBe('string');
    });

    test('should use default size (22) when idSize is not specified', async () => {
      const resource = new Resource({
        name: 'test-resource',
        client,
        attributes: { name: 'string|required' }
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(22);
      expect(typeof result.id).toBe('string');
    });

    test('should generate different IDs for different sizes', async () => {
      const shortResource = new Resource({
        name: 'short-resource',
        client,
        attributes: { name: 'string|required' },
        idSize: 8
      });

      const longResource = new Resource({
        name: 'long-resource',
        client,
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
      
      const resource = new Resource({
        name: 'test-resource',
        client,
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(customGenerator).toHaveBeenCalled();
      expect(result.id).toBe('custom-id-123');
    });

    test('should use UUID v4 as ID generator', async () => {
      const resource = new Resource({
        name: 'test-resource',
        client,
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
      const resource = new Resource({
        name: 'test-resource',
        client,
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
      
      const resource = new Resource({
        name: 'test-resource',
        client,
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const result1 = await resource.insert({ name: 'User 1' });
      const result2 = await resource.insert({ name: 'User 2' });

      expect(result1.id).toBe('id-1');
      expect(result2.id).toBe('id-2');
    });
  });

  describe('validation', () => {
    test('should throw error for invalid idGenerator type', () => {
      expect(() => {
        new Resource({
          name: 'test-resource',
          client,
          attributes: { name: 'string|required' },
          idGenerator: 'invalid'
        });
      }).toThrow("Resource 'idGenerator' must be a function or a number (size)");
    });

    test('should throw error for invalid idSize type', () => {
      expect(() => {
        new Resource({
          name: 'test-resource',
          client,
          attributes: { name: 'string|required' },
          idSize: 'invalid'
        });
      }).toThrow("Resource 'idSize' must be an integer");
    });

    test('should throw error for negative idSize', () => {
      expect(() => {
        new Resource({
          name: 'test-resource',
          client,
          attributes: { name: 'string|required' },
          idSize: -1
        });
      }).toThrow("Resource 'idSize' must be greater than 0");
    });

    test('should throw error for zero idSize', () => {
      expect(() => {
        new Resource({
          name: 'test-resource',
          client,
          attributes: { name: 'string|required' },
          idSize: 0
        });
      }).toThrow("Resource 'idSize' must be greater than 0");
    });

    test('should throw error for negative idGenerator size', () => {
      expect(() => {
        new Resource({
          name: 'test-resource',
          client,
          attributes: { name: 'string|required' },
          idGenerator: -1
        });
      }).toThrow("Resource 'idGenerator' size must be greater than 0");
    });
  });

  describe('priority and precedence', () => {
    test('should prioritize idGenerator function over idSize', async () => {
      const customGenerator = jest.fn(() => 'custom-id');
      
      const resource = new Resource({
        name: 'test-resource',
        client,
        attributes: { name: 'string|required' },
        idGenerator: customGenerator,
        idSize: 16
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(customGenerator).toHaveBeenCalled();
      expect(result.id).toBe('custom-id');
    });

    test('should use idSize when idGenerator is not a function', async () => {
      const resource = new Resource({
        name: 'test-resource',
        client,
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
      
      const resource = new Resource({
        name: 'test-resource',
        client,
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
      expect(results[0].id).toBe('bulk-id-1');
      expect(results[1].id).toBe('bulk-id-2');
      expect(results[2].id).toBe('bulk-id-3');
    });
  });
}); 