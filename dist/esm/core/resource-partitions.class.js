import { join } from 'path';
import { tryFn } from '../concerns/try-fn.js';
import { PartitionError, ResourceError } from '../errors.js';
export class ResourcePartitions {
    resource;
    _strictValidation;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._strictValidation = config.strictValidation !== false;
    }
    getPartitions() {
        return this.resource.config?.partitions || {};
    }
    hasPartitions() {
        const partitions = this.getPartitions();
        return partitions && Object.keys(partitions).length > 0;
    }
    setupHooks(hooksModule) {
        if (!this.hasPartitions()) {
            return;
        }
        const hooks = hooksModule.getHooks();
        if (!hooks.afterInsert) {
            hooks.afterInsert = [];
        }
        hooks.afterInsert.push(async (data) => {
            await this.createReferences(data);
            return data;
        });
        if (!hooks.afterDelete) {
            hooks.afterDelete = [];
        }
        hooks.afterDelete.push(async (data) => {
            await this.deleteReferences(data);
            return data;
        });
    }
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
                    throw new PartitionError(`Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource attributes. Available fields: ${currentAttributes.join(', ')}.`, {
                        resourceName: this.resource.name,
                        partitionName,
                        fieldName,
                        availableFields: currentAttributes,
                        operation: 'validatePartitions'
                    });
                }
            }
        }
    }
    fieldExistsInAttributes(fieldName) {
        if (fieldName.startsWith('_')) {
            return true;
        }
        if (!fieldName.includes('.')) {
            return Object.keys(this.resource.attributes || {}).includes(fieldName);
        }
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
    removeOrphaned({ dryRun = false } = {}) {
        const orphaned = this.findOrphaned();
        if (Object.keys(orphaned).length === 0) {
            return {};
        }
        if (dryRun) {
            return orphaned;
        }
        for (const partitionName of Object.keys(orphaned)) {
            delete this.resource.config.partitions[partitionName];
        }
        this.resource.emit('orphanedPartitionsRemoved', {
            resourceName: this.resource.name,
            removed: orphaned,
            timestamp: new Date().toISOString()
        });
        return orphaned;
    }
    applyRule(value, rule) {
        if (value === undefined || value === null) {
            return value;
        }
        let transformedValue = value;
        if (typeof rule === 'string' && rule.includes('maxlength:')) {
            const maxLengthMatch = rule.match(/maxlength:(\d+)/);
            if (maxLengthMatch) {
                const maxLength = parseInt(maxLengthMatch[1], 10);
                if (typeof transformedValue === 'string' && transformedValue.length > maxLength) {
                    transformedValue = transformedValue.substring(0, maxLength);
                }
            }
        }
        if (rule.includes('date')) {
            if (transformedValue instanceof Date) {
                transformedValue = transformedValue.toISOString().split('T')[0];
            }
            else if (typeof transformedValue === 'string') {
                if (transformedValue.includes('T') && transformedValue.includes('Z')) {
                    transformedValue = transformedValue.split('T')[0];
                }
                else {
                    const date = new Date(transformedValue);
                    if (!isNaN(date.getTime())) {
                        transformedValue = date.toISOString().split('T')[0];
                    }
                }
            }
        }
        return transformedValue;
    }
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
    async createReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        const promises = Object.entries(partitions).map(async ([partitionName]) => {
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
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
            this.resource.emit('partitionIndexWarning', {
                operation: 'create',
                id: data.id,
                failures: failures.map(f => f.reason)
            });
        }
    }
    async deleteReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        const keysToDelete = [];
        for (const [partitionName] of Object.entries(partitions)) {
            const partitionKey = this.getKey({ partitionName, id: data.id, data });
            if (partitionKey) {
                keysToDelete.push(partitionKey);
            }
        }
        if (keysToDelete.length > 0) {
            await tryFn(() => this.resource.client.deleteObjects(keysToDelete));
        }
    }
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
    async handleReferenceUpdates(oldData, newData) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        const updatePromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
            const [ok, err] = await tryFn(() => this.handleReferenceUpdate(partitionName, partition, oldData, newData));
            if (!ok) {
                return { partitionName, error: err };
            }
            return { partitionName, success: true };
        });
        await Promise.allSettled(updatePromises);
        const id = newData.id || oldData.id;
        const cleanupPromises = Object.entries(partitions).map(async ([partitionName]) => {
            const prefix = `resource=${this.resource.name}/partition=${partitionName}`;
            const [okKeys, , keys] = await tryFn(() => this.resource.client.getAllKeys({ prefix }));
            if (!okKeys || !keys) {
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
    async handleReferenceUpdate(partitionName, partition, oldData, newData) {
        const id = newData.id || oldData.id;
        const oldPartitionKey = this.getKey({ partitionName, id, data: oldData });
        const newPartitionKey = this.getKey({ partitionName, id, data: newData });
        if (oldPartitionKey !== newPartitionKey) {
            if (oldPartitionKey) {
                await tryFn(async () => {
                    await this.resource.client.deleteObject(oldPartitionKey);
                });
            }
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
        }
        else if (newPartitionKey) {
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
        const partitionKey = join(`resource=${this.resource.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
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
        const data = await this.resource.get(id);
        data._partition = partitionName;
        data._partitionValues = partitionValues;
        this.resource._emitStandardized('partition-fetched', data, data.id);
        return data;
    }
}
export default ResourcePartitions;
//# sourceMappingURL=resource-partitions.class.js.map