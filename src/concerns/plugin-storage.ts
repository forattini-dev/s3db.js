import { metadataEncode, metadataDecode } from './metadata-encoding.js';
import { calculateEffectiveLimit, calculateUTF8Bytes } from './calculator.js';
import { tryFn } from './try-fn.js';
import { idGenerator } from './id.js';
import { streamToString } from '../stream/index.js';
import { PluginStorageError, MetadataLimitError, BehaviorError } from '../errors.js';
import { DistributedLock, computeBackoff, sleep, isPreconditionFailure, StorageAdapter, LockHandle, AcquireOptions } from './distributed-lock.js';
import { DistributedSequence } from './distributed-sequence.js';

const S3_METADATA_LIMIT = 2047;

const SEQUENCE_GATES = new Map<string, Promise<void>>();

async function withSequenceGate<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
  const previous = SEQUENCE_GATES.get(lockKey) ?? Promise.resolve();
  const waitForPrevious = previous.catch(() => undefined);
  let release!: () => void;

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const nextGate = waitForPrevious.then(() => gate);
  SEQUENCE_GATES.set(lockKey, nextGate);

  await waitForPrevious;

  try {
    return await task();
  } finally {
    release();
    if (SEQUENCE_GATES.get(lockKey) === nextGate) {
      SEQUENCE_GATES.delete(lockKey);
    }
  }
}

export type PluginBehavior = 'body-overflow' | 'body-only' | 'enforce-limits';

export interface PluginStorageSetOptions {
  ttl?: number;
  behavior?: PluginBehavior;
  contentType?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
}

export interface PluginStorageListOptions {
  limit?: number;
}

export interface BatchSetItem {
  key: string;
  data: Record<string, unknown>;
  options?: PluginStorageSetOptions;
}

export interface BatchSetResult {
  ok: boolean;
  key: string;
  error?: Error;
}

export interface BatchGetResult {
  key: string;
  ok: boolean;
  data?: Record<string, unknown> | null;
  error?: Error;
}

export interface SequenceOptions {
  resourceName?: string | null;
  initialValue?: number;
  increment?: number;
  lockTimeout?: number;
  lockTTL?: number;
}

export interface ResetSequenceOptions {
  resourceName?: string | null;
  lockTimeout?: number;
  lockTTL?: number;
}

export interface ListSequenceOptions {
  resourceName?: string | null;
}

export interface PluginSequenceInfo {
  name: string;
  value: number;
  resourceName?: string | null;
  createdAt: number;
  updatedAt?: number;
  resetAt?: number;
}

export interface BehaviorResult {
  metadata: Record<string, unknown>;
  body: Record<string, unknown> | null;
}

export interface PluginClient {
  config: { keyPrefix?: string };
  getObject(key: string): Promise<GetObjectResponse>;
  putObject(params: PutObjectParams): Promise<PutObjectResponse>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<HeadObjectResponse>;
  copyObject(params: CopyObjectParams): Promise<CopyObjectResponse>;
  listObjects(params: ListObjectsParams): Promise<ListObjectsResponse>;
  getAllKeys(params: Record<string, unknown>): Promise<string[]>;
}

interface GetObjectResponse {
  Body?: GetObjectBody;
  Metadata?: Record<string, string>;
  ContentType?: string;
}

