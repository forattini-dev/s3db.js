import type { MiddlewareHandler } from 'hono';
export interface HSTSConfig {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
}
export interface SecurityHeadersConfig {
    csp?: string | false;
    hsts?: HSTSConfig | false;
    xFrameOptions?: string | false;
    xContentTypeOptions?: string | false;
    referrerPolicy?: string | false;
    xssProtection?: string | false;
    permissionsPolicy?: string | false;
}
export interface SecurityHeadersMiddlewareConfig {
    headers?: SecurityHeadersConfig;
}
export declare function createSecurityHeadersMiddleware(config?: SecurityHeadersMiddlewareConfig): MiddlewareHandler;
export default createSecurityHeadersMiddleware;
//# sourceMappingURL=security-headers.d.ts.map