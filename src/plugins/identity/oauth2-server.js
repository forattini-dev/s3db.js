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
 * import { OAuth2Server } from 's3db.js/plugins/identity/oauth2-server';
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
   * Authorization endpoint handler (GET /oauth/authorize)
   * Implements OAuth2 authorization code flow
   *
   * Query params:
   * - response_type: 'code' (required)
   * - client_id: Client identifier (required)
   * - redirect_uri: Callback URL (required)
   * - scope: Requested scopes (optional)
   * - state: CSRF protection (recommended)
   * - code_challenge: PKCE challenge (optional)
   * - code_challenge_method: PKCE method (optional, default: plain)
   */
  async authorizeHandler(req, res) {
    try {
      const {
        response_type,
        client_id,
        redirect_uri,
        scope,
        state,
        code_challenge,
        code_challenge_method = 'plain'
      } = req.query || {};

      // Validate required parameters
      if (!response_type || !client_id || !redirect_uri) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'response_type, client_id, and redirect_uri are required'
        });
      }

      // Validate response_type
      if (!this.supportedResponseTypes.includes(response_type)) {
        return res.status(400).json({
          error: 'unsupported_response_type',
          error_description: `Response type ${response_type} is not supported`
        });
      }

      // Validate client
      if (this.clientResource) {
        const clients = await this.clientResource.query({ clientId: client_id });

        if (clients.length === 0) {
          return res.status(400).json({
            error: 'invalid_client',
            error_description: 'Client not found'
          });
        }

        const client = clients[0];

        // Validate redirect_uri
        if (!client.redirectUris.includes(redirect_uri)) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid redirect_uri'
          });
        }

        // Validate scopes
        if (scope) {
          const requestedScopes = scope.split(' ');
          const invalidScopes = requestedScopes.filter(s =>
            !client.allowedScopes.includes(s)
          );

          if (invalidScopes.length > 0) {
            return res.status(400).json({
              error: 'invalid_scope',
              error_description: `Invalid scopes: ${invalidScopes.join(', ')}`
            });
          }
        }
      }

      // For now, return a simple HTML form for user authentication
      // In production, this would be a proper login UI with session management
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization - ${this.issuer}</title>
  <style>
    body { font-family: system-ui; max-width: 400px; margin: 100px auto; padding: 20px; }
    form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="info">
    <strong>Application requesting access:</strong><br>
    Client ID: ${client_id}<br>
    Scopes: ${scope || 'none'}<br>
    Redirect: ${redirect_uri}
  </div>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="response_type" value="${response_type}">
    <input type="hidden" name="client_id" value="${client_id}">
    <input type="hidden" name="redirect_uri" value="${redirect_uri}">
    <input type="hidden" name="scope" value="${scope || ''}">
    <input type="hidden" name="state" value="${state || ''}">
    <input type="hidden" name="code_challenge" value="${code_challenge || ''}">
    <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">

    <input type="email" name="username" placeholder="Email" required>
    <input type="password" name="password" placeholder="Password" required>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;

      return res.status(200).header('Content-Type', 'text/html').send(html);

    } catch (error) {
      console.error('[OAuth2Server] Authorization error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Authorization endpoint handler (POST /oauth/authorize)
   * Processes user authentication and generates authorization code
   */
  async authorizePostHandler(req, res) {
    try {
      const {
        response_type,
        client_id,
        redirect_uri,
        scope,
        state,
        code_challenge,
        code_challenge_method = 'plain',
        username,
        password
      } = req.body || {};

      // Authenticate user
      const users = await this.userResource.query({ email: username });

      if (users.length === 0) {
        return res.status(401).json({
          error: 'access_denied',
          error_description: 'Invalid credentials'
        });
      }

      const user = users[0];

      // Verify password (assuming password is hashed with bcrypt or similar)
      // In production, use proper password verification
      if (user.password !== password) {
        return res.status(401).json({
          error: 'access_denied',
          error_description: 'Invalid credentials'
        });
      }

      // Generate authorization code
      const code = generateAuthCode();
      const expiresAt = new Date(Date.now() + this.parseExpiryToSeconds(this.authCodeExpiry) * 1000).toISOString();

      // Store authorization code
      if (this.authCodeResource) {
        await this.authCodeResource.insert({
          code,
          clientId: client_id,
          userId: user.id,
          redirectUri: redirect_uri,
          scope: scope || '',
          expiresAt,
          used: false,
          codeChallenge: code_challenge || null,
          codeChallengeMethod: code_challenge_method
        });
      }

      // Build redirect URL with authorization code
      const url = new URL(redirect_uri);
      url.searchParams.set('code', code);
      if (state) {
        url.searchParams.set('state', state);
      }

      // Redirect user back to client application
      return res.redirect(url.toString());

    } catch (error) {
      console.error('[OAuth2Server] Authorization POST error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Client Registration endpoint handler (POST /oauth/register)
   * Implements RFC 7591 - OAuth 2.0 Dynamic Client Registration
   *
   * Request body:
   * - redirect_uris: Array of redirect URIs (required)
   * - token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post'
   * - grant_types: Array of grant types (optional)
   * - response_types: Array of response types (optional)
   * - client_name: Human-readable name (optional)
   * - client_uri: URL of client homepage (optional)
   * - logo_uri: URL of client logo (optional)
   * - scope: Space-separated scopes (optional)
   * - contacts: Array of contact emails (optional)
   * - tos_uri: Terms of service URL (optional)
   * - policy_uri: Privacy policy URL (optional)
   */
  async registerClientHandler(req, res) {
    try {
      const {
        redirect_uris,
        token_endpoint_auth_method = 'client_secret_basic',
        grant_types,
        response_types,
        client_name,
        client_uri,
        logo_uri,
        scope,
        contacts,
        tos_uri,
        policy_uri
      } = req.body || {};

      // Validate required fields
      if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: 'redirect_uris is required and must be a non-empty array'
        });
      }

      // Validate redirect URIs (must be HTTPS in production)
      for (const uri of redirect_uris) {
        try {
          new URL(uri);
        } catch {
          return res.status(400).json({
            error: 'invalid_redirect_uri',
            error_description: `Invalid redirect URI: ${uri}`
          });
        }
      }

      // Generate client credentials
      const clientId = generateClientId();
      const clientSecret = generateClientSecret();

      // Prepare client metadata
      const clientData = {
        clientId,
        clientSecret,
        name: client_name || `Client ${clientId}`,
        redirectUris: redirect_uris,
        allowedScopes: scope ? scope.split(' ') : this.supportedScopes,
        grantTypes: grant_types || ['authorization_code', 'refresh_token'],
        responseTypes: response_types || ['code'],
        tokenEndpointAuthMethod: token_endpoint_auth_method,
        active: true
      };

      // Optional fields
      if (client_uri) clientData.clientUri = client_uri;
      if (logo_uri) clientData.logoUri = logo_uri;
      if (contacts) clientData.contacts = contacts;
      if (tos_uri) clientData.tosUri = tos_uri;
      if (policy_uri) clientData.policyUri = policy_uri;

      // Store client
      if (!this.clientResource) {
        return res.status(500).json({
          error: 'server_error',
          error_description: 'Client registration not available'
        });
      }

      const client = await this.clientResource.insert(clientData);

      // Return client credentials (RFC 7591 response format)
      return res.status(201).json({
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0, // 0 = never expires
        redirect_uris: redirect_uris,
        token_endpoint_auth_method,
        grant_types: clientData.grantTypes,
        response_types: clientData.responseTypes,
        client_name: clientData.name,
        client_uri,
        logo_uri,
        scope: clientData.allowedScopes.join(' '),
        contacts,
        tos_uri,
        policy_uri
      });

    } catch (error) {
      console.error('[OAuth2Server] Client registration error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  }

  /**
   * Token Revocation endpoint handler (POST /oauth/revoke)
   * Implements RFC 7009 - OAuth 2.0 Token Revocation
   *
   * Request body:
   * - token: Token to revoke (required)
   * - token_type_hint: 'access_token' | 'refresh_token' (optional)
   */
  async revokeHandler(req, res) {
    try {
      const { token, token_type_hint } = req.body || {};

      if (!token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'token is required'
        });
      }

      // Verify and decode token
      const { publicKey, privateKey, kid } = await this.keyManager.getCurrentKey();
      const { verifyRS256Token } = await import('./rsa-keys.js');

      const [valid, payload] = verifyRS256Token(token, publicKey);

      if (!valid) {
        // RFC 7009: "The authorization server responds with HTTP status code 200"
        // even if token is invalid (prevents token scanning)
        return res.status(200).send();
      }

      // In a production system, you would:
      // 1. Store revoked tokens in a blacklist (Redis, database, etc.)
      // 2. Check blacklist during token validation
      // 3. Set TTL on blacklist entries matching token expiry

      // For now, just return success
      // TODO: Implement token blacklist storage

      return res.status(200).send();

    } catch (error) {
      console.error('[OAuth2Server] Token revocation error:', error);
      // RFC 7009: Return 200 even on error (security best practice)
      return res.status(200).send();
    }
  }

  /**
   * Rotate signing keys
   */
  async rotateKeys() {
    return await this.keyManager.rotateKey();
  }
}

export default OAuth2Server;
