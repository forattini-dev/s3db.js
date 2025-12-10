import { tryFn } from './try-fn.js';
import { idGenerator as generateId } from './id.js';
import { DistributedLock, computeBackoff, sleep, isPreconditionFailure, StorageAdapter, LockHandle } from './distributed-lock.js';

export type IncrementalMode = 'standard' | 'fast';

export interface IncrementalConfig {
  type: 'incremental';
  start: number;
  increment: number;
  mode: IncrementalMode;
  batchSize: number;
  prefix: string;
  padding: number;
}

export interface ParseIncrementalOptions {
  validate?: boolean;
}

export interface ValidationOptions {
  throwOnError?: boolean;
}

export interface IncrementalValidationError {
  field: string;
  message: string;
  value: unknown;
}

export interface IncrementalValidationResult {
  valid: boolean;
  errors: IncrementalValidationError[];
}

export interface BatchInfo {
  start: number;
  end: number;
  current: number;
  reservedAt: number;
}

export interface BatchStatus {
  start: number;
  end: number;
  current: number;
  remaining: number;
  reservedAt: number;
}

export interface SequenceInfo {
  value: number;
  name: string;
  createdAt: number;
  updatedAt?: number;
  resetAt?: number;
}

export interface IncrementalSequenceOptions {
  client: SequenceClient;
  resourceName: string;
  config: IncrementalConfig;
  logger?: Logger;
}

interface Logger {
  debug?: (context: Record<string, unknown>, message: string) => void;
}

interface SequenceClient {
  getObject(key: string): Promise<GetObjectResponse>;
  putObject(params: PutObjectParams): Promise<PutObjectResponse>;
  deleteObject(key: string): Promise<void>;
  listObjects(params: ListObjectsParams): Promise<ListObjectsResponse>;
}

interface GetObjectResponse {
  Body?: {
    transformToString(): Promise<string>;
  };
}

interface PutObjectParams {
  key: string;
  body: string;
  contentType: string;
  ifNoneMatch?: string;
}

interface PutObjectResponse {
  ETag?: string;
}

interface ListObjectsParams {
  prefix: string;
}

interface ListObjectsResponse {
  Contents?: Array<{ Key: string }>;
}

interface SetOptions {
  ttl?: number;
  ifNoneMatch?: string;
}

const INCREMENTAL_DEFAULTS: IncrementalConfig = {
  type: 'incremental',
  start: 1,
  increment: 1,
  mode: 'standard',
  batchSize: 100,
  prefix: '',
  padding: 0
};

const VALIDATION_LIMITS = {
  maxPrefix: 20,
  maxPadding: 20,
  minBatchSize: 1,
  maxBatchSize: 100000,
  maxStartValue: Number.MAX_SAFE_INTEGER,
  minStartValue: Number.MIN_SAFE_INTEGER
};

export class IncrementalConfigError extends Error {
  field: string;
  value: unknown;

  constructor(message: string, field: string, value: unknown) {
    super(message);
    this.name = 'IncrementalConfigError';
    this.field = field;
    this.value = value;
  }
}

