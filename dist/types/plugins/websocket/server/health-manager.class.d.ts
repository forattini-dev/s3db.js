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
import type { IncomingMessage, ServerResponse } from 'http';
import type { Database } from '../../../database.class.js';
import type { WebSocketServer } from '../server.js';
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
    check: () => Promise<HealthCheckResult | {
        healthy: boolean;
        [key: string]: any;
    }>;
    optional?: boolean;
    timeout?: number;
}
export declare class HealthManager {
    private database;
    private wsServer;
    private healthConfig;
    private logLevel?;
    private logger;
    constructor({ database, wsServer, healthConfig, logLevel, logger }: {
        database: Database;
        wsServer: WebSocketServer;
        healthConfig?: HealthConfig;
        logLevel?: string;
        logger?: any;
    });
    /**
     * Handle HTTP request for health endpoints
     * @param req
     * @param res
     * @returns - true if handled, false otherwise
     */
    handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
    /**
     * Liveness probe - checks if app is alive
     * If this fails, Kubernetes will restart the pod
     * @private
     */
    private _handleLiveness;
    /**
     * Readiness probe - checks if app is ready to receive traffic
     * If this fails, Kubernetes will remove pod from service endpoints
     * @private
     */
    private _handleReadiness;
    /**
     * Generic health check
     * @private
     */
    private _handleGeneric;
}
//# sourceMappingURL=health-manager.class.d.ts.map