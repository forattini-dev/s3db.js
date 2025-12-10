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
 */

import crypto from 'crypto';
import type { Context, Next, Hono, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createLogger, type Logger, type LogLevel } from '../../../concerns/logger.js';
import { createHttpClient, type HttpClient } from '../../../concerns/http-client.js';
import { unauthorized } from '../utils/response-formatter.js';
import { applyProviderPreset, applyProviderQuirks } from './providers.js';
import { createAuthDriverRateLimiter } from '../middlewares/rate-limit.js';
import { deriveOidcKeys } from '../concerns/crypto.js';
import { OIDCResourceManager, type ResourceLike, type DatabaseLike } from './resource-manager.js';
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
import { createHookExecutor, createCookieHelpers, type HookExecutor } from '../concerns/oidc-hooks.js';
import { idGenerator } from '../../../concerns/id.js';

const logger: Logger = createLogger({
  name: 'OidcAuth',
  level: (process.env.S3DB_LOG_LEVEL || 'info') as LogLevel
});

if (!logger || typeof logger.info !== 'function') {
  console.error('[OIDC] CRITICAL: Failed to create logger - falling back to console');
}

let httpClient: HttpClient | null = null;

async function getHttpClient(): Promise<HttpClient> {
  if (!httpClient) {
    httpClient = await createHttpClient({
      timeout: 30000,
      retry: {
        maxAttempts: 3,
        delay: 1000,
        backoff: 'exponential',
        retryAfter: true,
        retryOn: [429, 500, 502, 503, 504]
      }
    });
  }
  return httpClient;
}

function getOidcFetchHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Connection': 'close',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...customHeaders
  };
}

export interface OIDCUserMapping {
  id?: string;
  email?: string;
  username?: string;
  name?: string;
  role?: string;
  metadata?: ((claims: Record<string, unknown>) => Record<string, unknown>) | Record<string, unknown>;
}

export interface OIDCDiscoveryConfig {
  enabled?: boolean;
}

export interface OIDCPKCEConfig {
  enabled?: boolean;
  method?: string;
}

export interface OIDCRateLimitConfig {
  enabled?: boolean;
  windowMs?: number;
  maxAttempts?: number;
  skipSuccessfulRequests?: boolean;
}

export interface OIDCSessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData, ttl: number): Promise<void>;
  destroy(sessionId: string): Promise<void>;
}

export interface OIDCEventsEmitter {
  emitUserEvent(event: string, data: Record<string, unknown>): void;
}

export interface OIDCConfig {
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  cookieSecret?: string;
  cookieName?: string;
  cookieMaxAge?: number;
  cookieSecure?: boolean;
  cookieSameSite?: 'Strict' | 'Lax' | 'None';
  cookieDomain?: string;
  rollingDuration?: number;
  absoluteDuration?: number;
  loginPath?: string;
  callbackPath?: string;
  logoutPath?: string;
  postLoginRedirect?: string;
  postLogoutRedirect?: string;
  idpLogout?: boolean;
  autoCreateUser?: boolean;
  userIdClaim?: string;
  fallbackIdClaims?: string[];
  lookupFields?: string[];
  autoRefreshTokens?: boolean;
  refreshThreshold?: number;
  allowInsecureCookies?: boolean;
  defaultRole?: string;
  defaultScopes?: string[];
  discovery?: OIDCDiscoveryConfig;
  pkce?: OIDCPKCEConfig;
  rateLimit?: OIDCRateLimitConfig | false;
  tokenFallbackSeconds?: number;
  apiTokenField?: string;
  detectApiTokenField?: boolean;
  generateApiToken?: boolean;
  apiTokenLength?: number;
  apiTokenCookie?: string;
  sessionStore?: OIDCSessionStore;
  userMapping?: OIDCUserMapping;
  protectedPaths?: string[];
  externalUrl?: string;
  baseURL?: string;
  verbose?: boolean;
  logLevel?: string;
  errorPage?: boolean;
  jwtSecret?: string;
  resource?: string;
  createResource?: boolean;
  provider?: string;
  onUserAuthenticated?: (params: OnUserAuthenticatedParams) => Promise<void>;
  hooks?: OIDCHooksConfig;
}

export interface OnUserAuthenticatedParams {
  user: OIDCUser;
  created: boolean;
  claims: IdTokenClaims;
  tokens: {
    access_token: string;
    id_token: string;
    refresh_token?: string;
  };
  context: Context;
}

export interface OIDCHooksConfig {
  beforeUserCreate?: HookFunction[];
  beforeUserUpdate?: HookFunction[];
  afterSessionCreate?: HookFunction[];
  afterUserEnrich?: HookFunction[];
}

export type HookFunction = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export interface IdTokenClaims extends JWTPayload {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  role?: string;
  roles?: string[];
  [key: string]: unknown;
}

export interface OIDCUser {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  role?: string;
  scopes?: string[];
  isActive?: boolean;
  active?: boolean;
  apiToken?: string;
  costCenterId?: string;
  costCenterName?: string;
  lastLoginAt?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SessionData {
  issued_at: number;
  expires_at: number;
  last_activity: number;
  token_expires_in: number;
  token_expiry_source: string;
  refresh_token?: string;
  id_token?: string;
  user: SessionUser;
  iat?: number;
}

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  scopes?: string[];
  apiToken?: string;
  costCenterId?: string;
  costCenterName?: string;
  isVirtual?: boolean;
  active?: boolean;
}

