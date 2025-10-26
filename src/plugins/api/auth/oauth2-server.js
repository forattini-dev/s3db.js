/**
 * OAuth2/OIDC Authorization Server
 *
 * Provides endpoints for OAuth2 + OpenID Connect flows:
 * - /.well-known/openid-configuration (Discovery)
 * - /.well-known/jwks.json (Public keys)
 * - /auth/token (Token endpoint)
 * - /auth/userinfo (User info endpoint)
 * - /auth/introspect (Token introspection)
 *
 * @example
 * import { OAuth2Server } from 's3db.js/plugins/api/auth/oauth2-server';
 *
 * const oauth2 = new OAuth2Server({
 *   issuer: 'https://sso.example.com',
 *   keyResource: db.getResource('oauth_keys'),
 *   userResource: db.getResource('users'),
 *   clientResource: db.getResource('oauth_clients')
 * });
 *
 * await oauth2.initialize();
 *
 * // Use with API plugin custom routes
 * apiPlugin.addRoute({
 *   path: '/.well-known/openid-configuration',
 *   method: 'GET',
 *   handler: oauth2.discoveryHandler.bind(oauth2),
 *   auth: false
 * });
 */

import { KeyManager } from './rsa-keys.js';
import {
  generateDiscoveryDocument,
  validateClaims,
  extractUserClaims,
  parseScopes,
  validateScopes,
  generateAuthCode,
  generateClientId,
  generateClientSecret
} from './oidc-discovery.js';

/**
 * OAuth2/OIDC Authorization Server
 */
export class OAuth2Server {
  constructor(options = {}) {
    const {
      issuer,
      keyResource,
      userResource,
      clientResource,
      authCodeResource,
      supportedScopes = ['openid', 'profile', 'email', 'offline_access'],
      supportedGrantTypes = ['authorization_code', 'client_credentials', 'refresh_token'],
      supportedResponseTypes = ['code', 'token', 'id_token'],
      accessTokenExpiry = '15m',
      idTokenExpiry = '15m',
      refreshTokenExpiry = '7d',
      authCodeExpiry = '10m'
    } = options;

    if (!issuer) {
      throw new Error('Issuer URL is required for OAuth2Server');
    }

    if (!keyResource) {
      throw new Error('keyResource is required for OAuth2Server');
    }

    if (!userResource) {
      throw new Error('userResource is required for OAuth2Server');
    }

    this.issuer = issuer.replace(/\/$/, '');
    this.keyResource = keyResource;
    this.userResource = userResource;
    this.clientResource = clientResource;
    this.authCodeResource = authCodeResource;
    this.supportedScopes = supportedScopes;
    this.supportedGrantTypes = supportedGrantTypes;
    this.supportedResponseTypes = supportedResponseTypes;
    this.accessTokenExpiry = accessTokenExpiry;
    this.idTokenExpiry = idTokenExpiry;
    this.refreshTokenExpiry = refreshTokenExpiry;
    this.authCodeExpiry = authCodeExpiry;

    this.keyManager = new KeyManager(keyResource);
  }

  /**
   * Initialize OAuth2 server - load keys
   */
  async initialize() {
    await this.keyManager.initialize();
  }

