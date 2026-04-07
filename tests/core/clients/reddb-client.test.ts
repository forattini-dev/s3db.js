import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { RedDbClient } from '#src/clients/reddb-client.class.js';
import { NoSuchKey, ResourceError, DatabaseError } from '#src/errors.js';
import type { HttpClient } from '#src/concerns/http-client.js';

function computeETag(body: unknown): string {
  const hash = createHash('md5');
  if (Buffer.isBuffer(body)) hash.update(body);
  else if (typeof body === 'string') hash.update(body);
  else if (body !== undefined && body !== null) hash.update(JSON.stringify(body));
  else hash.update('');
  return `"${hash.digest('hex')}"`;
}

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
    redirected: false,
    statusText: status === 200 ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: () => mockResponse(data, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    bytes: async () => new Uint8Array(),
  } as Response;
}

function createMockHttpClient(): HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  };
}

function makeEntity(
  id: number,
  key: string,
  body: string,
  opts: {
    collection?: string;
    etag?: string;
    contentType?: string;
    metadata?: Record<string, string>;
    contentLength?: number;
    lastModified?: string;
    bodyEncoding?: string;
  } = {}
) {
  const etag = opts.etag || computeETag(body);
  return {
    id,
    kind: 'TableRow',
    collection: opts.collection || 'test-collection',
    data: {
      named: {
        _key: key,
        _body: body,
        _body_encoding: opts.bodyEncoding || 'utf8',
        _etag: etag,
        _content_type: opts.contentType || 'application/octet-stream',
        _last_modified: opts.lastModified || new Date().toISOString(),
        _metadata: opts.metadata || {},
        ...(opts.contentLength !== undefined ? { _content_length: opts.contentLength } : {}),
      },
    },
  };
}

function queryResponse(items: unknown[], total?: number) {
  return { items, total: total ?? items.length };
}

function mutationResponse(id: number) {
  return { ok: true, id };
}

function deleteResponse(id: number) {
  return { ok: true, deleted: true, id };
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
};