export function validateIncrementalConfig(
  config: Partial<IncrementalConfig>,
  options: ValidationOptions = {}
): IncrementalValidationResult {
  const { throwOnError = true } = options;
  const errors: IncrementalValidationError[] = [];

  if (config.start !== undefined) {
    if (typeof config.start !== 'number' || !Number.isFinite(config.start)) {
      errors.push({
        field: 'start',
        message: 'start must be a finite number',
        value: config.start
      });
    } else if (!Number.isInteger(config.start)) {
      errors.push({
        field: 'start',
        message: 'start must be an integer',
        value: config.start
      });
    } else if (config.start > VALIDATION_LIMITS.maxStartValue || config.start < VALIDATION_LIMITS.minStartValue) {
      errors.push({
        field: 'start',
        message: `start must be between ${VALIDATION_LIMITS.minStartValue} and ${VALIDATION_LIMITS.maxStartValue}`,
        value: config.start
      });
    }
  }

  if (config.increment !== undefined) {
    if (typeof config.increment !== 'number' || !Number.isFinite(config.increment)) {
      errors.push({
        field: 'increment',
        message: 'increment must be a finite number',
        value: config.increment
      });
    } else if (!Number.isInteger(config.increment)) {
      errors.push({
        field: 'increment',
        message: 'increment must be an integer',
        value: config.increment
      });
    } else if (config.increment === 0) {
      errors.push({
        field: 'increment',
        message: 'increment cannot be zero',
        value: config.increment
      });
    }
  }

  if (config.mode !== undefined) {
    const validModes: IncrementalMode[] = ['standard', 'fast'];
    if (!validModes.includes(config.mode)) {
      errors.push({
        field: 'mode',
        message: `mode must be one of: ${validModes.join(', ')}`,
        value: config.mode
      });
    }
  }

  if (config.batchSize !== undefined) {
    if (typeof config.batchSize !== 'number' || !Number.isFinite(config.batchSize)) {
      errors.push({
        field: 'batchSize',
        message: 'batchSize must be a finite number',
        value: config.batchSize
      });
    } else if (!Number.isInteger(config.batchSize)) {
      errors.push({
        field: 'batchSize',
        message: 'batchSize must be an integer',
        value: config.batchSize
      });
    } else if (config.batchSize < VALIDATION_LIMITS.minBatchSize || config.batchSize > VALIDATION_LIMITS.maxBatchSize) {
      errors.push({
        field: 'batchSize',
        message: `batchSize must be between ${VALIDATION_LIMITS.minBatchSize} and ${VALIDATION_LIMITS.maxBatchSize}`,
        value: config.batchSize
      });
    }
  }

  if (config.prefix !== undefined) {
    if (typeof config.prefix !== 'string') {
      errors.push({
        field: 'prefix',
        message: 'prefix must be a string',
        value: config.prefix
      });
    } else if (config.prefix.length > VALIDATION_LIMITS.maxPrefix) {
      errors.push({
        field: 'prefix',
        message: `prefix must be at most ${VALIDATION_LIMITS.maxPrefix} characters`,
        value: config.prefix
      });
    } else if (config.prefix && !/^[A-Za-z0-9_-]+$/.test(config.prefix)) {
      errors.push({
        field: 'prefix',
        message: 'prefix must contain only alphanumeric characters, hyphens, and underscores',
        value: config.prefix
      });
    }
  }

  if (config.padding !== undefined) {
    if (typeof config.padding !== 'number' || !Number.isFinite(config.padding)) {
      errors.push({
        field: 'padding',
        message: 'padding must be a finite number',
        value: config.padding
      });
    } else if (!Number.isInteger(config.padding)) {
      errors.push({
        field: 'padding',
        message: 'padding must be an integer',
        value: config.padding
      });
    } else if (config.padding < 0 || config.padding > VALIDATION_LIMITS.maxPadding) {
      errors.push({
        field: 'padding',
        message: `padding must be between 0 and ${VALIDATION_LIMITS.maxPadding}`,
        value: config.padding
      });
    }
  }

  const result: IncrementalValidationResult = {
    valid: errors.length === 0,
    errors
  };

  if (throwOnError && !result.valid && errors.length > 0) {
    const firstError = errors[0]!;
    throw new IncrementalConfigError(
      `Invalid incremental config: ${firstError.message}`,
      firstError.field,
      firstError.value
    );
  }

  return result;
}

function parseIncrementalSuffix(suffix: string, defaults: IncrementalConfig): IncrementalConfig {
  const result: IncrementalConfig = { ...defaults };

  if (suffix === 'fast') {
    result.mode = 'fast';
    return result;
  }

  if (suffix.startsWith('fast:')) {
    result.mode = 'fast';
    suffix = suffix.slice('fast:'.length);
  }

  const numValue = parseInt(suffix, 10);
  if (!isNaN(numValue) && String(numValue) === suffix) {
    result.start = numValue;
    return result;
  }

  const prefixMatch = suffix.match(/^([A-Za-z]+-?)(\d+)$/);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    const prefix = prefixMatch[1];
    const numPart = prefixMatch[2];
    result.prefix = prefix;
    result.start = parseInt(numPart, 10);
    result.padding = numPart.length;
    return result;
  }

  return result;
}

export function parseIncrementalConfig(
  config: string | Partial<IncrementalConfig>,
  options: ParseIncrementalOptions = {}
): IncrementalConfig {
  const { validate = false } = options;
  let parsed: IncrementalConfig;

  if (typeof config === 'object' && config !== null) {
    parsed = {
      ...INCREMENTAL_DEFAULTS,
      ...config,
      type: 'incremental'
    };
  } else if (typeof config === 'string') {
    if (config === 'incremental') {
      parsed = { ...INCREMENTAL_DEFAULTS };
    } else if (config.startsWith('incremental:')) {
      const rest = config.slice('incremental:'.length);
      parsed = parseIncrementalSuffix(rest, INCREMENTAL_DEFAULTS);
    } else {
      parsed = { ...INCREMENTAL_DEFAULTS };
    }
  } else {
    parsed = { ...INCREMENTAL_DEFAULTS };
  }

  if (validate) {
    validateIncrementalConfig(parsed);
  }

  return parsed;
}

