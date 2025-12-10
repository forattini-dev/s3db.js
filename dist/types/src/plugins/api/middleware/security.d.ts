import type { Context, Next } from 'hono';
export interface FrameguardConfig {
    action: string;
}
export interface HstsConfig {
    maxAge: number;
    includeSubDomains?: boolean;
    preload?: boolean;
}
export interface ReferrerPolicyConfig {
    policy: string;
}
export interface DnsPrefetchControlConfig {
    allow: boolean;
}
export interface PermittedCrossDomainPoliciesConfig {
    policy: string;
}
export interface XssFilterConfig {
    mode: string;
}
export interface PermissionsPolicyConfig {
    features?: Record<string, string[]>;
}
export interface ContentSecurityPolicyConfig {
    enabled?: boolean;
    directives?: Record<string, string | string[]>;
    reportUri?: string;
    reportOnly?: boolean;
}
export interface SecurityConfig {
    noSniff?: boolean;
    frameguard?: FrameguardConfig;
    hsts?: HstsConfig;
    referrerPolicy?: ReferrerPolicyConfig;
    dnsPrefetchControl?: DnsPrefetchControlConfig;
    ieNoOpen?: boolean;
    permittedCrossDomainPolicies?: PermittedCrossDomainPoliciesConfig;
    xssFilter?: XssFilterConfig;
    permissionsPolicy?: PermissionsPolicyConfig;
    contentSecurityPolicy?: ContentSecurityPolicyConfig;
}
export declare function createSecurityMiddleware(security: SecurityConfig): Promise<(c: Context, next: Next) => Promise<void>>;
//# sourceMappingURL=security.d.ts.map