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
import { RateLimiter } from './concerns/rate-limit.js';
import { resolveResourceNames } from '../concerns/resource-names.js';
import { prepareResourceConfigs } from './concerns/config.js';
import { PluginError } from '../../errors.js';
import {
  BASE_USER_ATTRIBUTES,
  BASE_TENANT_ATTRIBUTES,
  BASE_CLIENT_ATTRIBUTES,
  mergeResourceConfig
} from './concerns/resource-schemas.js';
import { verifyPassword } from './concerns/password.js';
import { createBuiltInAuthDrivers } from './drivers/index.js';
import { AuthDriver } from './drivers/auth-driver.interface.js';

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

    this._internalResourceOverrides = options.resourceNames || options.internalResources || {};
    this._internalResourceDescriptors = {
      oauthKeys: {
        defaultName: 'plg_identity_oauth_keys',
        override: this._internalResourceOverrides.oauthKeys
      },
      authCodes: {
        defaultName: 'plg_identity_auth_codes',
        override: this._internalResourceOverrides.authCodes
      },
      sessions: {
        defaultName: 'plg_identity_sessions',
        override: this._internalResourceOverrides.sessions
      },
      passwordResetTokens: {
        defaultName: 'plg_identity_password_reset_tokens',
        override: this._internalResourceOverrides.passwordResetTokens
      },
      mfaDevices: {
        defaultName: 'plg_identity_mfa_devices',
        override: this._internalResourceOverrides.mfaDevices
      }
    };
    this.internalResourceNames = this._resolveInternalResourceNames();

    const normalizedResources = prepareResourceConfigs(options.resources);

    this.config = {
      // Server configuration
      port: options.port || 4000,
      host: options.host || '0.0.0.0',
      logLevel: options.logLevel || 'info',

      // OAuth2/OIDC configuration
      issuer: options.issuer || `http://localhost:${options.port || 4000}`,
      supportedScopes: options.supportedScopes || ['openid', 'profile', 'email', 'offline_access'],
      supportedGrantTypes: options.supportedGrantTypes || ['authorization_code', 'refresh_token', 'client_credentials', 'password'],
      supportedResponseTypes: options.supportedResponseTypes || ['code', 'token', 'id_token'],

      // Token expiration
      accessTokenExpiry: options.accessTokenExpiry || '15m',
      idTokenExpiry: options.idTokenExpiry || '15m',
      refreshTokenExpiry: options.refreshTokenExpiry || '7d',
      authCodeExpiry: options.authCodeExpiry || '10m',

      // Resource configuration (REQUIRED)
      resources: normalizedResources,

      resourceNames: this.internalResourceNames,

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
        enabled: options.security?.enabled !== false,
        contentSecurityPolicy: {
          enabled: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
            'img-src': ["'self'", 'data:', 'https:'],
            'font-src': ["'self'", 'https://unpkg.com'],
            ...options.security?.contentSecurityPolicy?.directives
          },
          reportOnly: options.security?.contentSecurityPolicy?.reportOnly || false,
          reportUri: options.security?.contentSecurityPolicy?.reportUri || null
        }
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

      // Registration Configuration
      registration: {
        enabled: options.registration?.enabled !== false,  // Enabled by default
        requireEmailVerification: options.registration?.requireEmailVerification !== false,  // Required by default
        allowedDomains: options.registration?.allowedDomains || null,  // null = allow all domains
        blockedDomains: options.registration?.blockedDomains || [],    // Block specific domains
        customMessage: options.registration?.customMessage || null     // Custom message when disabled
      },

      // UI Configuration (white-label customization)
      ui: {
        // Branding
        title: options.ui?.title || 'S3DB Identity',
        companyName: options.ui?.companyName || 'S3DB',
        legalName: options.ui?.legalName || options.ui?.companyName || 'S3DB Corp',
        tagline: options.ui?.tagline || 'Secure Identity & Access Management',
        welcomeMessage: options.ui?.welcomeMessage || 'Welcome back!',
        logoUrl: options.ui?.logoUrl || null,
        logo: (() => {
          if (options.ui?.logo) {
            this.logger.warn(
              '[IdentityPlugin] DEPRECATED: The "logo" field is deprecated. ' +
              'Use "logoUrl" instead: { ui: { logoUrl: "..." } }. ' +
              'This will be removed in v17.0.'
            );
          }
          return options.ui?.logo || null;
        })(),
        favicon: options.ui?.favicon || null,

        // Colors (11 options)
        primaryColor: options.ui?.primaryColor || '#007bff',
        secondaryColor: options.ui?.secondaryColor || '#6c757d',
        successColor: options.ui?.successColor || '#28a745',
        dangerColor: options.ui?.dangerColor || '#dc3545',
        warningColor: options.ui?.warningColor || '#ffc107',
        infoColor: options.ui?.infoColor || '#17a2b8',
        textColor: options.ui?.textColor || '#212529',
        textMuted: options.ui?.textMuted || '#6c757d',
        backgroundColor: options.ui?.backgroundColor || '#ffffff',
        backgroundLight: options.ui?.backgroundLight || '#f8f9fa',
        borderColor: options.ui?.borderColor || '#dee2e6',

        // Typography
        fontFamily: options.ui?.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: options.ui?.fontSize || '16px',

        // Layout
        borderRadius: options.ui?.borderRadius || '0.375rem',
        boxShadow: options.ui?.boxShadow || '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)',

        // Company Info
        footerText: options.ui?.footerText || null,
        supportEmail: options.ui?.supportEmail || null,
        privacyUrl: options.ui?.privacyUrl || '/privacy',
        termsUrl: options.ui?.termsUrl || '/terms',

        // Social Links
        socialLinks: options.ui?.socialLinks || null,

        // Custom CSS
        customCSS: options.ui?.customCSS || null,

        // Custom Pages (override default pages)
        customPages: options.ui?.customPages || {},

        // Base URL
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

      // MFA Configuration (Multi-Factor Authentication)
      mfa: {
        enabled: options.mfa?.enabled || false,                              // Enable MFA/TOTP
        required: options.mfa?.required || false,                            // Require MFA for all users
        issuer: options.mfa?.issuer || options.ui?.title || 'S3DB Identity', // TOTP issuer name
        algorithm: options.mfa?.algorithm || 'SHA1',                         // SHA1, SHA256, SHA512
        digits: options.mfa?.digits || 6,                                    // 6 or 8 digits
        period: options.mfa?.period || 30,                                   // 30 seconds
        window: options.mfa?.window || 1,                                    // Time window tolerance
        backupCodesCount: options.mfa?.backupCodesCount || 10,               // Number of backup codes
        backupCodeLength: options.mfa?.backupCodeLength || 8                 // Backup code length
      },

      // Audit Configuration (Compliance & Security Logging)
      audit: {
        enabled: options.audit?.enabled !== false,                           // Enable audit logging
        includeData: options.audit?.includeData !== false,                   // Store before/after data
        includePartitions: options.audit?.includePartitions !== false,       // Track partition info
        maxDataSize: options.audit?.maxDataSize || 10000,                    // Max bytes for data field
        resources: options.audit?.resources || ['users', 'plg_oauth_clients'], // Resources to audit
        events: options.audit?.events || [                                   // Custom events to audit
          'login', 'logout', 'login_failed',
          'account_locked', 'account_unlocked',
          'ip_banned', 'ip_unbanned',
          'password_reset_requested', 'password_changed',
          'email_verified', 'user_created', 'user_deleted',
          'mfa_enrolled', 'mfa_disabled', 'mfa_verified', 'mfa_failed'
        ]
      },

      // Account Lockout Configuration (Per-User Brute Force Protection)
      accountLockout: {
        enabled: options.accountLockout?.enabled !== false,                  // Enable account lockout
        maxAttempts: options.accountLockout?.maxAttempts || 5,               // Max failed attempts before lockout
        lockoutDuration: options.accountLockout?.lockoutDuration || 900000,  // Lockout duration (15 min)
        resetOnSuccess: options.accountLockout?.resetOnSuccess !== false     // Reset counter on successful login
      },

      // Failban Configuration (IP-Based Brute Force Protection)
      failban: {
        enabled: options.failban?.enabled !== false,                         // Enable failban protection
        maxViolations: options.failban?.maxViolations || 5,                  // Max failed attempts before ban
        violationWindow: options.failban?.violationWindow || 300000,         // Time window for violations (5 min)
        banDuration: options.failban?.banDuration || 900000,                 // Ban duration (15 min)
        whitelist: options.failban?.whitelist || ['127.0.0.1', '::1'],      // IPs to never ban
        blacklist: options.failban?.blacklist || [],                         // IPs to always ban
        persistViolations: options.failban?.persistViolations !== false,     // Persist violations to DB
        endpoints: {
          login: options.failban?.endpoints?.login !== false,                // Protect /oauth/authorize POST
          token: options.failban?.endpoints?.token !== false,                // Protect /oauth/token
          register: options.failban?.endpoints?.register !== false           // Protect /register
        },
        geo: {
          enabled: options.failban?.geo?.enabled || false,                   // Enable GeoIP blocking
          databasePath: options.failban?.geo?.databasePath || null,          // Path to GeoLite2-Country.mmdb
          allowedCountries: options.failban?.geo?.allowedCountries || [],    // Whitelist countries (ISO codes)
          blockedCountries: options.failban?.geo?.blockedCountries || [],    // Blacklist countries (ISO codes)
          blockUnknown: options.failban?.geo?.blockUnknown || false          // Block IPs with unknown country
        }
      },

      // Rate Limiting Configuration
      rateLimit: {
        enabled: options.rateLimit?.enabled !== false,
        login: {
          windowMs: options.rateLimit?.login?.windowMs || 60000,
          max: options.rateLimit?.login?.max ?? 10
        },
        token: {
          windowMs: options.rateLimit?.token?.windowMs || 60000,
          max: options.rateLimit?.token?.max ?? 60
        },
        authorize: {
          windowMs: options.rateLimit?.authorize?.windowMs || 60000,
          max: options.rateLimit?.authorize?.max ?? 30
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
      },

      authDrivers: options.authDrivers || {}
    };

    this.server = null;
    this.oauth2Server = null;
    this.sessionManager = null;
    this.emailService = null;
    this.failbanManager = null;
    this.auditPlugin = null;
    this.mfaManager = null;

    // Internal plugin resources (prefixed with plg_)
    this.oauth2KeysResource = null;
    this.oauth2AuthCodesResource = null;
    this.sessionsResource = null;
    this.passwordResetTokensResource = null;
    this.mfaDevicesResource = null;

    // User-managed resources (user chooses names)
    this.usersResource = null;
    this.tenantsResource = null;
    this.clientsResource = null;

    // Rate limiters
    this.rateLimiters = this._createRateLimiters();
    this.authDrivers = new Map();
    this.authDriverInstances = [];
  }

  _resolveInternalResourceNames() {
    return resolveResourceNames('identity', this._internalResourceDescriptors, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    this.internalResourceNames = this._resolveInternalResourceNames();
    if (this.config) {
      this.config.resourceNames = this.internalResourceNames;
    }
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
   * Initialize rate limiters for sensitive endpoints
   * @private
   * @returns {Object<string, RateLimiter>}
   */
  _createRateLimiters() {
    if (!this.config.rateLimit.enabled) {
      return {};
    }

    const limiters = {};
    const { login, token, authorize } = this.config.rateLimit;

    if (login?.max > 0 && login?.windowMs > 0) {
      limiters.login = new RateLimiter(login);
    }

    if (token?.max > 0 && token?.windowMs > 0) {
      limiters.token = new RateLimiter(token);
    }

    if (authorize?.max > 0 && authorize?.windowMs > 0) {
      limiters.authorize = new RateLimiter(authorize);
    }

    return limiters;
  }

  /**
   * Install plugin
   */
  async onInstall() {
    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Installing...');
    }

    // Validate dependencies
    try {
      await this._validateDependencies();
    } catch (err) {
      this.logger.error('[Identity Plugin] Dependency validation failed:', err.message);
      throw err;
    }

    // Create user-managed resources (users, tenants, clients) with merged attributes
    await this._createUserManagedResources();

    // Create OAuth2 internal resources (keys, auth_codes, sessions, etc.)
    await this._createOAuth2Resources();

    // Initialize OAuth2 Server
    await this._initializeOAuth2Server();

    // Initialize Session Manager
    await this._initializeSessionManager();

    // Initialize Email Service
    await this._initializeEmailService();

    // Initialize Failban Manager
    await this._initializeFailbanManager();

    // Initialize Audit Plugin
    await this._initializeAuditPlugin();

    // Initialize MFA Manager
    await this._initializeMFAManager();

    // Initialize authentication drivers
    await this._initializeAuthDrivers();

    // Expose integration metadata in plugin registry for downstream consumers
    this._exposeIntegrationMetadata();

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Installed successfully');
    }
  }

  /**
   * Expose integration metadata in plugin registry
   * Allows other plugins (e.g., ApiPlugin) to discover Identity and auto-configure
   * @private
   */
  _exposeIntegrationMetadata() {
    // Ensure the plugin is registered in the database plugin registry
    if (!this.database.pluginRegistry) {
      this.database.pluginRegistry = {};
    }

    // Register under 'identity' key for easy discovery
    if (!this.database.pluginRegistry.identity) {
      this.database.pluginRegistry.identity = this;
    }

    // Expose integration metadata as a property
    Object.defineProperty(this, 'integration', {
      get: () => this.getIntegrationMetadata(),
      enumerable: true,
      configurable: false
    });

    // Also expose resource references for direct access
    Object.defineProperty(this, 'resources', {
      get: () => ({
        users: this.usersResource,
        tenants: this.tenantsResource,
        clients: this.clientsResource
      }),
      enumerable: true,
      configurable: false
    });
  }

  /**
   * Create OAuth2 resources for authorization server
   * @private
   */
  async _createOAuth2Resources() {
    const names = this.internalResourceNames;

    // 1. OAuth Keys Resource (RSA keys for token signing)
    const [okKeys, errKeys, keysResource] = await tryFn(() =>
      this.database.createResource({
        name: names.oauthKeys,
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
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Created ${names.oauthKeys} resource`);
      }
    } else if (this.database.resources[names.oauthKeys]) {
      this.oauth2KeysResource = this.database.resources[names.oauthKeys];
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Using existing ${names.oauthKeys} resource`);
      }
    } else {
      throw errKeys;
    }

    // 2. OAuth Authorization Codes Resource (authorization_code flow)
    const [okCodes, errCodes, codesResource] = await tryFn(() =>
      this.database.createResource({
        name: names.authCodes,
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
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Created ${names.authCodes} resource`);
      }
    } else if (this.database.resources[names.authCodes]) {
      this.oauth2AuthCodesResource = this.database.resources[names.authCodes];
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Using existing ${names.authCodes} resource`);
      }
    } else {
      throw errCodes;
    }

    // 3. Sessions Resource (user sessions for UI/admin)
    const [okSessions, errSessions, sessionsResource] = await tryFn(() =>
      this.database.createResource({
        name: names.sessions,
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
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Created ${names.sessions} resource`);
      }
    } else if (this.database.resources[names.sessions]) {
      this.sessionsResource = this.database.resources[names.sessions];
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Using existing ${names.sessions} resource`);
      }
    } else {
      throw errSessions;
    }

    // 4. Password Reset Tokens Resource (for password reset flow)
    const [okResetTokens, errResetTokens, resetTokensResource] = await tryFn(() =>
      this.database.createResource({
        name: names.passwordResetTokens,
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
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Created ${names.passwordResetTokens} resource`);
      }
    } else if (this.database.resources[names.passwordResetTokens]) {
      this.passwordResetTokensResource = this.database.resources[names.passwordResetTokens];
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Using existing ${names.passwordResetTokens} resource`);
      }
    } else {
      throw errResetTokens;
    }

    // 5. MFA Devices Resource (for multi-factor authentication)
    if (this.config.mfa.enabled) {
      const [okMFA, errMFA, mfaResource] = await tryFn(() =>
        this.database.createResource({
          name: names.mfaDevices,
          attributes: {
            userId: 'string|required',
            type: 'string|required',              // 'totp', 'sms', 'email'
            secret: 'secret|required',            // TOTP secret (encrypted by S3DB)
            verified: 'boolean|default:false',
            backupCodes: 'array|items:string',    // Hashed backup codes
            enrolledAt: 'string',
            lastUsedAt: 'string|optional',
            deviceName: 'string|optional',        // User-friendly name
            metadata: 'object|optional'
          },
          behavior: 'body-overflow',
          timestamps: true,
          partitions: {
            byUser: {
              fields: { userId: 'string' }
            }
          },
          createdBy: 'IdentityPlugin'
        })
      );

      if (okMFA) {
        this.mfaDevicesResource = mfaResource;
        if (this.config.logLevel) {
          this.logger.info(`[Identity Plugin] Created ${names.mfaDevices} resource`);
        }
      } else if (this.database.resources[names.mfaDevices]) {
        this.mfaDevicesResource = this.database.resources[names.mfaDevices];
        if (this.config.logLevel) {
          this.logger.info(`[Identity Plugin] Using existing ${names.mfaDevices} resource`);
        }
      } else {
        this.logger.warn(`[Identity Plugin] MFA enabled but failed to create ${names.mfaDevices} resource:`, errMFA?.message);
      }
    }
  }

  /**
   * Create user-managed resources (users, tenants, clients) with merged config
   * @private
   */
  async _createUserManagedResources() {
    // 1. Create Users Resource
    const usersConfig = this.config.resources.users;

    // Base config for users
    const usersBaseConfig = {
      attributes: BASE_USER_ATTRIBUTES,
      behavior: 'body-overflow',
      timestamps: true
    };

    // Deep merge user config with base config
    const usersMergedConfig = mergeResourceConfig(
      usersBaseConfig,
      usersConfig.userConfig,
      'users'
    );

    // Store merged config for reference
    usersConfig.mergedConfig = usersMergedConfig;

    const [okUsers, errUsers, usersResource] = await tryFn(() =>
      this.database.createResource(usersMergedConfig)
    );

    if (okUsers) {
      this.usersResource = usersResource;
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Created ${usersMergedConfig.name} resource with merged config`);
      }
    } else if (this.database.resources[usersMergedConfig.name]) {
      this.usersResource = this.database.resources[usersMergedConfig.name];
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Using existing ${usersMergedConfig.name} resource`);
      }
    } else {
      throw errUsers;
    }

    // 2. Create Tenants Resource (multi-tenancy support)
    const tenantsConfig = this.config.resources.tenants;

    const tenantsBaseConfig = {
      attributes: BASE_TENANT_ATTRIBUTES,
      behavior: 'body-overflow',
      timestamps: true
    };

    const tenantsMergedConfig = mergeResourceConfig(
      tenantsBaseConfig,
      tenantsConfig.userConfig,
      'tenants'
    );

    tenantsConfig.mergedConfig = tenantsMergedConfig;

    const [okTenants, errTenants, tenantsResource] = await tryFn(() =>
      this.database.createResource(tenantsMergedConfig)
    );

    if (okTenants) {
      this.tenantsResource = tenantsResource;
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Created ${tenantsMergedConfig.name} resource with merged config`);
      }
    } else if (this.database.resources[tenantsMergedConfig.name]) {
      this.tenantsResource = this.database.resources[tenantsMergedConfig.name];
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Using existing ${tenantsMergedConfig.name} resource`);
      }
    } else {
      throw errTenants;
    }

    // 3. Create OAuth2 Clients Resource
    const clientsConfig = this.config.resources.clients;

    const clientsBaseConfig = {
      attributes: BASE_CLIENT_ATTRIBUTES,
      behavior: 'body-overflow',
      timestamps: true
    };

    const clientsMergedConfig = mergeResourceConfig(
      clientsBaseConfig,
      clientsConfig.userConfig,
      'clients'
    );

    clientsConfig.mergedConfig = clientsMergedConfig;

    const [okClients, errClients, clientsResource] = await tryFn(() =>
      this.database.createResource(clientsMergedConfig)
    );

    if (okClients) {
      this.clientsResource = clientsResource;
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Created ${clientsMergedConfig.name} resource with merged config`);
      }
    } else if (this.database.resources[clientsMergedConfig.name]) {
      this.clientsResource = this.database.resources[clientsMergedConfig.name];
      if (this.config.logLevel) {
        this.logger.info(`[Identity Plugin] Using existing ${clientsMergedConfig.name} resource`);
      }
    } else {
      throw errClients;
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
      clientResource: this.clientsResource,
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
    this.oauth2Server.setIdentityPlugin(this);

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] OAuth2 Server initialized');
      this.logger.info(`[Identity Plugin] Issuer: ${this.config.issuer}`);
      this.logger.info(`[Identity Plugin] Supported scopes: ${this.config.supportedScopes.join(', ')}`);
      this.logger.info(`[Identity Plugin] Supported grant types: ${this.config.supportedGrantTypes.join(', ')}`);
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

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Session Manager initialized');
      this.logger.info(`[Identity Plugin] Session expiry: ${this.config.session.sessionExpiry}`);
      this.logger.info(`[Identity Plugin] Cookie name: ${this.config.session.cookieName}`);
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
      logLevel: this.config.logLevel
    });

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Email Service initialized');
      this.logger.info(`[Identity Plugin] Email enabled: ${this.config.email.enabled}`);
      if (this.config.email.enabled) {
        this.logger.info(`[Identity Plugin] SMTP host: ${this.config.email.smtp.host}:${this.config.email.smtp.port}`);
        this.logger.info(`[Identity Plugin] From address: ${this.config.email.from}`);
      }
    }
  }

  /**
   * Initialize failban manager
   * @private
   */
  async _initializeFailbanManager() {
    if (!this.config.failban.enabled) {
      if (this.config.logLevel) {
        this.logger.info('[Identity Plugin] Failban disabled');
      }
      return;
    }

    const { FailbanManager } = await import('../api/concerns/failban-manager.js');

    this.failbanManager = new FailbanManager({
      database: this.database,
      enabled: this.config.failban.enabled,
      maxViolations: this.config.failban.maxViolations,
      violationWindow: this.config.failban.violationWindow,
      banDuration: this.config.failban.banDuration,
      whitelist: this.config.failban.whitelist,
      blacklist: this.config.failban.blacklist,
      persistViolations: this.config.failban.persistViolations,
      logLevel: this.config.logLevel,
      geo: this.config.failban.geo
    });

    await this.failbanManager.initialize();

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Failban Manager initialized');
      this.logger.info(`[Identity Plugin] Max violations: ${this.config.failban.maxViolations}`);
      this.logger.info(`[Identity Plugin] Violation window: ${this.config.failban.violationWindow}ms`);
      this.logger.info(`[Identity Plugin] Ban duration: ${this.config.failban.banDuration}ms`);
      this.logger.info(`[Identity Plugin] Protected endpoints: login=${this.config.failban.endpoints.login}, token=${this.config.failban.endpoints.token}, register=${this.config.failban.endpoints.register}`);
      if (this.config.failban.geo.enabled) {
        this.logger.info(`[Identity Plugin] GeoIP enabled`);
        this.logger.info(`[Identity Plugin] Allowed countries: ${this.config.failban.geo.allowedCountries.join(', ') || 'all'}`);
        this.logger.info(`[Identity Plugin] Blocked countries: ${this.config.failban.geo.blockedCountries.join(', ') || 'none'}`);
      }
    }
  }

  /**
   * Initialize audit plugin
   * @private
   */
  async _initializeAuditPlugin() {
    if (!this.config.audit.enabled) {
      if (this.config.logLevel) {
        this.logger.info('[Identity Plugin] Audit logging disabled');
      }
      return;
    }

    const { AuditPlugin } = await import('../audit.plugin.js');

    this.auditPlugin = new AuditPlugin({
      includeData: this.config.audit.includeData,
      includePartitions: this.config.audit.includePartitions,
      maxDataSize: this.config.audit.maxDataSize,
      resources: this.config.audit.resources
    });

    await this.database.usePlugin(this.auditPlugin);

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Audit Plugin initialized');
      this.logger.info(`[Identity Plugin] Auditing resources: ${this.config.audit.resources.join(', ')}`);
      this.logger.info(`[Identity Plugin] Include data: ${this.config.audit.includeData}`);
      this.logger.info(`[Identity Plugin] Max data size: ${this.config.audit.maxDataSize} bytes`);
    }
  }

  /**
   * Log custom audit event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @private
   */
  async _logAuditEvent(event, data = {}) {
    if (!this.config.audit.enabled || !this.auditPlugin) {
      return;
    }

    if (!this.config.audit.events.includes(event)) {
      return;
    }

    try {
      await this.auditPlugin.logCustomEvent(event, data);

      if (this.config.logLevel) {
        this.logger.info(`[Audit] ${event}:`, JSON.stringify(data));
      }
    } catch (error) {
      this.logger.error(`[Audit] Failed to log event ${event}:`, error.message);
    }
  }

  /**
   * Initialize MFA Manager (Multi-Factor Authentication)
   * @private
   */
  async _initializeMFAManager() {
    if (!this.config.mfa.enabled) {
      if (this.config.logLevel) {
        this.logger.info('[Identity Plugin] MFA disabled');
      }
      return;
    }

    const { MFAManager } = await import('./concerns/mfa-manager.js');

    this.mfaManager = new MFAManager({
      issuer: this.config.mfa.issuer,
      algorithm: this.config.mfa.algorithm,
      digits: this.config.mfa.digits,
      period: this.config.mfa.period,
      window: this.config.mfa.window,
      backupCodesCount: this.config.mfa.backupCodesCount,
      backupCodeLength: this.config.mfa.backupCodeLength
    });

    await this.mfaManager.initialize();

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] MFA Manager initialized');
      this.logger.info(`[Identity Plugin] Issuer: ${this.config.mfa.issuer}`);
      this.logger.info(`[Identity Plugin] Algorithm: ${this.config.mfa.algorithm}`);
      this.logger.info(`[Identity Plugin] Digits: ${this.config.mfa.digits}`);
      this.logger.info(`[Identity Plugin] Period: ${this.config.mfa.period}s`);
      this.logger.info(`[Identity Plugin] Required: ${this.config.mfa.required}`);
    }
  }

  async _initializeAuthDrivers() {
    const driverConfig = this.config.authDrivers;

    if (driverConfig === false) {
      this.authDrivers = new Map();
      this.authDriverInstances = [];
      return;
    }
    const disableBuiltIns = this._isPlainObject(driverConfig) && driverConfig.disableBuiltIns === true;

    const context = {
      database: this.database,
      config: this.config,
      resources: {
        users: this.usersResource,
        tenants: this.tenantsResource,
        clients: this.clientsResource
      },
      helpers: {
        password: {
          verify: verifyPassword
        }
      }
    };

    const drivers = [];

    if (!disableBuiltIns) {
      const builtInOptions = this._extractBuiltInDriverOptions(driverConfig);
      drivers.push(...createBuiltInAuthDrivers(builtInOptions));
    }

    drivers.push(...this._collectCustomAuthDrivers(driverConfig));

    if (!drivers.length) {
      this.authDrivers = new Map();
      this.authDriverInstances = [];
      return;
    }

    this.authDrivers = new Map();
    this.authDriverInstances = [];

    for (const driver of drivers) {
      if (!driver || typeof driver.initialize !== 'function') {
        throw new PluginError('Auth drivers must implement initialize(context)', {
          pluginName: 'IdentityPlugin',
          operation: 'initializeAuthDrivers',
          statusCode: 500,
          retriable: false,
          suggestion: 'Ensure custom auth drivers extend AuthDriver and implement initialize(context).'
        });
      }

      try {
        await driver.initialize(context);
      } catch (error) {
        const driverName = driver.name || driver.constructor?.name || 'UnknownDriver';
        throw new PluginError(`Failed to initialize auth driver "${driverName}": ${error.message}`, {
          pluginName: 'IdentityPlugin',
          operation: 'initializeAuthDrivers',
          statusCode: 500,
          retriable: false,
          suggestion: 'Review driver configuration and ensure required dependencies are available.',
          original: error,
          metadata: { driverName }
        });
      }

      const supportedTypes = Array.isArray(driver.supportedTypes) && driver.supportedTypes.length > 0
        ? driver.supportedTypes
        : driver.name
          ? [driver.name]
          : [];

      if (!supportedTypes.length) {
        const driverName = driver.constructor?.name || 'AuthDriver';
        throw new PluginError(`Auth driver "${driverName}" must declare supportedTypes or name`, {
          pluginName: 'IdentityPlugin',
          operation: 'registerAuthDriver',
          statusCode: 500,
          retriable: false,
          suggestion: 'Set driver.supportedTypes = ["password"] or provide a name property to map grants.',
          metadata: { driverName }
        });
      }

      for (const type of supportedTypes) {
        if (!type) continue;
        if (this.authDrivers.has(type)) {
          const existingDriver = this.authDrivers.get(type);
          const existingName = existingDriver?.name || existingDriver?.constructor?.name || 'AuthDriver';
          const newName = driver.name || driver.constructor?.name || 'AuthDriver';
          throw new PluginError(`Duplicate auth driver registration for type "${type}"`, {
            pluginName: 'IdentityPlugin',
            operation: 'registerAuthDriver',
            statusCode: 409,
            retriable: false,
            suggestion: 'Remove duplicate registrations or use distinct driver types for each grant.',
            metadata: { type, existingDriver: existingName, newDriver: newName }
          });
        }
        this.authDrivers.set(type, driver);
      }

      this.authDriverInstances.push(driver);
    }
  }

  getAuthDriver(type) {
    return this.authDrivers.get(type);
  }

  _sanitizeAuthSubject(subject) {
    if (!subject || typeof subject !== 'object') {
      return subject;
    }

    const sensitiveFields = [
      'password',
      'passwordHash',
      'password_hash',
      'salt',
      'secret',
      'secrets',
      'clientSecret',
      'mfaSecret',
      'totpSecret',
      'backupCodes'
    ];

    const sanitized = { ...subject };
    for (const field of sensitiveFields) {
      if (sanitized[field] !== undefined) {
        delete sanitized[field];
      }
    }

    return sanitized;
  }

  async authenticateWithPassword({ email, password, user }) {
    const driver = this.getAuthDriver('password');
    if (!driver) {
      return {
        success: false,
        error: 'password_driver_not_configured',
        statusCode: 500
      };
    }

    const result = await driver.authenticate({
      type: 'password',
      email,
      password,
      user
    });

    if (result?.success && result.user) {
      return {
        ...result,
        user: this._sanitizeAuthSubject(result.user)
      };
    }

    return result;
  }

  _collectCustomAuthDrivers(config) {
    const candidates = [];

    const addCandidate = (candidate) => {
      if (!candidate) return;

      if (Array.isArray(candidate)) {
        if (candidate.length > 0 && typeof candidate[0] === 'function') {
          const [Ctor, options] = candidate;
          const instance = new Ctor(options);
          if (!(instance instanceof AuthDriver)) {
            throw new PluginError('Custom auth driver constructors must extend AuthDriver', {
              pluginName: 'IdentityPlugin',
              operation: 'collectCustomAuthDrivers',
              statusCode: 500,
              retriable: false,
              suggestion: 'Extend AuthDriver to ensure consistent interface for initialize/authenticate.'
            });
          }
          candidates.push(instance);
          return;
        }
        for (const item of candidate) {
          addCandidate(item);
        }
        return;
      }

      if (candidate instanceof AuthDriver) {
        candidates.push(candidate);
        return;
      }

      if (typeof candidate === 'function') {
        const instance = new candidate();
        if (!(instance instanceof AuthDriver)) {
          throw new PluginError('Custom auth driver constructors must extend AuthDriver', {
            pluginName: 'IdentityPlugin',
            operation: 'collectCustomAuthDrivers',
            statusCode: 500,
            retriable: false,
            suggestion: 'Update the constructor to extend AuthDriver before registering it.'
          });
        }
        candidates.push(instance);
        return;
      }

      if (candidate && typeof candidate === 'object' &&
        typeof candidate.initialize === 'function' &&
        typeof candidate.authenticate === 'function'
      ) {
        candidates.push(candidate);
        return;
      }

      throw new PluginError('Invalid auth driver provided. Drivers must extend AuthDriver.', {
        pluginName: 'IdentityPlugin',
        operation: 'collectCustomAuthDrivers',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide an AuthDriver instance, subclass, or plain object with initialize/authenticate methods.'
      });
    };

    if (Array.isArray(config)) {
      addCandidate(config);
      return candidates;
    }

    if (this._isPlainObject(config)) {
      addCandidate(config.drivers);
      addCandidate(config.custom);
      addCandidate(config.customDrivers);
    }

    return candidates;
  }

  _extractBuiltInDriverOptions(config) {
    if (!this._isPlainObject(config)) {
      return {};
    }

    if (this._isPlainObject(config.builtIns)) {
      return config.builtIns;
    }

    const {
      drivers,
      custom,
      customDrivers,
      disableBuiltIns,
      ...builtInOptions
    } = config;

    return builtInOptions;
  }

  _isPlainObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Start plugin
   */
  async onStart() {
    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Starting server...');
    }

    // Dynamic import of server (will create in next step)
    const { IdentityServer } = await import('./server.js');

    // Create server instance
    this.server = new IdentityServer({
      port: this.config.port,
      host: this.config.host,
      logLevel: this.config.logLevel,
      issuer: this.config.issuer,
      oauth2Server: this.oauth2Server,
      sessionManager: this.sessionManager,
      usersResource: this.usersResource,
      identityPlugin: this,
      failbanManager: this.failbanManager,
      failbanConfig: this.config.failban,
      accountLockoutConfig: this.config.accountLockout,
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
    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Stopping server...');
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

    // Cleanup failban manager
    if (this.failbanManager) {
      await this.failbanManager.cleanup();
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
      const resourcesToDelete = new Set([
        this.internalResourceNames.oauthKeys,
        this.internalResourceNames.authCodes,
        this.internalResourceNames.sessions,
        this.internalResourceNames.passwordResetTokens,
        this.internalResourceNames.mfaDevices,
        'plg_oauth_clients'
      ]);

      for (const resourceName of resourcesToDelete) {
        const [ok] = await tryFn(() => this.database.deleteResource(resourceName));
        if (ok && this.config.logLevel) {
          this.logger.info(`[Identity Plugin] Deleted ${resourceName} resource`);
        }
      }
    }

    if (this.config.logLevel) {
      this.logger.info('[Identity Plugin] Uninstalled successfully');
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

  /**
   * Get integration metadata for downstream consumers (e.g., ApiPlugin)
   * Returns issuer URLs, endpoints, supported features, and resource names
   * @returns {Object} Integration metadata descriptor
   */
  getIntegrationMetadata() {
    const baseUrl = this.config.issuer;

    return {
      version: 1,
      issuedAt: new Date().toISOString(),
      cacheTtl: 3600, // 1 hour in seconds

      // Authentication endpoints
      issuer: baseUrl,
      discoveryUrl: `${baseUrl}/.well-known/openid-configuration`,
      jwksUrl: `${baseUrl}/.well-known/jwks.json`,
      authorizationUrl: `${baseUrl}/oauth/authorize`,
      tokenUrl: `${baseUrl}/oauth/token`,
      userinfoUrl: `${baseUrl}/oauth/userinfo`,
      introspectionUrl: `${baseUrl}/oauth/introspect`,
      revocationUrl: `${baseUrl}/oauth/revoke`,

      // OAuth capabilities
      supportedScopes: this.config.supportedScopes,
      supportedGrantTypes: this.config.supportedGrantTypes,
      supportedResponseTypes: this.config.supportedResponseTypes,

      // Resource mappings (canonical resource names)
      resources: {
        users: this.usersResource?.name || this.config.resources.users.name,
        tenants: this.tenantsResource?.name || this.config.resources.tenants.name,
        clients: this.clientsResource?.name || this.config.resources.clients.name
      },

      // Integration features
      clientRegistration: {
        url: `${baseUrl}/oauth/register`,
        supportedAuth: ['client_secret_post', 'client_secret_basic']
      }
    };
  }
}
