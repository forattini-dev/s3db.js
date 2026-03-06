import { afterEach, describe, expect, it } from 'vitest';

import { Database } from '../../../src/database.class.js';
import { MemoryClient } from '../../../src/clients/memory-client.class.js';

describe('Database Client Initialization', () => {
  const databases: Database[] = [];

  afterEach(async () => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db?.isConnected()) {
        await db.disconnect();
      }
    }
  });

  it('defers memory client creation until connect while preserving parsed config', async () => {
    const db = new Database({
      connectionString: 'memory://lazy-bucket/nested/prefix',
      logLevel: 'silent',
      deferMetadataWrites: true
    });
    databases.push(db);

    expect((db as unknown as { client?: unknown }).client).toBeUndefined();
    expect(db.connectionString).toBe('memory://lazy-bucket/nested/prefix');
    expect(db.bucket).toBe('lazy-bucket');
    expect(db.keyPrefix).toBe('nested/prefix');

    await db.connect();

    expect(db.client).toBeInstanceOf(MemoryClient);
    expect((db.client as unknown as { bucket?: string }).bucket).toBe('lazy-bucket');
    expect((db.client as unknown as { keyPrefix?: string }).keyPrefix).toBe('nested/prefix');
  });

  it('keeps explicit client instances available immediately', () => {
    const client = new MemoryClient({
      bucket: 'custom-client-bucket',
      keyPrefix: 'custom-prefix'
    });

    const db = new Database({
      client,
      logLevel: 'silent',
      deferMetadataWrites: true
    });
    databases.push(db);

    expect(db.client).toBe(client);
    expect(db.bucket).toBe('custom-client-bucket');
    expect(db.keyPrefix).toBe('custom-prefix');
  });
});
