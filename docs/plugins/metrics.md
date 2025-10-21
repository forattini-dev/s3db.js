# 📊 Metrics Plugin

## ⚡ TLDR

**Complete** performance monitoring: timing, usage patterns, errors, and cache hit rates.

**1 line to get started:**
```javascript
await db.usePlugin(new MetricsPlugin({ enabled: true }));  // Automatic collection!
```

**Main features:**
- ✅ Operation timing (avg/min/max)
- ✅ Resource usage patterns
- ✅ Error tracking + error rates
- ✅ Slow query detection
- ✅ Real-time alerts + thresholds

**When to use:**
- 📈 Performance optimization
- 🐛 Debugging + troubleshooting
- 📊 Capacity planning
- ⚠️ Alerting + monitoring

**Access:**
```javascript
const metrics = await db.plugins.metrics.getMetrics();
console.log('Avg time:', metrics.performance.averageResponseTime);
```

---

## ⚡ Quick Start

Start collecting metrics in under 1 minute:

```javascript
import { Database, MetricsPlugin } from 's3db.js';

// Step 1: Create database and add metrics plugin
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

const metricsPlugin = new MetricsPlugin({
  enabled: true,
  trackLatency: true,
  trackErrors: true
});

await db.usePlugin(metricsPlugin);

// Step 2: Create resource and perform operations
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

// Operations are automatically tracked
await users.insert({ name: 'Alice', email: 'alice@example.com' });
await users.insert({ name: 'Bob', email: 'bob@example.com' });
await users.list({ limit: 10 });
await users.count();

// Step 3: View metrics
const metrics = await metricsPlugin.getMetrics();
console.log('Performance Metrics:');
console.log('- Total operations:', metrics.operations.total);
console.log('- Average response time:', metrics.performance.averageResponseTime, 'ms');
console.log('- Inserts:', metrics.operations.byType.insert);
console.log('- Lists:', metrics.operations.byType.list);
console.log('- Errors:', metrics.errors.total);

// Output:
// Performance Metrics:
// - Total operations: 4
// - Average response time: 145 ms
// - Inserts: 2
// - Lists: 1
// - Errors: 0

// Step 4: Get resource-specific metrics
const userMetrics = await metricsPlugin.getResourceMetrics('users');
console.log('\nUsers Resource Metrics:');
console.log('- Operations:', userMetrics.operations.total);
console.log('- Avg latency:', userMetrics.performance.averageResponseTime, 'ms');
console.log('- Slowest operation:', userMetrics.performance.slowestOperation);
```

**What just happened:**
1. ✅ Metrics Plugin installed and enabled
2. ✅ All operations automatically tracked (insert, list, count, etc.)
3. ✅ Performance data collected (latency, counts, errors)
4. ✅ Metrics available via API

