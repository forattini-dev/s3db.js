import { Plugin } from './plugin.class.js';
import tryFn from '../concerns/try-fn.js';
import { FulltextError } from './fulltext.errors.js';
import { resolveResourceName } from './concerns/resource-names.js';
export class FullTextPlugin extends Plugin {
    indexResource = null;
    indexResourceName;
    config;
    indexes;
    dirtyIndexes;
    deletedIndexes;
    _indexResourceDescriptor;
    constructor(options = {}) {
        super(options);
        this.indexResource = null;
        const opts = this.options;
        const resourceNamesOption = opts.resourceNames || {};
        this._indexResourceDescriptor = {
            defaultName: 'plg_fulltext_indexes',
            override: resourceNamesOption.index || opts.indexResource
        };
        this.indexResourceName = this._resolveIndexResourceName();
        this.config = {
            minWordLength: opts.minWordLength || 3,
            maxResults: opts.maxResults || 100,
            logLevel: this.logLevel,
            ...opts
        };
        this.indexes = new Map();
        this.dirtyIndexes = new Set();
        this.deletedIndexes = new Set();
    }
    _resolveIndexResourceName() {
        return resolveResourceName('fulltext', this._indexResourceDescriptor, {
            namespace: this.namespace
        });
    }
    onNamespaceChanged() {
        this.indexResourceName = this._resolveIndexResourceName();
    }
    async onInstall() {
        const [ok, err, indexResource] = await tryFn(() => this.database.createResource({
            name: this.indexResourceName,
            attributes: {
                id: 'string|required',
                resourceName: 'string|required',
                fieldName: 'string|required',
                word: 'string|required',
                recordIds: 'json|required',
                count: 'number|required',
                lastUpdated: 'string|required'
            },
            partitions: {
                byResource: { fields: { resourceName: 'string' } }
            },
            behavior: 'body-overflow'
        }));
        if (ok) {
            this.indexResource = indexResource;
        }
        else if (this.database.resources[this.indexResourceName]) {
            this.indexResource = this.database.resources[this.indexResourceName] ?? null;
        }
        else {
            throw err;
        }
        await this.loadIndexes();
        this.installDatabaseHooks();
        this.installIndexingHooks();
    }
    async start() {
        // Plugin is ready
    }
    async stop() {
        await this.saveIndexes();
        this.removeDatabaseHooks();
    }
    isInternalResource(name) {
        return name === this.indexResourceName || name === 'plg_fulltext_indexes';
    }
    async loadIndexes() {
        if (!this.indexResource)
            return;
        const [ok, , allIndexes] = await tryFn(() => this.indexResource.getAll());
        if (ok && allIndexes) {
            for (const indexRecord of allIndexes) {
                const key = `${indexRecord.resourceName}:${indexRecord.fieldName}:${indexRecord.word}`;
                this.indexes.set(key, {
                    recordIds: indexRecord.recordIds || [],
                    count: indexRecord.count || 0
                });
            }
        }
    }
    async saveIndexes() {
        if (!this.indexResource)
            return;
        const [ok] = await tryFn(async () => {
            for (const key of this.deletedIndexes) {
                const [resourceName] = key.split(':');
                const [queryOk, , results] = await tryFn(() => this.indexResource.query({ resourceName }));
                if (queryOk && results) {
                    for (const index of results) {
                        const indexKey = `${index.resourceName}:${index.fieldName}:${index.word}`;
                        if (indexKey === key) {
                            await this.indexResource.delete(index.id);
                        }
                    }
                }
            }
            for (const key of this.dirtyIndexes) {
                const [resourceName, fieldName, word] = key.split(':');
                const data = this.indexes.get(key);
                if (!data)
                    continue;
                const [queryOk, , results] = await tryFn(() => this.indexResource.query({ resourceName }));
                let existingRecord = null;
                if (queryOk && results) {
                    existingRecord = results.find((index) => index.resourceName === resourceName &&
                        index.fieldName === fieldName &&
                        index.word === word) || null;
                }
                if (existingRecord) {
                    await this.indexResource.update(existingRecord.id, {
                        recordIds: data.recordIds,
                        count: data.count,
                        lastUpdated: new Date().toISOString()
                    });
                }
                else {
                    await this.indexResource.insert({
                        id: `index-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        resourceName,
                        fieldName,
                        word,
                        recordIds: data.recordIds,
                        count: data.count,
                        lastUpdated: new Date().toISOString()
                    });
                }
            }
            this.dirtyIndexes.clear();
            this.deletedIndexes.clear();
        });
    }
    installDatabaseHooks() {
        this.database.addHook('afterCreateResource', (resource) => {
            if (!this.isInternalResource(resource.name)) {
                this.installResourceHooks(resource);
            }
        });
    }
    removeDatabaseHooks() {
        this.database.removeHook('afterCreateResource', this.installResourceHooks.bind(this));
    }
    installIndexingHooks() {
        if (!this.database.pluginRegistry) {
            this.database.pluginRegistry = {};
        }
        this.database.pluginRegistry.fulltext = this;
        for (const resource of Object.values(this.database.resources)) {
            if (this.isInternalResource(resource.name))
                continue;
            this.installResourceHooks(resource);
        }
        if (!this.database._fulltextProxyInstalled) {
            this.database._previousCreateResourceForFullText = this.database.createResource;
            const self = this;
            this.database.createResource = async function (...args) {
                const resource = await this._previousCreateResourceForFullText(...args);
                if (this.pluginRegistry?.fulltext && !this.pluginRegistry.fulltext.isInternalResource(resource.name)) {
                    this.pluginRegistry.fulltext.installResourceHooks(resource);
                }
                return resource;
            };
            this.database._fulltextProxyInstalled = true;
        }
        for (const resource of Object.values(this.database.resources)) {
            if (!this.isInternalResource(resource.name)) {
                this.installResourceHooks(resource);
            }
        }
    }
    installResourceHooks(resource) {
        resource._insert = resource.insert;
        resource._insertMany = resource.insertMany;
        resource._update = resource.update;
        resource._delete = resource.delete;
        resource._deleteMany = resource.deleteMany;
        this.wrapResourceMethod(resource, 'insert', (async (result, args, methodName) => {
            const data = result;
            const id = data.id;
            this.indexRecord(resource.name, id, data).catch(() => { });
            return data;
        }));
        this.wrapResourceMethod(resource, 'insertMany', (async (result, args, methodName) => {
            const records = result;
            for (const data of records) {
                const id = data.id;
                this.indexRecord(resource.name, id, data).catch(() => { });
            }
            return records;
        }));
        this.wrapResourceMethod(resource, 'update', (async (result, args, methodName) => {
            const data = result;
            const [id] = args;
            this.removeRecordFromIndex(resource.name, id).catch(() => { });
            this.indexRecord(resource.name, id, data).catch(() => { });
            return data;
        }));
        this.wrapResourceMethod(resource, 'delete', async (result, args) => {
            const [id] = args;
            this.removeRecordFromIndex(resource.name, id).catch(() => { });
            return result;
        });
        this.wrapResourceMethod(resource, 'deleteMany', async (result, args) => {
            const [ids] = args;
            for (const id of ids) {
                this.removeRecordFromIndex(resource.name, id).catch(() => { });
            }
            return result;
        });
    }
    async indexRecord(resourceName, recordId, data) {
        const indexedFields = this.getIndexedFields(resourceName);
        if (!indexedFields || indexedFields.length === 0) {
            return;
        }
        for (const fieldName of indexedFields) {
            const fieldValue = this.getFieldValue(data, fieldName);
            if (!fieldValue) {
                continue;
            }
            const words = this.tokenize(fieldValue);
            for (const word of words) {
                if (word.length < this.config.minWordLength) {
                    continue;
                }
                const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
                const existing = this.indexes.get(key) || { recordIds: [], count: 0 };
                if (!existing.recordIds.includes(recordId)) {
                    existing.recordIds.push(recordId);
                    existing.count = existing.recordIds.length;
                }
                this.indexes.set(key, existing);
                this.dirtyIndexes.add(key);
            }
        }
    }
    async removeRecordFromIndex(resourceName, recordId) {
        for (const [key, data] of this.indexes.entries()) {
            if (key.startsWith(`${resourceName}:`)) {
                const index = data.recordIds.indexOf(recordId);
                if (index > -1) {
                    data.recordIds.splice(index, 1);
                    data.count = data.recordIds.length;
                    if (data.recordIds.length === 0) {
                        this.indexes.delete(key);
                        this.deletedIndexes.add(key);
                    }
                    else {
                        this.indexes.set(key, data);
                        this.dirtyIndexes.add(key);
                    }
                }
            }
        }
    }
    getFieldValue(data, fieldPath) {
        if (!fieldPath.includes('.')) {
            return data && data[fieldPath] !== undefined ? data[fieldPath] : null;
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
        return value;
    }
    tokenize(text) {
        if (!text)
            return [];
        const str = String(text).toLowerCase();
        return str
            .replace(/[^\w\s\u00C0-\u017F]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0);
    }
    getIndexedFields(resourceName) {
        if (this.config.fields) {
            if (Array.isArray(this.config.fields)) {
                return this.config.fields;
            }
            return this.config.fields[resourceName] || [];
        }
        const fieldMappings = {
            users: ['name', 'email'],
            products: ['name', 'description'],
            articles: ['title', 'content'],
        };
        return fieldMappings[resourceName] || [];
    }
    async search(resourceName, query, options = {}) {
        const { fields = null, limit = this.config.maxResults, offset = 0, exactMatch = false } = options;
        if (!query || query.trim().length === 0) {
            return [];
        }
        const searchWords = this.tokenize(query);
        const results = new Map();
        const searchFields = fields || this.getIndexedFields(resourceName);
        if (searchFields.length === 0) {
            return [];
        }
        for (const word of searchWords) {
            if (word.length < this.config.minWordLength)
                continue;
            for (const fieldName of searchFields) {
                if (exactMatch) {
                    const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
                    const indexData = this.indexes.get(key);
                    if (indexData) {
                        for (const recordId of indexData.recordIds) {
                            const currentScore = results.get(recordId) || 0;
                            results.set(recordId, currentScore + 1);
                        }
                    }
                }
                else {
                    for (const [key, indexData] of this.indexes.entries()) {
                        if (key.startsWith(`${resourceName}:${fieldName}:${word.toLowerCase()}`)) {
                            for (const recordId of indexData.recordIds) {
                                const currentScore = results.get(recordId) || 0;
                                results.set(recordId, currentScore + 1);
                            }
                        }
                    }
                }
            }
        }
        const sortedResults = Array.from(results.entries())
            .map(([recordId, score]) => ({ recordId, score }))
            .sort((a, b) => b.score - a.score)
            .slice(offset, offset + limit);
        return sortedResults;
    }
    async searchRecords(resourceName, query, options = {}) {
        const searchResults = await this.search(resourceName, query, options);
        if (searchResults.length === 0) {
            return [];
        }
        const resource = this.database.resources[resourceName];
        if (!resource) {
            throw new FulltextError(`Resource '${resourceName}' not found`, {
                operation: 'searchRecords',
                resourceName,
                query,
                availableResources: Object.keys(this.database.resources),
                suggestion: 'Check resource name or ensure resource is created before searching'
            });
        }
        const recordIds = searchResults.map(result => result.recordId);
        const records = await resource.getMany(recordIds);
        const result = records
            .filter(record => record && typeof record === 'object')
            .map(record => {
            const searchResult = searchResults.find(sr => sr.recordId === record.id);
            return {
                ...record,
                _searchScore: searchResult ? searchResult.score : 0
            };
        })
            .sort((a, b) => b._searchScore - a._searchScore);
        return result;
    }
    async rebuildIndex(resourceName) {
        const resource = this.database.resources[resourceName];
        if (!resource) {
            throw new FulltextError(`Resource '${resourceName}' not found`, {
                operation: 'rebuildIndex',
                resourceName,
                availableResources: Object.keys(this.database.resources),
                suggestion: 'Check resource name or ensure resource is created before rebuilding index'
            });
        }
        for (const [key] of this.indexes.entries()) {
            if (key.startsWith(`${resourceName}:`)) {
                this.indexes.delete(key);
            }
        }
        const allRecords = await resource.getAll();
        const batchSize = 100;
        for (let i = 0; i < allRecords.length; i += batchSize) {
            const batch = allRecords.slice(i, i + batchSize);
            for (const record of batch) {
                const [ok] = await tryFn(() => this.indexRecord(resourceName, record.id, record));
            }
        }
        await this.saveIndexes();
    }
    async getIndexStats() {
        const stats = {
            totalIndexes: this.indexes.size,
            resources: {},
            totalWords: 0
        };
        for (const [key, data] of this.indexes.entries()) {
            const [resourceName, fieldName] = key.split(':');
            if (!stats.resources[resourceName]) {
                stats.resources[resourceName] = {
                    fields: {},
                    totalRecords: new Set(),
                    totalWords: 0
                };
            }
            if (!stats.resources[resourceName].fields[fieldName]) {
                stats.resources[resourceName].fields[fieldName] = {
                    words: 0,
                    totalOccurrences: 0
                };
            }
            stats.resources[resourceName].fields[fieldName].words++;
            stats.resources[resourceName].fields[fieldName].totalOccurrences += data.count;
            stats.resources[resourceName].totalWords++;
            for (const recordId of data.recordIds) {
                stats.resources[resourceName].totalRecords.add(recordId);
            }
            stats.totalWords++;
        }
        for (const resourceName in stats.resources) {
            stats.resources[resourceName].totalRecords = stats.resources[resourceName].totalRecords.size;
        }
        return stats;
    }
    async rebuildAllIndexes(options = {}) {
        const { timeout } = options;
        if (timeout) {
            return Promise.race([
                this._rebuildAllIndexesInternal(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
            ]);
        }
        return this._rebuildAllIndexesInternal();
    }
    async _rebuildAllIndexesInternal() {
        const resourceNames = Object.keys(this.database.resources).filter(name => !this.isInternalResource(name));
        for (const resourceName of resourceNames) {
            const [ok] = await tryFn(() => this.rebuildIndex(resourceName));
        }
    }
    async clearIndex(resourceName) {
        for (const [key] of this.indexes.entries()) {
            if (key.startsWith(`${resourceName}:`)) {
                this.indexes.delete(key);
            }
        }
        await this.saveIndexes();
    }
    async clearAllIndexes() {
        this.indexes.clear();
        await this.saveIndexes();
    }
}
//# sourceMappingURL=fulltext.plugin.js.map