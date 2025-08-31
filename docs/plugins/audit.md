# 📝 Audit Plugin

<p align="center">
  <strong>Comprehensive Audit Logging System</strong><br>
  <em>Track all database operations for compliance, security monitoring, and debugging</em>
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Overview

The Audit Plugin provides a comprehensive audit logging system that tracks all database operations for compliance, security monitoring, and debugging purposes. It automatically creates detailed logs of every operation performed on your resources.

### How It Works

1. **Automatic Logging**: Transparently logs all database operations
2. **Flexible Configuration**: Choose which operations and resources to audit
3. **Rich Context**: Capture user information, metadata, and operation details
4. **Dedicated Storage**: Stores audit logs in a separate `audits` resource
5. **Query Support**: Search and analyze audit logs with standard resource queries

> 📊 **Comprehensive Tracking**: Perfect for compliance requirements, security monitoring, and debugging complex operations.

---

## Key Features

### 🎯 Core Features
- **Automatic Operation Tracking**: Logs insert, update, delete, get, and list operations
- **Data Payload Logging**: Optional inclusion of before/after data states
- **User Context Tracking**: Capture user IDs and session information
- **Partition Support**: Include partition information in audit logs
- **Custom Metadata**: Add application-specific metadata to audit entries

### 🔧 Technical Features
- **Resource Exclusion**: Skip auditing for specific resources
- **Data Size Limits**: Control maximum data payload size in logs
- **Custom User Extraction**: Flexible user ID extraction from context
- **Real-time Monitoring**: Event-based monitoring of audit log creation
- **Compliance Reporting**: Built-in tools for generating compliance reports

---

## Installation & Setup

### Basic Setup

```javascript
import { S3db, AuditPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new AuditPlugin({ enabled: true })]
});

await s3db.connect();

// All operations are automatically logged
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
await users.update(userId, { name: 'John Doe' });

// Access audit logs
const auditResource = s3db.resource('audits');
const logs = await auditResource.list();
console.log('Audit trail:', logs);
```

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable audit logging |
| `includeData` | boolean | `true` | Include data payloads in audit logs |
| `includePartitions` | boolean | `true` | Include partition information in logs |
| `maxDataSize` | number | `10000` | Maximum data size to log (bytes) |
| `trackOperations` | array | `['insert', 'update', 'delete']` | Operations to audit |
| `excludeResources` | array | `[]` | Resources to exclude from auditing |
| `userId` | function | `null` | Function to extract user ID from context |
| `metadata` | function | `null` | Function to add custom metadata |

### Audit Log Structure

```javascript
{
  id: 'audit-abc123',
  resourceName: 'users',
  operation: 'insert',
  recordId: 'user-123',
  userId: 'admin-456',
  timestamp: '2024-01-15T10:30:00.000Z',
  oldData: '{"name":"John"}',        // For updates (JSON string)
  newData: '{"name":"John Doe"}',    // New data (JSON string)
  partition: 'byStatus',             // If using partitions
  partitionValues: '{"status":"active"}',
  metadata: '{"ip":"192.168.1.1"}',  // Custom metadata (JSON string)
  _v: 0                              // Audit record version
}
```

---

## Usage Examples

### Basic Audit Logging

```javascript
import { S3db, AuditPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new AuditPlugin({
    enabled: true,
    includeData: true,
    trackOperations: ['insert', 'update', 'delete', 'get'],
    maxDataSize: 5000
  })]
});

await s3db.connect();

const products = s3db.resource('products');
const audits = s3db.resource('audits');

// Perform operations (automatically audited)
const product = await products.insert({
  name: 'Gaming Laptop',
  price: 1299.99,
  category: 'electronics'
});

await products.update(product.id, { price: 1199.99 });
await products.get(product.id);
await products.delete(product.id);

// Review audit trail
const auditLogs = await audits.list();

console.log('\n=== Audit Trail ===');
auditLogs.forEach(log => {
  console.log(`${log.timestamp} | ${log.operation.toUpperCase()} | ${log.resourceName} | ${log.recordId}`);
  
  if (log.operation === 'update') {
    const oldData = JSON.parse(log.oldData);
    const newData = JSON.parse(log.newData);
    console.log(`  Price changed: $${oldData.price} → $${newData.price}`);
  }
});

// Query specific audit logs
const updateLogs = await audits.list({
  filter: log => log.operation === 'update'
});

console.log(`\nFound ${updateLogs.length} update operations`);
```

