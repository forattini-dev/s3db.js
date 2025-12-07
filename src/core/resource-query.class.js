import tryFn from "../concerns/try-fn.js";
import { PartitionError } from "../errors.js";

/**
 * ResourceQuery handles all query and list operations for a Resource.
 * Provides methods for counting, listing, paginating, and querying resources.
 */
export class ResourceQuery {
    /**
     * Create a new ResourceQuery instance
     * @param {Object} resource - Parent Resource instance
     */
    constructor(resource) {
        this.resource = resource;
    }

    /**
     * Get client from resource
     * @private
     */
    get client() {
        return this.resource.client;
    }

    /**
     * Get partitions config from resource
     * @private
     */
    get partitions() {
        return this.resource.config?.partitions || {};
    }

    /**
     * Count resources with optional partition filtering
     * @param {Object} params - Count parameters
     * @param {string} [params.partition] - Partition name to count from
     * @param {Object} [params.partitionValues] - Partition field values to filter by
     * @returns {Promise<number>} Count of matching resources
     */
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
            } else {
                prefix = `resource=${this.resource.name}/partition=${partition}`;
            }
        } else {
            prefix = `resource=${this.resource.name}/data`;
        }

        const count = await this.client.count({ prefix });

        await this.resource.executeHooks('afterCount', { count, partition, partitionValues });

        this.resource._emitStandardized("count", count);
        return count;
    }

    /**
     * List resource IDs with optional partition filtering and pagination
     * @param {Object} params - List parameters
     * @param {string} [params.partition] - Partition name to list from
     * @param {Object} [params.partitionValues] - Partition field values to filter by
     * @param {number} [params.limit] - Maximum number of results
     * @param {number} [params.offset=0] - Number of results to skip
     * @returns {Promise<string[]>} Array of resource IDs
     */
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
            } else {
                prefix = `resource=${this.resource.name}/partition=${partition}`;
            }
        } else {
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
        }).filter(Boolean);

        this.resource._emitStandardized("listed-ids", ids.length);
        return ids;
    }

    /**
     * List resources with optional partition filtering and pagination
     * @param {Object} params - List parameters
     * @param {string} [params.partition] - Partition name to list from
     * @param {Object} [params.partitionValues] - Partition field values to filter by
     * @param {number} [params.limit] - Maximum number of results
     * @param {number} [params.offset=0] - Number of results to skip
     * @returns {Promise<Object[]>} Array of resource objects
     */
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

    /**
     * List resources from main storage (no partition)
     * @param {Object} params - List parameters
     * @param {number} [params.limit] - Maximum number of results
     * @param {number} [params.offset=0] - Number of results to skip
     * @returns {Promise<Object[]>} Array of resource objects
     */
    async listMain({ limit, offset = 0 }) {
        const [ok, err, ids] = await tryFn(() => this.listIds({ limit, offset }));
        if (!ok) throw err;
        const results = await this.processListResults(ids, 'main');
        this.resource._emitStandardized("list", { count: results.length, errors: 0 });
        return results;
    }

    /**
     * List resources from a specific partition
     * @param {Object} params - List parameters
     * @param {string} params.partition - Partition name
     * @param {Object} params.partitionValues - Partition field values
     * @param {number} [params.limit] - Maximum number of results
     * @param {number} [params.offset=0] - Number of results to skip
     * @returns {Promise<Object[]>} Array of resource objects
     */
    async listPartition({ partition, partitionValues, limit, offset = 0 }) {
        if (!this.partitions[partition]) {
            this.resource._emitStandardized("list", { partition, partitionValues, count: 0, errors: 0 });
            return [];
        }

        const partitionDef = this.partitions[partition];
        const prefix = this.resource.buildPartitionPrefix(partition, partitionDef, partitionValues);

        const [ok, err, keys] = await tryFn(() => this.client.getKeysPage({
            prefix,
            offset,
            amount: limit || 1000
        }));

        if (!ok) throw err;

        const filteredIds = this.extractIdsFromKeys(keys);
        const results = await this.processPartitionResults(filteredIds, partition, partitionDef, keys);

        this.resource._emitStandardized("list", { partition, partitionValues, count: results.length, errors: 0 });
        return results;
    }

    /**
     * Extract IDs from S3 keys
     * @param {string[]} keys - Array of S3 keys
     * @returns {string[]} Array of extracted IDs
     */
    extractIdsFromKeys(keys) {
        return keys
            .map(key => {
                const parts = key.split('/');
                const idPart = parts.find(part => part.startsWith('id='));
                return idPart ? idPart.replace('id=', '') : null;
            })
            .filter(Boolean);
    }

    /**
     * Process list results with error handling
     * @param {string[]} ids - Array of resource IDs
     * @param {string} context - Context for error handling ('main' or 'partition')
     * @returns {Promise<Object[]>} Array of resource objects
     */
    async processListResults(ids, context = 'main') {
        const operations = ids.map((id) => async () => {
            const [ok, err, result] = await tryFn(() => this.resource.get(id));
            if (ok) {
                return result;
            }
            return this.handleResourceError(err, id, context);
        });

        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit("error", error, ids[index]);
                this.resource.observers.map((x) => x.emit("error", this.resource.name, error, ids[index]));
            }
        });

        this.resource._emitStandardized("list", { count: results.length, errors: 0 });
        return results.filter(r => r !== null);
    }

    /**
     * Process partition results with error handling
     * @param {string[]} ids - Array of resource IDs
     * @param {string} partition - Partition name
     * @param {Object} partitionDef - Partition definition
     * @param {string[]} keys - Array of S3 keys
     * @returns {Promise<Object[]>} Array of resource objects
     */
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
            if (ok) return result;
            return this.handleResourceError(err, id, 'partition');
        });

        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit("error", error, ids[index]);
                this.resource.observers.map((x) => x.emit("error", this.resource.name, error, ids[index]));
            }
        });

        return results.filter(item => item !== null);
    }

    /**
     * Handle resource-specific errors
     * @param {Error} error - Error object
     * @param {string} id - Resource ID
     * @param {string} context - Context for error handling
     * @returns {Object|never} Error placeholder or throws
     */
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

    /**
     * Handle list method errors
     * @param {Error} error - Error object
     * @param {Object} params - List parameters
     * @returns {Array} Empty array for partition not found errors
     */
    handleListError(error, { partition, partitionValues }) {
        if (error.message.includes("Partition '") && error.message.includes("' not found")) {
            this.resource._emitStandardized("list", { partition, partitionValues, count: 0, errors: 1 });
            return [];
        }
        this.resource._emitStandardized("list", { partition, partitionValues, count: 0, errors: 1 });
        return [];
    }

    /**
     * Get multiple resources by their IDs
     * @param {string[]} ids - Array of resource IDs
     * @returns {Promise<Object[]>} Array of resource objects
     */
    async getMany(ids) {
        await this.resource.executeHooks('beforeGetMany', { ids });

        const operations = ids.map((id) => async () => {
            const [ok, err, data] = await tryFn(() => this.resource.get(id));
            if (ok) return data;
            if (err.message.includes('Cipher job failed') || err.message.includes('OperationError')) {
                return {
                    id,
                    _decryptionFailed: true,
                    _error: err.message
                };
            }
            throw err;
        });

        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit("error", error, ids[index]);
                this.resource.observers.map((x) => x.emit("error", this.resource.name, error, ids[index]));
                return {
                    id: ids[index],
                    _error: error.message,
                    _decryptionFailed: error.message.includes('Cipher job failed') || error.message.includes('OperationError')
                };
            }
        });

        const finalResults = await this.resource.executeHooks('afterGetMany', results.filter(r => r !== null));

        this.resource._emitStandardized("fetched-many", ids.length);
        return finalResults;
    }

    /**
     * Get all resources (equivalent to list() without pagination)
     * @returns {Promise<Object[]>} Array of all resource objects
     */
    async getAll() {
        const [ok, err, ids] = await tryFn(() => this.listIds());
        if (!ok) throw err;
        const results = [];
        for (const id of ids) {
            const [ok2, , item] = await tryFn(() => this.resource.get(id));
            if (ok2) {
                results.push(item);
            }
        }
        return results;
    }

    /**
     * Get a page of resources with pagination metadata
     * @param {Object} params - Page parameters
     * @param {number} [params.offset=0] - Offset for pagination
     * @param {number} [params.size=100] - Page size
     * @param {string} [params.partition] - Partition name to page from
     * @param {Object} [params.partitionValues] - Partition field values to filter by
     * @param {boolean} [params.skipCount=false] - Skip total count for performance
     * @returns {Promise<Object>} Page result with items and pagination info
     */
    async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
        const [ok, err, result] = await tryFn(async () => {
            let totalItems = null;
            let totalPages = null;
            if (!skipCount) {
                const [okCount, , count] = await tryFn(() => this.count({ partition, partitionValues }));
                if (okCount) {
                    totalItems = count;
                    totalPages = Math.ceil(totalItems / size);
                }
            }

            const page = Math.floor(offset / size);
            let items = [];
            if (size > 0) {
                const [okList, , listResult] = await tryFn(() => this.list({ partition, partitionValues, limit: size, offset }));
                items = okList ? listResult : [];
            }

            const result = {
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
            this.resource._emitStandardized("paginated", result);
            return result;
        });

        if (ok) return result;
        return {
            items: [],
            totalItems: null,
            page: Math.floor(offset / size),
            pageSize: size,
            totalPages: null,
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

    /**
     * Query resources with simple filtering and pagination
     * @param {Object} filter - Filter criteria (exact field matches)
     * @param {Object} options - Query options
     * @param {number} [options.limit=100] - Maximum number of results
     * @param {number} [options.offset=0] - Offset for pagination
     * @param {string} [options.partition] - Partition name to query from
     * @param {Object} [options.partitionValues] - Partition field values to filter by
     * @returns {Promise<Object[]>} Array of filtered resource objects
     */
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