**Next steps:**
- Configure Prometheus integration (see [Prometheus Integration](#-prometheus-integration))
- Set up custom alerts and thresholds (see [Advanced Patterns](#advanced-patterns))
- Export metrics to monitoring systems (see [Usage Examples](#usage-examples))

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

The Metrics Plugin provides a comprehensive performance monitoring and usage analytics system that tracks operation timing, resource usage, errors, and provides detailed insights into your database performance.

### How It Works

1. **Automatic Collection**: Transparently monitors all database operations
2. **Multi-dimensional Tracking**: Captures performance, usage, and error metrics
3. **Real-time Analysis**: Provides immediate insights and alerts
4. **Historical Data**: Maintains metrics history for trend analysis
5. **Intelligent Alerts**: Configurable thresholds and alert callbacks

> 📈 **Complete Observability**: Essential for performance optimization, capacity planning, and troubleshooting.

---

## Key Features

### 🎯 Core Features
- **Performance Tracking**: Operation timing, response times, and slow query detection
- **Usage Analytics**: Resource activity patterns and operation frequencies
- **Error Monitoring**: Error rates, types, and resource-specific failures
- **Cache Metrics**: Cache hit rates and efficiency tracking
- **Real-time Alerts**: Configurable thresholds with callback handlers

### 🔧 Technical Features
- **Sampling Support**: Configurable sampling rates for high-volume scenarios
- **Batch Processing**: Efficient metric storage and retrieval
- **Data Retention**: Automatic cleanup of old metrics data
- **Export Capabilities**: Generate reports and export data for external analysis
- **Custom Thresholds**: Flexible alerting based on your requirements

---

## Installation & Setup

### Basic Setup

```javascript
import { S3db, MetricsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({ enabled: true })]
});

await s3db.connect();

// Use your database normally - metrics are collected automatically
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
await users.list();
await users.count();

// Get comprehensive metrics
const metrics = await s3db.plugins.metrics.getMetrics();
console.log('Performance metrics:', metrics);
```

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable metrics collection |
| `collectPerformance` | boolean | `true` | Track operation timing and performance |
| `collectErrors` | boolean | `true` | Track errors and failures |
| `collectUsage` | boolean | `true` | Track resource usage patterns |
| `retentionDays` | number | `30` | Days to retain metric data |
| `flushInterval` | number | `60000` | Interval to flush metrics (ms) |
| `sampleRate` | number | `1.0` | Sampling rate for metrics (0.0-1.0) |
| `trackSlowQueries` | boolean | `true` | Track slow operations |
| `slowQueryThreshold` | number | `1000` | Threshold for slow queries (ms) |
| `batchSize` | number | `100` | Batch size for metric storage |

### Metrics Data Structure

```javascript
{
  performance: {
    averageResponseTime: 245,     // milliseconds
    totalRequests: 1250,
    requestsPerSecond: 12.5,
    slowestOperations: [
      { operation: "list", resource: "users", avgTime: 450, count: 50 }
    ],
    operationTiming: {
      insert: { avg: 180, min: 120, max: 350, total: 50 },
      update: { avg: 160, min: 90, max: 280, total: 30 },
      get: { avg: 95, min: 45, max: 180, total: 200 }
    }
  },
  usage: {
    resources: {
      users: { inserts: 150, updates: 75, deletes: 10, reads: 800 },
      products: { inserts: 300, updates: 120, deletes: 25, reads: 1200 }
    },
    totalOperations: 2680,
    mostActiveResource: "products",
    peakUsageHour: "14:00",
    dailyPatterns: { /* hourly usage data */ }
  },
  errors: {
    total: 15,
    byType: {
      "ValidationError": 8,
      "NotFoundError": 5,
      "PermissionError": 2
    },
    byResource: { users: 10, products: 5 },
    errorRate: 0.0056  // 0.56%
  },
  cache: {
    hitRate: 0.78,
    totalHits: 980,
    totalMisses: 270
  }
}
```

---

## Usage Examples

### Basic Performance Monitoring

```javascript
import { S3db, MetricsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({
    enabled: true,
    collectPerformance: true,
    collectErrors: true,
    flushInterval: 30000  // 30 seconds
  })]
});

await s3db.connect();

const orders = s3db.resource('orders');

// Simulate various operations
console.log('Performing operations...');

// Fast operations
for (let i = 0; i < 10; i++) {
  await orders.insert({
    customerId: `customer-${i}`,
    amount: Math.random() * 1000,
    status: 'pending'
  });
}

// Query operations
await orders.count();
await orders.list({ limit: 5 });

// Some updates
const orderList = await orders.list({ limit: 3 });
for (const order of orderList) {
  await orders.update(order.id, { status: 'processing' });
}

// Get performance metrics
const metrics = await s3db.plugins.metrics.getMetrics();

console.log('\n=== Performance Report ===');
console.log(`Average response time: ${metrics.performance.averageResponseTime}ms`);
console.log(`Total operations: ${metrics.usage.totalOperations}`);
console.log(`Error rate: ${(metrics.errors.errorRate * 100).toFixed(2)}%`);

console.log('\n=== Operation Breakdown ===');
Object.entries(metrics.performance.operationTiming).forEach(([op, timing]) => {
  console.log(`${op.toUpperCase()}: avg ${timing.avg}ms (${timing.total} operations)`);
});

console.log('\n=== Resource Usage ===');
Object.entries(metrics.usage.resources).forEach(([resource, usage]) => {
  const total = Object.values(usage).reduce((sum, count) => sum + count, 0);
  console.log(`${resource}: ${total} total operations`);
});
```

### Advanced Configuration with Alerts

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({
    enabled: true,

    // Comprehensive monitoring
    collectPerformance: true,
    collectErrors: true,
    collectUsage: true,

    // Advanced settings
    retentionDays: 90,        // 3 months of data
    flushInterval: 10000,     // 10 seconds
    sampleRate: 1.0,          // 100% sampling

    // Performance thresholds
    trackSlowQueries: true,
    slowQueryThreshold: 500,  // 500ms threshold

    // Storage optimization
    batchSize: 50,

    // Custom alerting thresholds
    alertThresholds: {
      errorRate: 0.05,        // 5% error rate
      avgResponseTime: 1000,  // 1 second average
      memoryUsage: 0.9        // 90% memory usage
    },

    // Event hooks
    onSlowQuery: (operation, resource, duration) => {
      console.warn(`🐌 Slow query: ${operation} on ${resource} took ${duration}ms`);
    },

    onHighErrorRate: (resource, errorRate) => {
      console.error(`🚨 High error rate: ${resource} has ${(errorRate * 100).toFixed(1)}% errors`);
    },

    onThresholdExceeded: (metric, value, threshold) => {
      console.warn(`⚠️  Threshold exceeded: ${metric} = ${value} (threshold: ${threshold})`);
    }
  })]
});
```

### Advanced Metrics Analysis

```javascript
// Advanced metrics analysis class
class MetricsAnalyzer {
  constructor(metricsPlugin) {
    this.plugin = metricsPlugin;
    this.alertHandlers = new Map();
  }

  addAlertHandler(condition, handler) {
    this.alertHandlers.set(condition, handler);
  }

  async analyzePerformance(timeRange = 3600000) { // 1 hour
    const metrics = await this.plugin.getMetrics();
    const analysis = {
      summary: {
        totalOperations: metrics.usage.totalOperations,
        avgResponseTime: metrics.performance.averageResponseTime,
        errorRate: metrics.errors.errorRate,
        slowQueries: metrics.performance.slowestOperations.length
      },
      recommendations: [],
      alerts: []
    };

    // Performance analysis
    if (metrics.performance.averageResponseTime > 500) {
      analysis.recommendations.push({
        type: 'performance',
        message: 'Average response time is high. Consider adding caching or optimizing queries.',
        priority: 'high'
      });
    }

    // Error rate analysis
    if (metrics.errors.errorRate > 0.02) { // 2%
      analysis.alerts.push({
        type: 'error_rate',
        message: `Error rate (${(metrics.errors.errorRate * 100).toFixed(2)}%) exceeds threshold`,
        severity: 'warning'
      });
    }

    // Resource usage patterns
    const resourceUsage = Object.entries(metrics.usage.resources);
    const imbalancedResources = resourceUsage.filter(([name, usage]) => {
      const writes = usage.inserts + usage.updates + usage.deletes;
      const reads = usage.reads;
      return writes > 0 && (reads / writes) < 0.1; // Very low read/write ratio
    });

    if (imbalancedResources.length > 0) {
      analysis.recommendations.push({
        type: 'usage_pattern',
        message: `Resources with low read/write ratio: ${imbalancedResources.map(([name]) => name).join(', ')}`,
        priority: 'medium'
      });
    }

    return analysis;
  }

  async generateReport(format = 'console') {
    const metrics = await this.plugin.getMetrics();
    const analysis = await this.analyzePerformance();

    if (format === 'console') {
      console.log('\n=== 📊 COMPREHENSIVE METRICS REPORT ===');

      // Performance Summary
      console.log('\n🚀 Performance Summary:');
      console.log(`  Total Operations: ${analysis.summary.totalOperations.toLocaleString()}`);
      console.log(`  Average Response Time: ${analysis.summary.avgResponseTime}ms`);
      console.log(`  Error Rate: ${(analysis.summary.errorRate * 100).toFixed(2)}%`);
      console.log(`  Slow Queries: ${analysis.summary.slowQueries}`);

      // Operation Breakdown
      console.log('\n⏱️  Operation Timing:');
      Object.entries(metrics.performance.operationTiming).forEach(([op, timing]) => {
        console.log(`  ${op.toUpperCase()}:`);
        console.log(`    Average: ${timing.avg}ms`);
        console.log(`    Range: ${timing.min}ms - ${timing.max}ms`);
        console.log(`    Count: ${timing.total}`);
      });

      // Resource Activity
      console.log('\n📈 Resource Activity:');
      Object.entries(metrics.usage.resources)
        .sort(([,a], [,b]) => {
          const totalA = Object.values(a).reduce((sum, val) => sum + val, 0);
          const totalB = Object.values(b).reduce((sum, val) => sum + val, 0);
          return totalB - totalA;
        })
        .forEach(([resource, usage]) => {
          const total = Object.values(usage).reduce((sum, val) => sum + val, 0);
          console.log(`  ${resource}: ${total} operations`);
          console.log(`    Reads: ${usage.reads}, Writes: ${usage.inserts + usage.updates + usage.deletes}`);
        });

      // Error Analysis
      if (metrics.errors.total > 0) {
        console.log('\n🚨 Error Analysis:');
        console.log(`  Total Errors: ${metrics.errors.total}`);
        console.log('  By Type:');
        Object.entries(metrics.errors.byType).forEach(([type, count]) => {
          console.log(`    ${type}: ${count}`);
        });
      }

      // Recommendations
      if (analysis.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        analysis.recommendations.forEach(rec => {
          const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
          console.log(`  ${emoji} [${rec.priority.toUpperCase()}] ${rec.message}`);
        });
      }

      // Alerts
      if (analysis.alerts.length > 0) {
        console.log('\n⚠️  Active Alerts:');
        analysis.alerts.forEach(alert => {
          console.log(`  🚨 ${alert.message}`);
        });
      }
    }

    return { metrics, analysis };
  }

  startRealTimeMonitoring(interval = 5000) {
    const monitor = setInterval(async () => {
      const metrics = await this.plugin.getMetrics();

      // Check alert conditions
      this.alertHandlers.forEach((handler, condition) => {
        if (condition(metrics)) {
          handler(metrics);
        }
      });

      // Auto-optimization suggestions
      if (metrics.performance.averageResponseTime > 1000) {
        console.log('💡 Suggestion: Consider implementing caching for frequently accessed data');
      }

      if (metrics.errors.errorRate > 0.05) {
        console.log('🚨 Alert: Error rate is above 5% - investigate immediately');
      }

    }, interval);

    return monitor;
  }
}

// Usage
const analyzer = new MetricsAnalyzer(s3db.plugins.metrics);

// Add custom alert handlers
analyzer.addAlertHandler(
  (metrics) => metrics.errors.errorRate > 0.03,
  (metrics) => console.log('🚨 Error rate alert triggered!')
);

analyzer.addAlertHandler(
  (metrics) => metrics.performance.averageResponseTime > 800,
  (metrics) => console.log('⏰ Performance degradation detected!')
);

// Generate comprehensive report
await analyzer.generateReport();

// Start real-time monitoring
const monitor = analyzer.startRealTimeMonitoring(3000);

// Stop monitoring when done
setTimeout(() => {
  clearInterval(monitor);
}, 30000);
```

---

## API Reference

### Plugin Constructor

```javascript
new MetricsPlugin({
  enabled?: boolean,
  collectPerformance?: boolean,
  collectErrors?: boolean,
  collectUsage?: boolean,
  retentionDays?: number,
  flushInterval?: number,
  sampleRate?: number,
  trackSlowQueries?: boolean,
  slowQueryThreshold?: number,
  batchSize?: number,
  alertThresholds?: object,
  onSlowQuery?: (operation: string, resource: string, duration: number) => void,
  onHighErrorRate?: (resource: string, errorRate: number) => void,
  onThresholdExceeded?: (metric: string, value: any, threshold: any) => void
})
```

### Plugin Methods

#### `getMetrics()`
Returns comprehensive metrics data.

```javascript
const metrics = await s3db.plugins.metrics.getMetrics();
```

#### `clearMetrics()`
Clears all collected metrics data.

```javascript
await s3db.plugins.metrics.clearMetrics();
```

#### `exportMetrics(format)`
Exports metrics in specified format ('json', 'csv', 'xml').

```javascript
const data = await s3db.plugins.metrics.exportMetrics('json');
```

#### `getResourceMetrics(resourceName)`
Get metrics for a specific resource.

```javascript
const userMetrics = await s3db.plugins.metrics.getResourceMetrics('users');
```

#### `getOperationMetrics(operation)`
Get metrics for a specific operation type.

```javascript
const insertMetrics = await s3db.plugins.metrics.getOperationMetrics('insert');
```

---

## Advanced Patterns

### Custom Performance Benchmarking

```javascript
class PerformanceBenchmark {
  constructor(metricsPlugin) {
    this.metrics = metricsPlugin;
    this.benchmarks = new Map();
  }

  async runBenchmark(name, testFunction, iterations = 100) {
    const startTime = Date.now();
    const startMetrics = await this.metrics.getMetrics();

    console.log(`🏃 Running benchmark: ${name} (${iterations} iterations)`);

    // Run the benchmark
    const results = [];
    for (let i = 0; i < iterations; i++) {
      const iterationStart = Date.now();
      try {
        await testFunction(i);
        results.push({ iteration: i, duration: Date.now() - iterationStart, success: true });
      } catch (error) {
        results.push({ iteration: i, duration: Date.now() - iterationStart, success: false, error });
      }
    }

    const endTime = Date.now();
    const endMetrics = await this.metrics.getMetrics();

    // Calculate benchmark statistics
    const successfulResults = results.filter(r => r.success);
    const durations = successfulResults.map(r => r.duration);

    const benchmark = {
      name,
      iterations,
      totalTime: endTime - startTime,
      successRate: successfulResults.length / iterations,
      statistics: {
        average: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        median: durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
      },
      throughput: successfulResults.length / ((endTime - startTime) / 1000), // operations per second
      metricsDiff: {
        operationsDiff: endMetrics.usage.totalOperations - startMetrics.usage.totalOperations,
        errorsDiff: endMetrics.errors.total - startMetrics.errors.total
      }
    };

    this.benchmarks.set(name, benchmark);

    console.log(`✅ Benchmark completed: ${name}`);
    console.log(`  Success Rate: ${(benchmark.successRate * 100).toFixed(1)}%`);
    console.log(`  Average Time: ${benchmark.statistics.average.toFixed(2)}ms`);
    console.log(`  Throughput: ${benchmark.throughput.toFixed(2)} ops/sec`);

    return benchmark;
  }

  compareBenchmarks(name1, name2) {
    const bench1 = this.benchmarks.get(name1);
    const bench2 = this.benchmarks.get(name2);

    if (!bench1 || !bench2) {
      throw new Error('One or both benchmarks not found');
    }

    const comparison = {
      throughputRatio: bench2.throughput / bench1.throughput,
      averageTimeRatio: bench1.statistics.average / bench2.statistics.average,
      successRateComparison: bench2.successRate - bench1.successRate
    };

    console.log(`\n📊 Benchmark Comparison: ${name1} vs ${name2}`);
    console.log(`  Throughput: ${comparison.throughputRatio.toFixed(2)}x ${comparison.throughputRatio > 1 ? 'faster' : 'slower'}`);
    console.log(`  Average Time: ${comparison.averageTimeRatio.toFixed(2)}x ${comparison.averageTimeRatio > 1 ? 'faster' : 'slower'}`);
    console.log(`  Success Rate: ${comparison.successRateComparison >= 0 ? '+' : ''}${(comparison.successRateComparison * 100).toFixed(1)}%`);

    return comparison;
  }
}

// Usage
const benchmark = new PerformanceBenchmark(s3db.plugins.metrics);
const users = s3db.resource('users');

// Benchmark individual inserts
await benchmark.runBenchmark('individual-inserts', async (i) => {
  await users.insert({ name: `User ${i}`, email: `user${i}@test.com` });
}, 50);

// Benchmark batch inserts
await benchmark.runBenchmark('batch-inserts', async (i) => {
  const batchData = Array.from({ length: 10 }, (_, j) => ({
    name: `Batch User ${i}-${j}`,
    email: `batchuser${i}-${j}@test.com`
  }));
  await users.insertMany(batchData);
}, 5);

// Compare benchmarks
benchmark.compareBenchmarks('individual-inserts', 'batch-inserts');
```

### Resource Health Monitoring

```javascript
class ResourceHealthMonitor {
  constructor(metricsPlugin) {
    this.metrics = metricsPlugin;
    this.healthThresholds = {
      errorRate: 0.05,        // 5%
      avgResponseTime: 1000,  // 1 second
      throughput: 1           // 1 operation per second minimum
    };
  }

  async assessResourceHealth(resourceName) {
    const metrics = await this.metrics.getResourceMetrics(resourceName);

    if (!metrics) {
      return { resource: resourceName, status: 'unknown', issues: ['No metrics available'] };
    }

    const assessment = {
      resource: resourceName,
      status: 'healthy',
      issues: [],
      metrics: metrics,
      recommendations: []
    };

    // Check error rate
    if (metrics.errorRate > this.healthThresholds.errorRate) {
      assessment.status = 'unhealthy';
      assessment.issues.push(`High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      assessment.recommendations.push('Investigate error causes and implement error handling');
    }

    // Check response time
    if (metrics.avgResponseTime > this.healthThresholds.avgResponseTime) {
      if (assessment.status === 'healthy') assessment.status = 'warning';
      assessment.issues.push(`Slow response time: ${metrics.avgResponseTime}ms`);
      assessment.recommendations.push('Consider optimizing queries or adding caching');
    }

    // Check throughput
    if (metrics.throughput < this.healthThresholds.throughput) {
      if (assessment.status === 'healthy') assessment.status = 'warning';
      assessment.issues.push(`Low throughput: ${metrics.throughput} ops/sec`);
      assessment.recommendations.push('Investigate performance bottlenecks');
    }

    // Check for imbalanced operations
    const writes = metrics.operations.inserts + metrics.operations.updates + metrics.operations.deletes;
    const reads = metrics.operations.reads;
    if (writes > 0 && reads / writes < 0.1) {
      assessment.recommendations.push('Consider implementing read caching due to low read/write ratio');
    }

    return assessment;
  }

  async generateHealthReport() {
    const allMetrics = await this.metrics.getMetrics();
    const resourceNames = Object.keys(allMetrics.usage.resources);

    const healthReport = {
      timestamp: new Date().toISOString(),
      overallStatus: 'healthy',
      resources: [],
      summary: {
        healthy: 0,
        warning: 0,
        unhealthy: 0,
        unknown: 0
      }
    };

    // Assess each resource
    for (const resourceName of resourceNames) {
      const assessment = await this.assessResourceHealth(resourceName);
      healthReport.resources.push(assessment);
      healthReport.summary[assessment.status]++;
    }

    // Determine overall status
    if (healthReport.summary.unhealthy > 0) {
      healthReport.overallStatus = 'unhealthy';
    } else if (healthReport.summary.warning > 0) {
      healthReport.overallStatus = 'warning';
    }

    return healthReport;
  }

  printHealthReport(report) {
    console.log('\n🏥 RESOURCE HEALTH REPORT');
    console.log('========================');
    console.log(`Overall Status: ${this.getStatusEmoji(report.overallStatus)} ${report.overallStatus.toUpperCase()}`);
    console.log(`Generated: ${report.timestamp}`);

    console.log('\n📊 Summary:');
    console.log(`  🟢 Healthy: ${report.summary.healthy}`);
    console.log(`  🟡 Warning: ${report.summary.warning}`);
    console.log(`  🔴 Unhealthy: ${report.summary.unhealthy}`);
    console.log(`  ⚪ Unknown: ${report.summary.unknown}`);

    console.log('\n📋 Resource Details:');
    report.resources.forEach(resource => {
      console.log(`\n${this.getStatusEmoji(resource.status)} ${resource.resource}:`);
      console.log(`  Status: ${resource.status.toUpperCase()}`);

      if (resource.issues.length > 0) {
        console.log('  Issues:');
        resource.issues.forEach(issue => console.log(`    • ${issue}`));
      }

      if (resource.recommendations.length > 0) {
        console.log('  Recommendations:');
        resource.recommendations.forEach(rec => console.log(`    💡 ${rec}`));
      }
    });
  }

  getStatusEmoji(status) {
    const emojis = {
      healthy: '🟢',
      warning: '🟡',
      unhealthy: '🔴',
      unknown: '⚪'
    };
    return emojis[status] || '⚪';
  }
}

// Usage
const healthMonitor = new ResourceHealthMonitor(s3db.plugins.metrics);

// Generate and print health report
const healthReport = await healthMonitor.generateHealthReport();
healthMonitor.printHealthReport(healthReport);

// Monitor health continuously
setInterval(async () => {
  const report = await healthMonitor.generateHealthReport();
  if (report.overallStatus !== 'healthy') {
    console.log(`🚨 Health Alert: System status is ${report.overallStatus}`);
    healthMonitor.printHealthReport(report);
  }
}, 60000); // Check every minute
```

---

## Best Practices

### 1. Configure Appropriate Sampling

```javascript
// For high-volume production environments
{
  sampleRate: 0.1, // 10% sampling
  flushInterval: 60000 // 1 minute
}

// For development/testing
{
  sampleRate: 1.0, // 100% sampling
  flushInterval: 10000 // 10 seconds
}
```

### 2. Set Meaningful Thresholds

```javascript
{
  slowQueryThreshold: 500, // 500ms for web applications
  alertThresholds: {
    errorRate: 0.01,        // 1% for critical systems
    avgResponseTime: 200    // 200ms for responsive UIs
  }
}
```

### 3. Implement Tiered Alerting

```javascript
{
  onSlowQuery: (operation, resource, duration) => {
    if (duration > 2000) {
      // Critical alert
      sendPagerDutyAlert(`Critical slow query: ${operation} on ${resource}`);
    } else if (duration > 1000) {
      // Warning alert
      sendSlackAlert(`Slow query warning: ${operation} on ${resource}`);
    }
  }
}
```

### 4. Regular Performance Reviews

```javascript
// Schedule regular performance reviews
const schedulePerformanceReview = () => {
  setInterval(async () => {
    const metrics = await s3db.plugins.metrics.getMetrics();

    // Generate weekly performance report
    const report = {
      week: new Date().toISOString().substring(0, 10),
      summary: {
        totalOperations: metrics.usage.totalOperations,
        avgResponseTime: metrics.performance.averageResponseTime,
        errorRate: metrics.errors.errorRate
      },
      trends: analyzeWeeklyTrends(metrics),
      recommendations: generateRecommendations(metrics)
    };

    // Send to team
    console.log('📧 Weekly performance report generated');

  }, 7 * 24 * 60 * 60 * 1000); // Weekly
};
```

### 5. Optimize Based on Metrics

```javascript
// Use metrics to guide optimization decisions
async function optimizeBasedOnMetrics() {
  const metrics = await s3db.plugins.metrics.getMetrics();

  // Identify slow operations
  const slowOperations = metrics.performance.slowestOperations;
  for (const op of slowOperations) {
    if (op.operation === 'list' && op.avgTime > 500) {
      console.log(`💡 Consider adding pagination to ${op.resource} list operations`);
    }

    if (op.operation === 'get' && op.avgTime > 200) {
      console.log(`💡 Consider adding caching for ${op.resource} get operations`);
    }
  }

  // Check cache effectiveness
  if (metrics.cache && metrics.cache.hitRate < 0.6) {
    console.log('💡 Cache hit rate is low - consider adjusting TTL or cache strategy');
  }

  // Resource usage optimization
  Object.entries(metrics.usage.resources).forEach(([resource, usage]) => {
    const readWriteRatio = usage.reads / (usage.inserts + usage.updates + usage.deletes);
    if (readWriteRatio > 10) {
      console.log(`💡 ${resource} has high read/write ratio - excellent cache candidate`);
    }
  });
}
```

---

## Troubleshooting

### Issue: High memory usage from metrics
**Solution**: Reduce `sampleRate`, increase `flushInterval`, or decrease `retentionDays`.

### Issue: Metrics showing incorrect data
**Solution**: Ensure proper plugin initialization and check for sampling rate effects.

### Issue: Performance impact from metrics collection
**Solution**: Reduce sampling rate or disable less critical metrics collection.

### Issue: Slow metrics queries
**Solution**: Implement metrics data archiving and use appropriate batch sizes.

### Issue: Missing alerts
**Solution**: Verify alert thresholds and callback functions are properly configured.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Cache Plugin](./cache.md) - Improve performance based on metrics insights
- [Audit Plugin](./audit.md) - Combine with audit logs for complete observability
- [Costs Plugin](./costs.md) - Monitor costs alongside performance metrics

## ❓ FAQ

### Básico

**P: O que o MetricsPlugin monitora?**
R: Performance (duração), errors e contadores de operações para todos os recursos e operações (insert, update, delete, get, list, etc).

**P: Onde as métricas são armazenadas?**
R: Em três recursos S3DB: `plg_metrics` (operações), `plg_error_logs` (erros), `plg_performance_logs` (performance detalhada).

**P: Qual o overhead de performance?**
R: Mínimo (<1ms por operação). O plugin usa wrapping de métodos e flush periódico para não bloquear operações.

### Configuração

**P: Como desabilitar coleta de performance?**
R: Configure `collectPerformance: false`:
```javascript
new MetricsPlugin({
  collectPerformance: false,
  collectErrors: true
})
```

**P: Como configurar o intervalo de flush?**
R: Use `flushInterval`:
```javascript
new MetricsPlugin({
  flushInterval: 30000  // 30 segundos (padrão: 60000)
})
```

**P: Como configurar retenção de dados?**
R: Use `retentionDays`:
```javascript
new MetricsPlugin({
  retentionDays: 7  // 7 dias (padrão: 30)
})
```

**P: Posso monitorar apenas recursos específicos?**
R: Sim, use `include` ou `exclude`:
```javascript
new MetricsPlugin({
  include: ['users', 'orders']  // Apenas estes
})
```

### Operações

**P: Como obter métricas agregadas?**
R: Use `getMetrics`:
```javascript
const metrics = await metricsPlugin.getMetrics({
  resourceName: 'users',
  operation: 'get',
  startDate: '2025-01-01',
  limit: 100
});
```

**P: Como obter estatísticas resumidas?**
R: Use `getStats`:
```javascript
const stats = await metricsPlugin.getStats();
// Retorna: totalOperations, avgResponseTime, operationsByType, errorRate, etc.
```

**P: Como consultar logs de erro?**
R: Use `getErrorLogs`:
```javascript
const errors = await metricsPlugin.getErrorLogs({
  resourceName: 'orders',
  operation: 'insert',
  limit: 50
});
```

### Manutenção

**P: Como fazer cleanup de dados antigos?**
R: Use `cleanupOldData`:
```javascript
await metricsPlugin.cleanupOldData();
// Remove dados mais antigos que retentionDays
```

**P: Como forçar flush das métricas?**
R: Use `flushMetrics`:
```javascript
await metricsPlugin.flushMetrics();
// Persiste métricas em buffer no database
```

### Troubleshooting

**P: Métricas não estão sendo coletadas?**
R: Verifique:
1. Plugin foi instalado ANTES de criar os recursos
2. `NODE_ENV !== 'test'` (métricas desabilitadas em testes por padrão)
3. Recursos não estão em `exclude`

**P: Como debugar métricas?**
R: Verifique o objeto interno e ative verbose:
```javascript
new MetricsPlugin({ verbose: true });
console.log(metricsPlugin.metrics);
```

**P: Performance está degradando?**
R: Aumente o `flushInterval` ou desabilite `collectPerformance`:
```javascript
new MetricsPlugin({
  flushInterval: 300000,  // 5 minutos
  collectPerformance: false
})
```

---

## 🔥 Prometheus Integration

The Metrics Plugin can export metrics in Prometheus text-based format for integration with Prometheus monitoring and Grafana dashboards.

### Quick Start

```javascript
// Auto mode (default) - uses API Plugin if available, otherwise standalone server
await db.usePlugin(new MetricsPlugin({
  prometheus: { enabled: true }
}));

// Access metrics:
// - If API Plugin active: GET http://localhost:3000/metrics
// - Otherwise: GET http://localhost:9090/metrics
```

### Configuration Modes

The Prometheus exporter supports **3 modes** to fit different deployment scenarios:

#### 1. **Auto Mode** (Recommended)

Automatically detects if API Plugin is active:
- **With API Plugin**: Exposes `/metrics` on same port (integrated)
- **Without API Plugin**: Creates standalone server on port 9090

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'auto'  // Default
  }
}));
```

**Use when**: You want zero configuration and automatic detection.

#### 2. **Integrated Mode**

Forces integration with API Plugin (same HTTP server):

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'integrated',  // Requires API Plugin
    path: '/metrics'     // Custom path (optional)
  }
}));

// Metrics available at: GET http://localhost:3000/metrics
```

**Use when**: You want all traffic on one port (recommended for Kubernetes).

**Benefits:**
- ✅ Single scrape target for Prometheus
- ✅ Reuses existing server
- ✅ Documented in Swagger UI
- ✅ Same port for API + metrics + health checks

#### 3. **Standalone Mode**

Always creates separate HTTP server for metrics:

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'standalone',  // Separate server
    port: 9090,          // Metrics-only port
    path: '/metrics'
  }
}));

