# Usage Patterns

> **In this guide:** Examples, advanced patterns, and monitoring techniques.

**Navigation:** [← Back to Metrics Plugin](../README.md) | [Configuration](./configuration.md)

---

## Basic Performance Monitoring

```javascript
import { S3db } from 's3db.js';
import { MetricsPlugin } from 's3db.js';

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

const orders = s3db.resources.orders;

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

---

## Advanced Metrics Analysis

```javascript
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
      return writes > 0 && (reads / writes) < 0.1;
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
      console.log('\n=== COMPREHENSIVE METRICS REPORT ===');

      console.log('\nPerformance Summary:');
      console.log(`  Total Operations: ${analysis.summary.totalOperations.toLocaleString()}`);
      console.log(`  Average Response Time: ${analysis.summary.avgResponseTime}ms`);
      console.log(`  Error Rate: ${(analysis.summary.errorRate * 100).toFixed(2)}%`);
      console.log(`  Slow Queries: ${analysis.summary.slowQueries}`);

      console.log('\nOperation Timing:');
      Object.entries(metrics.performance.operationTiming).forEach(([op, timing]) => {
        console.log(`  ${op.toUpperCase()}:`);
        console.log(`    Average: ${timing.avg}ms`);
        console.log(`    Range: ${timing.min}ms - ${timing.max}ms`);
        console.log(`    Count: ${timing.total}`);
      });

      console.log('\nResource Activity:');
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

      if (metrics.errors.total > 0) {
        console.log('\nError Analysis:');
        console.log(`  Total Errors: ${metrics.errors.total}`);
        console.log('  By Type:');
        Object.entries(metrics.errors.byType).forEach(([type, count]) => {
          console.log(`    ${type}: ${count}`);
        });
      }

      if (analysis.recommendations.length > 0) {
        console.log('\nRecommendations:');
        analysis.recommendations.forEach(rec => {
          const priority = rec.priority === 'high' ? '[HIGH]' : rec.priority === 'medium' ? '[MEDIUM]' : '[LOW]';
          console.log(`  ${priority} ${rec.message}`);
        });
      }

      if (analysis.alerts.length > 0) {
        console.log('\nActive Alerts:');
        analysis.alerts.forEach(alert => {
          console.log(`  ${alert.message}`);
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
        console.log('Suggestion: Consider implementing caching for frequently accessed data');
      }

      if (metrics.errors.errorRate > 0.05) {
        console.log('Alert: Error rate is above 5% - investigate immediately');
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
  (metrics) => console.log('Error rate alert triggered!')
);

analyzer.addAlertHandler(
  (metrics) => metrics.performance.averageResponseTime > 800,
  (metrics) => console.log('Performance degradation detected!')
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

## Custom Performance Benchmarking

```javascript
import { MetricsError } from 's3db.js';

class PerformanceBenchmark {
  constructor(metricsPlugin) {
    this.metrics = metricsPlugin;
    this.benchmarks = new Map();
  }

  async runBenchmark(name, testFunction, iterations = 100) {
    const startTime = Date.now();
    const startMetrics = await this.metrics.getMetrics();

    console.log(`Running benchmark: ${name} (${iterations} iterations)`);

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
      throughput: successfulResults.length / ((endTime - startTime) / 1000),
      metricsDiff: {
        operationsDiff: endMetrics.usage.totalOperations - startMetrics.usage.totalOperations,
        errorsDiff: endMetrics.errors.total - startMetrics.errors.total
      }
    };

    this.benchmarks.set(name, benchmark);

    console.log(`Benchmark completed: ${name}`);
    console.log(`  Success Rate: ${(benchmark.successRate * 100).toFixed(1)}%`);
    console.log(`  Average Time: ${benchmark.statistics.average.toFixed(2)}ms`);
    console.log(`  Throughput: ${benchmark.throughput.toFixed(2)} ops/sec`);

    return benchmark;
  }

  compareBenchmarks(name1, name2) {
    const bench1 = this.benchmarks.get(name1);
    const bench2 = this.benchmarks.get(name2);

    if (!bench1 || !bench2) {
      throw new MetricsError('Metrics benchmarks not found for comparison', {
        statusCode: 404,
        retriable: false,
        suggestion: 'Run benchmark.runBenchmark() for both names before comparing.',
        metadata: { missing: [!bench1 ? name1 : null, !bench2 ? name2 : null].filter(Boolean) },
        operation: 'compareBenchmarks'
      });
    }

    const comparison = {
      throughputRatio: bench2.throughput / bench1.throughput,
      averageTimeRatio: bench1.statistics.average / bench2.statistics.average,
      successRateComparison: bench2.successRate - bench1.successRate
    };

    console.log(`\nBenchmark Comparison: ${name1} vs ${name2}`);
    console.log(`  Throughput: ${comparison.throughputRatio.toFixed(2)}x ${comparison.throughputRatio > 1 ? 'faster' : 'slower'}`);
    console.log(`  Average Time: ${comparison.averageTimeRatio.toFixed(2)}x ${comparison.averageTimeRatio > 1 ? 'faster' : 'slower'}`);
    console.log(`  Success Rate: ${comparison.successRateComparison >= 0 ? '+' : ''}${(comparison.successRateComparison * 100).toFixed(1)}%`);

    return comparison;
  }
}

// Usage
const benchmark = new PerformanceBenchmark(s3db.plugins.metrics);
const users = s3db.resources.users;

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

---

## Resource Health Monitoring

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

    for (const resourceName of resourceNames) {
      const assessment = await this.assessResourceHealth(resourceName);
      healthReport.resources.push(assessment);
      healthReport.summary[assessment.status]++;
    }

    if (healthReport.summary.unhealthy > 0) {
      healthReport.overallStatus = 'unhealthy';
    } else if (healthReport.summary.warning > 0) {
      healthReport.overallStatus = 'warning';
    }

    return healthReport;
  }
}

// Usage
const healthMonitor = new ResourceHealthMonitor(s3db.plugins.metrics);

// Generate and print health report
const healthReport = await healthMonitor.generateHealthReport();
console.log('Health Report:', JSON.stringify(healthReport, null, 2));

// Monitor health continuously
setInterval(async () => {
  const report = await healthMonitor.generateHealthReport();
  if (report.overallStatus !== 'healthy') {
    console.log(`Health Alert: System status is ${report.overallStatus}`);
  }
}, 60000); // Check every minute
```

---

## See Also

- [Configuration](./configuration.md) - Detailed configuration options
- [Prometheus Integration](./prometheus.md) - Prometheus and Datadog setup
- [Best Practices](./best-practices.md) - Recommendations and FAQ
