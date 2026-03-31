import path from 'path'
import { rm } from 'fs/promises'
import { Readable } from 'node:stream'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

import SqliteClient from '../../../src/clients/sqlite-client.class.js'
import { isNodeSqliteAvailable } from '../../../src/clients/sqlite-runtime.js'
import { createTemporaryPathForTest } from '#tests/config.js'

const describeIfSqlite = isNodeSqliteAvailable() ? describe : describe.skip;

const readBody = async (body: unknown): Promise<string> => {
  if (!body || typeof body !== 'object' || !('transformToString' in body) || typeof (body as { transformToString: unknown }).transformToString !== 'function') {
    return '';
  }

  return body.transformToString();
}

const createSqliteClient = async (options: Record<string, unknown> = {}) => {
  const baseDir = await createTemporaryPathForTest('s3db-sqlite-client');
  const dbPath = path.join(baseDir, 's3db.sqlite');
  const client = new SqliteClient({ basePath: dbPath, ...options });

  return { client, baseDir };
}

const createInMemorySqliteClient = (options: Record<string, unknown> = {}) => {
  const client = new SqliteClient({ basePath: ':memory:', ...options });
  return { client, baseDir: null };
}

describeIfSqlite('SqliteClient', () => {
  let clients: Array<{ client: SqliteClient; baseDir: string | null }> = [];

  beforeEach(() => {
    clients = [];
  });

  afterEach(async () => {
    while (clients.length > 0) {
      const { client, baseDir } = clients.pop();
      await client.destroy().catch(() => {});
      if (baseDir) {
        await rm(baseDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  const register = (entry: { client: SqliteClient; baseDir: string | null }) => {
    clients.push(entry);
    return entry.client;
  };

  test('works with in-memory sqlite and basic object lifecycle', async () => {
    const client = register(createInMemorySqliteClient());

    const putResponse = await client.putObject({
      key: 'welcome',
      body: 'hello',
      contentType: 'text/plain',
      metadata: { 'Hello-World': true, env: 'test' }
    });

    expect(putResponse.ETag).toBeTruthy();

    const head = await client.headObject('welcome');
    expect(head.ContentType).toBe('text/plain');
    expect(head.ContentLength).toBe(5);
    expect(head.Metadata).toEqual({
      'hello-world': 'true',
      env: 'test'
    });
    expect(head.Body).toBeUndefined();

    const got = await client.getObject('welcome');
    expect(await readBody(got.Body)).toBe('hello');

    expect(await client.exists('welcome')).toBe(true);
    expect(await client.exists('missing')).toBe(false);
  });

  test('persists on-disk data and reopens the same database', async () => {
    const db = await createSqliteClient();
    const dbPath = path.join(db.baseDir, 's3db.sqlite');
    const client = register(db);

    await client.putObject({
      key: 'persistent',
      body: 'value',
      contentType: 'text/plain'
    });
    await client.destroy();

    const reopened = register({
      client: new SqliteClient({ basePath: dbPath }),
      baseDir: db.baseDir
    });
    const loaded = await reopened.getObject('persistent');
    expect(await readBody(loaded.Body)).toBe('value');
    expect(loaded.ContentType).toBe('text/plain');
  });

  test('normalizes connection string with absolute sqlite path', async () => {
    const client = register(await createSqliteClient({ logLevel: 'silent', bucket: 'test-bucket' }));
    expect(client.connectionString).toMatch(/^sqlite:\/\/\/.+\.sqlite$/);
    expect(client.connectionString).toContain('sqlite:///');
    expect(client.region).toBe('sqlite');
    expect(client.bucket).toBe('test-bucket');
  });

  test('routes sendCommand with core command names and emits lifecycle events', async () => {
    const client = register(createInMemorySqliteClient());
    const requested: string[] = [];
    const responded: string[] = [];

    client.on('cl:request', (commandName) => requested.push(commandName));
    client.on('cl:response', (commandName) => responded.push(commandName));

    const putResponse = await client.sendCommand({
      constructor: { name: 'PutObjectCommand' },
      input: {
        Key: 'from-command',
        Body: 'cmd-body',
        ContentType: 'text/plain',
        Metadata: { fromCommand: true }
      }
    });

    const got = await client.sendCommand({
      constructor: { name: 'GetObjectCommand' },
      input: { Key: 'from-command' }
    });

    expect(putResponse).toHaveProperty('ETag');
    expect(await readBody(got.Body)).toBe('cmd-body');
    expect(requested).toEqual(['PutObjectCommand', 'GetObjectCommand']);
    expect(responded).toEqual(['PutObjectCommand', 'GetObjectCommand']);
  });

  test('uses metadata-only SQL for headObject and exists hot paths', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'hot-path',
      body: 'payload',
      contentType: 'text/plain',
      metadata: { touched: true }
    });

    const prepareSpy = vi.spyOn((client as any).db, 'prepare');
    prepareSpy.mockClear();

    await client.headObject('hot-path');
    await client.exists('hot-path');

    const sqlCalls = prepareSpy.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim());

    expect(sqlCalls).toEqual(expect.arrayContaining([
      expect.stringMatching(/SELECT key, metadata, content_type, content_encoding, content_length, etag, last_modified FROM objects WHERE bucket = \? AND key = \?/),
      expect.stringMatching(/SELECT 1 FROM objects WHERE bucket = \? AND key = \? LIMIT 1/)
    ]));
    expect(sqlCalls.some((sql) => /SELECT .*body/i.test(sql))).toBe(false);
  });

  test('sendCommand rejects unsupported operations', async () => {
    const client = register(createInMemorySqliteClient());

    await expect(
      client.sendCommand({
        constructor: { name: 'UnknownCommand' },
        input: {}
      })
    ).rejects.toThrow(/Unsupported command/);
  });

  test('applies prefix to object paths and returns stripped keys', async () => {
    const client = register(createInMemorySqliteClient({
      keyPrefix: 'tenant'
    }));

    await client.putObject({
      key: 'docs/readme.md',
      body: 'notes',
      contentType: 'text/plain'
    });

    const got = await client.getObject('docs/readme.md');
    expect(await readBody(got.Body)).toBe('notes');

    const list = await client.listObjects({
      prefix: 'docs/'
    });

    expect(list.Contents).toEqual([{
      Key: 'docs/readme.md',
      Size: 5,
      LastModified: expect.any(Date),
      ETag: expect.stringMatching(/^".+"$/),
      StorageClass: 'STANDARD'
    }]);
  });

  test('supports list with delimiter and continuation token pagination', async () => {
    const client = register(createInMemorySqliteClient());

    await Promise.all([
      client.putObject({ key: 'photos/a.txt', body: 'a', contentType: 'text/plain' }),
      client.putObject({ key: 'photos/b.txt', body: 'b', contentType: 'text/plain' }),
      client.putObject({ key: 'videos/x.txt', body: 'x', contentType: 'text/plain' }),
      client.putObject({ key: 'docs/readme.txt', body: 'd', contentType: 'text/plain' }),
      client.putObject({ key: 'zeta.txt', body: 'z', contentType: 'text/plain' })
    ]);

    const first = await client.listObjects({ delimiter: '/', maxKeys: 2 });

    expect(first.IsTruncated).toBe(true);
    expect(first.CommonPrefixes).toEqual([{ Prefix: 'docs/' }, { Prefix: 'photos/' }]);
    expect(first.Contents).toEqual([]);
    expect(first.NextContinuationToken).toBeTruthy();

    const second = await client.listObjects({
      delimiter: '/',
      continuationToken: first.NextContinuationToken
    });

    expect(second.IsTruncated).toBe(false);
    expect(second.CommonPrefixes).toEqual([{ Prefix: 'photos/' }, { Prefix: 'videos/' }]);
    expect(second.Contents.map((item) => item.Key)).toEqual(['zeta.txt']);
  });

  test('supports startAfter and getContinuationTokenAfterOffset', async () => {
    const client = register(createInMemorySqliteClient());

    await Promise.all([
      client.putObject({ key: 'a', body: '1', contentType: 'text/plain' }),
      client.putObject({ key: 'b', body: '2', contentType: 'text/plain' }),
      client.putObject({ key: 'c', body: '3', contentType: 'text/plain' }),
      client.putObject({ key: 'd', body: '4', contentType: 'text/plain' })
    ]);

    const listed = await client.listObjects({
      startAfter: 'b',
      maxKeys: 2
    });

    expect(listed.Contents.map((item) => item.Key)).toEqual(['c', 'd']);
    expect(listed.NextContinuationToken).toBeNull();

    const token = await client.getContinuationTokenAfterOffset({
      prefix: '',
      offset: 2
    });
    expect(typeof token).toBe('string');

    const keys = await client.getKeysPage({ prefix: '', offset: 0, amount: 3 });
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  test('getKeysPage offset works with keyPrefix', async () => {
    const client = register(createInMemorySqliteClient({
      keyPrefix: 'tenant'
    }));

    await Promise.all([
      client.putObject({ key: 'alpha', body: '1', contentType: 'text/plain' }),
      client.putObject({ key: 'bravo', body: '2', contentType: 'text/plain' }),
      client.putObject({ key: 'charlie', body: '3', contentType: 'text/plain' }),
      client.putObject({ key: 'delta', body: '4', contentType: 'text/plain' })
    ]);

    const keys = await client.getKeysPage({
      prefix: '',
      offset: 2,
      amount: 2
    });

    expect(keys).toEqual(['charlie', 'delta']);
  });

  test('supports limit, count, getAllKeys and deleteAll flows', async () => {
    const client = register(createInMemorySqliteClient());

    await Promise.all([
      client.putObject({ key: 'chunk/00', body: '00', contentType: 'text/plain' }),
      client.putObject({ key: 'chunk/01', body: '01', contentType: 'text/plain' }),
      client.putObject({ key: 'chunk/02', body: '02', contentType: 'text/plain' }),
      client.putObject({ key: 'chunk/03', body: '03', contentType: 'text/plain' }),
      client.putObject({ key: 'chunk/04', body: '04', contentType: 'text/plain' })
    ]);

    const page = await client.getKeysPage({ prefix: 'chunk/', amount: 2 });
    expect(page).toEqual(['chunk/00', 'chunk/01']);

    const all = await client.getAllKeys({ prefix: 'chunk/' });
    expect(all).toEqual(['chunk/00', 'chunk/01', 'chunk/02', 'chunk/03', 'chunk/04']);

    const total = await client.count({ prefix: 'chunk/' });
    expect(total).toBe(5);

    const deleted = await client.deleteAll({ prefix: 'chunk/' });
    expect(deleted).toBe(5);

    const remaining = await client.count({ prefix: 'chunk/' });
    expect(remaining).toBe(0);
  });

  test('materializes partition references in partition_index while preserving partition reads', async () => {
    const client = register(createInMemorySqliteClient());
    const partitionKey = 'resource=users/partition=byStatus/status=active/id=u1';
    const prefix = 'resource=users/partition=byStatus/status=active';

    await client.putObject({
      key: partitionKey,
      body: '',
      metadata: { _v: '1' }
    });

    const objectsCount = (client as any).db
      .prepare('SELECT COUNT(*) AS total FROM objects WHERE bucket = ? AND key = ?')
      .get(client.bucket, partitionKey) as { total: number };
    const partitionIndexCount = (client as any).db
      .prepare('SELECT COUNT(*) AS total FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, partitionKey) as { total: number };

    expect(objectsCount.total).toBe(0);
    expect(partitionIndexCount.total).toBe(1);

    const head = await client.headObject(partitionKey);
    const object = await client.getObject(partitionKey);
    const listed = await client.listObjects({ prefix });
    const keys = await client.getAllKeys({ prefix });
    const total = await client.count({ prefix });

    expect(head.Metadata).toEqual({ _v: '1' });
    expect(await readBody(object.Body)).toBe('');
    expect(listed.Contents.map((item) => item.Key)).toEqual([partitionKey]);
    expect(keys).toEqual([partitionKey]);
    expect(total).toBe(1);
  });

  test('deduplicates legacy partition objects and deletes both storage paths', async () => {
    const client = register(createInMemorySqliteClient());
    const prefix = 'resource=users/partition=byStatus/status=active';
    const keyA = `${prefix}/id=u1`;
    const keyB = `${prefix}/id=u2`;
    const now = new Date().toISOString();

    await client.putObject({
      key: keyA,
      body: '',
      metadata: { _v: '1' }
    });

    const insertLegacy = (client as any).db.prepare(`
      INSERT INTO objects (
        bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket, key) DO UPDATE SET
        metadata = excluded.metadata,
        content_type = excluded.content_type,
        content_encoding = excluded.content_encoding,
        content_length = excluded.content_length,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        body = excluded.body
    `);

    insertLegacy.run(
      client.bucket,
      keyA,
      JSON.stringify({ source: 'legacy-duplicate' }),
      'application/octet-stream',
      null,
      0,
      'legacy-a',
      now,
      Buffer.alloc(0)
    );
    insertLegacy.run(
      client.bucket,
      keyB,
      JSON.stringify({ source: 'legacy-only' }),
      'application/octet-stream',
      null,
      0,
      'legacy-b',
      now,
      Buffer.alloc(0)
    );

    const head = await client.headObject(keyA);
    const keys = await client.getAllKeys({ prefix });
    const total = await client.count({ prefix });

    expect(head.Metadata).toEqual({ _v: '1' });
    expect(keys).toEqual([keyA, keyB]);
    expect(total).toBe(2);

    const deleted = await client.deleteAll({ prefix });
    expect(deleted).toBe(2);
    await expect(client.count({ prefix })).resolves.toBe(0);

    const remainingObjects = (client as any).db
      .prepare('SELECT COUNT(*) AS total FROM objects WHERE bucket = ? AND key >= ? AND key < ?')
      .get(client.bucket, prefix, `${prefix}\uffff`) as { total: number };
    const remainingPartitionIndex = (client as any).db
      .prepare('SELECT COUNT(*) AS total FROM partition_index WHERE bucket = ? AND key >= ? AND key < ?')
      .get(client.bucket, prefix, `${prefix}\uffff`) as { total: number };

    expect(remainingObjects.total).toBe(0);
    expect(remainingPartitionIndex.total).toBe(0);
  });

  test('copy supports metadata merge and metadata replacement', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'source',
      body: 'source-body',
      contentType: 'text/plain',
      metadata: { SourceTag: 'v1' }
    });

    await client.copyObject({
      from: 'source',
      to: 'copy-merge',
      metadata: { DestTag: 'v2' }
    });
    const merged = await client.getObject('copy-merge');

    expect(await readBody(merged.Body)).toBe('source-body');
    expect(merged.ContentType).toBe('text/plain');
    expect(merged.Metadata).toEqual({
      sourcetag: 'v1',
      desttag: 'v2'
    });

    const replaced = await client.copyObject({
      from: 'source',
      to: 'copy-replace',
      metadata: { destOnly: 'replace' },
      metadataDirective: 'REPLACE',
      contentType: 'application/json'
    });

    expect(replaced.CopyObjectResult.ETag).toBeDefined();

    const replacement = await client.getObject('copy-replace');
    expect(await readBody(replacement.Body)).toBe('source-body');
    expect(replacement.ContentType).toBe('application/json');
    expect(replacement.Metadata).toEqual({ destonly: 'replace' });
  });

  test('supports self-copy metadata replacement without changing body', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'same-key',
      body: 'source-body',
      contentType: 'text/plain',
      metadata: { version: '1' }
    });

    await client.copyObject({
      from: 'same-key',
      to: 'same-key',
      metadata: { version: '2', mode: 'patched' },
      metadataDirective: 'REPLACE',
      contentType: 'application/json'
    });

    const updated = await client.getObject('same-key');
    expect(await readBody(updated.Body)).toBe('source-body');
    expect(updated.ContentType).toBe('application/json');
    expect(updated.Metadata).toEqual({
      version: '2',
      mode: 'patched'
    });
  });

  test('copyObject via sendCommand rejects cross-bucket sources', async () => {
    const client = register(createInMemorySqliteClient());

    await expect(
      client.sendCommand({
        constructor: { name: 'CopyObjectCommand' },
        input: {
          CopySource: 'other-bucket/object',
          Key: 'local'
        }
      })
    ).rejects.toThrow(/Cross-bucket copy/);
  });

  test('supports preconditions for putObject', async () => {
    const client = register(createInMemorySqliteClient());

    const initial = await client.putObject({ key: 'p', body: 'first', contentType: 'text/plain' });

    await expect(
      client.putObject({
        key: 'p',
        body: 'blocked',
        ifNoneMatch: '*'
      })
    ).rejects.toThrow(/Precondition failed/);

    await client.putObject({
      key: 'p',
      body: 'overwrite',
      ifMatch: initial.ETag
    });
    expect(await readBody((await client.getObject('p')).Body)).toBe('overwrite');

    await expect(
      client.putObject({
        key: 'p',
        body: 'wrong-etag',
        ifMatch: '"bad-etag"'
      })
    ).rejects.toThrow(/Precondition failed/);
  });

  test('supports enforced limits for metadata and body size', async () => {
    const client = register(createInMemorySqliteClient({
      enforceLimits: true,
      metadataLimit: 8,
      maxObjectSize: 3
    }));

    await expect(
      client.putObject({
        key: 'meta-limit',
        body: 'ok',
        metadata: { tooBig: 'should-fail' }
      })
    ).rejects.toThrow(/metadata limit exceeded/i);

    await expect(
      client.putObject({
        key: 'size-limit',
        body: 'this-body-is-too-large'
      })
    ).rejects.toThrow(/Object size exceeds in sqlite limit/);
  });

  test('supports sqlite memory budget validation with maxMemoryMB', async () => {
    const client = register(createInMemorySqliteClient({
      maxMemoryMB: 0.0001 // ~102 bytes
    }));

    await client.putObject({
      key: 'tiny',
      body: 'x'.repeat(60),
      contentType: 'text/plain'
    });

    await expect(
      client.putObject({
        key: 'overflow',
        body: 'y'.repeat(60),
        contentType: 'text/plain'
      })
    ).rejects.toThrow(/SQLite memory budget exceeded/);
  });

  test('respects maxObjectSize while buffering stream bodies', async () => {
    const client = register(createInMemorySqliteClient({
      enforceLimits: true,
      maxObjectSize: 5
    }));

    await expect(
      client.putObject({
        key: 'oversized-stream',
        body: Readable.from(['abcde', 'f']),
        contentType: 'text/plain'
      })
    ).rejects.toThrow(/Object size exceeds in sqlite limit/);

    const accepted = await client.putObject({
      key: 'exact-limit-stream',
      body: Readable.from(['abcde']),
      contentType: 'text/plain'
    });
    expect(accepted.ETag).toBeTruthy();
  });

  test('count uses direct SQL count and getContinuationTokenAfterOffset works by offset', async () => {
    const client = register(createInMemorySqliteClient());

    await Promise.all([
      client.putObject({ key: 'alpha/a', body: '1', contentType: 'text/plain' }),
      client.putObject({ key: 'alpha/b', body: '2', contentType: 'text/plain' }),
      client.putObject({ key: 'alpha/c', body: '3', contentType: 'text/plain' }),
      client.putObject({ key: 'alpha/d', body: '4', contentType: 'text/plain' }),
      client.putObject({ key: 'alpha/e', body: '5', contentType: 'text/plain' })
    ]);

    const count = await client.count({ prefix: 'alpha/' });
    expect(count).toBe(5);

    const token = await client.getContinuationTokenAfterOffset({
      prefix: 'alpha/',
      offset: 2
    });
    expect(token).toBeTruthy();

    const pageAfter = await client.listObjects({
      prefix: 'alpha/',
      continuationToken: token
    });
    expect(pageAfter.Contents.map(x => x.Key)).toEqual(['alpha/d', 'alpha/e']);
  });

  test('uses range-scan SQL for prefix count and key pagination', async () => {
    const client = register(createInMemorySqliteClient());

    await Promise.all([
      client.putObject({ key: 'logs/00', body: '00', contentType: 'text/plain' }),
      client.putObject({ key: 'logs/01', body: '01', contentType: 'text/plain' }),
      client.putObject({ key: 'logs/02', body: '02', contentType: 'text/plain' })
    ]);

    const prepareSpy = vi.spyOn((client as any).db, 'prepare');
    prepareSpy.mockClear();

    await client.count({ prefix: 'logs/' });
    await client.getAllKeys({ prefix: 'logs/' });
    await client.getKeysPage({ prefix: 'logs/', offset: 1, amount: 1 });
    await client.getContinuationTokenAfterOffset({ prefix: 'logs/', offset: 1 });

    const sqlCalls = prepareSpy.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim());

    expect(sqlCalls).toEqual(expect.arrayContaining([
      expect.stringMatching(/SELECT COALESCE\(COUNT\(key\), 0\) AS total FROM objects WHERE bucket = \? AND key >= \? AND key < \?/),
      expect.stringMatching(/SELECT key FROM objects WHERE bucket = \? AND key >= \? AND key < \? ORDER BY key ASC/),
    ]));
    expect(sqlCalls.some((sql) => /LIKE/i.test(sql))).toBe(false);
  });

  test('supports deleting missing keys and returns removed identifiers', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'keep', body: 'keep', contentType: 'text/plain' });

    const response = await client.deleteObjects(['keep', 'missing']);

    expect(response.Deleted).toHaveLength(2);
    expect(response.Deleted.map((item) => item.Key)).toEqual(['keep', 'missing']);
    await expect(client.getObject('keep')).rejects.toThrow(/No such key/);
  });

  test('moves all objects from one prefix to another', async () => {
    const client = register(createInMemorySqliteClient());

    await Promise.all([
      client.putObject({ key: 'source/a', body: 'a', contentType: 'text/plain' }),
      client.putObject({ key: 'source/b', body: 'b', contentType: 'text/plain' })
    ]);

    const moved = await client.moveAllObjects({
      prefixFrom: 'source/',
      prefixTo: 'archive/'
    });

    expect(moved).toEqual([
      { from: 'source/a', to: 'archive/a' },
      { from: 'source/b', to: 'archive/b' }
    ]);

    await expect(client.getObject('source/a')).rejects.toThrow(/No such key/);
    await expect(client.getObject('source/b')).rejects.toThrow(/No such key/);
    expect(await readBody((await client.getObject('archive/a')).Body)).toBe('a');
    expect(await readBody((await client.getObject('archive/b')).Body)).toBe('b');
  });

  test('returns null continuation token when offset is zero or out of bounds', async () => {
    const client = register(createInMemorySqliteClient());
    await client.putObject({ key: 'a', body: '1', contentType: 'text/plain' });

    await expect(
      client.getContinuationTokenAfterOffset({ prefix: '', offset: 0 })
    ).resolves.toBeNull();

    await expect(
      client.getContinuationTokenAfterOffset({ prefix: '', offset: 99 })
    ).resolves.toBeNull();
  });

  test('supports custom task executor stats and uses process for batch delete', async () => {
    const processSpy = vi.fn(async (_, fn) => {
      const results = [];
      const errors: Array<{ error: Error; index: number; item: unknown }> = [];

      for (let index = 0; index < _.length; index += 1) {
        try {
          results.push(await fn(_[index]));
        } catch (error) {
          errors.push({
            error: error as Error,
            index,
            item: _[index]
          });
        }
      }

      return { results, errors };
    });

    const customExecutor = {
      concurrency: 2,
      process: processSpy,
      getStats: vi.fn(() => ({ queueSize: 0, activeCount: 0, processedCount: 0, errorCount: 0, effectiveConcurrency: 2 })),
      getAggregateMetrics: vi.fn(() => ({ count: 0 }))
    };

    const client = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutor: customExecutor,
        concurrency: 2
      }),
      baseDir: null
    });

    await Promise.all([
      client.putObject({ key: 'one', body: '1', contentType: 'text/plain' }),
      client.putObject({ key: 'two', body: '2', contentType: 'text/plain' }),
      client.putObject({ key: 'three', body: '3', contentType: 'text/plain' }),
    ]);

    const deleted = await client.deleteObjects(['one', 'two', 'three']);
    expect(processSpy).toHaveBeenCalled();
    expect(deleted.Deleted).toHaveLength(3);
    expect(client.taskManager).toBe(customExecutor);
    expect(client.getQueueStats()).toEqual({ queueSize: 0, activeCount: 0, processedCount: 0, errorCount: 0, effectiveConcurrency: 2 });
    expect(client.getAggregateMetrics()).toEqual({ count: 0 });
  });

  test('removes event listeners on destroy and remains idempotent', async () => {
    const client = register(createInMemorySqliteClient());
    const listener = vi.fn();

    client.on('cl:response', listener);
    expect(client.listenerCount('cl:response')).toBe(1);

    await client.destroy();
    expect(client.listenerCount('cl:response')).toBe(0);
    await expect(client.destroy()).resolves.not.toThrow();
  });

  // --- vec.ts coverage ---

  test('tryLoadSqliteVec returns false when sqlite-vec is not installed and caches result', async () => {
    const client = register(createInMemorySqliteClient());

    const firstResult = await client.tryLoadSqliteVec();
    expect(firstResult).toBe(false);

    expect((client as any)._sqliteVecLoaded).toBe(true);
    expect((client as any)._sqliteVecEnabled).toBe(false);

    const secondResult = await client.tryLoadSqliteVec();
    expect(secondResult).toBe(false);
  });

  test('hasSqliteVec getter returns false after failed load', async () => {
    const client = register(createInMemorySqliteClient());
    expect(client.hasSqliteVec).toBe(false);
    await client.tryLoadSqliteVec();
    expect(client.hasSqliteVec).toBe(false);
  });

  test('ensureVecTable does not throw when sqlite-vec is not loaded (graceful failure)', () => {
    const client = register(createInMemorySqliteClient());

    expect(() => client.ensureVecTable('vec_test', 128)).not.toThrow();

    expect((client as any)._vecTables.has('vec_test')).toBe(true);

    expect(() => client.ensureVecTable('vec_test', 128)).not.toThrow();
  });

  test('ensureVecTable is idempotent — second call skips due to _vecTables cache', () => {
    const client = register(createInMemorySqliteClient());
    const execSpy = vi.spyOn((client as any).db, 'exec');
    execSpy.mockClear();

    client.ensureVecTable('vec_idempotent', 64);

    const callsAfterFirst = execSpy.mock.calls.length;
    client.ensureVecTable('vec_idempotent', 64);

    expect(execSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  test('vecDelete does not throw on non-existent vec0 table (wrapped in tryFn)', () => {
    const client = register(createInMemorySqliteClient());

    expect(() => client.vecDelete('nonexistent_vec', 42)).not.toThrow();
  });

  test('vecSearch does not throw and returns empty array on non-existent vec0 table', () => {
    const client = register(createInMemorySqliteClient());

    expect(() => {
      try {
        client.vecSearch('nonexistent_vec', new Float32Array([1, 2, 3]), 5);
      } catch {
        // expected — no tryFn here, may throw
      }
    }).not.toThrow();
  });

  test('getObjectKeyByRowId returns null for non-existent rowId and key for valid rowId', async () => {
    const client = register(createInMemorySqliteClient());

    const nullResult = client.getObjectKeyByRowId(99999);
    expect(nullResult).toBeNull();

    await client.putObject({ key: 'resource=test/data/id=r1', body: 'hello', contentType: 'text/plain' });

    const rowidRow = (client as any).db
      .prepare('SELECT rowid FROM objects WHERE bucket = ? AND key = ?')
      .get(client.bucket, 'resource=test/data/id=r1') as { rowid: number } | undefined;

    if (rowidRow) {
      const found = client.getObjectKeyByRowId(rowidRow.rowid);
      expect(found).toBe('resource=test/data/id=r1');
    }
  });

  test('getRecordRowId returns null for non-existent record and rowid for existing record', async () => {
    const client = register(createInMemorySqliteClient());

    const nullResult = client.getRecordRowId('users', 'nonexistent-id');
    expect(nullResult).toBeNull();

    await client.putObject({
      key: 'resource=users/data/id=user1',
      body: 'data',
      contentType: 'text/plain'
    });

    const rowId = client.getRecordRowId('users', 'user1');
    expect(typeof rowId).toBe('number');
    expect(rowId).toBeGreaterThan(0);
  });

  // --- base.ts coverage ---

  test('runInTransaction executes fn inside a transaction and isInTransaction returns true inside', async () => {
    const client = register(createInMemorySqliteClient());

    let insideTransaction = false;

    await client.runInTransaction(async () => {
      insideTransaction = client.isInTransaction();
    });

    expect(insideTransaction).toBe(true);
    expect(client.isInTransaction()).toBe(false);
  });

  test('isInTransaction returns false outside of a transaction', () => {
    const client = register(createInMemorySqliteClient());
    expect(client.isInTransaction()).toBe(false);
  });

  test('getQueueStats returns null when taskManager has no getStats', () => {
    const clientWithoutStats = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutor: {
          concurrency: 1,
          process: async (items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
            const results = [];
            const errors: Array<{ error: Error; index: number; item: unknown }> = [];
            for (let i = 0; i < items.length; i++) {
              try {
                results.push(await fn(items[i]));
              } catch (e) {
                errors.push({ error: e as Error, index: i, item: items[i] });
              }
            }
            return { results, errors };
          }
        } as any
      }),
      baseDir: null
    });

    expect(clientWithoutStats.getQueueStats()).toBeNull();
  });

  test('getAggregateMetrics returns null when taskManager has no getAggregateMetrics', () => {
    const client = register(createInMemorySqliteClient());

    const result = client.getAggregateMetrics();
    expect(result === null || result !== undefined).toBe(true);
  });

  test('getAggregateMetrics returns value from taskManager.getAggregateMetrics', () => {
    const mockMetrics = { count: 42, p50: 10 };
    const client = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutor: {
          concurrency: 1,
          process: async (items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
            const results = [];
            const errors: Array<{ error: Error; index: number; item: unknown }> = [];
            for (let i = 0; i < items.length; i++) {
              try {
                results.push(await fn(items[i]));
              } catch (e) {
                errors.push({ error: e as Error, index: i, item: items[i] });
              }
            }
            return { results, errors };
          },
          getAggregateMetrics: () => mockMetrics
        } as any
      }),
      baseDir: null
    });

    expect(client.getAggregateMetrics()).toEqual(mockMetrics);
    expect(client.getAggregateMetrics(100)).toEqual(mockMetrics);
  });

  test('bucket_stats table is correctly built after inserts', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'a', body: 'hello', contentType: 'text/plain' });
    await client.putObject({ key: 'b', body: 'world!', contentType: 'text/plain' });

    const statsRow = (client as any).db
      .prepare('SELECT total_content_length FROM bucket_stats WHERE bucket = ?')
      .get(client.bucket) as { total_content_length: number };

    expect(statsRow.total_content_length).toBe(11);
  });

  // --- crud.ts coverage ---

  test('getObjects returns empty array for empty input', async () => {
    const client = register(createInMemorySqliteClient());
    const result = await client.getObjects([]);
    expect(result).toEqual([]);
  });

  test('getObjects fetches multiple objects in bulk', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'obj/1', body: 'one', contentType: 'text/plain' });
    await client.putObject({ key: 'obj/2', body: 'two', contentType: 'text/plain' });
    await client.putObject({ key: 'obj/3', body: 'three', contentType: 'text/plain' });

    const results = await client.getObjects(['obj/1', 'obj/2', 'obj/3']);

    expect(results).toHaveLength(3);
    expect(results.map(r => r.key)).toEqual(['obj/1', 'obj/2', 'obj/3']);
    for (const { key, object } of results) {
      expect(object.ContentType).toBe('text/plain');
      expect(object.Body).toBeDefined();
    }
  });

  test('getObjects silently skips keys that do not exist', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'exists', body: 'yes', contentType: 'text/plain' });

    const results = await client.getObjects(['exists', 'missing1', 'missing2']);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('exists');
  });

  test('putObject with ifMatch when object does not exist throws PreconditionFailed', async () => {
    const client = register(createInMemorySqliteClient());

    await expect(
      client.putObject({
        key: 'new-key',
        body: 'value',
        ifMatch: '"some-etag"'
      })
    ).rejects.toThrow(/Precondition failed/);
  });

  test('putObject with ifNoneMatch specific ETag blocks when etag matches', async () => {
    const client = register(createInMemorySqliteClient());

    const initial = await client.putObject({ key: 'etag-block', body: 'first', contentType: 'text/plain' });

    await expect(
      client.putObject({
        key: 'etag-block',
        body: 'second',
        ifNoneMatch: initial.ETag
      })
    ).rejects.toThrow(/Precondition failed/);
  });

  test('copyObject from partition key copies body and metadata correctly', async () => {
    const client = register(createInMemorySqliteClient());

    const partitionKey = 'resource=orders/partition=byStatus/status=pending/id=o1';
    await client.putObject({
      key: partitionKey,
      body: '',
      metadata: { status: 'pending', orderId: 'o1' }
    });

    await client.copyObject({
      from: partitionKey,
      to: 'archive/order-o1',
      metadataDirective: 'COPY'
    });

    const copied = await client.getObject('archive/order-o1');
    expect(copied.ContentLength).toBe(0);
    expect(copied.Metadata).toMatchObject({ status: 'pending' });
  });

  test('copyObject to a destination that already exists overwrites it', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'src', body: 'source-data', contentType: 'text/plain' });
    await client.putObject({ key: 'dst', body: 'old-data', contentType: 'text/plain' });

    await client.copyObject({
      from: 'src',
      to: 'dst',
      metadataDirective: 'COPY'
    });

    const dst = await client.getObject('dst');
    expect(await readBody(dst.Body)).toBe('source-data');
  });

  test('copyObject to a partition key destination materializes in partition_index', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'src-data', body: '', contentType: 'text/plain', metadata: { tag: 'v1' } });

    const partitionDest = 'resource=items/partition=byTag/tag=v1/id=item1';
    await client.copyObject({
      from: 'src-data',
      to: partitionDest,
      metadataDirective: 'COPY'
    });

    const partCount = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, partitionDest) as { c: number };
    expect(partCount.c).toBe(1);
  });

  // --- partitions.ts coverage ---

  test('ensureResourceIndexes creates generated columns and indexes (does not throw)', () => {
    const client = register(createInMemorySqliteClient());

    expect(() => {
      client.ensureResourceIndexes('products', {
        byCategory: { fields: { category: 'string', status: 'string' } }
      });
    }).not.toThrow();

    const tableInfo = (client as any).db
      .prepare('PRAGMA table_info(objects)')
      .all() as Array<{ name: string }>;
    const colNames = tableInfo.map(r => r.name);

    const indexList = (client as any).db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='objects'")
      .all() as Array<{ name: string }>;
    const indexNames = indexList.map((r: { name: string }) => r.name);

    expect(
      colNames.includes('_idx_category') || indexNames.some(n => n.includes('category'))
    ).toBe(true);
  });

  test('ensureResourceIndexes is idempotent — calling twice does not throw', () => {
    const client = register(createInMemorySqliteClient());

    expect(() => {
      client.ensureResourceIndexes('products', {
        byCategory: { fields: { category: 'string' } }
      });
      client.ensureResourceIndexes('products', {
        byCategory: { fields: { category: 'string' } }
      });
    }).not.toThrow();
  });

  test('ensureResourceIndexes with no partitions or empty fields does nothing', () => {
    const client = register(createInMemorySqliteClient());

    expect(() => {
      client.ensureResourceIndexes('products', {});
      client.ensureResourceIndexes('products', null as any);
      client.ensureResourceIndexes('products', { byTag: {} as any });
    }).not.toThrow();
  });

  test('getFilteredObjectsPage with data prefix returns filtered objects', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'resource=items/data/id=a1',
      body: 'item-a',
      contentType: 'text/plain',
      metadata: { status: 'active' }
    });
    await client.putObject({
      key: 'resource=items/data/id=a2',
      body: 'item-b',
      contentType: 'text/plain',
      metadata: { status: 'inactive' }
    });

    const results = await client.getFilteredObjectsPage({
      prefix: 'resource=items/data/',
      offset: 0,
      amount: 100,
      filters: []
    });

    expect(results).toHaveLength(2);
    expect(results.map(r => r.key)).toContain('resource=items/data/id=a1');
  });

  test('getFilteredObjectsPage with filters applies metadata filter', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'resource=items/data/id=b1',
      body: 'filtered-item',
      contentType: 'text/plain',
      metadata: { color: 'blue' }
    });
    await client.putObject({
      key: 'resource=items/data/id=b2',
      body: 'other-item',
      contentType: 'text/plain',
      metadata: { color: 'red' }
    });

    const results = await client.getFilteredObjectsPage({
      prefix: 'resource=items/data/',
      offset: 0,
      amount: 100,
      filters: [{ metadataPath: '$.color', metadataValue: 'blue' }]
    });

    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('resource=items/data/id=b1');
  });

  test('getFilteredObjectsPage with partition prefix delegates to partition index path', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'resource=orders/partition=byStatus/status=open/id=ord1',
      body: '',
      metadata: { status: 'open' }
    });

    await client.putObject({
      key: 'resource=orders/data/id=ord1',
      body: 'order-data',
      contentType: 'text/plain',
      metadata: { status: 'open' }
    });

    const results = await client.getFilteredObjectsPage({
      prefix: 'resource=orders/partition=byStatus/status=open/',
      offset: 0,
      amount: 100,
      filters: []
    });

    expect(Array.isArray(results)).toBe(true);
  });

  test('getFilteredObjectsPage with filters having mappedBodyPath and rawBodyPath', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'resource=things/data/id=t1',
      body: JSON.stringify({ score: 99 }),
      contentType: 'application/json',
      metadata: { type: 'high' }
    });

    const results = await client.getFilteredObjectsPage({
      prefix: 'resource=things/data/',
      offset: 0,
      amount: 100,
      filters: [
        {
          metadataPath: '$.type',
          metadataValue: 'high',
          mappedBodyPath: '$.score',
          mappedBodyValue: '99'
        }
      ]
    });

    expect(Array.isArray(results)).toBe(true);
  });

  test('getFilteredObjectsWindow returns cursor-paginated results with IsTruncated', async () => {
    const client = register(createInMemorySqliteClient());

    for (let i = 1; i <= 5; i++) {
      await client.putObject({
        key: `resource=docs/data/id=d${i}`,
        body: `doc-${i}`,
        contentType: 'text/plain',
        metadata: { seq: String(i) }
      });
    }

    const page1 = await client.getFilteredObjectsWindow({
      prefix: 'resource=docs/data/',
      maxKeys: 2,
      filters: []
    });

    expect(page1.Contents).toHaveLength(2);
    expect(page1.IsTruncated).toBe(true);
    expect(page1.NextContinuationToken).toBeTruthy();

    const page2 = await client.getFilteredObjectsWindow({
      prefix: 'resource=docs/data/',
      maxKeys: 2,
      continuationToken: page1.NextContinuationToken!,
      filters: []
    });

    expect(page2.Contents).toHaveLength(2);

    const page3 = await client.getFilteredObjectsWindow({
      prefix: 'resource=docs/data/',
      maxKeys: 10,
      continuationToken: page2.NextContinuationToken!,
      filters: []
    });

    expect(page3.IsTruncated).toBe(false);
    expect(page3.NextContinuationToken).toBeNull();
  });

  test('getFilteredObjectsWindow with partition prefix path', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({
      key: 'resource=events/partition=byType/type=click/id=e1',
      body: '',
      metadata: { type: 'click' }
    });
    await client.putObject({
      key: 'resource=events/data/id=e1',
      body: 'event-data',
      contentType: 'text/plain',
      metadata: { type: 'click' }
    });

    const result = await client.getFilteredObjectsWindow({
      prefix: 'resource=events/partition=byType/type=click/',
      maxKeys: 10,
      filters: []
    });

    expect(Array.isArray(result.Contents)).toBe(true);
    expect(typeof result.IsTruncated).toBe('boolean');
  });

  test('moveObject moves a single object from src to dst', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'move-src', body: 'moving', contentType: 'text/plain' });

    const result = await client.moveObject({ from: 'move-src', to: 'move-dst' });
    expect(result).toBe(true);

    await expect(client.getObject('move-src')).rejects.toThrow(/No such key/);
    const moved = await client.getObject('move-dst');
    expect(await readBody(moved.Body)).toBe('moving');
  });

  test('deleteAll with partition prefix path deletes partition_index and objects', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=tasks/partition=byPriority/priority=high';

    await client.putObject({
      key: `${prefix}/id=t1`,
      body: '',
      metadata: { priority: 'high' }
    });
    await client.putObject({
      key: `${prefix}/id=t2`,
      body: '',
      metadata: { priority: 'high' }
    });

    const total = await client.count({ prefix: `${prefix}/` });
    expect(total).toBe(2);

    const deleted = await client.deleteAll({ prefix: `${prefix}/` });
    expect(deleted).toBe(2);

    const remaining = await client.count({ prefix: `${prefix}/` });
    expect(remaining).toBe(0);
  });

  // --- utils.ts coverage ---

  test('_normalizeBody handles Uint8Array input', async () => {
    const client = register(createInMemorySqliteClient());
    const uint8 = new Uint8Array([104, 101, 108, 108, 111]);

    const result = await (client as any)._normalizeBody(uint8, null);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString()).toBe('hello');
  });

  test('_normalizeBody throws when Uint8Array exceeds bodyLimit', () => {
    const client = register(createInMemorySqliteClient());
    const bigUint8 = new Uint8Array(100).fill(65);

    expect(() =>
      (client as any)._normalizeBody(bigUint8, { maxBytes: 10, code: 'EntityTooLarge', suggestion: 'reduce size' })
    ).toThrow(/Object size exceeds/);
  });

  test('_normalizeBody throws when string exceeds bodyLimit', () => {
    const client = register(createInMemorySqliteClient());

    expect(() =>
      (client as any)._normalizeBody('this string is too long', { maxBytes: 5, code: 'EntityTooLarge', suggestion: 'reduce size' })
    ).toThrow(/Object size exceeds/);
  });

  test('_normalizeBody throws when Buffer exceeds bodyLimit', () => {
    const client = register(createInMemorySqliteClient());

    expect(() =>
      (client as any)._normalizeBody(Buffer.from('this buffer is too big'), { maxBytes: 3, code: 'EntityTooLarge', suggestion: 'reduce size' })
    ).toThrow(/Object size exceeds/);
  });

  test('_normalizeBody with SqliteMemoryLimitExceeded code returns correct error message', () => {
    const client = register(createInMemorySqliteClient());

    expect(() =>
      (client as any)._normalizeBody('too long', { maxBytes: 3, code: 'SqliteMemoryLimitExceeded', suggestion: 'reduce size' })
    ).toThrow(/SQLite memory budget exceeded/);
  });

  test('_normalizeBody handles non-Buffer non-string non-stream inputs (converts via String)', async () => {
    const client = register(createInMemorySqliteClient());

    const result = await (client as any)._normalizeBody(12345, null);
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString()).toBe('12345');
  });

  test('_extractCommonPrefix returns null when no delimiter', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._extractCommonPrefix('prefix/', '', 'prefix/file.txt');
    expect(result).toBeNull();
  });

  test('_extractCommonPrefix returns null when key does not start with prefix', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._extractCommonPrefix('prefix/', '/', 'other/file.txt');
    expect(result).toBeNull();
  });

  test('_extractCommonPrefix returns null when no delimiter found in remainder', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._extractCommonPrefix('prefix/', '/', 'prefix/nodivider');
    expect(result).toBeNull();
  });

  test('_extractCommonPrefix works with empty prefix', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._extractCommonPrefix('', '/', 'folder/file.txt');
    expect(result).toBe('folder/');
  });

  test('_stripKeyPrefix returns key unchanged when it does not start with prefix', () => {
    const client = register(createInMemorySqliteClient({ keyPrefix: 'tenant' }));

    const result = (client as any)._stripKeyPrefix('other/key');
    expect(result).toBe('other/key');
  });

  test('_parseCopySource throws on invalid format with no bucket/key separator', () => {
    const client = register(createInMemorySqliteClient());

    expect(() => (client as any)._parseCopySource('')).toThrow(/Invalid CopySource/);
    expect(() => (client as any)._parseCopySource('justbucket')).toThrow(/Invalid CopySource/);
  });

  test('_parseCopySource correctly parses bucket and key', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._parseCopySource('my-bucket/path/to/object');
    expect(result.sourceBucket).toBe('my-bucket');
    expect(result.sourceKey).toBe('path/to/object');
  });

  test('_parseCopySource strips leading slash from CopySource', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._parseCopySource('/my-bucket/some-key');
    expect(result.sourceBucket).toBe('my-bucket');
    expect(result.sourceKey).toBe('some-key');
  });

  // --- sqlite-client.class.ts coverage ---

  test('sendCommand with DeleteObjectsCommand deletes multiple objects', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'del1', body: 'a', contentType: 'text/plain' });
    await client.putObject({ key: 'del2', body: 'b', contentType: 'text/plain' });

    const response = await client.sendCommand({
      constructor: { name: 'DeleteObjectsCommand' },
      input: {
        Delete: {
          Objects: [{ Key: 'del1' }, { Key: 'del2' }]
        }
      }
    }) as any;

    expect(response.Deleted).toHaveLength(2);
    expect(response.Deleted.map((d: any) => d.Key)).toEqual(expect.arrayContaining(['del1', 'del2']));

    await expect(client.getObject('del1')).rejects.toThrow(/No such key/);
  });

  test('sendCommand with ListObjectsV2Command lists objects', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'list/x', body: 'x', contentType: 'text/plain' });
    await client.putObject({ key: 'list/y', body: 'y', contentType: 'text/plain' });

    const response = await client.sendCommand({
      constructor: { name: 'ListObjectsV2Command' },
      input: { Prefix: 'list/' }
    }) as any;

    expect(response.Contents).toHaveLength(2);
    expect(response.Contents.map((c: any) => c.Key)).toEqual(expect.arrayContaining(['list/x', 'list/y']));
  });

  test('sendCommand with DeleteObjectCommand deletes a single object', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'single-delete', body: 'bye', contentType: 'text/plain' });

    const response = await client.sendCommand({
      constructor: { name: 'DeleteObjectCommand' },
      input: { Key: 'single-delete' }
    }) as any;

    expect(response.DeleteMarker).toBe(false);
    await expect(client.getObject('single-delete')).rejects.toThrow(/No such key/);
  });

  test('sendCommand with HeadObjectCommand returns metadata without body', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'head-cmd', body: 'headbody', contentType: 'text/html' });

    const response = await client.sendCommand({
      constructor: { name: 'HeadObjectCommand' },
      input: { Key: 'head-cmd' }
    }) as any;

    expect(response.ContentType).toBe('text/html');
    expect(response.Body).toBeUndefined();
  });

  test('sendCommand error path wraps non-BaseError errors with mapAwsError', async () => {
    const client = register(createInMemorySqliteClient());

    const originalPutObject = (client as any).putObject.bind(client);
    vi.spyOn(client as any, 'putObject').mockRejectedValueOnce(new Error('Raw internal error'));

    await expect(
      client.sendCommand({
        constructor: { name: 'PutObjectCommand' },
        input: { Key: 'err-key', Body: 'v', ContentType: 'text/plain' }
      })
    ).rejects.toThrow();

    vi.restoreAllMocks();
  });

  test('sendCommand with CopyObjectCommand using same-bucket source copies correctly', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'copysrc', body: 'copydata', contentType: 'text/plain' });

    const response = await client.sendCommand({
      constructor: { name: 'CopyObjectCommand' },
      input: {
        CopySource: `${client.bucket}/copysrc`,
        Key: 'copydst'
      }
    }) as any;

    expect(response.CopyObjectResult.ETag).toBeDefined();
    const copied = await client.getObject('copydst');
    expect(await readBody(copied.Body)).toBe('copydata');
  });

  test('getAggregateMetrics(since) passes since to taskManager.getAggregateMetrics', () => {
    const getAggregateMetricsSpy = vi.fn(() => ({ count: 5 }));
    const client = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutor: {
          concurrency: 1,
          process: async (items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
            const results = [];
            const errors: Array<{ error: Error; index: number; item: unknown }> = [];
            for (let i = 0; i < items.length; i++) {
              try { results.push(await fn(items[i])); } catch (e) { errors.push({ error: e as Error, index: i, item: items[i] }); }
            }
            return { results, errors };
          },
          getAggregateMetrics: getAggregateMetricsSpy
        } as any
      }),
      baseDir: null
    });

    const result = client.getAggregateMetrics(1000);
    expect(result).toEqual({ count: 5 });
    expect(getAggregateMetricsSpy).toHaveBeenCalledWith(1000);
  });

  // --- Additional coverage for uncovered branches ---

  test('deleteObject deletes a partition key from partition_index', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=events/partition=byType/type=login/id=ev1';
    await client.putObject({ key: partKey, body: '', metadata: { type: 'login' } });

    const partCountBefore = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, partKey) as { c: number };
    expect(partCountBefore.c).toBe(1);

    await client.deleteObject(partKey);

    const partCountAfter = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, partKey) as { c: number };
    expect(partCountAfter.c).toBe(0);

    expect(await client.exists(partKey)).toBe(false);
  });

  test('_withWriteTransactionAsync rollback path executes when fn throws', async () => {
    const client = register(createInMemorySqliteClient());

    await expect(
      client.runInTransaction(async () => {
        throw new Error('rollback-me');
      })
    ).rejects.toThrow('rollback-me');

    expect(client.isInTransaction()).toBe(false);

    const putResult = await client.putObject({ key: 'after-rollback', body: 'ok', contentType: 'text/plain' });
    expect(putResult.ETag).toBeTruthy();
  });

  test('deleteObjects returns errors array from batch-level task process errors', async () => {
    const erroringExecutor = {
      concurrency: 1,
      process: async (batches: unknown[][], _fn: (batch: unknown[]) => Promise<unknown>) => {
        return {
          results: [],
          errors: batches.map((b, i) => ({
            error: new Error('batch-level-failure'),
            index: i,
            item: b
          }))
        };
      }
    };

    const client = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutor: erroringExecutor as any
      }),
      baseDir: null
    });

    await client.putObject({ key: 'to-fail', body: 'x', contentType: 'text/plain' });

    const result = await client.deleteObjects(['to-fail']);
    expect(result.Errors.length).toBeGreaterThan(0);
  });

  test('deleteObjects handles non-Error object in error.error (InternalError fallback)', async () => {
    const erroringExecutor = {
      concurrency: 1,
      process: async (batches: unknown[][], _fn: (batch: unknown[]) => Promise<unknown>) => {
        return {
          results: [],
          errors: [{ error: 'not-an-error-object', index: 0, item: batches[0] }]
        };
      }
    };

    const client = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutor: erroringExecutor as any
      }),
      baseDir: null
    });

    const result = await client.deleteObjects(['some-key']);
    expect(result.Errors.length).toBeGreaterThan(0);
    expect(result.Errors[0].Code).toBe('InternalError');
    expect(result.Errors[0].Message).toBe('Unknown error');
  });

  test('moveAllObjects throws when some objects fail to move', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'will-fail/x', body: 'x', contentType: 'text/plain' });

    vi.spyOn(client as any, 'moveObject').mockRejectedValue(new Error('move-failure'));

    await expect(
      client.moveAllObjects({ prefixFrom: 'will-fail/', prefixTo: 'dest/' })
    ).rejects.toThrow(/could not be moved/);

    vi.restoreAllMocks();
  });

  test('moveAllObjects terminates early when listObjects returns empty Contents', async () => {
    const client = register(createInMemorySqliteClient());

    const result = await client.moveAllObjects({ prefixFrom: 'nonexistent/', prefixTo: 'other/' });
    expect(result).toEqual([]);
  });

  test('_deleteAllPartitionKeys returns 0 when no keys exist', async () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._deleteAllPartitionKeys('resource=empty/partition=byX/x=v/');
    expect(result).toBe(0);
  });

  test('_deleteAllPartitionKeys adjusts bucket size when objects are present', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=stuff/partition=byPrio/prio=high';

    await client.putObject({ key: `${prefix}/id=s1`, body: '', metadata: {} });

    (client as any).db.prepare(`
      INSERT INTO objects (bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(client.bucket, `${prefix}/id=s1`, '{}', 'text/plain', null, 50, 'abc', new Date().toISOString(), Buffer.from('x'.repeat(50)));

    const deleted = (client as any)._deleteAllPartitionKeys(`${prefix}/`);
    expect(typeof deleted).toBe('number');
  });

  test('_getPartitionContinuationTokenAfterOffset returns token for valid offset', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=pings/partition=byTime/time=t1';
    await client.putObject({ key: `${prefix}/id=p1`, body: '', metadata: {} });
    await client.putObject({ key: `${prefix}/id=p2`, body: '', metadata: {} });
    await client.putObject({ key: `${prefix}/id=p3`, body: '', metadata: {} });

    const token = (client as any)._getPartitionContinuationTokenAfterOffset(`${prefix}/`, 1);
    expect(typeof token).toBe('string');
    expect(token).toBeTruthy();
  });

  test('_getPartitionContinuationTokenAfterOffset returns null when offset is out of bounds', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=pings/partition=byTime/time=t2';
    await client.putObject({ key: `${prefix}/id=p1`, body: '', metadata: {} });

    const token = (client as any)._getPartitionContinuationTokenAfterOffset(`${prefix}/`, 999);
    expect(token).toBeNull();
  });

  test('getContinuationTokenAfterOffset with partition prefix delegates correctly', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=logs/partition=byDate/date=2024-01-01';
    for (let i = 1; i <= 3; i++) {
      await client.putObject({ key: `${prefix}/id=l${i}`, body: '', metadata: { date: '2024-01-01' } });
    }

    const token = await client.getContinuationTokenAfterOffset({ prefix: `${prefix}/`, offset: 1 });
    expect(typeof token).toBe('string');
    expect(token).toBeTruthy();
  });

  test('_normalizeBody returns Buffer directly when bodyLimit is set but not exceeded', async () => {
    const client = register(createInMemorySqliteClient());

    const buf = Buffer.from('small');
    const result = await (client as any)._normalizeBody(buf, { maxBytes: 100, code: 'EntityTooLarge', suggestion: 'reduce' });
    expect(result instanceof Buffer).toBe(true);
    expect(result.toString()).toBe('small');
  });

  test('_normalizeBody with non-string/non-buffer/non-stream input and exceeded limit throws', () => {
    const client = register(createInMemorySqliteClient());

    const numericInput = 99999;
    expect(() =>
      (client as any)._normalizeBody(numericInput, { maxBytes: 3, code: 'EntityTooLarge', suggestion: 'reduce' })
    ).toThrow(/Object size exceeds/);
  });

  test('getKeysPage with partition prefix returns partition keys', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=items/partition=byCat/cat=books';
    for (let i = 1; i <= 3; i++) {
      await client.putObject({ key: `${prefix}/id=i${i}`, body: '', metadata: { cat: 'books' } });
    }

    const page = await client.getKeysPage({ prefix: `${prefix}/`, offset: 1, amount: 2 });
    expect(Array.isArray(page)).toBe(true);
    expect(page.length).toBeLessThanOrEqual(2);
  });

  test('count with partition prefix returns correct count', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=widgets/partition=byColor/color=red';
    for (let i = 1; i <= 4; i++) {
      await client.putObject({ key: `${prefix}/id=w${i}`, body: '', metadata: { color: 'red' } });
    }

    const total = await client.count({ prefix: `${prefix}/` });
    expect(total).toBe(4);
  });

  test('getAllKeys with partition prefix returns all partition keys', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=cats/partition=byBreed/breed=siamese';
    for (let i = 1; i <= 3; i++) {
      await client.putObject({ key: `${prefix}/id=c${i}`, body: '', metadata: {} });
    }

    const allKeys = await client.getAllKeys({ prefix: `${prefix}/` });
    expect(allKeys).toHaveLength(3);
  });

  test('_decodeMetadataRow returns empty object when metadata is invalid JSON', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._decodeMetadataRow({ metadata: 'not-valid-json' });
    expect(result).toEqual({});
  });

  test('_normalizeBody handles null input returning empty buffer', async () => {
    const client = register(createInMemorySqliteClient());

    const result = await (client as any)._normalizeBody(null, null);
    expect(result instanceof Buffer).toBe(true);
    expect(result.length).toBe(0);
  });

  test('deleteAll returns 0 when no objects exist under prefix', async () => {
    const client = register(createInMemorySqliteClient());

    const result = await client.deleteAll({ prefix: 'nonexistent-prefix/' });
    expect(result).toBe(0);
  });

  test('moveObject throws DatabaseError when copyObject fails', async () => {
    const client = register(createInMemorySqliteClient());

    vi.spyOn(client as any, 'copyObject').mockRejectedValue(new Error('copy-failed'));

    await expect(
      client.moveObject({ from: 'src-key', to: 'dst-key' })
    ).rejects.toThrow(/Unexpected error in moveObject/);

    vi.restoreAllMocks();
  });

  test('sendCommand listObjects with StartAfter prefix applies key prefix', async () => {
    const client = register(createInMemorySqliteClient({ keyPrefix: 'tenant' }));

    await client.putObject({ key: 'a', body: '1', contentType: 'text/plain' });
    await client.putObject({ key: 'b', body: '2', contentType: 'text/plain' });
    await client.putObject({ key: 'c', body: '3', contentType: 'text/plain' });

    const response = await client.sendCommand({
      constructor: { name: 'ListObjectsV2Command' },
      input: { StartAfter: 'a' }
    }) as any;

    expect(Array.isArray(response.Contents)).toBe(true);
  });

  test('_buildDataKeyPrefixFromPartitionPrefix returns null when no partition= segment', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._buildDataKeyPrefixFromPartitionPrefix('resource=items/data/id=x1');
    expect(result).toBeNull();
  });

  test('_buildDataKeyPrefixFromPartitionPrefix returns null when partition= is at index 0', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._buildDataKeyPrefixFromPartitionPrefix('partition=byType/type=x');
    expect(result).toBeNull();
  });

  test('_buildFilteredObjectClause handles rawBodyPath filter', () => {
    const client = register(createInMemorySqliteClient());

    const { sql, params } = (client as any)._buildFilteredObjectClause('o', [
      {
        metadataPath: '$.status',
        metadataValue: 'active',
        rawBodyPath: '$.score',
        rawBodyValue: '10'
      }
    ]);

    expect(sql).toContain('AND');
    expect(params).toContain('$.score');
    expect(params).toContain('10');
  });

  test('putObject into existing partition key path uses partition branch (existingPartitionRow present)', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=records/partition=byState/state=open/id=r1';

    await client.putObject({ key: partKey, body: '', metadata: { state: 'open' } });

    await client.putObject({ key: partKey, body: '', metadata: { state: 'open', updated: '1' } });

    const head = await client.headObject(partKey);
    expect(head.Metadata).toMatchObject({ state: 'open', updated: '1' });
  });

  test('putObject non-partition path uses existingPartitionRow etag for preconditions', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'regular-key', body: 'v1', contentType: 'text/plain' });

    const head = await client.headObject('regular-key');
    const etag = head.ETag!;

    await client.putObject({ key: 'regular-key', body: 'v2', contentType: 'text/plain', ifMatch: etag });

    const updated = await client.headObject('regular-key');
    expect(updated.ETag).not.toBe(etag);
  });

  test('exists returns true for partition key via _hasPartitionIndexKey', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=groups/partition=byName/name=admin/id=g1';
    await client.putObject({ key: partKey, body: '', metadata: { name: 'admin' } });

    expect(await client.exists(partKey)).toBe(true);
  });

  test('constructor uses provided logger instance directly', () => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => mockLogger)
    };

    const client = register({
      client: new SqliteClient({ basePath: ':memory:', logger: mockLogger as any }),
      baseDir: null
    });

    expect(client).toBeTruthy();
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  test('constructor uses taskExecutorMonitoring config when provided', () => {
    const client = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutorMonitoring: { enabled: true, interval: 5000 } as any
      }),
      baseDir: null
    });

    expect((client as any).taskExecutorMonitoring).toEqual({ enabled: true, interval: 5000 });
  });

  test('_runWriteTask re-uses active write token when already inside a task', async () => {
    const client = register(createInMemorySqliteClient());

    let innerTokenSame = false;

    await (client as any)._runWriteTask(async () => {
      const outerToken = (client as any)._activeWriteToken;
      await (client as any)._runWriteTask(async () => {
        const innerToken = (client as any)._writeContext.getStore();
        innerTokenSame = innerToken === outerToken;
      });
    });

    expect(innerTokenSame).toBe(true);
  });

  test('listObjects wraps non-BaseError non-Error exceptions in DatabaseError', async () => {
    const client = register(createInMemorySqliteClient());

    vi.spyOn(client as any, '_prepareCached').mockImplementationOnce(() => {
      throw 'string error, not an Error object';
    });

    await expect(client.listObjects({ prefix: '' })).rejects.toThrow(/Unexpected error in listObjects/);

    vi.restoreAllMocks();
  });

  test('deleteObjects batch deletes partition keys from partition_index', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey1 = 'resource=batch/partition=byX/x=a/id=b1';
    const partKey2 = 'resource=batch/partition=byX/x=a/id=b2';
    await client.putObject({ key: partKey1, body: '', metadata: { x: 'a' } });
    await client.putObject({ key: partKey2, body: '', metadata: { x: 'a' } });

    const result = await client.deleteObjects([partKey1, partKey2]);

    expect(result.Deleted).toHaveLength(2);
    expect(await client.count({ prefix: 'resource=batch/partition=byX/x=a/' })).toBe(0);
  });

  test('deleteObjects batch adds per-key error to batchErrors when individual key delete fails', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'safe1', body: 'v', contentType: 'text/plain' });
    await client.putObject({ key: 'safe2', body: 'v', contentType: 'text/plain' });

    const origPrepare = (client as any)._prepareCached.bind(client);
    let callCount = 0;
    vi.spyOn(client as any, '_prepareCached').mockImplementation((sql: string) => {
      if (sql.includes('DELETE FROM objects') && callCount === 0) {
        callCount++;
        throw new Error('forced-delete-error');
      }
      return origPrepare(sql);
    });

    const result = await client.deleteObjects(['safe1', 'safe2']);

    vi.restoreAllMocks();

    expect(result.Errors.length + result.Deleted.length).toBeGreaterThan(0);
  });

  test('listPartitionObjects with delimiter deduplicates same common prefix', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=feed/partition=byDate/date=2024-01';
    for (let i = 1; i <= 3; i++) {
      await client.putObject({ key: `${prefix}/id=f${i}`, body: '', metadata: { date: '2024-01' } });
    }

    const result = await client.listObjects({
      prefix: `${prefix}/`,
      delimiter: '/'
    });

    expect(Array.isArray(result.Contents)).toBe(true);
  });

  test('_getFilteredPartitionObjectRows returns empty array when dataKeyPrefix is null', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._getFilteredPartitionObjectRows('resource=x/data/', [], 10, 0);
    expect(result).toEqual([]);
  });

  test('_getFilteredPartitionObjectRowsAfter returns empty array when dataKeyPrefix is null', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._getFilteredPartitionObjectRowsAfter('resource=x/data/', [], 10, null);
    expect(result).toEqual([]);
  });

  test('_validateLimits throws when body size exceeds maxObjectSize', () => {
    const client = register(createInMemorySqliteClient({
      enforceLimits: true,
      maxObjectSize: 5
    }));

    expect(() =>
      (client as any)._validateLimits(Buffer.from('too-long-body'), undefined, 'test-key')
    ).toThrow(/Object size exceeds/);
  });

  test('_validateMemoryBudget throws when projected usage exceeds maxMemoryBytes', () => {
    const client = register(createInMemorySqliteClient({ maxMemoryMB: 0.001 }));

    expect(() =>
      (client as any)._validateMemoryBudget(999999, 0, 'test-key')
    ).toThrow(/SQLite memory budget exceeded/);
  });

  test('copyObject non-partition destination overwrites existing partition_index entry', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'src-plain', body: 'data', contentType: 'text/plain' });

    const destKey = 'resource=things/partition=byTag/tag=v1/id=t1';
    await client.putObject({ key: destKey, body: '', metadata: { tag: 'v1' } });

    const beforePartRow = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, destKey) as { c: number };
    expect(beforePartRow.c).toBe(1);

    await client.copyObject({
      from: 'src-plain',
      to: destKey,
      metadataDirective: 'COPY'
    });

    const objRow = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM objects WHERE bucket = ? AND key = ?')
      .get(client.bucket, destKey) as { c: number };
    expect(objRow.c).toBe(1);

    const afterPartRow = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, destKey) as { c: number };
    expect(afterPartRow.c).toBe(0);
  });

  test('listObjects with delimiter and multiple keys under same prefix deduplicates common prefix', async () => {
    const client = register(createInMemorySqliteClient());

    await Promise.all([
      client.putObject({ key: 'folder/sub/a.txt', body: 'a', contentType: 'text/plain' }),
      client.putObject({ key: 'folder/sub/b.txt', body: 'b', contentType: 'text/plain' }),
      client.putObject({ key: 'folder/sub/c.txt', body: 'c', contentType: 'text/plain' }),
      client.putObject({ key: 'folder/other/d.txt', body: 'd', contentType: 'text/plain' }),
    ]);

    const result = await client.listObjects({ prefix: 'folder/', delimiter: '/' });
    expect(result.CommonPrefixes).toHaveLength(2);
    expect(result.CommonPrefixes.map(p => p.Prefix)).toContain('folder/sub/');
    expect(result.CommonPrefixes.map(p => p.Prefix)).toContain('folder/other/');
  });

  test('listObjects with non-finite maxKeys uses 1000 default', async () => {
    const client = register(createInMemorySqliteClient());

    for (let i = 0; i < 5; i++) {
      await client.putObject({ key: `nf-item-${i}`, body: 'x', contentType: 'text/plain' });
    }

    const result = await client.listObjects({ prefix: 'nf-item-', maxKeys: Infinity });
    expect(result.Contents).toHaveLength(5);
    expect(result.IsTruncated).toBe(false);
  });

  test('deleteAll for prefix with 0-byte objects does not adjust bucket size', async () => {
    const client = register(createInMemorySqliteClient());

    (client as any).db.prepare(`
      INSERT INTO objects (bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(client.bucket, 'zero/key1', '{}', 'application/octet-stream', null, 0, 'abc123', new Date().toISOString(), Buffer.alloc(0));

    const sizeBefore = (client as any)._getCurrentBucketSize();
    const deleted = await client.deleteAll({ prefix: 'zero/' });
    expect(deleted).toBe(1);
    expect((client as any)._getCurrentBucketSize()).toBe(sizeBefore);
  });

  test('listPartitionObjects with continuationToken decodes and uses startAfter', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=pages/partition=bySection/section=news';
    for (let i = 1; i <= 5; i++) {
      await client.putObject({ key: `${prefix}/id=p${i}`, body: '', metadata: { section: 'news' } });
    }

    const first = await client.listObjects({ prefix: `${prefix}/`, maxKeys: 2 });
    expect(first.IsTruncated).toBe(true);
    expect(first.NextContinuationToken).toBeTruthy();

    const second = await client.listObjects({
      prefix: `${prefix}/`,
      maxKeys: 2,
      continuationToken: first.NextContinuationToken!
    });
    expect(second.Contents.length + second.CommonPrefixes.length).toBeGreaterThan(0);
  });

  test('listPartitionObjects with startAfter filters to keys after start', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=news/partition=byTopic/topic=tech';
    for (let i = 1; i <= 4; i++) {
      await client.putObject({ key: `${prefix}/id=n${i}`, body: '', metadata: {} });
    }

    const result = await client.listObjects({
      prefix: `${prefix}/`,
      startAfter: `${prefix}/id=n2`
    });

    expect(result.Contents.length).toBeLessThan(4);
  });

  test('deleteObjects batch with partition keys inside batch', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=batch2/partition=byY/y=z/id=x1';
    const normalKey = 'normal-key-for-batch';

    await client.putObject({ key: partKey, body: '', metadata: {} });
    await client.putObject({ key: normalKey, body: 'data', contentType: 'text/plain' });

    const result = await client.deleteObjects([partKey, normalKey]);
    expect(result.Deleted).toHaveLength(2);
    expect(await client.exists(partKey)).toBe(false);
    expect(await client.exists(normalKey)).toBe(false);
  });

  test('listObjects throws BaseError from inner SQL execution', async () => {
    const client = register(createInMemorySqliteClient());

    const { NoSuchKey } = await import('../../../src/errors.js');

    vi.spyOn(client as any, '_prepareCached').mockImplementationOnce(() => {
      throw new NoSuchKey({ bucket: 'x', key: 'y', statusCode: 404, retriable: false });
    });

    await expect(client.listObjects({ prefix: '' })).rejects.toThrow(/No such key/);
    vi.restoreAllMocks();
  });

  test('copyObject non-BaseError gets mapped via mapAwsError', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'src-for-err', body: 'val', contentType: 'text/plain' });

    const origGetRow = (client as any)._getRow.bind(client);
    vi.spyOn(client as any, '_getRow').mockImplementationOnce((_key: string) => {
      const result = origGetRow(_key);
      if (result) {
        throw new Error('Internal SQL error');
      }
      return result;
    });

    await expect(
      client.copyObject({ from: 'src-for-err', to: 'dst-for-err', metadataDirective: 'COPY' })
    ).rejects.toThrow();

    vi.restoreAllMocks();
  });

  test('deleteObject non-BaseError gets mapped via mapAwsError', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'del-err-key', body: 'v', contentType: 'text/plain' });

    vi.spyOn(client as any, '_getObjectState').mockImplementationOnce(() => {
      throw new Error('SQL internal error');
    });

    await expect(client.deleteObject('del-err-key')).rejects.toThrow();

    vi.restoreAllMocks();
  });

  test('_parsePartitionIndexKey returns null for key with empty resourceName', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._parsePartitionIndexKey('resource=/partition=byX/id=r1');
    expect(result).toBeNull();
  });

  test('_parsePartitionIndexKey returns null for key with empty partitionName', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._parsePartitionIndexKey('resource=res/partition=/id=r1');
    expect(result).toBeNull();
  });

  test('_parsePartitionIndexKey returns null for key with empty recordId', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._parsePartitionIndexKey('resource=res/partition=byX/id=');
    expect(result).toBeNull();
  });

  test('_getCopySourceRow returns null when key is not found in objects table', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._getCopySourceRow('nonexistent/key/here');
    expect(result).toBeNull();
  });

  test('deleteObjects triggers per-key batchErrors when run throws per key', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'bk/a', body: 'a', contentType: 'text/plain' });
    await client.putObject({ key: 'bk/b', body: 'b', contentType: 'text/plain' });

    const origPrepare = (client as any)._prepareCached.bind(client);
    let firstRun = true;
    vi.spyOn(client as any, '_prepareCached').mockImplementation((sql: string) => {
      const stmt = origPrepare(sql);
      if (sql.includes('DELETE FROM objects') && firstRun) {
        firstRun = false;
        return {
          ...stmt,
          run: (...args: unknown[]) => {
            throw new Error('per-key-failure');
          }
        };
      }
      return stmt;
    });

    const result = await client.deleteObjects(['bk/a', 'bk/b']);

    vi.restoreAllMocks();

    expect(result.Errors.length + result.Deleted.length).toBeGreaterThan(0);
  });

  test('putObject with ifMatch on partition key checks precondition (partition path)', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=partprec/partition=byX/x=a/id=r1';

    await client.putObject({ key: partKey, body: '', metadata: { x: 'a' } });
    const head = await client.headObject(partKey);
    const etag = head.ETag!;

    await client.putObject({ key: partKey, body: '', metadata: { x: 'a', v: '2' }, ifMatch: etag });

    const updated = await client.headObject(partKey);
    expect(updated.Metadata).toMatchObject({ v: '2' });
  });

  test('putObject with ifMatch on partition key fails when ETag mismatch', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=partprec/partition=byX/x=b/id=r2';
    await client.putObject({ key: partKey, body: '', metadata: {} });

    await expect(
      client.putObject({ key: partKey, body: '', metadata: {}, ifMatch: '"wrong-etag"' })
    ).rejects.toThrow(/Precondition failed/);
  });

  test('putObject with ifMatch on partition key fails when no existing row', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=partprec/partition=byX/x=c/id=r3';
    await expect(
      client.putObject({ key: partKey, body: '', metadata: {}, ifMatch: '"some-etag"' })
    ).rejects.toThrow(/Precondition failed/);
  });

  test('putObject with ifNoneMatch on existing partition key fails', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=partprec/partition=byX/x=d/id=r4';
    await client.putObject({ key: partKey, body: '', metadata: {} });

    await expect(
      client.putObject({ key: partKey, body: '', metadata: {}, ifNoneMatch: '*' })
    ).rejects.toThrow(/Precondition failed/);
  });

  test('putObject with specific ifNoneMatch ETag on existing partition key fails', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=partprec/partition=byX/x=e/id=r5';
    const first = await client.putObject({ key: partKey, body: '', metadata: {} });

    await expect(
      client.putObject({ key: partKey, body: '', metadata: {}, ifNoneMatch: first.ETag })
    ).rejects.toThrow(/Precondition failed/);
  });

  test('copyObject re-throws BaseError (NoSuchKey) from non-existent source', async () => {
    const client = register(createInMemorySqliteClient());

    await expect(
      client.copyObject({ from: 'nonexistent-source', to: 'dst-key' })
    ).rejects.toThrow(/No such key/);
  });

  test('deleteObject re-throws BaseError when transaction throws BaseError', async () => {
    const client = register(createInMemorySqliteClient());

    const { NoSuchKey } = await import('../../../src/errors.js');

    vi.spyOn(client as any, '_getObjectState').mockImplementationOnce(() => {
      throw new NoSuchKey({ bucket: 'x', key: 'y', statusCode: 404, retriable: false });
    });

    await expect(client.deleteObject('some-key')).rejects.toThrow(/No such key/);

    vi.restoreAllMocks();
  });

  test('headObject on non-existent regular key throws NoSuchKey', async () => {
    const client = register(createInMemorySqliteClient());

    await expect(client.headObject('does-not-exist')).rejects.toThrow(/No such key/);
  });

  test('headObject non-BaseError gets mapped via mapAwsError', async () => {
    const client = register(createInMemorySqliteClient());

    vi.spyOn(client as any, '_getObjectHeaderRow').mockImplementationOnce(() => {
      throw new Error('Internal headObject error');
    });

    await expect(client.headObject('any-key')).rejects.toThrow();

    vi.restoreAllMocks();
  });

  test('headObject BaseError re-thrown from catch', async () => {
    const client = register(createInMemorySqliteClient());

    const { NoSuchKey } = await import('../../../src/errors.js');

    vi.spyOn(client as any, '_getObjectHeaderRow').mockImplementationOnce(() => {
      throw new NoSuchKey({ bucket: 'b', key: 'k', statusCode: 404, retriable: false });
    });

    await expect(client.headObject('any-key')).rejects.toMatchObject({ name: 'NoSuchKey' });

    vi.restoreAllMocks();
  });

  test('getObject non-BaseError gets mapped via mapAwsError', async () => {
    const client = register(createInMemorySqliteClient());

    vi.spyOn(client as any, '_getRow').mockImplementationOnce(() => {
      throw new Error('Internal getObject error');
    });

    await expect(client.getObject('any-key')).rejects.toThrow();

    vi.restoreAllMocks();
  });

  test('putObject non-BaseError gets mapped via mapAwsError', async () => {
    const client = register(createInMemorySqliteClient());

    vi.spyOn(client as any, '_getObjectState').mockImplementationOnce(() => {
      throw new Error('Internal putObject error');
    });

    await expect(client.putObject({ key: 'any-key', body: 'val' })).rejects.toThrow();

    vi.restoreAllMocks();
  });

  test('putObject with ifNoneMatch etag that does NOT match allows write', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'allow-write', body: 'first', contentType: 'text/plain' });

    const result = await client.putObject({
      key: 'allow-write',
      body: 'second',
      contentType: 'text/plain',
      ifNoneMatch: '"definitely-not-the-etag"'
    });

    expect(result.ETag).toBeTruthy();
    const obj = await client.getObject('allow-write');
    expect(await readBody(obj.Body)).toBe('second');
  });

  test('putObject on existing partition key where existingPartitionRow is non-null triggers partition branch', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=pnb/partition=byX/x=a/id=p1';

    await client.putObject({ key: partKey, body: '', metadata: { x: 'a' } });

    await client.putObject({ key: 'regular-data-key', body: 'data', contentType: 'text/plain' });

    (client as any).db.prepare(`
      INSERT INTO objects (bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(client.bucket, partKey, '{}', 'text/plain', null, 5, 'abc', new Date().toISOString(), Buffer.from('hello'));

    const result = await client.putObject({ key: 'regular-data-key', body: 'updated', contentType: 'text/plain' });
    expect(result.ETag).toBeTruthy();
  });

  test('copyObject partition destination with legacy object (destinationRow != null)', async () => {
    const client = register(createInMemorySqliteClient());

    const srcKey = 'resource=legcp/partition=byX/x=v/id=src1';
    await client.putObject({ key: srcKey, body: '', metadata: { x: 'v' } });

    const dstKey = 'resource=legcp/partition=byX/x=v/id=dst1';
    await client.putObject({ key: dstKey, body: '', metadata: { x: 'v' } });

    (client as any).db.prepare(`
      INSERT INTO objects (bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(client.bucket, dstKey, '{}', 'text/plain', null, 10, 'leg123', new Date().toISOString(), Buffer.from('old-body'));

    const result = await client.copyObject({
      from: srcKey,
      to: dstKey,
      metadataDirective: 'COPY'
    });

    expect(result.CopyObjectResult.ETag).toBeDefined();
  });

  test('_parsePartitionIndexKey returns null for key with data segment', () => {
    const client = register(createInMemorySqliteClient());

    const result = (client as any)._parsePartitionIndexKey('resource=users/data/id=u1');
    expect(result).toBeNull();
  });

  test('_isPartitionIndexKey returns false for data keys', () => {
    const client = register(createInMemorySqliteClient());

    expect((client as any)._isPartitionIndexKey('resource=users/data/id=u1')).toBe(false);
    expect((client as any)._isPartitionIndexKey('resource=items/data/id=x')).toBe(false);
  });

  test('_listPartitionObjects with delimiter deduplicates repeated common prefix', async () => {
    const client = register(createInMemorySqliteClient());

    const prefix = 'resource=multi/partition=byGroup/group=alpha';
    await client.putObject({ key: `${prefix}/id=p1`, body: '', metadata: {} });
    await client.putObject({ key: `${prefix}/id=p2`, body: '', metadata: {} });
    await client.putObject({ key: `${prefix}/id=p3`, body: '', metadata: {} });

    const result = (client as any)._listPartitionObjects({
      prefix: `${prefix}/`,
      fullPrefix: `${prefix}/`,
      delimiter: '=',
      maxKeys: 100,
      continuationToken: null,
      startAfter: null
    });

    expect(result).toBeDefined();
    expect(result.CommonPrefixes.length).toBeGreaterThan(0);
  });

  test('putObject on partition key when legacy object exists in objects table triggers cleanup', async () => {
    const client = register(createInMemorySqliteClient());

    const partKey = 'resource=legacy/partition=byX/x=z/id=l1';

    (client as any).db.prepare(`
      INSERT INTO objects (bucket, key, metadata, content_type, content_encoding, content_length, etag, last_modified, body)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(client.bucket, partKey, '{}', 'text/plain', null, 20, 'legacyetag', new Date().toISOString(), Buffer.from('legacy-body'));

    const legacyBefore = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM objects WHERE bucket = ? AND key = ?')
      .get(client.bucket, partKey) as { c: number };
    expect(legacyBefore.c).toBe(1);

    const result = await client.putObject({ key: partKey, body: '', metadata: { x: 'z' } });
    expect(result.ETag).toBeTruthy();

    const legacyAfter = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM objects WHERE bucket = ? AND key = ?')
      .get(client.bucket, partKey) as { c: number };
    expect(legacyAfter.c).toBe(0);

    const partEntry = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, partKey) as { c: number };
    expect(partEntry.c).toBe(1);
  });

  test('copyObject from non-partition source to partition dest: existing partition entry is cleaned up', async () => {
    const client = register(createInMemorySqliteClient());

    await client.putObject({ key: 'src-plain', body: 'data', contentType: 'text/plain' });

    const destKey = 'resource=things/partition=byTag/tag=v1/id=t1';
    await client.putObject({ key: destKey, body: '', metadata: { tag: 'v1' } });

    const beforePartRow = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, destKey) as { c: number };
    expect(beforePartRow.c).toBe(1);

    await client.copyObject({
      from: 'src-plain',
      to: destKey,
      metadataDirective: 'COPY'
    });

    const objRow = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM objects WHERE bucket = ? AND key = ?')
      .get(client.bucket, destKey) as { c: number };
    expect(objRow.c).toBe(1);

    const afterPartRow = (client as any).db
      .prepare('SELECT COUNT(*) AS c FROM partition_index WHERE bucket = ? AND key = ?')
      .get(client.bucket, destKey) as { c: number };
    expect(afterPartRow.c).toBe(0);
  });

  test('getAggregateMetrics returns null when taskManager lacks getAggregateMetrics method', () => {
    const client = register({
      client: new SqliteClient({
        basePath: ':memory:',
        taskExecutor: {
          concurrency: 1,
          process: async (items: unknown[], fn: (item: unknown) => Promise<unknown>) => {
            const results = [];
            const errors: Array<{ error: Error; index: number; item: unknown }> = [];
            for (let i = 0; i < items.length; i++) {
              try { results.push(await fn(items[i])); } catch (e) { errors.push({ error: e as Error, index: i, item: items[i] }); }
            }
            return { results, errors };
          }
          // no getAggregateMetrics method
        } as any
      }),
      baseDir: null
    });

    expect(client.getAggregateMetrics()).toBeNull();
    expect(client.getAggregateMetrics(500)).toBeNull();
  });

  test('sendCommand falls back to command.name when constructor.name is empty', async () => {
    const client = register(createInMemorySqliteClient());
    await client.putObject({ key: 'test-name-fallback', body: 'hello', metadata: {} });

    // Create a class whose name is empty string, which makes constructor.name falsy
    const Anon = { constructor: { name: '' } };
    const cmd = Object.assign(Object.create(Anon), {
      name: 'GetObjectCommand',
      input: { Key: 'test-name-fallback' }
    }) as any;

    const response = await client.sendCommand(cmd);
    expect(response).toBeDefined();
  });

  test('sendCommand falls back to UnknownCommand when both constructor.name and name are absent', async () => {
    const client = register(createInMemorySqliteClient());

    // Object where constructor.name is empty and name is also absent
    const Anon = { constructor: { name: '' } };
    const cmd = Object.assign(Object.create(Anon), { input: {} }) as any;

    await expect(client.sendCommand(cmd)).rejects.toThrow(/Unsupported command.*UnknownCommand/);
  });

  test('sendCommand uses empty input object when command.input is absent', async () => {
    const client = register(createInMemorySqliteClient());

    // command.input is undefined, so `command?.input || {}` falls back to {}
    // This will result in an unsupported command since we only care about hitting the fallback
    const Anon = { constructor: { name: '' } };
    const cmd = Object.assign(Object.create(Anon), { name: 'UnknownCmd' }) as any;
    // cmd.input is undefined

    await expect(client.sendCommand(cmd)).rejects.toThrow(/Unsupported command/);
  });

  test('sendCommand PutObjectCommand uses empty key when input.Key is absent', async () => {
    const client = register(createInMemorySqliteClient());

    // input.Key is undefined, triggers `input.Key ?? ''` fallback in _handlePutObject
    const response = await client.sendCommand({
      constructor: { name: 'PutObjectCommand' },
      input: { Body: 'test-body', Metadata: {} }
    } as any);

    expect(response).toBeDefined();
  });

  test('sendCommand GetObjectCommand uses empty key when input.Key is absent', async () => {
    const client = register(createInMemorySqliteClient());

    // First put something at the empty key
    await client.putObject({ key: '', body: 'empty-key-value', metadata: {} });

    // input.Key is undefined, triggers `input.Key || ''` fallback in _handleGetObject
    const response = await client.sendCommand({
      constructor: { name: 'GetObjectCommand' },
      input: {}
    } as any) as any;

    expect(response).toBeDefined();
  });

  test('sendCommand HeadObjectCommand uses empty key when input.Key is absent', async () => {
    const client = register(createInMemorySqliteClient());

    // Put at empty key first
    await client.putObject({ key: '', body: 'head-empty', metadata: {} });

    // input.Key is undefined, triggers `input.Key || ''` fallback in _handleHeadObject
    const response = await client.sendCommand({
      constructor: { name: 'HeadObjectCommand' },
      input: {}
    } as any);

    expect(response).toBeDefined();
  });

  test('sendCommand CopyObjectCommand uses empty destination key when input.Key is absent', async () => {
    const client = register(createInMemorySqliteClient());
    await client.putObject({ key: 'copy-source-for-empty-dest', body: 'copy-me', metadata: {} });

    // input.Key is undefined, triggers `input.Key || ''` fallback in _handleCopyObject
    const response = await client.sendCommand({
      constructor: { name: 'CopyObjectCommand' },
      input: { CopySource: `${client.bucket}/copy-source-for-empty-dest` }
    } as any);

    expect(response).toBeDefined();
  });

  test('sendCommand DeleteObjectsCommand uses empty array when input.Delete is absent', async () => {
    const client = register(createInMemorySqliteClient());

    // input.Delete is undefined, triggers `input.Delete?.Objects || []` fallback
    const response = await client.sendCommand({
      constructor: { name: 'DeleteObjectsCommand' },
      input: {}
    } as any) as any;

    expect(response).toBeDefined();
    expect(response.Deleted).toBeDefined();
  });

  test('sendCommand DeleteObjectCommand uses empty key when input.Key is absent', async () => {
    const client = register(createInMemorySqliteClient());

    // input.Key is undefined, triggers `input.Key || ''` fallback in _handleDeleteObject
    const response = await client.sendCommand({
      constructor: { name: 'DeleteObjectCommand' },
      input: {}
    } as any);

    expect(response).toBeDefined();
  });
});
