import { tryFn } from './try-fn.js';
import { DistributedLock, StorageAdapter, LockHandle } from './distributed-lock.js';

export interface SequenceDefaults {
  initialValue?: number;
  increment?: number;
  lockTimeout?: number;
  lockTTL?: number;
}

export interface SequenceData {
  value: number;
  name: string;
  createdAt: number;
  updatedAt?: number;
  resetAt?: number;
  [key: string]: unknown;
}

export interface SequenceStorageAdapter {
  get(key: string): Promise<SequenceData | null>;
  set(key: string, data: SequenceData, options?: { behavior?: string }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DistributedSequenceOptions {
  valueKeyGenerator?: (name: string) => string;
  lockKeyGenerator?: (name: string) => string;
  defaults?: SequenceDefaults;
}

export interface NextOptions extends SequenceDefaults {
  metadata?: Record<string, unknown>;
}

export interface ResetOptions {
  lockTimeout?: number;
  lockTTL?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateSequenceOptions {
  prefix?: string;
  resourceName?: string;
  pluginSlug?: string;
  valueKeyGenerator?: (name: string) => string;
  lockKeyGenerator?: (name: string) => string;
  defaults?: SequenceDefaults;
}

const SEQUENCE_DEFAULTS: Required<SequenceDefaults> = {
  initialValue: 1,
  increment: 1,
  lockTimeout: 5000,
  lockTTL: 10
};

export class DistributedSequence {
  storage: SequenceStorageAdapter;
  valueKeyGenerator: (name: string) => string;
  lockKeyGenerator: (name: string) => string;
  defaults: Required<SequenceDefaults>;
  lock: DistributedLock;

  constructor(storage: SequenceStorageAdapter, options: DistributedSequenceOptions = {}) {
    if (!storage) {
      throw new Error('DistributedSequence requires a storage adapter');
    }

    this.storage = storage;
    this.valueKeyGenerator = options.valueKeyGenerator || ((name: string) => `sequences/${name}/value`);
    this.lockKeyGenerator = options.lockKeyGenerator || ((name: string) => `sequences/${name}/lock`);
    this.defaults = { ...SEQUENCE_DEFAULTS, ...options.defaults };

    this.lock = new DistributedLock(storage as unknown as StorageAdapter, {
      keyGenerator: this.lockKeyGenerator,
      defaults: {
        ttl: this.defaults.lockTTL,
        timeout: this.defaults.lockTimeout
      }
    });
  }

  async next(name: string, options: NextOptions = {}): Promise<number> {
    const opts = { ...this.defaults, ...options };
    const { initialValue, increment, lockTimeout, lockTTL, metadata } = opts;
    const valueKey = this.valueKeyGenerator(name);

    const result = await this.lock.withLock(name, {
      timeout: lockTimeout,
      ttl: lockTTL
    }, async () => {
      const data = await this.storage.get(valueKey);

      if (!data) {
        await this.storage.set(valueKey, {
          value: initialValue + increment,
          name,
          createdAt: Date.now(),
          ...metadata
        }, { behavior: 'body-only' });
        return initialValue;
      }

      const currentValue = data.value;
      await this.storage.set(valueKey, {
        ...data,
        value: currentValue + increment,
        updatedAt: Date.now()
      }, { behavior: 'body-only' });

      return currentValue;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${name}"`);
    }

    return result;
  }

  async get(name: string): Promise<number | null> {
    const valueKey = this.valueKeyGenerator(name);
    const data = await this.storage.get(valueKey);
    return data?.value ?? null;
  }

  async getData(name: string): Promise<SequenceData | null> {
    const valueKey = this.valueKeyGenerator(name);
    return this.storage.get(valueKey);
  }

  async reset(name: string, value: number, options: ResetOptions = {}): Promise<boolean> {
    const opts = { ...this.defaults, ...options };
    const { lockTimeout, lockTTL, metadata } = opts;
    const valueKey = this.valueKeyGenerator(name);

    const result = await this.lock.withLock(name, {
      timeout: lockTimeout,
      ttl: lockTTL
    }, async () => {
      const data = await this.storage.get(valueKey);

      await this.storage.set(valueKey, {
        value,
        name,
        createdAt: data?.createdAt || Date.now(),
        updatedAt: Date.now(),
        resetAt: Date.now(),
        ...metadata
      }, { behavior: 'body-only' });

      return true;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${name}"`);
    }

    return result;
  }

  async set(name: string, value: number, options: ResetOptions = {}): Promise<boolean> {
    return this.reset(name, value, options);
  }

  async delete(name: string): Promise<void> {
    const valueKey = this.valueKeyGenerator(name);
    const lockKey = this.lockKeyGenerator(name);
    await this.storage.delete(valueKey);
    await tryFn(() => this.storage.delete(lockKey));
  }

  async exists(name: string): Promise<boolean> {
    const value = await this.get(name);
    return value !== null;
  }

  async increment(name: string, options: NextOptions = {}): Promise<number> {
    const opts = { ...this.defaults, ...options };
    const { increment } = opts;
    const preValue = await this.next(name, options);
    return preValue + increment;
  }
}

export function createSequence(
  storage: SequenceStorageAdapter,
  options: CreateSequenceOptions = {}
): DistributedSequence {
  const { prefix = '', resourceName, pluginSlug } = options;

  let valueKeyGenerator: ((name: string) => string) | undefined;
  let lockKeyGenerator: ((name: string) => string) | undefined;

  if (resourceName && pluginSlug) {
    valueKeyGenerator = (name: string) =>
      `resource=${resourceName}/plugin=${pluginSlug}/sequence=${name}/value`;
    lockKeyGenerator = (name: string) =>
      `resource=${resourceName}/plugin=${pluginSlug}/sequence=${name}/lock`;
  } else if (resourceName) {
    valueKeyGenerator = (name: string) => `resource=${resourceName}/sequence=${name}/value`;
    lockKeyGenerator = (name: string) => `resource=${resourceName}/sequence=${name}/lock`;
  } else if (pluginSlug) {
    valueKeyGenerator = (name: string) => `plugin=${pluginSlug}/sequence=${name}/value`;
    lockKeyGenerator = (name: string) => `plugin=${pluginSlug}/sequence=${name}/lock`;
  } else if (prefix) {
    valueKeyGenerator = (name: string) => `${prefix}sequence=${name}/value`;
    lockKeyGenerator = (name: string) => `${prefix}sequence=${name}/lock`;
  }

  return new DistributedSequence(storage, {
    ...options,
    valueKeyGenerator,
    lockKeyGenerator
  });
}

export default DistributedSequence;
