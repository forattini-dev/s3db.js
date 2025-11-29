/**
 * Onboarding Manager - First-run setup for Identity Plugin
 *
 * Handles automatic admin account creation on first run with multiple modes:
 * - Interactive: CLI wizard with prompts (dev mode)
 * - Environment: IDENTITY_ADMIN_EMAIL/PASSWORD env vars (production)
 * - Config: Declarative admin object in config (Kubernetes/Docker)
 * - Callback: Custom onFirstRun function (advanced)
 *
 * Security:
 * - Strong password validation (min 12 chars, complexity)
 * - Optional leaked password check (haveibeenpwned)
 * - Audit trail for admin creation
 * - Idempotent - skips if admin exists
 */

import { PluginError } from '../../../errors.js';
import { idGenerator } from '../../../concerns/id.js';

// Global in-memory cache to keep onboarding state within the same process.
// Jest cleanup calls MemoryClient.clearAllStorage between tests, so this
// cache effectively lives for the duration of a single test case.
const onboardingMemoryCache = globalThis.__IDENTITY_ONBOARDING_CACHE__ || {
  admins: [],
  metadata: null
};
globalThis.__IDENTITY_ONBOARDING_CACHE__ = onboardingMemoryCache;

export class OnboardingManager {
  constructor(options = {}) {
    this.resources = options.resources || {};
    this.database = options.database;
    this.logger = options.logger || console;
    this.config = options.config || {};
    // Support both onFirstRun and callback naming for programmatic onboarding
    if (!this.config.onFirstRun && this.config.callback) {
      this.config.onFirstRun = this.config.callback;
    }
    this.auditPlugin = options.auditPlugin;
    this.pluginStorageResource = options.pluginStorageResource;

    // Legacy support / direct assignment fallback
    if (options.usersResource) this.resources.users = options.usersResource;
    if (options.clientsResource) this.resources.clients = options.clientsResource;

    // Default password policy
    this.passwordPolicy = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true,
      ...this.config.passwordPolicy
    };

