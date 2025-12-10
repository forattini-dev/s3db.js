/**
 * OAuth2/OIDC Authorization Server
 *
 * Provides endpoints for OAuth2 + OpenID Connect flows:
 * - /.well-known/openid-configuration (Discovery)
 * - /.well-known/jwks.json (Public keys)
 * - /auth/token (Token endpoint)
 * - /auth/userinfo (User info endpoint)
 * - /auth/introspect (Token introspection)
 */
import { KeyRecord } from './rsa-keys.js';
export interface OAuth2ServerOptions {
    issuer: string;
    keyResource: KeyResource;
    userResource: UserResource;
    clientResource?: ClientResource;
    authCodeResource?: AuthCodeResource;
    supportedScopes?: string[];
    supportedGrantTypes?: string[];
    supportedResponseTypes?: string[];
    accessTokenExpiry?: string;
    idTokenExpiry?: string;
    refreshTokenExpiry?: string;
    authCodeExpiry?: string;
}
export interface KeyResource {
    list: () => Promise<KeyRecord[]>;
    query: (filter: Record<string, any>) => Promise<KeyRecord[]>;
    insert: (data: Record<string, any>) => Promise<KeyRecord>;
    update: (id: string, data: Record<string, any>) => Promise<KeyRecord>;
}
export interface UserResource {
    get: (id: string) => Promise<UserRecord | null>;
    query: (filter: Record<string, any>) => Promise<UserRecord[]>;
}
export interface ClientResource {
    query: (filter: Record<string, any>) => Promise<ClientRecord[]>;
    insert: (data: Record<string, any>) => Promise<ClientRecord>;
}
export interface AuthCodeResource {
    query: (filter: Record<string, any>) => Promise<AuthCodeRecord[]>;
    insert: (data: Record<string, any>) => Promise<AuthCodeRecord>;
    delete: (id: string) => Promise<void>;
}
export interface UserRecord {
    id: string;
    email?: string;
    password?: string;
    name?: string;
    givenName?: string;
    familyName?: string;
    picture?: string;
    tenantId?: string;
    emailVerified?: boolean;
    active?: boolean;
    roles?: string[];
    metadata?: Record<string, any>;
    locale?: string;
    zoneinfo?: string;
    birthdate?: string;
    gender?: string;
}
export interface ClientRecord {
    id: string;
    clientId: string;
    clientSecret?: string;
    secret?: string;
    secrets?: string[];
    name?: string;
    clientName?: string;
    displayName?: string;
    redirectUris?: string[];
    allowedScopes?: string[];
    grantTypes?: string[];
    allowedGrantTypes?: string[];
    responseTypes?: string[];
    tokenEndpointAuthMethod?: string;
    active?: boolean;
    audiences?: string[];
    allowedAudiences?: string[];
    defaultAudience?: string;
    audience?: string;
    tenantId?: string;
    description?: string;
    metadata?: {
        audiences?: string[];
        audience?: string;
        [key: string]: any;
    };
}
export interface AuthCodeRecord {
    id: string;
    code: string;
    clientId: string;
    userId: string;
    redirectUri: string;
    scope: string;
    expiresAt: string | number;
    used: boolean;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    nonce?: string;
    audience?: string;
}
export interface ExpressStyleRequest {
    body: Record<string, any>;
    query?: Record<string, any>;
    headers: {
        authorization?: string;
        [key: string]: string | undefined;
    };
    authenticatedClient?: ClientRecord | null;
}
export interface ExpressStyleResponse {
    status: (code: number) => ExpressStyleResponse;
    json: (data: any) => any;
    header: (name: string, value: string) => ExpressStyleResponse;
    send: (data?: any) => any;
    redirect: (url: string) => any;
}
export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
    id_token?: string;
    refresh_token?: string;
}
export interface ServiceAccountContext {
    clientId: string | null;
    client_id: string | null;
    name: string;
    scopes: string[];
    audiences: string[];
    tenantId?: string;
    metadata?: Record<string, any>;
    description?: string;
}
export interface UserContext {
    id: string;
    tenantId?: string;
    email?: string;
    name?: string;
    roles?: string[];
    metadata?: Record<string, any>;
}
interface IdentityPluginInstance {
    authenticateWithPassword?: (params: {
        email: string;
        password: string;
    }) => Promise<AuthenticateResult>;
    getAuthDriver?: (type: string) => AuthDriver | undefined;
    config?: {
        logLevel?: string;
    };
}
interface AuthDriver {
    supportsGrant?: (grantType: string) => boolean;
    authenticate: (request: {
        clientId: string;
        clientSecret: string;
    }) => Promise<{
        success: boolean;
        client?: ClientRecord;
    }>;
}
interface AuthenticateResult {
    success: boolean;
    user?: UserRecord;
    error?: string;
    statusCode?: number;
}
export declare class OAuth2Server {
    private issuer;
    private keyResource;
    private userResource;
    private clientResource;
    private authCodeResource;
    private supportedScopes;
    private supportedGrantTypes;
    private supportedResponseTypes;
    private accessTokenExpiry;
    private idTokenExpiry;
    private refreshTokenExpiry;
    private authCodeExpiry;
    private keyManager;
    private identityPlugin;
    private logger;
    constructor(options: OAuth2ServerOptions);
    initialize(): Promise<void>;
    setIdentityPlugin(identityPlugin: IdentityPluginInstance): void;
    discoveryHandler(_req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    jwksHandler(_req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    tokenHandler(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    handleClientCredentials(_req: ExpressStyleRequest, res: ExpressStyleResponse, context?: {
        client?: ClientRecord | {
            clientId: string;
        } | null;
        client_id?: string;
        scope?: string;
    }): Promise<any>;
    handleAuthorizationCode(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    handlePasswordGrant(req: ExpressStyleRequest, res: ExpressStyleResponse, context?: {
        client?: ClientRecord | null;
        scope?: string;
    }): Promise<any>;
    handleRefreshToken(req: ExpressStyleRequest, res: ExpressStyleResponse, context?: {
        client?: ClientRecord | null;
        scope?: string;
    }): Promise<any>;
    userinfoHandler(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    introspectHandler(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    authenticateClient(clientId: string, clientSecret: string): Promise<ClientRecord | null>;
    private _isHashedSecret;
    validatePKCE(codeVerifier: string, codeChallenge: string, codeChallengeMethod?: string): Promise<boolean>;
    parseExpiryToSeconds(expiresIn: string): number;
    private _resolveClientAudiences;
    private _formatAudienceClaim;
    private _buildServiceAccountContext;
    private _buildUserContext;
    authorizeHandler(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    authorizePostHandler(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    registerClientHandler(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    revokeHandler(req: ExpressStyleRequest, res: ExpressStyleResponse): Promise<any>;
    rotateKeys(): Promise<KeyRecord>;
    parseAuthCodeExpiry(value: string | number): number;
}
export default OAuth2Server;
//# sourceMappingURL=oauth2-server.d.ts.map