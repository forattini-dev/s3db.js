/**
 * Identity Provider Plugin - OAuth2/OIDC Authorization Server
 *
 * Provides complete OAuth2 + OpenID Connect server functionality:
 * - RSA key management for token signing
 * - OAuth2 grant types (authorization_code, client_credentials, refresh_token)
 * - OIDC flows (id_token, userinfo endpoint)
 * - Token introspection
 * - Client registration
 *
 * @example
 * import { Database } from 's3db.js';
 * import { IdentityPlugin } from 's3db.js/plugins/identity';
 *
 * const db = new Database({ connectionString: '...' });
 * await db.connect();
 *
 * await db.usePlugin(new IdentityPlugin({
 *   port: 4000,
 *   issuer: 'http://localhost:4000',
 *   supportedScopes: ['openid', 'profile', 'email', 'read:api', 'write:api'],
 *   supportedGrantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
 *   accessTokenExpiry: '15m',
 *   idTokenExpiry: '15m',
 *   refreshTokenExpiry: '7d'
 * }));
 */

import { Plugin } from '../plugin.class.js';
import { requirePluginDependency } from '../concerns/plugin-dependencies.js';
import tryFn from '../../concerns/try-fn.js';
import { OAuth2Server } from './oauth2-server.js';

/**
 * Identity Provider Plugin class
 * @class
 * @extends Plugin
 */
