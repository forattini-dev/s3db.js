/**
 * OIDC Hook System - Composable lifecycle hooks for authentication
 *
 * The Best OIDC Plugin Ever Built™
 *
 * Features:
 * - Composable hooks (arrays of functions)
 * - Phase metadata for debugging
 * - Context available in ALL hooks
 * - Error hooks for every failure scenario
 * - Cookie helpers with secure defaults
 */

import { setCookie as honoSetCookie, getCookie as honoGetCookie, deleteCookie as honoDeleteCookie } from 'hono/cookie';
import { createLogger } from '../../../concerns/logger.js';

const logger = createLogger({ name: 'OidcHooks', level: process.env.S3DB_LOG_LEVEL || 'info' });

/**
 * Hook definitions with metadata
 * - phase: Which authentication phase this hook belongs to
 * - canModify: Whether hook can return value to modify params
 * - errorHook: Corresponding error hook name
 */
export const HOOK_DEFINITIONS = {
  // ===== LOGIN PHASE =====
  beforeLogin: {
    phase: 'login',
    canModify: true,
    errorHook: 'onError'
  },
  afterLogin: {
    phase: 'login',
    canModify: false,
    errorHook: 'onError'
  },

  // ===== CALLBACK PHASE =====
  beforeCallbackValidation: {
    phase: 'callback',
    canModify: false,
    errorHook: 'onCallbackError'
  },
  afterTokenExchange: {
    phase: 'callback',
    canModify: false,
    errorHook: 'onTokenExchangeError'
  },
  afterTokenDecode: {
    phase: 'callback',
    canModify: true,
    errorHook: 'onTokenValidationError'
  },
  beforeUserResolution: {
    phase: 'callback',
    canModify: true,
    errorHook: 'onError'
  },
  beforeUserCreate: {
    phase: 'callback',
    canModify: true,
    errorHook: 'onUserCreateError'
  },
  afterUserCreate: {
    phase: 'callback',
    canModify: false,
    errorHook: 'onError'
  },
  beforeUserUpdate: {
    phase: 'callback',
    canModify: true,
    errorHook: 'onUserUpdateError'
  },
  afterUserUpdate: {
    phase: 'callback',
    canModify: false,
    errorHook: 'onError'
  },
  beforeSessionCreate: {
    phase: 'callback',
    canModify: true,
    errorHook: 'onError'
  },
  afterSessionCreate: {
    phase: 'callback',
    canModify: false,
    errorHook: 'onError'
  },
  beforeRedirect: {
    phase: 'callback',
    canModify: true,
    errorHook: 'onError'
  },

  // ===== MIDDLEWARE PHASE =====
  beforeSessionCheck: {
    phase: 'middleware',
    canModify: false,
    errorHook: 'onError'
  },
  afterSessionDecode: {
    phase: 'middleware',
    canModify: true,
    errorHook: 'onSessionInvalid'
  },
  beforeUserEnrich: {
    phase: 'middleware',
    canModify: false,
    errorHook: 'onUserEnrichError'
  },
  afterUserEnrich: {
    phase: 'middleware',
    canModify: true,
    errorHook: 'onUserEnrichError'
  },
  beforeTokenRefresh: {
    phase: 'middleware',
    canModify: false,
    errorHook: 'onTokenRefreshError'
  },
  afterTokenRefresh: {
    phase: 'middleware',
    canModify: false,
    errorHook: 'onTokenRefreshError'
  },
  beforeSessionUpdate: {
    phase: 'middleware',
    canModify: true,
    errorHook: 'onError'
  },

  // ===== REFRESH PHASE =====
  onRefreshStart: {
    phase: 'refresh',
    canModify: false,
    errorHook: 'onRefreshError'
  },
  onRefreshSuccess: {
    phase: 'refresh',
    canModify: false,
    errorHook: 'onError'
  },

  // ===== LOGOUT PHASE =====
  beforeLogout: {
    phase: 'logout',
    canModify: false,
    errorHook: 'onError'
  },
  afterSessionDelete: {
    phase: 'logout',
    canModify: false,
    errorHook: 'onError'
  },
  beforeIdpLogout: {
    phase: 'logout',
    canModify: true,
    errorHook: 'onError'
  },
  afterLogout: {
    phase: 'logout',
    canModify: false,
    errorHook: 'onError'
  },

  // ===== ERROR HOOKS =====
  onCallbackError: {
    phase: 'error',
    canModify: false,
    errorHook: null
  },
  onTokenExchangeError: {
    phase: 'error',
    canModify: false,
    errorHook: null
  },
  onTokenValidationError: {
    phase: 'error',
    canModify: false,
    errorHook: null
  },
  onUserNotFound: {
    phase: 'error',
    canModify: true,
    errorHook: null
  },
  onUserCreateError: {
    phase: 'error',
    canModify: false,
    errorHook: null
  },
  onUserUpdateError: {
    phase: 'error',
    canModify: false,
    errorHook: null
  },
  onSessionInvalid: {
    phase: 'error',
    canModify: true,
    errorHook: null
  },
  onSessionExpired: {
    phase: 'error',
    canModify: true,
    errorHook: null
  },
  onTokenRefreshError: {
    phase: 'error',
    canModify: true,
    errorHook: null
  },
  onUserEnrichError: {
    phase: 'error',
    canModify: true,
    errorHook: null
  },
  onRefreshError: {
    phase: 'error',
    canModify: false,
    errorHook: null
  },
  onError: {
    phase: 'error',
    canModify: false,
    errorHook: null
  }
};

