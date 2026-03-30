import path from 'path';
import { rm } from 'fs/promises';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

import RemoteSqliteClient from '../../../src/clients/remote-sqlite-client.class.js';
import { getNodeSqliteDatabaseSync, isNodeSqliteAvailable } from '../../../src/clients/sqlite-runtime.js';
import { createTemporaryPathForTest } from '#tests/config.js';
import type { SqlExecutor } from '../../../src/clients/sql-executor.types.js';

const describeIfSqlite = isNodeSqliteAvailable() ? describe : describe.skip;

const readBody = async (body: unknown): Promise<string> => {
  if (!body || typeof body !== 'object' || !('transformToString' in body) || typeof (body as { transformToString: unknown }).transformToString !== 'function') {
    return '';
  }

  return body.transformToString();
};

class NodeSqliteExecutor implements SqlExecutor {
  private readonly db: InstanceType<ReturnType<typeof getNodeSqliteDatabaseSync>>;

  constructor(dbPath: string) {
    const DatabaseSync = getNodeSqliteDatabaseSync();
    this.db = new DatabaseSync(dbPath);
  }

  async execute(sql: string, args: unknown[] = []) {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('SELECT')) {
      const rows = this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
      return { rows };
    }

    this.db.prepare(sql).run(...args);
    return { rows: [] };
  }

  close(): void {
    this.db.close();
  }
}

describeIfSqlite('RemoteSqliteClient', () => {
  let clients: Array<{ client: RemoteSqliteClient; baseDir: string }> = [];

  beforeEach(() => {
    clients = [];
  });

  afterEach(async () => {
    while (clients.length > 0) {
      const { client, baseDir } = clients.pop()!;
      await client.destroy().catch(() => {});
      await rm(baseDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  const createClient = async (options: { keyPrefix?: string } = {}) => {
    const baseDir = await createTemporaryPathForTest('s3db-remote-sqlite-client');
    const dbPath = path.join(baseDir, 'remote.sqlite');
    const client = new RemoteSqliteClient({
      endpoint: 'sqlite+libsql://example.turso.io',
      connectionString: 'sqlite+libsql://example.turso.io?authToken=test-token',
      sqliteDriver: 'libsql',
      executor: new NodeSqliteExecutor(dbPath),
      keyPrefix: options.keyPrefix,
      logLevel: 'silent'
    });
    clients.push({ client, baseDir });
    return client;
  };

  test('supports basic object lifecycle through the async SQL executor layer', async () => {
    const client = await createClient();

    const put = await client.putObject({
      key: 'hello.txt',
      body: 'hello remote sqlite',
      contentType: 'text/plain',
      metadata: { env: 'test', enabled: true }
    });

    expect(put.ETag).toBeTruthy();

    const head = await client.headObject('hello.txt');
    expect(head.ContentType).toBe('text/plain');
    expect(head.ContentLength).toBe('hello remote sqlite'.length);
    expect(head.Metadata).toEqual({
      env: 'test',
      enabled: 'true'
    });

    const got = await client.getObject('hello.txt');
    expect(await readBody(got.Body)).toBe('hello remote sqlite');

    const listed = await client.listObjects({ prefix: 'hello' });
    expect(listed.Contents.map(item => item.Key)).toEqual(['hello.txt']);

    expect(await client.exists('hello.txt')).toBe(true);
    expect(await client.exists('missing.txt')).toBe(false);

    await client.deleteObject('hello.txt');
    expect(await client.exists('hello.txt')).toBe(false);
  });

  test('supports key prefixes and copying', async () => {
    const client = await createClient({ keyPrefix: 'tenant-a' });

    await client.putObject({
      key: 'docs/readme.txt',
      body: 'prefixed value',
      contentType: 'text/plain'
    });

    await client.copyObject({
      from: 'docs/readme.txt',
      to: 'docs/readme-copy.txt',
      metadataDirective: 'COPY'
    });

    const keys = await client.getAllKeys({ prefix: 'docs/' });
    expect(keys).toEqual(['docs/readme-copy.txt', 'docs/readme.txt']);
  });
});
