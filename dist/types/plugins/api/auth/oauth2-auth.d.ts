/**
 * OAuth2/OIDC Authentication Driver (Resource Server)
 *
 * Validates JWT access tokens issued by an OAuth2/OIDC Authorization Server.
 * Fetches public keys from JWKS endpoint and verifies token signatures.
 *
 * Use this driver when your application acts as a Resource Server
 * consuming tokens from an external Authorization Server (SSO).
 *
 * Config options:
 * - resource: Resource name (default: 'plg_api_oauth2_users')
 * - createResource: Auto-create resource (default: true)
 * - userMapping: Map token claims to user fields (default: { id: 'sub', email: 'email', username: 'preferred_username' })
 * - issuer: OAuth2 issuer URL (required)
 * - jwksUri: JWKS endpoint (optional, auto-discovered)
 * - audience: Expected audience claim (optional)
 * - algorithms: Allowed algorithms (default: ['RS256', 'ES256'])
 * - cacheTTL: JWKS cache duration (default: 1 hour)
 * - fetchUserInfo: Fetch user from database (default: true)
 *
 * @example
 * {
 *   driver: 'oauth2',
 *   config: {
 *     resource: 'users',
 *     userMapping: {
 *       id: 'sub',
 *       email: 'email',
 *       username: 'preferred_username'
 *     },
 *     issuer: 'https://auth.example.com',
 *     audience: 'my-api',
 *     algorithms: ['RS256']
 *   }
 * }
 */
import type { Context } from 'hono';
import { type JWTPayload } from 'jose';
import { type DatabaseLike } from './resource-manager.js';
export interface OAuth2UserMapping {
    id?: string;
    email?: string;
    username?: string;
    role?: string;
}
export interface OAuth2IntrospectionConfig {
    enabled?: boolean;
    endpoint?: string;
    clientId?: string;
    clientSecret?: string;
    useDiscovery?: boolean;
}
export interface OAuth2Config {
    issuer?: string;
    jwksUri?: string;
    audience?: string | null;
    algorithms?: string[];
    cacheTTL?: number;
    clockTolerance?: number;
    validateScopes?: boolean;
    fetchUserInfo?: boolean;
    userMapping?: OAuth2UserMapping;
    introspection?: OAuth2IntrospectionConfig | null;
    resource?: string;
    createResource?: boolean;
    provider?: string;
    logLevel?: string;
}
export interface OAuth2User {
    id: string;
    username: string;
    email: string | null;
    role: string;
    scopes: string[];
    active: boolean;
    tokenClaims: JWTPayload | Record<string, unknown>;
    isVirtual?: boolean;
}
export type OAuth2Handler = (c: Context) => Promise<OAuth2User | null>;
/**
 * Create OAuth2 authentication handler (NEW API)
 * @param inputConfig - OAuth2 configuration
 * @param database - s3db.js database instance
 * @returns Hono middleware
 */
export declare function createOAuth2Handler(inputConfig: OAuth2Config, database: DatabaseLike): Promise<OAuth2Handler>;
/**
 * Clear JWKS cache (useful for testing or when keys are rotated)
 */
export declare function clearJWKSCache(): void;
export default createOAuth2Handler;
//# sourceMappingURL=oauth2-auth.d.ts.map