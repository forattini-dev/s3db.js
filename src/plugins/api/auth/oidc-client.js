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

import { createVerify, createPublicKey } from 'crypto';
import { getCronManager } from '../../../concerns/cron-manager.js';

/**
 * Validate JWT claims
 * @param {Object} payload - Token payload
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateClaims(payload, options = {}) {
  const {
    issuer,
    audience,
    clockTolerance = 60
  } = options;

  const now = Math.floor(Date.now() / 1000);

  // Check required claims
  if (!payload.sub) {
    return { valid: false, error: 'Missing required claim: sub' };
  }

  if (!payload.iat) {
    return { valid: false, error: 'Missing required claim: iat' };
  }

  if (!payload.exp) {
    return { valid: false, error: 'Missing required claim: exp' };
  }

  // Validate issuer
  if (issuer && payload.iss !== issuer) {
    return {
      valid: false,
      error: `Invalid issuer. Expected: ${issuer}, Got: ${payload.iss}`
    };
  }

  // Validate audience
  if (audience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    if (!audiences.includes(audience)) {
      return {
        valid: false,
        error: `Invalid audience. Expected: ${audience}, Got: ${audiences.join(', ')}`
      };
    }
  }

  // Validate expiration with clock tolerance
  if (payload.exp < (now - clockTolerance)) {
    return { valid: false, error: 'Token has expired' };
  }

  // Validate not before (if present)
  if (payload.nbf && payload.nbf > (now + clockTolerance)) {
    return { valid: false, error: 'Token not yet valid (nbf)' };
  }

  // Validate issued at (basic sanity check - not in future)
  if (payload.iat > (now + clockTolerance)) {
    return { valid: false, error: 'Token issued in the future' };
  }

  return { valid: true, error: null };
}

/**
 * OIDC Client for validating tokens from Authorization Server
 */
export class OIDCClient {
  constructor(options = {}) {
    const {
      issuer,
      audience,
      jwksUri,
      jwksCacheTTL = 3600000, // 1 hour
      clockTolerance = 60,
      autoRefreshJWKS = true,
      discoveryUri
    } = options;

    if (!issuer) {
      throw new Error('issuer is required for OIDCClient');
    }

    this.issuer = issuer.replace(/\/$/, '');
    this.audience = audience;
    this.jwksUri = jwksUri || `${this.issuer}/.well-known/jwks.json`;
    this.discoveryUri = discoveryUri || `${this.issuer}/.well-known/openid-configuration`;
    this.jwksCacheTTL = jwksCacheTTL;
    this.clockTolerance = clockTolerance;
    this.autoRefreshJWKS = autoRefreshJWKS;

    this.jwksCache = null;
    this.jwksCacheExpiry = null;
    this.discoveryCache = null;
    this.keys = new Map(); // kid → publicKey (PEM)
    this.cronManager = getCronManager();
    this.refreshJobName = null;
  }

  /**
   * Initialize OIDC client - fetch discovery document and JWKS
   */
  async initialize() {
    await this.fetchDiscovery();
    await this.fetchJWKS();

    // Auto-refresh JWKS if enabled
    if (this.autoRefreshJWKS) {
      this.startJWKSRefresh();
    }
  }

  /**
   * Fetch OIDC discovery document
   */
  async fetchDiscovery() {
    try {
      const response = await fetch(this.discoveryUri);

      if (!response.ok) {
        throw new Error(`Failed to fetch discovery document: ${response.status}`);
      }

      this.discoveryCache = await response.json();

      // Update jwksUri from discovery if available
      if (this.discoveryCache.jwks_uri) {
        this.jwksUri = this.discoveryCache.jwks_uri;
      }

      return this.discoveryCache;
    } catch (error) {
      throw new Error(`Failed to fetch OIDC discovery: ${error.message}`);
    }
  }

