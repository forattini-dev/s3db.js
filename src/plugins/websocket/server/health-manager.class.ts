/**
 * HealthManager - Manages health check endpoints for WebSocket plugin
 *
 * Provides Kubernetes-compatible health endpoints via HTTP:
 * - /health - Generic health check
 * - /health/live - Liveness probe (is app alive?)
 * - /health/ready - Readiness probe (is app ready for traffic?)
 *
 * Supports custom health checks for external dependencies (database, redis, etc.)
 */

import { createLogger, LogLevel } from '../../../concerns/logger.js';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Database } from '../../../database.class.js'; // Assuming Database type exists
import type { WebSocketServer } from '../server.js'; // Assuming WebSocketServer type exists

export interface HealthConfig {
  enabled?: boolean;
  readiness?: {
    checks?: HealthCheck[];
  };
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  latency_ms?: number;
  error?: string;
  [key: string]: any;
}

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult | { healthy: boolean; [key: string]: any }>;
  optional?: boolean;
  timeout?: number;
}

export class HealthManager {
  private database: Database;
  private wsServer: WebSocketServer;
  private healthConfig: HealthConfig;
  private logLevel?: LogLevel;
  private logger: any;

  constructor({ database, wsServer, healthConfig, logLevel, logger }: {
    database: Database;
    wsServer: WebSocketServer;
    healthConfig?: HealthConfig;
    logLevel?: string;
    logger?: any;
  }) {
    this.database = database;
    this.wsServer = wsServer;
    this.healthConfig = healthConfig || {};
    this.logLevel = logLevel as LogLevel;

    if (logger) {
      this.logger = logger;
    } else {
      this.logger = createLogger({
        name: 'WS:HealthManager',
        level: (logLevel || 'info') as LogLevel
      });
    }
  }

  /**
   * Handle HTTP request for health endpoints
   * @param req
   * @param res
   * @returns - true if handled, false otherwise
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url?.split('?')[0];

    if (url === '/health/live') {
      return this._handleLiveness(req, res);
    }

    if (url === '/health/ready') {
      return this._handleReadiness(req, res);
    }

    if (url === '/health') {
      return this._handleGeneric(req, res);
    }

    return false;
  }

  /**
   * Liveness probe - checks if app is alive
   * If this fails, Kubernetes will restart the pod
   * @private
   */
  private _handleLiveness(req: IncomingMessage, res: ServerResponse): boolean {
    const response = {
      status: 'alive',
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    return true;
  }

  /**
   * Readiness probe - checks if app is ready to receive traffic
   * If this fails, Kubernetes will remove pod from service endpoints
   * @private
   */
  private async _handleReadiness(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const checks: Record<string, HealthCheckResult> = {};
    let isHealthy = true;

    // Get custom checks configuration
    const customChecks = this.healthConfig.readiness?.checks || [];

    // Built-in: Database check
    try {
      const startTime = Date.now();
      const dbConnected = this.database?.isConnected() || false;
      const resourceCount = Object.keys(this.database?.resources || {}).length;
      const isDbReady = this.database && dbConnected && resourceCount > 0;
      const latency = Date.now() - startTime;

      if (isDbReady) {
        checks.s3db = {
          status: 'healthy',
          latency_ms: latency,
          resources: resourceCount
        };
      } else {
        checks.s3db = {
          status: 'unhealthy',
          connected: dbConnected,
          resources: resourceCount
        };
        isHealthy = false;

        if (this.logger) {
          this.logger.warn({
            dbExists: !!this.database,
            dbConnected,
            resourceCount,
            reason: !this.database ? 'database object missing' :
                    !dbConnected ? 'database not connected' :
                    resourceCount === 0 ? 'no resources created' : 'unknown'
          }, '[Health] Readiness check failed - database not ready');
        }
      }
    } catch (err: any) {
      checks.s3db = {
        status: 'unhealthy',
        error: err.message
      };
      isHealthy = false;

      if (this.logger) {
        this.logger.error({ error: err.message }, '[Health] Readiness check error');
      }
    }

    // Built-in: WebSocket server check
    try {
      const wsRunning = this.wsServer?.wss !== null;
      const clientCount = this.wsServer?.clients?.size || 0;

      if (wsRunning) {
        checks.websocket = {
          status: 'healthy',
          clients: clientCount,
          subscriptions: this.wsServer?.subscriptions?.size || 0
        };
      } else {
        checks.websocket = {
          status: 'unhealthy',
          reason: 'WebSocket server not running'
        };
        isHealthy = false;
      }
    } catch (err: any) {
      checks.websocket = {
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

        const result = await Promise.race([
          check.check(),
          new Promise<HealthCheckResult>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);

        const latency = Date.now() - startTime;

        const { healthy, status, ...restResult } = result as any;
        checks[check.name] = {
          status: healthy ? 'healthy' : 'unhealthy',
          latency_ms: latency,
          ...restResult
        };

        if (!healthy && !check.optional) {
          isHealthy = false;
        }
      } catch (err: any) {
        checks[check.name] = {
          status: 'unhealthy',
          error: err.message
        };

        if (!check.optional) {
          isHealthy = false;
        }
      }
    }

    const status = isHealthy ? 200 : 503;
    const response = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks
    };

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    return true;
  }

  /**
   * Generic health check
   * @private
   */
  private _handleGeneric(req: IncomingMessage, res: ServerResponse): boolean {
    const clientCount = this.wsServer?.clients?.size || 0;
    const subscriptionCount = this.wsServer?.subscriptions?.size || 0;

    const response = {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connections: clientCount,
      subscriptions: subscriptionCount,
      endpoints: {
        liveness: '/health/live',
        readiness: '/health/ready'
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    return true;
  }
}
