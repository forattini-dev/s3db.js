/**
 * HealthManager - Manages health check endpoints
 *
 * Provides Kubernetes-compatible health endpoints:
 * - /health - Generic health check
 * - /health/live - Liveness probe (is app alive?)
 * - /health/ready - Readiness probe (is app ready for traffic?)
 *
 * Supports custom health checks for external dependencies (database, redis, etc.)
 */

import * as formatter from '../../shared/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';

export class HealthManager {
  constructor({ database, healthConfig, logLevel, logger }) {
    this.database = database;
    this.healthConfig = healthConfig || {};
    this.logLevel = logLevel;

    // Logger with fallback
    if (logger) {
      this.logger = logger;
    } else {
      this.logger = createLogger({
        name: 'HealthManager',
        level: logLevel || 'info'
      });
    }
  }

  /**
   * Register all health endpoints on Hono app
   * @param {Hono} app - Hono application instance
   */
  register(app) {
    // Liveness probe
    app.get('/health/live', (c) => this.livenessProbe(c));

    // Readiness probe
    app.get('/health/ready', (c) => this.readinessProbe(c));

    // Generic health
    app.get('/health', (c) => this.genericHealth(c));

    // 🪵 Debug: health endpoints registered
    this.logger.debug({ endpoints: ['/health', '/health/live', '/health/ready'] }, 'Health endpoints registered: GET /health, GET /health/live, GET /health/ready');
  }

  /**
   * Liveness probe - checks if app is alive
   * If this fails, Kubernetes will restart the pod
   * @private
   */
  livenessProbe(c) {
    const response = formatter.success({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
    return c.json(response);
  }

  /**
   * Readiness probe - checks if app is ready to receive traffic
   * If this fails, Kubernetes will remove pod from service endpoints
   * @private
   */
  async readinessProbe(c) {
    const checks = {};
    let isHealthy = true;

    // Get custom checks configuration
    const customChecks = this.healthConfig.readiness?.checks || [];

    // Built-in: Database check
    try {
      const startTime = Date.now();
      const isDbReady = this.database &&
                       this.database.connected &&
                       Object.keys(this.database.resources).length > 0;
      const latency = Date.now() - startTime;

      if (isDbReady) {
        checks.s3db = {
          status: 'healthy',
          latency_ms: latency,
          resources: Object.keys(this.database.resources).length
        };
      } else {
        checks.s3db = {
          status: 'unhealthy',
          connected: this.database?.connected || false,
          resources: Object.keys(this.database?.resources || {}).length
        };
        isHealthy = false;
      }
    } catch (err) {
      checks.s3db = {
        status: 'unhealthy',
        error: err.message
      };
      isHealthy = false;
    }

    // Execute custom checks
    for (const check of customChecks) {
      try {
        const startTime = Date.now();
        const timeout = check.timeout || 5000;

        // Run check with timeout
        const result = await Promise.race([
          check.check(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);

        const latency = Date.now() - startTime;

        checks[check.name] = {
          status: result.healthy ? 'healthy' : 'unhealthy',
          latency_ms: latency,
          ...result
        };

        // Only mark as unhealthy if check is not optional
        if (!result.healthy && !check.optional) {
          isHealthy = false;
        }
      } catch (err) {
        checks[check.name] = {
          status: 'unhealthy',
          error: err.message
        };

        // Only mark as unhealthy if check is not optional
        if (!check.optional) {
          isHealthy = false;
        }
      }
    }

    const status = isHealthy ? 200 : 503;

    return c.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks
    }, status);
  }

  /**
   * Generic health check
   * @private
   */
  genericHealth(c) {
    const response = formatter.success({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        liveness: '/health/live',
        readiness: '/health/ready'
      }
    });
    return c.json(response);
  }
}
