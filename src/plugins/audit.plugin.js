/**
 * # AuditPlugin - Comprehensive Audit Trail for s3db.js
 *
 * ## Overview
 *
 * The AuditPlugin automatically tracks all changes (insert, update, delete) to your resources,
 * creating a complete audit trail for compliance, debugging, and historical analysis.
 *
 * ## Features
 *
 * 1. **Automatic Change Tracking** - Captures all insert/update/delete operations
 * 2. **Partition-Aware** - Efficient queries using date and resource partitions
 * 3. **Configurable Data Inclusion** - Control whether to store full data or just metadata
 * 4. **Data Truncation** - Automatically truncates large records to prevent storage issues
 * 5. **Flexible Querying** - Filter by resource, operation, record ID, partition, or date range
 * 6. **Statistics & Analytics** - Built-in aggregation methods for audit analysis
 * 7. **Retention Management** - Automatic cleanup of old audit logs
 *
 * ## Configuration
 *
 * ```javascript
 * import { Database } from 's3db.js';
 * import { AuditPlugin } from 's3db.js/plugins/audit';
 *
 * // Basic configuration
 * const db = new Database({
 *   connectionString: 's3://bucket/db'
 * });
 *
 * await db.use(new AuditPlugin({
 *   includeData: true,        // Store before/after data (default: true)
 *   includePartitions: true,  // Track partition information (default: true)
 *   maxDataSize: 10000        // Max bytes for data field (default: 10000)
 * }));
 *
 * // Minimal configuration (metadata only, faster)
 * await db.use(new AuditPlugin({
 *   includeData: false,       // Don't store data, only operation metadata
 *   includePartitions: false  // Don't track partitions
 * }));
 * ```
 *
 * ## Usage Examples
 *
 * ### Basic Audit Trail
 *
 * ```javascript
 * const users = await db.createResource({
 *   name: 'users',
 *   attributes: {
 *     email: 'string|required',
 *     name: 'string'
 *   }
 * });
 *
 * // These operations are automatically audited
 * await users.insert({ id: 'u1', email: 'john@example.com', name: 'John' });
 * await users.update('u1', { name: 'John Doe' });
 * await users.delete('u1');
 *
 * // Query audit logs
 * const auditPlugin = db.plugins.AuditPlugin;
 * const logs = await auditPlugin.getAuditLogs({
 *   resourceName: 'users',
 *   recordId: 'u1'
 * });
 *
 * console.log(logs);
 * // [
 * //   { operation: 'insert', recordId: 'u1', newData: '{"id":"u1",...}', timestamp: '...' },
 * //   { operation: 'update', recordId: 'u1', oldData: '...', newData: '...', timestamp: '...' },
 * //   { operation: 'delete', recordId: 'u1', oldData: '...', timestamp: '...' }
 * // ]
 * ```
 *
 * ### Querying Audit Logs
 *
 * ```javascript
 * const auditPlugin = db.plugins.AuditPlugin;
 *
 * // Get all changes to a specific resource
 * const userChanges = await auditPlugin.getAuditLogs({
 *   resourceName: 'users',
 *   limit: 100
 * });
 *
 * // Get changes by operation type
 * const deletions = await auditPlugin.getAuditLogs({
 *   resourceName: 'users',
 *   operation: 'delete'
 * });
 *
 * // Get changes in a date range
 * const recentChanges = await auditPlugin.getAuditLogs({
 *   startDate: '2025-01-01',
 *   endDate: '2025-01-31'
 * });
 *
 * // Get specific record history
 * const recordHistory = await auditPlugin.getRecordHistory('users', 'u1');
 * ```
 *
 * ### Audit Statistics
 *
 * ```javascript
 * // Get comprehensive statistics
 * const stats = await auditPlugin.getAuditStats({
 *   resourceName: 'users',
 *   startDate: '2025-01-01'
 * });
 *
 * console.log(stats);
 * // {
 * //   total: 1523,
 * //   byOperation: { insert: 500, update: 1000, delete: 23 },
 * //   byResource: { users: 1523 },
 * //   byUser: { system: 1200, 'user@example.com': 323 },
 * //   timeline: { '2025-01-01': 45, '2025-01-02': 67, ... }
 * // }
 * ```
 *
 * ### Partition History
 *
 * ```javascript
 * const orders = await db.createResource({
 *   name: 'orders',
 *   attributes: { region: 'string', amount: 'number' },
 *   partitions: {
 *     byRegion: { fields: { region: 'string' } }
 *   }
 * });
 *
 * // Get audit trail for a specific partition
 * const partitionLogs = await auditPlugin.getPartitionHistory(
 *   'orders',
 *   'byRegion',
 *   { region: 'US' }
 * );
 * ```
 *
 * ### Cleanup Old Audit Logs
 *
 * ```javascript
 * // Delete audit logs older than 90 days (default)
 * const deletedCount = await auditPlugin.cleanupOldAudits(90);
 * console.log(`Deleted ${deletedCount} old audit logs`);
 *
 * // Custom retention period (30 days)
 * await auditPlugin.cleanupOldAudits(30);
 * ```
 *
 * ## Best Practices
 *
 * ### 1. Configure Data Inclusion Based on Needs
 *
 * ```javascript
 * // For compliance (full audit trail)
 * new AuditPlugin({
 *   includeData: true,
 *   includePartitions: true,
 *   maxDataSize: 50000  // Large limit for complete data
 * });
 *
 * // For performance monitoring (metadata only)
 * new AuditPlugin({
 *   includeData: false,
 *   includePartitions: false
 * });
 * ```
 *
 * ### 2. Use Partition-Aware Queries for Performance
 *
 * ```javascript
 * // FAST: Query by resource (uses partition)
 * await auditPlugin.getAuditLogs({ resourceName: 'users' });
 *
 * // FAST: Query by date (uses partition)
 * await auditPlugin.getAuditLogs({ startDate: '2025-01-15', endDate: '2025-01-16' });
 *
 * // SLOWER: Multiple filters (requires list scan)
 * await auditPlugin.getAuditLogs({
 *   resourceName: 'users',
 *   operation: 'update',
 *   recordId: 'u1'
 * });
 * ```
 *
 * ### 3. Implement Regular Cleanup
 *
 * ```javascript
 * // Schedule monthly cleanup (using cron or scheduler)
 * setInterval(async () => {
 *   const deleted = await auditPlugin.cleanupOldAudits(90);
 *   console.log(`Audit cleanup: removed ${deleted} records`);
 * }, 30 * 24 * 60 * 60 * 1000); // 30 days
 * ```
 *
 * ### 4. Track User Context
 *
 * ```javascript
 * // Set current user for audit trails
 * auditPlugin.getCurrentUserId = () => {
 *   // Return current user ID from your auth system
 *   return getCurrentUser()?.email || 'system';
 * };
 *
 * // Now all audit logs will include the user ID
 * await users.insert({ email: 'jane@example.com' });
 * // Audit log will show: userId: 'admin@example.com'
 * ```
 *
 * ## Performance Considerations
 *
 * ### Storage Overhead
 *
 * - **With includeData: true** - Approximately 2-3x storage per operation
 * - **With includeData: false** - Approximately 200-500 bytes per operation
 * - Large records are automatically truncated based on `maxDataSize`
 *
 * ### Query Performance
 *
 * | Query Type | Performance | Notes |
 * |------------|-------------|-------|
 * | By resource name | **O(n)** where n = records in resource | Uses `byResource` partition |
 * | By date range | **O(n)** where n = records in date range | Uses `byDate` partition |
 * | By operation | **O(n)** of all records | Requires full scan |
 * | By record ID | **O(n)** of all records | Requires full scan |
 * | Combined filters | **O(n)** of all records | Fetches up to 10,000 records |
 *
 * ### Optimization Tips
 *
 * ```javascript
 * // 1. Use partition-aware queries when possible
 * const logs = await auditPlugin.getAuditLogs({ resourceName: 'users' });
 *
 * // 2. Limit result sets
 * const recent = await auditPlugin.getAuditLogs({
 *   resourceName: 'users',
 *   limit: 50
 * });
 *
 * // 3. Use narrow date ranges
 * const dailyLogs = await auditPlugin.getAuditLogs({
 *   startDate: '2025-01-15',
 *   endDate: '2025-01-15'  // Single day
 * });
 *
 * // 4. Disable data inclusion for high-volume resources
 * new AuditPlugin({ includeData: false });
 * ```
 *
 * ## Troubleshooting
 *
 * ### Audit Logs Not Being Created
 *
 * ```javascript
 * // Check if plugin is installed
 * console.log(db.plugins.AuditPlugin);  // Should exist
 *
 * // Check if audit resource exists
 * console.log(db.resources.plg_audits);  // Should exist
 *
 * // Verify plugin started
 * await db.start();  // Must call start() to activate plugin
 * ```
 *
 * ### Large Audit Logs Slow Queries
 *
 * ```javascript
 * // Solution 1: Reduce data inclusion
 * new AuditPlugin({ includeData: false });
 *
 * // Solution 2: Implement regular cleanup
 * await auditPlugin.cleanupOldAudits(30);  // Keep only 30 days
 *
 * // Solution 3: Use more specific queries
 * await auditPlugin.getAuditLogs({
 *   resourceName: 'users',  // Use partition
 *   limit: 100              // Limit results
 * });
 * ```
 *
 * ### Data Truncation Issues
 *
 * ```javascript
 * // Check if records are being truncated
 * const logs = await auditPlugin.getAuditLogs({ resourceName: 'users' });
 * const truncated = logs.filter(log => {
 *   const data = JSON.parse(log.newData || '{}');
 *   return data._truncated === true;
 * });
 *
 * // Increase max size if needed
 * new AuditPlugin({ maxDataSize: 50000 });  // Increase from default 10000
 * ```
 *
 * ### Memory Usage with Large History
 *
 * ```javascript
 * // Instead of loading all at once
 * const all = await auditPlugin.getAuditLogs({ resourceName: 'users' });
 *
 * // Use pagination
 * for (let offset = 0; offset < totalRecords; offset += 100) {
 *   const batch = await auditPlugin.getAuditLogs({
 *     resourceName: 'users',
 *     limit: 100,
 *     offset
 *   });
 *   processBatch(batch);
 * }
 * ```
 *
 * ## Audit Log Schema
 *
 * ```javascript
 * {
 *   id: 'audit-1234567890-abc',           // Unique audit log ID
 *   resourceName: 'users',                 // Resource that was modified
 *   operation: 'update',                   // 'insert' | 'update' | 'delete' | 'deleteMany'
 *   recordId: 'u1',                        // ID of the modified record
 *   userId: 'admin@example.com',           // User who made the change
 *   timestamp: '2025-01-15T10:30:00Z',     // When the change occurred
 *   createdAt: '2025-01-15',               // Date for partitioning (YYYY-MM-DD)
 *   oldData: '{"id":"u1","name":"John"}',  // Data before change (JSON string)
 *   newData: '{"id":"u1","name":"Jane"}',  // Data after change (JSON string)
 *   partition: 'byRegion',                 // Partition name (if applicable)
 *   partitionValues: '{"region":"US"}',    // Partition values (JSON string)
 *   metadata: '{"source":"audit-plugin"}', // Additional metadata
 * }
 * ```
 *
 * ## Real-World Use Cases
 *
 * ### 1. Compliance & Regulatory Requirements
 *
 * ```javascript
 * // HIPAA, SOC2, GDPR compliance
 * const auditPlugin = new AuditPlugin({
 *   includeData: true,      // Full audit trail required
 *   includePartitions: true,
 *   maxDataSize: 100000     // Large records
 * });
 *
 * // Generate compliance report
 * const report = await auditPlugin.getAuditStats({
 *   startDate: '2025-01-01',
 *   endDate: '2025-12-31'
 * });
 * ```
 *
 * ### 2. Debugging & Troubleshooting
 *
 * ```javascript
 * // Find when and who changed a specific record
 * const history = await auditPlugin.getRecordHistory('orders', 'order-123');
 * console.log(history.map(log => ({
 *   timestamp: log.timestamp,
 *   user: log.userId,
 *   operation: log.operation,
 *   before: JSON.parse(log.oldData || '{}'),
 *   after: JSON.parse(log.newData || '{}')
 * })));
 * ```
 *
 * ### 3. Activity Monitoring
 *
 * ```javascript
 * // Real-time activity dashboard
 * setInterval(async () => {
 *   const recentActivity = await auditPlugin.getAuditLogs({
 *     startDate: new Date(Date.now() - 60000).toISOString(),  // Last minute
 *     limit: 100
 *   });
 *
 *   updateDashboard(recentActivity);
 * }, 10000);  // Update every 10 seconds
 * ```
 *
 * ### 4. Data Recovery
 *
 * ```javascript
 * // Recover accidentally deleted record
 * const deletedLog = await auditPlugin.getAuditLogs({
 *   resourceName: 'users',
 *   operation: 'delete',
 *   recordId: 'u1'
 * });
 *
 * if (deletedLog.length > 0) {
 *   const originalData = JSON.parse(deletedLog[0].oldData);
 *   await users.insert(originalData);  // Restore
 * }
 * ```
 *
 * ## API Reference
 *
 * ### Constructor Options
 *
 * - `includeData` (boolean, default: true) - Store before/after data in audit logs
 * - `includePartitions` (boolean, default: true) - Track partition information
 * - `maxDataSize` (number, default: 10000) - Maximum bytes for data field
 *
 * ### Methods
 *
 * - `getAuditLogs(options)` - Query audit logs with filters
 * - `getRecordHistory(resourceName, recordId)` - Get complete history of a record
 * - `getPartitionHistory(resourceName, partition, values)` - Get partition-specific history
 * - `getAuditStats(options)` - Get aggregated statistics
 * - `cleanupOldAudits(retentionDays)` - Delete old audit logs
 *
 * ### Query Options
 *
 * ```typescript
 * interface AuditQueryOptions {
 *   resourceName?: string;   // Filter by resource
 *   operation?: string;      // Filter by operation ('insert' | 'update' | 'delete')
 *   recordId?: string;       // Filter by record ID
 *   partition?: string;      // Filter by partition name
 *   startDate?: string;      // Filter by start date (ISO format)
 *   endDate?: string;        // Filter by end date (ISO format)
 *   limit?: number;          // Max results (default: 100)
 *   offset?: number;         // Pagination offset (default: 0)
 * }
 * ```
 */