/**
 * Cookie Helpers - Secure defaults for cookie management
 *
 * Supports custom cookie prefix for branding:
 * - cookiePrefix: 'myapp' → cookies like 'myapp_token', 'myapp_prefs'
 * - If not set, no prefix is added
 */
export class CookieHelpers {
  constructor(context, config = {}) {
    this.context = context;
    this.config = config;
    this.cookiePrefix = config.cookiePrefix || ''; // e.g., 'mrt' → 'mrt_api_token'
    this.defaults = {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 86400 // 24 hours default
    };
  }

  _prefixName(name) {
    return this.cookiePrefix ? `${this.cookiePrefix}_${name}` : name;
  }

  setCookie(name, value, options = {}) {
    const prefixedName = this._prefixName(name);
    const mergedOptions = { ...this.defaults, ...options };
    honoSetCookie(this.context, prefixedName, value, mergedOptions);
    logger.debug(`Cookie set: ${prefixedName}`, {
      httpOnly: mergedOptions.httpOnly,
      maxAge: mergedOptions.maxAge
    });
  }

  getCookie(name) {
    const prefixedName = this._prefixName(name);
    return honoGetCookie(this.context, prefixedName);
  }

  deleteCookie(name, options = {}) {
    const prefixedName = this._prefixName(name);
    const mergedOptions = { ...this.defaults, ...options, maxAge: -1 };
    honoDeleteCookie(this.context, prefixedName, mergedOptions);
    logger.debug(`Cookie deleted: ${prefixedName}`);
  }

  setJsonCookie(name, data, options = {}) {
    try {
      const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
      this.setCookie(name, encoded, { ...options, httpOnly: options.httpOnly !== undefined ? options.httpOnly : true });
    } catch (error) {
      const prefixedName = this._prefixName(name);
      logger.error(`Failed to set JSON cookie: ${prefixedName}`, error);
      throw error;
    }
  }

  getJsonCookie(name) {
    try {
      const value = this.getCookie(name);
      if (!value) return undefined;
      const decoded = Buffer.from(value, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      const prefixedName = this._prefixName(name);
      logger.error(`Failed to get JSON cookie: ${prefixedName}`, error);
      return undefined;
    }
  }

  getSessionId() {
    return this.context.get('sessionId');
  }

  getSessionData() {
    return this.context.get('sessionData');
  }
}

/**
 * Hook Executor - Runs hooks with proper error handling and metadata tracking
 */
export class HookExecutor {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.metrics = {
      executions: {},
      errors: {},
      totalDuration: {}
    };
  }

  /**
   * Get hooks for a given hook name
   * Normalizes to array format (single function or array of functions)
   */
  getHooks(hookName) {
    const hooks = this.config.hooks?.[hookName];
    if (!hooks) return [];
    return Array.isArray(hooks) ? hooks : [hooks];
  }

