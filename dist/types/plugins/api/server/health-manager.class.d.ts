import type { Context } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
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
export declare class HealthManager {
    private database;
    private healthConfig;
    private logLevel;
    private logger;
    constructor({ database, healthConfig, logLevel, logger }: HealthManagerOptions);
    register(app: HonoType): void;
    private livenessProbe;
    private readinessProbe;
    private genericHealth;
}
export {};
//# sourceMappingURL=health-manager.class.d.ts.map