export class IdentityPlugin extends Plugin {
  /**
   * Create Identity Provider Plugin instance
   * @param {Object} options - Plugin configuration
   */
  constructor(options = {}) {
    super(options);

    this.config = {
      // Server configuration
      port: options.port || 4000,
      host: options.host || '0.0.0.0',
      verbose: options.verbose || false,

      // OAuth2/OIDC configuration
      issuer: options.issuer || `http://localhost:${options.port || 4000}`,
      supportedScopes: options.supportedScopes || ['openid', 'profile', 'email', 'offline_access'],
      supportedGrantTypes: options.supportedGrantTypes || ['authorization_code', 'client_credentials', 'refresh_token'],
      supportedResponseTypes: options.supportedResponseTypes || ['code', 'token', 'id_token'],

      // Token expiration
      accessTokenExpiry: options.accessTokenExpiry || '15m',
      idTokenExpiry: options.idTokenExpiry || '15m',
      refreshTokenExpiry: options.refreshTokenExpiry || '7d',
      authCodeExpiry: options.authCodeExpiry || '10m',

      // User resource (for authentication)
      userResource: options.userResource || 'users',

      // CORS configuration
      cors: {
        enabled: options.cors?.enabled !== false, // Enabled by default for identity servers
        origin: options.cors?.origin || '*',
        methods: options.cors?.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: options.cors?.allowedHeaders || ['Content-Type', 'Authorization', 'X-API-Key'],
        credentials: options.cors?.credentials !== false,
        maxAge: options.cors?.maxAge || 86400
      },

      // Security headers
      security: {
        enabled: options.security?.enabled !== false
      },

      // Logging
      logging: {
        enabled: options.logging?.enabled || false,
        format: options.logging?.format || ':method :path :status :response-time ms'
      },

      // Session Management
      session: {
        sessionExpiry: options.session?.sessionExpiry || '24h',
        cookieName: options.session?.cookieName || 's3db_session',
        cookiePath: options.session?.cookiePath || '/',
        cookieHttpOnly: options.session?.cookieHttpOnly !== false,
        cookieSecure: options.session?.cookieSecure || false, // Set true in production with HTTPS
        cookieSameSite: options.session?.cookieSameSite || 'Lax',
        cleanupInterval: options.session?.cleanupInterval || 3600000, // 1 hour
        enableCleanup: options.session?.enableCleanup !== false
      },

      // Password Policy
      passwordPolicy: {
        minLength: options.passwordPolicy?.minLength || 8,
        maxLength: options.passwordPolicy?.maxLength || 128,
        requireUppercase: options.passwordPolicy?.requireUppercase !== false,
        requireLowercase: options.passwordPolicy?.requireLowercase !== false,
        requireNumbers: options.passwordPolicy?.requireNumbers !== false,
        requireSymbols: options.passwordPolicy?.requireSymbols || false,
        bcryptRounds: options.passwordPolicy?.bcryptRounds || 10
      },

      // UI Configuration (white-label customization)
      ui: {
        title: options.ui?.title || 'S3DB Identity',
        logo: options.ui?.logo || null,
        primaryColor: options.ui?.primaryColor || '#007bff',
        customCSS: options.ui?.customCSS || null,
        baseUrl: options.ui?.baseUrl || `http://localhost:${options.port || 4000}`
      },

      // Email Configuration (SMTP)
      email: {
        enabled: options.email?.enabled !== false,
        from: options.email?.from || 'noreply@s3db.identity',
        replyTo: options.email?.replyTo || null,
        smtp: {
          host: options.email?.smtp?.host || 'localhost',
          port: options.email?.smtp?.port || 587,
          secure: options.email?.smtp?.secure || false,
          auth: {
            user: options.email?.smtp?.auth?.user || '',
            pass: options.email?.smtp?.auth?.pass || ''
          },
          tls: {
            rejectUnauthorized: options.email?.smtp?.tls?.rejectUnauthorized !== false
          }
        },
        templates: {
          baseUrl: options.email?.templates?.baseUrl || options.ui?.baseUrl || `http://localhost:${options.port || 4000}`,
          brandName: options.email?.templates?.brandName || options.ui?.title || 'S3DB Identity',
          brandLogo: options.email?.templates?.brandLogo || options.ui?.logo || null,
          brandColor: options.email?.templates?.brandColor || options.ui?.primaryColor || '#007bff',
          supportEmail: options.email?.templates?.supportEmail || options.email?.replyTo || null,
          customFooter: options.email?.templates?.customFooter || null
        }
      },

      // Features (MVP - Phase 1)
      features: {
        // Endpoints (can be disabled individually)
        discovery: options.features?.discovery !== false,                    // GET /.well-known/openid-configuration
        jwks: options.features?.jwks !== false,                              // GET /.well-known/jwks.json
        token: options.features?.token !== false,                            // POST /oauth/token
        authorize: options.features?.authorize !== false,                    // GET/POST /oauth/authorize
        userinfo: options.features?.userinfo !== false,                      // GET /oauth/userinfo
        introspection: options.features?.introspection !== false,            // POST /oauth/introspect
        revocation: options.features?.revocation !== false,                  // POST /oauth/revoke
        registration: options.features?.registration !== false,              // POST /oauth/register (RFC 7591)

        // Authorization Code Flow UI
        builtInLoginUI: options.features?.builtInLoginUI !== false,          // HTML login form
        customLoginHandler: options.features?.customLoginHandler || null,    // Custom UI handler

        // PKCE (Proof Key for Code Exchange - RFC 7636)
        pkce: {
          enabled: options.features?.pkce?.enabled !== false,                // PKCE support
          required: options.features?.pkce?.required || false,               // Force PKCE for public clients
          methods: options.features?.pkce?.methods || ['S256', 'plain']      // Supported methods
        },

        // Refresh tokens
        refreshTokens: options.features?.refreshTokens !== false,            // Enable refresh tokens
        refreshTokenRotation: options.features?.refreshTokenRotation || false, // Rotate on each use
        revokeOldRefreshTokens: options.features?.revokeOldRefreshTokens !== false, // Revoke old tokens after rotation

        // Future features (Phase 2 - commented for reference)
        // admin: { enabled: false, apiKey: null, endpoints: {...} },
        // consent: { enabled: false, skipForTrustedClients: true },
        // mfa: { enabled: false, methods: ['totp', 'sms', 'email'] },
        // emailVerification: { enabled: false, required: false },
        // passwordPolicy: { enabled: false, minLength: 8, ... },
        // webhooks: { enabled: false, endpoints: [], events: [] }
      }
    };

    this.server = null;
    this.oauth2Server = null;
    this.sessionManager = null;
    this.emailService = null;

    // Resources
    this.oauth2KeysResource = null;
    this.oauth2ClientsResource = null;
    this.oauth2AuthCodesResource = null;
    this.sessionsResource = null;
    this.passwordResetTokensResource = null;
    this.usersResource = null;
  }

