import type { MiddlewareHandler } from 'hono';
import type { DatabaseLike } from './resource-manager.js';
import { createJWTHandler, createToken, verifyToken, type JWTConfig } from './jwt-auth.js';
import { createApiKeyHandler, generateApiKey, type ApiKeyConfig } from './api-key-auth.js';
import { createBasicAuthHandler, type BasicAuthConfig } from './basic-auth.js';
import { createOAuth2Handler, type OAuth2Config } from './oauth2-auth.js';
import { OIDCClient } from './oidc-client.js';
export interface AuthMiddlewareOptions {
    methods?: string[];
    jwt?: JWTConfig;
    apiKey?: ApiKeyConfig;
    basic?: BasicAuthConfig;
    oauth2?: OAuth2Config;
    oidc?: MiddlewareHandler | null;
    database: DatabaseLike;
    optional?: boolean;
    strategy?: 'any' | 'priority';
    priorities?: Record<string, number>;
}
export declare function createAuthMiddleware(options: AuthMiddlewareOptions): Promise<MiddlewareHandler>;
export { OIDCClient, createToken, verifyToken, generateApiKey };
declare const _default: {
    createAuthMiddleware: typeof createAuthMiddleware;
    createJWTHandler: typeof createJWTHandler;
    createApiKeyHandler: typeof createApiKeyHandler;
    createBasicAuthHandler: typeof createBasicAuthHandler;
    createOAuth2Handler: typeof createOAuth2Handler;
    createToken: typeof createToken;
    verifyToken: typeof verifyToken;
    generateApiKey: typeof generateApiKey;
    OIDCClient: typeof OIDCClient;
};
export default _default;
//# sourceMappingURL=index.d.ts.map