export interface StateData {
  state: string;
  returnTo: string;
  nonce: string;
  code_verifier?: string | null;
  type: string;
  expires: number;
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface OIDCEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  logoutEndpoint: string;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ExpiresInfo {
  seconds: number;
  source: 'provider' | 'id_token' | 'config';
}

export interface GetOrCreateUserResult {
  user: OIDCUser | null;
  created: boolean;
}

export interface OIDCHandlerResult {
  middleware: MiddlewareHandler;
  routes: Record<string, string>;
  config: OIDCConfig;
  utils: OIDCUtils;
}

export interface OIDCUtils {
  regenerateSession: (c: Context, sessionData: SessionData) => Promise<string>;
  getCachedSession: (c: Context) => Promise<SessionData | null>;
  deleteSession: (c: Context) => Promise<void>;
}

/**
 * Validate OIDC configuration at startup
 */
export function validateOidcConfig(config: OIDCConfig): void {
  const errors: string[] = [];

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

  if (config.clientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.clientId)) {
    if (config?.logLevel === 'debug' || config?.logLevel === 'trace') {
      logger.warn('[OIDC] clientId is not in UUID format (may be expected for some providers)');
    }
  }

  if (errors.length > 0) {
    throw new Error(`OIDC driver configuration is invalid:\n${errors.map(e => `  - ${e}`).join('\n')}\n\nSee documentation for configuration requirements.`);
  }
}

