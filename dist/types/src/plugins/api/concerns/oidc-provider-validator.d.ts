export interface DiscoveryDocument {
    authorization_endpoint?: string;
    token_endpoint?: string;
    userinfo_endpoint?: string;
    end_session_endpoint?: string;
    id_token_signing_alg_values_supported?: string[];
    response_types_supported?: string[];
    response_modes_supported?: string[];
    scopes_supported?: string[];
    grant_types_supported?: string[];
    code_challenge_methods_supported?: string[];
    token_endpoint_auth_methods_supported?: string[];
    claims_supported?: string[];
    [key: string]: unknown;
}
export interface OidcConfig {
    idTokenSigningAlg?: string;
    responseType?: string;
    responseMode?: string;
    scope?: string;
    autoRefreshTokens?: boolean;
    usePKCE?: boolean;
    enableLogout?: boolean;
    tokenEndpointAuthMethod?: string;
}
export interface CompatibilityResult {
    warnings: string[];
    errors: string[];
}
export interface LogOptions {
    logLevel?: string;
    throwOnError?: boolean;
}
export interface ProviderCapabilities {
    hasTokenEndpoint: boolean;
    hasUserinfoEndpoint: boolean;
    hasLogoutEndpoint: boolean;
    supportsRefreshTokens: boolean;
    supportsPKCE: boolean;
    supportedScopes: string[];
    supportedResponseTypes: string[];
    supportedSigningAlgs: string[];
    supportedAuthMethods?: string[];
}
export declare function validateProviderCompatibility(discoveryDoc: DiscoveryDocument | null, config: OidcConfig): CompatibilityResult;
export declare function logProviderCompatibility(result: CompatibilityResult, options?: LogOptions): void;
export declare function getProviderCapabilities(discoveryDoc: DiscoveryDocument | null): ProviderCapabilities;
//# sourceMappingURL=oidc-provider-validator.d.ts.map