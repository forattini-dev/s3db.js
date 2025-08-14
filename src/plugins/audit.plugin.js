import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";

export class AuditPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.auditResource = null;
    this.config = {
      includeData: options.includeData !== false,
      includePartitions: options.includePartitions !== false,
      maxDataSize: options.maxDataSize || 10000,
      ...options
    };
  }

  async onSetup() {
    // Create audit resource
    const [ok, err, auditResource] = await tryFn(() => this.database.createResource({
      name: 'audits',
      attributes: {
        id: 'string|required',
        resourceName: 'string|required',
        operation: 'string|required',
        recordId: 'string|required',
        userId: 'string|optional',
        timestamp: 'string|required',
        oldData: 'string|optional',
        newData: 'string|optional',
        partition: 'string|optional',
        partitionValues: 'string|optional',
        metadata: 'string|optional'
      },
      behavior: 'body-overflow'
    }));
    this.auditResource = ok ? auditResource : (this.database.resources.audits || null);
    if (!ok && !this.auditResource) return;

    // Hook into database for new resources
    this.database.addHook('afterCreateResource', (context) => {
      if (context.resource.name !== 'audits') {
        this.setupResourceAuditing(context.resource);
      }
    });

    // Setup existing resources
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== 'audits') {
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
    // Insert
    resource.on('insert', async (data) => {
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: 'insert',
        recordId: data.id || 'auto-generated',
        oldData: null,
        newData: this.config.includeData ? JSON.stringify(this.truncateData(data)) : null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });

    // Update
    resource.on('update', async (data) => {
      let oldData = data.$before;
      if (this.config.includeData && !oldData) {
        const [ok, err, fetched] = await tryFn(() => resource.get(data.id));
        if (ok) oldData = fetched;
      }

      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: 'update',
        recordId: data.id,
        oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: this.config.includeData ? JSON.stringify(this.truncateData(data)) : null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });

    // Delete
    resource.on('delete', async (data) => {
      let oldData = data;
      if (this.config.includeData && !oldData) {
        const [ok, err, fetched] = await tryFn(() => resource.get(data.id));
        if (ok) oldData = fetched;
      }

      const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: 'delete',
        recordId: data.id,
        oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });

    // DeleteMany - We need to intercept before deletion to get the data
    const originalDeleteMany = resource.deleteMany.bind(resource);
    const plugin = this;
    resource.deleteMany = async function(ids) {
      // Fetch all objects before deletion for audit logging
      const objectsToDelete = [];
      for (const id of ids) {
        const [ok, err, fetched] = await tryFn(() => resource.get(id));
        if (ok) {
          objectsToDelete.push(fetched);
        } else {
          objectsToDelete.push({ id }); // Just store the ID if we can't fetch
        }
      }
      
      // Perform the actual deletion
      const result = await originalDeleteMany(ids);
      
      // Log audit entries after successful deletion
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
    
    // Store reference for cleanup if needed
    resource._originalDeleteMany = originalDeleteMany;
  }

  // Backward compatibility for tests
  installEventListenersForResource(resource) {
    return this.setupResourceAuditing(resource);
  }

  async logAudit(auditData) {
    if (!this.auditResource) {
      return;
    }

    const auditRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      userId: this.getCurrentUserId?.() || 'system',
      timestamp: new Date().toISOString(),
      metadata: JSON.stringify({ source: 'audit-plugin', version: '2.0' }),
      resourceName: auditData.resourceName,
      operation: auditData.operation,
      recordId: auditData.recordId
    };

    // Only add fields that are not null
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
    } catch (error) {
      // Silently fail to avoid breaking operations
      console.warn('Audit logging failed:', error.message);
    }
  }

  getPartitionValues(data, resource) {
    if (!this.config.includePartitions) return null;
    
    // Access partitions from resource.config.partitions, not resource.partitions
    const partitions = resource.config?.partitions || resource.partitions;
    if (!partitions) {
      return null;
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
    return Object.keys(partitionValues).length > 0 ? partitionValues : null;
  }

  getNestedFieldValue(data, fieldPath) {
    const parts = fieldPath.split('.');
    let value = data;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  getPrimaryPartition(partitionValues) {
    if (!partitionValues) return null;
    const partitionNames = Object.keys(partitionValues);
    return partitionNames.length > 0 ? partitionNames[0] : null;
  }

  truncateData(data) {
    if (!this.config.includeData) return null;
    
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
    if (!this.auditResource) return [];
    
    const { resourceName, operation, recordId, partition, startDate, endDate, limit = 100, offset = 0 } = options;
    
    let query = {};
    
    if (resourceName) query.resourceName = resourceName;
    if (operation) query.operation = operation;
    if (recordId) query.recordId = recordId;
    if (partition) query.partition = partition;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }
    
    const result = await this.auditResource.page({ query, limit, offset });
    return result.items || [];
  }

  async getRecordHistory(resourceName, recordId) {
    return await this.getAuditLogs({ resourceName, recordId });
  }

  async getPartitionHistory(resourceName, partitionName, partitionValues) {
    return await this.getAuditLogs({ 
      resourceName, 
      partition: partitionName,
      partitionValues: JSON.stringify(partitionValues)
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
      // Count by operation
      stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
      
      // Count by resource
      stats.byResource[log.resourceName] = (stats.byResource[log.resourceName] || 0) + 1;
      
      // Count by partition
      if (log.partition) {
        stats.byPartition[log.partition] = (stats.byPartition[log.partition] || 0) + 1;
      }
      
      // Count by user
      stats.byUser[log.userId] = (stats.byUser[log.userId] || 0) + 1;
      
      // Timeline by date
      const date = log.timestamp.split('T')[0];
      stats.timeline[date] = (stats.timeline[date] || 0) + 1;
    }
    
    return stats;
  }
} 