function applyUserMapping(
  claims: IdTokenClaims,
  mapping: OIDCUserMapping,
  defaults: { defaultId: string; defaultScopes: string[]; provider: string; now: string }
): Partial<OIDCUser> {
  const user: Partial<OIDCUser> = {
    id: defaults.defaultId,
    scopes: defaults.defaultScopes,
    lastLoginAt: defaults.now
  };

  for (const [userField, claimName] of Object.entries(mapping)) {
    if (userField === 'metadata') continue;

    if (typeof claimName === 'string' && claims[claimName] !== undefined) {
      (user as Record<string, unknown>)[userField] = claims[claimName];
    }
  }

  if (mapping.metadata) {
    if (typeof mapping.metadata === 'function') {
      user.metadata = mapping.metadata(claims);
    } else if (typeof mapping.metadata === 'object') {
      user.metadata = mapping.metadata;
    }
  } else {
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

async function getOrCreateUser(
  usersResource: ResourceLike,
  claims: IdTokenClaims,
  config: OIDCConfig,
  context: Context,
  hookExecutor: HookExecutor
): Promise<GetOrCreateUserResult> {
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

  logger.info({
    allClaims: claims,
    claimKeys: Object.keys(claims),
    userIdClaim,
    userIdValue: claims[userIdClaim],
    fallbackIdClaims,
    lookupFields
  }, '[OIDC] DEBUG: Received ID Token claims');

  const candidateIds: string[] = [];
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

  logger.debug({
    candidateIds: candidateIds.map(id => id?.substring(0, 15) + '...'),
    lookupFields,
    autoCreateUser,
    userIdClaim
  }, '[OIDC] User lookup starting');

  let user: OIDCUser | null = null;

  for (const candidate of candidateIds) {
    try {
      user = await (usersResource.get as (id: string, opts?: Record<string, unknown>) => Promise<OIDCUser>)(candidate, { skipCache: true });
      break;
    } catch {
      // Not found, continue
    }
  }

  if (!user) {
    const fields = Array.isArray(lookupFields) ? lookupFields : [lookupFields];
    logger.info({
      lookupFields: fields,
      attemptedQueries: fields.map(f => ({ field: f, value: claims[f], hasValue: !!claims[f] }))
    }, '[OIDC] DEBUG: Attempting query lookups');

    for (const field of fields) {
      if (!field) continue;
      const value = claims[field];
      if (!value) {
        logger.info({ field, reason: 'no value in claims' }, '[OIDC] Skipping lookup field');
        continue;
      }
      const results = await usersResource.query({ [field]: value }, { limit: 1 }) as OIDCUser[];
      logger.info({ field, value, resultsCount: results.length }, '[OIDC] Query result');
      if (results.length > 0) {
        user = results[0] ?? null;
        break;
      }
    }
  }

  if (!user) {
    logger.warn({
      candidateIds,
      lookupFields,
      availableClaims: Object.keys(claims),
      autoCreateUser
    }, '[OIDC] User NOT found - will attempt auto-create');
  }

  const now = new Date().toISOString();

  if (user) {
    logger.debug({
      userId: user.id?.substring(0, 15) + '...',
      email: user.email,
      action: 'update'
    }, '[OIDC] Existing user found, updating');

    const { webpush, lastUrlId, lastLoginIp, lastLoginUserAgent, password, ...userWithoutProblematicFields } = user as Record<string, unknown>;

    const cleanUser: Partial<OIDCUser> = {
      ...(userWithoutProblematicFields as Partial<OIDCUser>),
      lastLoginAt: now,
      name: claims.name || user.name,
      isActive: user.isActive !== undefined ? user.isActive : true,
      metadata: {
        costCenterId: (user.metadata as Record<string, unknown>)?.costCenterId,
        teamId: (user.metadata as Record<string, unknown>)?.teamId,
        needsOnboarding: (user.metadata as Record<string, unknown>)?.needsOnboarding,
        oidc: {
          sub: claims.sub,
          provider: config.issuer,
          lastSync: now,
          claims: { ...claims }
        }
      }
    };

    let hookParams: Record<string, unknown> = {};
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
        error: (hookError as Error).message,
        stack: (hookError as Error).stack,
        userId: user.id,
        hook: 'beforeUserUpdate'
      }, '[OIDC] CRITICAL: `beforeUserUpdate` hook failed but login flow will continue.');
    }

    let finalUser = cleanUser;
    if (hookParams.updates) {
      finalUser = { ...cleanUser, ...(hookParams.updates as Partial<OIDCUser>) };
      if ((hookParams.updates as Record<string, unknown>).metadata) {
        finalUser.metadata = {
          ...cleanUser.metadata,
          ...((hookParams.updates as Record<string, unknown>).metadata as Record<string, unknown>)
        };
      }
    }

    logger.debug({
      userId: user.id?.substring(0, 15) + '...',
      fieldsToUpdate: Object.keys(finalUser),
      hasMetadata: !!finalUser.metadata
    }, '[OIDC] Updating existing user with merged data');

    try {
      user = await (usersResource.update as (id: string, data: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<OIDCUser>)(user.id, finalUser, { skipCache: true });
      logger.debug({
        userId: user.id?.substring(0, 15) + '...',
        email: user.email,
        updated: true
      }, '[OIDC] User updated successfully');
      return { user, created: false };
    } catch (updateErr) {
      logger.error({
        error: (updateErr as Error).message,
        errorType: (updateErr as Error).constructor.name,
        userId: user.id?.substring(0, 15) + '...',
        stack: (updateErr as Error).stack
      }, '[OIDC] User update failed');
      throw updateErr;
    }
  }

  if (!autoCreateUser) {
    logger.warn('[OIDC] User not found and autoCreateUser is disabled');
    return { user: null, created: false };
  }

  const newUserId = candidateIds[0];

  if (!newUserId) {
    throw new Error('Cannot determine user ID from OIDC claims');
  }

  logger.debug({
    userId: newUserId?.substring(0, 15) + '...',
    email: claims.email,
    action: 'create',
    hasUserMapping: !!config.userMapping
  }, '[OIDC] Creating new user');

  let newUser: Partial<OIDCUser>;
  if (config.userMapping && typeof config.userMapping === 'object') {
    newUser = applyUserMapping(claims, config.userMapping, {
      defaultId: newUserId,
      defaultScopes: config.defaultScopes || ['preset:user'],
      provider: config.issuer || '',
      now
    });
  } else {
    newUser = {
      id: newUserId,
      name: claims.name || claims.email || newUserId,
      scopes: config.defaultScopes || ['preset:user'],
      isActive: true,
      lastLoginAt: now,
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

  const createHookParams = await hookExecutor.executeHooks('beforeUserCreate', {
    userData: newUser,
    claims,
    usersResource,
    context
  });

  if (createHookParams.userData) {
    Object.assign(newUser, createHookParams.userData);
    if ((createHookParams.userData as Record<string, unknown>).metadata) {
      newUser.metadata = {
        ...newUser.metadata,
        ...((createHookParams.userData as Record<string, unknown>).metadata as Record<string, unknown>)
      };
    }
  }

  logger.debug({
    userId: newUser.id?.substring(0, 15) + '...',
    fields: Object.keys(newUser),
    hasMetadata: !!newUser.metadata
  }, '[OIDC] Inserting new user');

  try {
    user = await (usersResource.insert as (data: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<OIDCUser>)(newUser, { skipCache: true });
    logger.debug({
      userId: user.id?.substring(0, 15) + '...',
      email: user.email,
      created: true
    }, '[OIDC] User created successfully');
    return { user, created: true };
  } catch (insertErr) {
    logger.error({
      error: (insertErr as Error).message,
      errorType: (insertErr as Error).constructor.name,
      userId: newUser.id?.substring(0, 15) + '...',
      stack: (insertErr as Error).stack
    }, '[OIDC] User creation failed');
    throw insertErr;
  }
}

async function refreshAccessToken(
  tokenEndpoint: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const client = await getHttpClient();
  const response = await client.post(tokenEndpoint, {
    headers: getOidcFetchHeaders({
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    }),
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return await response.json() as TokenResponse;
}

/**
 * Create OIDC authentication handler and routes
 */
export async function createOIDCHandler(
  inputConfig: OIDCConfig,
  app: Hono,
  database: DatabaseLike,
  events: OIDCEventsEmitter | null = null
): Promise<OIDCHandlerResult> {
  const preset = applyProviderPreset('oidc', inputConfig as unknown as Parameters<typeof applyProviderPreset>[1]) as OIDCConfig;

  const manager = new OIDCResourceManager(database, 'oidc', inputConfig as unknown as ConstructorParameters<typeof OIDCResourceManager>[2]);
  const usersResource = await manager.getOrCreateResource();

  logger.debug(`OIDC driver initialized with resource: ${usersResource?.name}`);

  const config: OIDCConfig = {
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    cookieName: 'oidc_session',
    cookieMaxAge: 604800000,
    rollingDuration: 86400000,
    absoluteDuration: 604800000,
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
    refreshThreshold: 300000,
    cookieSecure: process.env.NODE_ENV === 'production',
    cookieSameSite: 'Lax',
    allowInsecureCookies: ['development', 'local'].includes(process.env.NODE_ENV || ''),
    defaultRole: 'user',
    defaultScopes: ['openid', 'profile', 'email'],
    discovery: { enabled: true, ...(preset.discovery || {}) },
    pkce: { enabled: true, method: 'S256', ...(preset.pkce || {}) },
    rateLimit: preset.rateLimit !== undefined ? preset.rateLimit : {
      enabled: true,
      windowMs: 60000,
      maxAttempts: 200,
      skipSuccessfulRequests: true
    },
    tokenFallbackSeconds: 3600,
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
    autoRefreshTokens = true,
    refreshThreshold = 300000,
    cookieSecure,
    cookieSameSite,
    sessionStore
  } = config;

  const { current: derivedKeys } = deriveOidcKeys(cookieSecret || '');
  const signingKey = derivedKeys.signing;

  const sessionCache = new WeakMap<Context, SessionData>();

  const hookExecutor = createHookExecutor(config as unknown as Parameters<typeof createHookExecutor>[0], logger);

  function generateSessionId(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  const issuerNoSlash = `${issuer || ''}`.replace(/\/$/, '');

  let authorizationEndpoint = `${issuerNoSlash}/oauth/authorize`;
  let tokenEndpoint = `${issuerNoSlash}/oauth/token`;
  let logoutEndpoint = `${issuerNoSlash}/oauth2/v2.0/logout`;

  if (/login\.microsoftonline\.com/i.test(issuerNoSlash)) {
    const tenantBase = issuerNoSlash.replace(/\/v2\.0$/i, '');
    authorizationEndpoint = `${tenantBase}/oauth2/v2.0/authorize`;
    tokenEndpoint = `${tenantBase}/oauth2/v2.0/token`;
    logoutEndpoint = `${tenantBase}/oauth2/v2.0/logout`;
  }

  async function getEndpoints(c: Context | null = null): Promise<OIDCEndpoints> {
    if (c) {
      const cached = c.get('oidc_endpoints') as OIDCEndpoints | undefined;
      if (cached) {
        return cached;
      }
    }

    if (config.discovery?.enabled === false) {
      const endpoints = { authorizationEndpoint, tokenEndpoint, logoutEndpoint };
      if (c) c.set('oidc_endpoints', endpoints);
      return endpoints;
    }

    try {
      const client = await getHttpClient();
      const res = await client.get(`${(issuer || '').replace(/\/$/, '')}/.well-known/openid-configuration`);
      if (res.ok) {
        const doc = await res.json() as {
          authorization_endpoint?: string;
          token_endpoint?: string;
          end_session_endpoint?: string;
        };
        const endpoints = {
          authorizationEndpoint: doc.authorization_endpoint || authorizationEndpoint,
          tokenEndpoint: doc.token_endpoint || tokenEndpoint,
          logoutEndpoint: doc.end_session_endpoint || logoutEndpoint
        };

        if (c) c.set('oidc_endpoints', endpoints);
        return endpoints;
      }
    } catch (e) {
      if (config.logLevel) {
        logger.warn({ error: (e as Error).message }, '[OIDC] Discovery failed, using default endpoints');
      }
    }

    const endpoints = { authorizationEndpoint, tokenEndpoint, logoutEndpoint };
    if (c) c.set('oidc_endpoints', endpoints);
    return endpoints;
  }

  async function encodeSession(data: SessionData): Promise<string> {
    if (sessionStore) {
      const sessionId = generateSessionId();
      await sessionStore.set(sessionId, data, cookieMaxAge || 604800000);
      return sessionId;
    } else {
      const jwt = await new SignJWT(data as unknown as JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${Math.floor((cookieMaxAge || 604800000) / 1000)}s`)
        .sign(signingKey);
      return jwt;
    }
  }

  async function decodeSession(idOrJwt: string): Promise<SessionData | null> {
    if (sessionStore) {
      try {
        return await sessionStore.get(idOrJwt);
      } catch (err) {
        logger.error({ error: (err as Error).message }, '[OIDC] Session store get error');
        return null;
      }
    } else {
      try {
        const { payload } = await jwtVerify(idOrJwt, signingKey);
        return payload as unknown as SessionData;
      } catch {
        return null;
      }
    }
  }

  async function getCachedSession(c: Context, sessionCookieName: string): Promise<SessionData | null> {
    if (sessionCache.has(c)) {
      return sessionCache.get(c) || null;
    }

    const sessionCookie = getChunkedCookie(c, sessionCookieName);
    if (!sessionCookie) {
      return null;
    }

    const session = await decodeSession(sessionCookie);

    if (session) {
      sessionCache.set(c, session);
    }

    return session;
  }

  async function deleteSessionCookie(
    c: Context,
    name: string,
    options: { path?: string; domain?: string } = {},
    contextOptions: {
      cookieJar?: Record<string, string>;
      skipSessionDestroy?: boolean;
      sessionId?: string | null;
      logMissing?: boolean;
    } = {}
  ): Promise<void> {
    const path = options.path || '/';
    const domain = options.domain || config.cookieDomain;
    const cookieJar = contextOptions.cookieJar || getCookie(c) || {};
    const skipSessionDestroy = contextOptions.skipSessionDestroy || false;
    const sessionId = contextOptions.sessionId !== undefined
      ? contextOptions.sessionId
      : getChunkedCookie(c, name, cookieJar);

    if (sessionStore && !skipSessionDestroy) {
      if (sessionId) {
        try {
          await sessionStore.destroy(sessionId);
        } catch (err) {
          logger.error({ error: (err as Error).message }, '[OIDC] Session store destroy error');
        }
      } else if (contextOptions.logMissing !== false) {
        logger.warn({
          cookieName: name,
          cookies: Object.keys(cookieJar)
        }, '[OIDC] Session cookie missing during deletion');
      }
    }

    deleteChunkedCookie(c, name, { path }, cookieJar);

    if (domain) {
      deleteChunkedCookie(c, name, { path, domain }, cookieJar);
    }
  }

  async function regenerateSession(c: Context, sessionData: SessionData): Promise<string> {
    const sessionCookieName = config.cookieName || 'oidc_session';
    const cookieJar = getCookie(c) || {};
    const previousSessionToken = getChunkedCookie(c, sessionCookieName, cookieJar);

    if (sessionStore) {
      if (previousSessionToken) {
        try {
          await sessionStore.destroy(previousSessionToken);
        } catch (err) {
          logger.error({ error: (err as Error).message }, '[OIDC] Session store destroy error during regeneration');
        }
      } else {
        logger.warn('[OIDC] regenerateSession - prior session cookie not found before rotation');
      }
    }

    await deleteSessionCookie(c, sessionCookieName, {
      path: '/',
      domain: config.cookieDomain
    }, {
      cookieJar,
      skipSessionDestroy: !!sessionStore,
      sessionId: previousSessionToken,
      logMissing: !sessionStore
    });

    if (sessionCache.has(c)) {
      sessionCache.delete(c);
    }

    const newSessionIdOrJwt = await encodeSession(sessionData);

    setChunkedCookie(c, sessionCookieName, newSessionIdOrJwt, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      path: '/',
      ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
      maxAge: (cookieMaxAge || 604800000) / 1000
    });

    sessionCache.set(c, sessionData);

    logger.debug('[OIDC] Session regenerated (new ID issued)');

    return newSessionIdOrJwt;
  }

  async function refreshTokens(c: Context, refreshToken: string): Promise<TokenResponse | null> {
    if (!refreshToken) return null;

    try {
      const ep = await getEndpoints(c);
      const tokenBody = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const authHeader = clientSecret
        ? `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        : null;

      if (!clientSecret) {
        tokenBody.set('client_id', clientId || '');
      }

      const client = await getHttpClient();
      const response = await client.post(ep.tokenEndpoint, {
        headers: getOidcFetchHeaders(authHeader ? { 'Authorization': authHeader } : {}),
        body: tokenBody.toString()
      });

      if (!response.ok) {
        const logLevel = c.get('logLevel');
        if (logLevel === 'debug' || logLevel === 'trace') {
          const error = await response.text();
          logger.warn({ error }, '[OIDC] Token refresh failed');
        }
        return null;
      }

      return await response.json() as TokenResponse;
    } catch (err) {
      const logLevel = c.get('logLevel');
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger.warn({ error: (err as Error).message }, '[OIDC] Token refresh error');
      }
      return null;
    }
  }

  function validateSessionDuration(session: SessionData): SessionValidationResult {
    const now = Date.now();

    const issuedMs = session.issued_at
      ? Number(session.issued_at)
      : (typeof session.iat === 'number' ? session.iat * 1000 : now);

    if (issuedMs + (absoluteDuration || 604800000) < now) {
      return { valid: false, reason: 'absolute_expired' };
    }

    const lastActivity = typeof session.last_activity === 'number' ? session.last_activity : issuedMs;
    if (lastActivity + (rollingDuration || 86400000) < now) {
      return { valid: false, reason: 'rolling_expired' };
    }

    return { valid: true };
  }

  function generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  function reconstructExternalUrl(externalUrl: string, originalUrl: string): string {
    if (!externalUrl) return originalUrl;

    try {
      const external = new URL(externalUrl);
      const original = new URL(originalUrl);

      external.pathname = `${external.pathname.replace(/\/$/, '')}${original.pathname}`;
      external.search = original.search;
      external.hash = original.hash;

      return external.toString();
    } catch {
      return originalUrl;
    }
  }

  function randomBase64Url(bytes: number = 32): string {
    const arr = new Uint8Array(bytes);
    if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
      throw new Error('WebCrypto not available: getRandomValues missing');
    }
    globalThis.crypto.getRandomValues(arr);
    const b64 = Buffer.from(arr).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64;
  }

  async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
    const verifier = randomBase64Url(48);
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

  function decodeIdToken(idToken: string): IdTokenClaims | null {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3 || !parts[1]) return null;
      const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payload) as IdTokenClaims;
    } catch {
      return null;
    }
  }

  function resolveExpiresInSeconds(tokens: Partial<TokenResponse> = {}, fallbackClaims: IdTokenClaims | null = null): ExpiresInfo {
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

  let rateLimiter: MiddlewareHandler | null = null;
  if (config.rateLimit && typeof config.rateLimit === 'object' && config.rateLimit.enabled) {
    rateLimiter = createAuthDriverRateLimiter('oidc', config.rateLimit);
  }

  // LOGIN Route
  app.get(loginPath || '/auth/login', async (c: Context) => {
    try {
      const state = generateState();

      const returnToParam = c.req.query('returnTo');
      const continueUrl = returnToParam
        ? (config.externalUrl
            ? reconstructExternalUrl(config.externalUrl, new URL(returnToParam, c.req.url).toString())
            : returnToParam)
        : (config.externalUrl
            ? reconstructExternalUrl(config.externalUrl, c.req.url)
            : postLoginRedirect || '/');

      const nonce = generateState();

      let codeVerifier: string | null = null;
      let codeChallenge: string | null = null;
      const pkceEnabled = config.pkce?.enabled !== false;

      if (pkceEnabled) {
        try {
          const pair = await createPkcePair();
          codeVerifier = pair.verifier;
          codeChallenge = pair.challenge;
        } catch (e) {
          logger.warn({ error: (e as Error).message }, '[OIDC] PKCE generation failed');
        }
      }

      const stateJWT = await encodeSession({
        state,
        returnTo: continueUrl,
        nonce,
        code_verifier: codeVerifier,
        type: 'csrf',
        expires: Date.now() + 600000
      } as unknown as SessionData);

      const isSecure = !!(config.baseURL && config.baseURL.startsWith('https://'));
      const useServerSideState = !isSecure && config.allowInsecureCookies;

      logger.info({
        state: state.substring(0, 8) + '...',
        hasPKCE: !!codeVerifier,
        hasReturnTo: !!returnToParam,
        returnTo: returnToParam,
        continueUrl,
        scopes: (scopes || []).join(' '),
        stateStorage: useServerSideState ? 'server-side (dev)' : 'cookie',
        isSecure,
        baseURL: config.baseURL,
        allowInsecureCookies: config.allowInsecureCookies,
        nodeEnv: process.env.NODE_ENV,
        cookieSettings: useServerSideState ? 'n/a' : {
          sameSite: isSecure ? 'None' : 'Lax',
          secure: isSecure
        }
      }, '[OIDC] Login flow initiated');

      let stateId: string | null = null;
      if (useServerSideState) {
        stateId = idGenerator();
        const globalStore = (globalThis as Record<string, unknown>);
        if (!globalStore.__oidc_state_store) globalStore.__oidc_state_store = new Map();
        if (!globalStore.__oidc_state_mapping) globalStore.__oidc_state_mapping = new Map();

        (globalStore.__oidc_state_store as Map<string, { data: string; expires: number }>).set(stateId, {
          data: stateJWT,
          expires: Date.now() + 600000
        });

        (globalStore.__oidc_state_mapping as Map<string, string>).set(state, stateId);

        logger.warn({
          baseURL: config.baseURL,
          stateStorage: 'server-side',
          state: state.substring(0, 8) + '...',
          stateId: stateId.substring(0, 8) + '...'
        }, '[OIDC] DEV MODE: Using server-side state storage');
      } else {
        setCookie(c, `${cookieName}_state`, stateJWT, {
          path: '/',
          httpOnly: true,
          maxAge: 600,
          sameSite: isSecure ? 'None' : 'Lax',
          secure: isSecure
        });
      }

      const stateParam = state;

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId || '',
        redirect_uri: redirectUri || '',
        scope: (scopes || []).join(' '),
        state: stateParam,
        nonce
      });

      if (codeChallenge) {
        params.set('code_challenge_method', 'S256');
        params.set('code_challenge', codeChallenge);
      }

      const ep = await getEndpoints();
      const authUrl = new URL(ep.authorizationEndpoint);
      params.forEach((value, key) => {
        authUrl.searchParams.set(key, value);
      });

      applyProviderQuirks(authUrl, issuer || '', config as unknown as Parameters<typeof applyProviderQuirks>[2]);

      return c.redirect(authUrl.toString(), 302);
    } catch (error) {
      logger.error({
        error: (error as Error).message,
        stack: (error as Error).stack,
        returnTo: c.req.query('returnTo'),
        baseURL: config.baseURL,
        issuer: config.issuer
      }, '[OIDC] Login handler exception');

      return c.json({
        error: 'login_failed',
        message: (error as Error).message,
        details: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      }, 500);
    }
  });

  // CALLBACK Route
  const callbackHandler = async (c: Context): Promise<Response> => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');
    const errorDescription = c.req.query('error_description');

    logger.info({
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      host: c.req.header('host')
    }, '[OIDC] Callback received');

    if (error) {
      logger.warn({
        error,
        errorDescription,
        state: state?.substring(0, 8) + '...'
      }, '[OIDC] IdP returned error');
    }

    let stateCookie = getCookie(c, `${cookieName}_state`);
    let stateSource = 'cookie';
    let extractedStateId: string | null = null;

    if (!stateCookie && state) {
      const stateParts = state.split(':');
      const stateValue = stateParts[0] || '';
      const stateIdFromParam = stateParts.length > 1 ? stateParts[1] : null;
      const globalStore = (globalThis as Record<string, unknown>);

      if (stateIdFromParam && globalStore.__oidc_state_store) {
        const stored = (globalStore.__oidc_state_store as Map<string, { data: string; expires: number }>).get(stateIdFromParam);
        if (stored && stored.expires > Date.now()) {
          stateCookie = stored.data;
          stateSource = 'server-side';
          extractedStateId = stateIdFromParam;

          (globalStore.__oidc_state_store as Map<string, unknown>).delete(stateIdFromParam);
        }
      }

      if (!stateCookie && globalStore.__oidc_state_mapping && globalStore.__oidc_state_store) {
        const mappedStateId = (globalStore.__oidc_state_mapping as Map<string, string>).get(stateValue);
        if (mappedStateId) {
          const stored = (globalStore.__oidc_state_store as Map<string, { data: string; expires: number }>).get(mappedStateId);
          if (stored && stored.expires > Date.now()) {
            stateCookie = stored.data;
            stateSource = 'server-side';
            extractedStateId = mappedStateId;

            (globalStore.__oidc_state_store as Map<string, unknown>).delete(mappedStateId);
            (globalStore.__oidc_state_mapping as Map<string, unknown>).delete(stateValue);
          }
        }
      }
    }

    if (!stateCookie) {
      return c.json({
        error: 'Missing state cookie (CSRF protection)',
        hint: 'Cookies blocked on HTTP cross-site redirect. Use HTTPS or set allowInsecureCookies: true (dev only).'
      }, 400);
    }

    const stateData = await decodeSession(stateCookie) as unknown as StateData | null;

    const statePartsForComparison = state?.split(':');
    const actualStateValue = statePartsForComparison && statePartsForComparison.length >= 1
      ? statePartsForComparison[0]
      : state;

    if (!stateData || stateData.state !== actualStateValue) {
      return c.json({ error: 'Invalid state (CSRF protection)' }, 400);
    }

    await deleteSessionCookie(c, `${cookieName}_state`, { path: '/' });

    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400);
    }

    try {
      const codeVerifier = stateData.code_verifier || null;
      const ep = await getEndpoints(c);

      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri || '',
        ...(codeVerifier ? { code_verifier: codeVerifier } : {})
      });

      const authHeader = clientSecret
        ? `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        : null;

      if (!clientSecret) {
        tokenBody.set('client_id', clientId || '');
      }

      const client = await getHttpClient();
      const tokenResponse = await client.post(ep.tokenEndpoint, {
        headers: getOidcFetchHeaders(authHeader ? { 'Authorization': authHeader } : {}),
        body: tokenBody.toString()
      });

      if (!tokenResponse.ok) {
        const responseError = await tokenResponse.text();
        logger.error({
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: responseError.substring(0, 500)
        }, '[OIDC] Token exchange failed');

        return c.json({ error: 'Failed to exchange code for tokens' }, 500);
      }

      const tokens = await tokenResponse.json() as TokenResponse;

      const tokenValidation = validateTokenResponse(tokens as unknown as Parameters<typeof validateTokenResponse>[0], config as unknown as Parameters<typeof validateTokenResponse>[1]);

      if (!tokenValidation.valid) {
        const errorType = getErrorType(tokenValidation.errors);
        const errorDetails = getErrorDetails(errorType, tokenValidation.errors ?? undefined);

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

      const idTokenClaims = decodeIdToken(tokens.id_token);

      const expiresInfo = resolveExpiresInSeconds(tokens, idTokenClaims);

      if (!idTokenClaims) {
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

      const idTokenValidation = validateIdToken(idTokenClaims, config as unknown as Parameters<typeof validateIdToken>[1], {
        nonce: stateData.nonce,
        clockTolerance: 60,
        maxAge: 86400
      });

      if (!idTokenValidation.valid) {
        const errorType = getErrorType(idTokenValidation.errors);
        const errorDetails = getErrorDetails(errorType, idTokenValidation.errors ?? undefined);

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

      let user: OIDCUser | null = null;
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
                context: c
              });
            } catch (hookErr) {
              if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
                logger.error({ hookErr }, '[OIDC] onUserAuthenticated hook failed');
              }
            }
          }
        } catch (err) {
          logger.error({
            error: (err as Error).message,
            errorType: (err as Error).constructor.name,
            stack: (err as Error).stack,
            claims: {
              sub: idTokenClaims?.sub?.substring(0, 15) + '...',
              email: idTokenClaims?.email,
              name: idTokenClaims?.name
            }
          }, '[OIDC] Failed to create/update user');
        }
      }

      const now = Date.now();
      const sessionData: SessionData = {
        issued_at: now,
        expires_at: now + (expiresInfo.seconds * 1000),
        last_activity: now,
        token_expires_in: expiresInfo.seconds,
        token_expiry_source: expiresInfo.source,

        ...(autoRefreshTokens && tokens.refresh_token ? {
          refresh_token: tokens.refresh_token
        } : {}),

        user: user ? {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          scopes: user.scopes,
          apiToken: user.apiToken,
          costCenterId: user.costCenterId,
          costCenterName: user.costCenterName
        } : {
          id: idTokenClaims.sub || '',
          email: idTokenClaims.email,
          role: 'user',
          scopes: scopes,
          isVirtual: true
        }
      };

      const sessionJWT = await encodeSession(sessionData);

      setChunkedCookie(c, cookieName || 'oidc_session', sessionJWT, {
        path: '/',
        httpOnly: true,
        maxAge: Math.floor((cookieMaxAge || 604800000) / 1000),
        sameSite: cookieSameSite,
        secure: cookieSecure
      });

      const auth = createCookieHelpers(c, config as unknown as Parameters<typeof createCookieHelpers>[1]);

      c.set('sessionId', sessionJWT.split('.')[1]);
      c.set('sessionData', sessionData);

      await hookExecutor.executeHooks('afterSessionCreate', {
        user,
        sessionId: sessionJWT,
        sessionData,
        created: userCreated,
        context: c,
        auth
      });

      const redirectUrl = stateData.returnTo || postLoginRedirect || '/';
      return c.redirect(redirectUrl, 302);

    } catch (err) {
      logger.error({ err }, '[OIDC] Error during token exchange');
      return c.json({ error: 'Authentication failed' }, 500 as ContentfulStatusCode);
    }
  };

  if (rateLimiter) {
    app.get(callbackPath || '/auth/callback', rateLimiter, callbackHandler);
  } else {
    app.get(callbackPath || '/auth/callback', callbackHandler);
  }

  // LOGOUT Route
  app.get(logoutPath || '/auth/logout', async (c: Context) => {
    const sessionCookie = getChunkedCookie(c, cookieName || 'oidc_session');
    let idToken: string | undefined;

    if (sessionCookie) {
      const session = await decodeSession(sessionCookie);
      idToken = session?.id_token;
    }

    logger.info({
      hasSession: !!sessionCookie,
      hasIdToken: !!idToken,
      idpLogoutEnabled: idpLogout,
      willRedirectToIdP: idpLogout && !!idToken
    }, '[OIDC] Logout initiated');

    await deleteSessionCookie(c, cookieName || 'oidc_session', { path: '/' });

    if (idpLogout && idToken) {
      const ep = await getEndpoints(c);
      const params = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: `${postLogoutRedirect || '/'}`
      });

      return c.redirect(`${ep.logoutEndpoint}?${params.toString()}`, 302);
    }

    return c.redirect(postLogoutRedirect || '/', 302);
  });

  function matchPath(path: string, pattern: string): boolean {
    if (pattern === path) return true;

    const regexPattern = pattern
      .replace(/\*\*/g, '___GLOBSTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___GLOBSTAR___/g, '.*')
      .replace(/\//g, '\\/')
      + '$';

    const regex = new RegExp('^' + regexPattern);
    return regex.test(path);
  }

  const middleware: MiddlewareHandler = async (c: Context, next: Next): Promise<Response | void> => {
    const protectedPaths = config.protectedPaths || [];
    const currentPath = c.req.path;

    const isAuthPath = currentPath === loginPath || currentPath === callbackPath || currentPath === logoutPath;

    if (isAuthPath) {
      return await next();
    }

    if (protectedPaths.length > 0) {
      const isProtected = protectedPaths.some(pattern => matchPath(currentPath, pattern));

      if (!isProtected) {
        return await next();
      }
    }

    const sessionCookie = getChunkedCookie(c, cookieName || 'oidc_session');

    if (!sessionCookie) {
      const acceptHeader = c.req.header('accept') || '';
      const acceptsHtml = acceptHeader.includes('text/html');

      if (acceptsHtml) {
        const continueUrl = config.externalUrl
          ? reconstructExternalUrl(config.externalUrl, c.req.url)
          : c.req.url;
        const returnTo = encodeURIComponent(continueUrl);
        return c.redirect(`${loginPath}?returnTo=${returnTo}`, 302);
      } else {
        const response = unauthorized('Authentication required');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }
    }

    const session = await decodeSession(sessionCookie);

    if (!session) {
      await deleteSessionCookie(c, cookieName || 'oidc_session', { path: '/' });
      return await next();
    }

    const validation = validateSessionDuration(session);

    if (!validation.valid) {
      await deleteSessionCookie(c, cookieName || 'oidc_session', { path: '/' });
      return await next();
    }

    const now = Date.now();
    if (autoRefreshTokens && session.refresh_token && session.expires_at) {
      const timeUntilExpiry = session.expires_at - now;

      if (timeUntilExpiry > 0 && timeUntilExpiry < (refreshThreshold || 300000)) {
        const newTokens = await refreshTokens(c, session.refresh_token);

        if (newTokens) {
          const refreshedExpiry = resolveExpiresInSeconds(newTokens);
          session.expires_at = now + (refreshedExpiry.seconds * 1000);
          session.refresh_token = newTokens.refresh_token || session.refresh_token;
          session.token_expires_in = refreshedExpiry.seconds;
          session.token_expiry_source = refreshedExpiry.source;

          const updatedSessionJWT = await encodeSession(session);
          c.set('oidc_session_jwt_updated', updatedSessionJWT);
        }
      }
    }

    session.last_activity = Date.now();

    if (session.user.active !== undefined && !session.user.active) {
      await deleteSessionCookie(c, cookieName || 'oidc_session', { path: '/' });

      const acceptHeader = c.req.header('accept') || '';
      const acceptsHtml = acceptHeader.includes('text/html');

      if (acceptsHtml) {
        return c.redirect(`${loginPath}?error=account_inactive`, 302);
      } else {
        const response = unauthorized('User account is inactive');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }
    }

    const sessionUser = {
      ...session.user,
      authMethod: 'oidc',
      session: {
        expires_at: session.expires_at,
        last_activity: session.last_activity
      }
    };

    const enrichParams = await hookExecutor.executeHooks('afterUserEnrich', {
      sessionUser,
      dbUser: null,
      mergedUser: sessionUser,
      context: c
    });

    c.set('user', (enrichParams.mergedUser as SessionUser) || sessionUser);

    const newSessionJWT = await encodeSession(session);

    setChunkedCookie(c, cookieName || 'oidc_session', newSessionJWT, {
      path: '/',
      httpOnly: true,
      maxAge: Math.floor((cookieMaxAge || 604800000) / 1000),
      sameSite: cookieSameSite,
      secure: cookieSecure
    });

    await next();

    if (!c.res.headers.has('Cache-Control')) {
      c.res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    }

    const updatedSessionJWT = c.get('oidc_session_jwt_updated');
    if (updatedSessionJWT) {
      setChunkedCookie(c, cookieName || 'oidc_session', updatedSessionJWT as string, {
        path: '/',
        httpOnly: true,
        maxAge: Math.floor((cookieMaxAge || 604800000) / 1000),
        sameSite: cookieSameSite,
        secure: cookieSecure
      });
    }
  };

  return {
    middleware,
    routes: {
      [loginPath || '/auth/login']: 'Login (redirect to SSO)',
      [callbackPath || '/auth/callback']: 'OAuth2 callback',
      [logoutPath || '/auth/logout']: 'Logout (local + IdP)'
    },
    config: config,
    utils: {
      regenerateSession,
      getCachedSession: (c: Context) => getCachedSession(c, config.cookieName || 'oidc_session'),
      deleteSession: (c: Context) => deleteSessionCookie(c, config.cookieName || 'oidc_session', {
        path: '/',
        domain: config.cookieDomain
      })
    }
  };
}

export default createOIDCHandler;

export function createOidcUtils(
  config: OIDCConfig,
  dependencies: {
    app?: Hono;
    usersResource?: ResourceLike | null;
    events?: OIDCEventsEmitter | null;
  } = {}
): OIDCUtils {
  const noopApp = dependencies.app || {
    get: () => {}
  } as unknown as Hono;

  const handler = createOIDCHandler(
    config,
    noopApp,
    {} as DatabaseLike,
    dependencies.events || null
  );

  return (handler as unknown as Promise<OIDCHandlerResult>).then(h => h.utils) as unknown as OIDCUtils;
}
