import { tryFn } from './try-fn.js';
import { DistributedLock } from './distributed-lock.js';
const SEQUENCE_DEFAULTS = {
    initialValue: 1,
    increment: 1,
    lockTimeout: 5000,
    lockTTL: 10
};
export class DistributedSequence {
    storage;
    valueKeyGenerator;
    lockKeyGenerator;
    defaults;
    lock;
    constructor(storage, options = {}) {
        if (!storage) {
            throw new Error('DistributedSequence requires a storage adapter');
        }
        this.storage = storage;
        this.valueKeyGenerator = options.valueKeyGenerator || ((name) => `sequences/${name}/value`);
        this.lockKeyGenerator = options.lockKeyGenerator || ((name) => `sequences/${name}/lock`);
        this.defaults = { ...SEQUENCE_DEFAULTS, ...options.defaults };
        this.lock = new DistributedLock(storage, {
            keyGenerator: this.lockKeyGenerator,
            defaults: {
                ttl: this.defaults.lockTTL,
                timeout: this.defaults.lockTimeout
            }
        });
    }
    async next(name, options = {}) {
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
    async get(name) {
        const valueKey = this.valueKeyGenerator(name);
        const data = await this.storage.get(valueKey);
        return data?.value ?? null;
    }
    async getData(name) {
        const valueKey = this.valueKeyGenerator(name);
        return this.storage.get(valueKey);
    }
    async reset(name, value, options = {}) {
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
    async set(name, value, options = {}) {
        return this.reset(name, value, options);
    }
    async delete(name) {
        const valueKey = this.valueKeyGenerator(name);
        const lockKey = this.lockKeyGenerator(name);
        await this.storage.delete(valueKey);
        await tryFn(() => this.storage.delete(lockKey));
    }
    async exists(name) {
        const value = await this.get(name);
        return value !== null;
    }
    async increment(name, options = {}) {
        const opts = { ...this.defaults, ...options };
        const { increment } = opts;
        const preValue = await this.next(name, options);
        return preValue + increment;
    }
}
export function createSequence(storage, options = {}) {
    const { prefix = '', resourceName, pluginSlug } = options;
    let valueKeyGenerator;
    let lockKeyGenerator;
    if (resourceName && pluginSlug) {
        valueKeyGenerator = (name) => `resource=${resourceName}/plugin=${pluginSlug}/sequence=${name}/value`;
        lockKeyGenerator = (name) => `resource=${resourceName}/plugin=${pluginSlug}/sequence=${name}/lock`;
    }
    else if (resourceName) {
        valueKeyGenerator = (name) => `resource=${resourceName}/sequence=${name}/value`;
        lockKeyGenerator = (name) => `resource=${resourceName}/sequence=${name}/lock`;
    }
    else if (pluginSlug) {
        valueKeyGenerator = (name) => `plugin=${pluginSlug}/sequence=${name}/value`;
        lockKeyGenerator = (name) => `plugin=${pluginSlug}/sequence=${name}/lock`;
    }
    else if (prefix) {
        valueKeyGenerator = (name) => `${prefix}sequence=${name}/value`;
        lockKeyGenerator = (name) => `${prefix}sequence=${name}/lock`;
    }
    return new DistributedSequence(storage, {
        ...options,
        valueKeyGenerator,
        lockKeyGenerator
    });
}
export default DistributedSequence;
//# sourceMappingURL=distributed-sequence.js.map