  /**
   * Validate plugin dependencies
   * @private
   */
  async _validateDependencies() {
    await requirePluginDependency('identity-plugin', {
      throwOnError: true,
      checkVersions: true
    });
  }

  /**
   * Install plugin
   */
  async onInstall() {
    if (this.config.verbose) {
      console.log('[Identity Plugin] Installing...');
    }

    // Validate dependencies
    try {
      await this._validateDependencies();
    } catch (err) {
      console.error('[Identity Plugin] Dependency validation failed:', err.message);
      throw err;
    }

    // Create OAuth2 resources
    await this._createOAuth2Resources();

    // Create users resource if not exists
    await this._ensureUsersResource();

    // Initialize OAuth2 Server
    await this._initializeOAuth2Server();

    // Initialize Session Manager
    await this._initializeSessionManager();

    // Initialize Email Service
    await this._initializeEmailService();

    if (this.config.verbose) {
      console.log('[Identity Plugin] Installed successfully');
    }
  }

  /**
   * Create OAuth2 resources for authorization server
   * @private
   */
  async _createOAuth2Resources() {
    // 1. OAuth Keys Resource (RSA keys for token signing)
    const [okKeys, errKeys, keysResource] = await tryFn(() =>
      this.database.createResource({
        name: 'plg_oauth_keys',
        attributes: {
          kid: 'string|required',
          publicKey: 'string|required',
          privateKey: 'secret|required',
          algorithm: 'string|default:RS256',
          use: 'string|default:sig',
          active: 'boolean|default:true',
          createdAt: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'IdentityPlugin'
      })
    );

    if (okKeys) {
      this.oauth2KeysResource = keysResource;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Created plg_oauth_keys resource');
      }
    } else if (this.database.resources.plg_oauth_keys) {
      this.oauth2KeysResource = this.database.resources.plg_oauth_keys;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Using existing plg_oauth_keys resource');
      }
    } else {
      throw errKeys;
    }

