import { tryFn } from '../concerns/try-fn.js';
import { PartitionError } from '../errors.js';
export class ResourceQuery {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    get client() {
        return this.resource.client;
    }
    get partitions() {
        return this.resource.config?.partitions || {};
    }
    async count({ partition = null, partitionValues = {} } = {}) {
        await this.resource.executeHooks('beforeCount', { partition, partitionValues });
        let prefix;
        if (partition && Object.keys(partitionValues).length > 0) {
            const partitionDef = this.partitions[partition];
            if (!partitionDef) {
                throw new PartitionError(`Partition '${partition}' not found`, {
                    resourceName: this.resource.name,
                    partitionName: partition,
                    operation: 'count'
                });
            }
            const partitionSegments = [];
            const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
            for (const [fieldName, rule] of sortedFields) {
                const value = partitionValues[fieldName];
                if (value !== undefined && value !== null) {
                    const transformedValue = this.resource.applyPartitionRule(value, rule);
                    partitionSegments.push(`${fieldName}=${transformedValue}`);
                }
            }
            if (partitionSegments.length > 0) {
                prefix = `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
            }
            else {
                prefix = `resource=${this.resource.name}/partition=${partition}`;
            }
        }
        else {
            prefix = `resource=${this.resource.name}/data`;
        }
        const count = await this.client.count({ prefix });
        await this.resource.executeHooks('afterCount', { count, partition, partitionValues });
        this.resource._emitStandardized('count', count);
        return count;
    }
    async listIds({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        let prefix;
        if (partition && Object.keys(partitionValues).length > 0) {
            if (!this.partitions[partition]) {
                throw new PartitionError(`Partition '${partition}' not found`, {
                    resourceName: this.resource.name,
                    partitionName: partition,
                    operation: 'listIds'
                });
            }
            const partitionDef = this.partitions[partition];
            const partitionSegments = [];
            const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
            for (const [fieldName, rule] of sortedFields) {
                const value = partitionValues[fieldName];
                if (value !== undefined && value !== null) {
                    const transformedValue = this.resource.applyPartitionRule(value, rule);
                    partitionSegments.push(`${fieldName}=${transformedValue}`);
                }
            }
            if (partitionSegments.length > 0) {
                prefix = `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
            }
            else {
                prefix = `resource=${this.resource.name}/partition=${partition}`;
            }
        }
        else {
            prefix = `resource=${this.resource.name}/data`;
        }
        const keys = await this.client.getKeysPage({
            prefix,
            offset: offset,
            amount: limit || 1000,
        });
        const ids = keys.map((key) => {
            const parts = key.split('/');
            const idPart = parts.find(part => part.startsWith('id='));
            return idPart ? idPart.replace('id=', '') : null;
        }).filter((id) => id !== null);
        this.resource._emitStandardized('listed-ids', ids.length);
        return ids;
    }
    async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        await this.resource.executeHooks('beforeList', { partition, partitionValues, limit, offset });
        const [ok, err, result] = await tryFn(async () => {
            if (!partition) {
                return this.listMain({ limit, offset });
            }
            return this.listPartition({ partition, partitionValues, limit, offset });
        });
        if (!ok) {
            return this.handleListError(err, { partition, partitionValues });
        }
        return this.resource.executeHooks('afterList', result);
    }
    async listMain({ limit, offset = 0 }) {
        const [ok, err, ids] = await tryFn(() => this.listIds({ limit, offset }));
        if (!ok || !ids)
            throw err;
        const results = await this.processListResults(ids, 'main');
        this.resource._emitStandardized('list', { count: results.length, errors: 0 });
        return results;
    }
    async listPartition({ partition, partitionValues, limit, offset = 0 }) {
        if (!this.partitions[partition]) {
            this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 0 });
            return [];
        }
        const partitionDef = this.partitions[partition];
        const prefix = this.resource.buildPartitionPrefix(partition, partitionDef, partitionValues);
        const [ok, err, keys] = await tryFn(() => this.client.getKeysPage({
            prefix,
            offset,
            amount: limit || 1000
        }));
        if (!ok || !keys)
            throw err;
        const filteredIds = this.extractIdsFromKeys(keys);
        const results = await this.processPartitionResults(filteredIds, partition, partitionDef, keys);
        this.resource._emitStandardized('list', { partition, partitionValues, count: results.length, errors: 0 });
        return results;
    }
    extractIdsFromKeys(keys) {
        return keys
            .map(key => {
            const parts = key.split('/');
            const idPart = parts.find(part => part.startsWith('id='));
            return idPart ? idPart.replace('id=', '') : null;
        })
            .filter((id) => id !== null);
    }
    async processListResults(ids, context = 'main') {
        const operations = ids.map((id) => async () => {
            const [ok, err, result] = await tryFn(() => this.resource.get(id));
            if (ok && result) {
                return result;
            }
            return this.handleResourceError(err, id, context);
        });
        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, ids[index]);
                this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
            }
        });
        this.resource._emitStandardized('list', { count: results.length, errors: 0 });
        return results.filter((r) => r !== null);
    }
    async processPartitionResults(ids, partition, partitionDef, keys) {
        const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
        const operations = ids.map((id) => async () => {
            const [ok, err, result] = await tryFn(async () => {
                const actualPartitionValues = this.resource.extractPartitionValuesFromKey(id, keys, sortedFields);
                const data = await this.resource.get(id);
                data._partition = partition;
                data._partitionValues = actualPartitionValues;
                return data;
            });
            if (ok && result)
                return result;
            return this.handleResourceError(err, id, 'partition');
        });
        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, ids[index]);
                this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
            }
        });
        return results.filter((item) => item !== null);
    }
    handleResourceError(error, id, context) {
        if (error.message.includes('Cipher job failed') || error.message.includes('OperationError')) {
            return {
                id,
                _decryptionFailed: true,
                _error: error.message,
                ...(context === 'partition' && { _partition: context })
            };
        }
        throw error;
    }
    handleListError(error, { partition, partitionValues }) {
        if (error.message.includes("Partition '") && error.message.includes("' not found")) {
            this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 1 });
            return [];
        }
        this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 1 });
        return [];
    }
    async getMany(ids) {
        await this.resource.executeHooks('beforeGetMany', { ids });
        const operations = ids.map((id) => async () => {
            const [ok, err, data] = await tryFn(() => this.resource.get(id));
            if (ok && data)
                return data;
            const error = err;
            if (error.message.includes('Cipher job failed') || error.message.includes('OperationError')) {
                return {
                    id,
                    _decryptionFailed: true,
                    _error: error.message
                };
            }
            throw error;
        });
        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, ids[index]);
                this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
                return {
                    id: ids[index],
                    _error: error.message,
                    _decryptionFailed: error.message.includes('Cipher job failed') || error.message.includes('OperationError')
                };
            }
        });
        const finalResults = await this.resource.executeHooks('afterGetMany', results.filter((r) => r !== null));
        this.resource._emitStandardized('fetched-many', ids.length);
        return finalResults;
    }
    async getAll() {
        const [ok, err, ids] = await tryFn(() => this.listIds());
        if (!ok || !ids)
            throw err;
        const results = [];
        for (const id of ids) {
            const [ok2, , item] = await tryFn(() => this.resource.get(id));
            if (ok2 && item) {
                results.push(item);
            }
        }
        return results;
    }
    async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
        const [ok, err, result] = await tryFn(async () => {
            let totalItems = null;
            let totalPages = null;
            if (!skipCount) {
                const [okCount, , count] = await tryFn(() => this.count({ partition, partitionValues }));
                if (okCount && count !== undefined) {
                    totalItems = count;
                    totalPages = Math.ceil(totalItems / size);
                }
            }
            const page = Math.floor(offset / size);
            let items = [];
            if (size > 0) {
                const [okList, , listResult] = await tryFn(() => this.list({ partition, partitionValues, limit: size, offset }));
                items = okList && listResult ? listResult : [];
            }
            const pageResult = {
                items,
                totalItems,
                page,
                pageSize: size,
                totalPages,
                hasMore: items.length === size && (offset + size) < (totalItems || Infinity),
                _debug: {
                    requestedSize: size,
                    requestedOffset: offset,
                    actualItemsReturned: items.length,
                    skipCount,
                    hasTotalItems: totalItems !== null
                }
            };
            this.resource._emitStandardized('paginated', pageResult);
            return pageResult;
        });
        if (ok && result)
            return result;
        return {
            items: [],
            totalItems: null,
            page: Math.floor(offset / size),
            pageSize: size,
            totalPages: null,
            hasMore: false,
            _debug: {
                requestedSize: size,
                requestedOffset: offset,
                actualItemsReturned: 0,
                skipCount: skipCount,
                hasTotalItems: false,
                error: err.message
            }
        };
    }
    async query(filter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} } = {}) {
        await this.resource.executeHooks('beforeQuery', { filter, limit, offset, partition, partitionValues });
        if (Object.keys(filter).length === 0) {
            return await this.list({ partition, partitionValues, limit, offset });
        }
        const results = [];
        let currentOffset = offset;
        const batchSize = Math.min(limit, 50);
        while (results.length < limit) {
            const batch = await this.list({
                partition,
                partitionValues,
                limit: batchSize,
                offset: currentOffset
            });
            if (batch.length === 0) {
                break;
            }
            const filteredBatch = batch.filter(doc => {
                return Object.entries(filter).every(([key, value]) => {
                    return doc[key] === value;
                });
            });
            results.push(...filteredBatch);
            currentOffset += batchSize;
            if (batch.length < batchSize) {
                break;
            }
        }
        const finalResults = results.slice(0, limit);
        return await this.resource.executeHooks('afterQuery', finalResults);
    }
}
export default ResourceQuery;
//# sourceMappingURL=resource-query.class.js.map