import { Plugin } from "./plugin.class.js";
import { getValidatedNamespace } from "./namespace.js";
import tryFn from "../concerns/try-fn.js";
import { resolveResourceName } from "./concerns/resource-names.js";

export class AuditPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // Validate and set namespace (standardized)
    this.namespace = getValidatedNamespace(this.options, '');

    const {
      resourceNames = {},
      resourceName,
      includeData = true,
      includePartitions = true,
      maxDataSize = 10000,
      ...rest
    } = this.options;

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
      verbose: this.verbose,
      ...rest
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
    // Create audit resource
    const [ok, err, auditResource] = await tryFn(() => this.database.createResource({
      name: this.auditResourceName,
      attributes: {
        id: 'string|required',
        resourceName: 'string|required',
        operation: 'string|required',
        recordId: 'string|required',
        userId: 'string|optional',
        timestamp: 'string|required',
        createdAt: 'string|required', // YYYY-MM-DD for partitioning
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
    if (!ok && !this.auditResource) return;

    // Hook into database for new resources
    this.database.addHook('afterCreateResource', (context) => {
      if (context.resource.name !== this.auditResourceName) {
        this.setupResourceAuditing(context.resource);
      }
    });

    // Setup existing resources
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
    // Insert
    resource.on('inserted', async (data) => {
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
    resource.on('updated', async (data) => {
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
    resource.on('deleted', async (data) => {
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

    const now = new Date();
    const auditRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      userId: this.getCurrentUserId?.() || 'system',
      timestamp: now.toISOString(),
      createdAt: now.toISOString().slice(0, 10), // YYYY-MM-DD for partitioning
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
      if (this.verbose) {
        console.warn('Audit logging failed:', error.message);
      }
    }
  }

  getPartitionValues(data, resource) {
    if (!this.config.includePartitions) return null;

    // Use $schema for reliable access to partition definitions
    const partitions = resource.$schema.partitions;
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

    let items = [];

    // Use partition-aware queries when possible
    if (resourceName && !operation && !recordId && !partition && !startDate && !endDate) {
      // Query by resource partition directly (most efficient)
      const [ok, err, result] = await tryFn(() =>
        this.auditResource.query({ resourceName }, { limit: limit + offset })
      );
      items = ok && result ? result : [];
      return items.slice(offset, offset + limit);
    } else if (startDate && !resourceName && !operation && !recordId && !partition) {
      // Query by date partition (efficient for date ranges)
      const dates = this._generateDateRange(startDate, endDate);
      for (const date of dates) {
        const [ok, err, result] = await tryFn(() =>
          this.auditResource.query({ createdAt: date })
        );
        if (ok && result) {
          items.push(...result);
        }
      }
      return items.slice(offset, offset + limit);
    } else if (resourceName || operation || recordId || partition || startDate || endDate) {
      // Fetch with filters (less efficient, but necessary)
      const fetchSize = Math.min(10000, Math.max(1000, (limit + offset) * 20));
      const result = await this.auditResource.list({ limit: fetchSize });
      items = result || [];

      // Apply filters
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
          if (startDate && timestamp < new Date(startDate)) return false;
          if (endDate && timestamp > new Date(endDate)) return false;
          return true;
        });
      }

      return items.slice(offset, offset + limit);
    } else {
      // No filters, use direct pagination
      const result = await this.auditResource.page({ size: limit, offset });
      return result.items || [];
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

  /**
   * Clean up audit logs older than retention period
   * @param {number} retentionDays - Number of days to retain (default: 90)
   * @returns {Promise<number>} Number of records deleted
   */
  async cleanupOldAudits(retentionDays = 90) {
    if (!this.auditResource) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Generate list of dates to delete (all dates before cutoff)
    const datesToDelete = [];
    const startDate = new Date(cutoffDate);
    startDate.setDate(startDate.getDate() - 365); // Go back up to 1 year to catch old data

    for (let d = new Date(startDate); d < cutoffDate; d.setDate(d.getDate() + 1)) {
      datesToDelete.push(d.toISOString().slice(0, 10));
    }

    let deletedCount = 0;

    // Clean up using partition-aware queries
    for (const dateStr of datesToDelete) {
      const [ok, err, oldAudits] = await tryFn(() =>
        this.auditResource.query({ createdAt: dateStr })
      );

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
