/**
 * OIDC Authentication Driver (Authorization Code Flow) - Production Ready
 *
 * Implements OpenID Connect Authorization Code Flow with enterprise features:
 * - Auto user creation/update from token claims
 * - Session management (rolling + absolute duration)
 * - Token refresh before expiry
 * - IdP logout support (Azure AD/Entra compatible)
 * - Startup configuration validation
 * - User data cached in session (zero DB lookups per request)
 */
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { type JWTPayload } from 'jose';
import { type ResourceLike, type DatabaseLike } from './resource-manager.js';
export interface OIDCUserMapping {
    id?: string;
    email?: string;
    username?: string;
    name?: string;
    role?: string;
    metadata?: ((claims: Record<string, unknown>) => Record<string, unknown>) | Record<string, unknown>;
}
export interface OIDCDiscoveryConfig {
    enabled?: boolean;
}
export interface OIDCPKCEConfig {
    enabled?: boolean;
    method?: string;
}
export interface OIDCRateLimitConfig {
    enabled?: boolean;
    windowMs?: number;
    maxAttempts?: number;
    skipSuccessfulRequests?: boolean;
}
export interface OIDCSessionStore {
    get(sessionId: string): Promise<SessionData | null>;
    set(sessionId: string, data: SessionData, ttl: number): Promise<void>;
    destroy(sessionId: string): Promise<void>;
}
export interface OIDCEventsEmitter {
    emitUserEvent(event: string, data: Record<string, unknown>): void;
}
export interface OIDCConfig {
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scopes?: string[];
    cookieSecret?: string;
    cookieName?: string;
    cookieMaxAge?: number;
    cookieSecure?: boolean;
    cookieSameSite?: 'Strict' | 'Lax' | 'None';
    cookieDomain?: string;
    rollingDuration?: number;
    absoluteDuration?: number;
    loginPath?: string;
    callbackPath?: string;
    logoutPath?: string;
    postLoginRedirect?: string;
    postLogoutRedirect?: string;
    idpLogout?: boolean;
    autoCreateUser?: boolean;
    userIdClaim?: string;
    fallbackIdClaims?: string[];
    lookupFields?: string[];
    autoRefreshTokens?: boolean;
    refreshThreshold?: number;
    allowInsecureCookies?: boolean;
    defaultRole?: string;
    defaultScopes?: string[];
    discovery?: OIDCDiscoveryConfig;
    pkce?: OIDCPKCEConfig;
    rateLimit?: OIDCRateLimitConfig | false;
    tokenFallbackSeconds?: number;
    apiTokenField?: string;
    detectApiTokenField?: boolean;
    generateApiToken?: boolean;
    apiTokenLength?: number;
    apiTokenCookie?: string;
    sessionStore?: OIDCSessionStore;
    userMapping?: OIDCUserMapping;
    protectedPaths?: string[];
    externalUrl?: string;
    baseURL?: string;
    verbose?: boolean;
    logLevel?: string;
    errorPage?: boolean;
    jwtSecret?: string;
    resource?: string;
    createResource?: boolean;
    provider?: string;
    onUserAuthenticated?: (params: OnUserAuthenticatedParams) => Promise<void>;
    hooks?: OIDCHooksConfig;
}
export interface OnUserAuthenticatedParams {
    user: OIDCUser;
    created: boolean;
    claims: IdTokenClaims;
    tokens: {
        access_token: string;
        id_token: string;
        refresh_token?: string;
    };
    context: Context;
}
export interface OIDCHooksConfig {
    beforeUserCreate?: HookFunction[];
    beforeUserUpdate?: HookFunction[];
    afterSessionCreate?: HookFunction[];
    afterUserEnrich?: HookFunction[];
}
export type HookFunction = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
export interface IdTokenClaims extends JWTPayload {
    sub?: string;
    email?: string;
    name?: string;
    preferred_username?: string;
    role?: string;
    roles?: string[];
    [key: string]: unknown;
}
export interface OIDCUser {
    id: string;
    email?: string;
    name?: string;
    username?: string;
    role?: string;
    scopes?: string[];
    isActive?: boolean;
    active?: boolean;
    apiToken?: string;
    costCenterId?: string;
    costCenterName?: string;
    lastLoginAt?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface SessionData {
    issued_at: number;
    expires_at: number;
    last_activity: number;
    token_expires_in: number;
    token_expiry_source: string;
    refresh_token?: string;
    id_token?: string;
    user: SessionUser;
    iat?: number;
}
export interface SessionUser {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    scopes?: string[];
    apiToken?: string;
    costCenterId?: string;
    costCenterName?: string;
    isVirtual?: boolean;
    active?: boolean;
}
export interface StateData {
    state: string;
    returnTo: string;
    nonce: string;
    code_verifier?: string | null;
    type: string;
    expires: number;
}
export interface TokenResponse {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
}
export interface OIDCEndpoints {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    logoutEndpoint: string;
}
export interface SessionValidationResult {
    valid: boolean;
    reason?: string;
}
export interface ExpiresInfo {
    seconds: number;
    source: 'provider' | 'id_token' | 'config';
}
export interface GetOrCreateUserResult {
    user: OIDCUser | null;
    created: boolean;
}
export interface OIDCHandlerResult {
    middleware: MiddlewareHandler;
    routes: Record<string, string>;
    config: OIDCConfig;
    utils: OIDCUtils;
}
export interface OIDCUtils {
    regenerateSession: (c: Context, sessionData: SessionData) => Promise<string>;
    getCachedSession: (c: Context) => Promise<SessionData | null>;
    deleteSession: (c: Context) => Promise<void>;
}
/**
 * Validate OIDC configuration at startup
 */
export declare function validateOidcConfig(config: OIDCConfig): void;
/**
 * Create OIDC authentication handler and routes
 */
export declare function createOIDCHandler(inputConfig: OIDCConfig, app: Hono, database: DatabaseLike, events?: OIDCEventsEmitter | null): Promise<OIDCHandlerResult>;
export default createOIDCHandler;
export declare function createOidcUtils(config: OIDCConfig, dependencies?: {
    app?: Hono;
    usersResource?: ResourceLike | null;
    events?: OIDCEventsEmitter | null;
}): OIDCUtils;
//# sourceMappingURL=oidc-auth.d.ts.map