type GetObjectBody =
  | string
  | Uint8Array
  | ArrayBuffer
  | Buffer
  | {
      transformToString?: () => Promise<string>;
      transformToByteArray?: () => Promise<Uint8Array>;
      on?: (...args: unknown[]) => void;
      [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer>;
    };

interface HeadObjectResponse {
  Metadata?: Record<string, string>;
  ContentType?: string;
}

interface PutObjectParams {
  key: string;
  metadata?: Record<string, unknown>;
  body?: string;
  contentType?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
}

interface PutObjectResponse {
  ETag?: string;
}

interface CopyObjectParams {
  from: string;
  to: string;
  metadata?: Record<string, string>;
  metadataDirective?: string;
  contentType?: string;
}

interface CopyObjectResponse {
  ETag?: string;
}

interface ListObjectsParams {
  prefix: string;
  maxKeys?: number;
}

interface ListObjectsResponse {
  Contents?: Array<{ Key: string }>;
}

interface SequenceLockOptions {
  ttl?: number;
  timeout?: number;
}

export interface PluginStorageOptions {
  /**
   * Custom time function for testing. Defaults to Date.now.
   * Inject a mock function to enable time-travel in tests.
   */
  now?: () => number;
}

export class PluginStorage {
  client: PluginClient;
  pluginSlug: string;
  private _lock: DistributedLock;
  private _sequence: DistributedSequence;
  private _now: () => number;

  constructor(client: PluginClient, pluginSlug: string, options: PluginStorageOptions = {}) {
    if (!client) {
      throw new PluginStorageError('PluginStorage requires a client instance', {
        operation: 'constructor',
        pluginSlug,
        suggestion: 'Pass a valid S3db Client instance when creating PluginStorage'
      });
    }
    if (!pluginSlug) {
      throw new PluginStorageError('PluginStorage requires a pluginSlug', {
        operation: 'constructor',
        suggestion: 'Provide a plugin slug (e.g., "eventual-consistency", "cache", "audit")'
      });
    }

    this.client = client;
    this.pluginSlug = pluginSlug;
    // Use arrow function to capture Date.now dynamically (enables FakeTimers mocking)
    this._now = options.now ?? (() => Date.now());

    this._lock = new DistributedLock(this as unknown as StorageAdapter, {
      keyGenerator: (name: string) => this.getPluginKey(null, 'locks', name)
    });

    this._sequence = new DistributedSequence(this as any, {
      valueKeyGenerator: (name: string) =>
        this.getSequenceKey(null, name, 'value'),
      lockKeyGenerator: (name: string) =>
        this.getSequenceKey(null, name, 'lock')
    });
  }

  getPluginKey(resourceName: string | null, ...parts: string[]): string {
    if (resourceName) {
      return `resource=${resourceName}/plugin=${this.pluginSlug}/${parts.join('/')}`;
    }
    return `plugin=${this.pluginSlug}/${parts.join('/')}`;
  }

  getSequenceKey(resourceName: string | null, sequenceName: string, suffix: string): string {
    if (resourceName) {
      return `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
    }
    return `plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
  }

  async set(key: string, data: Record<string, unknown>, options: PluginStorageSetOptions = {}): Promise<PutObjectResponse> {
    const {
      ttl,
      behavior = 'body-overflow',
      contentType = 'application/json',
      ifMatch,
      ifNoneMatch
    } = options;

    const dataToSave: Record<string, unknown> = { ...data };

    if (ttl && typeof ttl === 'number' && ttl > 0) {
      dataToSave._expiresAt = this._now() + (ttl * 1000);
    }

    const { metadata, body } = this._applyBehavior(dataToSave, behavior);

    const putParams: PutObjectParams = {
      key,
      metadata,
      contentType
    };

    if (body !== null) {
      putParams.body = JSON.stringify(body);
    }

    if (ifMatch !== undefined) {
      putParams.ifMatch = ifMatch;
    }
    if (ifNoneMatch !== undefined) {
      putParams.ifNoneMatch = ifNoneMatch;
    }

    const [ok, err, response] = await tryFn(() => this.client.putObject(putParams));

    if (!ok) {
      throw new PluginStorageError(`Failed to save plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: 'set',
        behavior,
        ttl,
        original: err,
        suggestion: 'Check S3 permissions and key format'
      });
    }

    return response;
  }

  async batchSet(items: BatchSetItem[]): Promise<BatchSetResult[]> {
    const promises = items.map(async (item): Promise<BatchSetResult> => {
      const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options || {}));
      return { ok, key: item.key, error: ok ? undefined : error as Error };
    });

    return Promise.all(promises);
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    const [ok, err, response] = await tryFn<GetObjectResponse>(() => this.client.getObject(key));

    if (!ok || !response) {
      const error = err as { name?: string; code?: string; Code?: string; statusCode?: number } | undefined;
      if (
        error?.name === 'NoSuchKey' ||
        error?.code === 'NoSuchKey' ||
        error?.Code === 'NoSuchKey' ||
        error?.statusCode === 404
      ) {
        return null;
      }
      throw new PluginStorageError(`Failed to retrieve plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: 'get',
        original: err,
        suggestion: 'Check if the key exists and S3 permissions are correct'
      });
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    let data: Record<string, unknown> = parsedMetadata;

    if (response.Body) {
      const [parseOk, parseErr, result] = await tryFn(async () => {
        const bodyContent = await this._readBodyAsString(response.Body);

        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          return { ...parsedMetadata, ...body };
        }
        return parsedMetadata;
      });

      if (!parseOk || !result) {
        throw new PluginStorageError(`Failed to parse JSON body`, {
          pluginSlug: this.pluginSlug,
          key,
          operation: 'get',
          original: parseErr,
          suggestion: 'Body content may be corrupted. Check S3 object integrity'
        });
      }

      data = result;
    }

    const expiresAt = (data._expiresat || data._expiresAt) as number | undefined;
    if (expiresAt) {
      if (this._now() > expiresAt) {
        await this.delete(key);
        return null;
      }
      delete data._expiresat;
      delete data._expiresAt;
    }

    return data;
  }

  private _parseMetadataValues(metadata: Record<string, string>): Record<string, unknown> {
    const parsed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        if (
          (value.startsWith('{') && value.endsWith('}')) ||
          (value.startsWith('[') && value.endsWith(']'))
        ) {
          try {
            parsed[key] = JSON.parse(value);
            continue;
          } catch {
            // Not JSON, keep as string
          }
        }

        if (!isNaN(Number(value)) && value.trim() !== '') {
          parsed[key] = Number(value);
          continue;
        }

        if (value === 'true') {
          parsed[key] = true;
          continue;
        }
        if (value === 'false') {
          parsed[key] = false;
          continue;
        }
      }

      parsed[key] = value;
    }
    return parsed;
  }

  private async _readBodyAsString(body: GetObjectBody | undefined): Promise<string> {
    if (!body) {
      return '';
    }

    const bodyAny = body as {
      transformToString?: () => Promise<string>;
      transformToByteArray?: () => Promise<Uint8Array>;
      on?: (...args: unknown[]) => void;
      [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer>;
    };

    if (typeof bodyAny.transformToString === 'function') {
      return bodyAny.transformToString();
    }

    if (typeof bodyAny.transformToByteArray === 'function') {
      const bytes = await bodyAny.transformToByteArray();
      return Buffer.from(bytes).toString('utf-8');
    }

    if (typeof body === 'string') {
      return body;
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body).toString('utf-8');
    }

    if (body instanceof ArrayBuffer) {
      return Buffer.from(body).toString('utf-8');
    }

    if (typeof bodyAny.on === 'function') {
      return streamToString(bodyAny as any);
    }

    if (typeof bodyAny[Symbol.asyncIterator] === 'function') {
      const chunks: Buffer[] = [];
      for await (const chunk of bodyAny as AsyncIterable<Uint8Array | Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf-8');
    }

    return String(body);
  }

  async list(prefix: string = '', options: PluginStorageListOptions = {}): Promise<string[]> {
    const { limit } = options;

    const fullPrefix = prefix
      ? `plugin=${this.pluginSlug}/${prefix}`
      : `plugin=${this.pluginSlug}/`;

    const [ok, err, result] = await tryFn<ListObjectsResponse>(() =>
      this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );

    if (!ok || !result) {
      throw new PluginStorageError(`Failed to list plugin data`, {
        pluginSlug: this.pluginSlug,
        operation: 'list',
        prefix,
        fullPrefix,
        limit,
        original: err,
        suggestion: 'Check S3 permissions and bucket configuration'
      });
    }

    const keys = (result.Contents ?? []).map(item => item.Key).filter((k): k is string => typeof k === 'string');
    return this._removeKeyPrefix(keys);
  }

  async listForResource(resourceName: string, subPrefix: string = '', options: PluginStorageListOptions = {}): Promise<string[]> {
    const { limit } = options;

    const fullPrefix = subPrefix
      ? `resource=${resourceName}/plugin=${this.pluginSlug}/${subPrefix}`
      : `resource=${resourceName}/plugin=${this.pluginSlug}/`;

    const [ok, err, result] = await tryFn<ListObjectsResponse>(() =>
      this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );

    if (!ok || !result) {
      throw new PluginStorageError(`Failed to list resource data`, {
        pluginSlug: this.pluginSlug,
        operation: 'listForResource',
        resourceName,
        subPrefix,
        fullPrefix,
        limit,
        original: err,
        suggestion: 'Check resource name and S3 permissions'
      });
    }

    const keys = (result.Contents ?? []).map(item => item.Key).filter((k): k is string => typeof k === 'string');
    return this._removeKeyPrefix(keys);
  }

  async listWithPrefix(prefix: string = '', options: PluginStorageListOptions = {}): Promise<Record<string, unknown>[]> {
    const keys = await this.list(prefix, options);

    if (!keys || keys.length === 0) {
      return [];
    }

    const results = await this.batchGet(keys);

    return results
      .filter(item => item.ok && item.data != null)
      .map(item => item.data!);
  }

  protected _removeKeyPrefix(keys: string[]): string[] {
    const keyPrefix = this.client.config.keyPrefix;
    if (!keyPrefix) return keys;

    return keys
      .map(key => key.replace(keyPrefix, ''))
      .map(key => (key.startsWith('/') ? key.replace('/', '') : key));
  }

  async has(key: string): Promise<boolean> {
    const data = await this.get(key);
    return data !== null;
  }

  async isExpired(key: string): Promise<boolean> {
    const [ok, , response] = await tryFn<GetObjectResponse>(() => this.client.getObject(key));

    if (!ok || !response) {
      return true;
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    let data: Record<string, unknown> = parsedMetadata;

    if (response.Body) {
      const [parseOk, , result] = await tryFn<Record<string, unknown>>(async () => {
        const bodyContent = await this._readBodyAsString(response.Body);
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          return { ...parsedMetadata, ...body };
        }
        return parsedMetadata;
      });

      if (!parseOk || !result) {
        return true;
      }

      data = result;
    }

    const expiresAt = (data._expiresat || data._expiresAt) as number | undefined;
    if (!expiresAt) {
      return false;
    }

    return this._now() > expiresAt;
  }

  async getTTL(key: string): Promise<number | null> {
    const [ok, , response] = await tryFn<GetObjectResponse>(() => this.client.getObject(key));

    if (!ok || !response) {
      return null;
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    let data: Record<string, unknown> = parsedMetadata;

    if (response.Body) {
      const [parseOk, , result] = await tryFn<Record<string, unknown>>(async () => {
        const bodyContent = await this._readBodyAsString(response.Body);
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          return { ...parsedMetadata, ...body };
        }
        return parsedMetadata;
      });

      if (!parseOk || !result) {
        return null;
      }

      data = result;
    }

    const expiresAt = (data._expiresat || data._expiresAt) as number | undefined;
    if (!expiresAt) {
      return null;
    }

    const remaining = Math.max(0, expiresAt - this._now());
    return Math.floor(remaining / 1000);
  }

  async touch(key: string, additionalSeconds: number): Promise<boolean> {
    const [ok, , response] = await tryFn<HeadObjectResponse>(() => this.client.headObject(key));

    if (!ok || !response) {
      return false;
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    const expiresAt = (parsedMetadata._expiresat || parsedMetadata._expiresAt) as number | undefined;
    if (!expiresAt) {
      return false;
    }

    parsedMetadata._expiresAt = expiresAt + (additionalSeconds * 1000);
    delete parsedMetadata._expiresat;

    const encodedMetadata: Record<string, string> = {};
    for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
      const { encoded } = metadataEncode(metaValue);
      encodedMetadata[metaKey] = encoded;
    }

    const [copyOk] = await tryFn(() => this.client.copyObject({
      from: key,
      to: key,
      metadata: encodedMetadata,
      metadataDirective: 'REPLACE',
      contentType: response.ContentType || 'application/json'
    }));

    return copyOk;
  }

  async delete(key: string): Promise<void> {
    const [ok, err] = await tryFn(() => this.client.deleteObject(key));

    if (!ok) {
      throw new PluginStorageError(`Failed to delete plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: 'delete',
        original: err,
        suggestion: 'Check S3 delete permissions'
      });
    }
  }

  async deleteAll(resourceName: string | null = null): Promise<number> {
    let deleted = 0;

    if (resourceName) {
      const keys = await this.listForResource(resourceName);

      for (const key of keys) {
        await this.delete(key);
        deleted++;
      }
    } else {
      const allKeys = await this.client.getAllKeys({});

      const pluginKeys = allKeys.filter(key =>
        key.includes(`plugin=${this.pluginSlug}/`)
      );

      for (const key of pluginKeys) {
        await this.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  async batchPut(items: BatchSetItem[]): Promise<BatchSetResult[]> {
    const promises = items.map(async (item): Promise<BatchSetResult> => {
      const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options));
      return { key: item.key, ok, error: ok ? undefined : error as Error };
    });

    return Promise.all(promises);
  }

  async batchGet(keys: string[]): Promise<BatchGetResult[]> {
    const promises = keys.map(async (key): Promise<BatchGetResult> => {
      const [ok, error, data] = await tryFn<Record<string, unknown> | null>(() => this.get(key));
      return { key, ok, data, error: ok ? undefined : error as Error };
    });

    return Promise.all(promises);
  }

  /**
   * Set data only if the key does not exist (conditional PUT).
   * Uses ifNoneMatch: '*' to ensure atomicity.
   * @returns The ETag (version) if set succeeded, null if key already exists.
   */
  async setIfNotExists(key: string, data: Record<string, unknown>, options: PluginStorageSetOptions = {}): Promise<string | null> {
    const [ok, err, response] = await tryFn(() => this.set(key, data, { ...options, ifNoneMatch: '*' }));

    if (!ok) {
      const error = err as { name?: string; code?: string; statusCode?: number } | undefined;
      // PreconditionFailed (412) or similar means key already exists
      if (
        error?.name === 'PreconditionFailed' ||
        error?.code === 'PreconditionFailed' ||
        error?.statusCode === 412
      ) {
        return null;
      }
      throw err;
    }

    return response?.ETag ?? null;
  }

  /**
   * Get data along with its version (ETag) for conditional updates.
   * @returns Object with data and version, or { data: null, version: null } if not found.
   */
  async getWithVersion(key: string): Promise<{ data: Record<string, unknown> | null; version: string | null }> {
    const [ok, err, response] = await tryFn<GetObjectResponse>(() => this.client.getObject(key));

    if (!ok || !response) {
      const error = err as { name?: string; code?: string; Code?: string; statusCode?: number } | undefined;
      if (
        error?.name === 'NoSuchKey' ||
        error?.code === 'NoSuchKey' ||
        error?.Code === 'NoSuchKey' ||
        error?.statusCode === 404
      ) {
        return { data: null, version: null };
      }
      throw new PluginStorageError(`Failed to retrieve plugin data with version`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: 'getWithVersion',
        original: err,
        suggestion: 'Check if the key exists and S3 permissions are correct'
      });
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);
    let data: Record<string, unknown> = parsedMetadata;

    if (response.Body) {
      const [parseOk, parseErr, result] = await tryFn(async () => {
        const bodyContent = await this._readBodyAsString(response.Body);
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          return { ...parsedMetadata, ...body };
        }
        return parsedMetadata;
      });

      if (!parseOk || !result) {
        throw new PluginStorageError(`Failed to parse JSON body`, {
          pluginSlug: this.pluginSlug,
          key,
          operation: 'getWithVersion',
          original: parseErr,
          suggestion: 'Body content may be corrupted'
        });
      }

      data = result;
    }

    // Check expiration
    const expiresAt = (data._expiresat || data._expiresAt) as number | undefined;
    if (expiresAt && this._now() > expiresAt) {
      await this.delete(key);
      return { data: null, version: null };
    }

    // Clean up internal fields
    delete data._expiresat;
    delete data._expiresAt;

    // Extract ETag from response - need to get it from headObject since getObject may not return it
    const [headOk, , headResponse] = await tryFn<HeadObjectResponse & { ETag?: string }>(() =>
      this.client.headObject(key)
    );
    const version = headOk && headResponse ? (headResponse as any).ETag ?? null : null;

    return { data, version };
  }

  /**
   * Set data only if the current version matches (conditional PUT).
   * Uses ifMatch to ensure no concurrent modifications.
   * @returns The new ETag (version) if set succeeded, null if version mismatch.
   */
  async setIfVersion(key: string, data: Record<string, unknown>, version: string, options: PluginStorageSetOptions = {}): Promise<string | null> {
    const [ok, err, response] = await tryFn(() => this.set(key, data, { ...options, ifMatch: version }));

    if (!ok) {
      const error = err as { name?: string; code?: string; statusCode?: number } | undefined;
      // PreconditionFailed (412) means version mismatch
      if (
        error?.name === 'PreconditionFailed' ||
        error?.code === 'PreconditionFailed' ||
        error?.statusCode === 412
      ) {
        return null;
      }
      throw err;
    }

    return response?.ETag ?? null;
  }

  /**
   * Delete data only if the current version matches (conditional DELETE).
   * @returns true if deleted, false if version mismatch or key not found.
   */
  async deleteIfVersion(key: string, version: string): Promise<boolean> {
    // First verify the version matches
    const [headOk, , headResponse] = await tryFn<HeadObjectResponse & { ETag?: string }>(() =>
      this.client.headObject(key)
    );

    if (!headOk || !headResponse) {
      return false;
    }

    const currentVersion = (headResponse as any).ETag;
    if (currentVersion !== version) {
      return false;
    }

    const [deleteOk] = await tryFn(() => this.client.deleteObject(key));
    return deleteOk;
  }

  async acquireLock(lockName: string, options: AcquireOptions = {}): Promise<LockHandle | null> {
    return this._lock.acquire(lockName, options);
  }

  async releaseLock(lock: LockHandle | string, token?: string): Promise<void> {
    return this._lock.release(lock, token);
  }

  async withLock<T>(lockName: string, options: AcquireOptions, callback: (lock: LockHandle) => Promise<T>): Promise<T | null> {
    return this._lock.withLock(lockName, options, callback);
  }

  async isLocked(lockName: string): Promise<boolean> {
    return this._lock.isLocked(lockName);
  }

  async increment(key: string, amount: number = 1, options: PluginStorageSetOptions = {}): Promise<number> {
    const [headOk, , headResponse] = await tryFn<HeadObjectResponse>(() => this.client.headObject(key));

    if (headOk && headResponse?.Metadata) {
      const metadata = headResponse.Metadata || {};
      const parsedMetadata = this._parseMetadataValues(metadata);

      const currentValue = (parsedMetadata.value as number) || 0;
      const newValue = currentValue + amount;

      parsedMetadata.value = newValue;

      if (options.ttl) {
        parsedMetadata._expiresAt = this._now() + (options.ttl * 1000);
      }

      const encodedMetadata: Record<string, string> = {};
      for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
        const { encoded } = metadataEncode(metaValue);
        encodedMetadata[metaKey] = encoded;
      }

      const [copyOk] = await tryFn(() => this.client.copyObject({
        from: key,
        to: key,
        metadata: encodedMetadata,
        metadataDirective: 'REPLACE',
        contentType: headResponse.ContentType || 'application/json'
      }));

      if (copyOk) {
        return newValue;
      }
    }

    const data = await this.get(key);
    const value = ((data?.value as number) || 0) + amount;
    await this.set(key, { value }, options);
    return value;
  }

  async decrement(key: string, amount: number = 1, options: PluginStorageSetOptions = {}): Promise<number> {
    return this.increment(key, -amount, options);
  }

  async nextSequence(name: string, options: SequenceOptions = {}): Promise<number> {
    const {
      resourceName = null,
      initialValue = 1,
      increment = 1,
      lockTimeout = 5000,
      lockTTL = 10
    } = options;

    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const lockKey = this.getSequenceKey(resourceName, name, 'lock');

    const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      const data = await this.get(valueKey);

      if (!data) {
        await this.set(valueKey, {
          value: initialValue + increment,
          name,
          resourceName,
          createdAt: this._now()
        }, { behavior: 'body-only' });
        return initialValue;
      }

      const currentValue = data.value as number;
      await this.set(valueKey, {
        ...data,
        value: currentValue + increment,
        updatedAt: this._now()
      }, { behavior: 'body-only' });

      return currentValue;
    });

    if (result === null) {
      throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
        pluginSlug: this.pluginSlug,
        operation: 'nextSequence',
        sequenceName: name,
        resourceName,
        lockTimeout,
        suggestion: 'Increase lockTimeout or check for deadlocks'
      });
    }

    return result;
  }

  private async _withSequenceLock<T>(lockKey: string, options: SequenceLockOptions, callback: () => Promise<T>): Promise<T | null> {
    const { ttl = 30, timeout = 5000 } = options;
    const token = idGenerator();
    const startTime = this._now();
    let attempt = 0;

    return withSequenceGate(lockKey, async () => {
      while (true) {
        const payload = {
          token,
          acquiredAt: this._now(),
          _expiresAt: this._now() + (ttl * 1000)
        };

        const [ok, err] = await tryFn(() => this.set(lockKey, payload, {
          behavior: 'body-only',
          ifNoneMatch: '*'
        }));

        if (ok) {
          try {
            return await callback();
          } finally {
            const current = await this.get(lockKey);
            if (current && current.token === token) {
              await tryFn(() => this.delete(lockKey));
            }
          }
        }

        if (!isPreconditionFailure(err as Error)) {
          throw err;
        }

        if (timeout !== undefined && this._now() - startTime >= timeout) {
          return null;
        }

        const current = await this.get(lockKey);
        if (!current) continue;

        if (current._expiresAt && this._now() > (current._expiresAt as number)) {
          await tryFn(() => this.delete(lockKey));
          continue;
        }

        attempt += 1;
        const delay = computeBackoff(attempt, 100, 1000);
        await sleep(delay);
      }
    });
  }

  async getSequence(name: string, options: { resourceName?: string | null } = {}): Promise<number | null> {
    const { resourceName = null } = options;
    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const data = await this.get(valueKey);
    return (data?.value as number) ?? null;
  }

  async resetSequence(name: string, value: number, options: ResetSequenceOptions = {}): Promise<boolean> {
    const { resourceName = null, lockTimeout = 5000, lockTTL = 10 } = options;

    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const lockKey = this.getSequenceKey(resourceName, name, 'lock');

    const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      const data = await this.get(valueKey);

      await this.set(valueKey, {
        value,
        name,
        resourceName,
        createdAt: (data?.createdAt as number) || this._now(),
        updatedAt: this._now(),
        resetAt: this._now()
      }, { behavior: 'body-only' });

      return true;
    });

    if (result === null) {
      throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
        pluginSlug: this.pluginSlug,
        operation: 'resetSequence',
        sequenceName: name,
        resourceName,
        lockTimeout,
        suggestion: 'Increase lockTimeout or check for deadlocks'
      });
    }

    return result;
  }

  async deleteSequence(name: string, options: { resourceName?: string | null } = {}): Promise<void> {
    const { resourceName = null } = options;
    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const lockKey = this.getSequenceKey(resourceName, name, 'lock');
    await this.delete(valueKey);
    await tryFn(() => this.delete(lockKey));
  }

  async listSequences(options: ListSequenceOptions = {}): Promise<PluginSequenceInfo[]> {
    const { resourceName = null } = options;

    let prefix: string;
    if (resourceName) {
      prefix = `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=`;
    } else {
      prefix = `plugin=${this.pluginSlug}/sequence=`;
    }

    const [ok, , result] = await tryFn<ListObjectsResponse>(() =>
      this.client.listObjects({ prefix })
    );

    if (!ok || !result) return [];

    const keys = (result.Contents ?? []).map(item => item.Key).filter((k): k is string => typeof k === 'string');
    const valueKeys = keys.filter(k => k.endsWith('/value'));

    const sequences: PluginSequenceInfo[] = [];
    for (const key of valueKeys) {
      const data = await this.get(key);
      if (data) {
        sequences.push(data as unknown as PluginSequenceInfo);
      }
    }

    return sequences;
  }

  _applyBehavior(data: Record<string, unknown>, behavior: PluginBehavior): BehaviorResult {
    const effectiveLimit = calculateEffectiveLimit({ s3Limit: S3_METADATA_LIMIT });
    let metadata: Record<string, unknown> = {};
    let body: Record<string, unknown> | null = null;

    switch (behavior) {
      case 'body-overflow': {
        const entries = Object.entries(data);
        const sorted = entries.map(([key, value]) => {
          const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
          const { encoded } = metadataEncode(jsonValue);
          const keySize = calculateUTF8Bytes(key);
          const valueSize = calculateUTF8Bytes(encoded);
          return { key, value, jsonValue, encoded, size: keySize + valueSize };
        }).sort((a, b) => a.size - b.size);

        let currentSize = 0;
        for (const item of sorted) {
          if (currentSize + item.size <= effectiveLimit) {
            metadata[item.key] = item.jsonValue;
            currentSize += item.size;
          } else {
            if (body === null) body = {};
            body[item.key] = item.value;
          }
        }
        break;
      }

      case 'body-only': {
        body = data;
        break;
      }

      case 'enforce-limits': {
        let currentSize = 0;
        for (const [key, value] of Object.entries(data)) {
          const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
          const { encoded } = metadataEncode(jsonValue);
          const keySize = calculateUTF8Bytes(key);
          const valueSize = calculateUTF8Bytes(encoded);
          currentSize += keySize + valueSize;

          if (currentSize > effectiveLimit) {
            throw new MetadataLimitError(`Data exceeds metadata limit with enforce-limits behavior`, {
              totalSize: currentSize,
              effectiveLimit,
              absoluteLimit: S3_METADATA_LIMIT,
              excess: currentSize - effectiveLimit,
              operation: 'PluginStorage.set',
              pluginSlug: this.pluginSlug,
              suggestion: "Use 'body-overflow' or 'body-only' behavior to handle large data"
            });
          }

          metadata[key] = jsonValue;
        }
        break;
      }

      default:
        throw new BehaviorError(`Unknown behavior: ${behavior}`, {
          behavior,
          availableBehaviors: ['body-overflow', 'body-only', 'enforce-limits'],
          operation: 'PluginStorage._applyBehavior',
          pluginSlug: this.pluginSlug,
          suggestion: "Use 'body-overflow', 'body-only', or 'enforce-limits'"
        });
    }

    return { metadata, body };
  }
}

export default PluginStorage;
