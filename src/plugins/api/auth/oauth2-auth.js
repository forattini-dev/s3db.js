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

// Cache for JWKS (avoids fetching on every request)
const jwksCache = new Map();

/**
 * Create OAuth2 authentication handler
 * @param {Object} config - OAuth2 configuration
 * @param {Object} usersResource - s3db.js users resource
 * @returns {Function} Hono middleware
 */
export function createOAuth2Handler(config, usersResource) {
  const {
    issuer,
    jwksUri,
    audience = null,
    algorithms = ['RS256', 'ES256'],
    cacheTTL = 3600000, // 1 hour
    clockTolerance = 60, // 60 seconds tolerance for exp/nbf
    validateScopes = true,
    fetchUserInfo = true
  } = config;

  if (!issuer) {
    throw new Error('[OAuth2 Auth] Missing required config: issuer');
  }

  // Construct JWKS URI from issuer if not provided
  const finalJwksUri = jwksUri || `${issuer}/.well-known/jwks.json`;

  // Get or create JWKS fetcher (cached)
  const getJWKS = () => {
    const cacheKey = finalJwksUri;

    if (jwksCache.has(cacheKey)) {
      const cached = jwksCache.get(cacheKey);
      if (Date.now() - cached.timestamp < cacheTTL) {
        return cached.jwks;
      }
    }

    // Create remote JWKS fetcher
    const jwks = createRemoteJWKSet(new URL(finalJwksUri), {
      cooldownDuration: 30000, // 30 seconds cooldown between fetches
      cacheMaxAge: cacheTTL
    });

    jwksCache.set(cacheKey, {
      jwks,
      timestamp: Date.now()
    });

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

    try {
      // Verify JWT token with remote JWKS
      const jwks = getJWKS();

      const verifyOptions = {
        issuer,
        algorithms,
        clockTolerance
      };

      if (audience) {
        verifyOptions.audience = audience;
      }

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

    } catch (err) {
      // Token verification failed
      if (config.verbose) {
        console.error('[OAuth2 Auth] Token verification failed:', err.message);
      }
      return null; // Invalid token, try next auth method
    }
  };
}

/**
 * Clear JWKS cache (useful for testing or when keys are rotated)
 */
export function clearJWKSCache() {
  jwksCache.clear();
}

export default createOAuth2Handler;