export function formatIncrementalValue(
  value: number,
  options: { prefix?: string; padding?: number } = {}
): string {
  const { prefix = '', padding = 0 } = options;
  const numStr = padding > 0
    ? String(value).padStart(padding, '0')
    : String(value);

  return prefix ? `${prefix}${numStr}` : numStr;
}

class SequenceStorage {
  client: SequenceClient;
  resourceName: string;
  private _lock: DistributedLock;

  constructor(client: SequenceClient, resourceName: string) {
    this.client = client;
    this.resourceName = resourceName;

    this._lock = new DistributedLock(this as unknown as StorageAdapter, {
      keyGenerator: (fieldName: string) => this.getLockKey(fieldName)
    });
  }

  getKey(fieldName: string, suffix: string): string {
    return `resource=${this.resourceName}/sequence=${fieldName}/${suffix}`;
  }

  getLockKey(fieldName: string): string {
    return this.getKey(fieldName, 'lock');
  }

  getValueKey(fieldName: string): string {
    return this.getKey(fieldName, 'value');
  }

  async get(key: string): Promise<SequenceInfo | null> {
    const [ok, err, response] = await tryFn<GetObjectResponse>(() => this.client.getObject(key));

    if (!ok || !response) {
      const error = err as { name?: string; code?: string; Code?: string; statusCode?: number };
      if (error?.name === 'NoSuchKey' || error?.code === 'NoSuchKey' ||
          error?.Code === 'NoSuchKey' || error?.statusCode === 404) {
        return null;
      }
      throw err;
    }

    if (response.Body) {
      const bodyContent = await response.Body.transformToString();
      if (bodyContent && bodyContent.trim()) {
        return JSON.parse(bodyContent);
      }
    }

    return null;
  }

  async set(key: string, data: SequenceInfo, options: SetOptions = {}): Promise<PutObjectResponse> {
    const { ttl, ifNoneMatch } = options;

    const dataToSave: SequenceInfo & { _expiresAt?: number } = { ...data };
    if (ttl && typeof ttl === 'number' && ttl > 0) {
      dataToSave._expiresAt = Date.now() + (ttl * 1000);
    }

    const putParams: PutObjectParams = {
      key,
      body: JSON.stringify(dataToSave),
      contentType: 'application/json'
    };

    if (ifNoneMatch !== undefined) {
      putParams.ifNoneMatch = ifNoneMatch;
    }

    const [ok, err, response] = await tryFn<PutObjectResponse>(() => this.client.putObject(putParams));

    if (!ok || !response) throw err ?? new Error('Put object returned no response');
    return response;
  }

  async delete(key: string): Promise<void> {
    await tryFn(() => this.client.deleteObject(key));
  }

  async acquireLock(fieldName: string, options = {}): Promise<LockHandle | null> {
    return this._lock.acquire(fieldName, options);
  }

  async releaseLock(lock: LockHandle): Promise<void> {
    if (!lock) return;
    return this._lock.release(lock);
  }

  async withLock<T>(fieldName: string, options: Record<string, unknown>, callback: (lock: LockHandle) => Promise<T>): Promise<T | null> {
    return this._lock.withLock(fieldName, options, callback);
  }

  async nextSequence(fieldName: string, options: { initialValue?: number; increment?: number; lockTimeout?: number; lockTTL?: number } = {}): Promise<number> {
    const { initialValue = 1, increment = 1, lockTimeout = 5000, lockTTL = 10 } = options;
    const valueKey = this.getValueKey(fieldName);

    const result = await this.withLock(fieldName, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      const data = await this.get(valueKey);

      if (!data) {
        await this.set(valueKey, {
          value: initialValue + increment,
          name: fieldName,
          createdAt: Date.now()
        });
        return initialValue;
      }

      const currentValue = data.value;
      await this.set(valueKey, {
        ...data,
        value: currentValue + increment,
        updatedAt: Date.now()
      });

      return currentValue;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${fieldName}"`);
    }

    return result;
  }

  async getSequence(fieldName: string): Promise<number | null> {
    const valueKey = this.getValueKey(fieldName);
    const data = await this.get(valueKey);
    return data?.value ?? null;
  }

  async resetSequence(fieldName: string, value: number, options: { lockTimeout?: number; lockTTL?: number } = {}): Promise<boolean> {
    const { lockTimeout = 5000, lockTTL = 10 } = options;
    const valueKey = this.getValueKey(fieldName);

    const result = await this.withLock(fieldName, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      const data = await this.get(valueKey);

      await this.set(valueKey, {
        value,
        name: fieldName,
        createdAt: data?.createdAt || Date.now(),
        updatedAt: Date.now(),
        resetAt: Date.now()
      });

      return true;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${fieldName}"`);
    }

    return result;
  }

