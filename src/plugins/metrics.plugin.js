import Plugin from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";

export class MetricsPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.config = {
      enabled: options.enabled !== false,
      collectPerformance: options.collectPerformance !== false,
      collectErrors: options.collectErrors !== false,
      collectUsage: options.collectUsage !== false,
      retentionDays: options.retentionDays || 30,
      flushInterval: options.flushInterval || 60000, // 1 minute
      ...options
    };
    
    this.metrics = {
      operations: {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      },
      resources: {},
      errors: [],
      performance: [],
      startTime: new Date().toISOString()
    };
    
    this.flushTimer = null;
  }

  async setup(database) {
    this.database = database;
    if (!this.config.enabled || process.env.NODE_ENV === 'test') return;

    const [ok, err] = await tryFn(async () => {
      const [ok1, err1, metricsResource] = await tryFn(() => database.createResource({
        name: 'metrics',
        attributes: {
          id: 'string|required',
          type: 'string|required', // 'operation', 'error', 'performance'
          resourceName: 'string',
          operation: 'string',
          count: 'number|required',
          totalTime: 'number|required',
          errors: 'number|required',
          avgTime: 'number|required',
          timestamp: 'string|required',
          metadata: 'json'
        }
      }));
      this.metricsResource = ok1 ? metricsResource : database.resources.metrics;

      const [ok2, err2, errorsResource] = await tryFn(() => database.createResource({
        name: 'error_logs',
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          operation: 'string|required',
          error: 'string|required',
          timestamp: 'string|required',
          metadata: 'json'
        }
      }));
      this.errorsResource = ok2 ? errorsResource : database.resources.error_logs;

      const [ok3, err3, performanceResource] = await tryFn(() => database.createResource({
        name: 'performance_logs',
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          operation: 'string|required',
          duration: 'number|required',
          timestamp: 'string|required',
          metadata: 'json'
        }
      }));
      this.performanceResource = ok3 ? performanceResource : database.resources.performance_logs;
    });
    if (!ok) {
      // Resources might already exist
      this.metricsResource = database.resources.metrics;
      this.errorsResource = database.resources.error_logs;
      this.performanceResource = database.resources.performance_logs;
    }

    // Install hooks for all resources except metrics resources
    this.installMetricsHooks();
    
    // Disable flush timer during tests to avoid side effects
    if (process.env.NODE_ENV !== 'test') {
      this.startFlushTimer();
    }
  }

  async start() {
    // Plugin is ready
  }

  async stop() {
    // Stop flush timer and flush remaining metrics
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Don't flush metrics during tests
    if (process.env.NODE_ENV !== 'test') {
      await this.flushMetrics();
    }
  }

  installMetricsHooks() {
    // Only hook into non-metrics resources
    for (const resource of Object.values(this.database.resources)) {
      if (['metrics', 'error_logs', 'performance_logs'].includes(resource.name)) {
        continue; // Skip metrics resources to avoid recursion
      }
      
      this.installResourceHooks(resource);
    }

    // Hook into database proxy for new resources
    this.database._createResource = this.database.createResource;
    this.database.createResource = async function (...args) {
      const resource = await this._createResource(...args);
      if (this.plugins?.metrics && !['metrics', 'error_logs', 'performance_logs'].includes(resource.name)) {
        this.plugins.metrics.installResourceHooks(resource);
      }
      return resource;
    };
  }

  installResourceHooks(resource) {
    // Store original methods
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    resource._get = resource.get;
    resource._getMany = resource.getMany;
    resource._getAll = resource.getAll;
    resource._list = resource.list;
    resource._listIds = resource.listIds;
    resource._count = resource.count;
    resource._page = resource.page;

    // Hook insert operations
    resource.insert = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._insert(...args));
      this.recordOperation(resource.name, 'insert', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'insert', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook update operations
    resource.update = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._update(...args));
      this.recordOperation(resource.name, 'update', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'update', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook delete operations
    resource.delete = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._delete(...args));
      this.recordOperation(resource.name, 'delete', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'delete', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook deleteMany operations
    resource.deleteMany = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._deleteMany(...args));
      this.recordOperation(resource.name, 'delete', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'delete', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook get operations
    resource.get = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._get(...args));
      this.recordOperation(resource.name, 'get', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'get', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook getMany operations
    resource.getMany = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getMany(...args));
      this.recordOperation(resource.name, 'get', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'get', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook getAll operations
    resource.getAll = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getAll(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook list operations
    resource.list = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._list(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook listIds operations
    resource.listIds = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._listIds(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook count operations
    resource.count = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._count(...args));
      this.recordOperation(resource.name, 'count', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'count', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook page operations
    resource.page = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._page(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);
  }

  recordOperation(resourceName, operation, duration, isError) {
    // Update global metrics
    if (this.metrics.operations[operation]) {
      this.metrics.operations[operation].count++;
      this.metrics.operations[operation].totalTime += duration;
      if (isError) {
        this.metrics.operations[operation].errors++;
      }
    }

    // Update resource-specific metrics
    if (!this.metrics.resources[resourceName]) {
      this.metrics.resources[resourceName] = {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      };
    }

    if (this.metrics.resources[resourceName][operation]) {
      this.metrics.resources[resourceName][operation].count++;
      this.metrics.resources[resourceName][operation].totalTime += duration;
      if (isError) {
        this.metrics.resources[resourceName][operation].errors++;
      }
    }

    // Record performance data if enabled
    if (this.config.collectPerformance) {
      this.metrics.performance.push({
        resourceName,
        operation,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  }

  recordError(resourceName, operation, error) {
    if (!this.config.collectErrors) return;

    this.metrics.errors.push({
      resourceName,
      operation,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Only start timer if flushInterval is greater than 0
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flushMetrics().catch(console.error);
      }, this.config.flushInterval);
    }
  }

  async flushMetrics() {
    if (!this.metricsResource) return;

    const [ok, err] = await tryFn(async () => {
      // Use empty metadata during tests to avoid header issues
      const metadata = process.env.NODE_ENV === 'test' ? {} : { global: 'true' };
      const perfMetadata = process.env.NODE_ENV === 'test' ? {} : { perf: 'true' };
      const errorMetadata = process.env.NODE_ENV === 'test' ? {} : { error: 'true' };
      const resourceMetadata = process.env.NODE_ENV === 'test' ? {} : { resource: 'true' };

      // Flush operation metrics
      for (const [operation, data] of Object.entries(this.metrics.operations)) {
        if (data.count > 0) {
          await this.metricsResource.insert({
            id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'operation',
            resourceName: 'global',
            operation,
            count: data.count,
            totalTime: data.totalTime,
            errors: data.errors,
            avgTime: data.count > 0 ? data.totalTime / data.count : 0,
            timestamp: new Date().toISOString(),
            metadata
          });
        }
      }

      // Flush resource-specific metrics
      for (const [resourceName, operations] of Object.entries(this.metrics.resources)) {
        for (const [operation, data] of Object.entries(operations)) {
          if (data.count > 0) {
            await this.metricsResource.insert({
              id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'operation',
              resourceName,
              operation,
              count: data.count,
              totalTime: data.totalTime,
              errors: data.errors,
              avgTime: data.count > 0 ? data.totalTime / data.count : 0,
              timestamp: new Date().toISOString(),
              metadata: resourceMetadata
            });
          }
        }
      }

      // Flush performance logs
      if (this.config.collectPerformance && this.metrics.performance.length > 0) {
        for (const perf of this.metrics.performance) {
          await this.performanceResource.insert({
            id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: perf.resourceName,
            operation: perf.operation,
            duration: perf.duration,
            timestamp: perf.timestamp,
            metadata: perfMetadata
          });
        }
      }

      // Flush error logs
      if (this.config.collectErrors && this.metrics.errors.length > 0) {
        for (const error of this.metrics.errors) {
          await this.errorsResource.insert({
            id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: error.resourceName,
            operation: error.operation,
            error: error.error,
            stack: error.stack,
            timestamp: error.timestamp,
            metadata: errorMetadata
          });
        }
      }

      // Reset metrics after flushing
      this.resetMetrics();
    });
    if (!ok) {
      console.error('Failed to flush metrics:', err);
    }
  }

  resetMetrics() {
    // Reset operation metrics
    for (const operation of Object.keys(this.metrics.operations)) {
      this.metrics.operations[operation] = { count: 0, totalTime: 0, errors: 0 };
    }

    // Reset resource metrics
    for (const resourceName of Object.keys(this.metrics.resources)) {
      for (const operation of Object.keys(this.metrics.resources[resourceName])) {
        this.metrics.resources[resourceName][operation] = { count: 0, totalTime: 0, errors: 0 };
      }
    }

    // Clear performance and error arrays
    this.metrics.performance = [];
    this.metrics.errors = [];
  }

  // Utility methods
  async getMetrics(options = {}) {
    const {
      type = 'operation',
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    if (!this.metricsResource) return [];

    const allMetrics = await this.metricsResource.getAll();
    
    let filtered = allMetrics.filter(metric => {
      if (type && metric.type !== type) return false;
      if (resourceName && metric.resourceName !== resourceName) return false;
      if (operation && metric.operation !== operation) return false;
      if (startDate && new Date(metric.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(metric.timestamp) > new Date(endDate)) return false;
      return true;
    });

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return filtered.slice(offset, offset + limit);
  }

  async getErrorLogs(options = {}) {
    if (!this.errorsResource) return [];

    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    const allErrors = await this.errorsResource.getAll();
    
    let filtered = allErrors.filter(error => {
      if (resourceName && error.resourceName !== resourceName) return false;
      if (operation && error.operation !== operation) return false;
      if (startDate && new Date(error.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(error.timestamp) > new Date(endDate)) return false;
      return true;
    });

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return filtered.slice(offset, offset + limit);
  }

  async getPerformanceLogs(options = {}) {
    if (!this.performanceResource) return [];

    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    const allPerformance = await this.performanceResource.getAll();
    
    let filtered = allPerformance.filter(perf => {
      if (resourceName && perf.resourceName !== resourceName) return false;
      if (operation && perf.operation !== operation) return false;
      if (startDate && new Date(perf.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(perf.timestamp) > new Date(endDate)) return false;
      return true;
    });

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return filtered.slice(offset, offset + limit);
  }

  async getStats() {
    const now = new Date();
    const startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // Last 24 hours

    const [metrics, errors, performance] = await Promise.all([
      this.getMetrics({ startDate: startDate.toISOString() }),
      this.getErrorLogs({ startDate: startDate.toISOString() }),
      this.getPerformanceLogs({ startDate: startDate.toISOString() })
    ]);

    // Calculate summary statistics
    const stats = {
      period: '24h',
      totalOperations: 0,
      totalErrors: errors.length,
      avgResponseTime: 0,
      operationsByType: {},
      resources: {},
      uptime: {
        startTime: this.metrics.startTime,
        duration: now.getTime() - new Date(this.metrics.startTime).getTime()
      }
    };

    // Aggregate metrics
    for (const metric of metrics) {
      if (metric.type === 'operation') {
        stats.totalOperations += metric.count;
        
        if (!stats.operationsByType[metric.operation]) {
          stats.operationsByType[metric.operation] = {
            count: 0,
            errors: 0,
            avgTime: 0
          };
        }
        
        stats.operationsByType[metric.operation].count += metric.count;
        stats.operationsByType[metric.operation].errors += metric.errors;
        
        // Calculate weighted average
        const current = stats.operationsByType[metric.operation];
        const totalCount = current.count;
        const newAvg = ((current.avgTime * (totalCount - metric.count)) + metric.totalTime) / totalCount;
        current.avgTime = newAvg;
      }
    }

    // Calculate overall average response time
    const totalTime = metrics.reduce((sum, m) => sum + m.totalTime, 0);
    const totalCount = metrics.reduce((sum, m) => sum + m.count, 0);
    stats.avgResponseTime = totalCount > 0 ? totalTime / totalCount : 0;

    return stats;
  }

  async cleanupOldData() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    // Clean up old metrics
    if (this.metricsResource) {
      const oldMetrics = await this.getMetrics({ endDate: cutoffDate.toISOString() });
      for (const metric of oldMetrics) {
        await this.metricsResource.delete(metric.id);
      }
    }

    // Clean up old error logs
    if (this.errorsResource) {
      const oldErrors = await this.getErrorLogs({ endDate: cutoffDate.toISOString() });
      for (const error of oldErrors) {
        await this.errorsResource.delete(error.id);
      }
    }

    // Clean up old performance logs
    if (this.performanceResource) {
      const oldPerformance = await this.getPerformanceLogs({ endDate: cutoffDate.toISOString() });
      for (const perf of oldPerformance) {
        await this.performanceResource.delete(perf.id);
      }
    }
  }
}

export default MetricsPlugin; 