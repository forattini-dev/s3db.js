export interface ProviderConfig {
    provider?: string;
    idp?: string;
    tenantId?: string;
    tenant?: string;
    issuer?: string;
    userIdClaim?: string;
    fallbackIdClaims?: string[];
    lookupFields?: string[];
    scopes?: string[];
    apiTokenCookie?: {
        enabled: boolean;
        name: string;
    } | undefined;
    domain?: string;
    host?: string;
    baseUrl?: string;
    realm?: string;
    introspection?: {
        enabled?: boolean;
        endpoint?: string;
    };
    region?: string;
    userPoolId?: string;
    userPool?: string;
    audience?: string;
    teamId?: string;
    [key: string]: unknown;
}
export declare function applyProviderPreset(kind: string, cfg?: ProviderConfig): ProviderConfig;
export declare function applyProviderQuirks(authUrl: URL, issuer: string, config?: ProviderConfig): void;
declare const _default: {
    applyProviderPreset: typeof applyProviderPreset;
    applyProviderQuirks: typeof applyProviderQuirks;
};
export default _default;
//# sourceMappingURL=providers.d.ts.map