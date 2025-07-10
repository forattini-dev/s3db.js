import Plugin from "./plugin.class.js";

export class AuditPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.auditResource = null;
    this.config = {
      enabled: options.enabled !== false,
      includeData: options.includeData !== false,
      includePartitions: options.includePartitions !== false,
      maxDataSize: options.maxDataSize || 10000, // 10KB limit
      ...options
    };
  }

  async onSetup() {
    if (!this.config.enabled) {
      this.auditResource = null;
      return;
    }

    // Create audit resource if it doesn't exist
    try {
      this.auditResource = await this.database.createResource({
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
        }
        // keyPrefix removido
      });
    } catch (error) {
      // Resource might already exist
      try {
        this.auditResource = this.database.resources.audits;
      } catch (innerError) {
        // If audit resource doesn't exist and can't be created, set to null
        this.auditResource = null;
        return;
      }
    }

    this.installDatabaseProxy();
    this.installEventListeners();
  }

  async onStart() {
    // Plugin is ready
  }

  async onStop() {
    // Cleanup if needed
  }

  installDatabaseProxy() {
    if (this.database._auditProxyInstalled) {
      return; // Already installed
    }
    
    const installEventListenersForResource = this.installEventListenersForResource.bind(this);
    
    // Store original method
    this.database._originalCreateResource = this.database.createResource;
    
    // Create new method that doesn't call itself
    this.database.createResource = async function (...args) {
      const resource = await this._originalCreateResource(...args);
      if (resource.name !== 'audits') {
        installEventListenersForResource(resource);
      }
      return resource;
    };
    
    // Mark as installed
    this.database._auditProxyInstalled = true;
  }

  installEventListeners() {
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === 'audits') {
        continue; // Don't audit the audit resource
      }
      
      this.installEventListenersForResource(resource);
    }
  }

  installEventListenersForResource(resource) {
    // Store original data for update operations
    const originalDataMap = new Map();

    // Insert event
    resource.on('insert', async (data) => {
      const recordId = data.id || 'auto-generated';
      
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        resourceName: resource.name,
        operation: 'insert',
        recordId,
        userId: this.getCurrentUserId?.() || 'system',
        timestamp: new Date().toISOString(),
        oldData: null,
        newData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(data)),
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? (partitionValues ? (Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null) : null) : null,
        metadata: JSON.stringify({
          source: 'audit-plugin',
          version: '2.0'
        })
      };

      // Log audit asynchronously to avoid blocking
      this.logAudit(auditRecord).catch(console.error);
    });

    // Update event
    resource.on('update', async (data) => {
      const recordId = data.id;
      let oldData = data.$before;
      
      if (this.config.includeData && !oldData) {
        try {
          oldData = await resource.get(recordId);
        } catch (error) {
          // Record might not exist or be inaccessible
        }
      }

      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;

      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        resourceName: resource.name,
        operation: 'update',
        recordId,
        userId: this.getCurrentUserId?.() || 'system',
        timestamp: new Date().toISOString(),
        oldData: oldData && this.config.includeData === false ? null : (oldData ? JSON.stringify(this.truncateData(oldData)) : null),
        newData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(data)),
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? (partitionValues ? (Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null) : null) : null,
        metadata: JSON.stringify({
          source: 'audit-plugin',
          version: '2.0'
        })
      };

      // Log audit asynchronously
      this.logAudit(auditRecord).catch(console.error);
    });

    // Delete event
    resource.on('delete', async (data) => {
      const recordId = data.id;
      let oldData = data;
      
      if (this.config.includeData && !oldData) {
        try {
          oldData = await resource.get(recordId);
        } catch (error) {
          // Record might not exist or be inaccessible
        }
      }

      const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;

      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        resourceName: resource.name,
        operation: 'delete',
        recordId,
        userId: this.getCurrentUserId?.() || 'system',
        timestamp: new Date().toISOString(),
        oldData: oldData && this.config.includeData === false ? null : (oldData ? JSON.stringify(this.truncateData(oldData)) : null),
        newData: null,
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? (partitionValues ? (Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null) : null) : null,
        metadata: JSON.stringify({
          source: 'audit-plugin',
          version: '2.0'
        })
      };

      // Log audit asynchronously
      this.logAudit(auditRecord).catch(console.error);
    });

    // Remover monkey patch de deleteMany
    // Adicionar middleware para deleteMany
    resource.useMiddleware('deleteMany', async (ctx, next) => {
      const ids = ctx.args[0];
      // Captura os dados antes da deleção
      const oldDataMap = {};
      if (this.config.includeData) {
        for (const id of ids) {
          try {
            oldDataMap[id] = await resource.get(id);
          } catch (error) {
            oldDataMap[id] = null;
          }
        }
      }
      const result = await next();
      // Auditar depois
      if (result && result.length > 0 && this.config.includeData) {
        for (const id of ids) {
          const oldData = oldDataMap[id];
          const partitionValues = oldData ? (this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null) : null;
          const auditRecord = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            resourceName: resource.name,
            operation: 'delete',
            recordId: id,
            userId: this.getCurrentUserId?.() || 'system',
            timestamp: new Date().toISOString(),
            oldData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(oldData)),
            newData: null,
            partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
            partitionValues: this.config.includePartitions ? (partitionValues ? (Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null) : null) : null,
            metadata: JSON.stringify({
              source: 'audit-plugin',
              version: '2.0',
              batchOperation: true
            })
          };
          this.logAudit(auditRecord).catch(console.error);
        }
      }
      return result;
    });
  }

  getPartitionValues(data, resource) {
    if (!data) return null;
    const partitions = resource.config?.partitions || {};
    const partitionValues = {};
    
    for (const [partitionName, partitionDef] of Object.entries(partitions)) {
      if (partitionDef.fields) {
        const partitionData = {};
        for (const [fieldName, fieldRule] of Object.entries(partitionDef.fields)) {
          // Handle nested fields using dot notation
          const fieldValue = this.getNestedFieldValue(data, fieldName);
          if (fieldValue !== undefined && fieldValue !== null) {
            partitionData[fieldName] = fieldValue;
          }
        }
        if (Object.keys(partitionData).length > 0) {
          partitionValues[partitionName] = partitionData;
        }
      }
    }
    
    return partitionValues;
  }

  getNestedFieldValue(data, fieldPath) {
    // Handle simple field names (no dots)
    if (!fieldPath.includes('.')) {
      return data[fieldPath];
    }

    // Handle nested field names using dot notation
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

  getPrimaryPartition(partitionValues) {
    if (!partitionValues) return null;
    const partitionNames = Object.keys(partitionValues);
    return partitionNames.length > 0 ? partitionNames[0] : null;
  }

  async logAudit(auditRecord) {
    if (!auditRecord.id) {
      auditRecord.id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const result = await this.auditResource.insert(auditRecord);
    return result;
  }

  truncateData(data) {
    if (!data) return data;
    
    // Filter out internal S3DB fields (those starting with _)
    const filteredData = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith('_') && key !== '$overflow') {
        filteredData[key] = value;
      }
    }
    
    const dataStr = JSON.stringify(filteredData);
    if (dataStr.length <= this.config.maxDataSize) {
      return filteredData;
    }
    
    return {
      ...filteredData,
      _truncated: true,
      _originalSize: dataStr.length,
      _truncatedAt: new Date().toISOString()
    };
  }

  // Utility methods for querying audit logs
  async getAuditLogs(options = {}) {
    if (!this.auditResource) return [];
    try {
      const {
        resourceName,
        operation,
        recordId,
        userId,
        partition,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = options;

      const allAudits = await this.auditResource.getAll();
      let filtered = allAudits.filter(audit => {
        if (resourceName && audit.resourceName !== resourceName) return false;
        if (operation && audit.operation !== operation) return false;
        if (recordId && audit.recordId !== recordId) return false;
        if (userId && audit.userId !== userId) return false;
        if (partition && audit.partition !== partition) return false;
        if (startDate && new Date(audit.timestamp) < new Date(startDate)) return false;
        if (endDate && new Date(audit.timestamp) > new Date(endDate)) return false;
        return true;
      });
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const deserialized = filtered.slice(offset, offset + limit).map(audit => ({
        ...audit,
        oldData: audit.oldData === null || audit.oldData === undefined || audit.oldData === 'null' ? null : (typeof audit.oldData === 'string' ? JSON.parse(audit.oldData) : audit.oldData),
        newData: audit.newData === null || audit.newData === undefined || audit.newData === 'null' ? null : (typeof audit.newData === 'string' ? JSON.parse(audit.newData) : audit.newData),
        partitionValues: audit.partitionValues && typeof audit.partitionValues === 'string' ? JSON.parse(audit.partitionValues) : audit.partitionValues,
        metadata: audit.metadata && typeof audit.metadata === 'string' ? JSON.parse(audit.metadata) : audit.metadata
      }));
      return deserialized;
    } catch (error) {
      return [];
    }
  }

  async getRecordHistory(resourceName, recordId) {
    return this.getAuditLogs({
      resourceName,
      recordId,
      limit: 1000
    });
  }

  async getPartitionHistory(resourceName, partitionName, partitionValues) {
    return this.getAuditLogs({
      resourceName,
      partition: partitionName,
      limit: 1000
    });
  }

  async getAuditStats(options = {}) {
    const {
      resourceName,
      startDate,
      endDate
    } = options;

    const allAudits = await this.getAuditLogs({
      resourceName,
      startDate,
      endDate,
      limit: 10000
    });

    const stats = {
      total: allAudits.length,
      byOperation: {},
      byResource: {},
      byPartition: {},
      byUser: {},
      timeline: {}
    };

    for (const audit of allAudits) {
      // Count by operation
      stats.byOperation[audit.operation] = (stats.byOperation[audit.operation] || 0) + 1;
      
      // Count by resource
      stats.byResource[audit.resourceName] = (stats.byResource[audit.resourceName] || 0) + 1;
      
      // Count by partition
      if (audit.partition) {
        stats.byPartition[audit.partition] = (stats.byPartition[audit.partition] || 0) + 1;
      }
      
      // Count by user
      stats.byUser[audit.userId] = (stats.byUser[audit.userId] || 0) + 1;
      
      // Count by day
      if (audit.timestamp) {
        const day = audit.timestamp.split('T')[0];
        stats.timeline[day] = (stats.timeline[day] || 0) + 1;
      }
    }

    return stats;
  }
}

export default AuditPlugin; 