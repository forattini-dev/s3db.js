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
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createLogger } from '../../../concerns/logger.js';
import { createHttpClient } from '../../../concerns/http-client.js';
import { applyProviderPreset } from './providers.js';
import { OAuth2ResourceManager } from './resource-manager.js';
const logger = createLogger({ name: 'OAuth2Auth', level: 'info' });
const jwksCache = new Map();
let httpClient = null;
async function getHttpClient() {
    if (!httpClient) {
        httpClient = await createHttpClient({
            timeout: 10000,
            retry: {
                maxAttempts: 3,
                delay: 1000,
                backoff: 'exponential',
                retryAfter: true,
                retryOn: [429, 500, 502, 503, 504]
            }
        });
    }
    return httpClient;
}
/**
 * Create OAuth2 authentication handler (NEW API)
 * @param inputConfig - OAuth2 configuration
 * @param database - s3db.js database instance
 * @returns Hono middleware
 */
export async function createOAuth2Handler(inputConfig, database) {
    const config = applyProviderPreset('oauth2', inputConfig);
    const { issuer, jwksUri, audience = null, algorithms = ['RS256', 'ES256'], cacheTTL = 3600000, clockTolerance = 60, fetchUserInfo = true, userMapping = {
        id: 'sub',
        email: 'email',
        username: 'preferred_username',
        role: 'role'
    }, introspection = null } = config;
    if (!issuer) {
        throw new Error('OAuth2 driver: issuer is required');
    }
    if (!database) {
        throw new Error('OAuth2 driver: database is required');
    }
    const manager = new OAuth2ResourceManager(database, 'oauth2', config);
    const authResource = await manager.getOrCreateResource();
    logger.debug(`OAuth2 driver initialized with resource: ${authResource?.name}, issuer: ${issuer}`);
    const resolveJwksUri = async () => {
        if (jwksUri)
            return jwksUri;
        const base = issuer.replace(/\/$/, '');
        const client = await getHttpClient();
        try {
            const asr = await client.get(`${base}/.well-known/oauth-authorization-server`);
            if (asr.ok) {
                const meta = await asr.json();
                if (meta.jwks_uri)
                    return meta.jwks_uri;
            }
        }
        catch {
            // Discovery failed, continue
        }
        try {
            const oidc = await client.get(`${base}/.well-known/openid-configuration`);
            if (oidc.ok) {
                const meta = await oidc.json();
                if (meta.jwks_uri)
                    return meta.jwks_uri;
            }
        }
        catch {
            // Discovery failed, continue
        }
        return `${base}/.well-known/jwks.json`;
    };
    const getJWKS = async () => {
        const url = await resolveJwksUri();
        const cacheKey = url;
        if (jwksCache.has(cacheKey)) {
            const cached = jwksCache.get(cacheKey);
            if (Date.now() - cached.timestamp < cacheTTL) {
                return cached.jwks;
            }
        }
        const jwks = createRemoteJWKSet(new URL(url), {
            cooldownDuration: 30000,
            cacheMaxAge: cacheTTL
        });
        jwksCache.set(cacheKey, { jwks, timestamp: Date.now() });
        return jwks;
    };
    return async (c) => {
        const authHeader = c.req.header('authorization') || c.req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        const token = authHeader.substring(7);
        const tryJwtVerify = async () => {
            const jwks = await getJWKS();
            const verifyOptions = {
                issuer,
                algorithms,
                clockTolerance,
                ...(audience ? { audience } : {})
            };
            const { payload } = await jwtVerify(token, jwks, verifyOptions);
            const userId = payload[userMapping.id || 'sub'] || payload.sub;
            const email = payload[userMapping.email || 'email'] || payload.email || null;
            const username = payload[userMapping.username || 'username'] ||
                payload.preferred_username ||
                payload.username ||
                email;
            const scopes = payload.scope
                ? payload.scope.split(' ')
                : (payload.scopes || []);
            const role = payload[userMapping.role || 'role'] || payload.role || 'user';
            let user = null;
            if (fetchUserInfo && userId && authResource) {
                try {
                    user = await authResource.get(userId).catch(() => null);
                    if (!user && email) {
                        const users = await authResource.query({ email }, { limit: 1 });
                        user = users[0] ?? null;
                    }
                }
                catch {
                    // User not found in local database
                }
            }
            if (user) {
                return {
                    ...user,
                    scopes: user.scopes || scopes,
                    role: user.role || role,
                    tokenClaims: payload
                };
            }
            return {
                id: userId,
                username: username || userId,
                email,
                role,
                scopes,
                active: true,
                tokenClaims: payload,
                isVirtual: true
            };
        };
        const tryIntrospection = async () => {
            const intCfg = introspection || {};
            if (intCfg.enabled !== true)
                return null;
            const client = await getHttpClient();
            let endpoint = intCfg.endpoint;
            if (!endpoint && intCfg.useDiscovery !== false && issuer) {
                try {
                    const res = await client.get(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
                    if (res.ok) {
                        const doc = await res.json();
                        endpoint = doc.introspection_endpoint || endpoint;
                    }
                }
                catch (e) {
                    const logLevel = c.get('logLevel');
                    if (logLevel === 'debug' || logLevel === 'trace') {
                        logger.error({ error: e.message }, '[OAuth2 Auth] Discovery for introspection failed');
                    }
                }
            }
            if (!endpoint && issuer) {
                endpoint = `${issuer.replace(/\/$/, '')}/oauth/introspect`;
            }
            if (!endpoint)
                return null;
            try {
                const basic = Buffer.from(`${intCfg.clientId || ''}:${intCfg.clientSecret || ''}`).toString('base64');
                const resp = await client.post(endpoint, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${basic}`
                    },
                    body: new URLSearchParams({ token }).toString()
                });
                if (!resp.ok) {
                    const logLevel = c.get('logLevel');
                    if (logLevel === 'debug' || logLevel === 'trace') {
                        logger.error({ status: resp.status }, '[OAuth2 Auth] Introspection failed');
                    }
                    return null;
                }
                const data = await resp.json();
                if (!data || data.active !== true)
                    return null;
                const userId = data.sub || data.username || data.user_id || null;
                const email = data.email || null;
                const username = data.preferred_username || data.username || email || userId;
                const scopes = Array.isArray(data.scope)
                    ? data.scope
                    : (typeof data.scope === 'string' ? data.scope.split(' ') : []);
                const role = data.role || data.roles || 'user';
                let user = null;
                if (fetchUserInfo && authResource && userId) {
                    try {
                        user = await authResource.get(userId).catch(() => null);
                        if (!user && email) {
                            const res = await authResource.query({ email }, { limit: 1 });
                            user = res[0] ?? null;
                        }
                    }
                    catch {
                        // User not found
                    }
                }
                if (user) {
                    return {
                        ...user,
                        scopes: user.scopes || scopes,
                        role: user.role || role,
                        tokenClaims: data
                    };
                }
                return {
                    id: userId || 'anonymous',
                    username: username || userId || 'anonymous',
                    email,
                    role,
                    scopes,
                    active: true,
                    tokenClaims: data,
                    isVirtual: true
                };
            }
            catch (e) {
                const logLevel = c.get('logLevel');
                if (logLevel === 'debug' || logLevel === 'trace') {
                    logger.error({ error: e.message }, '[OAuth2 Auth] Introspection error');
                }
                return null;
            }
        };
        const isLikelyJwt = token.split('.').length === 3;
        try {
            if (isLikelyJwt) {
                return await tryJwtVerify();
            }
        }
        catch (err) {
            const logLevel = c.get('logLevel');
            if (logLevel === 'debug' || logLevel === 'trace') {
                logger.error({ error: err.message }, '[OAuth2 Auth] Token verification failed');
            }
        }
        const introspected = await tryIntrospection();
        if (introspected)
            return introspected;
        return null;
    };
}
/**
 * Clear JWKS cache (useful for testing or when keys are rotated)
 */
export function clearJWKSCache() {
    jwksCache.clear();
}
export default createOAuth2Handler;
//# sourceMappingURL=oauth2-auth.js.map