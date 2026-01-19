import { tryFnSync } from './concerns/try-fn.js';
import { S3Client } from './clients/s3-client.class.js';
import { MemoryClient } from './clients/memory-client.class.js';
import { FileSystemClient } from './clients/filesystem-client.class.js';
import { ConnectionString } from './connection-string.class.js';
import { idGenerator } from './concerns/id.js';
import { ProcessManager } from './concerns/process-manager.js';
import { SafeEventEmitter } from './concerns/safe-event-emitter.js';
import { CronManager } from './concerns/cron-manager.js';
import { createLogger, getLoggerOptionsFromEnv } from './concerns/logger.js';
import { DatabaseHooks } from './database/database-hooks.class.js';
import { DatabaseCoordinators } from './database/database-coordinators.class.js';
import { DatabaseRecovery } from './database/database-recovery.class.js';
import { DatabaseMetadata } from './database/database-metadata.class.js';
import { DatabasePlugins } from './database/database-plugins.class.js';
import { DatabaseResources } from './database/database-resources.class.js';
import { DatabaseConnection } from './database/database-connection.class.js';
export class Database extends SafeEventEmitter {
    id;
    version;
    s3dbVersion;
    resources;
    savedMetadata;
    databaseOptions;
    executorPool;
    taskExecutor;
    pluginList;
    pluginRegistry;
    plugins;
    cache;
    passphrase;
    bcryptRounds;
    versioningEnabled;
    strictValidation;
    strictHooks;
    disableResourceEvents;
    deferMetadataWrites;
    metadataWriteDelay;
    processManager;
    cronManager;
    logLevel;
    logger;
    client;
    connectionString;
    bucket;
    keyPrefix;
    _resourcesMap;
    _parallelism;
    _childLoggerLevels;
    _hooksModule;
    _coordinatorsModule;
    _recoveryModule;
    _metadataModule;
    _pluginsModule;
    _resourcesModule;
    _connectionModule;
    constructor(options) {
        super({
            logLevel: options.logLevel || options.loggerOptions?.level || 'info',
            autoCleanup: options.autoCleanup !== false
        });
        this.id = (() => {
            const [ok, , id] = tryFnSync(() => idGenerator(7));
            return ok && id ? id : `db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        })();
        this.version = '1';
        this.s3dbVersion = (() => {
            const [ok, , version] = tryFnSync(() => (typeof globalThis['__PACKAGE_VERSION__'] !== 'undefined' && globalThis['__PACKAGE_VERSION__'] !== '__PACKAGE_VERSION__'
                ? globalThis['__PACKAGE_VERSION__']
                : 'latest'));
            return ok ? version : 'latest';
        })();
        this._resourcesMap = {};
        this.resources = new Proxy(this._resourcesMap, {
            get: (target, prop) => {
                if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') {
                    return target[prop];
                }
                if (target[prop]) {
                    return target[prop];
                }
                return undefined;
            },
            ownKeys: (target) => {
                return Object.keys(target);
            },
            getOwnPropertyDescriptor: (target, prop) => {
                return Object.getOwnPropertyDescriptor(target, prop);
            }
        });
        this.savedMetadata = null;
        this.databaseOptions = options;
        const executorPoolConfig = options?.executorPool ?? options?.operationsPool;
        this._parallelism = this._normalizeParallelism(options?.parallelism ?? executorPoolConfig?.concurrency, 10);
        this.logLevel = options.logLevel || options.loggerOptions?.level || 'info';
        const loggerOptions = { ...(options.loggerOptions || {}) };
        if (options.logLevel) {
            loggerOptions.level = options.logLevel;
        }
        if (options.logger) {
            this.logger = options.logger;
            if (options.logLevel) {
                this.logger.level = options.logLevel;
            }
        }
        else {
            const loggerConfig = getLoggerOptionsFromEnv(loggerOptions);
            this.logger = createLogger({
                name: 'Database',
                ...loggerConfig
            });
        }
        this._childLoggerLevels = options.loggerOptions?.childLevels || {};
        if (options?.operationsPool && !options?.executorPool) {
            this.logger.warn('⚠️  "operationsPool" is deprecated in s3db.js v16.x. ' +
                'Use "executorPool" instead. ' +
                'Migration: https://s3db.js/docs/migration/v16-to-v17');
        }
        this.executorPool = this._normalizeOperationsPool(executorPoolConfig, this._parallelism);
        if (options?.taskExecutorMonitoring) {
            this.executorPool.monitoring = this._deepMerge(this.executorPool.monitoring || {}, options.taskExecutorMonitoring);
        }
        this._parallelism = this.executorPool?.concurrency ?? this._parallelism;
        this.taskExecutor = this.executorPool;
        this.pluginList = options.plugins ?? [];
        this.pluginRegistry = {};
        this.plugins = this.pluginRegistry;
        this.cache = options.cache;
        this.passphrase = options.passphrase ?? 'secret';
        this.bcryptRounds = options.bcryptRounds ?? 10;
        this.versioningEnabled = options.versioningEnabled ?? false;
        this.strictValidation = (options.strictValidation ?? true) !== false;
        this.strictHooks = options.strictHooks ?? false;
        this.disableResourceEvents = options.disableResourceEvents === true;
        this.deferMetadataWrites = options.deferMetadataWrites ?? false;
        this.metadataWriteDelay = options.metadataWriteDelay ?? 100;
        const exitOnSignal = (options.exitOnSignal ?? true) !== false;
        this.processManager = options.processManager ?? new ProcessManager({
            logLevel: this.logger.level,
            exitOnSignal
        });
        this.cronManager = options.cronManager ?? new CronManager({
            logLevel: this.logger.level,
            exitOnSignal
        });
        this._initializeClient(options);
        this._hooksModule = new DatabaseHooks(this);
        this._coordinatorsModule = new DatabaseCoordinators(this);
        this._recoveryModule = new DatabaseRecovery(this);
        this._metadataModule = new DatabaseMetadata(this);
        this._pluginsModule = new DatabasePlugins(this, this._coordinatorsModule);
        this._resourcesModule = new DatabaseResources(this, this._metadataModule, this._coordinatorsModule);
        this._connectionModule = new DatabaseConnection(this, this._metadataModule, this._recoveryModule, this._pluginsModule, this._coordinatorsModule);
        this._connectionModule.registerExitListener();
    }
    _initializeClient(options) {
        let connectionString = options.connectionString;
        if (!connectionString && (options.bucket || options.accessKeyId || options.secretAccessKey)) {
            const { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = options;
            if (endpoint) {
                const url = new URL(endpoint);
                if (accessKeyId)
                    url.username = encodeURIComponent(accessKeyId);
                if (secretAccessKey)
                    url.password = encodeURIComponent(secretAccessKey);
                url.pathname = `/${bucket || 's3db'}`;
                if (forcePathStyle) {
                    url.searchParams.set('forcePathStyle', 'true');
                }
                connectionString = url.toString();
            }
            else if (accessKeyId && secretAccessKey) {
                const params = new URLSearchParams();
                params.set('region', region || 'us-east-1');
                if (forcePathStyle) {
                    params.set('forcePathStyle', 'true');
                }
                connectionString = `s3://${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@${bucket || 's3db'}?${params.toString()}`;
            }
        }
        let mergedClientOptions = {};
        let connStr = null;
        if (options.clientOptions) {
            mergedClientOptions = { ...options.clientOptions };
        }
        if (connectionString) {
            try {
                connStr = new ConnectionString(connectionString);
                if (connStr.clientOptions && Object.keys(connStr.clientOptions).length > 0) {
                    mergedClientOptions = this._deepMerge(mergedClientOptions, connStr.clientOptions);
                }
            }
            catch {
                // If parsing fails, continue without querystring params
            }
        }
        if (!options.client && connectionString) {
            try {
                const url = new URL(connectionString);
                if (url.protocol === 'memory:') {
                    const bucketHost = url.hostname || 'test-bucket';
                    const [okBucket, , decodedBucket] = tryFnSync(() => decodeURIComponent(bucketHost));
                    const bucket = okBucket ? decodedBucket : bucketHost;
                    const rawPrefix = url.pathname ? url.pathname.substring(1) : '';
                    const [okPrefix, , decodedPrefix] = tryFnSync(() => decodeURIComponent(rawPrefix));
                    const keyPrefix = okPrefix ? decodedPrefix : rawPrefix;
                    const memoryOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
                        bucket,
                        keyPrefix,
                        logLevel: this.logger.level,
                    }, mergedClientOptions));
                    this.client = new MemoryClient(memoryOptions);
                }
                else if (url.protocol === 'file:') {
                    const filesystemOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
                        basePath: connStr?.basePath,
                        bucket: connStr?.bucket,
                        keyPrefix: connStr?.keyPrefix,
                        logLevel: this.logger.level,
                    }, mergedClientOptions));
                    this.client = new FileSystemClient(filesystemOptions);
                }
                else {
                    const s3ClientOptions = this._deepMerge({
                        logLevel: this.logger.level,
                        logger: this.getChildLogger('S3Client'),
                        connectionString: connectionString,
                    }, mergedClientOptions);
                    s3ClientOptions.executorPool = this._deepMerge(s3ClientOptions.executorPool || {}, this.executorPool);
                    this.client = new S3Client(s3ClientOptions);
                }
            }
            catch {
                const s3ClientOptions = this._deepMerge({
                    logLevel: this.logger.level,
                    logger: this.getChildLogger('S3Client'),
                    connectionString: connectionString,
                }, mergedClientOptions);
                s3ClientOptions.executorPool = this._deepMerge(s3ClientOptions.executorPool || {}, this.executorPool);
                this.client = new S3Client(s3ClientOptions);
            }
        }
        else if (!options.client) {
            const s3ClientOptions = this._deepMerge({
                logLevel: this.logger.level,
                logger: this.getChildLogger('S3Client'),
            }, mergedClientOptions);
            s3ClientOptions.executorPool = this._deepMerge(s3ClientOptions.executorPool || {}, this.executorPool);
            this.client = new S3Client(s3ClientOptions);
        }
        else {
            this.client = options.client;
        }
        const resolvedConnectionString = connectionString || this._inferConnectionStringFromClient(this.client);
        this.connectionString = resolvedConnectionString;
        if (!this.databaseOptions.connectionString && resolvedConnectionString) {
            this.databaseOptions.connectionString = resolvedConnectionString;
        }
        this.bucket = this.client.bucket || '';
        this.keyPrefix = this.client.keyPrefix || '';
    }
    get parallelism() {
        return this._parallelism ?? 10;
    }
    set parallelism(value) {
        const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
        this._parallelism = normalized;
        if (this.executorPool) {
            this.executorPool.concurrency = normalized;
        }
    }
    setConcurrency(value) {
        const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
        this._parallelism = normalized;
        if (this.executorPool) {
            this.executorPool.concurrency = normalized;
        }
    }
    get operationsPool() {
        return this.executorPool;
    }
    get config() {
        return {
            version: this.version,
            s3dbVersion: this.s3dbVersion,
            bucket: this.bucket,
            keyPrefix: this.keyPrefix,
            taskExecutor: this.taskExecutor,
            logLevel: this.logger.level
        };
    }
    getChildLogger(name, bindings = {}) {
        const childLogger = this.logger.child({
            name,
            ...bindings
        });
        const levelOverride = this._childLoggerLevels[name];
        if (levelOverride) {
            childLogger.level = levelOverride;
        }
        return childLogger;
    }
    setChildLevel(name, level) {
        this._childLoggerLevels[name] = level;
    }
    async connect() {
        return this._connectionModule.connect();
    }
    async disconnect() {
        return this._connectionModule.disconnect();
    }
    isConnected() {
        return this._connectionModule.isConnected();
    }
    async startPlugins() {
        return this._pluginsModule.startPlugins();
    }
    async usePlugin(plugin, name = null) {
        return this._pluginsModule.usePlugin(plugin, name);
    }
    async uninstallPlugin(name, options = {}) {
        return this._pluginsModule.uninstallPlugin(name, options);
    }
    async getGlobalCoordinator(namespace, options = {}) {
        return this._coordinatorsModule.getGlobalCoordinator(namespace, options);
    }
    async createResource(config) {
        return this._resourcesModule.createResource(config);
    }
    async listResources() {
        return this._resourcesModule.listResources();
    }
    async getResource(name) {
        return this._resourcesModule.getResource(name);
    }
    resourceExists(name) {
        return this._resourcesModule.resourceExists(name);
    }
    resourceExistsWithSameHash(params) {
        return this._resourcesModule.resourceExistsWithSameHash(params);
    }
    prewarmResources(resourceNames) {
        const warmed = [];
        const skipped = [];
        const alreadyCompiled = [];
        const resources = resourceNames
            ? resourceNames.map(name => this._resourcesMap[name]).filter(Boolean)
            : Object.values(this._resourcesMap);
        for (const resource of resources) {
            if (!resource)
                continue;
            if (resource.isSchemaCompiled()) {
                alreadyCompiled.push(resource.name);
                continue;
            }
            try {
                resource.prewarmSchema();
                warmed.push(resource.name);
            }
            catch (err) {
                skipped.push(resource.name);
                this.logger.warn({ resource: resource.name, err }, `[PREWARM] Failed to prewarm resource schema`);
            }
        }
        this.logger.debug({ warmed: warmed.length, skipped: skipped.length, alreadyCompiled: alreadyCompiled.length }, `[PREWARM] Resources prewarmed`);
        return { warmed, skipped, alreadyCompiled };
    }
    async uploadMetadataFile() {
        return this._metadataModule.uploadMetadataFile();
    }
    async flushMetadata() {
        return this._metadataModule.flushMetadata();
    }
    blankMetadataStructure() {
        return this._metadataModule.blankMetadataStructure();
    }
    detectDefinitionChanges(savedMetadata) {
        return this._metadataModule.detectDefinitionChanges(savedMetadata);
    }
    generateDefinitionHash(definition, behavior) {
        return this._metadataModule.generateDefinitionHash(definition, behavior);
    }
    getNextVersion(versions = {}) {
        return this._metadataModule.getNextVersion(versions);
    }
    addHook(event, fn) {
        return this._hooksModule.addHook(event, fn);
    }
    removeHook(event, fn) {
        return this._hooksModule.removeHook(event, fn);
    }
    getHooks(event) {
        return this._hooksModule.getHooks(event);
    }
    clearHooks(event) {
        return this._hooksModule.clearHooks(event);
    }
    _deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] !== undefined) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    result[key] = this._deepMerge(result[key] || {}, source[key]);
                }
                else {
                    result[key] = source[key];
                }
            }
        }
        return result;
    }
    _applyTaskExecutorMonitoring(config) {
        if (!this.databaseOptions?.taskExecutorMonitoring) {
            return config;
        }
        const merged = { ...config };
        merged.taskExecutorMonitoring = this._deepMerge(this.databaseOptions.taskExecutorMonitoring, merged.taskExecutorMonitoring || {});
        return merged;
    }
    _normalizeParallelism(value, fallback = 10) {
        if (value === undefined || value === null || value === '') {
            return fallback;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return fallback;
            }
            if (trimmed.toLowerCase() === 'auto') {
                return fallback;
            }
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed) && parsed > 0) {
                return Math.floor(parsed);
            }
            return fallback;
        }
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value);
        }
        return fallback;
    }
    _normalizeOperationsPool(config, defaultConcurrency = 10) {
        if (config === false || config?.enabled === false) {
            return { enabled: false, concurrency: this._normalizeParallelism(undefined, defaultConcurrency) };
        }
        const normalizedConcurrency = this._normalizeParallelism(config?.concurrency, defaultConcurrency);
        return {
            enabled: true,
            concurrency: normalizedConcurrency,
            retries: config?.retries ?? 3,
            retryDelay: config?.retryDelay ?? 1000,
            timeout: config?.timeout ?? 30000,
            retryableErrors: config?.retryableErrors ?? [],
            autotune: config?.autotune ?? null,
            monitoring: config?.monitoring ?? { collectMetrics: true },
        };
    }
    _inferConnectionStringFromClient(client) {
        if (!client) {
            return undefined;
        }
        if (client.connectionString) {
            return client.connectionString;
        }
        if (client instanceof MemoryClient) {
            const bucket = encodeURIComponent(client.bucket || 's3db');
            const encodedPrefix = client.keyPrefix
                ? client.keyPrefix
                    .split('/')
                    .filter(Boolean)
                    .map((segment) => encodeURIComponent(segment))
                    .join('/')
                : '';
            const prefixPath = encodedPrefix ? `/${encodedPrefix}` : '';
            return `memory://${bucket}${prefixPath}`;
        }
        if (client instanceof FileSystemClient) {
            if (client.basePath) {
                return `file://${encodeURI(client.basePath)}`;
            }
        }
        return undefined;
    }
}
export class S3db extends Database {
}
export default S3db;
//# sourceMappingURL=database.class.js.map