### Advanced Configuration with Context

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new AuditPlugin({
    enabled: true,
    includeData: true,
    includePartitions: true,
    maxDataSize: 20000, // 20KB limit
    
    // Track all operations including reads
    trackOperations: ['insert', 'update', 'delete', 'get', 'list'],
    
    // Exclude sensitive resources from auditing
    excludeResources: ['sessions', 'temp_data'],
    
    // Extract user ID from request context
    userId: (context) => {
      return context?.user?.id || 
             context?.headers?.['x-user-id'] || 
             'anonymous';
    },
    
    // Add custom metadata to audit logs
    metadata: (operation, resourceName, data, context) => {
      return {
        ip: context?.ip,
        userAgent: context?.userAgent,
        sessionId: context?.sessionId,
        apiVersion: '1.0',
        environment: process.env.NODE_ENV,
        requestId: context?.requestId,
        
        // Operation-specific metadata
        ...(operation === 'insert' && { 
          createdVia: 'api',
          validationPassed: true 
        }),
        
        ...(operation === 'update' && {
          fieldsChanged: Object.keys(data || {}),
          automaticUpdate: false
        }),
        
        ...(operation === 'delete' && {
          softDelete: false,
          cascadeDelete: false
        })
      };
    }
  })]
});
```

### Audit Analysis and Reporting

```javascript
// Custom audit query functions
class AuditAnalyzer {
  constructor(auditResource) {
    this.audits = auditResource;
  }
  
  async getUserActivity(userId, timeRange = 24) {
    const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    const logs = await this.audits.list();
    
    return logs.filter(log => 
      log.userId === userId && 
      new Date(log.timestamp) > since
    );
  }
  
  async getResourceActivity(resourceName, operation = null) {
    const logs = await this.audits.list();
    
    return logs.filter(log => 
      log.resourceName === resourceName &&
      (!operation || log.operation === operation)
    );
  }
  
  async getDataChanges(resourceName, recordId) {
    const logs = await this.audits.list();
    
    return logs
      .filter(log => 
        log.resourceName === resourceName && 
        log.recordId === recordId &&
        log.operation === 'update'
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(log => ({
        timestamp: log.timestamp,
        oldData: JSON.parse(log.oldData || '{}'),
        newData: JSON.parse(log.newData || '{}'),
        userId: log.userId,
        metadata: JSON.parse(log.metadata || '{}')
      }));
  }
  
  async generateComplianceReport(startDate, endDate) {
    const logs = await this.audits.list();
    
    const filteredLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= startDate && logDate <= endDate;
    });
    
    const summary = {
      totalOperations: filteredLogs.length,
      operationBreakdown: {},
      resourceActivity: {},
      userActivity: {},
      timeRange: { startDate, endDate }
    };
    
    filteredLogs.forEach(log => {
      // Operation breakdown
      summary.operationBreakdown[log.operation] = 
        (summary.operationBreakdown[log.operation] || 0) + 1;
      
      // Resource activity
      summary.resourceActivity[log.resourceName] = 
        (summary.resourceActivity[log.resourceName] || 0) + 1;
      
      // User activity
      summary.userActivity[log.userId] = 
        (summary.userActivity[log.userId] || 0) + 1;
    });
    
    return summary;
  }
}

// Usage
const audits = s3db.resource('audits');
const analyzer = new AuditAnalyzer(audits);

// Analyze audit data
const userActivity = await analyzer.getUserActivity('admin-123');
console.log('Recent user activity:', userActivity);

const complianceReport = await analyzer.generateComplianceReport(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
  new Date()
);

console.log('\n=== Compliance Report ===');
console.log(`Total operations: ${complianceReport.totalOperations}`);
console.log('Operation breakdown:', complianceReport.operationBreakdown);
```

---

## API Reference

### Plugin Constructor

```javascript
new AuditPlugin({
  enabled?: boolean,
  includeData?: boolean,
  includePartitions?: boolean,
  maxDataSize?: number,
  trackOperations?: string[],
  excludeResources?: string[],
  userId?: (context: any) => string,
  metadata?: (operation: string, resourceName: string, data: any, context: any) => object
})
```

### Configuration Functions

#### `userId(context)`
Function to extract user ID from operation context.

```javascript
userId: (context) => {
  return context?.user?.id || 
         context?.session?.userId || 
         'anonymous';
}
```

#### `metadata(operation, resourceName, data, context)`
Function to add custom metadata to audit logs.

```javascript
metadata: (operation, resourceName, data, context) => {
  return {
    ip: context?.ip,
    userAgent: context?.userAgent,
    source: context?.source || 'api'
  };
}
```

### Audit Resource Methods

The plugin automatically creates an `audits` resource with standard methods:

```javascript
const audits = s3db.resource('audits');

// Query audit logs
const logs = await audits.list();
const userLogs = await audits.list({
  filter: log => log.userId === 'user-123'
});

// Get specific audit log
const log = await audits.get('audit-id');