// Metrics available at: GET http://localhost:9090/metrics
```

**Use when**:
- Security: Metrics on internal port, API on public port
- No API Plugin in use
- Legacy Prometheus setup expects separate port

---

### Exported Metrics

The plugin exports the following metrics in Prometheus format:

#### **Counters** (always increasing):

- `s3db_operations_total{operation, resource}` - Total operations by type and resource
- `s3db_operation_errors_total{operation, resource}` - Total errors by operation

#### **Gauges** (can increase or decrease):

- `s3db_operation_duration_seconds{operation, resource}` - Average operation duration
- `s3db_uptime_seconds` - Process uptime in seconds
- `s3db_resources_total` - Total number of tracked resources
- `s3db_info{version, node_version}` - Build information (always 1)

#### Example Output:

```
# HELP s3db_operations_total Total number of operations by type and resource
# TYPE s3db_operations_total counter
s3db_operations_total{operation="insert",resource="cars"} 1523
s3db_operations_total{operation="update",resource="cars"} 342
s3db_operations_total{operation="get",resource="users"} 8945

# HELP s3db_operation_duration_seconds Average operation duration in seconds
# TYPE s3db_operation_duration_seconds gauge
s3db_operation_duration_seconds{operation="insert",resource="cars"} 0.045
s3db_operation_duration_seconds{operation="update",resource="cars"} 0.032

