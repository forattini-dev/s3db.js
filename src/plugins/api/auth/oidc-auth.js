/**
 * OIDC Authentication Driver (Authorization Code Flow) - Production Ready
 *
 * Implements OpenID Connect Authorization Code Flow with enterprise features:
 * - Auto user creation/update from token claims
 * - Session management (rolling + absolute duration)
 * - Token refresh before expiry
 * - IdP logout support (Azure AD/Entra compatible)
 * - Startup configuration validation
 * - User data cached in session (zero DB lookups per request)
 *
 * Config options:
 * - resource: Resource name (default: 'plg_api_oidc_users')
 * - createResource: Auto-create resource (default: true)
 * - userMapping: Map OIDC claims to user fields (default: { id: 'sub', email: 'email', username: 'preferred_username' })
 * - issuer: OIDC issuer URL (required)
 * - clientId: OAuth2 client ID (required)
 * - clientSecret: OAuth2 client secret (required)
 * - redirectUri: Callback URL (required)
 * - cookieSecret: Session encryption key (required, 32+ chars)
 * - scopes: OIDC scopes (default: ['openid', 'profile', 'email', 'offline_access'])
 * - rollingDuration: Session rolling duration (default: 24h)
 * - absoluteDuration: Session absolute duration (default: 7d)
 * - autoCreateUser: Auto-create users from IdP (default: true)
 * - idpLogout: Enable IdP logout (default: true)
 * - onUserAuthenticated: Hook called after auth
 *
 * @example
 * {
 *   driver: 'oidc',
 *   config: {
 *     resource: 'users',
 *     userMapping: {
 *       id: 'sub',
 *       email: 'email',
 *       username: 'preferred_username',
 *       role: 'role'
 *     },
 *     issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     redirectUri: 'https://yourapp.com/auth/callback',
 *     cookieSecret: 'your-32-char-secret-key-here!!!',
 *     onUserAuthenticated: async ({ user, created }) => {
 *       if (created) {
 *         // Handle new user creation
 *       }
 *     }
 *   }
 * }
 */

import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createLogger } from '../../../concerns/logger.js';
import { unauthorized } from '../utils/response-formatter.js';
import { applyProviderPreset, applyProviderQuirks } from './providers.js';
import { createAuthDriverRateLimiter } from '../middlewares/rate-limit.js';
import { deriveOidcKeys } from '../concerns/crypto.js';
import { OIDCResourceManager } from './resource-manager.js';
import {
  setChunkedCookie,
  getChunkedCookie,
  deleteChunkedCookie
} from '../concerns/cookie-chunking.js';
import {
  validateIdToken,
  validateTokenResponse,
  validateConfig as validateOidcConfigStrict,
  getUserFriendlyError
} from '../concerns/oidc-validator.js';
import {
  ErrorTypes,
  getErrorType,
  getErrorDetails,
  generateErrorPage,
  generateErrorJSON
} from '../concerns/oidc-errors.js';
import { createHookExecutor, createCookieHelpers } from '../concerns/oidc-hooks.js';
import { idGenerator } from '../../../concerns/id.js';

// Module-level logger for OIDC auth (respects S3DB_LOG_LEVEL env var)
const logger = createLogger({
  name: 'OidcAuth',
  level: process.env.S3DB_LOG_LEVEL || 'info'
});

// Defensive check: ensure logger was created successfully
if (!logger || typeof logger.info !== 'function') {
  console.error('[OIDC] CRITICAL: Failed to create logger - falling back to console');
  const fallbackLogger = {
    info: (...args) => console.log('[OIDC-INFO]', ...args),
    debug: (...args) => console.log('[OIDC-DEBUG]', ...args),
    warn: (...args) => console.warn('[OIDC-WARN]', ...args),
    error: (...args) => console.error('[OIDC-ERROR]', ...args)
  };
  Object.assign(logger, fallbackLogger);
}

/**
 * 🔧 Default HTTP headers for OIDC token endpoint requests
 * Prevents HTTP/2 protocol errors with Azure AD and other IdPs
 * @returns {Object} Default headers with Connection: close for HTTP/1.1 fallback
 */
function getOidcFetchHeaders(customHeaders = {}) {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Connection': 'close',  // Force HTTP/1.1 (prevents HTTP/2 errors with Azure AD)
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...customHeaders  // Allow overrides
  };
}

/**
 * Validate OIDC configuration at startup
 * @throws {Error} If configuration is invalid
 */
export function validateOidcConfig(config) {
  const errors = [];

  // Required fields
  if (!config.issuer) {
    errors.push('issuer is required');
  } else if (config.issuer.includes('{tenant-id}')) {
    errors.push('issuer contains placeholder {tenant-id}');
  }

  if (!config.clientId) {
    errors.push('clientId is required');
  } else if (config.clientId === 'your-client-id-here') {
    errors.push('clientId contains placeholder value');
  }

  if (!config.clientSecret) {
    errors.push('clientSecret is required');
  } else if (config.clientSecret === 'your-client-secret-here') {
    errors.push('clientSecret contains placeholder value');
  }

  if (!config.redirectUri) {
    errors.push('redirectUri is required');
  }

  if (!config.cookieSecret) {
    errors.push('cookieSecret is required');
  } else if (config.cookieSecret.length < 32) {
    errors.push('cookieSecret must be at least 32 characters');
  } else if (config.cookieSecret === 'CHANGE_THIS_SECRET' || config.cookieSecret === 'long-random-string-for-session-encryption') {
    errors.push('cookieSecret contains placeholder/default value');
  }

  // Validate UUID format for clientId (common for Azure AD/Entra)
  if (config.clientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.clientId)) {
    if (config?.logLevel === 'debug' || config?.logLevel === 'trace') {
      logger.warn('[OIDC] clientId is not in UUID format (may be expected for some providers)');
    }
  }

  if (errors.length > 0) {
    throw new Error(`OIDC driver configuration is invalid:\n${errors.map(e => `  - ${e}`).join('\n')}\n\nSee documentation for configuration requirements.`);
  }
}

/**
 * Apply userMapping configuration to map OIDC claims to user fields
 * @param {Object} claims - OIDC token claims
 * @param {Object} mapping - User mapping configuration
 * @param {Object} defaults - Default values (id, scopes, provider, now)
 * @returns {Object} Mapped user object
 *
 * @example
 * userMapping: {
 *   id: 'email',  // Use email claim as user ID
 *   name: 'name',  // Map name claim to name field
 *   email: 'email',  // Map email claim to email field (if schema has it)
 *   customField: 'preferred_username',  // Map any claim to any field
 *   metadata: (claims) => ({  // Function to build metadata
 *     oidc: { sub: claims.sub, ... },
 *     custom: claims.customClaim
 *   })
 * }
 */
function applyUserMapping(claims, mapping, defaults) {
  const user = {
    id: defaults.defaultId,  // Start with default ID
    scopes: defaults.defaultScopes,  // Default scopes
    lastLoginAt: defaults.now  // Always set lastLoginAt
  };

  // Apply simple field mappings (string → string)
  for (const [userField, claimName] of Object.entries(mapping)) {
    if (userField === 'metadata') continue;  // Skip metadata, handle separately

    if (typeof claimName === 'string' && claims[claimName] !== undefined) {
      user[userField] = claims[claimName];
    }
  }

  // Handle metadata mapping (can be function or object)
  if (mapping.metadata) {
    if (typeof mapping.metadata === 'function') {
      user.metadata = mapping.metadata(claims);
    } else if (typeof mapping.metadata === 'object') {
      user.metadata = mapping.metadata;
    }
  } else {
    // Default metadata if not mapped
    user.metadata = {
      oidc: {
        sub: claims.sub,
        provider: defaults.provider,
        createdAt: defaults.now,
        claims: { ...claims }
      }
    };
  }

  return user;
}


/**
 * Get or create user from OIDC claims
 * @param {Object} usersResource - s3db.js users resource
 * @param {Object} claims - ID token claims
 * @param {Object} config - OIDC config
 * @returns {Promise<{user: Object, created: boolean}>} User object and creation status
 */
