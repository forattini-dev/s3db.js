import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';
import { MemoryCache, S3Cache } from '../src/cache/index.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'cache-journey-' + Date.now());

describe('Cache System - Complete Journey', () => {
  let client;
  let resource;

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    resource = new Resource({
      client,
      name: 'cache-test',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional'
      },
      options: {
        timestamps: true,
        cache: true
      }
    });

    // Clean slate
    try {
      await resource.deleteAll({ paranoid: false });
    } catch (error) {
      // Ignore if no data exists
    }
  });

  test('MemoryCache Journey', async () => {
    const cache = new MemoryCache({
      ttl: 3600, // 1 hour
      maxSize: 100
    });

    // 1. Test basic operations
    await cache.set('key1', { name: 'John Doe', email: 'john@example.com' });
    await cache.set('key2', { name: 'Jane Smith', email: 'jane@example.com' });

    const value1 = await cache.get('key1');
    const value2 = await cache.get('key2');

    expect(value1).toBeDefined();
    expect(value1.name).toBe('John Doe');
    expect(value2).toBeDefined();
    expect(value2.name).toBe('Jane Smith');

    // 2. Test cache miss
    const missingValue = await cache.get('non-existent-key');
    expect(missingValue).toBeNull();

    // 3. Test cache update
    await cache.set('key1', { name: 'John Updated', email: 'john@example.com' });
    const updatedValue = await cache.get('key1');
    expect(updatedValue.name).toBe('John Updated');

    // 4. Test cache deletion
    await cache.delete('key1');
    const deletedValue = await cache.get('key1');
    expect(deletedValue).toBeNull();

    // 5. Test cache clear
    await cache.clear();
    const clearedValue = await cache.get('key2');
    expect(clearedValue).toBeNull();

    // 6. Test cache size
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    const size = await cache.size();
    expect(size).toBe(2);

    // 7. Test cache keys
    const keys = await cache.keys();
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
  });

  test('S3Cache Journey', async () => {
    const cache = new S3Cache({
      client,
      keyPrefix: 'cache',
      ttl: 3600 // 1 hour
    });

    // 1. Test basic operations
    await cache.set('s3key1', { name: 'S3 User 1', email: 's3user1@example.com' });
    await cache.set('s3key2', { name: 'S3 User 2', email: 's3user2@example.com' });

    const value1 = await cache.get('s3key1');
    const value2 = await cache.get('s3key2');

    expect(value1).toBeDefined();
    expect(value1.name).toBe('S3 User 1');
    expect(value2).toBeDefined();
    expect(value2.name).toBe('S3 User 2');

    // 2. Test cache miss
    const missingValue = await cache.get('non-existent-s3key');
    expect(missingValue).toBeNull();

    // 3. Test cache update
    await cache.set('s3key1', { name: 'S3 User 1 Updated', email: 's3user1@example.com' });
    const updatedValue = await cache.get('s3key1');
    expect(updatedValue.name).toBe('S3 User 1 Updated');

    // 4. Test cache deletion
    await cache.delete('s3key1');
    const deletedValue = await cache.get('s3key1');
    expect(deletedValue).toBeNull();

    // 5. Test cache clear
    await cache.clear();
    const clearedValue = await cache.get('s3key2');
    expect(clearedValue).toBeNull();

    // 6. Test cache size
    await cache.set('s3key1', 'value1');
    await cache.set('s3key2', 'value2');
    const size = await cache.size();
    expect(size).toBe(2);

    // 7. Test cache keys
    const keys = await cache.keys();
    expect(keys).toContain('s3key1');
    expect(keys).toContain('s3key2');
  });

  test('Cache TTL Journey', async () => {
    const cache = new MemoryCache({
      ttl: 1 // 1 second for testing
    });

    // Set value with short TTL
    await cache.set('ttlkey', 'ttlvalue');

    // Value should exist immediately
    const immediateValue = await cache.get('ttlkey');
    expect(immediateValue).toBe('ttlvalue');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Value should be expired
    const expiredValue = await cache.get('ttlkey');
    expect(expiredValue).toBeNull();
  });

  test('Cache MaxSize Journey', async () => {
    const cache = new MemoryCache({
      maxSize: 2,
      ttl: 3600
    });

    // Add more items than maxSize
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3');

    // Check size is limited
    const size = await cache.size();
    expect(size).toBeLessThanOrEqual(2);

    // Check keys
    const keys = await cache.keys();
    expect(keys.length).toBeLessThanOrEqual(2);
  });

  test('Cache Error Handling Journey', async () => {
    const cache = new MemoryCache();

    // Test invalid key (empty string)
    try {
      await cache.set('', 'value');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toBe('Invalid key');
    }

    // Test invalid key (null)
    try {
      await cache.set(null, 'value');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toBe('Invalid key');
    }

    // Test invalid key (undefined)
    try {
      await cache.set(undefined, 'value');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toBe('Invalid key');
    }
  });

  test('Cache Configuration Journey', async () => {
    // Test MemoryCache configuration
    const memoryCache = new MemoryCache({
      ttl: 7200,
      maxSize: 500
    });

    expect(memoryCache.config.ttl).toBe(7200);
    expect(memoryCache.config.maxSize).toBe(500);

    // Test S3Cache configuration
    const s3Cache = new S3Cache({
      client,
      prefix: 'test-cache/',
      ttl: 1800
    });

    expect(s3Cache.config.prefix).toBe('test-cache/');
    expect(s3Cache.config.ttl).toBe(1800);
    expect(s3Cache.config.client).toBe(client);
  });

  test('Cache Performance Journey', async () => {
    const cache = new MemoryCache({
      ttl: 3600
    });

    const startTime = Date.now();

    // Perform many operations
    for (let i = 0; i < 1000; i++) {
      await cache.set(`key${i}`, `value${i}`);
    }

    for (let i = 0; i < 1000; i++) {
      await cache.get(`key${i}`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Performance should be reasonable (less than 5 seconds for 2000 operations)
    expect(duration).toBeLessThan(5000);

    // Verify all values are correct
    for (let i = 0; i < 100; i++) { // Test subset for performance
      const value = await cache.get(`key${i}`);
      expect(value).toBe(`value${i}`);
    }
  });
});
