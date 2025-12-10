/**
 * HttpStage
 *
 * HTTP request testing using RedBlue:
 * - Basic GET requests
 * - Header inspection
 * - Security header audit
 * - Server fingerprinting
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface HttpFeatureConfig {
    timeout?: number;
    follow?: boolean;
    userAgent?: string;
    intel?: boolean;
}
export interface HttpData {
    statusCode: number | null;
    headers: Record<string, string>;
    body: string | null;
    contentType?: string | null;
    contentLength?: number | null;
    server?: string | null;
    redirects?: string[];
}
export interface HttpResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    url?: string;
    statusCode?: number | null;
    headers?: Record<string, string>;
    body?: string | null;
    contentType?: string | null;
    contentLength?: number | null;
    server?: string | null;
    redirects?: string[];
    securityHeaders?: any;
    grade?: any;
    metadata?: Record<string, any>;
}
export declare class HttpStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: HttpFeatureConfig): Promise<HttpResult>;
    private _buildUrl;
    private _defaultPortForProtocol;
    private _buildFlags;
    private _normalizeHttp;
    private _parseRawHttp;
    executeSecurityAudit(target: Target, featureConfig?: HttpFeatureConfig): Promise<HttpResult>;
    executeGrade(target: Target, featureConfig?: HttpFeatureConfig): Promise<HttpResult>;
}
//# sourceMappingURL=http-stage.d.ts.map