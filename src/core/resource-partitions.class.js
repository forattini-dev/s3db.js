import { join } from "path";
import tryFn from "../concerns/try-fn.js";
import { PartitionError, ResourceError } from "../errors.js";

/**
 * ResourcePartitions manages partition operations for a Resource.
 * Partitions enable O(1) lookups by creating secondary indexes based on field values.
 */
export class ResourcePartitions {
    /**
     * Create a new ResourcePartitions instance
     * @param {Object} resource - Parent Resource instance
     * @param {Object} config - Configuration options
     * @param {Object} [config.partitions={}] - Partition definitions
     * @param {boolean} [config.strictValidation=true] - Enable strict partition validation
     */
    constructor(resource, config = {}) {
        this.resource = resource;
        this._strictValidation = config.strictValidation !== false;
    }

    /**
     * Get partitions configuration from resource
     * @returns {Object} Partition definitions
     */
    getPartitions() {
        return this.resource.config?.partitions || {};
    }

    /**
     * Check if resource has any partitions
     * @returns {boolean}
     */
    hasPartitions() {
        const partitions = this.getPartitions();
        return partitions && Object.keys(partitions).length > 0;
    }

    /**
     * Setup automatic partition hooks for insert/delete operations
     * @param {Object} hooksModule - ResourceHooks instance to register hooks with
     */
    setupHooks(hooksModule) {
        if (!this.hasPartitions()) {
            return;
        }

        const hooks = hooksModule.getHooks();

        // Add afterInsert hook to create partition references
        if (!hooks.afterInsert) {
            hooks.afterInsert = [];
        }
        hooks.afterInsert.push(async (data) => {
            await this.createReferences(data);
            return data;
        });

        // Add afterDelete hook to clean up partition references
        if (!hooks.afterDelete) {
            hooks.afterDelete = [];
        }
        hooks.afterDelete.push(async (data) => {
            await this.deleteReferences(data);
            return data;
        });
    }

    /**
     * Validate that all partition fields exist in current resource attributes
     * @throws {PartitionError} If partition fields don't exist in current schema (only when strictValidation is true)
     */
    validate() {
        if (!this._strictValidation) {
            return;
        }

        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }

        const currentAttributes = Object.keys(this.resource.attributes || {});

