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
