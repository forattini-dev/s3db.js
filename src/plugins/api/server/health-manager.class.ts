import type { Context } from 'hono';
import type { Logger, LogLevel } from '../../../concerns/logger.js';
import * as formatter from '../../shared/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';

type HonoType = {
  get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void;
};

export interface HealthCheckResult {
  healthy: boolean;
  [key: string]: unknown;
}

export interface CustomHealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  timeout?: number;
  optional?: boolean;
}

export interface ReadinessConfig {
  checks?: CustomHealthCheck[];
}

export interface HealthConfig {
  readiness?: ReadinessConfig;
}

export interface DatabaseLike {
  connected?: boolean;
  resources?: Record<string, unknown>;
}

export interface HealthManagerOptions {
  database: DatabaseLike;
  healthConfig?: HealthConfig;
  logLevel?: string;
  logger?: Logger;
}

interface CheckStatus {
  status: string;
  latency_ms?: number;
  resources?: number;
  connected?: boolean;
  error?: string;
  [key: string]: unknown;
}

export class HealthManager {
  private database: DatabaseLike;
  private healthConfig: HealthConfig;
  private logLevel: string | undefined;
  private logger: Logger;

  constructor({ database, healthConfig, logLevel, logger }: HealthManagerOptions) {
    this.database = database;
    this.healthConfig = healthConfig || {};
    this.logLevel = logLevel;

    if (logger) {
      this.logger = logger;
    } else {
      this.logger = createLogger({
        name: 'HealthManager',
        level: (logLevel || 'info') as LogLevel
      });
    }
  }

  register(app: HonoType): void {
    app.get('/health/live', (c: Context) => this.livenessProbe(c));
    app.get('/health/ready', (c: Context) => this.readinessProbe(c));
    app.get('/health', (c: Context) => this.genericHealth(c));

    this.logger.debug({ endpoints: ['/health', '/health/live', '/health/ready'] }, 'Health endpoints registered: GET /health, GET /health/live, GET /health/ready');
  }

  private livenessProbe(c: Context): Response {
    const response = formatter.success({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
    return c.json(response);
  }

  private async readinessProbe(c: Context): Promise<Response> {
    const checks: Record<string, CheckStatus> = {};
    let isHealthy = true;

    const customChecks = this.healthConfig.readiness?.checks || [];

    try {
      const startTime = Date.now();
      const dbConnected = this.database?.connected || false;
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
    } catch (err) {
      checks.s3db = {
        status: 'unhealthy',
        error: (err as Error).message
      };
      isHealthy = false;

      if (this.logger) {
        this.logger.error({ error: (err as Error).message }, '[Health] Readiness check error');
      }
    }

    for (const check of customChecks) {
      try {
        const startTime = Date.now();
        const timeout = check.timeout || 5000;

        const result = await Promise.race([
          check.check(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);

        const latency = Date.now() - startTime;

        checks[check.name] = {
          status: result.healthy ? 'healthy' : 'unhealthy',
          latency_ms: latency,
          ...result
        };

        if (!result.healthy && !check.optional) {
          isHealthy = false;
        }
      } catch (err) {
        checks[check.name] = {
          status: 'unhealthy',
          error: (err as Error).message
        };

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

  private genericHealth(c: Context): Response {
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