  /**
   * OIDC Discovery endpoint handler
   * GET /.well-known/openid-configuration
   */
  async discoveryHandler(req, res) {
    try {
      const document = generateDiscoveryDocument({
        issuer: this.issuer,
        grantTypes: this.supportedGrantTypes,
        responseTypes: this.supportedResponseTypes,
        scopes: this.supportedScopes
      });

      res.status(200).json(document);
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * JWKS endpoint handler
   * GET /.well-known/jwks.json
   */
  async jwksHandler(req, res) {
    try {
      const jwks = await this.keyManager.getJWKS();
      res.status(200).json(jwks);
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Token endpoint handler
   * POST /auth/token
   *
   * Supports:
   * - client_credentials grant
   * - authorization_code grant (if authCodeResource provided)
   * - refresh_token grant (if authCodeResource provided)
   */
  async tokenHandler(req, res) {
    try {
      const { grant_type, scope, client_id, client_secret } = req.body;

      // Validate grant type
      if (!grant_type) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'grant_type is required'
        });
      }

      if (!this.supportedGrantTypes.includes(grant_type)) {
        return res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: `Grant type ${grant_type} is not supported`
        });
      }

      // Validate client credentials
      if (!client_id) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'client_id is required'
        });
      }

      // Authenticate client if clientResource is provided
      if (this.clientResource) {
        const client = await this.authenticateClient(client_id, client_secret);
        if (!client) {
          return res.status(401).json({
            error: 'invalid_client',
            error_description: 'Client authentication failed'
          });
        }
      }

      // Handle different grant types
      switch (grant_type) {
        case 'client_credentials':
          return await this.handleClientCredentials(req, res, { client_id, scope });

        case 'authorization_code':
          return await this.handleAuthorizationCode(req, res);

        case 'refresh_token':
          return await this.handleRefreshToken(req, res);

        default:
          return res.status(400).json({
            error: 'unsupported_grant_type',
            error_description: `Grant type ${grant_type} is not supported`
          });
      }
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Client Credentials flow handler
   */
  async handleClientCredentials(req, res, { client_id, scope }) {
    const scopes = parseScopes(scope);

    // Validate scopes
    const scopeValidation = validateScopes(scopes, this.supportedScopes);
    if (!scopeValidation.valid) {
      return res.status(400).json({
        error: 'invalid_scope',
        error_description: scopeValidation.error
      });
    }

    // Create access token
    const accessToken = this.keyManager.createToken({
      iss: this.issuer,
      sub: client_id,
      aud: this.issuer,
      scope: scopeValidation.scopes.join(' '),
      token_type: 'access_token'
    }, this.accessTokenExpiry);

    return res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.parseExpiryToSeconds(this.accessTokenExpiry),
      scope: scopeValidation.scopes.join(' ')
    });
  }

  /**
   * Authorization Code flow handler
   */
  async handleAuthorizationCode(req, res) {
    if (!this.authCodeResource) {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Authorization code flow requires authCodeResource'
      });
    }

    const { code, redirect_uri, code_verifier } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'code is required'
      });
    }

    // Find authorization code
    const authCodes = await this.authCodeResource.query({ code });

    if (authCodes.length === 0) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid authorization code'
      });
    }

    const authCode = authCodes[0];

    // Validate code expiration
    const now = Math.floor(Date.now() / 1000);
    if (authCode.expiresAt < now) {
      await this.authCodeResource.remove(authCode.id);
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code has expired'
      });
    }

    // Validate redirect_uri
    if (authCode.redirectUri !== redirect_uri) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'redirect_uri mismatch'
      });
    }

    // Validate PKCE if code_challenge was used
    if (authCode.codeChallenge) {
      if (!code_verifier) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'code_verifier is required'
        });
      }

      const isValid = await this.validatePKCE(
        code_verifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod
      );

      if (!isValid) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid code_verifier'
        });
      }
    }

    // Get user
    const user = await this.userResource.get(authCode.userId);
    if (!user) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'User not found'
      });
    }

    // Parse scopes
    const scopes = parseScopes(authCode.scope);

    // Create access token
    const accessToken = this.keyManager.createToken({
      iss: this.issuer,
      sub: user.id,
      aud: authCode.audience || this.issuer,
      scope: scopes.join(' '),
      token_type: 'access_token'
    }, this.accessTokenExpiry);

    const response = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.parseExpiryToSeconds(this.accessTokenExpiry)
    };

    // Create ID token if openid scope requested
    if (scopes.includes('openid')) {
      const userClaims = extractUserClaims(user, scopes);

      const idToken = this.keyManager.createToken({
        iss: this.issuer,
        sub: user.id,
        aud: authCode.clientId,
        nonce: authCode.nonce,
        ...userClaims
      }, this.idTokenExpiry);

      response.id_token = idToken;
    }

    // Create refresh token if offline_access scope requested
    if (scopes.includes('offline_access')) {
      const refreshToken = this.keyManager.createToken({
        iss: this.issuer,
        sub: user.id,
        aud: this.issuer,
        scope: scopes.join(' '),
        token_type: 'refresh_token'
      }, this.refreshTokenExpiry);

      response.refresh_token = refreshToken;
    }

    // Delete used authorization code
    await this.authCodeResource.remove(authCode.id);

    return res.status(200).json(response);
  }

  /**
   * Refresh Token flow handler
   */
  async handleRefreshToken(req, res) {
    const { refresh_token, scope } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'refresh_token is required'
      });
    }

    // Verify refresh token
    const verified = await this.keyManager.verifyToken(refresh_token);

    if (!verified) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid refresh token'
      });
    }

    const { payload } = verified;

    // Validate token type
    if (payload.token_type !== 'refresh_token') {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Token is not a refresh token'
      });
    }

    // Validate claims
    const claimValidation = validateClaims(payload, {
      issuer: this.issuer,
      clockTolerance: 60
    });

    if (!claimValidation.valid) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: claimValidation.error
      });
    }

    // Parse scopes (use original scopes if not provided)
    const requestedScopes = scope ? parseScopes(scope) : parseScopes(payload.scope);
    const originalScopes = parseScopes(payload.scope);

    // Requested scopes must be subset of original scopes
    const invalidScopes = requestedScopes.filter(s => !originalScopes.includes(s));
    if (invalidScopes.length > 0) {
      return res.status(400).json({
        error: 'invalid_scope',
        error_description: `Cannot request scopes not in original grant: ${invalidScopes.join(', ')}`
      });
    }

    // Get user
    const user = await this.userResource.get(payload.sub);
    if (!user) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'User not found'
      });
    }

    // Create new access token
    const accessToken = this.keyManager.createToken({
      iss: this.issuer,
      sub: user.id,
      aud: payload.aud,
      scope: requestedScopes.join(' '),
      token_type: 'access_token'
    }, this.accessTokenExpiry);

    const response = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.parseExpiryToSeconds(this.accessTokenExpiry)
    };

    // Create new ID token if openid scope requested
    if (requestedScopes.includes('openid')) {
      const userClaims = extractUserClaims(user, requestedScopes);

      const idToken = this.keyManager.createToken({
        iss: this.issuer,
        sub: user.id,
        aud: payload.aud,
        ...userClaims
      }, this.idTokenExpiry);

      response.id_token = idToken;
    }

    return res.status(200).json(response);
  }

  /**
   * UserInfo endpoint handler
   * GET /auth/userinfo
   */
  async userinfoHandler(req, res) {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Missing or invalid Authorization header'
        });
      }

      const token = authHeader.substring(7);

      // Verify token
      const verified = await this.keyManager.verifyToken(token);
      if (!verified) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Invalid access token'
        });
      }

      const { payload } = verified;

      // Validate claims
      const claimValidation = validateClaims(payload, {
        issuer: this.issuer,
        clockTolerance: 60
      });

      if (!claimValidation.valid) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: claimValidation.error
        });
      }

      // Get user
      const user = await this.userResource.get(payload.sub);
      if (!user) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'User not found'
        });
      }

      // Extract claims based on scopes
      const scopes = parseScopes(payload.scope);
      const userClaims = extractUserClaims(user, scopes);

      return res.status(200).json({
        sub: user.id,
        ...userClaims
      });
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Token Introspection endpoint handler (RFC 7662)
   * POST /auth/introspect
   */
  async introspectHandler(req, res) {
    try {
      const { token, token_type_hint } = req.body;

      if (!token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'token is required'
        });
      }

      // Verify token
      const verified = await this.keyManager.verifyToken(token);

      if (!verified) {
        return res.status(200).json({ active: false });
      }

      const { payload } = verified;

      // Validate claims
      const claimValidation = validateClaims(payload, {
        issuer: this.issuer,
        clockTolerance: 60
      });

      if (!claimValidation.valid) {
        return res.status(200).json({ active: false });
      }

      // Return token metadata
      return res.status(200).json({
        active: true,
        scope: payload.scope,
        client_id: payload.aud,
        username: payload.sub,
        token_type: payload.token_type || 'access_token',
        exp: payload.exp,
        iat: payload.iat,
        sub: payload.sub,
        iss: payload.iss,
        aud: payload.aud
      });
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Authenticate client with credentials
   */
  async authenticateClient(clientId, clientSecret) {
    if (!this.clientResource) {
      return null;
    }

    try {
      const clients = await this.clientResource.query({ clientId });

      if (clients.length === 0) {
        return null;
      }

      const client = clients[0];

      // Verify client secret
      if (client.clientSecret !== clientSecret) {
        return null;
      }

      return client;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate PKCE code verifier
   */
  async validatePKCE(codeVerifier, codeChallenge, codeChallengeMethod = 'plain') {
    if (codeChallengeMethod === 'plain') {
      return codeVerifier === codeChallenge;
    }

    if (codeChallengeMethod === 'S256') {
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      return hash === codeChallenge;
    }

    return false;
  }

  /**
   * Parse expiry string to seconds
   */
  parseExpiryToSeconds(expiresIn) {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid expiresIn format');
    }

    const [, value, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(value) * multipliers[unit];
  }

  /**
   * Rotate signing keys
   */
  async rotateKeys() {
    return await this.keyManager.rotateKey();
  }
}

export default OAuth2Server;
