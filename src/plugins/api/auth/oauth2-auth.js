/**
 * OAuth2/OIDC Authentication Driver (Resource Server)
 *
 * Validates JWT access tokens issued by an OAuth2/OIDC Authorization Server.
 * Fetches public keys from JWKS endpoint and verifies token signatures.
 *
 * Use this driver when your application acts as a Resource Server
 * consuming tokens from an external Authorization Server (SSO).
 *
 * @example
 * {
 *   driver: 'oauth2',
 *   config: {
 *     issuer: 'http://localhost:4000',
 *     jwksUri: 'http://localhost:4000/.well-known/jwks.json',
 *     audience: 'my-api',
 *     algorithms: ['RS256'],
 *     cacheTTL: 3600000  // 1 hour
 *   }
 * }
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createLogger } from '../../../concerns/logger.js';
import { applyProviderPreset } from './providers.js';


// Module-level logger
const logger = createLogger({ name: 'OAuth2Auth', level: 'info' });
// Cache for JWKS (avoids fetching on every request)
const jwksCache = new Map();

/**
 * Create OAuth2 authentication handler
 * @param {Object} config - OAuth2 configuration
 * @param {Object} usersResource - s3db.js users resource
 * @returns {Function} Hono middleware
 */
export function createOAuth2Handler(inputConfig, usersResource) {
  const config = applyProviderPreset('oauth2', inputConfig || {});
  const {
    issuer,
    jwksUri,
    audience = null,
    algorithms = ['RS256', 'ES256'],
    cacheTTL = 3600000, // 1 hour
    clockTolerance = 60, // 60 seconds tolerance for exp/nbf
    validateScopes = true,
    fetchUserInfo = true,
    introspection = null, // { enabled, endpoint?, clientId, clientSecret, useDiscovery? }
    verbose = false
  } = config;

  if (!issuer) {
    throw new Error('[OAuth2 Auth] Missing required config: issuer');
  }

  // Resolve JWKS URI via discovery (OAuth2/OIDC) or fallback to default path
  const resolveJwksUri = async () => {
    if (jwksUri) return jwksUri;
    const base = issuer.replace(/\/$/, '');
    // Try OAuth 2.0 Authorization Server Metadata (RFC 8414)
    try {
      const asr = await fetch(`${base}/.well-known/oauth-authorization-server`);
      if (asr.ok) {
        const meta = await asr.json();
        if (meta.jwks_uri) return meta.jwks_uri;
      }
    } catch {}
    // Try OIDC discovery
    try {
      const oidc = await fetch(`${base}/.well-known/openid-configuration`);
      if (oidc.ok) {
        const meta = await oidc.json();
        if (meta.jwks_uri) return meta.jwks_uri;
      }
    } catch {}
    return `${base}/.well-known/jwks.json`;
  };

  // Get or create JWKS fetcher (cached)
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

  /**
   * OAuth2 authentication middleware
   */
  return async (c) => {
    // Extract token from Authorization header
    const authHeader = c.req.header('authorization') || c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null; // No OAuth2 token, try next auth method
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Helper: Try JWT verification first; optionally fall back to introspection
    const tryJwtVerify = async () => {
      const jwks = await getJWKS();
      const verifyOptions = { issuer, algorithms, clockTolerance, ...(audience ? { audience } : {}) };
      const { payload } = await jwtVerify(token, jwks, verifyOptions);
      
      // Extract user info from token claims
      const userId = payload.sub; // Subject (user ID)
      const email = payload.email || null;
      const username = payload.preferred_username || payload.username || email;
      const scopes = payload.scope ? payload.scope.split(' ') : (payload.scopes || []);
      const role = payload.role || 'user';

      // Optionally fetch full user info from database
      let user = null;

      if (fetchUserInfo && userId && usersResource) {
        try {
          // Try to find user by ID
          user = await usersResource.get(userId).catch(() => null);

          // If not found by ID, try by email
          if (!user && email) {
            const users = await usersResource.query({ email }, { limit: 1 });
            user = users[0] || null;
          }
        } catch (err) {
          // User not found in local database, use token claims only
        }
      }

      // If user found in database, merge with token claims
      if (user) {
        return {
          ...user,
          scopes: user.scopes || scopes, // Prefer database scopes
          role: user.role || role,
          tokenClaims: payload // Include full token claims
        };
      }

      // User not in database, create virtual user from token
      return {
        id: userId,
        username: username || userId,
        email,
        role,
        scopes,
        active: true,
        tokenClaims: payload,
        isVirtual: true // Flag to indicate user is not in local database
      };
    };

    const tryIntrospection = async () => {
      const intCfg = introspection || {};
      if (intCfg.enabled !== true) return null;

      // Determine endpoint: explicit -> discovery -> issuer default
      let endpoint = intCfg.endpoint;
      if (!endpoint && intCfg.useDiscovery !== false && issuer) {
        try {
          const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
          if (res.ok) {
            const doc = await res.json();
            endpoint = doc.introspection_endpoint || endpoint;
          }
        } catch (e) {
          if (verbose || c.get('verbose')) {
            logger.error('[OAuth2 Auth] Discovery for introspection failed:', e.message);
          }
        }
      }
      if (!endpoint && issuer) {
        // Common fallback; may vary by provider
        endpoint = `${issuer.replace(/\/$/, '')}/oauth/introspect`;
      }
      if (!endpoint) return null;

      try {
        const basic = Buffer.from(`${intCfg.clientId || ''}:${intCfg.clientSecret || ''}`).toString('base64');
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basic}`
          },
          body: new URLSearchParams({ token })
        });
        if (!resp.ok) {
          if (verbose || c.get('verbose')) {
            logger.error('[OAuth2 Auth] Introspection failed:', resp.status);
          }
          return null;
        }
        const data = await resp.json();
        if (!data || data.active !== true) return null;

        const userId = data.sub || data.username || data.user_id || null;
        const email = data.email || null;
        const username = data.preferred_username || data.username || email || userId;
        const scopes = Array.isArray(data.scope) ? data.scope : (typeof data.scope === 'string' ? data.scope.split(' ') : []);
        const role = data.role || data.roles || 'user';

        let user = null;
        if (fetchUserInfo && usersResource && userId) {
          try {
            user = await usersResource.get(userId).catch(() => null);
            if (!user && email) {
              const res = await usersResource.query({ email }, { limit: 1 });
              user = res[0] || null;
            }
          } catch {}
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
      } catch (e) {
        if (verbose || c.get('verbose')) {
          logger.error('[OAuth2 Auth] Introspection error:', e.message);
        }
        return null;
      }
    };

    // Attempt JWT verification first; on failure or non-JWT tokens, try introspection when enabled
    const isLikelyJwt = token.split('.').length === 3;
    try {
      if (isLikelyJwt) {
        return await tryJwtVerify();
      }
    } catch (err) {
      if (verbose || c.get('verbose')) {
        logger.error('[OAuth2 Auth] Token verification failed:', err.message);
      }
      // fallthrough to introspection
    }

    // Try introspection (opaque tokens or jwt verify failed)
    const introspected = await tryIntrospection();
    if (introspected) return introspected;

    return null; // Invalid token or not active
  };
}

/**
 * Clear JWKS cache (useful for testing or when keys are rotated)
 */
export function clearJWKSCache() {
  jwksCache.clear();
}

export default createOAuth2Handler;
