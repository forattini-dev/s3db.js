import EventEmitter from 'events';
import { PluginStorage } from '../concerns/plugin-storage.js';
import { FilesystemStorageDriver } from '../concerns/storage-drivers/filesystem-driver.js';
import { PluginError } from '../errors.js';
import { detectAndWarnNamespaces } from './namespace.js';
import normalizePluginOptions from './concerns/plugin-options.js';
import { createLogger } from '../concerns/logger.js';
export class Plugin extends EventEmitter {
    name;
    options;
    hooks;
    baseSlug;
    slug;
    _storage;
    instanceName;
    namespace;
    _namespaceExplicit;
    cronManager;
    _cronJobs;
    logger;
    database;
    logLevel;
    constructor(options = {}) {
        super();
        this.name = this.constructor.name;
        this.options = normalizePluginOptions(this, options);
        this.hooks = new Map();
        this.baseSlug = options.slug || this._generateSlug();
        this.slug = this.baseSlug;
        this._storage = null;
        this.instanceName = null;
        this.namespace = null;
        this._namespaceExplicit = false;
        this.cronManager = null;
        this._cronJobs = [];
        const logLevel = (this.options.logLevel || 'info');
        this.logLevel = logLevel;
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            this.logger = createLogger({ name: `Plugin:${this.name}`, level: logLevel });
        }
        if (options.namespace || options.instanceId) {
            this.setNamespace(options.namespace || options.instanceId || null, { explicit: true });
        }
    }
    _generateSlug() {
        return this.name
            .replace(/Plugin$/, '')
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase();
    }
    _normalizeNamespace(value) {
        if (value === null || value === undefined)
            return null;
        const text = String(value).trim();
        if (!text)
            return null;
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '') || null;
    }
    setNamespace(value, { explicit = false } = {}) {
        const normalized = this._normalizeNamespace(value);
        if (!normalized) {
            if (explicit) {
                this.namespace = null;
                this.slug = this.baseSlug;
                this._namespaceExplicit = true;
                this._storage = null;
                if (typeof this.onNamespaceChanged === 'function') {
                    this.onNamespaceChanged(this.namespace);
                }
            }
            return;
        }
        if (this.namespace === normalized && (explicit === false || this._namespaceExplicit)) {
            return;
        }
        this.namespace = normalized;
        if (explicit) {
            this._namespaceExplicit = true;
        }
        this.slug = `${this.baseSlug}--${normalized}`;
        this._storage = null;
        if (typeof this.onNamespaceChanged === 'function') {
            this.onNamespaceChanged(this.namespace);
        }
    }
    setInstanceName(name) {
        if (!name)
            return;
        this.instanceName = name;
        if (!this._namespaceExplicit) {
            const normalized = this._normalizeNamespace(name);
            if (normalized && normalized !== this.baseSlug) {
                this.setNamespace(normalized);
            }
        }
    }
    onNamespaceChanged(_namespace) {
        // Subclasses may override
    }
    getChildLogger(name, bindings = {}) {
        if (!this.logger) {
            throw new PluginError('Plugin logger not initialized', {
                pluginName: this.name,
                suggestion: 'Ensure plugin is attached to database via usePlugin() or pass logger in options'
            });
        }
        return this.logger.child({ name, ...bindings });
    }
    async scheduleCron(expression, fn, suffix = 'job', options = {}) {
        if (!this.cronManager) {
            return null;
        }
        const jobName = `${this.slug}-${suffix}`;
        const task = await this.cronManager.schedule(expression, fn, jobName, options);
        if (task) {
            this._cronJobs.push(jobName);
        }
        return task;
    }
    async scheduleInterval(ms, fn, suffix = 'interval', options = {}) {
        if (!this.cronManager) {
            return null;
        }
        const jobName = `${this.slug}-${suffix}`;
        const task = await this.cronManager.scheduleInterval(ms, fn, jobName, options);
        if (task) {
            this._cronJobs.push(jobName);
        }
        return task;
    }
    stopAllCronJobs() {
        if (!this.cronManager)
            return 0;
        let stopped = 0;
        for (const jobName of this._cronJobs) {
            if (this.cronManager.stop(jobName)) {
                stopped++;
            }
        }
        this._cronJobs = [];
        return stopped;
    }
    getStorage() {
        if (!this._storage) {
            const storageConfig = this.options.storage || {};
            const driver = storageConfig.driver || 's3';
            const config = storageConfig.config || {};
            if (driver === 'filesystem') {
                this._storage = new FilesystemStorageDriver(config, this.slug);
            }
            else if (driver === 's3') {
                if (!this.database || !this.database.client) {
                    throw new PluginError('Plugin storage unavailable until plugin is installed', {
                        pluginName: this.name,
                        operation: 'getStorage',
                        statusCode: 400,
                        retriable: false,
                        suggestion: 'Call db.installPlugin(new Plugin()) or ensure db.connect() completed before accessing storage.'
                    });
                }
                this._storage = new PluginStorage(this.database.client, this.slug);
            }
            else {
                throw new PluginError(`Unsupported storage driver: ${driver}`, {
                    pluginName: this.name,
                    operation: 'getStorage',
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'Use "s3" or "filesystem" as storage driver'
                });
            }
        }
        return this._storage;
    }
    async detectAndWarnNamespaces() {
        if (!this._namespaceExplicit && !this.namespace) {
            return [];
        }
        try {
            const pluginPrefix = this.baseSlug;
            const currentNamespace = this.namespace || '';
            return await detectAndWarnNamespaces(this.getStorage(), this.name, pluginPrefix, currentNamespace, this.logger);
        }
        catch {
            return [];
        }
    }
    async install(database) {
        this.database = database;
        this.beforeInstall();
        this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin installing');
        await this.detectAndWarnNamespaces();
        await this.onInstall();
        this.afterInstall();
        this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin installed');
    }
    async start() {
        this.beforeStart();
        this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin starting');
        await this.onStart();
        this.afterStart();
        this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin started');
    }
    async stop() {
        this.beforeStop();
        this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin stopping');
        await this.onStop();
        this.stopAllCronJobs();
        this.removeAllListeners();
        this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin stopped');
        this.afterStop();
    }
    async uninstall(options = {}) {
        const { purgeData = false } = options;
        this.beforeUninstall();
        await this.onUninstall(options);
        if (purgeData && this._storage) {
            const deleted = await this._storage.deleteAll();
            this.emit('plugin.dataPurged', { deleted });
        }
        this.afterUninstall();
    }
    async onInstall() {
        // Override in subclasses
    }
    async onStart() {
        // Override in subclasses
    }
    async onStop() {
        // Override in subclasses
    }
    async onUninstall(_options) {
        // Override in subclasses
    }
    addHook(resource, event, handler) {
        if (!this.hooks.has(resource)) {
            this.hooks.set(resource, new Map());
        }
        const resourceHooks = this.hooks.get(resource);
        if (!resourceHooks.has(event)) {
            resourceHooks.set(event, []);
        }
        resourceHooks.get(event).push(handler);
    }
    removeHook(resource, event, handler) {
        const resourceHooks = this.hooks.get(resource);
        if (resourceHooks && resourceHooks.has(event)) {
            const handlers = resourceHooks.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    wrapResourceMethod(resource, methodName, wrapper) {
        const originalMethod = resource[methodName];
        if (!resource._pluginWrappers) {
            resource._pluginWrappers = new Map();
        }
        if (!resource._pluginWrappers.has(methodName)) {
            resource._pluginWrappers.set(methodName, []);
        }
        resource._pluginWrappers.get(methodName).push(wrapper);
        const wrappedMethodKey = `_wrapped_${methodName}`;
        if (!resource[wrappedMethodKey]) {
            resource[wrappedMethodKey] = originalMethod;
            const isJestMock = originalMethod && originalMethod._isMockFunction;
            resource[methodName] = async function (...args) {
                const wrappedFn = resource[wrappedMethodKey];
                let result = await wrappedFn.call(this, ...args);
                for (const wrapperFn of resource._pluginWrappers.get(methodName)) {
                    result = await wrapperFn.call(this, result, args, methodName);
                }
                return result;
            };
            if (isJestMock) {
                Object.setPrototypeOf(resource[methodName], Object.getPrototypeOf(originalMethod));
                Object.assign(resource[methodName], originalMethod);
            }
        }
    }
    addMiddleware(resource, methodName, middleware) {
        const resourceAny = resource;
        if (typeof resourceAny[methodName] !== 'function') {
            throw new PluginError(`Cannot add middleware to "${methodName}"`, {
                pluginName: this.name,
                operation: 'addMiddleware',
                statusCode: 400,
                retriable: false,
                suggestion: 'Ensure the resource exposes the method before registering middleware.',
                resourceName: resource.name || 'unknown',
                methodName
            });
        }
        if (!resource._pluginMiddlewares) {
            resource._pluginMiddlewares = {};
        }
        if (!resource._pluginMiddlewares[methodName]) {
            resource._pluginMiddlewares[methodName] = [];
            const originalMethod = resourceAny[methodName].bind(resource);
            resourceAny[methodName] = async function (...args) {
                let idx = -1;
                const next = async (...nextArgs) => {
                    idx++;
                    if (idx < resource._pluginMiddlewares[methodName].length) {
                        return await resource._pluginMiddlewares[methodName][idx].call(this, next, ...nextArgs);
                    }
                    else {
                        return await originalMethod(...nextArgs);
                    }
                };
                return await next(...args);
            };
        }
        resource._pluginMiddlewares[methodName].push(middleware);
    }
    getPartitionValues(data, resource) {
        if (!resource.config?.partitions)
            return {};
        const partitionValues = {};
        for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
            if (partitionDef.fields) {
                partitionValues[partitionName] = {};
                for (const [fieldName, rule] of Object.entries(partitionDef.fields)) {
                    const value = this.getNestedFieldValue(data, fieldName);
                    if (value !== null && value !== undefined) {
                        partitionValues[partitionName][fieldName] = resource.applyPartitionRule
                            ? resource.applyPartitionRule(value, rule)
                            : value;
                    }
                }
            }
            else {
                partitionValues[partitionName] = {};
            }
        }
        return partitionValues;
    }
    getNestedFieldValue(data, fieldPath) {
        if (!fieldPath.includes('.')) {
            return data[fieldPath] ?? null;
        }
        const keys = fieldPath.split('.');
        let value = data;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            }
            else {
                return null;
            }
        }
        return value ?? null;
    }
    beforeInstall() {
        this.emit('plugin.beforeInstall', new Date());
    }
    afterInstall() {
        this.emit('plugin.afterInstall', new Date());
    }
    beforeStart() {
        this.emit('plugin.beforeStart', new Date());
    }
    afterStart() {
        this.emit('plugin.afterStart', new Date());
    }
    beforeStop() {
        this.emit('plugin.beforeStop', new Date());
    }
    afterStop() {
        this.emit('plugin.afterStop', new Date());
    }
    beforeUninstall() {
        this.emit('plugin.beforeUninstall', new Date());
    }
    afterUninstall() {
        this.emit('plugin.afterUninstall', new Date());
    }
}
//# sourceMappingURL=plugin.class.js.map