# HELP s3db_operation_errors_total Total number of operation errors
# TYPE s3db_operation_errors_total counter
s3db_operation_errors_total{operation="insert",resource="cars"} 12

# HELP s3db_uptime_seconds Process uptime in seconds
# TYPE s3db_uptime_seconds gauge
s3db_uptime_seconds 3600.5

# HELP s3db_resources_total Total number of tracked resources
# TYPE s3db_resources_total gauge
s3db_resources_total 5

# HELP s3db_info Build and runtime information
# TYPE s3db_info gauge
s3db_info{version="1.0.0",node_version="20.11.0"} 1
```

---

### Kubernetes Configuration

#### ServiceMonitor (Prometheus Operator)

For **integrated mode** (metrics on same port as API):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: s3db-api-metrics
  namespace: s3db-api
  labels:
    app: s3db-api
spec:
  selector:
    matchLabels:
      app: s3db-api
  endpoints:
  - port: http          # Same port as API
    path: /metrics      # Metrics endpoint
    interval: 30s       # Scrape every 30s
    scrapeTimeout: 10s
```

For **standalone mode** (separate port):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: s3db-metrics
  namespace: s3db-api
spec:
  selector:
    matchLabels:
      app: s3db-api
  endpoints:
  - port: metrics       # Separate metrics port
    path: /metrics
    interval: 30s