async function getOrCreateUser(usersResource, claims, config, context, hookExecutor) {
  // ⚠️ FORCED CONSOLE OUTPUT - MUST APPEAR
  console.error('\n\n========== GET OR CREATE USER CALLED ==========');
  console.error('Claims received:', JSON.stringify(claims, null, 2));
  console.error('Config:', JSON.stringify(config, null, 2));
  console.error('==============================================\n\n');

  const {
    autoCreateUser = true,
    userIdClaim = 'sub',
    fallbackIdClaims = ['email', 'preferred_username'],
    lookupFields = ['email', 'preferred_username']
  } = config;

  // 🔍 DEBUG: Log ALL claims received from Azure AD
  logger.info({
    allClaims: claims,
    claimKeys: Object.keys(claims),
    userIdClaim,
    userIdValue: claims[userIdClaim],
    fallbackIdClaims,
    lookupFields
  }, '[OIDC] 🔍 DEBUG: Received ID Token claims');

  const candidateIds = [];
  if (userIdClaim && claims[userIdClaim]) {
    candidateIds.push(String(claims[userIdClaim]));
  }
  for (const field of fallbackIdClaims) {
    if (!field || field === userIdClaim) continue;
    const value = claims[field];
    if (value) {
      candidateIds.push(String(value));
    }
  }

  // 🪵 Log user lookup attempt
  logger.debug({
    candidateIds: candidateIds.map(id => id?.substring(0, 15) + '...'),
    lookupFields,
    autoCreateUser,
    userIdClaim
  }, '[OIDC] User lookup starting');

  let user = null;
  // Try direct lookups by id (skip cache to avoid auth flow issues)
  for (const candidate of candidateIds) {
    try {
      user = await usersResource.get(candidate, { skipCache: true });
      break;
    } catch (_) {
      // Not found, continue with next candidate
    }
  }

  // Fallback: query by lookup fields (skip cache to avoid auth flow issues)
  if (!user) {
    const fields = Array.isArray(lookupFields) ? lookupFields : [lookupFields];
    logger.info({
      lookupFields: fields,
      attemptedQueries: fields.map(f => ({ field: f, value: claims[f], hasValue: !!claims[f] }))
    }, '[OIDC] 🔍 DEBUG: Attempting query lookups');

    for (const field of fields) {
      if (!field) continue;
      const value = claims[field];
      if (!value) {
        logger.info({ field, reason: 'no value in claims' }, '[OIDC] ⚠️ Skipping lookup field');
        continue;
      }
      const results = await usersResource.query({ [field]: value }, { limit: 1, skipCache: true });
      logger.info({ field, value, resultsCount: results.length }, '[OIDC] 🔍 Query result');
      if (results.length > 0) {
        user = results[0];
        break;
      }
    }
  }

  // 🔍 DEBUG: Log if user not found
  if (!user) {
    logger.warn({
      candidateIds,
      lookupFields,
      availableClaims: Object.keys(claims),
      autoCreateUser
    }, '[OIDC] ⚠️ User NOT found - will attempt auto-create');
  }

  const now = new Date().toISOString();

  if (user) {
    // 🪵 Log existing user found
    logger.debug({
      userId: user.id?.substring(0, 15) + '...',
      email: user.email,
      action: 'update'
    }, '[OIDC] Existing user found, updating');

    // Update existing user with ALL Azure AD claims
    // 🎯 Use update() to merge and preserve existing fields like apiToken
    // Explicitly exclude problematic fields that may have invalid data
    const { webpush, lastUrlId, lastLoginIp, lastLoginUserAgent, password, ...userWithoutProblematicFields } = user;

    // 🎯 Build clean user object with ONLY fields from custom schema
    const cleanUser = {
      ...userWithoutProblematicFields,

      // Update fields that exist in custom schema
      lastLoginAt: now,
      name: claims.name || user.name,
      isActive: user.isActive !== undefined ? user.isActive : true,

      // Rebuild metadata cleanly
      metadata: {
        costCenterId: user.metadata?.costCenterId,
        teamId: user.metadata?.teamId,
        needsOnboarding: user.metadata?.needsOnboarding,

        // Update OIDC data with ALL Azure AD claims
        oidc: {
          sub: claims.sub,
          provider: config.issuer,
          lastSync: now,
          claims: { ...claims }  // Email, picture, username are in claims
        }
      }
    };

    // Execute beforeUserUpdate hooks with context
    let hookParams = {};
    try {
      hookParams = await hookExecutor.executeHooks('beforeUserUpdate', {
        user: cleanUser,
        updates: cleanUser,
        claims,
        usersResource,
        context
      });
    } catch (hookError) {
      logger.error({
        error: hookError.message,
        stack: hookError.stack,
        userId: user.id,
        hook: 'beforeUserUpdate'
      }, '[OIDC] CRITICAL: `beforeUserUpdate` hook failed but login flow will continue. Error will not be re-thrown.');
      // Do not re-throw; allow login to complete even if hook fails
    }

    // Hook can modify updates
    let finalUser = cleanUser;
    if (hookParams.updates) {
      finalUser = { ...cleanUser, ...hookParams.updates };
      if (hookParams.updates.metadata) {
        finalUser.metadata = {
          ...cleanUser.metadata,
          ...hookParams.updates.metadata
        };
      }
    }

    // 🎯 Use update() to merge and preserve existing fields
    // update() doesn't validate fields we're not updating (avoids password validation)
    logger.debug({
      userId: user.id?.substring(0, 15) + '...',
      fieldsToUpdate: Object.keys(finalUser),
      hasMetadata: !!finalUser.metadata
    }, '[OIDC] Updating existing user with merged data');

    try {
      user = await usersResource.update(user.id, finalUser, { skipCache: true });
      logger.debug({
        userId: user.id?.substring(0, 15) + '...',
        email: user.email,
        updated: true
      }, '[OIDC] User updated successfully');
      return { user, created: false };
    } catch (updateErr) {
      logger.error({
        error: updateErr.message,
        errorType: updateErr.constructor.name,
        userId: user.id?.substring(0, 15) + '...',
        stack: updateErr.stack
      }, '[OIDC] User update failed');
      throw updateErr;
    }
  }

  if (!autoCreateUser) {
    logger.warn('[OIDC] User not found and autoCreateUser is disabled');
    return { user: null, created: false };
  }

  // Determine ID for new user
  const newUserId = candidateIds[0];

  if (!newUserId) {
    throw new Error('Cannot determine user ID from OIDC claims');
  }

  // 🪵 Log new user creation
  logger.debug({
    userId: newUserId?.substring(0, 15) + '...',
    email: claims.email,
    action: 'create',
    hasUserMapping: !!config.userMapping
  }, '[OIDC] Creating new user');

  // 🎯 Apply userMapping if configured (allows custom field mapping from claims)
  let newUser;
  if (config.userMapping && typeof config.userMapping === 'object') {
    newUser = applyUserMapping(claims, config.userMapping, {
      defaultId: newUserId,
      defaultScopes: config.defaultScopes || ['preset:user'],
      provider: config.issuer,
      now
    });
  } else {
    // Fallback to default mapping if no userMapping configured
    newUser = {
      id: newUserId,
      name: claims.name || claims.email || newUserId,
      scopes: config.defaultScopes || ['preset:user'],
      isActive: true,
      lastLoginAt: now,
      // apiToken will be auto-generated by beforeInsert hook if not provided
      metadata: {
        oidc: {
          sub: claims.sub,
          provider: config.issuer,
          createdAt: now,
          claims: { ...claims }
        }
      }
    };
  }

  // Execute beforeUserCreate hooks with context
  const createHookParams = await hookExecutor.executeHooks('beforeUserCreate', {
    userData: newUser,
    claims,
    usersResource,
    context
  });

  // Hook can modify userData
  if (createHookParams.userData) {
    Object.assign(newUser, createHookParams.userData);
    if (createHookParams.userData.metadata) {
      newUser.metadata = {
        ...newUser.metadata,
        ...createHookParams.userData.metadata
      };
    }
  }

  // 🪵 Log user creation attempt
  logger.debug({
    userId: newUser.id?.substring(0, 15) + '...',
    fields: Object.keys(newUser),
    hasMetadata: !!newUser.metadata
  }, '[OIDC] Inserting new user');

  try {
    user = await usersResource.insert(newUser, { skipCache: true });
    logger.debug({
      userId: user.id?.substring(0, 15) + '...',
      email: user.email,
      created: true
    }, '[OIDC] User created successfully');
    return { user, created: true };
  } catch (insertErr) {
    logger.error({
      error: insertErr.message,
      errorType: insertErr.constructor.name,
      userId: newUser.id?.substring(0, 15) + '...',
      stack: insertErr.stack
    }, '[OIDC] User creation failed');
    throw insertErr;
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(tokenEndpoint, refreshToken, clientId, clientSecret) {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: getOidcFetchHeaders({
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    }),
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Create OIDC authentication handler and routes
 */
export async function createOIDCHandler(inputConfig, app, database, events = null) {
  const preset = applyProviderPreset('oidc', inputConfig || {});

  // Get or create resource (do this BEFORE config to allow early validation)
  const manager = new OIDCResourceManager(database, 'oidc', inputConfig || {});
  const usersResource = await manager.getOrCreateResource();

  logger.debug(`OIDC driver initialized with resource: ${usersResource.name}`);

  // Apply defaults
const config = {
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    cookieName: 'oidc_session',
    cookieMaxAge: 604800000, // 7 days (same as absolute duration)
    rollingDuration: 86400000, // 24 hours
    absoluteDuration: 604800000, // 7 days
    loginPath: '/auth/login',
    callbackPath: '/auth/callback',
    logoutPath: '/auth/logout',
    postLoginRedirect: '/',
    postLogoutRedirect: '/',
    idpLogout: true,
    autoCreateUser: true,
    userIdClaim: 'sub',
    fallbackIdClaims: ['email', 'preferred_username'],
    lookupFields: ['email', 'preferred_username'],
    autoRefreshTokens: true,
    refreshThreshold: 300000, // 5 minutes before expiry
    cookieSecure: process.env.NODE_ENV === 'production',
    cookieSameSite: 'Lax',
    allowInsecureCookies: ['development', 'local'].includes(process.env.NODE_ENV), // Allow SameSite=None on HTTP (dev only)
    defaultRole: 'user',
    defaultScopes: ['openid', 'profile', 'email'],
    discovery: { enabled: true, ...(preset.discovery || {}) },
    pkce: { enabled: true, method: 'S256', ...(preset.pkce || {}) },
    rateLimit: preset.rateLimit !== undefined ? preset.rateLimit : {
      enabled: true,
      windowMs: 60000, // 1 minute
      maxAttempts: 200,
      skipSuccessfulRequests: true
    },
    tokenFallbackSeconds: 3600, // Fallback when provider omits/zeros expires_in
    apiTokenField: undefined,
    detectApiTokenField: true,
    generateApiToken: true,
    apiTokenLength: 48,
    ...preset
  };

  const {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    cookieSecret,
    cookieName,
    cookieMaxAge,
    rollingDuration,
    absoluteDuration,
    loginPath,
    callbackPath,
    logoutPath,
    postLoginRedirect,
    postLogoutRedirect,
    idpLogout,
    autoCreateUser,
    autoRefreshTokens = true,           // 🎯 NEW: Enable implicit token refresh (default: true)
    refreshThreshold = 300000,          // 🎯 NEW: Refresh 5min before expiry (default: 300000ms)
    cookieSecure,
    cookieSameSite,
    apiTokenCookie,
    sessionStore                         // 🎯 NEW (v16.3.1): External session storage (Redis, etc.)
  } = config;

  // 🔐 Derive cryptographic keys using HKDF (RFC 5869)
  // Separates encryption and signing keys from single secret for better security
  const { current: derivedKeys } = deriveOidcKeys(cookieSecret);
  const signingKey = derivedKeys.signing;

  /**
   * WeakMap for caching session data per request
   * Prevents multiple decode operations for the same session
   * Auto garbage-collected when request completes
   */
  const sessionCache = new WeakMap();

  /**
   * Hook Executor - Composable lifecycle hooks for OIDC authentication
   */
  const hookExecutor = createHookExecutor(config, logger);

  /**
   * Generate secure random session ID
   */
  function generateSessionId() {
    return crypto.randomBytes(32).toString('base64url');
  }

  // OAuth2/OIDC endpoints (discovery first, provider-aware fallbacks)
  const issuerNoSlash = `${issuer || ''}`.replace(/\/$/, '');

  // Generic defaults (works for many providers / self-hosted IdPs)
  let authorizationEndpoint = `${issuerNoSlash}/oauth/authorize`;
  let tokenEndpoint = `${issuerNoSlash}/oauth/token`;
  let logoutEndpoint = `${issuerNoSlash}/oauth2/v2.0/logout`;

  // Azure AD / Entra ID: ensure correct v2.0 endpoints when discovery is unavailable
  // Correct pattern: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/{authorize|token|logout}
  if (/login\.microsoftonline\.com/i.test(issuerNoSlash)) {
    const tenantBase = issuerNoSlash.replace(/\/v2\.0$/i, '');
    authorizationEndpoint = `${tenantBase}/oauth2/v2.0/authorize`;
    tokenEndpoint = `${tenantBase}/oauth2/v2.0/token`;
    logoutEndpoint = `${tenantBase}/oauth2/v2.0/logout`;
  }

  /**
   * 🎯 NEW: Lazy discovery with context-based caching
   * Inspired by @hono/oidc-auth's getAuthorizationServer pattern
   *
   * Benefits:
   * - Thread-safe: cache per-request, no race conditions
   * - Efficient: discovery called only once per request
   * - Reusable: multiple calls in same request reuse cached endpoints
   *
   * @param {Context} c - Hono context (optional, for caching)
   * @returns {Promise<Object>} Endpoints object
   */
  async function getEndpoints(c = null) {
    // Check context cache first (if context available)
    if (c) {
      const cached = c.get('oidc_endpoints');
      if (cached) {
        return cached;
      }
    }

    // Discovery disabled - return defaults
    if (config.discovery?.enabled === false) {
      const endpoints = { authorizationEndpoint, tokenEndpoint, logoutEndpoint };
      if (c) c.set('oidc_endpoints', endpoints);
      return endpoints;
    }

    // Perform discovery
    try {
      const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
      if (res.ok) {
        const doc = await res.json();
        const endpoints = {
          authorizationEndpoint: doc.authorization_endpoint || authorizationEndpoint,
          tokenEndpoint: doc.token_endpoint || tokenEndpoint,
          logoutEndpoint: doc.end_session_endpoint || logoutEndpoint
        };

        // Cache in context for this request
        if (c) c.set('oidc_endpoints', endpoints);
        return endpoints;
      }
    } catch (e) {
      if (config.logLevel) {
        logger.warn('[OIDC] Discovery failed, using default endpoints:', e.message);
      }
    }

    // Fallback to defaults
    const endpoints = { authorizationEndpoint, tokenEndpoint, logoutEndpoint };
    if (c) c.set('oidc_endpoints', endpoints);
    return endpoints;
  }

  /**
   * Encode session data
   *
   * With sessionStore:
   * - Generates session ID
   * - Stores data in external store (Redis, etc.)
   * - Returns session ID (small, ~50 bytes)
   *
   * Without sessionStore (default):
   * - Signs data as JWT
   * - Returns JWT (may be large, 2-8KB)
   *
   * 🔐 Uses HKDF-derived signing key for better security
   */
  async function encodeSession(data) {
    if (sessionStore) {
      // External store mode: generate ID, store data
      const sessionId = generateSessionId();
      await sessionStore.set(sessionId, data, cookieMaxAge);
      return sessionId;
    } else {
      // Cookie-only mode: sign as JWT
      const jwt = await new SignJWT(data)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${Math.floor(cookieMaxAge / 1000)}s`)
        .sign(signingKey);
      return jwt;
    }
  }

  /**
   * Decode session data
   *
   * With sessionStore:
   * - Receives session ID
   * - Retrieves data from external store
   * - Returns session data or null
   *
   * Without sessionStore (default):
   * - Receives JWT
   * - Verifies and decodes JWT
   * - Returns payload or null
   *
   * 🔐 Uses HKDF-derived signing key for better security
   */
  async function decodeSession(idOrJwt) {
    if (sessionStore) {
      // External store mode: fetch by ID
      try {
        return await sessionStore.get(idOrJwt);
      } catch (err) {
        logger.error('[OIDC] Session store get error:', err.message);
        return null;
      }
    } else {
      // Cookie-only mode: verify JWT
      try {
        const { payload } = await jwtVerify(idOrJwt, signingKey);
        return payload;
      } catch (err) {
        return null;
      }
    }
  }

  /**
   * Get session with WeakMap caching (per-request)
   * Prevents multiple decode operations for the same request
   *
   * @param {Object} c - Hono context
   * @param {string} cookieName - Cookie name
   * @returns {Promise<Object|null>} Session data or null
   */
  async function getCachedSession(c, cookieName) {
    // Check cache first
    if (sessionCache.has(c)) {
      return sessionCache.get(c);
    }

    // Not in cache - decode session
    const sessionCookie = getChunkedCookie(c, cookieName);
    if (!sessionCookie) {
      return null;
    }

    const session = await decodeSession(sessionCookie);

    // Cache for this request (auto GC'd when request completes)
    if (session) {
      sessionCache.set(c, session);
    }

    return session;
  }

  /**
   * 🎯 NEW: Delete session cookie using dual-cookie deletion pattern
   * Ensures cookies are deleted across both host-only and domain-scoped configurations
   * Also handles chunked cookies (deletes all chunks)
   * Also destroys session in external store if using sessionStore
   * Inspired by @hono/oidc-auth
   *
   * @param {Context} c - Hono context
   * @param {string} name - Cookie name
   * @param {Object} options - Cookie options
   */
  async function deleteSessionCookie(c, name, options = {}, contextOptions = {}) {
    const path = options.path || '/';
    const domain = options.domain || config.cookieDomain;
    const cookieJar = contextOptions.cookieJar || getCookie(c) || {};
    const skipSessionDestroy = contextOptions.skipSessionDestroy || false;
    const sessionId = contextOptions.sessionId !== undefined
      ? contextOptions.sessionId
      : getChunkedCookie(c, name, cookieJar);

    // If using session store, destroy session data
    if (sessionStore && !skipSessionDestroy) {
      if (sessionId) {
        try {
          await sessionStore.destroy(sessionId);
        } catch (err) {
          logger.error('[OIDC] Session store destroy error:', err.message);
        }
      } else if (contextOptions.logMissing !== false) {
        logger.warn('[OIDC] Session cookie missing during deletion', {
          cookieName: name,
          cookies: Object.keys(cookieJar)
        });
      }
    }

    // Always delete host-only cookie (includes all chunks)
    deleteChunkedCookie(c, name, { path }, cookieJar);

    // Also delete domain-scoped cookie if configured
    // This fixes cross-subdomain logout issues
    if (domain) {
      deleteChunkedCookie(c, name, { path, domain }, cookieJar);
    }
  }

  /**
   * 🎯 NEW (Phase 3): Regenerate session ID
   * Security best practice: regenerate session ID when user privileges change
   * (e.g., user becomes admin, permissions updated, etc.)
   *
   * This prevents session fixation attacks by:
   * 1. Destroying the old session
   * 2. Creating a new session with a new ID
   * 3. Preserving session data
   *
   * @param {Context} c - Hono context
   * @param {Object} sessionData - Current session data to preserve
   * @returns {Promise<string>} New session ID/JWT
   */
  async function regenerateSession(c, sessionData) {
    const cookieName = config.cookieName || 'oidc_session';
    const cookieJar = getCookie(c) || {};
    const previousSessionToken = getChunkedCookie(c, cookieName, cookieJar);

    if (sessionStore) {
      if (previousSessionToken) {
        try {
          await sessionStore.destroy(previousSessionToken);
        } catch (err) {
          logger.error('[OIDC] Session store destroy error during regeneration:', err.message);
        }
      } else {
        logger.warn('[OIDC] regenerateSession - prior session cookie not found before rotation');
      }
    }

    // 1. Delete old session
    await deleteSessionCookie(c, cookieName, {
      path: '/',
      domain: config.cookieDomain
    }, {
      cookieJar,
      skipSessionDestroy: !!sessionStore,
      sessionId: previousSessionToken,
      logMissing: !sessionStore
    });

    // 2. Clear request cache (WeakMap)
    if (sessionCache.has(c)) {
      sessionCache.delete(c);
    }

    // 3. Create new session with new ID
    const newSessionIdOrJwt = await encodeSession(sessionData);

    // 4. Set new session cookie
    setChunkedCookie(c, cookieName, newSessionIdOrJwt, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      path: '/',
      ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
      maxAge: cookieMaxAge / 1000  // Convert ms to seconds
    });

    // 5. Update cache with new session
    sessionCache.set(c, sessionData);

    logger.debug('[OIDC] Session regenerated (new ID issued)');

    return newSessionIdOrJwt;
  }

  /**
   * 🎯 NEW: Refresh OAuth2 tokens using refresh_token
   * Inspired by @hono/oidc-auth's implicit refresh pattern
   *
   * @param {Context} c - Hono context
   * @param {string} refreshToken - OAuth2 refresh token
   * @returns {Promise<Object|null>} New tokens or null if refresh failed
   */
  async function refreshTokens(c, refreshToken) {
    if (!refreshToken) return null;

    try {
      const ep = await getEndpoints(c);
      const tokenBody = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      // Confidential client: use Basic auth
      const authHeader = clientSecret
        ? `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        : null;

      if (clientSecret) {
        // Authorization header
      } else {
        tokenBody.set('client_id', clientId);
      }

      const response = await fetch(ep.tokenEndpoint, {
        method: 'POST',
        headers: getOidcFetchHeaders(authHeader ? { 'Authorization': authHeader } : {}),
        body: tokenBody
      });

      if (!response.ok) {
        if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
          const error = await response.text();
          logger.warn('[OIDC] Token refresh failed:', error);
        }
        return null;
      }

      const tokens = await response.json();
      return tokens;

    } catch (err) {
      if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
        logger.warn('[OIDC] Token refresh error:', err.message);
      }
      return null;
    }
  }

  /**
   * Validate session (rolling + absolute duration)
   */
  function validateSessionDuration(session) {
    const now = Date.now();

    // Use explicit issued_at if provided; fall back to JWT iat (seconds → ms)
    const issuedMs = session.issued_at
      ? Number(session.issued_at)
      : (typeof session.iat === 'number' ? session.iat * 1000 : now);

    // Check absolute expiry (issued + absoluteDuration)
    if (issuedMs + absoluteDuration < now) {
      return { valid: false, reason: 'absolute_expired' };
    }

    // Check rolling expiry (last_activity + rollingDuration)
    const lastActivity = typeof session.last_activity === 'number' ? session.last_activity : issuedMs;
    if (lastActivity + rollingDuration < now) {
      return { valid: false, reason: 'rolling_expired' };
    }

    return { valid: true };
  }

  /**
   * Generate random state for CSRF protection
   */
  function generateState() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * 🎯 NEW: Reconstruct external URL for reverse proxy scenarios
   * Inspired by @hono/oidc-auth's OIDC_AUTH_EXTERNAL_URL pattern
   *
   * @param {string} externalUrl - External base URL (e.g., 'https://api.example.com')
   * @param {string} originalUrl - Original request URL
   * @returns {string} Reconstructed URL
   */
  function reconstructExternalUrl(externalUrl, originalUrl) {
    if (!externalUrl) return originalUrl;

    try {
      const external = new URL(externalUrl);
      const original = new URL(originalUrl);

      // Preserve pathname, search, and hash from original request
      external.pathname = `${external.pathname.replace(/\/$/, '')}${original.pathname}`;
      external.search = original.search;
      external.hash = original.hash;

      return external.toString();
    } catch (err) {
      // Fallback to original URL if parsing fails
      return originalUrl;
    }
  }

  /** Generate cryptographically random string (base64url) */
  function randomBase64Url(bytes = 32) {
    const arr = new Uint8Array(bytes);
    if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
      throw new Error('WebCrypto not available: getRandomValues missing');
    }
    globalThis.crypto.getRandomValues(arr);
    const b64 = Buffer.from(arr).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64;
  }

  /** Create PKCE code challenge */
  async function createPkcePair() {
    const verifier = randomBase64Url(48); // ~64 chars base64url
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      throw new Error('WebCrypto not available: subtle.digest missing');
    }
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    const challenge = Buffer.from(new Uint8Array(digest)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { verifier, challenge };
  }

  /**
   * Decode JWT without verification (for id_token claims)
   */
  function decodeIdToken(idToken) {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) return null;
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload);
    } catch (err) {
      return null;
    }
  }

  /**
   * Resolve effective expires_in seconds for access tokens.
   * Falls back to ID token exp or config default when provider responses are invalid.
   */
  function resolveExpiresInSeconds(tokens = {}, fallbackClaims = null) {
    const raw = Number(tokens?.expires_in);

    if (Number.isFinite(raw) && raw > 0) {
      return { seconds: raw, source: 'provider' };
    }

    if (fallbackClaims?.exp) {
      const claimExp = Number(fallbackClaims.exp);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const delta = claimExp - nowSeconds;

      if (Number.isFinite(delta) && delta > 0) {
        return { seconds: delta, source: 'id_token' };
      }
    }

    const fallbackFromConfig = Number(config.tokenFallbackSeconds);
    const fallbackSeconds = Number.isFinite(fallbackFromConfig) && fallbackFromConfig > 0
      ? Math.floor(fallbackFromConfig)
      : 3600;

    return { seconds: fallbackSeconds, source: 'config' };
  }

  // ==================== ROUTES ====================

  // Create rate limiter if enabled
  let rateLimiter = null;
  if (config.rateLimit?.enabled) {
    rateLimiter = createAuthDriverRateLimiter('oidc', config.rateLimit);
  }

  /**
   * LOGIN Route
   */
  app.get(loginPath, async (c) => {
    try {
    const state = generateState();

    // 🎯 NEW: Continue URL pattern - preserve original destination after login
    // Supports reverse proxy scenarios via externalUrl config
    const returnToParam = c.req.query('returnTo');
    const continueUrl = returnToParam
      ? (config.externalUrl
          ? reconstructExternalUrl(config.externalUrl, new URL(returnToParam, c.req.url).toString())
          : returnToParam)
      : (config.externalUrl
          ? reconstructExternalUrl(config.externalUrl, c.req.url)
          : postLoginRedirect);

    const nonce = generateState();

    let codeVerifier = null;
    let codeChallenge = null;
    const pkceEnabled = config.pkce?.enabled !== false;

    if (pkceEnabled) {
      try {
        const pair = await createPkcePair();
        codeVerifier = pair.verifier;
        codeChallenge = pair.challenge;
      } catch (e) {
        logger.warn({ error: e.message }, '[OIDC] PKCE generation failed');
      }
    }

    // Store state and continueUrl in short-lived cookie
    const stateJWT = await encodeSession({
      state,
      returnTo: continueUrl,  // Continue URL for post-login redirect
      nonce,
      code_verifier: codeVerifier,
      type: 'csrf',
      expires: Date.now() + 600000
    });
    // 🎯 CRITICAL: State cookie configuration for OAuth2 redirects
    // - HTTPS: use SameSite=None + Secure=true (cross-site redirects work)
    // - HTTP (localhost dev): use SameSite=Lax (browsers will block cross-site)
    // - HTTP + allowInsecureCookies: store state server-side, use query param (less secure, dev only)
    const isSecure = config.baseURL && config.baseURL.startsWith('https://');
    const useServerSideState = !isSecure && config.allowInsecureCookies;

    // 🪵 Log login initiation WITH state storage mode
    logger.info({
      state: state.substring(0, 8) + '...',
      hasPKCE: !!codeVerifier,
      hasReturnTo: !!returnToParam,
      returnTo: returnToParam,
      continueUrl,
      scopes: scopes.join(' '),
      // 🔍 State storage debug info
      stateStorage: useServerSideState ? 'server-side (dev)' : 'cookie',
      isSecure,
      baseURL: config.baseURL,
      allowInsecureCookies: config.allowInsecureCookies,
      nodeEnv: process.env.NODE_ENV,
      cookieSettings: useServerSideState ? 'n/a' : {
        sameSite: isSecure ? 'None' : 'Lax',
        secure: isSecure
      }
    }, '[OIDC] 🚀 Login flow initiated');

    let stateId = null;
    if (useServerSideState) {
      // ⚠️ Development only: Store state server-side to bypass cookie blocking
      stateId = idGenerator();
      if (!global.__oidc_state_store) global.__oidc_state_store = new Map();
      if (!global.__oidc_state_mapping) global.__oidc_state_mapping = new Map();

      // Store the state data by stateId
      global.__oidc_state_store.set(stateId, {
        data: stateJWT,
        expires: Date.now() + 600000  // 10 minutes
      });

      // Create mapping from state -> stateId (Azure AD preserves state parameter)
      global.__oidc_state_mapping.set(state, stateId);

      logger.warn({
        baseURL: config.baseURL,
        stateStorage: 'server-side',
        state: state.substring(0, 8) + '...',
        stateId: stateId.substring(0, 8) + '...'
      }, '[OIDC] ⚠️ DEV MODE: Using server-side state storage (cookies blocked on HTTP cross-site redirect). Use HTTPS in production!');
    } else {
      // Production: Use secure cookie
      setCookie(c, `${cookieName}_state`, stateJWT, {
        path: '/',
        httpOnly: true,
        maxAge: 600,
        sameSite: isSecure ? 'None' : 'Lax',
        secure: isSecure
      });
    }

    logger.debug({
      cookieName: `${cookieName}_state`,
      sameSite: isSecure ? 'None' : 'Lax',
      secure: isSecure,
      isSecure,
      baseURL: config.baseURL,
      redirectUri,
      cookieValue: stateJWT.substring(0, 20) + '...'
    }, '[OIDC] Login - State cookie set');

    // Build authorization URL
    // Note: state parameter is sent as-is (mapping stored server-side)
    const stateParam = state;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state: stateParam,
      nonce
    });

    if (codeChallenge) {
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', codeChallenge);
    }

    const ep = await getEndpoints();
    const authUrl = new URL(ep.authorizationEndpoint);
    // Copy all params to URL
    params.forEach((value, key) => {
      authUrl.searchParams.set(key, value);
    });

    // 🎯 NEW: Apply provider-specific quirks (Google, Azure, Auth0, GitHub, Slack, GitLab)
    // Automatically adds required parameters based on issuer URL
    applyProviderQuirks(authUrl, issuer, config);

    if (stateId) {
      logger.debug({
        stateId: stateId.substring(0, 8) + '...',
        stateParam: stateParam.substring(0, 20) + '...'
      }, '[OIDC] StateId encoded in state parameter for server-side retrieval');
    }

    return c.redirect(authUrl.toString(), 302);
    } catch (error) {
      logger.error({
        error: error.message,
        stack: error.stack,
        returnTo: c.req.query('returnTo'),
        baseURL: config.baseURL,
        issuer: config.issuer
      }, '[OIDC] ❌ Login handler exception');

      return c.json({
        error: 'login_failed',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, 500);
    }
  });

  /**
   * CALLBACK Route (with rate limiting)
   */
  const callbackHandler = async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');
    const errorDescription = c.req.query('error_description');

    // 🪵 Log callback received
    logger.info({
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      host: c.req.header('host')
    }, '[OIDC] Callback received');

    // 🪵 Debug: detailed cookie information
    const cookieHeader = c.req.header('cookie');
    const allCookies = cookieHeader ? cookieHeader.split(';').map(c => c.trim().split('=')[0]) : [];

    logger.debug({
      hasCookieHeader: !!cookieHeader,
      cookieCount: allCookies.length,
      cookieNames: allCookies
    }, '[OIDC] Callback - cookies received');

    // Log IdP error if present
    if (error) {
      logger.warn({
        error,
        errorDescription,
        state: state?.substring(0, 8) + '...'
      }, '[OIDC] IdP returned error');
    }

    // 🪵 Debug logging - full context
    logger.debug({
      cookieName: `${cookieName}_state`,
      requestUrl: c.req.url,
      requestHost: c.req.header('host'),
      redirectUri,
      hasCookieHeader: !!c.req.header('cookie')
    }, '[OIDC] Callback context');

    // Validate CSRF state - try cookie first, fallback to server-side store (dev mode)
    let stateCookie = getCookie(c, `${cookieName}_state`);
    let stateSource = 'cookie';
    let extractedStateId = null;

    // Fallback: Check server-side state store (dev mode)
    if (!stateCookie && state) {
      const stateParts = state.split(':');
      const stateValue = stateParts[0];
      const stateIdFromParam = stateParts.length > 1 ? stateParts[1] : null;

      // Try direct stateId from URL (format: state:stateId)
      if (stateIdFromParam && global.__oidc_state_store) {
        const stored = global.__oidc_state_store.get(stateIdFromParam);
        if (stored && stored.expires > Date.now()) {
          stateCookie = stored.data;
          stateSource = 'server-side';
          extractedStateId = stateIdFromParam;

          // Clean up used state
          global.__oidc_state_store.delete(stateIdFromParam);

          // Also try to clean up the original mapping if possible
          const stateDataForMapping = await decodeSession(stateCookie);
          if (stateDataForMapping && stateDataForMapping.state && global.__oidc_state_mapping) {
            global.__oidc_state_mapping.delete(stateDataForMapping.state);
          }

          logger.debug({
            state: stateValue.substring(0, 8) + '...',
            stateId: extractedStateId.substring(0, 8) + '...',
            stateSource: 'server-side (direct)',
            storeSize: global.__oidc_state_store.size,
            mappingSize: global.__oidc_state_mapping?.size || 0
          }, '[OIDC] Retrieved state from server-side store (dev mode fallback)');
        }
      }

      // If no stateId in URL, try using the state->stateId mapping
      // (This is the normal case for OAuth providers that preserve the state parameter)
      if (!stateCookie && global.__oidc_state_mapping && global.__oidc_state_store) {
        const mappedStateId = global.__oidc_state_mapping.get(stateValue);
        if (mappedStateId) {
          const stored = global.__oidc_state_store.get(mappedStateId);
          if (stored && stored.expires > Date.now()) {
            stateCookie = stored.data;
            stateSource = 'server-side';
            extractedStateId = mappedStateId;

            // Clean up used state
            global.__oidc_state_store.delete(mappedStateId);
            global.__oidc_state_mapping.delete(stateValue);

            logger.debug({
              state: stateValue.substring(0, 8) + '...',
              stateId: extractedStateId.substring(0, 8) + '...',
              stateSource: 'server-side (mapping)',
              storeSize: global.__oidc_state_store.size,
              mappingSize: global.__oidc_state_mapping.size
            }, '[OIDC] Retrieved state from server-side store via mapping (dev mode)');
          }
        }
      }
    }

    // 🪵 Log state cookie validation
    logger.debug({
      stateCookiePresent: !!stateCookie,
      stateCookieName: `${cookieName}_state`,
      stateQueryParamPresent: !!state,
      stateSource
    }, '[OIDC] State validation');

    if (!stateCookie) {
      logger.error({
        expectedCookieName: `${cookieName}_state`,
        hasCookieHeader: !!c.req.header('cookie'),
        hasStateIdInParam: !!extractedStateId,
        stateIdFound: extractedStateId ? !!global.__oidc_state_store?.has(extractedStateId) : false,
        storeSize: global.__oidc_state_store?.size || 0,
        redirectUri,
        host: c.req.header('host')
      }, '[OIDC] State cookie/store missing (CSRF protection failed)');

      return c.json({
        error: 'Missing state cookie (CSRF protection)',
        hint: 'Cookies blocked on HTTP cross-site redirect. Solution: Use HTTPS or set allowInsecureCookies: true in OIDC config (dev only).'
      }, 400);
    }

    const stateData = await decodeSession(stateCookie);

    // Extract actual state value (remove stateId suffix if present)
    // State format in dev mode: "actualState:stateId"
    // State format in cookie mode: "actualState"
    const statePartsForComparison = state?.split(':');
    const actualStateValue = statePartsForComparison && statePartsForComparison.length >= 1
      ? statePartsForComparison[0]
      : state;

    if (!stateData || stateData.state !== actualStateValue) {
      logger.error({
        stateDecoded: !!stateData,
        stateMatch: stateData?.state === actualStateValue,
        stateFromParam: actualStateValue?.substring(0, 8) + '...',
        stateFromCookie: stateData?.state?.substring(0, 8) + '...',
        stateSource
      }, '[OIDC] State mismatch (CSRF protection failed)');

      return c.json({ error: 'Invalid state (CSRF protection)' }, 400);
    }

    logger.debug('[OIDC] State validation successful');

    // Clear state cookie (dual-cookie deletion)
    await deleteSessionCookie(c, `${cookieName}_state`, { path: '/' });

    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400);
    }

    // Exchange code for tokens
    try {
      // Retrieve PKCE data and nonce
      const codeVerifier = stateData.code_verifier || null;
      const ep = await getEndpoints(c);  // With context cache

      // 🪵 Log token exchange attempt
      logger.info({
        hasPKCE: !!codeVerifier,
        hasCodeVerifier: !!codeVerifier,
        tokenEndpoint: ep.tokenEndpoint,
        isConfidentialClient: !!clientSecret
      }, '[OIDC] Exchanging code for tokens');

      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {})
      });

      // Confidential client: use Basic auth; Public client (no secret): send client_id in body
      const authHeader = clientSecret
        ? `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        : null;

      if (!clientSecret) {
        tokenBody.set('client_id', clientId);
      }

      const tokenResponse = await fetch(ep.tokenEndpoint, {
        method: 'POST',
        headers: getOidcFetchHeaders(authHeader ? { 'Authorization': authHeader } : {}),
        body: tokenBody
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        logger.error({
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: error.substring(0, 500) // Truncate for security
        }, '[OIDC] Token exchange failed');

        return c.json({ error: 'Failed to exchange code for tokens' }, 500);
      }

      const tokens = await tokenResponse.json();

      // 🪵 Log token exchange success
      logger.info({
        hasAccessToken: !!tokens.access_token,
        hasIdToken: !!tokens.id_token,
        hasRefreshToken: !!tokens.refresh_token,
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in
      }, '[OIDC] Token exchange successful');

      // ⚠️ FORCED DEBUG - Token response before validation
      process.stdout.write('\n\n========== TOKEN RESPONSE ==========\n');
      process.stdout.write('Has access_token: ' + !!tokens.access_token + '\n');
      process.stdout.write('Has id_token: ' + !!tokens.id_token + '\n');
      process.stdout.write('Has refresh_token: ' + !!tokens.refresh_token + '\n');
      process.stdout.write('Token type: ' + tokens.token_type + '\n');
      process.stdout.write('Expires in: ' + tokens.expires_in + '\n');
      process.stdout.write('====================================\n\n');

      // Validate token response (Phase 3)
      const tokenValidation = validateTokenResponse(tokens, config);

      // ⚠️ FORCED DEBUG - Validation result
      process.stdout.write('\n\n========== TOKEN VALIDATION ==========\n');
      process.stdout.write('Valid: ' + tokenValidation.valid + '\n');
      process.stdout.write('Errors: ' + JSON.stringify(tokenValidation.errors, null, 2) + '\n');
      process.stdout.write('======================================\n\n');

      if (!tokenValidation.valid) {
        if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
          logger.error('[OIDC] Token response validation failed:', tokenValidation.errors);
        }
        const errorType = getErrorType(tokenValidation.errors);
        const errorDetails = getErrorDetails(errorType, tokenValidation.errors);

        // Return HTML error page if browser request, JSON otherwise
        const acceptsHtml = c.req.header('accept')?.includes('text/html');
        if (acceptsHtml && config.errorPage !== false) {
          const html = generateErrorPage(errorDetails, {
            loginUrl: `/auth/login`,
            showTechnicalDetails: c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace' || false
          });
          return c.html(html, 401);
        }
        return c.json(generateErrorJSON(errorDetails, 401), 401);
      }

      // Decode id_token claims
      const idTokenClaims = decodeIdToken(tokens.id_token);

      // ⚠️ FORCED DEBUG - Must appear!
      process.stdout.write('\n\n========== ID TOKEN DECODED ==========\n');
      process.stdout.write('Success: ' + !!idTokenClaims + '\n');
      process.stdout.write('Claims: ' + (idTokenClaims ? JSON.stringify(idTokenClaims, null, 2) : 'NULL') + '\n');
      process.stdout.write('=====================================\n\n');

      // Resolve effective token expiry (handles providers that return expires_in: 0)
      const expiresInfo = resolveExpiresInSeconds(tokens, idTokenClaims);

      if (expiresInfo.source !== 'provider') {
        logger.warn({
          reportedExpiresIn: tokens?.expires_in,
          fallbackSeconds: expiresInfo.seconds,
          fallbackSource: expiresInfo.source
        }, '[OIDC] Token expiry fallback applied');
      }

      // 🪵 Log ID token decode result
      logger.debug({
        success: !!idTokenClaims,
        claimsCount: idTokenClaims ? Object.keys(idTokenClaims).length : 0,
        sub: idTokenClaims?.sub?.substring(0, 15) + '...',
        email: idTokenClaims?.email,
        name: idTokenClaims?.name
      }, '[OIDC] ID token decoded');

      process.stdout.write('\n========== EFFECTIVE TOKEN EXPIRY ==========\n');
      process.stdout.write(`expires_in: ${tokens.expires_in} => resolved: ${expiresInfo.seconds}s (source: ${expiresInfo.source})\n`);
      process.stdout.write('===========================================\n\n');

      if (!idTokenClaims) {
        logger.error('[OIDC] Failed to decode ID token - token is malformed');
        const errorDetails = getErrorDetails(ErrorTypes.TOKEN_INVALID, ['Failed to decode ID token']);
        const acceptsHtml = c.req.header('accept')?.includes('text/html');
        if (acceptsHtml && config.errorPage !== false) {
          const html = generateErrorPage(errorDetails, {
            loginUrl: `/auth/login`,
            showTechnicalDetails: c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace' || false
          });
          return c.html(html, 401);
        }
        return c.json(generateErrorJSON(errorDetails, 401), 401);
      }

      // Validate ID token claims (Phase 3)
      const idTokenValidation = validateIdToken(idTokenClaims, config, {
        nonce: stateData.nonce,
        clockTolerance: 60,  // 60 seconds
        maxAge: 86400        // 24 hours
      });

      // ⚠️ FORCED DEBUG - Validation result
      console.error('\n\n========== ID TOKEN VALIDATION ==========');
      console.error('Valid:', idTokenValidation.valid);
      console.error('Errors:', JSON.stringify(idTokenValidation.errors, null, 2));
      console.error('========================================\n\n');

      if (!idTokenValidation.valid) {
        logger.error({
          errors: idTokenValidation.errors,
          claims: {
            iss: idTokenClaims.iss,
            aud: idTokenClaims.aud,
            exp: idTokenClaims.exp,
            sub: idTokenClaims.sub?.substring(0, 15) + '...'
          }
        }, '[OIDC] ID token validation failed');
        const errorType = getErrorType(idTokenValidation.errors);
        const errorDetails = getErrorDetails(errorType, idTokenValidation.errors);

        const acceptsHtml = c.req.header('accept')?.includes('text/html');
        if (acceptsHtml && config.errorPage !== false) {
          const html = generateErrorPage(errorDetails, {
            loginUrl: `/auth/login`,
            showTechnicalDetails: c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace' || false
          });
          return c.html(html, 401);
        }
        return c.json(generateErrorJSON(errorDetails, 401), 401);
      }

      // Auto-create/update user
      let user = null;
      let userCreated = false;
      if (usersResource) {
        try {
          const result = await getOrCreateUser(usersResource, idTokenClaims, config, c, hookExecutor);
          user = result.user;
          userCreated = result.created;

          if (!user) {
            return c.json({
              error: 'User not provisioned',
              message: 'User does not exist in configured auth resource'
            }, 403);
          }

          // Emit user events
          if (events) {
            if (userCreated) {
              events.emitUserEvent('created', {
                user: { id: user.id, email: user.email, name: user.name },
                source: 'oidc',
                provider: config.issuer
              });
            }

            events.emitUserEvent('login', {
              user: { id: user.id, email: user.email, name: user.name },
              source: 'oidc',
              provider: config.issuer,
              newUser: userCreated
            });
          }

          // Call onUserAuthenticated hook if configured
          if (config.onUserAuthenticated && typeof config.onUserAuthenticated === 'function') {
            try {
              await config.onUserAuthenticated({
                user,
                created: userCreated,
                claims: idTokenClaims,
                tokens: {
                  access_token: tokens.access_token,
                  id_token: tokens.id_token,
                  refresh_token: tokens.refresh_token
                },
                context: c  // 🔥 Pass Hono context for cookie/header manipulation
              });
            } catch (hookErr) {
              if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
                logger.error('[OIDC] onUserAuthenticated hook failed:', hookErr);
              }
              // Don't block authentication if hook fails
            }
          }
        } catch (err) {
          // 🪵 Always log user creation/update errors (critical)
          logger.error({
            error: err.message,
            errorType: err.constructor.name,
            stack: err.stack,
            claims: {
              sub: idTokenClaims?.sub?.substring(0, 15) + '...',
              email: idTokenClaims?.email,
              name: idTokenClaims?.name
            }
          }, '[OIDC] Failed to create/update user');

          // Continue without user (will use token claims only)
        }
      }

      // 🚧 DEBUG: Log token sizes to help diagnose cookie overflow issues
      if (config.verbose) {
        const accessTokenBytes = Buffer.byteLength(tokens.access_token || '', 'utf8');
        const idTokenBytes = Buffer.byteLength(tokens.id_token || '', 'utf8');
        const refreshTokenBytes = Buffer.byteLength(tokens.refresh_token || '', 'utf8');
        logger.info('\n========== TOKEN SIZE DEBUG ==========');
        logger.info('access_token bytes: %d', accessTokenBytes);
        logger.info('id_token bytes: %d', idTokenBytes);
        logger.info('refresh_token bytes: %d', refreshTokenBytes);
        logger.info('TOTAL tokens bytes: %d', accessTokenBytes + idTokenBytes + refreshTokenBytes);
        logger.info('======================================\n');
      }

      // Optional: issue JWT for API (Bearer) and set cookie fallback
      try {
        const jwtSecret = config.jwtSecret || cookieSecret; // reuse cookieSecret if no explicit secret
        if (jwtSecret && user && user.id) {
          const { createToken } = await import('./jwt-auth.js');
          const jwtPayload = { userId: user.id, scopes: user.scopes || [] };
          const jwtToken = createToken(jwtPayload, jwtSecret, '7d');
          const jwtCookieName = cookiePrefix ? `${cookiePrefix}_jwt` : 'jwt';
          setCookie(c, jwtCookieName, jwtToken, {
            path: '/',
            httpOnly: true,
            sameSite: cookieSameSite,
            secure: cookieSecure,
            maxAge: 7 * 24 * 60 * 60
          });
        }
      } catch (__) {
        // non-fatal
      }

      // Create session with user data
      // 🎯 MINIMAL COOKIE STRATEGY: Only essential data for auth (user details in database)
      // Cookie limit: 4096 bytes - tokens alone exceed this (access_token ~2-3KB, id_token ~1-2KB)
      // Solution: Store only id/email/scopes in cookie, full user data in database resource
      const now = Date.now();
      const sessionData = {
        // Session lifecycle
        issued_at: now,                                // Absolute session start (ms)
        expires_at: now + (expiresInfo.seconds * 1000),  // Token expiry hint (ms)
        last_activity: now,                            // For rolling session duration (ms)
        token_expires_in: expiresInfo.seconds,         // Effective expires_in (seconds)
        token_expiry_source: expiresInfo.source,

        // 🎯 NEW: Refresh token for implicit refresh (if enabled and available)
        // Only stored if autoRefreshTokens = true to keep cookie size minimal
        ...(autoRefreshTokens && tokens.refresh_token ? {
          refresh_token: tokens.refresh_token
        } : {}),

        // Minimal user data (authorization only, ~200-400 bytes)
        user: user ? {
          id: user.id,                      // For user lookup in database
          email: user.email,                // For display/audit
          name: user.name,                  // For display in UI
          role: user.role,                  // For basic authorization
          scopes: user.scopes,              // For scope-based authorization
          apiToken: user.apiToken,          // For API Key authentication (frontend needs this)
          costCenterId: user.costCenterId,  // For cost center filtering/grouping
          costCenterName: user.costCenterName  // For cost center display
        } : {
          id: idTokenClaims.sub,
          email: idTokenClaims.email,
          role: 'user',
          scopes: scopes,
          isVirtual: true  // Flag: user not in database (claims-only mode)
        }
      };

      const sessionJWT = await encodeSession(sessionData);

      // 🚧 DEBUG: Log session cookie size to help diagnose overflow issues
      if (config.verbose) {
        const sessionDataBytes = Buffer.byteLength(JSON.stringify(sessionData), 'utf8');
        const sessionJwtBytes = Buffer.byteLength(sessionJWT, 'utf8');
        const cookieNameBytes = Buffer.byteLength(cookieName, 'utf8');
        const approximateAttributesBytes = 80; // A generous estimate for Path, HttpOnly, Secure, SameSite, Max-Age
        const totalCookieBytes = cookieNameBytes + sessionJwtBytes + approximateAttributesBytes;

        logger.info('\n========== SESSION COOKIE SIZE ==========');
        logger.info('Session data (stringified) bytes: %d', sessionDataBytes);
        logger.info('Session JWT bytes: %d', sessionJwtBytes);
        logger.info('Cookie name bytes: %d', cookieNameBytes);
        logger.info('Cookie attributes ~bytes: %d', approximateAttributesBytes);
        logger.info('TOTAL cookie bytes (name + JWT + attributes): %d', totalCookieBytes);
        logger.info('Browser limit: 4096 bytes');
        if (totalCookieBytes > 4000) {
          logger.warn('[OIDC] ⚠️ WARNING: Session cookie size is approaching the 4KB browser limit. Consider reducing data stored in the session.');
        }
        logger.info('==========================================\n');
      }

      // Set session cookie (with automatic chunking if > 4KB)
      logger.info('🍪 [OIDC] Setting session cookie...');
      try {
        setChunkedCookie(c, cookieName, sessionJWT, {
          path: '/',
          httpOnly: true,
          maxAge: Math.floor(cookieMaxAge / 1000),
          sameSite: cookieSameSite,
          secure: cookieSecure
        });
        logger.info('✅ [OIDC] Session cookie set successfully');

        // Verify cookie was set by checking response headers
        const setCookieHeaders = c.res.headers.getSetCookie?.() || [];
        logger.info('🔍 [OIDC] Set-Cookie headers count:', setCookieHeaders.length);
        if (setCookieHeaders.length > 0) {
          setCookieHeaders.forEach((header, idx) => {
            const cookieName = header.split('=')[0];
            const cookieLength = header.length;
            logger.info(`   [${idx + 1}] ${cookieName} (${cookieLength} bytes)`);
          });
        } else {
          logger.warn('⚠️  [OIDC] WARNING: No Set-Cookie headers found in response!');
        }
      } catch (cookieErr) {
        logger.error('❌ [OIDC] CRITICAL: Failed to set session cookie!', cookieErr);
        throw new Error(`Failed to set session cookie: ${cookieErr.message}`);
      }

      // Create cookie helpers for hooks
      const auth = createCookieHelpers(c, config);

      // Store sessionId for helper access
      c.set('sessionId', sessionJWT.split('.')[1]); // JWT payload part
      c.set('sessionData', sessionData);

      // Execute afterSessionCreate hooks
      logger.info('🪝 [OIDC] Executing afterSessionCreate hooks...');
      try {
        await hookExecutor.executeHooks('afterSessionCreate', {
          user,
          sessionId: sessionJWT,
          sessionData,
          created: userCreated,
          context: c,
          auth
        });
        logger.info('✅ [OIDC] Hooks executed successfully');
      } catch (hooksErr) {
        logger.error('❌ [OIDC] ERROR in afterSessionCreate hooks:', hooksErr);
        // Continue execution - hooks shouldn't block login
      }

      // Final verification before redirect
      logger.info('\n========== PRE-REDIRECT VERIFICATION ==========');
      logger.info('🔍 Verifying session cookie before redirect...');
      const finalSetCookieHeaders = c.res.headers.getSetCookie?.() || [];
      logger.info('📋 Total Set-Cookie headers:', finalSetCookieHeaders.length);
      const hasSessionCookie = finalSetCookieHeaders.some(h => h.startsWith(cookieName));
      logger.info('✓ Session cookie present:', hasSessionCookie);
      if (!hasSessionCookie) {
        logger.error('❌ CRITICAL: Session cookie NOT in response headers!');
        logger.error('   This will cause login loop - user will not be authenticated');
      }
      logger.info('===============================================\n');

      // Redirect to original destination or default post-login page
      const redirectUrl = stateData.returnTo || postLoginRedirect;
      logger.info('🔀 [OIDC] Redirecting to:', redirectUrl);
      return c.redirect(redirectUrl, 302);

    } catch (err) {
      if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
        logger.error('[OIDC] Error during token exchange:', err);
      }
      return c.json({ error: 'Authentication failed' }, 500);
    }
  };

  // Register callback route with optional rate limiting
  if (rateLimiter) {
    app.get(callbackPath, rateLimiter, callbackHandler);
  } else {
    app.get(callbackPath, callbackHandler);
  }

  /**
   * LOGOUT Route
   */
  app.get(logoutPath, async (c) => {
    const sessionCookie = getChunkedCookie(c, cookieName);
    let idToken = null;

    if (sessionCookie) {
      const session = await decodeSession(sessionCookie);
      idToken = session?.id_token;
    }

    // 🪵 Log logout initiation
    logger.info({
      hasSession: !!sessionCookie,
      hasIdToken: !!idToken,
      idpLogoutEnabled: idpLogout,
      willRedirectToIdP: idpLogout && !!idToken
    }, '[OIDC] Logout initiated');

    // Clear session cookie (dual-cookie deletion + all chunks)
    await deleteSessionCookie(c, cookieName, { path: '/' });

    // IdP logout (Azure AD/Entra compatible)
    if (idpLogout && idToken) {
      const ep = await getEndpoints(c);  // With context cache
      const params = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: `${postLogoutRedirect}`
      });

      logger.debug({
        logoutEndpoint: ep.logoutEndpoint,
        postLogoutRedirectUri: postLogoutRedirect
      }, '[OIDC] Redirecting to IdP logout');

      return c.redirect(`${ep.logoutEndpoint}?${params.toString()}`, 302);
    }

    logger.debug({ redirectTo: postLogoutRedirect }, '[OIDC] Local logout, redirecting');
    return c.redirect(postLogoutRedirect, 302);
  });

  // ==================== MIDDLEWARE ====================

  /**
   * Simple glob pattern matcher (supports * and **)
   */
  function matchPath(path, pattern) {
    // Exact match
    if (pattern === path) return true;

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '___GLOBSTAR___') // Temporary placeholder
      .replace(/\*/g, '[^/]*')             // * matches anything except /
      .replace(/___GLOBSTAR___/g, '.*')    // ** matches everything including /
      .replace(/\//g, '\\/')               // Escape forward slashes
      + '$';                                // End of string

    const regex = new RegExp('^' + regexPattern);
    return regex.test(path);
  }

  /**
   * Authentication middleware
   */
  const middleware = async (c, next) => {
    // Check if this path should be protected by OIDC
    const protectedPaths = config.protectedPaths || [];
    const currentPath = c.req.path;

    // Skip auth routes (login, callback, logout)
    const isAuthPath = currentPath === loginPath || currentPath === callbackPath || currentPath === logoutPath;

    // 🪵 Log middleware check
    logger.debug({
      path: currentPath,
      isAuthPath,
      hasProtectedPaths: protectedPaths.length > 0
    }, '[OIDC] Middleware check');

    if (isAuthPath) {
      return await next();
    }

    // If protectedPaths is configured, only enforce OIDC on matching paths
    if (protectedPaths.length > 0) {
      const isProtected = protectedPaths.some(pattern => matchPath(currentPath, pattern));

      logger.debug({
        path: currentPath,
        isProtected,
        protectedPatterns: protectedPaths
      }, '[OIDC] Protected path check');

      if (!isProtected) {
        // Not a protected path, skip OIDC check (allows other auth methods)
        return await next();
      }
    }

    const sessionCookie = getChunkedCookie(c, cookieName);

    // 🪵 Log session cookie presence with all cookie names
    const allCookies = c.req.header('cookie');
    const cookieNames = allCookies ? allCookies.split(';').map(c => c.trim().split('=')[0]) : [];

    logger.debug({
      hasSessionCookie: !!sessionCookie,
      cookieName,
      cookieLength: sessionCookie?.length,
      allCookieNames: cookieNames,
      cookieCount: cookieNames.length
    }, '[OIDC] Session cookie check');

    if (!sessionCookie) {
      // No session - redirect to login or return 401
      // Content negotiation: check if client expects HTML
      const acceptHeader = c.req.header('accept') || '';
      const acceptsHtml = acceptHeader.includes('text/html');

      logger.debug({
        hasSessionCookie: false,
        acceptsHtml,
        willRedirect: acceptsHtml,
        path: currentPath
      }, '[OIDC] No session cookie found, redirecting to login');

      if (acceptsHtml) {
        // 🎯 NEW: Browser request - redirect to login with full continue URL
        // Preserves query strings, hash fragments, and external URL reconstruction
        const continueUrl = config.externalUrl
          ? reconstructExternalUrl(config.externalUrl, c.req.url)
          : c.req.url;
        const returnTo = encodeURIComponent(continueUrl);
        return c.redirect(`${loginPath}?returnTo=${returnTo}`, 302);
      } else {
        // API request - return JSON 401
        const response = unauthorized('Authentication required');
        return c.json(response, response._status);
      }
    }

    const session = await decodeSession(sessionCookie);

    logger.debug({
      sessionDecoded: !!session,
      sessionValid: session ? true : false
    }, '[OIDC] Session decode result');

    if (!session) {
      // Invalid or tampered cookie: clear and proceed to unauthorized handling (dual-cookie deletion)
      logger.warn({
        cookieLength: sessionCookie?.length,
        cookieName
      }, '[OIDC] Session decode failed - invalid or tampered cookie');

      await deleteSessionCookie(c, cookieName, { path: '/' });
      return await next();
    }

    // Validate session duration
    const validation = validateSessionDuration(session);

    // 🪵 Log session validation
    logger.debug({
      valid: validation.valid,
      reason: validation.reason || 'valid'
    }, '[OIDC] Session validation');

    if (!validation.valid) {
      logger.warn({
        reason: validation.reason,
        userId: session.user?.id?.substring(0, 15) + '...'
      }, '[OIDC] Session expired');

      // Session expired, clear cookie (dual-cookie deletion)
      await deleteSessionCookie(c, cookieName, { path: '/' });
      return await next();
    }

    // 🎯 NEW: Implicit token refresh (inspired by @hono/oidc-auth)
    // If autoRefreshTokens is enabled and token is about to expire, refresh it silently
    const now = Date.now();
    if (autoRefreshTokens && session.refresh_token && session.expires_at) {
      const timeUntilExpiry = session.expires_at - now;

      // 🪵 Log token expiry check
      logger.debug({
        timeUntilExpirySeconds: Math.round(timeUntilExpiry / 1000),
        thresholdSeconds: Math.round(refreshThreshold / 1000),
        willRefresh: timeUntilExpiry > 0 && timeUntilExpiry < refreshThreshold
      }, '[OIDC] Token expiry check');

      // Refresh if token expires within refreshThreshold (default: 5 minutes)
      if (timeUntilExpiry > 0 && timeUntilExpiry < refreshThreshold) {
        const newTokens = await refreshTokens(c, session.refresh_token);

        if (newTokens) {
          const refreshedExpiry = resolveExpiresInSeconds(newTokens);
          if (refreshedExpiry.source !== 'provider') {
            logger.warn({
              reportedExpiresIn: newTokens?.expires_in,
              fallbackSeconds: refreshedExpiry.seconds,
              fallbackSource: refreshedExpiry.source
            }, '[OIDC] Token refresh applied expiry fallback');
          }
          // Update session with new tokens
          session.expires_at = now + (refreshedExpiry.seconds * 1000);
          session.refresh_token = newTokens.refresh_token || session.refresh_token;
          session.token_expires_in = refreshedExpiry.seconds;
          session.token_expiry_source = refreshedExpiry.source;

          // Mark session as refreshed for JWT workaround
          const updatedSessionJWT = await encodeSession(session);
          c.set('oidc_session_jwt_updated', updatedSessionJWT);

          logger.debug({
            timeUntilExpiry: Math.round(timeUntilExpiry / 1000),
            newExpiresIn: refreshedExpiry.seconds,
            newExpirySource: refreshedExpiry.source
          }, '[OIDC] Token refreshed implicitly');
        } else {
          // Refresh failed - let session continue until it expires
          logger.warn('[OIDC] Token refresh failed, session will expire naturally');
        }
      }
    }

    // Update last_activity (rolling session)
    session.last_activity = Date.now();

    // Check if user is active (if field exists)
    if (session.user.active !== undefined && !session.user.active) {
      // User account is inactive, clear session (dual-cookie deletion)
      await deleteSessionCookie(c, cookieName, { path: '/' });

      // Content negotiation for inactive account
      const acceptHeader = c.req.header('accept') || '';
      const acceptsHtml = acceptHeader.includes('text/html');

      if (acceptsHtml) {
        return c.redirect(`${loginPath}?error=account_inactive`, 302);
      } else {
        const response = unauthorized('User account is inactive');
        return c.json(response, response._status);
      }
    }

    // Base user from session
    const sessionUser = {
      ...session.user,
      authMethod: 'oidc',
      session: {
        expires_at: session.expires_at,  // When session expires (user must re-login)
        last_activity: session.last_activity  // Last request timestamp
      }
    };

    // Execute afterUserEnrich hooks
    const enrichParams = await hookExecutor.executeHooks('afterUserEnrich', {
      sessionUser,        // User from session cookie
      dbUser: null,       // Hook will fetch from database
      mergedUser: sessionUser,  // MUTABLE - hook modifies this
      context: c
    });

    // Set enriched user in context
    c.set('user', enrichParams.mergedUser || sessionUser);

    // 🪵 Log successful authentication
    logger.debug({
      userId: session.user?.id?.substring(0, 15) + '...',
      email: session.user?.email,
      authMethod: 'oidc',
      sessionValid: true
    }, '[OIDC] User authenticated from session');

    // Re-encode session with updated last_activity (rolling session)
    const newSessionJWT = await encodeSession(session);

    setChunkedCookie(c, cookieName, newSessionJWT, {
      path: '/',
      httpOnly: true,
      maxAge: Math.floor(cookieMaxAge / 1000),
      sameSite: cookieSameSite,
      secure: cookieSecure
    });

    await next();

    // 🎯 NEW: Set Cache-Control header to prevent caching of authenticated responses
    // Prevents CDNs/proxies from caching user-specific content
    if (!c.res.headers.has('Cache-Control')) {
      c.res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    }

    // 🎯 NEW: Session JWT workaround - re-set cookie if session was refreshed during request
    // This handles cases where implicit refresh happens after next() completes
    const updatedSessionJWT = c.get('oidc_session_jwt_updated');
    if (updatedSessionJWT) {
      setChunkedCookie(c, cookieName, updatedSessionJWT, {
        path: '/',
        httpOnly: true,
        maxAge: Math.floor(cookieMaxAge / 1000),
        sameSite: cookieSameSite,
        secure: cookieSecure
      });
    }
  };

  return {
    middleware,
    routes: {
      [loginPath]: 'Login (redirect to SSO)',
      [callbackPath]: 'OAuth2 callback',
      [logoutPath]: 'Logout (local + IdP)'
    },
    config: config,
    // Phase 3: Expose utilities for advanced use cases
    utils: {
      /**
       * Regenerate session ID (security best practice)
       * Call when user privileges change (e.g., becomes admin)
       *
       * @example
       * const oidcDriver = await createOIDCHandler(config);
       * app.post('/promote-to-admin', async (c) => {
       *   const session = c.get('session');
       *   session.roles = ['admin'];
       *   await oidcDriver.utils.regenerateSession(c, session);
       *   return c.json({ success: true });
       * });
       */
      regenerateSession,

      /**
       * Get current session (with caching)
       * Useful for manual session access in hooks
       */
      getCachedSession: (c) => getCachedSession(c, config.cookieName || 'oidc_session'),

      /**
       * Delete session (logout without provider redirect)
       * Useful for local-only logout
       */
      deleteSession: (c) => deleteSessionCookie(c, config.cookieName || 'oidc_session', {
        path: '/',
        domain: config.cookieDomain
      })
    }
  };
}

export default createOIDCHandler;

export function createOidcUtils(config, dependencies = {}) {
  const noopApp = dependencies.app || {
    get: () => {}
  };

  const handler = createOIDCHandler(
    config,
    noopApp,
    dependencies.usersResource || null,
    dependencies.events || null
  );

  return handler.utils;
}