  /**
   * Fetch JWKS from issuer
   */
  async fetchJWKS(force = false) {
    const now = Date.now();

    // Return cached JWKS if still valid
    if (!force && this.jwksCache && this.jwksCacheExpiry > now) {
      return this.jwksCache;
    }

    try {
      const response = await fetch(this.jwksUri);

      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS: ${response.status}`);
      }

      const jwks = await response.json();

      // Convert JWKs to PEM format and cache
      for (const jwk of jwks.keys) {
        if (jwk.kty === 'RSA' && jwk.use === 'sig') {
          const publicKey = this.jwkToPem(jwk);
          this.keys.set(jwk.kid, publicKey);
        }
      }

      this.jwksCache = jwks;
      this.jwksCacheExpiry = now + this.jwksCacheTTL;

      return jwks;
    } catch (error) {
      throw new Error(`Failed to fetch JWKS: ${error.message}`);
    }
  }

  /**
   * Convert JWK to PEM format
   */
  jwkToPem(jwk) {
    try {
      // Use Node.js crypto to import JWK
      const keyObject = createPublicKey({
        key: jwk,
        format: 'jwk'
      });

      // Export as PEM
      return keyObject.export({
        type: 'spki',
        format: 'pem'
      });
    } catch (error) {
      throw new Error(`Failed to convert JWK to PEM: ${error.message}`);
    }
  }

  /**
   * Get public key by kid
   */
  async getPublicKey(kid) {
    let publicKey = this.keys.get(kid);

    // If key not found, try refreshing JWKS
    if (!publicKey) {
      await this.fetchJWKS(true);
      publicKey = this.keys.get(kid);
    }

    return publicKey;
  }

  /**
   * Verify RS256 JWT token
   */
  async verifyToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [encodedHeader, encodedPayload, signature] = parts;

      // Decode header
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());

      // Verify algorithm
      if (header.alg !== 'RS256') {
        return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
      }

      // Get public key
      const publicKey = await this.getPublicKey(header.kid);

      if (!publicKey) {
        return { valid: false, error: `Public key not found for kid: ${header.kid}` };
      }

      // Verify signature
      const verify = createVerify('RSA-SHA256');
      verify.update(`${encodedHeader}.${encodedPayload}`);
      verify.end();

      const isValid = verify.verify(publicKey, signature, 'base64url');

      if (!isValid) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Decode payload
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());

      // Validate claims
      const claimValidation = validateClaims(payload, {
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: this.clockTolerance
      });

      if (!claimValidation.valid) {
        return { valid: false, error: claimValidation.error };
      }

      return {
        valid: true,
        header,
        payload
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Express middleware for OIDC authentication
   */
  async middleware(req, res, next) {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing Authorization header'
        });
      }

      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid Authorization header format. Expected: Bearer <token>'
        });
      }

      const token = authHeader.substring(7);

      if (!token) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing token'
        });
      }

      // Verify token
      const verification = await this.verifyToken(token);

      if (!verification.valid) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: verification.error
        });
      }

      // Attach user to request
      req.user = verification.payload;
      req.token = token;

      // Continue to next middleware
      next();
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Start auto-refresh of JWKS
   */
  startJWKSRefresh() {
    // Refresh JWKS periodically (half of TTL to ensure fresh keys)
    const refreshInterval = Math.floor(this.jwksCacheTTL / 2);

    this.refreshJobName = `oidc-jwks-refresh-${Date.now()}`;
    this.cronManager.scheduleInterval(
      refreshInterval,
      async () => {
        try {
          await this.fetchJWKS(true);
        } catch (error) {
          console.error('Failed to refresh JWKS:', error);
        }
      },
      this.refreshJobName
    );
  }

  /**
   * Stop auto-refresh of JWKS
   */
  stopJWKSRefresh() {
    if (this.refreshJobName) {
      this.cronManager.stop(this.refreshJobName);
      this.refreshJobName = null;
    }
  }

  /**
   * Introspect token via Authorization Server (RFC 7662)
   */
  async introspectToken(token, clientId, clientSecret) {
    if (!this.discoveryCache || !this.discoveryCache.introspection_endpoint) {
      throw new Error('Introspection endpoint not available');
    }

    try {
      const response = await fetch(this.discoveryCache.introspection_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({ token })
      });

      if (!response.ok) {
        throw new Error(`Introspection failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Token introspection failed: ${error.message}`);
    }
  }

  /**
   * Get discovery document
   */
  getDiscovery() {
    return this.discoveryCache;
  }

  /**
   * Get cached JWKS
   */
  getJWKS() {
    return this.jwksCache;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopJWKSRefresh();
    this.keys.clear();
    this.jwksCache = null;
    this.discoveryCache = null;
  }
}

/**
 * Create OIDC middleware factory for easy integration
 */
export function createOIDCMiddleware(options) {
  const client = new OIDCClient(options);

  // Return async middleware that initializes on first use
  let initialized = false;

  const middleware = async (req, res, next) => {
    if (!initialized) {
      await client.initialize();
      initialized = true;
    }

    return client.middleware(req, res, next);
  };

  // Expose client for cleanup
  middleware.client = client;
  middleware.destroy = () => client.destroy();

  return middleware;
}

export default {
  OIDCClient,
  createOIDCMiddleware
};