  /**
   * Execute hooks for a given name
   *
   * @param {string} hookName - Name of the hook to execute
   * @param {object} params - Parameters to pass to hooks
   * @param {object} options - Execution options
   * @param {boolean} options.stopOnError - Stop execution on first error (default: false)
   * @param {boolean} options.mergeResults - Merge hook return values into params (default: true)
   * @returns {Promise<object>} - Modified params or original params
   */
  async executeHooks(hookName, params, options = {}) {
    const {
      stopOnError = false,
      mergeResults = true
    } = options;

    const hooks = this.getHooks(hookName);
    const definition = HOOK_DEFINITIONS[hookName];

    if (!definition) {
      this.logger.warn(`Unknown hook: ${hookName}`);
      return params;
    }

    if (hooks.length === 0) {
      this.logger.debug(`No hooks configured for: ${hookName}`);
      return params;
    }

    this.logger.debug(`Executing ${hooks.length} hook(s) for: ${hookName}`, {
      phase: definition.phase,
      canModify: definition.canModify
    });

    let result = { ...params };
    const startTime = Date.now();

    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i];
      const hookIndex = i + 1;

      try {
        const hookStart = Date.now();
        const hookResult = await hook(result);
        const hookDuration = Date.now() - hookStart;

        // Track metrics
        const metricKey = `${hookName}[${hookIndex}]`;
        this.metrics.executions[metricKey] = (this.metrics.executions[metricKey] || 0) + 1;
        this.metrics.totalDuration[metricKey] = (this.metrics.totalDuration[metricKey] || 0) + hookDuration;

        // Merge result if hook can modify and returned something
        if (definition.canModify && hookResult && typeof hookResult === 'object' && mergeResults) {
          result = { ...result, ...hookResult };
          this.logger.debug(`Hook ${hookName}[${hookIndex}] modified params`, {
            duration: hookDuration,
            modified: true
          });
        } else {
          this.logger.debug(`Hook ${hookName}[${hookIndex}] executed`, {
            duration: hookDuration,
            modified: false
          });
        }
      } catch (error) {
        const metricKey = `${hookName}[${hookIndex}]`;
        this.metrics.errors[metricKey] = (this.metrics.errors[metricKey] || 0) + 1;

        this.logger.error(`Hook ${hookName}[${hookIndex}] failed`, error);

        // Try error hook if available
        if (definition.errorHook) {
          try {
            const errorResult = await this.executeErrorHook(definition.errorHook, {
              error,
              hookName,
              hookIndex,
              phase: definition.phase,
              ...result
            });

            if (errorResult) {
              this.logger.info(`Error hook ${definition.errorHook} handled error from ${hookName}[${hookIndex}]`);
              return errorResult;
            }
          } catch (errorHookError) {
            this.logger.error(`Error hook ${definition.errorHook} also failed`, errorHookError);
          }
        }

        // Stop on error if configured
        if (stopOnError) {
          throw error;
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    this.logger.debug(`Completed ${hookName} (${hooks.length} hook(s))`, {
      duration: totalDuration,
      phase: definition.phase
    });

    return result;
  }

  /**
   * Execute error hook
   *
   * @param {string} errorHookName - Name of the error hook
   * @param {object} params - Parameters including error
   * @returns {Promise<any>} - Result from error hook (or null)
   */
  async executeErrorHook(errorHookName, params) {
    const errorHooks = this.getHooks(errorHookName);
    if (errorHooks.length === 0) return null;

    for (const errorHook of errorHooks) {
      try {
        const result = await errorHook(params);
        if (result) return result; // First hook to return something wins
      } catch (err) {
        this.logger.error(`Error hook ${errorHookName} threw error`, err);
        // Continue to next error hook
      }
    }

    return null;
  }

  /**
   * Get hook metrics
   */
  getMetrics() {
    return {
      executions: { ...this.metrics.executions },
      errors: { ...this.metrics.errors },
      totalDuration: { ...this.metrics.totalDuration }
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      executions: {},
      errors: {},
      totalDuration: {}
    };
  }
}

/**
 * Create hook executor instance
 */
export function createHookExecutor(config, customLogger) {
  return new HookExecutor(config, customLogger || logger);
}

/**
 * Create cookie helpers instance
 */
export function createCookieHelpers(context, config = {}) {
  return new CookieHelpers(context, config);
}
