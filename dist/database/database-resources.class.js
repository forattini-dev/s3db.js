import Resource from '../resource.class.js';
import { ResourceNotFound, SchemaError } from '../errors.js';
export class DatabaseResources {
    database;
    metadata;
    coordinators;
    constructor(database, metadata, coordinators) {
        this.database = database;
        this.metadata = metadata;
        this.coordinators = coordinators;
    }
    resourceExists(name) {
        return !!this.database._resourcesMap[name];
    }
    resourceExistsWithSameHash({ name, attributes, behavior = 'user-managed', partitions = {} }) {
        const db = this.database;
        if (!db._resourcesMap[name]) {
            return { exists: false, sameHash: false, hash: null };
        }
        const existingResource = db._resourcesMap[name];
        const existingHash = this.metadata.generateDefinitionHash(existingResource.export());
        const mockResource = new Resource({
            name,
            attributes,
            behavior,
            partitions,
            client: db.client,
            version: existingResource.version,
            passphrase: db.passphrase,
            bcryptRounds: db.bcryptRounds,
            versioningEnabled: db.versioningEnabled
        });
        const newHash = this.metadata.generateDefinitionHash(mockResource.export());
        return {
            exists: true,
            sameHash: existingHash === newHash,
            hash: newHash,
            existingHash
        };
    }
    async createResource({ name, attributes, behavior = 'user-managed', hooks, middlewares, ...config }) {
        const db = this.database;
        const normalizedPartitions = this._normalizePartitions(config.partitions || [], attributes);
        if (db._resourcesMap[name]) {
            const existingResource = db._resourcesMap[name];
            Object.assign(existingResource.config, {
                cache: db.cache,
                ...config,
                partitions: normalizedPartitions
            });
            if (behavior) {
                existingResource.behavior = behavior;
            }
            existingResource.versioningEnabled = db.versioningEnabled;
            existingResource.updateAttributes(attributes);
            if (hooks) {
                for (const [event, hooksArr] of Object.entries(hooks)) {
                    if (Array.isArray(hooksArr) && existingResource.hooks[event]) {
                        for (const fn of hooksArr) {
                            if (typeof fn === 'function') {
                                existingResource.hooks[event].push(fn.bind(existingResource));
                            }
                        }
                    }
                }
            }
            if (middlewares) {
                this._applyMiddlewares(existingResource, middlewares);
            }
            const disableEventsFlag = config.disableEvents !== undefined ? config.disableEvents : db.disableResourceEvents;
            existingResource.eventsDisabled = disableEventsFlag;
            const newHash = this.metadata.generateDefinitionHash(existingResource.export(), existingResource.behavior);
            const existingMetadata = db.savedMetadata?.resources?.[name];
            const currentVersion = existingMetadata?.currentVersion || 'v1';
            const existingVersionData = existingMetadata?.versions?.[currentVersion];
            if (!existingVersionData || existingVersionData.hash !== newHash) {
                await this.metadata.scheduleMetadataUpload();
            }
            db.emit('db:resource-updated', name);
            return existingResource;
        }
        const existingMetadata = db.savedMetadata?.resources?.[name];
        const version = existingMetadata?.currentVersion || 'v1';
        const resource = new Resource({
            name,
            client: db.client,
            version: config.version !== undefined ? config.version : version,
            attributes,
            behavior,
            passphrase: config.passphrase !== undefined ? config.passphrase : db.passphrase,
            bcryptRounds: config.bcryptRounds !== undefined ? config.bcryptRounds : db.bcryptRounds,
            observers: [db],
            cache: config.cache !== undefined ? config.cache : db.cache,
            timestamps: config.timestamps !== undefined ? config.timestamps : false,
            partitions: normalizedPartitions,
            paranoid: config.paranoid !== undefined ? config.paranoid : true,
            allNestedObjectsOptional: config.allNestedObjectsOptional !== undefined ? config.allNestedObjectsOptional : true,
            autoDecrypt: config.autoDecrypt !== undefined ? config.autoDecrypt : true,
            hooks: hooks || {},
            versioningEnabled: db.versioningEnabled,
            strictValidation: config.strictValidation !== undefined ? config.strictValidation : db.strictValidation,
            map: config.map,
            idGenerator: config.idGenerator,
            idSize: config.idSize,
            asyncEvents: config.asyncEvents,
            asyncPartitions: config.asyncPartitions !== undefined ? config.asyncPartitions : true,
            events: config.events || {},
            disableEvents: config.disableEvents !== undefined ? config.disableEvents : db.disableResourceEvents,
            createdBy: config.createdBy || 'user',
            api: config.api,
            description: config.description,
            lazySchema: config.lazySchema
        });
        resource.database = db;
        db._resourcesMap[name] = resource;
        if (middlewares) {
            this._applyMiddlewares(resource, middlewares);
        }
        await this.metadata.scheduleMetadataUpload();
        db.emit('db:resource-created', name);
        db.emit('db:resource:metrics', {
            resource: name,
            ...this.coordinators.collectMemorySnapshot()
        });
        return resource;
    }
    async listResources() {
        return Object.values(this.database.resources).map(r => r.export());
    }
    async getResource(name) {
        if (!this.database._resourcesMap[name]) {
            throw new ResourceNotFound({
                bucket: this.database.client.config?.bucket,
                resourceName: name,
                id: name
            });
        }
        return this.database._resourcesMap[name];
    }
    _normalizePartitions(partitions, attributes) {
        if (!Array.isArray(partitions)) {
            return partitions || {};
        }
        const normalized = {};
        for (const fieldName of partitions) {
            if (typeof fieldName !== 'string') {
                throw new SchemaError('Invalid partition field type', {
                    fieldName,
                    receivedType: typeof fieldName,
                    retriable: false,
                    suggestion: 'Use string field names when declaring partitions (e.g. ["status", "region"]).'
                });
            }
            if (!attributes[fieldName]) {
                throw new SchemaError(`Partition field '${fieldName}' not found in attributes`, {
                    fieldName,
                    availableFields: Object.keys(attributes),
                    retriable: false,
                    suggestion: 'Ensure the partition field exists in the resource attributes definition.'
                });
            }
            const partitionName = `by${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
            const fieldDef = attributes[fieldName];
            let fieldType = 'string';
            if (typeof fieldDef === 'string') {
                fieldType = fieldDef.split('|')[0].trim();
            }
            else if (typeof fieldDef === 'object' && fieldDef?.type) {
                fieldType = fieldDef.type;
            }
            normalized[partitionName] = {
                fields: {
                    [fieldName]: fieldType
                }
            };
        }
        return normalized;
    }
    _applyMiddlewares(resource, middlewares) {
        if (Array.isArray(middlewares)) {
            const methods = resource._middlewareMethods || [
                'get', 'list', 'listIds', 'getAll', 'count', 'page',
                'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
                'content', 'hasContent', 'query', 'getFromPartition', 'setContent',
                'deleteContent', 'replace', 'patch'
            ];
            for (const method of methods) {
                for (const middleware of middlewares) {
                    if (typeof middleware === 'function') {
                        resource.useMiddleware(method, middleware);
                    }
                }
            }
            return;
        }
        if (typeof middlewares === 'object' && middlewares !== null) {
            for (const [method, fns] of Object.entries(middlewares)) {
                if (method === '*') {
                    const methods = resource._middlewareMethods || [
                        'get', 'list', 'listIds', 'getAll', 'count', 'page',
                        'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
                        'content', 'hasContent', 'query', 'getFromPartition', 'setContent',
                        'deleteContent', 'replace', 'patch'
                    ];
                    const middlewareArray = Array.isArray(fns) ? fns : [fns];
                    for (const targetMethod of methods) {
                        for (const middleware of middlewareArray) {
                            if (typeof middleware === 'function') {
                                resource.useMiddleware(targetMethod, middleware);
                            }
                        }
                    }
                }
                else {
                    const middlewareArray = Array.isArray(fns) ? fns : [fns];
                    for (const middleware of middlewareArray) {
                        if (typeof middleware === 'function') {
                            resource.useMiddleware(method, middleware);
                        }
                    }
                }
            }
        }
    }
}
//# sourceMappingURL=database-resources.class.js.map