  async listSequences(): Promise<SequenceInfo[]> {
    const prefix = `resource=${this.resourceName}/sequence=`;
    const [ok, err, result] = await tryFn<ListObjectsResponse>(() =>
      this.client.listObjects({ prefix })
    );

    if (!ok || !result) return [];

    const keys = (result.Contents ?? []).map(item => item.Key);
    const valueKeys = keys.filter((k): k is string => typeof k === 'string' && k.endsWith('/value'));

    const sequences: SequenceInfo[] = [];
    for (const key of valueKeys) {
      const data = await this.get(key);
      if (data) {
        sequences.push(data);
      }
    }

    return sequences;
  }
}

export class IncrementalSequence {
  client: SequenceClient;
  resourceName: string;
  config: IncrementalConfig;
  logger: Logger;
  storage: SequenceStorage;
  localBatches: Map<string, BatchInfo>;

  constructor(options: IncrementalSequenceOptions) {
    this.client = options.client;
    this.resourceName = options.resourceName;
    this.config = options.config;
    this.logger = options.logger || console;

    this.storage = new SequenceStorage(options.client, options.resourceName);
    this.localBatches = new Map();
  }

  async nextValue(fieldName: string = 'id'): Promise<string> {
    const { start, increment, prefix, padding } = this.config;

    const value = await this.storage.nextSequence(fieldName, {
      initialValue: start,
      increment
    });

    return formatIncrementalValue(value, { prefix, padding });
  }

  async nextValueFast(fieldName: string = 'id'): Promise<string> {
    const batchKey = fieldName;
    let batch = this.localBatches.get(batchKey);

    if (!batch || batch.current >= batch.end) {
      batch = await this.reserveBatch(fieldName);
      this.localBatches.set(batchKey, batch);
    }

    const value = batch.current++;
    const { prefix, padding } = this.config;

    return formatIncrementalValue(value, { prefix, padding });
  }

  async reserveBatch(fieldName: string = 'id', count?: number): Promise<BatchInfo> {
    const batchSize = count || this.config.batchSize;
    const { start: initialValue } = this.config;

    const batchStart = await this.storage.nextSequence(fieldName, {
      initialValue,
      increment: batchSize
    });

    const batch: BatchInfo = {
      start: batchStart,
      end: batchStart + batchSize,
      current: batchStart,
      reservedAt: Date.now()
    };

    return batch;
  }

  async next(fieldName: string = 'id'): Promise<string> {
    if (this.config.mode === 'fast') {
      return this.nextValueFast(fieldName);
    }
    return this.nextValue(fieldName);
  }

  async getValue(fieldName: string = 'id'): Promise<number | null> {
    return this.storage.getSequence(fieldName);
  }

  async reset(fieldName: string, value: number): Promise<boolean> {
    this.localBatches.delete(fieldName);
    return this.storage.resetSequence(fieldName, value);
  }

  async list(): Promise<SequenceInfo[]> {
    return this.storage.listSequences();
  }

  getBatchStatus(fieldName: string = 'id'): BatchStatus | null {
    const batch = this.localBatches.get(fieldName);
    if (!batch) return null;

    return {
      start: batch.start,
      end: batch.end,
      current: batch.current,
      remaining: batch.end - batch.current,
      reservedAt: batch.reservedAt
    };
  }

  releaseBatch(fieldName: string = 'id'): void {
    const batch = this.localBatches.get(fieldName);
    if (batch) {
      const unused = batch.end - batch.current;
      this.logger.debug?.({ fieldName, unused }, 'Releasing batch with unused IDs');
      this.localBatches.delete(fieldName);
    }
  }
}

export interface CreateIncrementalIdGeneratorOptions {
  client: SequenceClient;
  resourceName: string;
  config: string | Partial<IncrementalConfig>;
  logger?: Logger;
}

export interface IncrementalIdGenerator {
  (): Promise<string>;
  _sequence: IncrementalSequence;
  _config: IncrementalConfig;
}

export function createIncrementalIdGenerator(options: CreateIncrementalIdGeneratorOptions): IncrementalIdGenerator {
  const parsedConfig = parseIncrementalConfig(options.config);
  const sequence = new IncrementalSequence({
    client: options.client,
    resourceName: options.resourceName,
    config: parsedConfig,
    logger: options.logger
  });

  const generator = async () => {
    return sequence.next('id');
  };

  (generator as IncrementalIdGenerator)._sequence = sequence;
  (generator as IncrementalIdGenerator)._config = parsedConfig;

  return generator as IncrementalIdGenerator;
}

export default {
  parseIncrementalConfig,
  validateIncrementalConfig,
  formatIncrementalValue,
  IncrementalSequence,
  IncrementalConfigError,
  createIncrementalIdGenerator
};
