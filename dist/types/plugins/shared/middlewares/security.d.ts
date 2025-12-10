import type { MiddlewareHandler } from 'hono';
export interface CSPDirectives {
    'default-src'?: string[];
    'script-src'?: string[];
    'style-src'?: string[];
    'img-src'?: string[];
    'font-src'?: string[];
    'connect-src'?: string[];
    'frame-src'?: string[];
    'object-src'?: string[];
    'media-src'?: string[];
    'worker-src'?: string[];
    'child-src'?: string[];
    'form-action'?: string[];
    'frame-ancestors'?: string[];
    'base-uri'?: string[];
    'manifest-src'?: string[];
    [key: string]: string[] | string | undefined;
}
export interface ContentSecurityPolicyConfig {
    enabled?: boolean;
    directives?: CSPDirectives;
    reportOnly?: boolean;
    reportUri?: string | null;
}
export interface FrameguardConfig {
    action: 'deny' | 'sameorigin';
}
export interface HstsConfig {
    maxAge?: number;
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
    mode: 'block' | 'disabled';
}
export interface PermissionsPolicyConfig {
    features?: Record<string, string[]>;
}
export interface SecurityConfig {
    contentSecurityPolicy?: ContentSecurityPolicyConfig;
    frameguard?: FrameguardConfig | false;
    noSniff?: boolean;
    hsts?: HstsConfig | false;
    referrerPolicy?: ReferrerPolicyConfig | false;
    dnsPrefetchControl?: DnsPrefetchControlConfig | false;
    ieNoOpen?: boolean;
    permittedCrossDomainPolicies?: PermittedCrossDomainPoliciesConfig | false;
    xssFilter?: XssFilterConfig | false;
    permissionsPolicy?: PermissionsPolicyConfig | false;
}
export declare function createSecurityMiddleware(config?: SecurityConfig): MiddlewareHandler;
//# sourceMappingURL=security.d.ts.map