export interface AuthDriverConfig {
    driver: 'jwt' | 'apiKey' | 'oidc';
    config?: {
        secret?: string;
        issuer?: string;
        audience?: string;
        jwksUri?: string;
        keys?: Record<string, any>;
        header?: string;
        queryParam?: string;
        algorithms?: string[];
        clientId?: string;
    };
}
export interface AuthConfig {
    drivers?: AuthDriverConfig[];
    required?: boolean;
    jwt?: {
        enabled?: boolean;
        secret?: string;
        issuer?: string;
        audience?: string;
        jwksUri?: string;
    };
    apiKey?: {
        enabled?: boolean;
        keys?: Record<string, any>;
        header?: string;
        queryParam?: string;
    };
}
/**
 * Normalize authentication configuration for WebSocket plugin
 *
 * Supports multiple authentication drivers:
 * - jwt: JSON Web Token validation
 * - apiKey: Static API key validation
 *
 * @param authConfig - Raw auth configuration
 * @param logger - Logger instance
 * @returns Normalized auth configuration
 */
export declare function normalizeAuthConfig(authConfig: AuthConfig | undefined, logger: any): AuthConfig;
//# sourceMappingURL=normalize-auth.d.ts.map