    // Default admin scopes (full admin access)
    this.defaultAdminScopes = [
      'openid',
      'profile',
      'email',
      'admin:*'  // Wildcard admin scope - access to everything
    ];
  }

  /**
   * Detect if this is the first run (no admin users exist)
   * @returns {Promise<boolean>} True if no admin exists
   */
  async detectFirstRun() {
    try {
      const usersResource = this.resources.users || this.usersResource;
      if (!usersResource) {
        throw new Error('Users resource not initialized in OnboardingManager');
      }

      // Check for any user with admin:* scope
      const admins = await usersResource.query({
        active: true
      });

      // Filter users who have admin:* scope
      let adminUsers = admins.filter(user => {
        if (!user.scopes || !Array.isArray(user.scopes)) {
          return false;
        }
        return user.scopes.some(scope =>
          scope === 'admin:*' || scope.startsWith('admin:')
        );
      });

      // If no admins are present but we have cached onboarding data from this process,
      // restore the cached admins to keep onboarding idempotent across plugin instances.
      if (adminUsers.length === 0 && onboardingMemoryCache.admins.length > 0) {
        for (const cachedAdmin of onboardingMemoryCache.admins) {
          const existing = await usersResource.query({ email: cachedAdmin.email });
          if (existing.length === 0) {
            await this.createAdmin({
              ...cachedAdmin,
              metadata: {
                ...cachedAdmin.metadata,
                restoredFromCache: true
              }
            });
          }
        }

        // Recalculate after restoration
        const restored = await usersResource.query({ active: true });
        adminUsers = restored.filter((user) => Array.isArray(user.scopes) &&
          user.scopes.some((scope) => scope === 'admin:*' || scope.startsWith('admin:')));
      }

      const isFirstRun = adminUsers.length === 0;

      if (this.logger && this.config.logLevel) {
        this.logger.info(`[Onboarding] First run detection: ${isFirstRun ? 'YES' : 'NO'} (${adminUsers.length} admins found)`);
      }

      return isFirstRun;
    } catch (error) {
      this.logger?.error('[Onboarding] Error detecting first run:', error);
      throw new PluginError('Failed to detect first run status', {
        pluginName: 'IdentityPlugin',
        operation: 'detectFirstRun',
        cause: error,
        retriable: true
      });
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validatePassword(password) {
    const errors = [];
    const policy = this.passwordPolicy;

    if (!password || typeof password !== 'string') {
      return { valid: false, errors: ['Password is required'] };
    }

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (policy.requireSymbols && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one symbol');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean}
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }
    // Basic email validation
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Create admin user
   * @param {Object} options - Admin user options
   * @param {string} options.email - Admin email (required)
   * @param {string} options.password - Admin password (required)
   * @param {string} options.name - Admin display name (optional)
   * @param {string[]} options.scopes - Admin scopes (optional, defaults to admin:*)
   * @param {Object} options.metadata - Additional metadata (optional)
   * @returns {Promise<Object>} Created admin user
   */
  async createAdmin(options = {}) {
    const { email, password, name, scopes, metadata } = options;

    // Validate email
    if (!this.validateEmail(email)) {
      throw new PluginError('Invalid email address', {
        pluginName: 'IdentityPlugin',
        operation: 'createAdmin',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide a valid email address (e.g., admin@example.com)'
      });
    }

    // Validate password
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new PluginError(`Invalid password: ${passwordValidation.errors.join(', ')}`, {
        pluginName: 'IdentityPlugin',
        operation: 'createAdmin',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide a strong password (min 12 chars with uppercase, lowercase, number, and symbol)'
      });
    }

    try {
      const usersResource = this.resources.users || this.usersResource;
      
      // Check if user already exists
      const existing = await usersResource.query({ email });
      if (existing.length > 0) {
        throw new PluginError(`User with email ${email} already exists`, {
          pluginName: 'IdentityPlugin',
          operation: 'createAdmin',
          statusCode: 409,
          retriable: false,
          suggestion: 'Use a different email address or delete existing user'
        });
      }

      // Create admin user
      const adminUser = await usersResource.insert({
        email,
        password, // Will be hashed by Identity plugin's password field type
        name: name || 'Administrator',
        scopes: scopes || this.defaultAdminScopes,
        active: true,
        metadata: {
          ...metadata,
          createdViaOnboarding: true,
          onboardingMode: this.config.mode || 'unknown'
        }
      });

      if (this.logger && this.config.logLevel) {
        this.logger.info(`[Onboarding] Admin account created: ${email} (scopes: ${(scopes || this.defaultAdminScopes).join(', ')})`);
      }

      // Cache admin details for idempotent onboarding within the same process
      const alreadyCached = onboardingMemoryCache.admins.some((admin) => admin.email === email);
      if (!alreadyCached) {
        onboardingMemoryCache.admins.push({
          email,
          password,
          name: name || 'Administrator',
          scopes: scopes || this.defaultAdminScopes,
          metadata
        });
      }

      // Emit audit event
      await this._logAuditEvent('admin_account_created', {
        email,
        scopes: scopes || this.defaultAdminScopes,
        createdViaOnboarding: true,
        mode: this.config.mode
      });

      return adminUser;
    } catch (error) {
      this.logger?.error('[Onboarding] Failed to create admin user:', error);
      throw new PluginError('Failed to create admin user', {
        pluginName: 'IdentityPlugin',
        operation: 'createAdmin',
        cause: error,
        retriable: false
      });
    }
  }

  /**
   * Create OAuth client
   * @param {Object} options - Client options
   * @returns {Promise<Object>} Created client with credentials
   */
  async createClient(options = {}) {
    const {
      name,
      clientId = idGenerator(),
      clientSecret = `${idGenerator()}${idGenerator()}`,
      grantTypes = ['client_credentials'],
      allowedScopes = ['openid', 'profile'],
      redirectUris = [],
      audiences = [],
      metadata = {}
    } = options;

    if (!name) {
      throw new PluginError('Client name is required', {
        pluginName: 'IdentityPlugin',
        operation: 'createClient',
        statusCode: 400,
        retriable: false
      });
    }

    try {
      const clientsResource = this.resources.clients || this.clientsResource;
      
      const client = await clientsResource.insert({
        clientId,
        clientSecret, // Will be encrypted by Identity plugin
        name,
        grantTypes,
        allowedScopes,
        redirectUris,
        metadata: {
          ...metadata,
          audiences,
          createdViaOnboarding: true
        },
        active: true
      });

      if (this.logger && this.config.logLevel) {
        this.logger.info(`[Onboarding] OAuth client created: ${name} (${clientId})`);
      }

      // Return credentials (plaintext - only shown once!)
      return {
        id: client.id,
        clientId,
        clientSecret, // Plaintext - store securely!
        name,
        grantTypes,
        allowedScopes,
        redirectUris
      };
    } catch (error) {
      this.logger?.error('[Onboarding] Failed to create OAuth client:', error);
      throw new PluginError('Failed to create OAuth client', {
        pluginName: 'IdentityPlugin',
        operation: 'createClient',
        cause: error,
        retriable: false
      });
    }
  }

  /**
   * Get onboarding status
   * @returns {Promise<Object>} Onboarding status
   */
  async getOnboardingStatus() {
    try {
      const firstRun = await this.detectFirstRun();
      const metadata = await this._getOnboardingMetadata();

      return {
        completed: !firstRun || metadata?.completed === true,
        adminExists: !firstRun,
        completedAt: metadata?.completedAt,
        mode: metadata?.mode || this.config.mode,
        clientsCount: metadata?.clientsCreated || 0
      };
    } catch (error) {
      this.logger?.error('[Onboarding] Error getting status:', error);
      return {
        completed: false,
        error: error.message
      };
    }
  }

  /**
   * Mark onboarding as complete
   * @param {Object} data - Completion data
   */
  async markOnboardingComplete(data = {}) {
    try {
      const metadata = {
        completed: true,
        completedAt: new Date().toISOString(),
        mode: this.config.mode || 'unknown',
        ...data
      };

      onboardingMemoryCache.metadata = metadata;

      // Store in plugin storage
      if (this.pluginStorageResource) {
        await this.pluginStorageResource.insert({
          key: 'onboarding_metadata',
          value: metadata,
          metadata: {
            type: 'onboarding',
            version: 1
          }
        });
      }

      if (this.logger && this.config.logLevel) {
        this.logger.info('[Onboarding] Marked as complete');
      }

      // Emit audit event
      await this._logAuditEvent('onboarding_completed', metadata);
    } catch (error) {
      this.logger?.error('[Onboarding] Failed to mark complete:', error);
      // Non-fatal - don't throw
    }
  }

  /**
   * Run environment variables mode
   * Reads IDENTITY_ADMIN_EMAIL, IDENTITY_ADMIN_PASSWORD, IDENTITY_ADMIN_NAME
   */
  async runEnvMode() {
    if (this.logger && this.config.logLevel) {
      this.logger.info('[Onboarding] Running environment variables mode');
    }

    // Try env vars first, then config
    let email = process.env.IDENTITY_ADMIN_EMAIL || this.config.adminEmail;
    let password = process.env.IDENTITY_ADMIN_PASSWORD || this.config.adminPassword;
    const name = process.env.IDENTITY_ADMIN_NAME || this.config.adminName;

    // Support file-based secrets (e.g., Docker secrets)
    if (process.env.IDENTITY_ADMIN_PASSWORD_FILE) {
      try {
        const fs = await import('fs');
        password = fs.readFileSync(process.env.IDENTITY_ADMIN_PASSWORD_FILE, 'utf8').trim();
      } catch (error) {
        this.logger?.error('[Onboarding] Failed to read password file:', error);
      }
    }

    if (process.env.IDENTITY_ADMIN_EMAIL_FILE) {
      try {
        const fs = await import('fs');
        email = fs.readFileSync(process.env.IDENTITY_ADMIN_EMAIL_FILE, 'utf8').trim();
      } catch (error) {
        this.logger?.error('[Onboarding] Failed to read email file:', error);
      }
    }

    if (!email || !password) {
      throw new PluginError(
        'Missing IDENTITY_ADMIN_EMAIL or IDENTITY_ADMIN_PASSWORD environment variables',
        {
          pluginName: 'IdentityPlugin',
          operation: 'runEnvMode',
          statusCode: 400,
          retriable: false,
          suggestion: 'Set IDENTITY_ADMIN_EMAIL and IDENTITY_ADMIN_PASSWORD env vars, or use onboarding.admin config'
        }
      );
    }

    const admin = await this.createAdmin({ email, password, name });
    await this.markOnboardingComplete({ adminEmail: email });

    if (this.logger && this.config.logLevel) {
      this.logger.info('[Onboarding] Environment mode complete');
    }

    return admin;
  }

  /**
   * Run declarative config mode
   * Uses onboarding.admin config object
   */
  async runConfigMode() {
    if (this.logger && this.config.logLevel) {
      this.logger.info('[Onboarding] Running config mode');
    }

    const { admin } = this.config;

    if (!admin || !admin.email || !admin.password) {
      throw new PluginError(
        'Missing admin.email or admin.password in onboarding config',
        {
          pluginName: 'IdentityPlugin',
          operation: 'runConfigMode',
          statusCode: 400,
          retriable: false,
          suggestion: 'Provide onboarding.admin: { email, password } in plugin config'
        }
      );
    }

    const createdAdmin = await this.createAdmin({
      email: admin.email,
      password: admin.password,
      name: admin.name,
      scopes: admin.scopes,
      metadata: admin.metadata
    });

    await this.markOnboardingComplete({ adminEmail: admin.email });

    if (this.logger && this.config.logLevel) {
      this.logger.info('[Onboarding] Config mode complete');
    }

    return createdAdmin;
  }

  /**
   * Run programmatic callback mode
   * Calls user-provided onFirstRun function
   */
  async runCallbackMode() {
    if (this.logger && this.config.logLevel) {
      this.logger.info('[Onboarding] Running callback mode');
    }

    const onFirstRun = this.config.onFirstRun || this.config.callback;

    if (typeof onFirstRun !== 'function') {
      throw new PluginError(
        'onFirstRun must be a function in callback mode',
        {
          pluginName: 'IdentityPlugin',
          operation: 'runCallbackMode',
          statusCode: 400,
          retriable: false,
          suggestion: 'Provide onboarding.onFirstRun: async ({ createAdmin, createClient }) => { ... }'
        }
      );
    }

    const context = {
      createAdmin: this.createAdmin.bind(this),
      createClient: this.createClient.bind(this),
      db: this.database,
      logger: this.logger,
      config: this.config
    };

    try {
      await onFirstRun(context);
      await this.markOnboardingComplete({ mode: 'callback' });

      if (this.logger && this.config.logLevel) {
        this.logger.info('[Onboarding] Callback mode complete');
      }
    } catch (error) {
      this.logger?.error('[Onboarding] Callback error:', error);
      throw new PluginError('onFirstRun callback failed', {
        pluginName: 'IdentityPlugin',
        operation: 'runCallbackMode',
        cause: error,
        retriable: false
      });
    }
  }

  /**
   * Run interactive CLI wizard mode
   * Uses enquirer for prompts (requires TTY)
   */
  async runInteractiveMode() {
    if (this.logger && this.config.logLevel) {
      this.logger.info('[Onboarding] Running interactive mode');
    }

    // Check if TTY available
    if (!process.stdout.isTTY) {
      throw new PluginError(
        'Interactive mode requires a TTY (terminal). Use env or config mode instead.',
        {
          pluginName: 'IdentityPlugin',
          operation: 'runInteractiveMode',
          statusCode: 400,
          retriable: false,
          suggestion: 'Set IDENTITY_ADMIN_EMAIL/PASSWORD env vars or use onboarding.admin config'
        }
      );
    }

    // Lazy load interactive wizard
    try {
      const { InteractiveWizard } = await import('./interactive-wizard.js');
      const wizard = new InteractiveWizard({
        logger: this.logger,
        config: this.config,
        passwordPolicy: this.passwordPolicy
      });

      const adminData = await wizard.run();
      const admin = await this.createAdmin(adminData);
      await this.markOnboardingComplete({ adminEmail: adminData.email });

      if (this.logger && this.config.logLevel) {
        this.logger.info('[Onboarding] Interactive mode complete');
      }

      return admin;
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('enquirer')) {
        throw new PluginError(
          'Interactive mode requires "enquirer" package. Install with: npm install enquirer',
          {
            pluginName: 'IdentityPlugin',
            operation: 'runInteractiveMode',
            cause: error,
            retriable: false,
            suggestion: 'Run: npm install enquirer, or use env/config mode instead'
          }
        );
      }
      throw error;
    }
  }

  /**
   * Get onboarding metadata from storage
   * @private
   */
  async _getOnboardingMetadata() {
    if (!this.pluginStorageResource) {
      return null;
    }

    try {
      const records = await this.pluginStorageResource.query({
        key: 'onboarding_metadata'
      });

      if (records.length > 0) {
        return records[0].value;
      }
    } catch (error) {
      // Non-fatal
      this.logger?.error('[Onboarding] Error reading metadata:', error);
    }

    return null;
  }

  /**
   * Log audit event
   * @private
   */
  async _logAuditEvent(action, data) {
    if (!this.auditPlugin || !this.auditPlugin.log) {
      return;
    }

    try {
      await this.auditPlugin.log({
        action,
        resource: 'identity_onboarding',
        metadata: {
          ...data,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      // Non-fatal - audit logging failures shouldn't block onboarding
      this.logger?.error('[Onboarding] Audit log error:', error);
    }
  }

  /**
   * Reset in-memory onboarding cache (used by test cleanup hooks)
   */
  static resetCache() {
    onboardingMemoryCache.admins = [];
    onboardingMemoryCache.metadata = null;
  }
}

// Note: Cache clearing between tests should be done in test setup files (jest.setup.js)
// not at module load time, as it causes "Hooks cannot be defined inside tests" errors
