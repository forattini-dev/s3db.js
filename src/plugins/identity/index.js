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
      }
    };

    this.server = null;
    this.oauth2Server = null;

    // Resources
    this.oauth2KeysResource = null;
    this.oauth2ClientsResource = null;
    this.oauth2AuthCodesResource = null;
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
          id: 'string|required',
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
          id: 'string|required',
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
          id: 'string|required',
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
          id: 'string|required',
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
