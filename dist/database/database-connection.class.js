import { TasksPool } from '../tasks/tasks-pool.class.js';
import Resource from '../resource.class.js';
import tryFn, { tryFnSync } from '../concerns/try-fn.js';
import { streamToString } from '../stream/index.js';
import { bumpProcessMaxListeners } from '../concerns/process-max-listeners.js';
export class DatabaseConnection {
    database;
    metadata;
    recovery;
    plugins;
    coordinators;
    _exitListenerRegistered;
    _exitListener;
    constructor(database, metadata, recovery, plugins, coordinators) {
        this.database = database;
        this.metadata = metadata;
        this.recovery = recovery;
        this.plugins = plugins;
        this.coordinators = coordinators;
        this._exitListenerRegistered = false;
        this._exitListener = null;
    }
    registerExitListener() {
        if (!this._exitListenerRegistered && typeof process !== 'undefined') {
            this._exitListenerRegistered = true;
            this._exitListener = async () => {
                if (this.database.isConnected()) {
                    await tryFn(() => this.disconnect());
                }
            };
            bumpProcessMaxListeners(1);
            process.on('exit', this._exitListener);
        }
    }
    isConnected() {
        return !!this.database.savedMetadata;
    }
    async connect() {
        const db = this.database;
        db.logger.debug({ databaseId: db.id }, 'connecting to database');
        this.registerExitListener();
        await this.plugins.startPlugins();
        let metadata = null;
        let needsHealing = false;
        const healingLog = [];
        if (await db.client.exists('s3db.json')) {
            const [ok] = await tryFn(async () => {
                const request = await db.client.getObject('s3db.json');
                const rawContent = await streamToString(request?.Body);
                const [parseOk, , parsedData] = tryFnSync(() => JSON.parse(rawContent));
                if (!parseOk) {
                    healingLog.push('JSON parsing failed - attempting recovery');
                    needsHealing = true;
                    metadata = await this.recovery.attemptJsonRecovery(rawContent, healingLog);
                    if (!metadata) {
                        await this.recovery.createCorruptedBackup(rawContent);
                        healingLog.push('Created backup of corrupted file - starting with blank metadata');
                        metadata = this.metadata.blankMetadataStructure();
                    }
                }
                else {
                    metadata = parsedData;
                }
                const healedMetadata = await this.recovery.validateAndHealMetadata(metadata, healingLog);
                if (healedMetadata !== metadata) {
                    metadata = healedMetadata;
                    needsHealing = true;
                }
            });
            if (!ok) {
                healingLog.push(`Critical error reading s3db.json: unknown error`);
                await this.recovery.createCorruptedBackup();
                metadata = this.metadata.blankMetadataStructure();
                needsHealing = true;
            }
        }
        else {
            metadata = this.metadata.blankMetadataStructure();
            await this.metadata.uploadMetadataFile();
        }
        if (needsHealing) {
            await this.recovery.uploadHealedMetadata(metadata, healingLog);
        }
        db.savedMetadata = metadata;
        const definitionChanges = this.metadata.detectDefinitionChanges(metadata);
        let registryUploadNeeded = false;
        for (const [name, resourceMetadata] of Object.entries(metadata.resources || {})) {
            const currentVersion = resourceMetadata.currentVersion || 'v1';
            const versionData = resourceMetadata.versions?.[currentVersion];
            if (versionData) {
                let restoredIdGenerator;
                let restoredIdSize;
                if (versionData.idGenerator !== undefined) {
                    if (versionData.idGenerator === 'custom_function') {
                        restoredIdGenerator = undefined;
                        restoredIdSize = versionData.idSize || 22;
                    }
                    else if (typeof versionData.idGenerator === 'number') {
                        restoredIdGenerator = versionData.idGenerator;
                        restoredIdSize = versionData.idSize || versionData.idGenerator;
                    }
                    else {
                        restoredIdSize = versionData.idSize || 22;
                    }
                }
                else {
                    restoredIdSize = versionData.idSize || 22;
                }
                db._resourcesMap[name] = new Resource({
                    name,
                    client: db.client,
                    database: db,
                    version: currentVersion,
                    attributes: versionData.attributes,
                    behavior: versionData.behavior || 'user-managed',
                    passphrase: db.passphrase,
                    bcryptRounds: db.bcryptRounds,
                    observers: [db],
                    cache: db.cache,
                    timestamps: versionData.timestamps !== undefined ? versionData.timestamps : false,
                    partitions: resourceMetadata.partitions || versionData.partitions || {},
                    paranoid: versionData.paranoid !== undefined ? versionData.paranoid : true,
                    allNestedObjectsOptional: versionData.allNestedObjectsOptional !== undefined ? versionData.allNestedObjectsOptional : true,
                    autoDecrypt: versionData.autoDecrypt !== undefined ? versionData.autoDecrypt : true,
                    asyncEvents: versionData.asyncEvents !== undefined ? versionData.asyncEvents : true,
                    hooks: {},
                    versioningEnabled: db.versioningEnabled,
                    strictValidation: db.strictValidation,
                    map: versionData.map,
                    idGenerator: restoredIdGenerator,
                    idSize: restoredIdSize,
                    schemaRegistry: resourceMetadata.schemaRegistry,
                    pluginSchemaRegistry: resourceMetadata.pluginSchemaRegistry
                });
                if (db._resourcesMap[name].schema?.needsRegistryPersistence()) {
                    registryUploadNeeded = true;
                }
            }
        }
        if (definitionChanges.length > 0) {
            db.emit('db:resource-definitions-changed', {
                changes: definitionChanges,
                metadata: db.savedMetadata
            });
        }
        if (registryUploadNeeded) {
            await this.metadata.scheduleMetadataUpload();
        }
        db.logger.info({
            databaseId: db.id,
            resourceCount: Object.keys(db.resources).length,
            pluginCount: Object.keys(db.pluginRegistry).length
        }, 'database connected');
        db.emit('db:connected', new Date());
    }
    async disconnect() {
        const db = this.database;
        db.logger.debug({ databaseId: db.id }, 'disconnecting from database');
        await this.metadata.flushMetadata();
        await db.emit('disconnected', new Date());
        await tryFn(async () => {
            await this.coordinators.stopAll();
            if (db.pluginList && db.pluginList.length > 0) {
                for (const plugin of db.pluginList) {
                    if (plugin && typeof plugin.removeAllListeners === 'function') {
                        plugin.removeAllListeners();
                    }
                }
                const stopConcurrency = Math.max(1, Number.isFinite(db.executorPool?.concurrency) ? db.executorPool.concurrency : 5);
                await TasksPool.map(db.pluginList, async (plugin) => {
                    await tryFn(async () => {
                        if (plugin && typeof plugin.stop === 'function') {
                            await plugin.stop();
                        }
                    });
                }, { concurrency: stopConcurrency });
            }
            if (db.resources && Object.keys(db.resources).length > 0) {
                for (const [, resource] of Object.entries(db.resources)) {
                    await tryFn(() => {
                        if (resource && typeof resource.dispose === 'function') {
                            resource.dispose();
                        }
                        if (resource._pluginWrappers) {
                            resource._pluginWrappers.clear();
                        }
                        if (resource._pluginMiddlewares) {
                            resource._pluginMiddlewares = {};
                        }
                        if (resource.observers && Array.isArray(resource.observers)) {
                            resource.observers = [];
                        }
                    });
                }
                Object.keys(db.resources).forEach(k => delete db._resourcesMap[k]);
            }
            if (db.client) {
                if (typeof db.client.removeAllListeners === 'function') {
                    db.client.removeAllListeners();
                }
                if (typeof db.client.destroy === 'function') {
                    db.client.destroy();
                }
            }
            await db.emit('db:disconnected', new Date());
            if (typeof db.removeAllListeners === 'function') {
                db.removeAllListeners();
            }
            if (this._exitListener && typeof process !== 'undefined') {
                process.off('exit', this._exitListener);
                this._exitListener = null;
                this._exitListenerRegistered = false;
                bumpProcessMaxListeners(-1);
            }
            if (db.processManager && typeof db.processManager.removeSignalHandlers === 'function') {
                db.processManager.removeSignalHandlers();
            }
            if (db.cronManager && typeof db.cronManager.removeSignalHandlers === 'function') {
                db.cronManager.removeSignalHandlers();
                if (typeof db.cronManager.shutdown === 'function') {
                    await db.cronManager.shutdown();
                }
            }
            db.savedMetadata = null;
            db.plugins = {};
            db.pluginList = [];
        });
    }
}
//# sourceMappingURL=database-connection.class.js.map