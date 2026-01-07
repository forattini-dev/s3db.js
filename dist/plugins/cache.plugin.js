import { join } from 'path';
import jsonStableStringify from 'json-stable-stringify';
import crypto from 'crypto';
import { Plugin } from './plugin.class.js';
import S3Cache from './cache/s3-cache.class.js';
import MemoryCache from './cache/memory-cache.class.js';
import RedisCache from './cache/redis-cache.class.js';
import { FilesystemCache } from './cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from './cache/partition-aware-filesystem-cache.class.js';
import MultiTierCache from './cache/multi-tier-cache.class.js';
import { resolveCacheMemoryLimit } from './cache/utils/memory-limits.js';
export { resolveCacheMemoryLimit };
import tryFn from '../concerns/try-fn.js';
import { CacheError } from './cache.errors.js';
import { createLogger } from '../concerns/logger.js';
export class CachePlugin extends Plugin {
    config;
    driver = null;
    stats;
    constructor(options = {}) {
        super(options);
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = (this.logLevel || 'info');
            this.logger = createLogger({ name: 'CachePlugin', level: logLevel });
        }
        const cacheOptions = this.options;
        const { driver = 's3', drivers, promoteOnHit = true, strategy = 'write-through', fallbackOnError = true, ttl, maxSize, maxMemoryBytes, maxMemoryPercent, config = {}, include = null, exclude = [], includePartitions = true, partitionStrategy = 'hierarchical', partitionAware = true, trackUsage = true, preloadRelated = true, retryAttempts = 3, retryDelay = 100 } = cacheOptions;
        const isMultiTier = Array.isArray(drivers) && drivers.length > 0;
        this.config = {
            driver,
            drivers,
            isMultiTier,
            promoteOnHit,
            strategy,
            fallbackOnError,
            config: {
                ttl,
                maxSize,
                maxMemoryBytes,
                maxMemoryPercent,
                ...config
            },
            include,
            exclude,
            includePartitions,
            partitionStrategy,
            partitionAware,
            trackUsage,
            preloadRelated,
            retryAttempts,
            retryDelay,
            logLevel: this.logLevel
        };
        this.stats = {
            hits: 0,
            misses: 0,
            writes: 0,
            deletes: 0,
            errors: 0,
            startTime: Date.now()
        };
    }
    async onInstall() {
        if (this.config.isMultiTier) {
            this.driver = await this._createMultiTierDriver();
        }
        else if (this.config.driver && typeof this.config.driver === 'object') {
            this.driver = this.config.driver;
        }
        else {
            if (this.config.driver === 'memory' || this.config.driver === MemoryCache || this.config.driver?.name === 'MemoryCache') {
                const resolvedLimit = resolveCacheMemoryLimit({
                    maxMemoryBytes: this.config.config?.maxMemoryBytes,
                    maxMemoryPercent: this.config.config?.maxMemoryPercent,
                });
                if (!this.config.config) {
                    this.config.config = {};
                }
                this.config.config.maxMemoryBytes = resolvedLimit.maxMemoryBytes;
                if (typeof this.config.config.maxMemoryPercent !== 'undefined') {
                    delete this.config.config.maxMemoryPercent;
                }
                this.config.config.inferredMaxMemoryPercent = resolvedLimit.inferredPercent;
                const source = resolvedLimit.derivedFromPercent ? 'percent/cgroup' : 'explicit';
                this.logger.warn({
                    maxMemoryMB: Math.round(resolvedLimit.maxMemoryBytes / (1024 * 1024)),
                    source,
                    heapLimitMB: Math.round(resolvedLimit.heapLimit / (1024 * 1024))
                }, `Memory driver capped at ${Math.round(resolvedLimit.maxMemoryBytes / (1024 * 1024))} MB (source: ${source}, heapLimit=${Math.round(resolvedLimit.heapLimit / (1024 * 1024))} MB)`);
            }
            this.driver = await this._createSingleDriver(this.config.driver, this.config.config);
        }
        if (this.driver && typeof this.driver.on === 'function') {
            this.driver.on('memory:pressure', (payload) => {
                this.emit('cache:memoryPressure', {
                    driver: 'memory',
                    ...payload
                });
                const typedPayload = payload;
                const reason = typedPayload?.reason || 'unknown';
                this.logger.warn({
                    reason,
                    currentMB: Math.round((typedPayload?.currentBytes || 0) / (1024 * 1024))
                }, `Memory pressure detected (reason: ${reason}) current=${Math.round((typedPayload?.currentBytes || 0) / (1024 * 1024))}MB`);
            });
            this.driver.on('memory:evict', (payload) => {
                this.emit('cache:memoryEvict', {
                    driver: 'memory',
                    ...payload
                });
            });
        }
        this.installDatabaseHooks();
        this.installResourceHooks();
    }
    installDatabaseHooks() {
        this.database.addHook('afterCreateResource', async (context) => {
            const resource = context.resource;
            if (this.shouldCacheResource(resource.name)) {
                this.installResourceHooksForResource(resource);
            }
        });
    }
    createResourceCacheNamespace(resource, driver, computeCacheKey, instanceKey) {
        const plugin = this;
        const keyFor = async (action, { params = {}, partition, partitionValues } = {}) => {
            return computeCacheKey({ action, params, partition, partitionValues });
        };
        const shouldStore = (value) => value !== undefined && value !== null;
        const namespaceTarget = {
            driver,
            instanceKey,
            driverName: driver?.constructor?.name || 'CacheDriver',
            async keyFor(action, options = {}) {
                return keyFor(action, options);
            },
            async resolve(action, options = {}) {
                return keyFor(action, options);
            },
            getDriver() {
                return driver;
            },
            async warm(options = {}) {
                return plugin.warmCache(resource.name, options);
            },
            async warmItem(id, control = {}) {
                if (!id) {
                    throw new CacheError('warmItem requires an id', {
                        resource: resource.name,
                        driver: driver?.constructor?.name
                    });
                }
                const { forceRefresh = false, returnData = false } = control;
                let result;
                if (forceRefresh) {
                    result = await resource.get(id, { skipCache: true });
                    if (shouldStore(result)) {
                        const key = await keyFor('get', { params: { id } });
                        await driver.set(key, result);
                    }
                }
                else {
                    result = await resource.get(id);
                }
                return returnData ? result : undefined;
            },
            async warmMany(ids = [], control = {}) {
                if (!Array.isArray(ids) || ids.length === 0) {
                    throw new CacheError('warmMany requires a non-empty array of ids', {
                        resource: resource.name,
                        driver: driver?.constructor?.name
                    });
                }
                const { forceRefresh = false, returnData = false } = control;
                const options = forceRefresh ? { skipCache: true } : {};
                const result = await resource.getMany(ids, options);
                if (forceRefresh && shouldStore(result)) {
                    const key = await keyFor('getMany', { params: { ids } });
                    await driver.set(key, result);
                }
                return returnData ? result : undefined;
            },
            async warmList(listOptions = {}, control = {}) {
                const { forceRefresh = false, returnData = false } = control;
                const options = { ...(listOptions || {}) };
                if (forceRefresh) {
                    options.skipCache = true;
                }
                const result = await resource.list(options);
                if (forceRefresh && shouldStore(result)) {
                    const { partition, partitionValues } = options;
                    const key = await keyFor('list', { partition: partition, partitionValues: partitionValues });
                    await driver.set(key, result);
                }
                return returnData ? result : undefined;
            },
            async warmPage(pageOptions = {}, control = {}) {
                const { forceRefresh = false, returnData = false } = control;
                const { offset = 0, size = 100, partition, partitionValues, ...rest } = pageOptions || {};
                const options = { offset, size, partition, partitionValues, ...rest };
                if (forceRefresh) {
                    options.skipCache = true;
                }
                const result = await resource.page(options);
                if (forceRefresh && shouldStore(result)) {
                    const key = await keyFor('page', {
                        params: { offset, size },
                        partition: partition,
                        partitionValues: partitionValues
                    });
                    await driver.set(key, result);
                }
                return returnData ? result : undefined;
            },
            async warmQuery(filter = {}, queryOptions = {}, control = {}) {
                const { forceRefresh = false, returnData = false } = control;
                const options = { ...(queryOptions || {}) };
                if (forceRefresh) {
                    options.skipCache = true;
                }
                const result = await resource.query(filter, options);
                if (forceRefresh && shouldStore(result)) {
                    const key = await keyFor('query', {
                        params: {
                            filter,
                            options: {
                                limit: options.limit,
                                offset: options.offset
                            }
                        },
                        partition: options.partition,
                        partitionValues: options.partitionValues
                    });
                    await driver.set(key, result);
                }
                return returnData ? result : undefined;
            },
            async warmCount(countOptions = {}, control = {}) {
                const { forceRefresh = false, returnData = false } = control;
                const options = { ...(countOptions || {}) };
                if (forceRefresh) {
                    options.skipCache = true;
                }
                const result = await resource.count(options);
                if (forceRefresh && shouldStore(result)) {
                    const { partition, partitionValues } = options;
                    const key = await keyFor('count', { partition: partition, partitionValues: partitionValues });
                    await driver.set(key, result);
                }
                return returnData ? result : undefined;
            },
            async warmPartition(partitions = [], options = {}) {
                if (typeof resource.warmPartitionCache !== 'function') {
                    throw new CacheError('Partition warming is only supported with partition-aware cache drivers', {
                        resource: resource.name,
                        driver: driver?.constructor?.name
                    });
                }
                return resource.warmPartitionCache(partitions, options);
            },
            async invalidate(scope) {
                await plugin.clearCacheForResource(resource, scope);
            },
            async clearAll() {
                const keyPrefix = `resource=${resource.name}`;
                await driver.clear(keyPrefix);
            },
            stats() {
                if (typeof driver.stats === 'function') {
                    return driver.stats();
                }
                if (typeof driver.getStats === 'function') {
                    return driver.getStats();
                }
                return { ...plugin.stats };
            }
        };
        return new Proxy(namespaceTarget, {
            get(target, prop, receiver) {
                if (prop in target) {
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
                const value = driver[prop];
                if (typeof value === 'function') {
                    return value.bind(driver);
                }
                return value;
            },
            set(target, prop, value) {
                if (prop in target) {
                    target[prop] = value;
                    return true;
                }
                driver[prop] = value;
                return true;
            },
            has(target, prop) {
                return prop in target || prop in driver;
            },
            ownKeys(target) {
                const targetKeys = Reflect.ownKeys(target);
                const driverKeys = Reflect.ownKeys(driver);
                return Array.from(new Set([...targetKeys, ...driverKeys]));
            },
            getOwnPropertyDescriptor(target, prop) {
                if (Reflect.has(target, prop)) {
                    return Object.getOwnPropertyDescriptor(target, prop);
                }
                const descriptor = Object.getOwnPropertyDescriptor(driver, prop);
                if (descriptor) {
                    descriptor.configurable = true;
                }
                return descriptor;
            }
        });
    }
    async onStart() {
        // Plugin is ready
    }
    async _createSingleDriver(driverName, config) {
        if (driverName === 'memory') {
            return new MemoryCache(config);
        }
        else if (driverName === 'redis') {
            return new RedisCache(config);
        }
        else if (driverName === 'filesystem') {
            if (this.config.partitionAware) {
                return new PartitionAwareFilesystemCache({
                    directory: config.directory || '/tmp/s3db-cache',
                    partitionStrategy: this.config.partitionStrategy,
                    trackUsage: this.config.trackUsage,
                    preloadRelated: this.config.preloadRelated,
                    ...config
                });
            }
            else {
                return new FilesystemCache(config);
            }
        }
        else {
            return new S3Cache({
                client: this.database.client,
                ...config
            });
        }
    }
    async _createMultiTierDriver() {
        const driverInstances = [];
        for (const driverConfig of this.config.drivers || []) {
            const driverInstance = await this._createSingleDriver(driverConfig.driver, driverConfig.config || {});
            driverInstances.push({
                driver: driverInstance,
                name: driverConfig.name || `L${driverInstances.length + 1}-${driverConfig.driver}`
            });
        }
        return new MultiTierCache({
            drivers: driverInstances,
            promoteOnHit: this.config.promoteOnHit,
            strategy: this.config.strategy,
            fallbackOnError: this.config.fallbackOnError,
            logLevel: this.logLevel
        });
    }
    installResourceHooks() {
        for (const resource of Object.values(this.database.resources)) {
            if (!this.shouldCacheResource(resource.name)) {
                continue;
            }
            this.installResourceHooksForResource(resource);
        }
    }
    shouldCacheResource(resourceName) {
        const resource = this.database.resources[resourceName];
        if (resource?.$schema?.createdBy && resource.$schema.createdBy !== 'user' && !this.config.include) {
            return false;
        }
        if (resourceName.startsWith('plg_') && !this.config.include) {
            return false;
        }
        if (this.config.exclude.includes(resourceName)) {
            return false;
        }
        if (this.config.include && !this.config.include.includes(resourceName)) {
            return false;
        }
        return true;
    }
    installResourceHooksForResource(resource) {
        if (!this.driver)
            return;
        const driver = this.driver;
        const instanceKey = this.instanceName || this.slug || 'default';
        resource.cacheInstances = resource.cacheInstances || {};
        resource.cacheInstances[instanceKey] = driver;
        const computeCacheKey = async (options = {}) => {
            const { action, params = {}, partition, partitionValues } = options;
            return this.generateCacheKey(resource, action || '', params, partition || null, partitionValues || null);
        };
        const cacheNamespace = this.createResourceCacheNamespace(resource, driver, computeCacheKey, instanceKey);
        resource.cacheNamespaces = resource.cacheNamespaces || {};
        resource.cacheNamespaces[instanceKey] = cacheNamespace;
        if (!Object.prototype.hasOwnProperty.call(resource, 'cache')) {
            Object.defineProperty(resource, 'cache', {
                value: cacheNamespace,
                writable: true,
                configurable: true,
                enumerable: false
            });
        }
        if (typeof resource.getCacheDriver !== 'function') {
            Object.defineProperty(resource, 'getCacheDriver', {
                value: (name = null) => {
                    if (!name) {
                        const defaultNamespace = resource.cache;
                        return defaultNamespace?.driver || resource.cacheInstances?.[instanceKey] || null;
                    }
                    return resource.cacheInstances?.[name] || null;
                },
                writable: true,
                configurable: true,
                enumerable: false
            });
        }
        if (typeof resource.getCacheNamespace !== 'function') {
            Object.defineProperty(resource, 'getCacheNamespace', {
                value: (name = null) => {
                    if (!name) {
                        return resource.cache || null;
                    }
                    return resource.cacheNamespaces?.[name] || null;
                },
                writable: true,
                configurable: true,
                enumerable: false
            });
        }
        resource.cacheKeyResolvers = resource.cacheKeyResolvers || {};
        resource.cacheKeyResolvers[instanceKey] = computeCacheKey;
        if (!resource.cacheKeyFor) {
            resource.cacheKeyFor = computeCacheKey;
        }
        if (typeof resource.getCacheKeyResolver !== 'function') {
            Object.defineProperty(resource, 'getCacheKeyResolver', {
                value: (name = null) => {
                    if (!name)
                        return resource.cacheKeyFor || null;
                    return resource.cacheKeyResolvers?.[name] || null;
                },
                writable: true,
                configurable: true,
                enumerable: false
            });
        }
        if (this.driver instanceof PartitionAwareFilesystemCache) {
            const partitionDriver = this.driver;
            resource.clearPartitionCache = async (partition, partitionValues = {}) => {
                await partitionDriver.clearPartition(resource.name, partition, partitionValues);
            };
            resource.getPartitionCacheStats = async (partition = null) => {
                return await partitionDriver.getPartitionStats(resource.name, partition);
            };
            resource.getCacheRecommendations = async () => {
                return await partitionDriver.getCacheRecommendations(resource.name);
            };
            resource.warmPartitionCache = async (partitions = [], options = {}) => {
                return await partitionDriver.warmPartitionCache(resource.name, { partitions, ...options });
            };
        }
        const cacheMethods = [
            'count', 'listIds', 'getMany', 'getAll', 'page', 'list', 'get',
            'exists', 'content', 'hasContent', 'query', 'getFromPartition'
        ];
        for (const method of cacheMethods) {
            resource.useMiddleware(method, async (ctx, next) => {
                const resolveCacheKey = resource.cacheKeyResolvers?.[instanceKey] || computeCacheKey;
                let skipCache = false;
                const lastArg = ctx.args[ctx.args.length - 1];
                if (lastArg && typeof lastArg === 'object' && lastArg.skipCache === true) {
                    skipCache = true;
                }
                if (skipCache) {
                    return await next();
                }
                let key;
                if (method === 'getMany') {
                    key = await resolveCacheKey({ action: method, params: { ids: ctx.args[0] } });
                }
                else if (method === 'page') {
                    const options = (ctx.args[0] || {});
                    const { offset, size, partition, partitionValues } = options;
                    key = await resolveCacheKey({ action: method, params: { offset, size }, partition: partition, partitionValues: partitionValues });
                }
                else if (method === 'list' || method === 'listIds' || method === 'count') {
                    const options = (ctx.args[0] || {});
                    const { partition, partitionValues } = options;
                    key = await resolveCacheKey({ action: method, partition: partition, partitionValues: partitionValues });
                }
                else if (method === 'query') {
                    const filter = (ctx.args[0] || {});
                    const options = (ctx.args[1] || {});
                    key = await resolveCacheKey({
                        action: method,
                        params: { filter, options: { limit: options.limit, offset: options.offset } },
                        partition: options.partition,
                        partitionValues: options.partitionValues
                    });
                }
                else if (method === 'getFromPartition') {
                    const options = (ctx.args[0] || {});
                    const { id, partitionName, partitionValues } = options;
                    key = await resolveCacheKey({
                        action: method,
                        params: { id, partitionName },
                        partition: partitionName,
                        partitionValues: partitionValues
                    });
                }
                else if (method === 'getAll') {
                    key = await resolveCacheKey({ action: method });
                }
                else if (['get', 'exists', 'content', 'hasContent'].includes(method)) {
                    key = await resolveCacheKey({ action: method, params: { id: ctx.args[0] } });
                }
                else {
                    key = await resolveCacheKey({ action: method });
                }
                if (this.driver instanceof PartitionAwareFilesystemCache) {
                    let partition;
                    let partitionValues;
                    if (method === 'list' || method === 'listIds' || method === 'count' || method === 'page') {
                        const args = (ctx.args[0] || {});
                        partition = args.partition;
                        partitionValues = args.partitionValues;
                    }
                    else if (method === 'query') {
                        const options = (ctx.args[1] || {});
                        partition = options.partition;
                        partitionValues = options.partitionValues;
                    }
                    else if (method === 'getFromPartition') {
                        const options = (ctx.args[0] || {});
                        partition = options.partitionName;
                        partitionValues = options.partitionValues;
                    }
                    const [ok, err, result] = await tryFn(() => driver._get(key, {
                        resource: resource.name,
                        action: method,
                        partition,
                        partitionValues
                    }));
                    if (ok && result !== null && result !== undefined) {
                        this.stats.hits++;
                        return result;
                    }
                    if (!ok && err.name !== 'NoSuchKey') {
                        this.stats.errors++;
                        throw err;
                    }
                    this.stats.misses++;
                    const freshResult = await next();
                    this.stats.writes++;
                    await driver._set(key, freshResult, {
                        resource: resource.name,
                        action: method,
                        partition,
                        partitionValues
                    });
                    return freshResult;
                }
                else {
                    const [ok, err, result] = await tryFn(() => driver.get(key));
                    if (ok && result !== null && result !== undefined) {
                        this.stats.hits++;
                        return result;
                    }
                    if (!ok && err.name !== 'NoSuchKey') {
                        this.stats.errors++;
                        throw err;
                    }
                    this.stats.misses++;
                    const freshResult = await next();
                    this.stats.writes++;
                    await driver.set(key, freshResult);
                    return freshResult;
                }
            });
        }
        const writeMethods = ['insert', 'update', 'delete', 'deleteMany', 'setContent', 'deleteContent', 'replace'];
        for (const method of writeMethods) {
            resource.useMiddleware(method, async (ctx, next) => {
                const result = await next();
                if (method === 'insert') {
                    await this.clearCacheForResource(resource, ctx.args[0]);
                }
                else if (method === 'update') {
                    await this.clearCacheForResource(resource, { id: ctx.args[0], ...ctx.args[1] });
                }
                else if (method === 'delete') {
                    let data = { id: ctx.args[0] };
                    if (typeof resource.get === 'function') {
                        const [ok, , full] = await tryFn(() => resource.get(ctx.args[0]));
                        if (ok && full)
                            data = full;
                    }
                    await this.clearCacheForResource(resource, data);
                }
                else if (method === 'setContent' || method === 'deleteContent') {
                    const id = (ctx.args[0]?.id || ctx.args[0]);
                    await this.clearCacheForResource(resource, { id });
                }
                else if (method === 'replace') {
                    const id = ctx.args[0];
                    await this.clearCacheForResource(resource, { id, ...ctx.args[1] });
                }
                else if (method === 'deleteMany') {
                    await this.clearCacheForResource(resource);
                }
                return result;
            });
        }
    }
    async clearCacheForResource(resource, data) {
        const driver = this._getDriverForResource(resource);
        if (!driver)
            return;
        const keyPrefix = `resource=${resource.name}`;
        if (data && data.id) {
            const itemSpecificMethods = ['get', 'exists', 'content', 'hasContent'];
            for (const method of itemSpecificMethods) {
                const specificKey = await this.generateCacheKey(resource, method, { id: data.id });
                const [ok, err] = await this.clearCacheWithRetry(driver, specificKey);
                if (!ok) {
                    this.emit('plg:cache:clear-error', {
                        resource: resource.name,
                        method,
                        id: data.id,
                        error: err.message
                    });
                    this.logger.warn({ resourceName: resource.name, method, id: data.id, error: err.message }, `Failed to clear ${method} cache for ${resource.name}:${data.id}: ${err.message}`);
                }
            }
            if (this.config.includePartitions === true && resource.$schema.partitions && Object.keys(resource.$schema.partitions).length > 0) {
                const partitionValues = this.getPartitionValues(data, resource);
                for (const [partitionName, values] of Object.entries(partitionValues)) {
                    if (values && Object.keys(values).length > 0 && Object.values(values).some(v => v !== null && v !== undefined)) {
                        const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
                        const [ok, err] = await this.clearCacheWithRetry(driver, partitionKeyPrefix);
                        if (!ok) {
                            this.emit('plg:cache:clear-error', {
                                resource: resource.name,
                                partition: partitionName,
                                error: err.message
                            });
                            this.logger.warn({ resourceName: resource.name, partitionName, error: err.message }, `Failed to clear partition cache for ${resource.name}/${partitionName}: ${err.message}`);
                        }
                    }
                }
            }
        }
        const [ok, err] = await this.clearCacheWithRetry(driver, keyPrefix);
        if (!ok) {
            this.emit('plg:cache:clear-error', {
                resource: resource.name,
                type: 'broad',
                error: err.message
            });
            this.logger.warn({ resourceName: resource.name, error: err.message }, `Failed to clear broad cache for ${resource.name}, trying specific methods: ${err.message}`);
            const aggregateMethods = ['count', 'list', 'listIds', 'getAll', 'page', 'query'];
            for (const method of aggregateMethods) {
                await this.clearCacheWithRetry(driver, `${keyPrefix}/action=${method}`);
                await this.clearCacheWithRetry(driver, `resource=${resource.name}/action=${method}`);
            }
        }
    }
    async clearCacheWithRetry(cache, key) {
        let lastError = null;
        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            const [ok, err] = await tryFn(() => cache.clear(key));
            if (ok) {
                this.stats.deletes++;
                return [true, null];
            }
            lastError = err;
            if (err.name === 'NoSuchKey' || err.code === 'NoSuchKey') {
                return [true, null];
            }
            if (attempt < this.config.retryAttempts - 1) {
                const delay = this.config.retryDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return [false, lastError];
    }
    _getDriverForResource(resource) {
        const instanceKey = this.instanceName || this.slug || 'default';
        if (resource?.cacheInstances && instanceKey && resource.cacheInstances[instanceKey]) {
            return resource.cacheInstances[instanceKey];
        }
        return this.driver;
    }
    async generateCacheKey(resource, action, params = {}, partition = null, partitionValues = null) {
        const keyParts = [
            `resource=${resource.name}`,
            `action=${action}`
        ];
        if (partition && partitionValues && Object.keys(partitionValues).length > 0) {
            keyParts.push(`partition:${partition}`);
            for (const [field, value] of Object.entries(partitionValues)) {
                if (value !== null && value !== undefined) {
                    keyParts.push(`${field}:${value}`);
                }
            }
        }
        if (Object.keys(params).length > 0) {
            const paramsHash = this.hashParams(params);
            keyParts.push(paramsHash);
        }
        return join(...keyParts) + '.json.gz';
    }
    hashParams(params) {
        const serialized = jsonStableStringify(params) || 'empty';
        return crypto.createHash('md5').update(serialized).digest('hex').substring(0, 16);
    }
    getPartitionValues(data, resource) {
        const partitionValues = {};
        const schema = resource.$schema;
        if (!schema?.partitions) {
            return partitionValues;
        }
        for (const [partitionName, partitionDef] of Object.entries(schema.partitions)) {
            const typedPartitionDef = partitionDef;
            if (typedPartitionDef.fields) {
                const values = {};
                for (const field of typedPartitionDef.fields) {
                    if (data[field] !== undefined) {
                        values[field] = data[field];
                    }
                }
                if (Object.keys(values).length > 0) {
                    partitionValues[partitionName] = values;
                }
            }
        }
        return partitionValues;
    }
    async getCacheStats() {
        if (!this.driver)
            return null;
        const driverStats = typeof this.driver.getStats === 'function'
            ? this.driver.getStats()
            : null;
        return {
            size: await this.driver.size(),
            keys: await this.driver.keys(),
            driver: this.driver.constructor.name,
            stats: driverStats
        };
    }
    async clearAllCache() {
        if (!this.driver)
            return;
        for (const resource of Object.values(this.database.resources)) {
            const driver = this._getDriverForResource(resource);
            if (!driver)
                continue;
            const keyPrefix = `resource=${resource.name}`;
            await driver.clear(keyPrefix);
        }
    }
    async warmCache(resourceName, options = {}) {
        const resource = this.database.resources[resourceName];
        if (!resource) {
            throw new CacheError('Resource not found for cache warming', {
                operation: 'warmCache',
                driver: this.driver?.constructor.name,
                resourceName,
                availableResources: Object.keys(this.database.resources),
                suggestion: 'Check resource name spelling or ensure resource has been created'
            });
        }
        const { includePartitions = true, sampleSize = 100 } = options;
        if (this.driver instanceof PartitionAwareFilesystemCache && resource.warmPartitionCache) {
            const partitionNames = resource.$schema.partitions ? Object.keys(resource.$schema.partitions) : [];
            return await resource.warmPartitionCache(partitionNames, options);
        }
        let offset = 0;
        const pageSize = 100;
        const sampledRecords = [];
        while (sampledRecords.length < sampleSize) {
            const [ok, , pageResult] = await tryFn(() => resource.page({ offset, size: pageSize }));
            if (!ok || !pageResult) {
                break;
            }
            const pageItems = Array.isArray(pageResult)
                ? pageResult
                : (pageResult.items || []);
            if (pageItems.length === 0) {
                break;
            }
            sampledRecords.push(...pageItems);
            offset += pageSize;
        }
        if (includePartitions && resource.$schema.partitions && sampledRecords.length > 0) {
            for (const [partitionName, partitionDef] of Object.entries(resource.$schema.partitions)) {
                if (partitionDef.fields) {
                    const partitionValuesSet = new Set();
                    for (const record of sampledRecords) {
                        const values = this.getPartitionValues(record, resource);
                        if (values[partitionName]) {
                            partitionValuesSet.add(JSON.stringify(values[partitionName]));
                        }
                    }
                    for (const partitionValueStr of partitionValuesSet) {
                        const partitionValues = JSON.parse(partitionValueStr);
                        await tryFn(() => resource.list({ partition: partitionName, partitionValues }));
                    }
                }
            }
        }
        return {
            resourceName,
            recordsSampled: sampledRecords.length,
            partitionsWarmed: includePartitions && resource.$schema.partitions
                ? Object.keys(resource.$schema.partitions).length
                : 0
        };
    }
    async analyzeCacheUsage() {
        if (!(this.driver instanceof PartitionAwareFilesystemCache)) {
            return { message: 'Cache usage analysis is only available with PartitionAwareFilesystemCache' };
        }
        const analysis = {
            totalResources: Object.keys(this.database.resources).length,
            resourceStats: {},
            recommendations: {},
            summary: {
                mostUsedPartitions: [],
                leastUsedPartitions: [],
                suggestedOptimizations: []
            }
        };
        for (const [resourceName] of Object.entries(this.database.resources)) {
            if (!this.shouldCacheResource(resourceName)) {
                continue;
            }
            try {
                analysis.resourceStats[resourceName] = await this.driver.getPartitionStats(resourceName);
                analysis.recommendations[resourceName] = await this.driver.getCacheRecommendations(resourceName);
            }
            catch (error) {
                analysis.resourceStats[resourceName] = { error: error.message };
            }
        }
        const allRecommendations = Object.values(analysis.recommendations).flat();
        analysis.summary.mostUsedPartitions = allRecommendations
            .filter(r => r.recommendation === 'preload')
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 5);
        analysis.summary.leastUsedPartitions = allRecommendations
            .filter(r => r.recommendation === 'archive')
            .slice(0, 5);
        analysis.summary.suggestedOptimizations = [
            `Consider preloading ${analysis.summary.mostUsedPartitions.length} high-usage partitions`,
            `Archive ${analysis.summary.leastUsedPartitions.length} unused partitions`,
            `Monitor cache hit rates for partition efficiency`
        ];
        return analysis;
    }
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
        const missRate = total > 0 ? (this.stats.misses / total) * 100 : 0;
        const uptime = Date.now() - this.stats.startTime;
        const uptimeSeconds = Math.floor(uptime / 1000);
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            writes: this.stats.writes,
            deletes: this.stats.deletes,
            errors: this.stats.errors,
            total,
            hitRate: hitRate.toFixed(2) + '%',
            missRate: missRate.toFixed(2) + '%',
            hitRateDecimal: hitRate / 100,
            missRateDecimal: missRate / 100,
            uptime: uptimeSeconds,
            uptimeFormatted: this._formatUptime(uptimeSeconds),
            startTime: new Date(this.stats.startTime).toISOString(),
            hitsPerSecond: uptimeSeconds > 0 ? (this.stats.hits / uptimeSeconds).toFixed(2) : 0,
            missesPerSecond: uptimeSeconds > 0 ? (this.stats.misses / uptimeSeconds).toFixed(2) : 0,
            writesPerSecond: uptimeSeconds > 0 ? (this.stats.writes / uptimeSeconds).toFixed(2) : 0
        };
    }
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            writes: 0,
            deletes: 0,
            errors: 0,
            startTime: Date.now()
        };
    }
    _formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const parts = [];
        if (days > 0)
            parts.push(`${days}d`);
        if (hours > 0)
            parts.push(`${hours}h`);
        if (minutes > 0)
            parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0)
            parts.push(`${secs}s`);
        return parts.join(' ');
    }
    async onStop() {
        if (this.driver && typeof this.driver.shutdown === 'function') {
            await this.driver.shutdown();
        }
    }
}
//# sourceMappingURL=cache.plugin.js.map