describe('RedDbClient', () => {
  let client: RedDbClient;
  let mockHttp: ReturnType<typeof createMockHttpClient>;

  beforeEach(() => {
    client = new RedDbClient({
      baseUrl: 'http://localhost:8080',
      bucket: 'test-bucket',
      collection: 'test-collection',
      logger: silentLogger,
    });
    mockHttp = createMockHttpClient();
    (client as any)._httpClient = mockHttp;
  });

  afterEach(async () => {
    await client.destroy();
  });

  describe('constructor', () => {
    it('sets id, bucket, collection, keyPrefix, connectionString from config', () => {
      const c = new RedDbClient({
        baseUrl: 'http://myhost:9090',
        bucket: 'my-bucket',
        collection: 'my-col',
        keyPrefix: 'data/v1',
        id: 'custom-id',
        logger: silentLogger,
      });

      expect(c.id).toBe('custom-id');
      expect(c.bucket).toBe('my-bucket');
      expect(c.connectionString).toContain('reddb://');
      expect(c.connectionString).toContain('myhost:9090');
      expect(c.connectionString).toContain('data/v1');
      expect(c.config.bucket).toBe('my-bucket');
      expect(c.config.keyPrefix).toBe('data/v1');
      expect(c.config.endpoint).toBe('http://myhost:9090');
      expect(c.config.forcePathStyle).toBe(true);
    });

    it('uses default values when optional fields are omitted', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        logger: silentLogger,
      });

      expect(c.bucket).toBe('s3db');
      expect(c.config.region).toBe('reddb');
      expect(c.config.keyPrefix).toBe('');
    });

    it('uses bucket as collection when collection is not provided', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        bucket: 'special-bucket',
        logger: silentLogger,
      });

      expect(c.bucket).toBe('special-bucket');
      expect((c as any).collection).toBe('special-bucket');
    });

    it('includes authToken in connectionString when provided', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        authToken: 'my-secret-token',
        logger: silentLogger,
      });

      expect(c.connectionString).toContain('my-secret-token@');
    });

    it('generates an id when not provided', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        logger: silentLogger,
      });

      expect(c.id).toBeDefined();
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
    });

    it('sets logLevel from config', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        logLevel: 'debug',
        logger: silentLogger,
      });

      expect(c.logLevel).toBe('debug');
    });

    it('defaults logLevel to info', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        logger: silentLogger,
      });

      expect(c.logLevel).toBe('info');
    });

    it('accepts a custom taskExecutor', () => {
      const customExecutor = {
        concurrency: 10,
        process: vi.fn().mockResolvedValue({ results: [], errors: [] }),
        getStats: vi.fn().mockReturnValue({ queueSize: 0 }),
      };

      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        taskExecutor: customExecutor,
        logger: silentLogger,
      });

      expect((c as any).taskManager).toBe(customExecutor);
    });

    it('stores taskExecutorMonitoring config', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        taskExecutorMonitoring: { collectMetrics: true },
        logger: silentLogger,
      });

      expect((c as any).taskExecutorMonitoring).toEqual({ collectMetrics: true });
    });

    it('stores writeToken', () => {
      const c = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        writeToken: 'write-secret',
        logger: silentLogger,
      });

      expect((c as any).writeToken).toBe('write-secret');
    });
  });

  describe('putObject', () => {
    it('creates a new object via POST when key does not exist', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      const result = await client.putObject({
        key: 'users/alice.json',
        body: '{"name":"Alice"}',
        contentType: 'application/json',
        metadata: { role: 'admin' },
      });

      expect(result.ETag).toBe(computeETag('{"name":"Alice"}'));
      expect(result.VersionId).toBe('1');
      expect(result.Location).toContain('test-collection');
      expect(result.Location).toContain('users/alice.json');

      const createCall = mockHttp.post.mock.calls[1];
      expect(createCall![0]).toContain('/collections/test-collection/rows');
      const fields = createCall![1]?.body?.fields;
      expect(fields._key).toBe('users/alice.json');
      expect(fields._content_type).toBe('application/json');
    });

    it('updates an existing object via PATCH', async () => {
      const entity = makeEntity(42, 'docs/readme.md', 'old content');

      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));
      mockHttp.patch.mockResolvedValueOnce(mockResponse(mutationResponse(42), 200));

      const result = await client.putObject({
        key: 'docs/readme.md',
        body: 'new content',
      });

      expect(result.ETag).toBe(computeETag('new content'));
      expect(result.VersionId).toBe('42');

      expect(mockHttp.patch).toHaveBeenCalledOnce();
      const patchCall = mockHttp.patch.mock.calls[0];
      expect(patchCall![0]).toContain('/entities/42');
    });

    it('throws PreconditionFailed when ifNoneMatch=* and object exists', async () => {
      const entity = makeEntity(10, 'existing-key', 'data');
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      await expect(
        client.putObject({
          key: 'existing-key',
          body: 'data',
          ifNoneMatch: '*',
        })
      ).rejects.toThrow(ResourceError);

      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      await expect(
        client.putObject({
          key: 'existing-key',
          body: 'data',
          ifNoneMatch: '*',
        })
      ).rejects.toThrow('Precondition failed');
    });

    it('succeeds with ifNoneMatch=* when object does not exist', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      const result = await client.putObject({
        key: 'new-key',
        body: 'data',
        ifNoneMatch: '*',
      });

      expect(result.ETag).toBeTruthy();
      expect(result.VersionId).toBe('1');
    });

    it('throws PreconditionFailed when ifMatch does not match existing ETag', async () => {
      const entity = makeEntity(10, 'some-key', 'body', { etag: '"etag-abc"' });
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      await expect(
        client.putObject({
          key: 'some-key',
          body: 'updated',
          ifMatch: '"wrong-etag"',
        })
      ).rejects.toThrow(ResourceError);
    });

    it('succeeds with ifMatch when ETag matches', async () => {
      const entity = makeEntity(10, 'some-key', 'body', { etag: '"correct-etag"' });
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));
      mockHttp.patch.mockResolvedValueOnce(mockResponse(mutationResponse(10), 200));

      const result = await client.putObject({
        key: 'some-key',
        body: 'updated',
        ifMatch: '"correct-etag"',
      });

      expect(result.VersionId).toBe('10');
    });

    it('throws DatabaseError when RedDB returns an error status', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse({ error: 'Internal error' }, 500));

      await expect(
        client.putObject({ key: 'fail-key', body: 'data' })
      ).rejects.toThrow(DatabaseError);
    });

    it('handles body as Buffer (base64 encoding)', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      const buf = Buffer.from('binary data');
      await client.putObject({ key: 'binary.bin', body: buf });

      const createCall = mockHttp.post.mock.calls[1];
      const fields = createCall![1]?.body?.fields;
      expect(fields._body).toBe(buf.toString('base64'));
      expect(fields._body_encoding).toBe('base64');
    });

    it('handles body as JSON object', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      const obj = { foo: 'bar', num: 42 };
      await client.putObject({ key: 'obj.json', body: obj as any });

      const createCall = mockHttp.post.mock.calls[1];
      const fields = createCall![1]?.body?.fields;
      expect(fields._body).toBe(JSON.stringify(obj));
      expect(fields._body_encoding).toBe('json');
    });

    it('handles undefined body', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      await client.putObject({ key: 'empty-key' });

      const createCall = mockHttp.post.mock.calls[1];
      const fields = createCall![1]?.body?.fields;
      expect(fields._body).toBeUndefined();
    });

    it('sets contentEncoding and contentLength in fields', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      await client.putObject({
        key: 'compressed.gz',
        body: 'data',
        contentEncoding: 'gzip',
        contentLength: 1024,
      });

      const createCall = mockHttp.post.mock.calls[1];
      const fields = createCall![1]?.body?.fields;
      expect(fields._content_encoding).toBe('gzip');
      expect(fields._content_length).toBe(1024);
    });

    it('emits cl:response event on success', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      const eventSpy = vi.fn();
      client.on('cl:response', eventSpy);

      await client.putObject({ key: 'event-key', body: 'data' });

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy.mock.calls[0]![0]).toBe('PutObjectCommand');
    });

    it('sanitizes metadata keys', async () => {
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      await client.putObject({
        key: 'meta-test',
        body: 'data',
        metadata: { 'Some.Key!@#': 'value' },
      });

      const createCall = mockHttp.post.mock.calls[1];
      const fields = createCall![1]?.body?.fields;
      const metaKeys = Object.keys(fields._metadata);
      expect(metaKeys[0]).toMatch(/^[a-z0-9_-]+$/);
    });
  });

  describe('getObject', () => {
    it('returns S3Object with Body, Metadata, ContentType, ETag', async () => {
      const entity = makeEntity(1, 'users/bob.json', '{"name":"Bob"}', {
        contentType: 'application/json',
        metadata: { role: 'user' },
        etag: '"bob-etag"',
      });
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const result = await client.getObject('users/bob.json');

      expect(result.ContentType).toBe('application/json');
      expect(result.ETag).toBe('"bob-etag"');
      expect(result.Metadata).toBeDefined();
      expect(result.Body).toBeDefined();
      expect(result.LastModified).toBeInstanceOf(Date);
    });

    it('returns a readable Body that contains the stored content', async () => {
      const entity = makeEntity(1, 'hello.txt', 'hello world', { bodyEncoding: 'utf8' });
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const result = await client.getObject('hello.txt');

      const chunks: Buffer[] = [];
      for await (const chunk of result.Body! as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString('utf8')).toBe('hello world');
    });

    it('decodes base64-encoded body', async () => {
      const original = Buffer.from('binary content');
      const entity = makeEntity(1, 'bin.dat', original.toString('base64'), {
        bodyEncoding: 'base64',
      });
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const result = await client.getObject('bin.dat');

      const chunks: Buffer[] = [];
      for await (const chunk of result.Body! as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks)).toEqual(original);
    });

    it('throws NoSuchKey when entity not found', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      await expect(client.getObject('nonexistent')).rejects.toThrow(NoSuchKey);
    });

    it('emits cl:response event', async () => {
      const entity = makeEntity(1, 'emit-test', 'data');
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const eventSpy = vi.fn();
      client.on('cl:response', eventSpy);

      await client.getObject('emit-test');

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy.mock.calls[0]![0]).toBe('GetObjectCommand');
    });

    it('includes ContentEncoding and ContentLength when present', async () => {
      const entity = makeEntity(1, 'compressed.gz', 'data', { contentLength: 512 });
      (entity.data.named as any)._content_encoding = 'gzip';
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const result = await client.getObject('compressed.gz');

      expect(result.ContentEncoding).toBe('gzip');
      expect(result.ContentLength).toBe(512);
    });
  });

  describe('headObject', () => {
    it('returns metadata without body', async () => {
      const entity = makeEntity(1, 'head-test', 'body data', {
        contentType: 'text/plain',
        etag: '"head-etag"',
      });
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const result = await client.headObject('head-test');

      expect(result.ContentType).toBe('text/plain');
      expect(result.ETag).toBe('"head-etag"');
      expect(result.Body).toBeUndefined();
    });

    it('throws NoSuchKey when not found', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      await expect(client.headObject('missing')).rejects.toThrow(NoSuchKey);
    });

    it('emits cl:response event with HeadObjectCommand', async () => {
      const entity = makeEntity(1, 'head-emit', 'data');
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const eventSpy = vi.fn();
      client.on('cl:response', eventSpy);

      await client.headObject('head-emit');

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy.mock.calls[0]![0]).toBe('HeadObjectCommand');
    });
  });

  describe('exists', () => {
    it('returns true when entity is found', async () => {
      const entity = makeEntity(1, 'exists-key', 'data');
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      expect(await client.exists('exists-key')).toBe(true);
    });

    it('returns false when entity is not found', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      expect(await client.exists('nonexistent')).toBe(false);
    });
  });

  describe('deleteObject', () => {
    it('deletes an existing entity via DELETE', async () => {
      const entity = makeEntity(5, 'to-delete', 'data');
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));
      mockHttp.delete.mockResolvedValueOnce(mockResponse(deleteResponse(5), 200));

      const result = await client.deleteObject('to-delete');

      expect(result.DeleteMarker).toBe(false);
      expect(result.VersionId).toBe('');

      expect(mockHttp.delete).toHaveBeenCalledOnce();
      const deleteCall = mockHttp.delete.mock.calls[0];
      expect(deleteCall![0]).toContain('/entities/5');
    });

    it('succeeds even if object does not exist', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      const result = await client.deleteObject('nonexistent');

      expect(result.DeleteMarker).toBe(false);
      expect(mockHttp.delete).not.toHaveBeenCalled();
    });

    it('succeeds when delete returns 404', async () => {
      const entity = makeEntity(5, 'race-delete', 'data');
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));
      mockHttp.delete.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

      const result = await client.deleteObject('race-delete');

      expect(result.DeleteMarker).toBe(false);
    });

    it('throws DatabaseError when delete returns a server error', async () => {
      const entity = makeEntity(5, 'fail-delete', 'data');
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));
      mockHttp.delete.mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500));

      await expect(client.deleteObject('fail-delete')).rejects.toThrow(DatabaseError);
    });

    it('emits cl:response event on success', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      const eventSpy = vi.fn();
      client.on('cl:response', eventSpy);

      await client.deleteObject('event-delete');

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy.mock.calls[0]![0]).toBe('DeleteObjectCommand');
    });
  });

  describe('deleteObjects', () => {
    it('deletes multiple objects and returns results', async () => {
      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn().mockImplementation(async (batches: string[][], fn: (batch: string[]) => Promise<unknown>) => {
          const results = [];
          for (const batch of batches) {
            results.push(await fn(batch));
          }
          return { results, errors: [] };
        }),
      };
      (client as any).taskManager = mockTaskManager;

      const entity1 = makeEntity(1, 'key1', 'd');
      const entity2 = makeEntity(2, 'key2', 'd');
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([entity1]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([entity2]), 200));
      mockHttp.delete
        .mockResolvedValueOnce(mockResponse(deleteResponse(1), 200))
        .mockResolvedValueOnce(mockResponse(deleteResponse(2), 200));

      const result = await client.deleteObjects(['key1', 'key2']);

      expect(result.Deleted).toHaveLength(2);
      expect(result.Errors).toHaveLength(0);
    });

    it('reports errors for failed deletions', async () => {
      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn().mockImplementation(async (batches: string[][], fn: (batch: string[]) => Promise<unknown>) => {
          const results = [];
          for (const batch of batches) {
            results.push(await fn(batch));
          }
          return { results, errors: [] };
        }),
      };
      (client as any).taskManager = mockTaskManager;

      const entity1 = makeEntity(1, 'ok-key', 'd');
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([entity1]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([makeEntity(2, 'fail-key', 'd')]), 200));
      mockHttp.delete
        .mockResolvedValueOnce(mockResponse(deleteResponse(1), 200))
        .mockResolvedValueOnce(mockResponse({ error: 'boom' }, 500));

      const result = await client.deleteObjects(['ok-key', 'fail-key']);

      expect(result.Deleted).toHaveLength(1);
      expect(result.Errors).toHaveLength(1);
      expect(result.Errors[0]!.Key).toBe('fail-key');
    });

    it('emits cl:response event', async () => {
      const mockTaskManager = {
        concurrency: 2,
        process: vi.fn().mockResolvedValue({ results: [{ Deleted: [], Errors: [] }], errors: [] }),
      };
      (client as any).taskManager = mockTaskManager;

      const eventSpy = vi.fn();
      client.on('cl:response', eventSpy);

      await client.deleteObjects([]);

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy.mock.calls[0]![0]).toBe('DeleteObjectsCommand');
    });
  });

  describe('listObjects', () => {
    it('returns Contents, CommonPrefixes, IsTruncated for basic listing', async () => {
      const items = [
        makeEntity(1, 'file1.txt', 'a', { contentLength: 1 }),
        makeEntity(2, 'file2.txt', 'b', { contentLength: 2 }),
      ];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 2), 200));

      const result = await client.listObjects({ prefix: '' });

      expect(result.Contents).toHaveLength(2);
      expect(result.Contents[0]!.Key).toBe('file1.txt');
      expect(result.Contents[1]!.Key).toBe('file2.txt');
      expect(result.CommonPrefixes).toHaveLength(0);
      expect(result.IsTruncated).toBe(false);
      expect(result.KeyCount).toBe(2);
    });

    it('handles delimiter to produce CommonPrefixes', async () => {
      const items = [
        makeEntity(1, 'users/alice/profile.json', 'a'),
        makeEntity(2, 'users/bob/profile.json', 'b'),
        makeEntity(3, 'users/top.json', 'c'),
      ];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 3), 200));

      const result = await client.listObjects({ prefix: 'users/', delimiter: '/' });

      expect(result.CommonPrefixes).toHaveLength(2);
      const prefixes = result.CommonPrefixes.map((p) => p.Prefix).sort();
      expect(prefixes).toEqual(['users/alice/', 'users/bob/']);
      expect(result.Contents).toHaveLength(1);
      expect(result.Contents[0]!.Key).toBe('users/top.json');
    });

    it('handles pagination via continuationToken', async () => {
      const items = [makeEntity(3, 'page2-item', 'data')];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 5), 200));

      const token = Buffer.from('2', 'utf8').toString('base64');
      const result = await client.listObjects({ continuationToken: token, maxKeys: 2 });

      expect(result.ContinuationToken).toBe(token);
      expect(result.IsTruncated).toBe(true);
      expect(result.NextContinuationToken).toBeDefined();

      const queryCall = mockHttp.post.mock.calls[0];
      const queryStr = queryCall![1]?.body?.query as string;
      expect(queryStr).toContain('OFFSET 2');
    });

    it('returns IsTruncated=false when all results fit', async () => {
      const items = [makeEntity(1, 'only-one', 'data')];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 1), 200));

      const result = await client.listObjects({ maxKeys: 10 });

      expect(result.IsTruncated).toBe(false);
      expect(result.NextContinuationToken).toBeUndefined();
    });

    it('returns IsTruncated=true when more results exist', async () => {
      const items = [makeEntity(1, 'item1', 'a'), makeEntity(2, 'item2', 'b')];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 10), 200));

      const result = await client.listObjects({ maxKeys: 2 });

      expect(result.IsTruncated).toBe(true);
      expect(result.NextContinuationToken).toBeDefined();
    });

    it('handles invalid continuationToken gracefully by defaulting offset to 0', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const result = await client.listObjects({ continuationToken: 'not-base64!!' });

      expect(result.Contents).toHaveLength(0);
    });

    it('uses default maxKeys of 1000', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      await client.listObjects();

      const queryCall = mockHttp.post.mock.calls[0];
      const queryStr = queryCall![1]?.body?.query as string;
      expect(queryStr).toContain('LIMIT 1000');
    });

    it('emits cl:response event', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const eventSpy = vi.fn();
      client.on('cl:response', eventSpy);

      await client.listObjects();

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy.mock.calls[0]![0]).toBe('ListObjectsV2Command');
    });

    it('includes Prefix and Delimiter in response', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const result = await client.listObjects({ prefix: 'data/', delimiter: '/' });

      expect(result.Prefix).toBe('data/');
      expect(result.Delimiter).toBe('/');
    });
  });

  describe('copyObject', () => {
    it('copies source to new destination via POST', async () => {
      const sourceEntity = makeEntity(1, 'src.txt', 'source content', {
        contentType: 'text/plain',
        metadata: { origin: 'test' },
        etag: '"src-etag"',
      });

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(2), 200));

      const result = await client.copyObject({ from: 'src.txt', to: 'dst.txt', metadataDirective: 'COPY' });

      expect(result.CopyObjectResult.ETag).toBeDefined();
      expect(result.CopyObjectResult.LastModified).toBeDefined();
      expect(result.BucketKeyEnabled).toBe(false);
    });

    it('copies to existing destination via PATCH', async () => {
      const sourceEntity = makeEntity(1, 'src.txt', 'data');
      const destEntity = makeEntity(2, 'dst.txt', 'old data');

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([destEntity]), 200));
      mockHttp.patch.mockResolvedValueOnce(mockResponse(mutationResponse(2), 200));

      const result = await client.copyObject({ from: 'src.txt', to: 'dst.txt' });

      expect(result.CopyObjectResult.ETag).toBeDefined();
      expect(mockHttp.patch).toHaveBeenCalledOnce();
    });

    it('uses source metadata when metadataDirective is COPY', async () => {
      const sourceEntity = makeEntity(1, 'src.txt', 'data', {
        metadata: { original: 'yes' },
      });

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(2), 200));

      await client.copyObject({
        from: 'src.txt',
        to: 'dst.txt',
        metadataDirective: 'COPY',
        metadata: { replaced: 'no' },
      });

      const createCall = mockHttp.post.mock.calls[2];
      const fields = createCall![1]?.body?.fields;
      expect(fields._metadata).toBeDefined();
    });

    it('uses provided metadata when metadataDirective is REPLACE', async () => {
      const sourceEntity = makeEntity(1, 'src.txt', 'data', {
        metadata: { original: 'yes' },
      });

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(2), 200));

      await client.copyObject({
        from: 'src.txt',
        to: 'dst.txt',
        metadataDirective: 'REPLACE',
        metadata: { custom: 'value' },
      });

      const createCall = mockHttp.post.mock.calls[2];
      const fields = createCall![1]?.body?.fields;
      expect(fields._metadata).toBeDefined();
    });

    it('throws NoSuchKey when source does not exist', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      await expect(
        client.copyObject({ from: 'missing.txt', to: 'dst.txt' })
      ).rejects.toThrow(NoSuchKey);
    });

    it('throws DatabaseError when write fails', async () => {
      const sourceEntity = makeEntity(1, 'src.txt', 'data');

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse({ error: 'write failed' }, 500));

      await expect(
        client.copyObject({ from: 'src.txt', to: 'dst.txt' })
      ).rejects.toThrow(DatabaseError);
    });

    it('emits cl:response event', async () => {
      const sourceEntity = makeEntity(1, 'src.txt', 'data');
      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(2), 200));

      const eventSpy = vi.fn();
      client.on('cl:response', eventSpy);

      await client.copyObject({ from: 'src.txt', to: 'dst.txt' });

      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy.mock.calls[0]![0]).toBe('CopyObjectCommand');
    });

    it('uses provided contentType when given', async () => {
      const sourceEntity = makeEntity(1, 'src.txt', 'data', { contentType: 'text/plain' });

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(2), 200));

      await client.copyObject({ from: 'src.txt', to: 'dst.txt', contentType: 'application/json' });

      const createCall = mockHttp.post.mock.calls[2];
      const fields = createCall![1]?.body?.fields;
      expect(fields._content_type).toBe('application/json');
    });
  });

  describe('count', () => {
    it('returns total from query', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 42), 200));

      const total = await client.count({ prefix: 'users/' });

      expect(total).toBe(42);
    });

    it('defaults to 0 when no prefix provided', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const total = await client.count();

      expect(total).toBe(0);
    });

    it('emits cl:Count event', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 5), 200));

      const eventSpy = vi.fn();
      client.on('cl:Count', eventSpy);

      await client.count({ prefix: 'test/' });

      expect(eventSpy).toHaveBeenCalledWith(5, { prefix: 'test/' });
    });
  });

  describe('getKeysPage', () => {
    it('returns array of keys from query results', async () => {
      const items = [
        makeEntity(1, 'key-a', 'a'),
        makeEntity(2, 'key-b', 'b'),
      ];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 2), 200));

      const keys = await client.getKeysPage({ prefix: '', offset: 0, amount: 10 });

      expect(keys).toEqual(['key-a', 'key-b']);
    });

    it('uses defaults when no params given', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const keys = await client.getKeysPage();

      expect(keys).toEqual([]);

      const queryCall = mockHttp.post.mock.calls[0];
      const queryStr = queryCall![1]?.body?.query as string;
      expect(queryStr).toContain('LIMIT 100');
      expect(queryStr).toContain('OFFSET 0');
    });

    it('emits cl:GetKeysPage event', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const eventSpy = vi.fn();
      client.on('cl:GetKeysPage', eventSpy);

      await client.getKeysPage({ prefix: 'p/' });

      expect(eventSpy).toHaveBeenCalledOnce();
    });
  });

  describe('getAllKeys', () => {
    it('paginates through all pages to collect all keys', async () => {
      const page1 = Array.from({ length: 1000 }, (_, i) => makeEntity(i + 1, `key-${i}`, 'd'));
      const page2 = [makeEntity(1001, 'key-1000', 'd')];

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse(page1, 1001), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse(page2, 1001), 200));

      const keys = await client.getAllKeys();

      expect(keys).toHaveLength(1001);
      expect(keys[0]).toBe('key-0');
      expect(keys[1000]).toBe('key-1000');
    });

    it('returns empty array when no keys exist', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const keys = await client.getAllKeys();

      expect(keys).toEqual([]);
    });

    it('emits cl:GetAllKeys event', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const eventSpy = vi.fn();
      client.on('cl:GetAllKeys', eventSpy);

      await client.getAllKeys({ prefix: 'test/' });

      expect(eventSpy).toHaveBeenCalledOnce();
    });
  });

  describe('deleteAll', () => {
    it('deletes all objects with given prefix and returns count', async () => {
      const items = [makeEntity(1, 'del-a', 'd'), makeEntity(2, 'del-b', 'd')];

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse(items, 2), 200));

      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn().mockImplementation(async (batches: string[][], fn: (batch: string[]) => Promise<unknown>) => {
          const results = [];
          for (const batch of batches) {
            results.push(await fn(batch));
          }
          return { results, errors: [] };
        }),
      };
      (client as any).taskManager = mockTaskManager;

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([items[0]!]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([items[1]!]), 200));
      mockHttp.delete
        .mockResolvedValueOnce(mockResponse(deleteResponse(1), 200))
        .mockResolvedValueOnce(mockResponse(deleteResponse(2), 200));

      const deleted = await client.deleteAll({ prefix: 'del-' });

      expect(deleted).toBe(2);
    });

    it('returns 0 when no keys exist', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const deleted = await client.deleteAll();

      expect(deleted).toBe(0);
    });

    it('emits deleteAllComplete event', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const eventSpy = vi.fn();
      client.on('deleteAllComplete', eventSpy);

      await client.deleteAll();

      expect(eventSpy).toHaveBeenCalledWith({ prefix: '', totalDeleted: 0 });
    });
  });

  describe('getContinuationTokenAfterOffset', () => {
    it('returns null when offset is 0', async () => {
      const token = await client.getContinuationTokenAfterOffset({ offset: 0 });
      expect(token).toBeNull();
    });

    it('returns null when offset >= total', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 5), 200));

      const token = await client.getContinuationTokenAfterOffset({ offset: 10 });

      expect(token).toBeNull();
    });

    it('returns base64-encoded offset as token when offset < total', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 100), 200));

      const token = await client.getContinuationTokenAfterOffset({ prefix: '', offset: 50 });

      expect(token).toBeDefined();
      const decoded = Buffer.from(token!, 'base64').toString('utf8');
      expect(decoded).toBe('50');
    });

    it('defaults offset to 1000', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 500), 200));

      const token = await client.getContinuationTokenAfterOffset({});

      expect(token).toBeNull();
    });

    it('emits cl:GetContinuationTokenAfterOffset event', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 200), 200));

      const eventSpy = vi.fn();
      client.on('cl:GetContinuationTokenAfterOffset', eventSpy);

      await client.getContinuationTokenAfterOffset({ offset: 50 });

      expect(eventSpy).toHaveBeenCalledOnce();
    });
  });

  describe('moveObject', () => {
    it('copies then deletes the source object', async () => {
      const sourceEntity = makeEntity(1, 'old.txt', 'content');

      mockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(2), 200))
        .mockResolvedValueOnce(mockResponse(queryResponse([sourceEntity]), 200));
      mockHttp.delete.mockResolvedValueOnce(mockResponse(deleteResponse(1), 200));

      const result = await client.moveObject({ from: 'old.txt', to: 'new.txt' });

      expect(result).toBe(true);
    });

    it('throws DatabaseError when copy/delete fails', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      await expect(
        client.moveObject({ from: 'missing.txt', to: 'new.txt' })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('moveAllObjects', () => {
    it('moves all keys from one prefix to another', async () => {
      const items = [makeEntity(1, 'old/a', 'd')];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 1), 200));

      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn().mockImplementation(async (keys: string[], fn: (key: string) => Promise<unknown>) => {
          const results = [];
          for (const key of keys) {
            results.push(await fn(key));
          }
          return { results, errors: [] };
        }),
      };
      (client as any).taskManager = mockTaskManager;

      const copySpy = vi.spyOn(client, 'copyObject').mockResolvedValue({
        CopyObjectResult: { ETag: '"e"', LastModified: new Date().toISOString() },
        BucketKeyEnabled: false,
        VersionId: null,
        ServerSideEncryption: null,
      });
      const deleteSpy = vi.spyOn(client, 'deleteObject').mockResolvedValue({
        DeleteMarker: false,
        VersionId: '',
      });

      const result = await client.moveAllObjects({ prefixFrom: 'old/', prefixTo: 'new/' });

      expect(result).toHaveLength(1);
      expect(result[0]!.from).toBe('old/a');
      expect(result[0]!.to).toBe('new/a');

      copySpy.mockRestore();
      deleteSpy.mockRestore();
    });

    it('throws when some moves fail', async () => {
      const items = [makeEntity(1, 'old/a', 'd')];
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 1), 200));

      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn().mockResolvedValue({
          results: [],
          errors: [{ error: new Error('move failed'), index: 0 }],
        }),
      };
      (client as any).taskManager = mockTaskManager;

      await expect(
        client.moveAllObjects({ prefixFrom: 'old/', prefixTo: 'new/' })
      ).rejects.toThrow('Some objects could not be moved');
    });

    it('emits moveAllObjects event', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn().mockResolvedValue({ results: [], errors: [] }),
      };
      (client as any).taskManager = mockTaskManager;

      const eventSpy = vi.fn();
      client.on('moveAllObjects', eventSpy);

      await client.moveAllObjects({ prefixFrom: 'a/', prefixTo: 'b/' });

      expect(eventSpy).toHaveBeenCalledOnce();
    });
  });

  describe('key prefix', () => {
    let prefixedClient: RedDbClient;
    let prefixMockHttp: ReturnType<typeof createMockHttpClient>;

    beforeEach(() => {
      prefixedClient = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        bucket: 'test-bucket',
        collection: 'test-collection',
        keyPrefix: 'data/v1',
        logger: silentLogger,
      });
      prefixMockHttp = createMockHttpClient();
      (prefixedClient as any)._httpClient = prefixMockHttp;
    });

    afterEach(async () => {
      await prefixedClient.destroy();
    });

    it('_applyKeyPrefix prepends prefix to key', () => {
      const result = (prefixedClient as any)._applyKeyPrefix('users/alice.json');
      expect(result).toBe('data/v1/users/alice.json');
    });

    it('_applyKeyPrefix returns prefix alone for empty key', () => {
      const result = (prefixedClient as any)._applyKeyPrefix('');
      expect(result).toBe('data/v1');
    });

    it('_applyKeyPrefix returns prefix for undefined/null', () => {
      expect((prefixedClient as any)._applyKeyPrefix(undefined)).toBe('data/v1');
      expect((prefixedClient as any)._applyKeyPrefix(null)).toBe('data/v1');
    });

    it('_stripKeyPrefix removes prefix from key', () => {
      const result = (prefixedClient as any)._stripKeyPrefix('data/v1/users/alice.json');
      expect(result).toBe('users/alice.json');
    });

    it('_stripKeyPrefix returns key unchanged if prefix not present', () => {
      const result = (prefixedClient as any)._stripKeyPrefix('other/path');
      expect(result).toBe('other/path');
    });

    it('_stripKeyPrefix handles empty string', () => {
      const result = (prefixedClient as any)._stripKeyPrefix('');
      expect(result).toBe('');
    });

    it('no-prefix client _applyKeyPrefix returns key as-is', () => {
      const result = (client as any)._applyKeyPrefix('users/alice.json');
      expect(result).toBe('users/alice.json');
    });

    it('no-prefix client _applyKeyPrefix returns empty for undefined', () => {
      expect((client as any)._applyKeyPrefix(undefined)).toBe('');
      expect((client as any)._applyKeyPrefix(null)).toBe('');
    });

    it('no-prefix client _stripKeyPrefix returns key as-is', () => {
      const result = (client as any)._stripKeyPrefix('users/alice.json');
      expect(result).toBe('users/alice.json');
    });

    it('prefixed putObject uses full key in query', async () => {
      prefixMockHttp.post
        .mockResolvedValueOnce(mockResponse(queryResponse([]), 200))
        .mockResolvedValueOnce(mockResponse(mutationResponse(1), 200));

      await prefixedClient.putObject({ key: 'test.txt', body: 'data' });

      const queryCall = prefixMockHttp.post.mock.calls[0];
      const queryStr = queryCall![1]?.body?.query as string;
      expect(queryStr).toContain('data/v1/test.txt');
    });

    it('prefixed getObject strips prefix from internal key', async () => {
      const entity = makeEntity(1, 'data/v1/test.txt', 'content');
      prefixMockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([entity]), 200));

      const result = await prefixedClient.getObject('test.txt');
      expect(result).toBeDefined();
      expect(result.Body).toBeDefined();
    });

    it('prefixed listObjects strips prefix from returned keys', async () => {
      const items = [
        makeEntity(1, 'data/v1/file1.txt', 'a'),
        makeEntity(2, 'data/v1/file2.txt', 'b'),
      ];
      prefixMockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse(items, 2), 200));

      const result = await prefixedClient.listObjects({ prefix: '' });

      expect(result.Contents[0]!.Key).toBe('file1.txt');
      expect(result.Contents[1]!.Key).toBe('file2.txt');
    });
  });

  describe('_queryByKey', () => {
    it('escapes single quotes in key', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([]), 200));

      await client.exists("it's-a-key");

      const queryCall = mockHttp.post.mock.calls[0];
      const queryStr = queryCall![1]?.body?.query as string;
      expect(queryStr).toContain("it''s-a-key");
    });

    it('returns null on 404 response', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse({}, 404));

      const result = await client.exists('missing');
      expect(result).toBe(false);
    });

    it('throws DatabaseError on non-404 error', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse({ error: 'bad' }, 500));

      await expect(client.getObject('bad-key')).rejects.toThrow(DatabaseError);
    });
  });

  describe('_queryByPrefix', () => {
    it('escapes special SQL LIKE characters in prefix', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      await client.count({ prefix: '100%_done' });

      const queryCall = mockHttp.post.mock.calls[0];
      const queryStr = queryCall![1]?.body?.query as string;
      expect(queryStr).toContain('100\\%\\_done');
    });

    it('omits WHERE clause when prefix is empty', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse(queryResponse([], 0), 200));

      await client.count({ prefix: '' });

      const queryCall = mockHttp.post.mock.calls[0];
      const queryStr = queryCall![1]?.body?.query as string;
      expect(queryStr).not.toContain('WHERE');
    });

    it('returns empty result on 404', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse({}, 404));

      const total = await client.count({ prefix: 'missing/' });
      expect(total).toBe(0);
    });

    it('throws DatabaseError on non-404 error', async () => {
      mockHttp.post.mockResolvedValueOnce(mockResponse({ error: 'server error' }, 500));

      await expect(client.count({ prefix: 'bad/' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('getQueueStats', () => {
    it('returns stats from taskManager when available', () => {
      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn(),
        getStats: vi.fn().mockReturnValue({ queueSize: 10, activeCount: 2 }),
      };
      (client as any).taskManager = mockTaskManager;

      const stats = client.getQueueStats();

      expect(stats).toEqual({ queueSize: 10, activeCount: 2 });
    });

    it('returns null when taskManager has no getStats', () => {
      (client as any).taskManager = { concurrency: 5, process: vi.fn() };

      const stats = client.getQueueStats();

      expect(stats).toBeNull();
    });
  });

  describe('getAggregateMetrics', () => {
    it('returns metrics from taskManager when available', () => {
      const mockMetrics = { totalProcessed: 100 };
      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn(),
        getAggregateMetrics: vi.fn().mockReturnValue(mockMetrics),
      };
      (client as any).taskManager = mockTaskManager;

      const metrics = client.getAggregateMetrics(1000);

      expect(metrics).toEqual(mockMetrics);
      expect(mockTaskManager.getAggregateMetrics).toHaveBeenCalledWith(1000);
    });

    it('returns null when taskManager has no getAggregateMetrics', () => {
      (client as any).taskManager = { concurrency: 5, process: vi.fn() };

      const metrics = client.getAggregateMetrics();

      expect(metrics).toBeNull();
    });

    it('defaults since to 0', () => {
      const mockTaskManager = {
        concurrency: 5,
        process: vi.fn(),
        getAggregateMetrics: vi.fn().mockReturnValue(null),
      };
      (client as any).taskManager = mockTaskManager;

      client.getAggregateMetrics();

      expect(mockTaskManager.getAggregateMetrics).toHaveBeenCalledWith(0);
    });
  });

  describe('destroy', () => {
    it('sets httpClient to null', async () => {
      expect((client as any)._httpClient).not.toBeNull();

      await client.destroy();

      expect((client as any)._httpClient).toBeNull();
    });

    it('removes all listeners', async () => {
      client.on('cl:response', () => {});
      client.on('cl:Count', () => {});

      expect(client.listenerCount('cl:response')).toBe(1);

      await client.destroy();

      expect(client.listenerCount('cl:response')).toBe(0);
      expect(client.listenerCount('cl:Count')).toBe(0);
    });

    it('calls taskManager.destroy if available', async () => {
      const destroyFn = vi.fn();
      (client as any).taskManager = {
        concurrency: 5,
        process: vi.fn(),
        destroy: destroyFn,
      };

      await client.destroy();

      expect(destroyFn).toHaveBeenCalledOnce();
    });

    it('does not throw when taskManager has no destroy method', async () => {
      (client as any).taskManager = { concurrency: 5, process: vi.fn() };

      await expect(client.destroy()).resolves.toBeUndefined();
    });
  });

  describe('_getHttpClient', () => {
    it('creates an HTTP client lazily and caches it', async () => {
      const freshClient = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        logger: silentLogger,
      });
      expect((freshClient as any)._httpClient).toBeNull();

      const httpClient1 = await (freshClient as any)._getHttpClient();
      expect(httpClient1).toBeDefined();

      const httpClient2 = await (freshClient as any)._getHttpClient();
      expect(httpClient2).toBe(httpClient1);

      await freshClient.destroy();
    });

    it('configures bearer auth when authToken is provided', async () => {
      const freshClient = new RedDbClient({
        baseUrl: 'http://localhost:8080',
        authToken: 'test-token',
        logger: silentLogger,
      });

      const httpClient = await (freshClient as any)._getHttpClient();
      expect(httpClient).toBeDefined();

      await freshClient.destroy();
    });
  });

  describe('_entityToS3Object', () => {
    it('handles entity with no named data gracefully', () => {
      const entity = { id: 1, kind: 'TableRow', collection: 'test', data: {} };
      const obj = (client as any)._entityToS3Object(entity, true);

      expect(obj.ContentType).toBe('application/octet-stream');
      expect(obj.ETag).toBe('');
      expect(obj.Metadata).toEqual({});
    });

    it('handles entity with null body', () => {
      const entity = {
        id: 1,
        kind: 'TableRow',
        collection: 'test',
        data: {
          named: {
            _key: 'test',
            _body: undefined,
            _body_encoding: undefined,
            _etag: '"etag"',
            _content_type: 'text/plain',
            _metadata: {},
          },
        },
      };
      const obj = (client as any)._entityToS3Object(entity, true);

      expect(obj.Body).toBeUndefined();
      expect(obj.ContentType).toBe('text/plain');
    });

    it('decodes metadata values', () => {
      const entity = makeEntity(1, 'meta-test', 'data', { metadata: { status: 'active' } });
      const obj = (client as any)._entityToS3Object(entity, true);

      expect(obj.Metadata).toBeDefined();
      expect(typeof obj.Metadata).toBe('object');
    });

    it('converts non-string metadata values to string', () => {
      const entity = {
        id: 1,
        kind: 'TableRow',
        collection: 'test',
        data: {
          named: {
            _key: 'test',
            _etag: '"e"',
            _content_type: 'text/plain',
            _metadata: { count: 42 as any },
          },
        },
      };
      const obj = (client as any)._entityToS3Object(entity, true);
      expect(typeof Object.values(obj.Metadata)[0]).toBe('string');
    });
  });

  describe('_buildRowFields', () => {
    it('builds fields with all standard properties', () => {
      const fields = (client as any)._buildRowFields('my-key', {
        body: 'hello',
        metadata: { tag: 'v1' },
        contentType: 'text/plain',
        contentEncoding: 'gzip',
        contentLength: 5,
      });

      expect(fields._key).toBe('my-key');
      expect(fields._etag).toBe(computeETag('hello'));
      expect(fields._content_type).toBe('text/plain');
      expect(fields._content_encoding).toBe('gzip');
      expect(fields._content_length).toBe(5);
      expect(fields._body).toBe('hello');
      expect(fields._body_encoding).toBe('utf8');
      expect(fields._last_modified).toBeDefined();
      expect(fields._metadata).toBeDefined();
    });

    it('defaults contentType to application/octet-stream', () => {
      const fields = (client as any)._buildRowFields('key', { body: 'data' });
      expect(fields._content_type).toBe('application/octet-stream');
    });

    it('omits contentEncoding when not provided', () => {
      const fields = (client as any)._buildRowFields('key', { body: 'data' });
      expect(fields._content_encoding).toBeUndefined();
    });

    it('omits contentLength when not provided', () => {
      const fields = (client as any)._buildRowFields('key', { body: 'data' });
      expect(fields._content_length).toBeUndefined();
    });

    it('handles null/undefined body', () => {
      const fields = (client as any)._buildRowFields('key', {});
      expect(fields._body).toBeUndefined();
      expect(fields._body_encoding).toBeUndefined();
    });
  });
});