        for (const [partitionName, partitionDef] of Object.entries(partitions)) {
            if (!partitionDef.fields) {
                continue;
            }

            for (const fieldName of Object.keys(partitionDef.fields)) {
                if (!this.fieldExistsInAttributes(fieldName)) {
                    throw new PartitionError(
                        `Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource attributes. Available fields: ${currentAttributes.join(', ')}.`,
                        {
                            resourceName: this.resource.name,
                            partitionName,
                            fieldName,
                            availableFields: currentAttributes,
                            operation: 'validatePartitions'
                        }
                    );
                }
            }
        }
    }

    /**
     * Check if a field (including nested fields) exists in the current attributes
     * @param {string} fieldName - Field name (can be nested like 'utm.source')
     * @returns {boolean} True if field exists
     */
    fieldExistsInAttributes(fieldName) {
        // Allow system metadata fields (those starting with _)
        if (fieldName.startsWith('_')) {
            return true;
        }

        // Handle simple field names (no dots)
        if (!fieldName.includes('.')) {
            return Object.keys(this.resource.attributes || {}).includes(fieldName);
        }

        // Handle nested field names using dot notation
        const keys = fieldName.split('.');
        let currentLevel = this.resource.attributes || {};

        for (const key of keys) {
            if (!currentLevel || typeof currentLevel !== 'object' || !(key in currentLevel)) {
                return false;
            }
            currentLevel = currentLevel[key];
        }

        return true;
    }

    /**
     * Find orphaned partitions (partitions that reference non-existent fields)
     * @returns {Object} Object with orphaned partition names as keys and details as values
     */
    findOrphaned() {
        const orphaned = {};
        const partitions = this.getPartitions();

        if (!partitions) {
            return orphaned;
        }

        for (const [partitionName, partitionDef] of Object.entries(partitions)) {
            if (!partitionDef.fields) {
                continue;
            }

            const missingFields = [];
            for (const fieldName of Object.keys(partitionDef.fields)) {
                if (!this.fieldExistsInAttributes(fieldName)) {
                    missingFields.push(fieldName);
                }
            }

            if (missingFields.length > 0) {
                orphaned[partitionName] = {
                    missingFields,
                    definition: partitionDef,
                    allFields: Object.keys(partitionDef.fields)
                };
            }
        }

        return orphaned;
    }

    /**
     * Remove orphaned partitions (partitions that reference non-existent fields)
     * WARNING: This will modify the resource configuration and should be followed by uploadMetadataFile()
     * @param {Object} options - Options
     * @param {boolean} options.dryRun - If true, only returns what would be removed without modifying (default: false)
     * @returns {Object} Object with removed partition names and details
     */
    removeOrphaned({ dryRun = false } = {}) {
        const orphaned = this.findOrphaned();

        if (Object.keys(orphaned).length === 0) {
            return {};
        }

        if (dryRun) {
            return orphaned;
        }

        // Remove orphaned partitions from config
        for (const partitionName of Object.keys(orphaned)) {
            delete this.resource.config.partitions[partitionName];
        }

        // Emit event for tracking
        this.resource.emit('orphanedPartitionsRemoved', {
            resourceName: this.resource.name,
            removed: orphaned,
            timestamp: new Date().toISOString()
        });

        return orphaned;
    }

    /**
     * Apply partition rule transformation to a value
     * @param {*} value - The field value
     * @param {string} rule - The partition rule
     * @returns {*} Transformed value
     */
    applyRule(value, rule) {
        if (value === undefined || value === null) {
            return value;
        }

        let transformedValue = value;

        // Apply maxlength rule manually
        if (typeof rule === 'string' && rule.includes('maxlength:')) {
            const maxLengthMatch = rule.match(/maxlength:(\d+)/);
            if (maxLengthMatch) {
                const maxLength = parseInt(maxLengthMatch[1]);
                if (typeof transformedValue === 'string' && transformedValue.length > maxLength) {
                    transformedValue = transformedValue.substring(0, maxLength);
                }
            }
        }

        // Format date values
        if (rule.includes('date')) {
            if (transformedValue instanceof Date) {
                transformedValue = transformedValue.toISOString().split('T')[0];
            } else if (typeof transformedValue === 'string') {
                if (transformedValue.includes('T') && transformedValue.includes('Z')) {
                    transformedValue = transformedValue.split('T')[0];
                } else {
                    const date = new Date(transformedValue);
                    if (!isNaN(date.getTime())) {
                        transformedValue = date.toISOString().split('T')[0];
                    }
                }
            }
        }

        return transformedValue;
    }

    /**
     * Get nested field value from data object using dot notation
     * @param {Object} data - Data object
     * @param {string} fieldPath - Field path (e.g., "utm.source", "address.city")
     * @returns {*} Field value
     */
    getNestedFieldValue(data, fieldPath) {
        if (!fieldPath.includes('.')) {
            return data[fieldPath];
        }

        const keys = fieldPath.split('.');
        let currentLevel = data;

        for (const key of keys) {
            if (!currentLevel || typeof currentLevel !== 'object' || !(key in currentLevel)) {
                return undefined;
            }
            currentLevel = currentLevel[key];
        }

        return currentLevel;
    }

    /**
     * Generate partition key for a resource in a specific partition
     * @param {Object} params - Partition key parameters
     * @param {string} params.partitionName - Name of the partition
     * @param {string} params.id - Resource ID
     * @param {Object} params.data - Resource data for partition value extraction
     * @returns {string|null} The partition key path or null if required fields are missing
     */
    getKey({ partitionName, id, data }) {
        const partitions = this.getPartitions();
        if (!partitions || !partitions[partitionName]) {
            throw new PartitionError(`Partition '${partitionName}' not found`, {
                resourceName: this.resource.name,
                partitionName,
                operation: 'getPartitionKey'
            });
        }

        const partition = partitions[partitionName];
        const partitionSegments = [];

        const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
        for (const [fieldName, rule] of sortedFields) {
            const fieldValue = this.getNestedFieldValue(data, fieldName);
            const transformedValue = this.applyRule(fieldValue, rule);

            if (transformedValue === undefined || transformedValue === null) {
                return null;
            }

            partitionSegments.push(`${fieldName}=${transformedValue}`);
        }

        if (partitionSegments.length === 0) {
            return null;
        }

        const finalId = id || data?.id;
        if (!finalId) {
            return null;
        }

        return join(`resource=${this.resource.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${finalId}`);
    }

    /**
     * Build partition prefix from partition definition and values
     * @param {string} partition - Partition name
     * @param {Object} partitionDef - Partition definition
     * @param {Object} partitionValues - Partition field values
     * @returns {string} Partition prefix
     */
    buildPrefix(partition, partitionDef, partitionValues) {
        const partitionSegments = [];
        const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));

        for (const [fieldName, rule] of sortedFields) {
            const value = partitionValues[fieldName];
            if (value !== undefined && value !== null) {
                const transformedValue = this.applyRule(value, rule);
                partitionSegments.push(`${fieldName}=${transformedValue}`);
            }
        }

        if (partitionSegments.length > 0) {
            return `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
        }

        return `resource=${this.resource.name}/partition=${partition}`;
    }

    /**
     * Extract partition values from S3 key for specific ID
     * @param {string} id - Resource ID
     * @param {Array<string>} keys - Array of S3 keys
     * @param {Array<[string, string]>} sortedFields - Sorted field entries
     * @returns {Object} Partition values extracted from key
     */
    extractValuesFromKey(id, keys, sortedFields) {
        const keyForId = keys.find(key => key.includes(`id=${id}`));
        if (!keyForId) {
            throw new PartitionError(`Partition key not found for ID ${id}`, {
                resourceName: this.resource.name,
                id,
                operation: 'extractPartitionValuesFromKey'
            });
        }

        const keyParts = keyForId.split('/');
        const actualPartitionValues = {};

        for (const [fieldName] of sortedFields) {
            const fieldPart = keyParts.find(part => part.startsWith(`${fieldName}=`));
            if (fieldPart) {
                const value = fieldPart.replace(`${fieldName}=`, '');
                actualPartitionValues[fieldName] = value;
            }
        }

        return actualPartitionValues;
    }

    /**
     * Create partition references after insert
     * @param {Object} data - Inserted object data
     */
    async createReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }

        const promises = Object.entries(partitions).map(async ([partitionName, partition]) => {
            const partitionKey = this.getKey({ partitionName, id: data.id, data });
            if (partitionKey) {
                const partitionMetadata = {
                    _v: String(this.resource.version)
                };
                return this.resource.client.putObject({
                    key: partitionKey,
                    metadata: partitionMetadata,
                    body: '',
                    contentType: undefined,
                });
            }
            return null;
        });

        const results = await Promise.allSettled(promises);

        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            this.resource.emit('partitionIndexWarning', {
                operation: 'create',
                id: data.id,
                failures: failures.map(f => f.reason)
            });
        }
    }

    /**
     * Delete partition references after delete
     * @param {Object} data - Deleted object data
     */
    async deleteReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }

        const keysToDelete = [];
        for (const [partitionName, partition] of Object.entries(partitions)) {
            const partitionKey = this.getKey({ partitionName, id: data.id, data });
            if (partitionKey) {
                keysToDelete.push(partitionKey);
            }
        }

        if (keysToDelete.length > 0) {
            await tryFn(() => this.resource.client.deleteObjects(keysToDelete));
        }
    }

    /**
     * Update partition references to keep them in sync
     * @param {Object} data - Updated object data
     */
    async updateReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }

        for (const [partitionName, partition] of Object.entries(partitions)) {
            if (!partition || !partition.fields || typeof partition.fields !== 'object') {
                continue;
            }

            const partitionKey = this.getKey({ partitionName, id: data.id, data });
            if (partitionKey) {
                const partitionMetadata = {
                    _v: String(this.resource.version)
                };
                await tryFn(async () => {
                    await this.resource.client.putObject({
                        key: partitionKey,
                        metadata: partitionMetadata,
                        body: '',
                        contentType: undefined,
                    });
                });
            }
        }
    }

    /**
     * Handle partition reference updates with change detection
     * @param {Object} oldData - Original object data before update
     * @param {Object} newData - Updated object data
     */
    async handleReferenceUpdates(oldData, newData) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }

        // Update all partitions in parallel
        const updatePromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
            const [ok, err] = await tryFn(() => this.handleReferenceUpdate(partitionName, partition, oldData, newData));
            if (!ok) {
                return { partitionName, error: err };
            }
            return { partitionName, success: true };
        });

        await Promise.allSettled(updatePromises);

        // Aggressive cleanup: remove stale partition keys in parallel
        const id = newData.id || oldData.id;
        const cleanupPromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
            const prefix = `resource=${this.resource.name}/partition=${partitionName}`;
            const [okKeys, errKeys, keys] = await tryFn(() => this.resource.client.getAllKeys({ prefix }));
            if (!okKeys) {
                return;
            }

            const validKey = this.getKey({ partitionName, id, data: newData });
            const staleKeys = keys.filter(key => key.endsWith(`/id=${id}`) && key !== validKey);

            if (staleKeys.length > 0) {
                await tryFn(() => this.resource.client.deleteObjects(staleKeys));
            }
        });

        await Promise.allSettled(cleanupPromises);
    }

    /**
     * Handle partition reference update for a specific partition
     * @param {string} partitionName - Name of the partition
     * @param {Object} partition - Partition definition
     * @param {Object} oldData - Original object data before update
     * @param {Object} newData - Updated object data
     */
    async handleReferenceUpdate(partitionName, partition, oldData, newData) {
        const id = newData.id || oldData.id;

        const oldPartitionKey = this.getKey({ partitionName, id, data: oldData });
        const newPartitionKey = this.getKey({ partitionName, id, data: newData });

        if (oldPartitionKey !== newPartitionKey) {
            // Delete old partition reference if it exists
            if (oldPartitionKey) {
                await tryFn(async () => {
                    await this.resource.client.deleteObject(oldPartitionKey);
                });
            }

            // Create new partition reference if new key exists
            if (newPartitionKey) {
                await tryFn(async () => {
                    const partitionMetadata = {
                        _v: String(this.resource.version)
                    };
                    await this.resource.client.putObject({
                        key: newPartitionKey,
                        metadata: partitionMetadata,
                        body: '',
                        contentType: undefined,
                    });
                });
            }
        } else if (newPartitionKey) {
            // If partition keys are the same, just update the existing reference
            await tryFn(async () => {
                const partitionMetadata = {
                    _v: String(this.resource.version)
                };
                await this.resource.client.putObject({
                    key: newPartitionKey,
                    metadata: partitionMetadata,
                    body: '',
                    contentType: undefined,
                });
            });
        }
    }

    /**
     * Get resource from partition with verification
     * @param {Object} params - Parameters
     * @param {string} params.id - Resource ID
     * @param {string} params.partitionName - Name of the partition
     * @param {Object} params.partitionValues - Values for partition fields
     * @returns {Promise<Object>} The resource object with partition metadata
     */
    async getFromPartition({ id, partitionName, partitionValues = {} }) {
        const partitions = this.getPartitions();
        if (!partitions || !partitions[partitionName]) {
            throw new PartitionError(`Partition '${partitionName}' not found`, {
                resourceName: this.resource.name,
                partitionName,
                operation: 'getFromPartition'
            });
        }

        const partition = partitions[partitionName];

        // Build partition key using provided values
        const partitionSegments = [];
        const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
        for (const [fieldName, rule] of sortedFields) {
            const value = partitionValues[fieldName];
            if (value !== undefined && value !== null) {
                const transformedValue = this.applyRule(value, rule);
                partitionSegments.push(`${fieldName}=${transformedValue}`);
            }
        }

        if (partitionSegments.length === 0) {
            throw new PartitionError(`No partition values provided for partition '${partitionName}'`, {
                resourceName: this.resource.name,
                partitionName,
                operation: 'getFromPartition'
            });
        }

        const partitionKey = join(
            `resource=${this.resource.name}`,
            `partition=${partitionName}`,
            ...partitionSegments,
            `id=${id}`
        );

        // Verify partition reference exists
        const [ok] = await tryFn(async () => {
            await this.resource.client.headObject(partitionKey);
        });
        if (!ok) {
            throw new ResourceError(`Resource with id '${id}' not found in partition '${partitionName}'`, {
                resourceName: this.resource.name,
                id,
                partitionName,
                operation: 'getFromPartition'
            });
        }

        // Get the actual data from the main resource object
        const data = await this.resource.get(id);

        // Add partition metadata
        data._partition = partitionName;
        data._partitionValues = partitionValues;

        this.resource._emitStandardized("partition-fetched", data, data.id);
        return data;
    }
}