    // 2. OAuth Clients Resource (registered applications)
    const [okClients, errClients, clientsResource] = await tryFn(() =>
      this.database.createResource({
        name: 'plg_oauth_clients',
        attributes: {
          clientId: 'string|required',
          clientSecret: 'secret|required',
          name: 'string|required',
          redirectUris: 'array|items:string|required',
          allowedScopes: 'array|items:string|optional',
          grantTypes: 'array|items:string|default:["authorization_code","refresh_token"]',
          active: 'boolean|default:true',
          createdAt: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'IdentityPlugin'
      })
    );

    if (okClients) {
      this.oauth2ClientsResource = clientsResource;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Created plg_oauth_clients resource');
      }
    } else if (this.database.resources.plg_oauth_clients) {
      this.oauth2ClientsResource = this.database.resources.plg_oauth_clients;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Using existing plg_oauth_clients resource');
      }
    } else {
      throw errClients;
    }

    // 3. OAuth Authorization Codes Resource (authorization_code flow)
    const [okCodes, errCodes, codesResource] = await tryFn(() =>
      this.database.createResource({
        name: 'plg_auth_codes',
        attributes: {
          code: 'string|required',
          clientId: 'string|required',
          userId: 'string|required',
          redirectUri: 'string|required',
          scope: 'string|optional',
          expiresAt: 'string|required',
          used: 'boolean|default:false',
          codeChallenge: 'string|optional',          // PKCE support
          codeChallengeMethod: 'string|optional',    // PKCE support
          createdAt: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'IdentityPlugin'
      })
    );

    if (okCodes) {
      this.oauth2AuthCodesResource = codesResource;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Created plg_auth_codes resource');
      }
    } else if (this.database.resources.plg_auth_codes) {
      this.oauth2AuthCodesResource = this.database.resources.plg_auth_codes;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Using existing plg_auth_codes resource');
      }
    } else {
      throw errCodes;
    }

    // 4. Sessions Resource (user sessions for UI/admin)
    const [okSessions, errSessions, sessionsResource] = await tryFn(() =>
      this.database.createResource({
        name: 'plg_sessions',
        attributes: {
          userId: 'string|required',
          expiresAt: 'string|required',
          ipAddress: 'ip4|optional',
          userAgent: 'string|optional',
          metadata: 'object|optional',
          createdAt: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'IdentityPlugin'
      })
    );

    if (okSessions) {
      this.sessionsResource = sessionsResource;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Created plg_sessions resource');
      }
    } else if (this.database.resources.plg_sessions) {
      this.sessionsResource = this.database.resources.plg_sessions;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Using existing plg_sessions resource');
      }
    } else {
      throw errSessions;
    }

    // 5. Password Reset Tokens Resource (for password reset flow)
    const [okResetTokens, errResetTokens, resetTokensResource] = await tryFn(() =>
      this.database.createResource({
        name: 'plg_password_reset_tokens',
        attributes: {
          userId: 'string|required',
          token: 'string|required',
          expiresAt: 'string|required',
          used: 'boolean|default:false',
          createdAt: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'IdentityPlugin'
      })
    );

    if (okResetTokens) {
      this.passwordResetTokensResource = resetTokensResource;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Created plg_password_reset_tokens resource');
      }
    } else if (this.database.resources.plg_password_reset_tokens) {
      this.passwordResetTokensResource = this.database.resources.plg_password_reset_tokens;
      if (this.config.verbose) {
        console.log('[Identity Plugin] Using existing plg_password_reset_tokens resource');
      }
    } else {
      throw errResetTokens;
    }
  }

  /**
   * Ensure users resource exists (for authentication)
   * @private
   */
  async _ensureUsersResource() {
    const resourceName = this.config.userResource;

    // Check if resource already exists
    if (this.database.resources[resourceName]) {
      this.usersResource = this.database.resources[resourceName];
      if (this.config.verbose) {
        console.log(`[Identity Plugin] Using existing ${resourceName} resource`);
      }
      return;
    }

    // Create minimal users resource if not exists
    const [ok, err, resource] = await tryFn(() =>
      this.database.createResource({
        name: resourceName,
        attributes: {
          email: 'string|required|email',
          password: 'secret|required',
          name: 'string|optional',
          scopes: 'array|items:string|optional',
          active: 'boolean|default:true'
        },
        behavior: 'body-overflow',
        timestamps: true,
        createdBy: 'IdentityPlugin'
      })
    );

    if (ok) {
      this.usersResource = resource;
      if (this.config.verbose) {
        console.log(`[Identity Plugin] Created ${resourceName} resource`);
      }
    } else {
      throw err;
    }
  }

  /**
   * Initialize OAuth2 Server instance
   * @private
   */
  async _initializeOAuth2Server() {
    this.oauth2Server = new OAuth2Server({
      issuer: this.config.issuer,
      keyResource: this.oauth2KeysResource,
      userResource: this.usersResource,
      clientResource: this.oauth2ClientsResource,
      authCodeResource: this.oauth2AuthCodesResource,
      supportedScopes: this.config.supportedScopes,
      supportedGrantTypes: this.config.supportedGrantTypes,
      supportedResponseTypes: this.config.supportedResponseTypes,
      accessTokenExpiry: this.config.accessTokenExpiry,
      idTokenExpiry: this.config.idTokenExpiry,
      refreshTokenExpiry: this.config.refreshTokenExpiry,
      authCodeExpiry: this.config.authCodeExpiry
    });

    await this.oauth2Server.initialize();

    if (this.config.verbose) {
      console.log('[Identity Plugin] OAuth2 Server initialized');
      console.log(`[Identity Plugin] Issuer: ${this.config.issuer}`);
      console.log(`[Identity Plugin] Supported scopes: ${this.config.supportedScopes.join(', ')}`);
      console.log(`[Identity Plugin] Supported grant types: ${this.config.supportedGrantTypes.join(', ')}`);
    }
  }

  /**
   * Initialize Session Manager
   * @private
   */
  async _initializeSessionManager() {
    const { SessionManager } = await import('./session-manager.js');

    this.sessionManager = new SessionManager({
      sessionResource: this.sessionsResource,
      config: this.config.session
    });

    if (this.config.verbose) {
      console.log('[Identity Plugin] Session Manager initialized');
      console.log(`[Identity Plugin] Session expiry: ${this.config.session.sessionExpiry}`);
      console.log(`[Identity Plugin] Cookie name: ${this.config.session.cookieName}`);
    }
  }

  /**
   * Initialize email service
   * @private
   */
  async _initializeEmailService() {
    const { EmailService } = await import('./email-service.js');

    this.emailService = new EmailService({
      enabled: this.config.email.enabled,
      from: this.config.email.from,
      replyTo: this.config.email.replyTo,
      smtp: this.config.email.smtp,
      templates: this.config.email.templates,
      verbose: this.config.verbose
    });

    if (this.config.verbose) {
      console.log('[Identity Plugin] Email Service initialized');
      console.log(`[Identity Plugin] Email enabled: ${this.config.email.enabled}`);
      if (this.config.email.enabled) {
        console.log(`[Identity Plugin] SMTP host: ${this.config.email.smtp.host}:${this.config.email.smtp.port}`);
        console.log(`[Identity Plugin] From address: ${this.config.email.from}`);
      }
    }
  }

  /**
   * Start plugin
   */
  async onStart() {
    if (this.config.verbose) {
      console.log('[Identity Plugin] Starting server...');
    }

    // Dynamic import of server (will create in next step)
    const { IdentityServer } = await import('./server.js');

    // Create server instance
    this.server = new IdentityServer({
      port: this.config.port,
      host: this.config.host,
      verbose: this.config.verbose,
      issuer: this.config.issuer,
      oauth2Server: this.oauth2Server,
      sessionManager: this.sessionManager,
      usersResource: this.usersResource,
      identityPlugin: this,
      cors: this.config.cors,
      security: this.config.security,
      logging: this.config.logging
    });

    // Start server
    await this.server.start();

    this.emit('plugin.started', {
      port: this.config.port,
      host: this.config.host,
      issuer: this.config.issuer
    });
  }

  /**
   * Stop plugin
   */
  async onStop() {
    if (this.config.verbose) {
      console.log('[Identity Plugin] Stopping server...');
    }

    if (this.server) {
      await this.server.stop();
      this.server = null;
    }

    // Stop session cleanup timer
    if (this.sessionManager) {
      this.sessionManager.stopCleanup();
    }

    // Close email service connection
    if (this.emailService) {
      await this.emailService.close();
    }

    this.emit('plugin.stopped');
  }

  /**
   * Uninstall plugin
   */
  async onUninstall(options = {}) {
    const { purgeData = false } = options;

    // Stop server if running
    await this.onStop();

    // Optionally delete OAuth2 resources
    if (purgeData) {
      const resourcesToDelete = ['plg_oauth_keys', 'plg_oauth_clients', 'plg_auth_codes'];

      for (const resourceName of resourcesToDelete) {
        const [ok] = await tryFn(() => this.database.deleteResource(resourceName));
        if (ok && this.config.verbose) {
          console.log(`[Identity Plugin] Deleted ${resourceName} resource`);
        }
      }
    }

    if (this.config.verbose) {
      console.log('[Identity Plugin] Uninstalled successfully');
    }
  }

  /**
   * Get server information
   * @returns {Object} Server info
   */
  getServerInfo() {
    return this.server ? this.server.getInfo() : { isRunning: false };
  }

  /**
   * Get OAuth2 Server instance (for advanced usage)
   * @returns {OAuth2Server|null}
   */
  getOAuth2Server() {
    return this.oauth2Server;
  }
}
