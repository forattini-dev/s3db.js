import { ImporterPlugin, Transformers } from '../../src/plugins/importer/index.js';
import { createDatabaseForTest } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ImporterPlugin', () => {
  let database;
  let resource;
  const testDataDir = path.join(__dirname, '../fixtures/importer');

  beforeAll(async () => {
    // Create test data directory
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/importer');
    await database.connect();

    // Create test resource
    resource = await database.createResource({
      name: 'test_users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'string|optional',
        age: 'number|optional',
        createdAt: 'number|optional',
        birthYear: 'number|optional',
        tags: 'string|optional'
      }
    });
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  afterAll(() => {
    // Clean up test data directory
    if (fs.existsSync(testDataDir)) {
      const files = fs.readdirSync(testDataDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testDataDir, file));
      }
      fs.rmdirSync(testDataDir);
    }
  });

  describe('JSON Import', () => {
    it('should import JSON array', async () => {
      const testFile = path.join(testDataDir, 'test-array.json');
      const testData = [
        { id: 'u1', name: 'Alice', email: 'alice@example.com', age: 30 },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', age: 25 },
        { id: 'u3', name: 'Charlie', email: 'charlie@example.com', age: 35 }
      ];

      fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(3);
      expect(result.inserted).toBe(3);
      expect(result.errors).toBe(0);

      const users = await resource.list({ limit: 10 });
      expect(users.length).toBe(3);
    });

    it('should import JSONL format', async () => {
      const testFile = path.join(testDataDir, 'test.jsonl');
      const testData = [
        { id: 'u1', name: 'Alice', email: 'alice@example.com' },
        { id: 'u2', name: 'Bob', email: 'bob@example.com' },
        { id: 'u3', name: 'Charlie', email: 'charlie@example.com' }
      ];

      fs.writeFileSync(testFile, testData.map(d => JSON.stringify(d)).join('\n'));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'jsonl'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(3);
      expect(result.inserted).toBe(3);
    });

    it('should skip invalid JSON lines in JSONL', async () => {
      const testFile = path.join(testDataDir, 'test-invalid.jsonl');
      const lines = [
        '{"id": "u1", "name": "Alice"}',
        '{invalid json}',
        '{"id": "u2", "name": "Bob"}',
        '',
        '{"id": "u3", "name": "Charlie"}'
      ];

      fs.writeFileSync(testFile, lines.join('\n'));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'jsonl',
        continueOnError: true
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(3); // Only valid lines
      expect(result.inserted).toBe(3);
    });
  });

  describe('CSV Import', () => {
    it('should import CSV with headers', async () => {
      const testFile = path.join(testDataDir, 'test.csv');
      const csvContent = [
        'id,name,email,age',
        'u1,Alice,alice@example.com,30',
        'u2,Bob,bob@example.com,25',
        'u3,Charlie,charlie@example.com,35'
      ].join('\n');

      fs.writeFileSync(testFile, csvContent);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'csv'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(3);
      expect(result.inserted).toBe(3);

      const users = await resource.list({ limit: 10 });
      expect(users.length).toBe(3);

      // Check that all users were imported (order not guaranteed)
      const names = users.map(u => u.name).sort();
      expect(names).toEqual(['Alice', 'Bob', 'Charlie']);

      // Check that age was imported and converted to number by schema
      const alice = users.find(u => u.name === 'Alice');
      expect(alice.age).toBe(30);
    });

    it('should auto-detect delimiter', async () => {
      const testFile = path.join(testDataDir, 'test-semicolon.csv');
      const csvContent = [
        'id;name;email',
        'u1;Alice;alice@example.com',
        'u2;Bob;bob@example.com'
      ].join('\n');

      fs.writeFileSync(testFile, csvContent);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'csv'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(2);
      expect(result.inserted).toBe(2);
    });

    it('should handle quoted fields with commas', async () => {
      const testFile = path.join(testDataDir, 'test-quoted.csv');
      const csvContent = [
        'id,name,email',
        'u1,"Smith, Alice",alice@example.com',
        'u2,"Doe, Bob",bob@example.com'
      ].join('\n');

      fs.writeFileSync(testFile, csvContent);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'csv'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(2);
      expect(result.inserted).toBe(2);

      const users = await resource.list({ limit: 10 });
      const alice = users.find(u => u.name === 'Smith, Alice');
      expect(alice).toBeDefined();
    });

    it('should handle escaped quotes', async () => {
      const testFile = path.join(testDataDir, 'test-escaped.csv');
      const csvContent = [
        'id,name,email',
        'u1,"Alice ""Wonder"" Smith",alice@example.com'
      ].join('\n');

      fs.writeFileSync(testFile, csvContent);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'csv'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(1);
      expect(result.inserted).toBe(1);

      const users = await resource.list({ limit: 10 });
      const alice = users.find(u => u.name === 'Alice "Wonder" Smith');
      expect(alice).toBeDefined();
    });
  });

  describe('Field Mapping', () => {
    it('should map fields from source to target', async () => {
      const testFile = path.join(testDataDir, 'test-mapping.csv');
      const csvContent = [
        'user_id,user_name,user_email',
        'u1,Alice,alice@example.com',
        'u2,Bob,bob@example.com'
      ].join('\n');

      fs.writeFileSync(testFile, csvContent);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'csv',
        mapping: {
          'user_id': 'id',
          'user_name': 'name',
          'user_email': 'email'
        }
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(2);
      expect(result.inserted).toBe(2);

      const users = await resource.list({ limit: 10 });
      const alice = users.find(u => u.id === 'u1');
      expect(alice).toBeDefined();
      expect(alice.name).toBe('Alice');
    });
  });

  describe('Data Transformation', () => {
    it('should transform fields with built-in transformers', async () => {
      const testFile = path.join(testDataDir, 'test-transform.csv');
      const csvContent = [
        'id,name,age,tags',
        'u1,Alice,30.5,"tag1,tag2,tag3"',
        'u2,Bob,25.7,"tagA,tagB"'
      ].join('\n');

      fs.writeFileSync(testFile, csvContent);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'csv',
        transforms: {
          age: Transformers.parseInt(),
          name: Transformers.toLowerCase()
        }
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(2);

      const users = await resource.list({ limit: 10 });
      const alice = users.find(u => u.id === 'u1');
      const bob = users.find(u => u.id === 'u2');
      expect(alice.name).toBe('alice');
      expect(alice.age).toBe(30);
      expect(bob.age).toBe(25);
    });

    it('should use custom transformer functions', async () => {
      const testFile = path.join(testDataDir, 'test-custom.json');
      const testData = [
        { id: 'u1', name: 'Alice', createdAt: Date.now() }
      ];

      fs.writeFileSync(testFile, JSON.stringify(testData));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json',
        transforms: {
          createdAt: (value) => Math.floor(value / 1000) // Convert timestamp to seconds
        }
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(1);
      expect(result.inserted).toBe(1);

      const users = await resource.list();
      expect(users.length).toBe(1);
      expect(users[0].createdAt).toBeLessThan(Date.now()); // Should be in seconds, not milliseconds
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate by specified field', async () => {
      const testFile = path.join(testDataDir, 'test-dedup.json');
      const testData = [
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
        { id: 'u1', name: 'Alice Updated' }, // Duplicate
        { id: 'u3', name: 'Charlie' }
      ];

      fs.writeFileSync(testFile, JSON.stringify(testData));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json',
        deduplicateBy: 'id'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(4);
      expect(result.inserted).toBe(3); // Only 3 unique IDs
      expect(result.duplicates).toBe(1);
    });
  });

  describe('Validation', () => {
    it('should skip records that fail validation', async () => {
      const testFile = path.join(testDataDir, 'test-validation.json');
      const testData = [
        { id: 'u1', name: 'Alice', age: 30 },
        { id: 'u2', name: 'Bob', age: -5 }, // Invalid age
        { id: 'u3', name: 'Charlie', age: 35 }
      ];

      fs.writeFileSync(testFile, JSON.stringify(testData));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json',
        validate: (record) => {
          if (record.age && record.age < 0) return false;
          return true;
        },
        continueOnError: true
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(3);
      expect(result.inserted).toBe(2); // Only 2 valid records
      expect(result.skipped).toBe(1);
    });
  });

  describe('Batch Processing', () => {
    it('should process records in batches', async () => {
      const testFile = path.join(testDataDir, 'test-batch.json');
      const testData = Array.from({ length: 50 }, (_, i) => ({
        id: `u${i + 1}`,
        name: `User ${i + 1}`
      }));

      fs.writeFileSync(testFile, JSON.stringify(testData));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json',
        batchSize: 10,
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(50);
      expect(result.inserted).toBe(50);

      const users = await resource.list({ limit: 100 });
      expect(users.length).toBe(50);
    });
  });

  describe('Progress Events', () => {
    it('should emit progress events', async () => {
      const testFile = path.join(testDataDir, 'test-progress.json');
      const testData = Array.from({ length: 25 }, (_, i) => ({
        id: `u${i + 1}`,
        name: `User ${i + 1}`
      }));

      fs.writeFileSync(testFile, JSON.stringify(testData));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json',
        batchSize: 10
      });

      const progressEvents = [];
      plugin.on('progress', (progress) => {
        progressEvents.push(progress);
      });

      await database.usePlugin(plugin);
      await plugin.import(testFile);

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0]).toHaveProperty('processed');
      expect(progressEvents[0]).toHaveProperty('inserted');
    });

    it('should emit complete event', async () => {
      const testFile = path.join(testDataDir, 'test-complete.json');
      const testData = [
        { id: 'u1', name: 'Alice' }
      ];

      fs.writeFileSync(testFile, JSON.stringify(testData));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json'
      });

      let completeEvent = null;
      plugin.on('complete', (result) => {
        completeEvent = result;
      });

      await database.usePlugin(plugin);
      await plugin.import(testFile);

      expect(completeEvent).not.toBeNull();
      expect(completeEvent.processed).toBe(1);
      expect(completeEvent.inserted).toBe(1);
      expect(completeEvent).toHaveProperty('duration');
    });
  });

  describe('Statistics', () => {
    it('should provide detailed statistics', async () => {
      const testFile = path.join(testDataDir, 'test-stats.json');
      const testData = Array.from({ length: 100 }, (_, i) => ({
        id: `u${i + 1}`,
        name: `User ${i + 1}`
      }));

      fs.writeFileSync(testFile, JSON.stringify(testData));

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json',
        batchSize: 20,
      });

      await database.usePlugin(plugin);
      await plugin.import(testFile);

      const stats = plugin.getStats();
      expect(stats.totalProcessed).toBe(100);
      expect(stats.totalInserted).toBe(100);
      expect(stats.totalErrors).toBe(0);
      expect(stats.recordsPerSecond).toBeGreaterThan(0);
      expect(stats.startTime).toBeLessThan(stats.endTime);
    });
  });

  describe('Error Handling', () => {
    it('should throw error if resource not found', async () => {
      const testDb = createDatabaseForTest('suite=plugins/importer-error');
      await testDb.connect();

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'non_existent_resource',
        format: 'json'
      });

      await expect(testDb.usePlugin(plugin)).rejects.toThrow();

      await testDb.disconnect();
    });

    it('should throw error for unsupported format', async () => {
      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'unsupported'
      });

      await expect(database.usePlugin(plugin)).rejects.toThrow('Unsupported import format: unsupported');
    });

    it('should throw error if file not found', async () => {
      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'json'
      });

      await database.usePlugin(plugin);
      await expect(plugin.import('/non/existent/file.json')).rejects.toThrow('File not found');
    });
  });

  describe('Gzip Compression Support', () => {
    it('should import gzip-compressed JSONL files', async () => {
      const testFile = path.join(testDataDir, 'test.jsonl.gz');
      const testData = [
        { id: 'u1', name: 'Alice', email: 'alice@example.com', age: 30 },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', age: 25 },
        { id: 'u3', name: 'Charlie', email: 'charlie@example.com', age: 35 }
      ];

      // Create gzip-compressed JSONL file
      const jsonlContent = testData.map(d => JSON.stringify(d)).join('\n');
      const compressed = zlib.gzipSync(jsonlContent);
      fs.writeFileSync(testFile, compressed);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'jsonl'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(3);
      expect(result.inserted).toBe(3);
      expect(result.errors).toBe(0);

      const users = await resource.list({ limit: 10 });
      expect(users.length).toBe(3);
      expect(users.map(u => u.name)).toContain('Alice');
      expect(users.map(u => u.name)).toContain('Bob');
      expect(users.map(u => u.name)).toContain('Charlie');
    });

    it('should import gzip-compressed CSV files', async () => {
      const testFile = path.join(testDataDir, 'test.csv.gz');
      const csvContent = 'id,name,email,age\nu1,Alice,alice@example.com,30\nu2,Bob,bob@example.com,25\nu3,Charlie,charlie@example.com,35';

      // Create gzip-compressed CSV file
      const compressed = zlib.gzipSync(csvContent);
      fs.writeFileSync(testFile, compressed);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'csv'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(3);
      expect(result.inserted).toBe(3);
      expect(result.errors).toBe(0);

      const users = await resource.list({ limit: 10 });
      expect(users.length).toBe(3);
    });

    it('should auto-detect gzip from .gz extension', async () => {
      const testFile = path.join(testDataDir, 'auto-detect.jsonl.gz');
      const testData = [
        { id: 'u1', name: 'Test User' }
      ];

      const jsonlContent = testData.map(d => JSON.stringify(d)).join('\n');
      const compressed = zlib.gzipSync(jsonlContent);
      fs.writeFileSync(testFile, compressed);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'jsonl'
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(1);
      expect(result.inserted).toBe(1);
    });

    it('should handle larger gzip-compressed files', async () => {
      const testFile = path.join(testDataDir, 'larger.jsonl.gz');
      const testData = [];
      // Reduced from 1000 to 100 to keep test fast in LocalStack
      for (let i = 0; i < 100; i++) {
        testData.push({ id: `u${i}`, name: `User ${i}`, email: `user${i}@example.com` });
      }

      const jsonlContent = testData.map(d => JSON.stringify(d)).join('\n');
      const compressed = zlib.gzipSync(jsonlContent);
      fs.writeFileSync(testFile, compressed);

      const plugin = new ImporterPlugin({
      logLevel: 'silent',
        resource: 'test_users',
        format: 'jsonl',
        batchSize: 50,
      });

      await database.usePlugin(plugin);
      const result = await plugin.import(testFile);

      expect(result.processed).toBe(100);
      expect(result.inserted).toBe(100);
      expect(result.errors).toBe(0);
    });
  });
});
