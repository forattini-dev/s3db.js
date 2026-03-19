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
});
