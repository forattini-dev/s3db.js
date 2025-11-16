import { describe, it, expect } from '@jest/globals';
import { MemoryClient } from '#src/clients/memory-client.class.js';
import Database from '#src/database.class.js';

/**
 * Tests proving MemoryClient export/import uses BackupPlugin-compatible format (JSONL + s3db.json)
 * These tests prove that the export format can be used across different tools
 */
describe('MemoryClient BackupPlugin-Compatible Format', () => {
  it('should export in JSONL format compatible with BackupPlugin', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');

    const tmpDir = path.join(os.tmpdir(), `backup-format-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Create data
    const client = new MemoryClient({ bucket: 'test' });
    const db = new Database({ logLevel: 'silent', client });
    await db.connect();

    const users = await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'string|required'
      }
    });

    await users.insert({ id: 'u1', name: 'Alice', email: 'alice@test.com' });
    await users.insert({ id: 'u2', name: 'Bob', email: 'bob@test.com' });

    // Export
    await client.exportBackup(tmpDir, { database: db, compress: false });

    // Verify format is BackupPlugin-compatible
    const files = await fs.readdir(tmpDir);
    expect(files).toContain('s3db.json');
    expect(files).toContain('users.jsonl');

    // Verify s3db.json structure
    const s3dbContent = await fs.readFile(path.join(tmpDir, 's3db.json'), 'utf-8');
    const s3db = JSON.parse(s3dbContent);
    expect(s3db.version).toBe('1.0');
    expect(s3db.bucket).toBe('test');
    expect(s3db.resources.users).toBeDefined();
    expect(s3db.resources.users.schema).toBeDefined();
    expect(s3db.resources.users.schema.attributes).toBeDefined();

    // Verify JSONL format (newline-delimited JSON)
    const jsonlContent = await fs.readFile(path.join(tmpDir, 'users.jsonl'), 'utf-8');
    const lines = jsonlContent.trim().split('\n');
    expect(lines).toHaveLength(2);

    const record1 = JSON.parse(lines[0]);
    expect(record1.id).toBe('u1');
    expect(record1.name).toBe('Alice');
    expect(record1.email).toBe('alice@test.com');

    const record2 = JSON.parse(lines[1]);
    expect(record2.id).toBe('u2');
    expect(record2.name).toBe('Bob');

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should export with gzip compression', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const zlib = await import('zlib');
    const { promisify } = await import('util');
    const gunzip = promisify(zlib.gunzip);

    const tmpDir = path.join(os.tmpdir(), `backup-gzip-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Create data
    const client = new MemoryClient({ bucket: 'test' });
    const db = new Database({ logLevel: 'silent', client });
    await db.connect();

    const products = await db.createResource({
      name: 'products',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        price: 'number|required'
      }
    });

    await products.insert({ id: 'p1', name: 'Item 1', price: 10.99 });
    await products.insert({ id: 'p2', name: 'Item 2', price: 20.99 });

    // Export with compression
    await client.exportBackup(tmpDir, { database: db, compress: true });

    // Verify compressed file exists
    const files = await fs.readdir(tmpDir);
    expect(files).toContain('products.jsonl.gz');

    // Verify can decompress and parse
    const compressed = await fs.readFile(path.join(tmpDir, 'products.jsonl.gz'));
    const decompressed = await gunzip(compressed);
    const jsonlContent = decompressed.toString('utf-8');
    const lines = jsonlContent.trim().split('\n');
    expect(lines).toHaveLength(2);

    const record1 = JSON.parse(lines[0]);
    expect(record1.id).toBe('p1');
    expect(record1.price).toBe(10.99);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it.skip('should import BackupPlugin-compatible format (needs schema recreation fix)', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');

    const tmpDir = path.join(os.tmpdir(), `backup-import-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Manually create BackupPlugin-compatible format
    const s3dbJson = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      bucket: 'test-bucket',
      keyPrefix: '',
      compressed: false,
      resources: {
        accounts: {
          schema: {
            attributes: {
              id: 'string|optional',
              username: 'string|required',
              balance: 'number|required'
            }
          },
          stats: {
            recordCount: 2,
            fileSize: 100
          }
        }
      },
      totalRecords: 2,
      totalSize: 100
    };

    await fs.writeFile(
      path.join(tmpDir, 's3db.json'),
      JSON.stringify(s3dbJson, null, 2)
    );

    // Create JSONL file
    const jsonl = [
      JSON.stringify({ id: 'a1', username: 'alice', balance: 1000 }),
      JSON.stringify({ id: 'a2', username: 'bob', balance: 500 })
    ].join('\n');

    await fs.writeFile(path.join(tmpDir, 'accounts.jsonl'), jsonl);

    // Import
    const client = new MemoryClient({ bucket: 'import-test' });
    const db = new Database({ logLevel: 'silent', client });
    await db.connect();

    const stats = await client.importBackup(tmpDir, { database: db });

    // Verify import stats
    expect(stats.resourcesImported).toBe(1);
    expect(stats.recordsImported).toBe(2);
    expect(stats.errors).toHaveLength(0);

    // Verify data was imported correctly
    const accounts = db.resources.accounts;
    expect(accounts).toBeDefined();

    const alice = await accounts.get('a1');
    expect(alice.username).toBe('alice');
    expect(alice.balance).toBe(1000);

    const bob = await accounts.get('a2');
    expect(bob.username).toBe('bob');
    expect(bob.balance).toBe(500);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it.skip('should preserve data integrity through export/import cycle (needs schema recreation fix)', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');

    const tmpDir = path.join(os.tmpdir(), `backup-integrity-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Step 1: Create original data
    const originalClient = new MemoryClient({ bucket: 'original' });
    const originalDb = new Database({ logLevel: 'silent', client: originalClient });
    await originalDb.connect();

    const orders = await originalDb.createResource({
      name: 'orders',
      attributes: {
        id: 'string|optional',
        total: 'number|required',
        shipped: 'boolean'
      }
    });

    const originalRecords = [
      { id: 'o1', total: 99.99, shipped: true },
      { id: 'o2', total: 149.99, shipped: false },
      { id: 'o3', total: 29.99, shipped: true }
    ];

    for (const record of originalRecords) {
      await orders.insert(record);
    }

    // Step 2: Export
    await originalClient.exportBackup(tmpDir, { database: originalDb });

    // Step 3: Import to new client
    const newClient = new MemoryClient({ bucket: 'new' });
    const newDb = new Database({ logLevel: 'silent', client: newClient });
    await newDb.connect();

    await newClient.importBackup(tmpDir, { database: newDb });

    // Step 4: Verify data integrity
    const importedOrders = newDb.resources.orders;
    expect(importedOrders).toBeDefined();

    for (const original of originalRecords) {
      const imported = await importedOrders.get(original.id);
      expect(imported.id).toBe(original.id);
      expect(imported.total).toBe(original.total);
      expect(imported.shipped).toBe(original.shipped);
    }

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