```

**Service definition (standalone mode):**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: s3db-api
  namespace: s3db-api
spec:
  selector:
    app: s3db-api
  ports:
  - name: http
    port: 80
    targetPort: 3000
  - name: metrics       # Additional port for metrics
    port: 9090
    targetPort: 9090
```

#### Pod Annotations (Auto-discovery)

For **integrated mode**, add annotations to Pod:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: s3db-api
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: api
        image: my-s3db-api:latest
        ports:
        - containerPort: 3000
          name: http
```

---

### Traditional Prometheus Configuration

#### Scrape Config (Integrated Mode)

```yaml
scrape_configs:
  - job_name: 's3db-api'
    static_configs:
      - targets: ['s3db-api:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

#### Scrape Config (Standalone Mode)

```yaml
scrape_configs:
  - job_name: 's3db-metrics'
    static_configs:
      - targets: ['s3db-api:9090']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

#### Kubernetes Service Discovery

```yaml
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # Only scrape pods with prometheus.io/scrape=true annotation
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      # Get port from annotation
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      # Get path from annotation
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
```

---

### Grafana Dashboard

Example PromQL queries for Grafana:

#### **Operation Rate:**
```promql
rate(s3db_operations_total[5m])
```

#### **Average Operation Duration:**
```promql
avg(s3db_operation_duration_seconds) by (operation)
```

#### **Error Rate:**
```promql
rate(s3db_operation_errors_total[5m])
```

#### **Total Operations by Resource:**
```promql
sum(s3db_operations_total) by (resource)
```

#### **Slowest Operations:**
```promql
topk(10, s3db_operation_duration_seconds)
```

---

### Complete Example

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js/plugins';
import { MetricsPlugin } from 's3db.js/plugins';

const db = new Database({ useFakeS3: true });
await db.connect();

// Setup API Plugin (port 3000)
await db.usePlugin(new ApiPlugin({ port: 3000 }));

// Setup Metrics Plugin (auto mode - integrates with API)
await db.usePlugin(new MetricsPlugin({
  collectPerformance: true,
  collectErrors: true,

  prometheus: {
    enabled: true,
    mode: 'auto',  // Will use port 3000 automatically
    path: '/metrics'
  }
}));

// Create resources and perform operations
const cars = await db.createResource({
  name: 'cars',
  attributes: {
    brand: 'string|required',
    model: 'string|required'
  }
});

// Operations are automatically tracked
await cars.insert({ brand: 'Toyota', model: 'Corolla' });
await cars.insert({ brand: 'Honda', model: 'Civic' });
await cars.list();

// Metrics available at:
// GET http://localhost:3000/metrics
// GET http://localhost:3000/docs (Swagger UI includes /metrics)
```

---

### Testing Metrics

```bash
# Test integrated mode
curl http://localhost:3000/metrics

# Test standalone mode
curl http://localhost:9090/metrics

# Validate Prometheus format
curl http://localhost:3000/metrics | promtool check metrics

# Test with Prometheus locally
docker run -p 9091:9090 -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
```

**prometheus.yml:**
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 's3db'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
```

---

### Best Practices

1. **Use Integrated Mode in Kubernetes**: Single scrape target simplifies configuration
2. **Set Scrape Interval**: 30s is good default, adjust based on workload
3. **Monitor Error Rates**: Alert on `s3db_operation_errors_total` increases
4. **Track Duration**: Set alerts for slow operations (>100ms for simple ops)
5. **Use Labels Wisely**: `resource` and `operation` labels enable detailed filtering

---

### Troubleshooting

**Q: Metrics endpoint returns 404?**
A: Check:
1. Prometheus is enabled: `prometheus.enabled: true`
2. If using `mode: 'integrated'`, ensure API Plugin is active
3. Correct path (default: `/metrics`)

**Q: Metrics are empty/zero?**
A:
1. Ensure operations have been performed (metrics are collected in-memory)
2. Check `flushInterval` hasn't reset counters
3. Verify MetricsPlugin was installed BEFORE performing operations

**Q: Standalone server won't start?**
A:
1. Check port 9090 is not in use: `lsof -i :9090`
2. Verify `mode: 'standalone'` is set
3. Check console for error messages

**Q: How to disable Prometheus?**
A:
```javascript
new MetricsPlugin({
  prometheus: { enabled: false }
})
```

---
