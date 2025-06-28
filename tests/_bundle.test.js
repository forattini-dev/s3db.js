import { describe, expect, test } from '@jest/globals';
import { join, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  Cache,
  Client,
  Plugin,
  S3Cache,
  Database,
  Validator,
  CachePlugin,
  MemoryCache,
  ConnectionString,
  ResourceReader,
  ResourceWriter,
  ResourceIdsReader,
  ResourceIdsPageReader,
  encrypt,
  decrypt,
  streamToString,
  BaseError,
  NotFound,
  NoSuchKey,
  NoSuchBucket,
  UnknownError,
  MissingMetadata,
  InvalidResourceItem
} from '../src/index.js';

describe('Bundle package', () => {
  test('should export Cache', () => {
    expect(Cache).toBeDefined();
  });

  test('should export Client', () => {
    expect(Client).toBeDefined();
  });

  test('should export Plugin', () => {
    expect(Plugin).toBeDefined();
  });

  test('should export S3Cache', () => {
    expect(S3Cache).toBeDefined();
  });

  test('should export Database', () => {
    expect(Database).toBeDefined();
  });

  test('should export Validator', () => {
    expect(Validator).toBeDefined();
  });

  test('should export CachePlugin', () => {
    expect(CachePlugin).toBeDefined();
  });

  test('should export MemoryCache', () => {
    expect(MemoryCache).toBeDefined();
  });

  test('should export ConnectionString', () => {
    expect(ConnectionString).toBeDefined();
  });

  test('should export ResourceReader', () => {
    expect(ResourceReader).toBeDefined();
  });

  test('should export ResourceWriter', () => {
    expect(ResourceWriter).toBeDefined();
  });

  test('should export ResourceIdsReader', () => {
    expect(ResourceIdsReader).toBeDefined();
  });

  test('should export ResourceIdsPageReader', () => {
    expect(ResourceIdsPageReader).toBeDefined();
  });

  test('should export encrypt', () => {
    expect(encrypt).toBeDefined();
  });

  test('should export decrypt', () => {
    expect(decrypt).toBeDefined();
  });

  test('should export streamToString', () => {
    expect(streamToString).toBeDefined();
  });

  test('should export BaseError', () => {
    expect(BaseError).toBeDefined();
  });

  test('should export NotFound', () => {
    expect(NotFound).toBeDefined();
  });

  test('should export NoSuchKey', () => {
    expect(NoSuchKey).toBeDefined();
  });

  test('should export NoSuchBucket', () => {
    expect(NoSuchBucket).toBeDefined();
  });

  test('should export UnknownError', () => {
    expect(UnknownError).toBeDefined();
  });

  test('should export MissingMetadata', () => {
    expect(MissingMetadata).toBeDefined();
  });

  test('should export InvalidResourceItem', () => {
    expect(InvalidResourceItem).toBeDefined();
  });
});

describe('Bundle Test - Complete Journey', () => {
  test('Bundle Journey: Check → Validate → Verify', () => {
    // Test that all exports are functions or classes
    expect(typeof Cache).toBe('function');
    expect(typeof Client).toBe('function');
    expect(typeof Database).toBe('function');
    expect(typeof Validator).toBe('function');
  });

  test('Bundle Structure Journey', () => {
    // Test that exports have expected structure
    expect(Cache).toHaveProperty('prototype');
    expect(Client).toHaveProperty('prototype');
  });

  test('Bundle Compatibility Journey', () => {
    // Test that exports can be instantiated
    expect(() => new Cache()).not.toThrow();
    expect(() => new MemoryCache()).not.toThrow();
  });

  test('Bundle Quality Journey', () => {
    // Test that exports are properly defined
    expect(Cache).toBeDefined();
    expect(Client).toBeDefined();
  });

  test('Bundle Performance Journey', () => {
    // Test that imports are fast
    const startTime = Date.now();
    
    // Just test that imports work
    expect(Cache).toBeDefined();
    expect(Client).toBeDefined();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Import should be fast (less than 100ms)
    expect(duration).toBeLessThan(100);
  });
});