// Count audit logs
const count = await audits.count();
```

---

## Advanced Patterns

### Real-time Audit Monitoring

```javascript
// Real-time audit monitoring with alerts
audits.on('insert', (auditLog) => {
  console.log(`🔍 New audit log: ${auditLog.operation} on ${auditLog.resourceName}`);
  
  // Security alerts
  if (auditLog.operation === 'delete' && auditLog.userId === 'anonymous') {
    console.warn('🚨 SECURITY ALERT: Anonymous user performed delete operation');
    // Send alert to security team
  }
  
  if (auditLog.operation === 'get' && auditLog.resourceName === 'sensitive_data') {
    console.warn('🔒 PRIVACY ALERT: Sensitive data accessed');
    // Log privacy access
  }
  
  // Rate limiting alerts
  if (auditLog.metadata) {
    const metadata = JSON.parse(auditLog.metadata);
    if (metadata.requestCount > 100) {
      console.warn('⚡ RATE LIMIT WARNING: High request volume detected');
    }
  }
});
```

### Audit Log Retention and Cleanup

```javascript
// Automated audit log cleanup
class AuditRetention {
  constructor(auditResource, retentionDays = 90) {
    this.audits = auditResource;
    this.retentionDays = retentionDays;
    this.setupCleanup();
  }
  
  setupCleanup() {
    // Daily cleanup
    setInterval(async () => {
      await this.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000);
  }
  
  async cleanupOldLogs() {
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    const oldLogs = await this.audits.list({
      filter: log => new Date(log.timestamp) < cutoffDate
    });
    
    console.log(`Cleaning up ${oldLogs.length} audit logs older than ${this.retentionDays} days`);
    
    // Archive before deletion (optional)
    if (oldLogs.length > 0) {
      await this.archiveLogs(oldLogs);
    }
    
    // Delete old logs
    for (const log of oldLogs) {
      await this.audits.delete(log.id);
    }
    
    return oldLogs.length;
  }
  
  async archiveLogs(logs) {
    const archiveData = {
      archiveDate: new Date().toISOString(),
      logCount: logs.length,
      logs: logs
    };
    
    // Save to archive resource or external storage
    const archives = s3db.resource('audit_archives');
    await archives.insert({
      id: `archive-${Date.now()}`,
      ...archiveData
    });
  }
}

// Usage
const retention = new AuditRetention(audits, 90); // 90 days retention
```

### Data Change Tracking

```javascript
// Track specific data changes
class ChangeTracker {
  constructor(auditResource) {
    this.audits = auditResource;
  }
  
