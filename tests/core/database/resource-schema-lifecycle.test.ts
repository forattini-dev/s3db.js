import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Database } from '../../../src/database.class.js';
import { MemoryClient } from '../../../src/clients/memory-client.class.js';
import Schema from '../../../src/schema.class.js';
import { clearValidatorCache } from '../../../src/concerns/validator-cache.js';

describe('Resource Schema Lifecycle', () => {
  let db: Database;

  beforeEach(async () => {
    clearValidatorCache();

    db = new Database({
      logLevel: 'silent',
      client: new MemoryClient({
        bucket: `resource-schema-lifecycle-${Date.now()}-${Math.random()}`,
        keyPrefix: 'test/'
      }),
      deferMetadataWrites: true
    });

    await db.connect();
  });

  afterEach(async () => {
    if (db) {
      await db.disconnect();
    }
    clearValidatorCache();
  });

  it('keeps a single active validator reference for eager resources', async () => {
    await db.createResource({
      name: 'users',
      attributes: {
        name: 'string',
        email: 'email'
      }
    });

    const statsAfterCreate = Schema.getValidatorCacheStats();

    expect(statsAfterCreate.size).toBe(1);
    expect(statsAfterCreate.totalReferences).toBe(1);

    await db.disconnect();

    const statsAfterDisconnect = Schema.getValidatorCacheStats();

    expect(statsAfterDisconnect.size).toBe(1);
    expect(statsAfterDisconnect.totalReferences).toBe(0);
    expect(statsAfterDisconnect.zeroRefValidators).toBe(1);

    db = null as unknown as Database;
  });

  it('releases the previous schema validator when attributes change', async () => {
    const resource = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string',
        email: 'email'
      }
    });

    resource.updateAttributes({
      name: 'string',
      email: 'email',
      age: 'number|optional'
    });

    const statsAfterUpdate = Schema.getValidatorCacheStats();

    expect(statsAfterUpdate.size).toBe(2);
    expect(statsAfterUpdate.totalReferences).toBe(1);
    expect(statsAfterUpdate.zeroRefValidators).toBe(1);

    const evicted = Schema.evictUnusedValidators(0);
    const statsAfterEviction = Schema.getValidatorCacheStats();

    expect(evicted).toBe(1);
    expect(statsAfterEviction.size).toBe(1);
    expect(statsAfterEviction.totalReferences).toBe(1);
  });
});
