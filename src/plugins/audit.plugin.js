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
    this.installResourceHooks();
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
    
    const installResourceHooksForResource = this.installResourceHooksForResource.bind(this);
    
    // Store original method
    this.database._originalCreateResource = this.database.createResource;
    
    // Create new method that doesn't call itself
    this.database.createResource = async function (...args) {
      const resource = await this._originalCreateResource(...args);
      if (resource.name !== 'audit_logs') {
        installResourceHooksForResource(resource);
      }
      return resource;
    };
    
    // Mark as installed
    this.database._auditProxyInstalled = true;
  }

  installResourceHooks() {
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === 'audits') continue; // Don't audit the audit resource
      
      this.installResourceHooksForResource(resource);
    }
  }

  installResourceHooksForResource(resource) {
    // Wrap insert operations
    this.wrapResourceMethod(resource, 'insert', async (result, args, methodName) => {
      const [data] = args;
      const recordId = data.id || result.id || 'auto-generated';
      
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
      
      return result;
    });

    // Wrap update operations
    this.wrapResourceMethod(resource, 'update', async (result, args, methodName) => {
      const [id, data] = args;
      let oldData = null;
      
      if (this.config.includeData) {
        try {
          oldData = await resource.get(id);
        } catch (error) {
          // Record might not exist or be inaccessible
        }
      }

      const partitionValues = this.config.includePartitions ? this.getPartitionValues(result, resource) : null;

      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resourceName: resource.name,
        operation: 'update',
        recordId: id,
        userId: this.getCurrentUserId?.() || 'system',
        timestamp: new Date().toISOString(),
        oldData: oldData && this.config.includeData === false ? null : (oldData ? JSON.stringify(this.truncateData(oldData)) : null),
        newData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(result)),
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? (partitionValues ? (Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null) : null) : null,
        metadata: JSON.stringify({
          source: 'audit-plugin',
          version: '2.0'
        })
      };

      // Log audit asynchronously
      this.logAudit(auditRecord).catch(console.error);
      
      return result;
    });

    // Wrap delete operations
    this.wrapResourceMethod(resource, 'delete', async (result, args, methodName) => {
      const [id] = args;
      let oldData = null;
      
      if (this.config.includeData) {
        try {
          oldData = await resource.get(id);
        } catch (error) {
          // Record might not exist or be inaccessible
        }
      }

      const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;

      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resourceName: resource.name,
        operation: 'delete',
        recordId: id,
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
      
      return result;
    });

    // Wrap deleteMany operations
    this.wrapResourceMethod(resource, 'deleteMany', async (result, args, methodName) => {
      const [ids] = args;
      const auditRecords = [];

      if (this.config.includeData) {
        for (const id of ids) {
          try {
            const oldData = await resource.get(id);
            const partitionValues = this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;

            auditRecords.push({
              id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
            });
          } catch (error) {
            // Record might not exist
          }
        }
      }

      // Log all audit records asynchronously
      for (const auditRecord of auditRecords) {
        this.logAudit(auditRecord).catch(console.error);
      }
      
      return result;
    });
  }

  getPartitionValues(data, resource) {
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
    if (!this.auditResource) return;
    try {
      await this.auditResource.insert(auditRecord);
    } catch (error) {
      console.error('Failed to log audit record:', error);
      if (error && error.stack) console.error(error.stack);
    }
  }

  truncateData(data) {
    if (!data) return data;
    
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

      // Note: This is a simplified query - in a real implementation,
      // you might want to use a more sophisticated querying mechanism
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

      // Sort by timestamp descending (newest first)
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // Deserialize JSON fields
      const deserialized = filtered.slice(offset, offset + limit).map(audit => ({
        ...audit,
        oldData: audit.oldData ? JSON.parse(audit.oldData) : null,
        newData: audit.newData ? JSON.parse(audit.newData) : null,
        partitionValues: audit.partitionValues ? JSON.parse(audit.partitionValues) : null,
        metadata: audit.metadata ? JSON.parse(audit.metadata) : null
      }));
      
      return deserialized;
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      if (error && error.stack) console.error(error.stack);
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
      const day = audit.timestamp.split('T')[0];
      stats.timeline[day] = (stats.timeline[day] || 0) + 1;
    }

    return stats;
  }
}

export default AuditPlugin; 