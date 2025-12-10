import { Plugin } from './plugin.class.js';
import { getValidatedNamespace } from './namespace.js';
import tryFn from '../concerns/try-fn.js';
import { resolveResourceName } from './concerns/resource-names.js';
import { createLogger } from '../concerns/logger.js';
export class AuditPlugin extends Plugin {
    auditResource;
    _auditResourceDescriptor;
    auditResourceName;
    config;
    getCurrentUserId;
    constructor(options = {}) {
        super(options);
        this.namespace = getValidatedNamespace(this.options, '');
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = (this.logLevel || 'info');
            this.logger = createLogger({ name: 'AuditPlugin', level: logLevel });
        }
        const { resourceNames = {}, resourceName, includeData = true, includePartitions = true, maxDataSize = 10000 } = this.options;
        this.auditResource = null;
        this._auditResourceDescriptor = {
            defaultName: 'plg_audits',
            override: resourceNames.audit || resourceName
        };
        this.auditResourceName = this._resolveAuditResourceName();
        this.config = {
            includeData,
            includePartitions,
            maxDataSize,
            logLevel: this.logLevel
        };
    }
    _resolveAuditResourceName() {
        return resolveResourceName('audit', this._auditResourceDescriptor, {
            namespace: this.namespace
        });
    }
    onNamespaceChanged() {
        this.auditResourceName = this._resolveAuditResourceName();
    }
    async onInstall() {
        const [ok, , auditResource] = await tryFn(() => this.database.createResource({
            name: this.auditResourceName,
            attributes: {
                id: 'string|required',
                resourceName: 'string|required',
                operation: 'string|required',
                recordId: 'string|required',
                userId: 'string|optional',
                timestamp: 'string|required',
                createdAt: 'string|required',
                oldData: 'string|optional',
                newData: 'string|optional',
                partition: 'string|optional',
                partitionValues: 'string|optional',
                metadata: 'string|optional'
            },
            partitions: {
                byDate: { fields: { createdAt: 'string|maxlength:10' } },
                byResource: { fields: { resourceName: 'string' } }
            },
            behavior: 'body-overflow'
        }));
        this.auditResource = ok ? auditResource : (this.database.resources[this.auditResourceName] || null);
        if (!ok && !this.auditResource)
            return;
        this.database.addHook('afterCreateResource', (context) => {
            if (context.resource.name !== this.auditResourceName) {
                this.setupResourceAuditing(context.resource);
            }
        });
        for (const resource of Object.values(this.database.resources)) {
            if (resource.name !== this.auditResourceName) {
                this.setupResourceAuditing(resource);
            }
        }
    }
    async onStart() {
        // Ready
    }
    async onStop() {
        // No cleanup needed
    }
    setupResourceAuditing(resource) {
        resource.on('inserted', async (data) => {
            const record = data;
            const partitionValues = this.config.includePartitions ? this.getPartitionValues(record, resource) : null;
            await this.logAudit({
                resourceName: resource.name,
                operation: 'insert',
                recordId: record.id || 'auto-generated',
                oldData: null,
                newData: this.config.includeData ? JSON.stringify(this.truncateData(record)) : null,
                partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
                partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
            });
        });
        resource.on('updated', async (data) => {
            const record = data;
            let oldData = record.$before;
            if (this.config.includeData && !oldData) {
                const [fetchOk, , fetched] = await tryFn(() => resource.get(record.id));
                if (fetchOk)
                    oldData = fetched;
            }
            const partitionValues = this.config.includePartitions ? this.getPartitionValues(record, resource) : null;
            await this.logAudit({
                resourceName: resource.name,
                operation: 'update',
                recordId: record.id,
                oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
                newData: this.config.includeData ? JSON.stringify(this.truncateData(record)) : null,
                partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
                partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
            });
        });
        resource.on('deleted', async (data) => {
            const record = data;
            let oldData = record;
            if (this.config.includeData && !oldData) {
                const [fetchOk, , fetched] = await tryFn(() => resource.get(record.id));
                if (fetchOk)
                    oldData = fetched;
            }
            const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;
            await this.logAudit({
                resourceName: resource.name,
                operation: 'delete',
                recordId: record.id,
                oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
                newData: null,
                partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
                partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
            });
        });
        const originalDeleteMany = resource.deleteMany.bind(resource);
        const plugin = this;
        resource.deleteMany = async function (ids) {
            const objectsToDelete = [];
            for (const id of ids) {
                const [fetchOk, , fetched] = await tryFn(() => resource.get(id));
                if (fetchOk && fetched) {
                    objectsToDelete.push(fetched);
                }
                else {
                    objectsToDelete.push({ id });
                }
            }
            const result = await originalDeleteMany(ids);
            for (const oldData of objectsToDelete) {
                const partitionValues = oldData && plugin.config.includePartitions ? plugin.getPartitionValues(oldData, resource) : null;
                await plugin.logAudit({
                    resourceName: resource.name,
                    operation: 'deleteMany',
                    recordId: oldData.id,
                    oldData: oldData && plugin.config.includeData ? JSON.stringify(plugin.truncateData(oldData)) : null,
                    newData: null,
                    partition: partitionValues ? plugin.getPrimaryPartition(partitionValues) : null,
                    partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
                });
            }
            return result;
        };
        resource._originalDeleteMany = originalDeleteMany;
    }
    async logAudit(auditData) {
        if (!this.auditResource) {
            return;
        }
        const now = new Date();
        const auditRecord = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            userId: this.getCurrentUserId?.() || 'system',
            timestamp: now.toISOString(),
            createdAt: now.toISOString().slice(0, 10),
            metadata: JSON.stringify({ source: 'audit-plugin', version: '2.0' }),
            resourceName: auditData.resourceName,
            operation: auditData.operation,
            recordId: auditData.recordId
        };
        if (auditData.oldData !== null) {
            auditRecord.oldData = auditData.oldData;
        }
        if (auditData.newData !== null) {
            auditRecord.newData = auditData.newData;
        }
        if (auditData.partition !== null) {
            auditRecord.partition = auditData.partition;
        }
        if (auditData.partitionValues !== null) {
            auditRecord.partitionValues = auditData.partitionValues;
        }
        try {
            await this.auditResource.insert(auditRecord);
        }
        catch (error) {
            this.logger.warn({ error: error.message, resourceName: auditData.resourceName, recordId: auditData.recordId }, `Audit logging failed: ${error.message}`);
        }
    }
    getPartitionValues(data, resource) {
        if (!this.config.includePartitions)
            return {};
        const partitions = resource.$schema?.partitions;
        if (!partitions) {
            return {};
        }
        const partitionValues = {};
        for (const [partitionName, partitionConfig] of Object.entries(partitions)) {
            const values = {};
            for (const field of Object.keys(partitionConfig.fields)) {
                values[field] = this.getNestedFieldValue(data, field);
            }
            if (Object.values(values).some(v => v !== undefined && v !== null)) {
                partitionValues[partitionName] = values;
            }
        }
        return partitionValues;
    }
    getNestedFieldValue(data, fieldPath) {
        const parts = fieldPath.split('.');
        let value = data;
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            }
            else {
                return undefined;
            }
        }
        return value;
    }
    getPrimaryPartition(partitionValues) {
        if (!partitionValues)
            return null;
        const partitionNames = Object.keys(partitionValues);
        return partitionNames.length > 0 ? (partitionNames[0] ?? null) : null;
    }
    truncateData(data) {
        if (!this.config.includeData)
            return null;
        const dataStr = JSON.stringify(data);
        if (dataStr.length <= this.config.maxDataSize) {
            return data;
        }
        return {
            ...data,
            _truncated: true,
            _originalSize: dataStr.length,
            _truncatedAt: new Date().toISOString()
        };
    }
    async getAuditLogs(options = {}) {
        if (!this.auditResource)
            return [];
        const { resourceName, operation, recordId, partition, startDate, endDate, limit = 100, offset = 0 } = options;
        let items = [];
        if (resourceName && !operation && !recordId && !partition && !startDate && !endDate) {
            const [ok, , result] = await tryFn(() => this.auditResource.query({ resourceName }, { limit: limit + offset }));
            items = ok && result ? result : [];
            return items.slice(offset, offset + limit);
        }
        else if (startDate && !resourceName && !operation && !recordId && !partition) {
            const dates = this._generateDateRange(startDate, endDate);
            for (const date of dates) {
                const [ok, , result] = await tryFn(() => this.auditResource.query({ createdAt: date }));
                if (ok && result) {
                    items.push(...result);
                }
            }
            return items.slice(offset, offset + limit);
        }
        else if (resourceName || operation || recordId || partition || startDate || endDate) {
            const fetchSize = Math.min(10000, Math.max(1000, (limit + offset) * 20));
            const result = await this.auditResource.list({ limit: fetchSize });
            items = (result || []);
            if (resourceName) {
                items = items.filter(log => log.resourceName === resourceName);
            }
            if (operation) {
                items = items.filter(log => log.operation === operation);
            }
            if (recordId) {
                items = items.filter(log => log.recordId === recordId);
            }
            if (partition) {
                items = items.filter(log => log.partition === partition);
            }
            if (startDate || endDate) {
                items = items.filter(log => {
                    const timestamp = new Date(log.timestamp);
                    if (startDate && timestamp < new Date(startDate))
                        return false;
                    if (endDate && timestamp > new Date(endDate))
                        return false;
                    return true;
                });
            }
            return items.slice(offset, offset + limit);
        }
        else {
            const result = await this.auditResource.page({ size: limit, offset });
            return (result.items || []);
        }
    }
    _generateDateRange(startDate, endDate) {
        const dates = [];
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date();
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().slice(0, 10));
        }
        return dates;
    }
    async getRecordHistory(resourceName, recordId) {
        return await this.getAuditLogs({ resourceName, recordId });
    }
    async getPartitionHistory(resourceName, partitionName, partitionValues) {
        return await this.getAuditLogs({
            resourceName,
            partition: partitionName
        });
    }
    async getAuditStats(options = {}) {
        const logs = await this.getAuditLogs(options);
        const stats = {
            total: logs.length,
            byOperation: {},
            byResource: {},
            byPartition: {},
            byUser: {},
            timeline: {}
        };
        for (const log of logs) {
            stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
            stats.byResource[log.resourceName] = (stats.byResource[log.resourceName] || 0) + 1;
            if (log.partition) {
                stats.byPartition[log.partition] = (stats.byPartition[log.partition] || 0) + 1;
            }
            stats.byUser[log.userId] = (stats.byUser[log.userId] || 0) + 1;
            const date = log.timestamp.split('T')[0];
            stats.timeline[date] = (stats.timeline[date] || 0) + 1;
        }
        return stats;
    }
    async cleanupOldAudits(retentionDays = 90) {
        if (!this.auditResource)
            return 0;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const datesToDelete = [];
        const startDate = new Date(cutoffDate);
        startDate.setDate(startDate.getDate() - 365);
        for (let d = new Date(startDate); d < cutoffDate; d.setDate(d.getDate() + 1)) {
            datesToDelete.push(d.toISOString().slice(0, 10));
        }
        let deletedCount = 0;
        for (const dateStr of datesToDelete) {
            const [ok, , oldAudits] = await tryFn(() => this.auditResource.query({ createdAt: dateStr }));
            if (ok && oldAudits) {
                for (const audit of oldAudits) {
                    const [delOk] = await tryFn(() => this.auditResource.delete(audit.id));
                    if (delOk) {
                        deletedCount++;
                    }
                }
            }
        }
        return deletedCount;
    }
}
//# sourceMappingURL=audit.plugin.js.map