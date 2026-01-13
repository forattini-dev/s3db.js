import { join } from 'path';
import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { merge } from 'lodash-es';
import { AsyncEventEmitter } from './concerns/async-event-emitter.js';
import Schema from './schema.class.js';
import { ValidatorManager } from './validator.class.js';
import { ResourceValidator } from './core/resource-validator.class.js';
import { ResourceIdGenerator } from './core/resource-id-generator.class.js';
import { ResourceEvents } from './core/resource-events.class.js';
import { ResourceHooks } from './core/resource-hooks.class.js';
import { ResourceGuards } from './core/resource-guards.class.js';
import { ResourceMiddleware } from './core/resource-middleware.class.js';
import { ResourcePartitions } from './core/resource-partitions.class.js';
import { ResourceQuery } from './core/resource-query.class.js';
import { ResourceContent } from './core/resource-content.class.js';
import { ResourceStreams } from './core/resource-streams.class.js';
import { ResourcePersistence } from './core/resource-persistence.class.js';
import tryFn, { tryFnSync } from './concerns/try-fn.js';
import { getBehavior, DEFAULT_BEHAVIOR } from './behaviors/index.js';
import { idGenerator as defaultIdGenerator } from './concerns/id.js';
import { validateS3KeySegment } from './concerns/s3-key.js';
import { ResourceError, PartitionError } from './errors.js';
import { createLogger } from './concerns/logger.js';
import { validateResourceConfig } from './core/resource-config-validator.js';
export class Resource extends AsyncEventEmitter {
    name;
    client;
    version;
    logLevel;
    logger;
    behavior;
    _resourceAsyncEvents;
    observers;
    passphrase;
    bcryptRounds;
    versioningEnabled;
    strictValidation;
    asyncEvents;
    idGenerator;
    idSize;
    idGeneratorType;
    config;
    validator;
    schema;
    $schema;
    hooks;
    attributes;
    guard;
    eventsDisabled;
    database;
    map;
    _schemaRegistry;
    _pluginSchemaRegistry;
    _instanceId;
    _idGenerator;
    _hooksModule;
    _partitions;
    _eventsModule;
    _guards;
    _middleware;
    _query;
    _content;
    _streams;
    _persistence;
    constructor(config = {}) {
        super();
        this._instanceId = defaultIdGenerator(7);
        const validation = validateResourceConfig(config);
        if (!validation.isValid) {
            const errorDetails = validation.errors.map((err) => `  • ${err}`).join('\n');
            throw new ResourceError(`Invalid Resource ${config.name || '[unnamed]'} configuration:\n${errorDetails}`, {
                resourceName: config.name,
                validation: validation.errors,
            });
        }
        const { name, client, version = '1', attributes = {}, behavior = DEFAULT_BEHAVIOR, passphrase = 'secret', bcryptRounds = 10, observers = [], cache = false, autoEncrypt = true, autoDecrypt = true, timestamps = false, partitions = {}, paranoid = true, allNestedObjectsOptional = true, hooks = {}, idGenerator: customIdGenerator, idSize = 22, versioningEnabled = false, strictValidation = true, events = {}, asyncEvents = true, asyncPartitions = true, strictPartitions = false, createdBy = 'user', guard, schemaRegistry, pluginSchemaRegistry } = config;
        this.name = name;
        this.client = client;
        this.version = version;
        this.logLevel = (config.logLevel || config.client?.logLevel || config.database?.logger.level || 'info');
        if (config.database && config.database.getChildLogger) {
            this.logger = config.database.getChildLogger(`Resource:${name}`, { resource: name });
        }
        else if (config.database && config.database.logger) {
            this.logger = config.database.logger.child({ resource: name });
        }
        else {
            this.logger = createLogger({ name: `Resource:${name}`, level: this.logLevel });
        }
        this.behavior = behavior;
        this.observers = observers;
        this.passphrase = passphrase ?? 'secret';
        this.bcryptRounds = bcryptRounds;
        this.versioningEnabled = versioningEnabled;
        this.strictValidation = strictValidation;
        this.setAsyncMode(asyncEvents);
        this._resourceAsyncEvents = asyncEvents;
        this.asyncEvents = asyncEvents;
        this._idGenerator = new ResourceIdGenerator(this, {
            idGenerator: customIdGenerator,
            idSize
        });
        this.idGenerator = this._idGenerator.getGenerator();
        this.idSize = this._idGenerator.idSize;
        this.idGeneratorType = this._idGenerator.getType(customIdGenerator, this.idSize);
        Object.defineProperty(this, '_incrementalConfig', {
            get: () => this._idGenerator._incrementalConfig,
            enumerable: false,
            configurable: false
        });
        const normalizedPartitions = this._normalizePartitionsInput(partitions, attributes);
        this.config = {
            cache,
            hooks,
            paranoid,
            timestamps,
            partitions: normalizedPartitions,
            autoEncrypt,
            autoDecrypt,
            allNestedObjectsOptional,
            asyncEvents: this.asyncEvents,
            asyncPartitions,
            strictPartitions,
            createdBy,
        };
        this.validator = new ResourceValidator({
            attributes,
            strictValidation,
            allNestedObjectsOptional,
            passphrase: this.passphrase,
            bcryptRounds: this.bcryptRounds,
            autoEncrypt,
            autoDecrypt
        });
        // Fix: parse version to number for Schema
        const parsedVersion = parseInt(version.replace(/v/i, ''), 10) || 1;
        this._schemaRegistry = schemaRegistry;
        this._pluginSchemaRegistry = pluginSchemaRegistry;
        this.schema = new Schema({
            name,
            attributes,
            passphrase,
            bcryptRounds,
            version: parsedVersion,
            options: {
                allNestedObjectsOptional,
                autoEncrypt,
                autoDecrypt
            },
            schemaRegistry: this._schemaRegistry,
            pluginSchemaRegistry: this._pluginSchemaRegistry
        });
        this._schemaRegistry = this.schema.getSchemaRegistry() || this._schemaRegistry;
        this._pluginSchemaRegistry = this.schema.getPluginSchemaRegistry() || this._pluginSchemaRegistry;
        const { database: _db, observers: _obs, client: _cli, ...cloneableConfig } = config;
        this.$schema = { ...cloneableConfig };
        this.$schema._createdAt = Date.now();
        this.$schema._updatedAt = Date.now();
        Object.freeze(this.$schema);
        this._hooksModule = new ResourceHooks(this, {});
        this.hooks = this._hooksModule.getHooks();
        this.attributes = attributes || {};
        this._partitions = new ResourcePartitions(this, { strictValidation });
        this.map = config.map;
        this.applyConfiguration({ map: this.map });
        if (hooks) {
            for (const [event, hooksArr] of Object.entries(hooks)) {
                if (Array.isArray(hooksArr)) {
                    for (const fn of hooksArr) {
                        this._hooksModule.addHook(event, fn);
                    }
                }
            }
        }
        this._eventsModule = new ResourceEvents(this, {
            disableEvents: config.disableEvents,
            disableResourceEvents: config.disableResourceEvents,
            events
        });
        this.eventsDisabled = this._eventsModule.isDisabled();
        this._guards = new ResourceGuards(this, { guard });
        this.guard = this._guards.getGuard();
        this._middleware = new ResourceMiddleware(this);
        this._middleware.init();
        this._query = new ResourceQuery(this);
        this._content = new ResourceContent(this);
        this._streams = new ResourceStreams(this);
        this._persistence = new ResourcePersistence(this);
        this._initIncrementalIdGenerator();
    }
    _normalizePartitionsInput(partitions, attributes) {
        if (!Array.isArray(partitions)) {
            return partitions || {};
        }
        const normalized = {};
        for (const fieldName of partitions) {
            if (typeof fieldName !== 'string') {
                throw new PartitionError('Invalid partition field type', {
                    fieldName,
                    receivedType: typeof fieldName,
                    retriable: false,
                    suggestion: 'Use string field names when declaring partitions (e.g. ["status", "region"]).'
                });
            }
            if (!attributes || !attributes[fieldName]) {
                throw new PartitionError(`Partition field '${fieldName}' not found in attributes`, {
                    fieldName,
                    availableFields: attributes ? Object.keys(attributes) : [],
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
            else if (typeof fieldDef === 'object' && fieldDef !== null && fieldDef.type) {
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
    configureIdGenerator(customIdGenerator, idSize) {
        const tempGenerator = new ResourceIdGenerator(this, { idGenerator: customIdGenerator, idSize });
        return tempGenerator.getGenerator();
    }
    _initIncrementalIdGenerator() {
        this._idGenerator.initIncremental();
        this.idGenerator = this._idGenerator.getGenerator();
    }
    hasAsyncIdGenerator() {
        return this._idGenerator.isAsync();
    }
    getIdGeneratorType(customIdGenerator, idSize) {
        return this._idGenerator.getType(customIdGenerator, idSize);
    }
    export() {
        const exported = this.schema.export();
        exported.behavior = this.behavior;
        exported.timestamps = this.config.timestamps;
        exported.partitions = this.config.partitions || {};
        exported.paranoid = this.config.paranoid;
        exported.allNestedObjectsOptional = this.config.allNestedObjectsOptional;
        exported.autoDecrypt = this.config.autoDecrypt;
        exported.cache = this.config.cache;
        exported.hooks = this.hooks;
        exported.map = this.map;
        return exported;
    }
    applyConfiguration({ map } = {}) {
        if (this.config.timestamps) {
            if (!this.attributes.createdAt) {
                this.attributes.createdAt = 'string|optional';
            }
            if (!this.attributes.updatedAt) {
                this.attributes.updatedAt = 'string|optional';
            }
            if (!this.config.partitions) {
                this.config.partitions = {};
            }
            if (!this.config.partitions.byCreatedDate) {
                this.config.partitions.byCreatedDate = {
                    fields: {
                        createdAt: 'date|maxlength:10'
                    }
                };
            }
            if (!this.config.partitions.byUpdatedDate) {
                this.config.partitions.byUpdatedDate = {
                    fields: {
                        updatedAt: 'date|maxlength:10'
                    }
                };
            }
        }
        this.setupPartitionHooks();
        if (this.versioningEnabled) {
            if (!this.config.partitions.byVersion) {
                this.config.partitions.byVersion = {
                    fields: {
                        _v: 'string'
                    }
                };
            }
        }
        // Fix: parse version to number for Schema
        const parsedVersion = parseInt(this.version.replace(/v/i, ''), 10) || 1;
        this.schema = new Schema({
            name: this.name,
            attributes: this.attributes,
            passphrase: this.passphrase,
            bcryptRounds: this.bcryptRounds,
            version: parsedVersion,
            options: {
                autoEncrypt: this.config.autoEncrypt,
                autoDecrypt: this.config.autoDecrypt,
                allNestedObjectsOptional: this.config.allNestedObjectsOptional
            },
            map: map || this.map,
            schemaRegistry: this._schemaRegistry,
            pluginSchemaRegistry: this._pluginSchemaRegistry
        });
        this._schemaRegistry = this.schema.getSchemaRegistry() || this._schemaRegistry;
        this._pluginSchemaRegistry = this.schema.getPluginSchemaRegistry() || this._pluginSchemaRegistry;
        if (this.validator) {
            this.validator.updateSchema(this.attributes);
        }
        this.validatePartitions();
    }
    updateAttributes(newAttributes) {
        const oldAttributes = this.attributes;
        this.attributes = newAttributes;
        this.applyConfiguration();
        return { oldAttributes, newAttributes };
    }
    addPluginAttribute(name, definition, pluginName) {
        if (!pluginName) {
            throw new ResourceError('Plugin name is required when adding plugin attributes', { resource: this.name, attribute: name });
        }
        const existingDef = this.schema.getAttributeDefinition(name);
        if (existingDef && (!existingDef.__plugin__ || existingDef.__plugin__ !== pluginName)) {
            throw new ResourceError(`Attribute '${name}' already exists and is not from plugin '${pluginName}'`, { resource: this.name, attribute: name, plugin: pluginName });
        }
        let defObject = definition;
        if (typeof definition === 'object' && definition !== null) {
            defObject = { ...definition };
        }
        if (typeof defObject === 'object' && defObject !== null) {
            defObject.__plugin__ = pluginName;
            defObject.__pluginCreated__ = Date.now();
        }
        this.schema.attributes[name] = defObject;
        this.attributes[name] = defObject;
        if (typeof defObject === 'string') {
            if (!this.schema._pluginAttributeMetadata) {
                this.schema._pluginAttributeMetadata = {};
            }
            this.schema._pluginAttributeMetadata[name] = {
                __plugin__: pluginName,
                __pluginCreated__: Date.now()
            };
        }
        this.schema.regeneratePluginMapping();
        if (this.schema.options?.generateAutoHooks) {
            this.schema.generateAutoHooks();
        }
        const processedAttributes = this.schema.preprocessAttributesForValidation(this.schema.attributes);
        this.schema.validator = new ValidatorManager({ autoEncrypt: false }).compile(merge({ $$async: true, $$strict: false }, processedAttributes));
        if (this.database) {
            this.database.emit('plugin-attribute-added', {
                resource: this.name,
                attribute: name,
                plugin: pluginName,
                definition: defObject
            });
        }
    }
    removePluginAttribute(name, pluginName = null) {
        const attrDef = this.schema.getAttributeDefinition(name);
        const metadata = this.schema._pluginAttributeMetadata?.[name];
        const isPluginAttr = (typeof attrDef === 'object' && attrDef?.__plugin__) || metadata;
        if (!attrDef || !isPluginAttr) {
            return false;
        }
        const actualPlugin = attrDef?.__plugin__ || metadata?.__plugin__;
        if (pluginName && actualPlugin !== pluginName) {
            throw new ResourceError(`Attribute '${name}' belongs to plugin '${actualPlugin}', not '${pluginName}'`, { resource: this.name, attribute: name, actualPlugin, requestedPlugin: pluginName });
        }
        delete this.schema.attributes[name];
        delete this.attributes[name];
        if (this.schema._pluginAttributeMetadata?.[name]) {
            delete this.schema._pluginAttributeMetadata[name];
        }
        this.schema.regeneratePluginMapping();
        if (this.database) {
            this.database.emit('plugin-attribute-removed', {
                resource: this.name,
                attribute: name,
                plugin: actualPlugin
            });
        }
        return true;
    }
    addHook(event, fn) {
        this._hooksModule.addHook(event, fn);
    }
    async executeHooks(event, data) {
        return this._hooksModule.executeHooks(event, data);
    }
    _bindHook(fn) {
        return this._hooksModule._bindHook(fn);
    }
    setupPartitionHooks() {
        this._partitions.setupHooks(this._hooksModule);
    }
    async validate(data, options = {}) {
        return this.validator.validate(data, options);
    }
    validatePartitions() {
        this._partitions.validate();
    }
    fieldExistsInAttributes(fieldName) {
        return this._partitions.fieldExistsInAttributes(fieldName);
    }
    findOrphanedPartitions() {
        return this._partitions.findOrphaned();
    }
    removeOrphanedPartitions({ dryRun = false } = {}) {
        return this._partitions.removeOrphaned({ dryRun });
    }
    applyPartitionRule(value, rule) {
        return this._partitions.applyRule(value, rule);
    }
    getResourceKey(id) {
        validateS3KeySegment(id, 'id');
        const key = join('resource=' + this.name, 'data', `id=${id}`);
        return key;
    }
    getPartitionKey({ partitionName, id, data }) {
        return this._partitions.getKey({ partitionName, id, data });
    }
    getNestedFieldValue(data, fieldPath) {
        return this._partitions.getNestedFieldValue(data, fieldPath);
    }
    calculateContentLength(body) {
        if (!body)
            return 0;
        if (Buffer.isBuffer(body))
            return body.length;
        if (typeof body === 'string')
            return Buffer.byteLength(body, 'utf8');
        if (typeof body === 'object')
            return Buffer.byteLength(JSON.stringify(body), 'utf8');
        return Buffer.byteLength(String(body), 'utf8');
    }
    _emitStandardized(event, payload, id = null) {
        this._eventsModule.emitStandardized(event, payload, id);
    }
    _ensureEventsWired() {
        this._eventsModule.ensureWired();
    }
    on(eventName, listener) {
        this._eventsModule.on(eventName, listener);
        return this;
    }
    addListener(eventName, listener) {
        return this.on(eventName, listener);
    }
    once(eventName, listener) {
        this._eventsModule.once(eventName, listener);
        return this;
    }
    emit(eventName, ...args) {
        return this._eventsModule.emit(eventName, ...args);
    }
    async insert({ id, ...attributes }) {
        return this._persistence.insert({ id, ...attributes });
    }
    async get(id) {
        return this._persistence.get(id);
    }
    async getOrNull(id) {
        return this._persistence.getOrNull(id);
    }
    async getOrThrow(id) {
        return this._persistence.getOrThrow(id);
    }
    async exists(id) {
        return this._persistence.exists(id);
    }
    async update(id, attributes) {
        return this._persistence.update(id, attributes);
    }
    async patch(id, fields, options = {}) {
        return this._persistence.patch(id, fields, options);
    }
    async _patchViaCopyObject(id, fields, options = {}) {
        return this._persistence._patchViaCopyObject(id, fields, options);
    }
    async replace(id, fullData, options = {}) {
        return this._persistence.replace(id, fullData, options);
    }
    async updateConditional(id, attributes, options = {}) {
        return this._persistence.updateConditional(id, attributes, options);
    }
    async delete(id) {
        return this._persistence.delete(id);
    }
    async upsert({ id, ...attributes }) {
        return this._persistence.upsert({ id, ...attributes });
    }
    async count({ partition = null, partitionValues = {} } = {}) {
        return this._query.count({ partition, partitionValues });
    }
    async insertMany(objects) {
        return this._persistence.insertMany(objects);
    }
    async _executeBatchHelper(operations, options = {}) {
        return this._persistence._executeBatchHelper(operations, options);
    }
    async deleteMany(ids) {
        return this._persistence.deleteMany(ids);
    }
    async deleteAll() {
        return this._persistence.deleteAll();
    }
    async deleteAllData() {
        return this._persistence.deleteAllData();
    }
    async listIds({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        return this._query.listIds({ partition, partitionValues, limit, offset });
    }
    async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        return this._query.list({ partition, partitionValues, limit, offset });
    }
    async listMain({ limit, offset = 0 }) {
        return this._query.listMain({ limit, offset });
    }
    async listPartition({ partition, partitionValues, limit, offset = 0 }) {
        return this._query.listPartition({ partition, partitionValues, limit, offset });
    }
    buildPartitionPrefix(partition, partitionDef, partitionValues) {
        return this._partitions.buildPrefix(partition, partitionDef, partitionValues);
    }
    extractIdsFromKeys(keys) {
        return this._query.extractIdsFromKeys(keys);
    }
    async processListResults(ids, context = 'main') {
        return this._query.processListResults(ids, context);
    }
    async processPartitionResults(ids, partition, partitionDef, keys) {
        return this._query.processPartitionResults(ids, partition, partitionDef, keys);
    }
    extractPartitionValuesFromKey(id, keys, sortedFields) {
        return this._partitions.extractValuesFromKey(id, keys, sortedFields);
    }
    handleResourceError(error, id, context) {
        return this._query.handleResourceError(error, id, context);
    }
    handleListError(error, { partition, partitionValues }) {
        return this._query.handleListError(error, { partition, partitionValues });
    }
    async getMany(ids) {
        return this._query.getMany(ids);
    }
    async getAll() {
        return this._query.getAll();
    }
    async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
        const result = await this._query.page({ offset, size, partition, partitionValues, skipCount });
        return result;
    }
    readable() {
        return this._streams.readable();
    }
    writable() {
        return this._streams.writable();
    }
    async setContent({ id, buffer, contentType = 'application/octet-stream' }) {
        return this._content.setContent({ id, buffer, contentType });
    }
    async content(id) {
        return this._content.content(id);
    }
    async hasContent(id) {
        return this._content.hasContent(id);
    }
    async deleteContent(id) {
        return this._content.deleteContent(id);
    }
    getDefinitionHash() {
        const definition = {
            attributes: this.attributes,
            behavior: this.behavior
        };
        const stableString = jsonStableStringify(definition);
        return `sha256:${createHash('sha256').update(stableString).digest('hex')}`;
    }
    extractVersionFromKey(key) {
        const parts = key.split('/');
        const versionPart = parts.find(part => part.startsWith('v='));
        return versionPart ? versionPart.replace('v=', '') : null;
    }
    async getSchemaForVersion(version) {
        return this.schema;
    }
    async createPartitionReferences(data) {
        return this._partitions.createReferences(data);
    }
    async deletePartitionReferences(data) {
        return this._partitions.deleteReferences(data);
    }
    async query(filter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} } = {}) {
        return this._query.query(filter, { limit, offset, partition, partitionValues });
    }
    async handlePartitionReferenceUpdates(oldData, newData) {
        return this._partitions.handleReferenceUpdates(oldData, newData);
    }
    async handlePartitionReferenceUpdate(partitionName, partition, oldData, newData) {
        return this._partitions.handleReferenceUpdate(partitionName, partition, oldData, newData);
    }
    async updatePartitionReferences(data) {
        return this._partitions.updateReferences(data);
    }
    async getFromPartition({ id, partitionName, partitionValues = {} }) {
        return this._partitions.getFromPartition({ id, partitionName, partitionValues });
    }
    async createHistoricalVersion(id, data) {
        const historicalKey = join(`resource=${this.name}`, `historical`, `id=${id}`);
        const historicalData = {
            ...data,
            _v: data._v || this.version,
            _historicalTimestamp: new Date().toISOString()
        };
        const mappedData = await this.schema.mapper(historicalData);
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
            resource: this,
            data: historicalData,
            mappedData
        });
        const finalMetadata = {
            ...processedMetadata,
            _v: data._v || this.version,
            _historicalTimestamp: historicalData._historicalTimestamp
        };
        let contentType = undefined;
        if (body && body !== '') {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okParse)
                contentType = 'application/json';
        }
        await this.client.putObject({
            key: historicalKey,
            metadata: finalMetadata,
            body,
            contentType,
        });
    }
    async applyVersionMapping(data, fromVersion, toVersion) {
        if (fromVersion === toVersion) {
            return data;
        }
        const mappedData = {
            ...data,
            _v: toVersion,
            _originalVersion: fromVersion,
            _versionMapped: true
        };
        return mappedData;
    }
    async composeFullObjectFromWrite({ id, metadata, body, behavior }) {
        const behaviorFlags = {};
        if (metadata && metadata['$truncated'] === 'true') {
            behaviorFlags.$truncated = 'true';
        }
        if (metadata && metadata['$overflow'] === 'true') {
            behaviorFlags.$overflow = 'true';
        }
        let unmappedMetadata = {};
        const [ok, , unmapped] = await tryFn(() => this.schema.unmapper(metadata));
        unmappedMetadata = ok ? unmapped : metadata;
        const filterInternalFields = (obj) => {
            if (!obj || typeof obj !== 'object')
                return obj;
            const filtered = {};
            const pluginAttrNames = this.schema._pluginAttributes
                ? Object.values(this.schema._pluginAttributes).flat()
                : [];
            for (const [key, value] of Object.entries(obj)) {
                if (!key.startsWith('_') || key === '_geohash' || key.startsWith('_geohash_zoom') || pluginAttrNames.includes(key)) {
                    filtered[key] = value;
                }
            }
            return filtered;
        };
        const fixValue = (v) => {
            if (typeof v === 'object' && v !== null) {
                return v;
            }
            if (typeof v === 'string') {
                if (v === '[object Object]')
                    return {};
                if ((v.startsWith('{') || v.startsWith('['))) {
                    const [ok, , parsed] = tryFnSync(() => JSON.parse(v));
                    return ok ? parsed : v;
                }
                return v;
            }
            return v;
        };
        if (behavior === 'body-overflow') {
            const hasOverflow = metadata && metadata['$overflow'] === 'true';
            let bodyData = {};
            if (hasOverflow && body) {
                const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
                if (okBody) {
                    let pluginMapFromMeta = null;
                    if (metadata && metadata._pluginmap) {
                        const [okPluginMap, , parsedPluginMap] = await tryFn(() => Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap));
                        pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
                    }
                    const [okUnmap, , unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody, undefined, pluginMapFromMeta));
                    bodyData = okUnmap ? unmappedBody : {};
                }
            }
            const merged = { ...unmappedMetadata, ...bodyData, id };
            Object.keys(merged).forEach(k => { merged[k] = fixValue(merged[k]); });
            const result = filterInternalFields(merged);
            if (hasOverflow) {
                result.$overflow = 'true';
            }
            return result;
        }
        if (behavior === 'body-only') {
            const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(body ? JSON.parse(body) : {}));
            let mapFromMeta = this.schema.map;
            let pluginMapFromMeta = null;
            if (metadata && metadata._map) {
                const [okMap, , parsedMap] = await tryFn(() => Promise.resolve(typeof metadata._map === 'string' ? JSON.parse(metadata._map) : metadata._map));
                mapFromMeta = okMap ? parsedMap : this.schema.map;
            }
            if (metadata && metadata._pluginmap) {
                const [okPluginMap, , parsedPluginMap] = await tryFn(() => Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap));
                pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
            }
            const [okUnmap, , unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody, mapFromMeta, pluginMapFromMeta));
            const result = okUnmap ? { ...unmappedBody, id } : { id };
            Object.keys(result).forEach(k => { result[k] = fixValue(result[k]); });
            return result;
        }
        if (behavior === 'user-managed' && body && body.trim() !== '') {
            const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okBody) {
                let pluginMapFromMeta = null;
                if (metadata && metadata._pluginmap) {
                    const [okPluginMap, , parsedPluginMap] = await tryFn(() => Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap));
                    pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
                }
                const [okUnmap, , unmappedBodyRaw] = await tryFn(async () => this.schema.unmapper(parsedBody, undefined, pluginMapFromMeta));
                const unmappedBody = unmappedBodyRaw;
                const bodyData = okUnmap ? unmappedBody : {};
                const merged = { ...bodyData, ...unmappedMetadata, id };
                Object.keys(merged).forEach(k => { merged[k] = fixValue(merged[k]); });
                return filterInternalFields(merged);
            }
        }
        const result = { ...unmappedMetadata, id };
        Object.keys(result).forEach(k => { result[k] = fixValue(result[k]); });
        const filtered = filterInternalFields(result);
        if (behaviorFlags.$truncated) {
            filtered.$truncated = behaviorFlags.$truncated;
        }
        if (behaviorFlags.$overflow) {
            filtered.$overflow = behaviorFlags.$overflow;
        }
        return filtered;
    }
    _normalizeGuard(guard) {
        const tempGuards = new ResourceGuards(this, { guard });
        return tempGuards.getGuard();
    }
    async executeGuard(operation, context, resource = null) {
        return this._guards.execute(operation, context, resource);
    }
    _checkRolesScopes(requiredRolesScopes, user) {
        return this._guards._checkRolesScopes(requiredRolesScopes, user);
    }
    _initMiddleware() {
        if (!this._middleware) {
            this._middleware = new ResourceMiddleware(this);
        }
        this._middleware.init();
    }
    useMiddleware(method, fn) {
        this._middleware.use(method, fn);
    }
    applyDefaults(data) {
        return this.validator.applyDefaults(data);
    }
    async getSequenceValue(fieldName = 'id') {
        return this._idGenerator.getSequenceValue(fieldName);
    }
    async resetSequence(fieldName, value) {
        return this._idGenerator.resetSequence(fieldName, value);
    }
    async listSequences() {
        return this._idGenerator.listSequences();
    }
    async reserveIdBatch(count = 100) {
        return this._idGenerator.reserveIdBatch(count);
    }
    getBatchStatus(fieldName = 'id') {
        return this._idGenerator.getBatchStatus(fieldName);
    }
    releaseBatch(fieldName = 'id') {
        this._idGenerator.releaseBatch(fieldName);
    }
    dispose() {
        if (this.schema) {
            this.schema.dispose();
        }
        this.emit('resource:disposed', { resourceName: this.name });
        this.removeAllListeners();
    }
}
export default Resource;
//# sourceMappingURL=resource.class.js.map