  async getFieldHistory(resourceName, recordId, fieldName) {
    const changes = await this.audits.list({
      filter: log => 
        log.resourceName === resourceName && 
        log.recordId === recordId &&
        log.operation === 'update'
    });
    
    return changes
      .map(log => {
        const oldData = JSON.parse(log.oldData || '{}');
        const newData = JSON.parse(log.newData || '{}');
        
        if (oldData[fieldName] !== newData[fieldName]) {
          return {
            timestamp: log.timestamp,
            userId: log.userId,
            oldValue: oldData[fieldName],
            newValue: newData[fieldName],
            metadata: JSON.parse(log.metadata || '{}')
          };
        }
        
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
  
  async detectSuspiciousActivity(timeWindow = 60) { // minutes
    const since = new Date(Date.now() - timeWindow * 60 * 1000);
    const recentLogs = await this.audits.list({
      filter: log => new Date(log.timestamp) > since
    });
    
    const userActivity = {};
    const suspiciousPatterns = [];
    
    recentLogs.forEach(log => {
      if (!userActivity[log.userId]) {
        userActivity[log.userId] = { operations: [], resources: new Set() };
      }
      
      userActivity[log.userId].operations.push(log);
      userActivity[log.userId].resources.add(log.resourceName);
    });
    
    // Detect suspicious patterns
    Object.entries(userActivity).forEach(([userId, activity]) => {
      // High volume of operations
      if (activity.operations.length > 100) {
        suspiciousPatterns.push({
          type: 'high_volume',
          userId,
          count: activity.operations.length,
          timeWindow
        });
      }
      
      // Access to many different resources
      if (activity.resources.size > 10) {
        suspiciousPatterns.push({
          type: 'wide_access',
          userId,
          resourceCount: activity.resources.size,
          resources: Array.from(activity.resources)
        });
      }
      
      // Many delete operations
      const deleteCount = activity.operations.filter(op => op.operation === 'delete').length;
      if (deleteCount > 5) {
        suspiciousPatterns.push({
          type: 'mass_deletion',
          userId,
          deleteCount
        });
      }
    });
    
    return suspiciousPatterns;
  }
}

// Usage
const tracker = new ChangeTracker(audits);

// Get field history
const priceHistory = await tracker.getFieldHistory('products', 'prod-123', 'price');
console.log('Price change history:', priceHistory);

// Detect suspicious activity
const suspicious = await tracker.detectSuspiciousActivity(30); // Last 30 minutes
if (suspicious.length > 0) {
  console.warn('Suspicious activity detected:', suspicious);
}
```

---

## Best Practices

### 1. Configure Appropriate Operations

```javascript
// For compliance: Track all operations
trackOperations: ['insert', 'update', 'delete', 'get', 'list']

// For security: Focus on changes
trackOperations: ['insert', 'update', 'delete']

// For debugging: Include reads
trackOperations: ['insert', 'update', 'delete', 'get']
```

### 2. Manage Data Payload Size

```javascript
{
  includeData: true,
  maxDataSize: 10000, // 10KB limit
  
  // For sensitive data, consider excluding payloads
  includeData: false // Only track operation metadata
}
```

### 3. Implement User Context

```javascript
{
  userId: (context) => {
    // Prioritize authenticated user
    if (context?.user?.id) return context.user.id;
    
    // Fall back to API key
    if (context?.apiKey) return `api:${context.apiKey}`;
    
    // System operations
    if (context?.system) return 'system';
    
    // Default
    return 'anonymous';
  }
}
```

### 4. Add Meaningful Metadata

```javascript
{
  metadata: (operation, resourceName, data, context) => {
    const baseMetadata = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION
    };
    
    // Add context-specific data
    if (context?.request) {
      baseMetadata.ip = context.request.ip;
      baseMetadata.userAgent = context.request.headers['user-agent'];
      baseMetadata.endpoint = context.request.url;
    }
    
    // Add operation-specific data
    if (operation === 'update' && data) {
      baseMetadata.fieldsModified = Object.keys(data).length;
      baseMetadata.criticalFields = Object.keys(data).filter(key => 
        ['password', 'email', 'role'].includes(key)
      );
    }
    
    return baseMetadata;
  }
}
```

### 5. Monitor and Alert

```javascript
// Set up real-time monitoring
audits.on('insert', (log) => {
  // Alert on critical operations
  if (log.operation === 'delete' && log.resourceName === 'users') {
    sendAlert(`User deletion: ${log.recordId} by ${log.userId}`);
  }
  
  // Monitor failed operations
  const metadata = JSON.parse(log.metadata || '{}');
  if (metadata.error) {
    console.error(`Failed ${log.operation}: ${metadata.error}`);
  }
  
  // Rate limiting
  trackRateLimit(log.userId, log.operation);
});

function trackRateLimit(userId, operation) {
  // Implement rate limiting logic
  const key = `${userId}:${operation}`;
  const count = incrementCounter(key, 60); // 1 minute window
  
  if (count > 100) { // 100 operations per minute limit
    console.warn(`Rate limit exceeded for ${userId}: ${operation}`);
    // Take action (block, alert, etc.)
  }
}
```

### 6. Regular Cleanup and Archiving

```javascript
// Implement tiered retention
class TieredRetention {
  constructor(audits) {
    this.audits = audits;
  }
  
  async implementRetention() {
    const now = new Date();
    
    // Keep recent logs (30 days) with full data
    const recentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Keep medium-term logs (1 year) with reduced data
    const mediumCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    // Archive old logs (beyond 1 year)
    const oldLogs = await this.audits.list({
      filter: log => new Date(log.timestamp) < mediumCutoff
    });
    
    // Reduce data for medium-term logs
    const mediumLogs = await this.audits.list({
      filter: log => {
        const logDate = new Date(log.timestamp);
        return logDate < recentCutoff && logDate >= mediumCutoff;
      }
    });
    
    // Remove large data payloads from medium-term logs
    for (const log of mediumLogs) {
      if (log.oldData || log.newData) {
        await this.audits.update(log.id, {
          oldData: null,
          newData: null,
          dataRemoved: true,
          dataRemovedAt: now.toISOString()
        });
      }
    }
    
    console.log(`Processed ${oldLogs.length} old logs and ${mediumLogs.length} medium-term logs`);
  }
}
```

---

## Troubleshooting

### Issue: Audit logs not being created
**Solution**: Ensure the plugin is properly initialized and the `enabled` option is `true`.

### Issue: Missing user information in logs
**Solution**: Verify the `userId` function is correctly extracting user information from context.

### Issue: Large audit log storage usage
**Solution**: Reduce `maxDataSize`, disable `includeData`, or implement log retention policies.

### Issue: Performance impact from auditing
**Solution**: Exclude high-frequency resources with `excludeResources` or reduce tracked operations.

### Issue: Unable to query audit logs efficiently
**Solution**: Consider creating additional resources or indexes based on common query patterns.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Metrics Plugin](./metrics.md) - Monitor performance alongside audit logs
- [Costs Plugin](./costs.md) - Track audit logging costs
- [Cache Plugin](./cache.md) - Improve audit query performance