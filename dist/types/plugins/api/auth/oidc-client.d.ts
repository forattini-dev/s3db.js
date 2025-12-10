/**
 * OIDC Client Middleware for Resource Servers
 *
 * Validates RS256 JWT tokens issued by an OAuth2/OIDC Authorization Server.
 * Fetches and caches JWKS (public keys) from the issuer's /.well-known/jwks.json endpoint.
 *
 * @example
 * import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';
 *
 * const oidcClient = new OIDCClient({
 *   issuer: 'https://sso.example.com',
 *   audience: 'https://api.example.com',
 *   jwksCacheTTL: 3600000 // 1 hour
 * });
 *
 * await oidcClient.initialize();
 *
 * // Use with API plugin
 * apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));
 *
 * // Or use directly in routes
 * apiPlugin.addRoute({
 *   path: '/protected',
 *   method: 'GET',
 *   handler: async (req, res) => {
 *     // req.user contains validated token payload
 *     res.json({ user: req.user });
 *   },
 *   auth: 'oidc'
 * });
 */
import { type Logger } from '../../../concerns/logger.js';
export interface ClaimsValidationOptions {
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
}
export interface ClaimsValidationResult {
    valid: boolean;
    error: string | null;
}
export interface TokenPayload {
    sub?: string;
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string | string[];
    nbf?: number;
    [key: string]: unknown;
}
export interface JWK {
    kty: string;
    use?: string;
    kid?: string;
    n?: string;
    e?: string;
    alg?: string;
    [key: string]: unknown;
}
export interface JWKS {
    keys: JWK[];
}
export interface DiscoveryDocument {
    issuer?: string;
    jwks_uri?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    introspection_endpoint?: string;
    userinfo_endpoint?: string;
    [key: string]: unknown;
}
export interface OIDCClientOptions {
    issuer: string;
    audience?: string;
    jwksUri?: string;
    jwksCacheTTL?: number;
    clockTolerance?: number;
    autoRefreshJWKS?: boolean;
    discoveryUri?: string;
    logLevel?: string;
    logger?: Logger;
}
export interface TokenVerificationResult {
    valid: boolean;
    error?: string;
    header?: Record<string, unknown>;
    payload?: TokenPayload;
}
export interface IntrospectionResult {
    active: boolean;
    [key: string]: unknown;
}
export interface ExpressRequest {
    headers: {
        authorization?: string;
        [key: string]: string | string[] | undefined;
    };
    user?: TokenPayload;
    token?: string;
}
export interface ExpressResponse {
    status(code: number): ExpressResponse;
    json(data: unknown): void;
}
export type NextFunction = () => void;
/**
 * OIDC Client for validating tokens from Authorization Server
 */
export declare class OIDCClient {
    private issuer;
    private audience?;
    private jwksUri;
    private discoveryUri;
    private jwksCacheTTL;
    private clockTolerance;
    private autoRefreshJWKS;
    private logger;
    private jwksCache;
    private jwksCacheExpiry;
    private discoveryCache;
    private keys;
    private cronManager;
    private refreshJobName;
    private logLevel;
    private _httpClient;
    constructor(options: OIDCClientOptions);
    /**
     * Get or create HTTP client
     */
    private _getHttpClient;
    /**
     * Initialize OIDC client - fetch discovery document and JWKS
     */
    initialize(): Promise<void>;
    /**
     * Fetch OIDC discovery document
     */
    fetchDiscovery(): Promise<DiscoveryDocument>;
    /**
     * Fetch JWKS from issuer
     */
    fetchJWKS(force?: boolean): Promise<JWKS>;
    /**
     * Convert JWK to PEM format
     */
    jwkToPem(jwk: JWK): string;
    /**
     * Get public key by kid
     */
    getPublicKey(kid: string): Promise<string | undefined>;
    /**
     * Verify RS256 JWT token
     */
    verifyToken(token: string): Promise<TokenVerificationResult>;
    /**
     * Express middleware for OIDC authentication
     */
    middleware(req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void>;
    /**
     * Start auto-refresh of JWKS
     */
    startJWKSRefresh(): void;
    /**
     * Stop auto-refresh of JWKS
     */
    stopJWKSRefresh(): void;
    /**
     * Introspect token via Authorization Server (RFC 7662)
     */
    introspectToken(token: string, clientId: string, clientSecret: string): Promise<IntrospectionResult>;
    /**
     * Get discovery document
     */
    getDiscovery(): DiscoveryDocument | null;
    /**
     * Get cached JWKS
     */
    getJWKS(): JWKS | null;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
export interface OIDCMiddleware {
    (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void>;
    client: OIDCClient;
    destroy: () => void;
}
/**
 * Create OIDC middleware factory for easy integration
 */
export declare function createOIDCMiddleware(options: OIDCClientOptions): OIDCMiddleware;
declare const _default: {
    OIDCClient: typeof OIDCClient;
    createOIDCMiddleware: typeof createOIDCMiddleware;
};
export default _default;
//# sourceMappingURL=oidc-client.d.ts.map