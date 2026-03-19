import path from 'path';
import { rm } from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { Database } from '../../../src/database.class.js';
import { clearValidatorCache } from '../../../src/concerns/validator-cache.js';
import { createTemporaryPathForTest } from '#tests/config.js';

describe('SQLite schema evolution', () => {
  const databases: Database[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db?.isConnected()) {
        await db.disconnect();
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }

    clearValidatorCache();
  });

  it('preserves existing data and stable registries when attributes change after reconnect', async () => {
    clearValidatorCache();

    const tempDir = await createTemporaryPathForTest('s3db-sqlite-schema-evolution');
    tempDirs.push(tempDir);

    const dbPath = path.join(tempDir, 's3db.sqlite');
    const connectionString = `sqlite://${dbPath}`;

    const db1 = new Database({
      connectionString,
      logLevel: 'silent',
      deferMetadataWrites: false
    });
    databases.push(db1);

    await db1.connect();

    const usersV1 = await db1.createResource({
      name: 'users',
      attributes: {
        name: 'string',
        email: 'email'
      }
    });

    const insertedV1 = await usersV1.insert({
      name: 'Ada',
      email: 'ada@example.com'
    });

    expect(db1.savedMetadata?.resources.users.currentVersion).toBe('v1');

    const initialMapping = { ...db1.savedMetadata!.resources.users.schemaRegistry!.mapping };

    await db1.disconnect();

    const db2 = new Database({
      connectionString,
      logLevel: 'silent',
      deferMetadataWrites: false
    });
    databases.push(db2);

    await db2.connect();

    const usersV2 = await db2.createResource({
      name: 'users',
      attributes: {
        name: 'string',
        email: 'email',
        age: 'number|optional'
      }
    });

    expect(db2.savedMetadata?.resources.users.currentVersion).toBe('v2');
    expect(Object.keys(db2.savedMetadata?.resources.users.versions || {})).toEqual(
      expect.arrayContaining(['v1', 'v2'])
    );

    const updatedMapping = db2.savedMetadata!.resources.users.schemaRegistry!.mapping;

    expect(updatedMapping.name).toBe(initialMapping.name);
    expect(updatedMapping.email).toBe(initialMapping.email);
    expect(updatedMapping.age).toBeGreaterThan(Math.max(initialMapping.name!, initialMapping.email!));

    const reloadedV1 = await usersV2.get(insertedV1.id);

    expect(reloadedV1.name).toBe('Ada');
    expect(reloadedV1.email).toBe('ada@example.com');
    expect(reloadedV1.age).toBeUndefined();

    const insertedV2 = await usersV2.insert({
      name: 'Grace',
      email: 'grace@example.com',
      age: 37
    });

    expect(insertedV2.age).toBe(37);

    await db2.disconnect();

    const db3 = new Database({
      connectionString,
      logLevel: 'silent',
      deferMetadataWrites: false
    });
    databases.push(db3);

    await db3.connect();

    const usersV3 = await db3.getResource('users');
    const reloadedLegacy = await usersV3.get(insertedV1.id);
    const reloadedCurrent = await usersV3.get(insertedV2.id);

    expect(reloadedLegacy.name).toBe('Ada');
    expect(reloadedLegacy.age).toBeUndefined();
    expect(reloadedCurrent.name).toBe('Grace');
    expect(reloadedCurrent.age).toBe(37);
    expect(db3.savedMetadata?.resources.users.currentVersion).toBe('v2');
  });
});
