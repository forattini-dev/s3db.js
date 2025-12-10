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
import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie } from 'hono/cookie';
import { createLogger } from '../../../concerns/logger.js';
import { createHttpClient } from '../../../concerns/http-client.js';
import { unauthorized } from '../utils/response-formatter.js';
import { applyProviderPreset, applyProviderQuirks } from './providers.js';
import { createAuthDriverRateLimiter } from '../middlewares/rate-limit.js';
import { deriveOidcKeys } from '../concerns/crypto.js';
import { OIDCResourceManager } from './resource-manager.js';
import { setChunkedCookie, getChunkedCookie, deleteChunkedCookie } from '../concerns/cookie-chunking.js';
import { validateIdToken, validateTokenResponse } from '../concerns/oidc-validator.js';
import { ErrorTypes, getErrorType, getErrorDetails, generateErrorPage, generateErrorJSON } from '../concerns/oidc-errors.js';
import { createHookExecutor, createCookieHelpers } from '../concerns/oidc-hooks.js';
import { idGenerator } from '../../../concerns/id.js';
const logger = createLogger({
    name: 'OidcAuth',
    level: (process.env.S3DB_LOG_LEVEL || 'info')
});
if (!logger || typeof logger.info !== 'function') {
    console.error('[OIDC] CRITICAL: Failed to create logger - falling back to console');
}
let httpClient = null;
async function getHttpClient() {
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
function getOidcFetchHeaders(customHeaders = {}) {
    return {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Connection': 'close',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        ...customHeaders
    };
}
/**
 * Validate OIDC configuration at startup
 */
export function validateOidcConfig(config) {
    const errors = [];
    if (!config.issuer) {
        errors.push('issuer is required');
    }
    else if (config.issuer.includes('{tenant-id}')) {
        errors.push('issuer contains placeholder {tenant-id}');
    }
    if (!config.clientId) {
        errors.push('clientId is required');
    }
    else if (config.clientId === 'your-client-id-here') {
        errors.push('clientId contains placeholder value');
    }
    if (!config.clientSecret) {
        errors.push('clientSecret is required');
    }
    else if (config.clientSecret === 'your-client-secret-here') {
        errors.push('clientSecret contains placeholder value');
    }
    if (!config.redirectUri) {
        errors.push('redirectUri is required');
    }
    if (!config.cookieSecret) {
        errors.push('cookieSecret is required');
    }
    else if (config.cookieSecret.length < 32) {
        errors.push('cookieSecret must be at least 32 characters');
    }
    else if (config.cookieSecret === 'CHANGE_THIS_SECRET' || config.cookieSecret === 'long-random-string-for-session-encryption') {
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
function applyUserMapping(claims, mapping, defaults) {
    const user = {
        id: defaults.defaultId,
        scopes: defaults.defaultScopes,
        lastLoginAt: defaults.now
    };
    for (const [userField, claimName] of Object.entries(mapping)) {
        if (userField === 'metadata')
            continue;
        if (typeof claimName === 'string' && claims[claimName] !== undefined) {
            user[userField] = claims[claimName];
        }
    }
    if (mapping.metadata) {
        if (typeof mapping.metadata === 'function') {
            user.metadata = mapping.metadata(claims);
        }
        else if (typeof mapping.metadata === 'object') {
            user.metadata = mapping.metadata;
        }
    }
    else {
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
async function getOrCreateUser(usersResource, claims, config, context, hookExecutor) {
    console.error('\n\n========== GET OR CREATE USER CALLED ==========');
    console.error('Claims received:', JSON.stringify(claims, null, 2));
    console.error('Config:', JSON.stringify(config, null, 2));
    console.error('==============================================\n\n');
    const { autoCreateUser = true, userIdClaim = 'sub', fallbackIdClaims = ['email', 'preferred_username'], lookupFields = ['email', 'preferred_username'] } = config;
    logger.info({
        allClaims: claims,
        claimKeys: Object.keys(claims),
        userIdClaim,
        userIdValue: claims[userIdClaim],
        fallbackIdClaims,
        lookupFields
    }, '[OIDC] DEBUG: Received ID Token claims');
    const candidateIds = [];
    if (userIdClaim && claims[userIdClaim]) {
        candidateIds.push(String(claims[userIdClaim]));
    }
    for (const field of fallbackIdClaims) {
        if (!field || field === userIdClaim)
            continue;
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
    let user = null;
    for (const candidate of candidateIds) {
        try {
            user = await usersResource.get(candidate, { skipCache: true });
            break;
        }
        catch {
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
            if (!field)
                continue;
            const value = claims[field];
            if (!value) {
                logger.info({ field, reason: 'no value in claims' }, '[OIDC] Skipping lookup field');
                continue;
            }
            const results = await usersResource.query({ [field]: value }, { limit: 1 });
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
        const { webpush, lastUrlId, lastLoginIp, lastLoginUserAgent, password, ...userWithoutProblematicFields } = user;
        const cleanUser = {
            ...userWithoutProblematicFields,
            lastLoginAt: now,
            name: claims.name || user.name,
            isActive: user.isActive !== undefined ? user.isActive : true,
            metadata: {
                costCenterId: user.metadata?.costCenterId,
                teamId: user.metadata?.teamId,
                needsOnboarding: user.metadata?.needsOnboarding,
                oidc: {
                    sub: claims.sub,
                    provider: config.issuer,
                    lastSync: now,
                    claims: { ...claims }
                }
            }
        };
        let hookParams = {};
        try {
            hookParams = await hookExecutor.executeHooks('beforeUserUpdate', {
                user: cleanUser,
                updates: cleanUser,
                claims,
                usersResource,
                context
            });
        }
        catch (hookError) {
            logger.error({
                error: hookError.message,
                stack: hookError.stack,
                userId: user.id,
                hook: 'beforeUserUpdate'
            }, '[OIDC] CRITICAL: `beforeUserUpdate` hook failed but login flow will continue.');
        }
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
        }
        catch (updateErr) {
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
    let newUser;
    if (config.userMapping && typeof config.userMapping === 'object') {
        newUser = applyUserMapping(claims, config.userMapping, {
            defaultId: newUserId,
            defaultScopes: config.defaultScopes || ['preset:user'],
            provider: config.issuer || '',
            now
        });
    }
    else {
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
        if (createHookParams.userData.metadata) {
            newUser.metadata = {
                ...newUser.metadata,
                ...createHookParams.userData.metadata
            };
        }
    }
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
    }
    catch (insertErr) {
        logger.error({
            error: insertErr.message,
            errorType: insertErr.constructor.name,
            userId: newUser.id?.substring(0, 15) + '...',
            stack: insertErr.stack
        }, '[OIDC] User creation failed');
        throw insertErr;
    }
}
async function refreshAccessToken(tokenEndpoint, refreshToken, clientId, clientSecret) {
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
    return await response.json();
}
/**
 * Create OIDC authentication handler and routes
 */
export async function createOIDCHandler(inputConfig, app, database, events = null) {
    const preset = applyProviderPreset('oidc', inputConfig);
    const manager = new OIDCResourceManager(database, 'oidc', inputConfig);
    const usersResource = await manager.getOrCreateResource();
    logger.debug(`OIDC driver initialized with resource: ${usersResource?.name}`);
    const config = {
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
    const { issuer, clientId, clientSecret, redirectUri, scopes, cookieSecret, cookieName, cookieMaxAge, rollingDuration, absoluteDuration, loginPath, callbackPath, logoutPath, postLoginRedirect, postLogoutRedirect, idpLogout, autoRefreshTokens = true, refreshThreshold = 300000, cookieSecure, cookieSameSite, sessionStore } = config;
    const { current: derivedKeys } = deriveOidcKeys(cookieSecret || '');
    const signingKey = derivedKeys.signing;
    const sessionCache = new WeakMap();
    const hookExecutor = createHookExecutor(config, logger);
    function generateSessionId() {
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
    async function getEndpoints(c = null) {
        if (c) {
            const cached = c.get('oidc_endpoints');
            if (cached) {
                return cached;
            }
        }
        if (config.discovery?.enabled === false) {
            const endpoints = { authorizationEndpoint, tokenEndpoint, logoutEndpoint };
            if (c)
                c.set('oidc_endpoints', endpoints);
            return endpoints;
        }
        try {
            const client = await getHttpClient();
            const res = await client.get(`${(issuer || '').replace(/\/$/, '')}/.well-known/openid-configuration`);
            if (res.ok) {
                const doc = await res.json();
                const endpoints = {
                    authorizationEndpoint: doc.authorization_endpoint || authorizationEndpoint,
                    tokenEndpoint: doc.token_endpoint || tokenEndpoint,
                    logoutEndpoint: doc.end_session_endpoint || logoutEndpoint
                };
                if (c)
                    c.set('oidc_endpoints', endpoints);
                return endpoints;
            }
        }
        catch (e) {
            if (config.logLevel) {
                logger.warn({ error: e.message }, '[OIDC] Discovery failed, using default endpoints');
            }
        }
        const endpoints = { authorizationEndpoint, tokenEndpoint, logoutEndpoint };
        if (c)
            c.set('oidc_endpoints', endpoints);
        return endpoints;
    }
    async function encodeSession(data) {
        if (sessionStore) {
            const sessionId = generateSessionId();
            await sessionStore.set(sessionId, data, cookieMaxAge || 604800000);
            return sessionId;
        }
        else {
            const jwt = await new SignJWT(data)
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuedAt()
                .setExpirationTime(`${Math.floor((cookieMaxAge || 604800000) / 1000)}s`)
                .sign(signingKey);
            return jwt;
        }
    }
    async function decodeSession(idOrJwt) {
        if (sessionStore) {
            try {
                return await sessionStore.get(idOrJwt);
            }
            catch (err) {
                logger.error({ error: err.message }, '[OIDC] Session store get error');
                return null;
            }
        }
        else {
            try {
                const { payload } = await jwtVerify(idOrJwt, signingKey);
                return payload;
            }
            catch {
                return null;
            }
        }
    }
    async function getCachedSession(c, sessionCookieName) {
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
    async function deleteSessionCookie(c, name, options = {}, contextOptions = {}) {
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
                }
                catch (err) {
                    logger.error({ error: err.message }, '[OIDC] Session store destroy error');
                }
            }
            else if (contextOptions.logMissing !== false) {
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
    async function regenerateSession(c, sessionData) {
        const sessionCookieName = config.cookieName || 'oidc_session';
        const cookieJar = getCookie(c) || {};
        const previousSessionToken = getChunkedCookie(c, sessionCookieName, cookieJar);
        if (sessionStore) {
            if (previousSessionToken) {
                try {
                    await sessionStore.destroy(previousSessionToken);
                }
                catch (err) {
                    logger.error({ error: err.message }, '[OIDC] Session store destroy error during regeneration');
                }
            }
            else {
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
    async function refreshTokens(c, refreshToken) {
        if (!refreshToken)
            return null;
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
            return await response.json();
        }
        catch (err) {
            const logLevel = c.get('logLevel');
            if (logLevel === 'debug' || logLevel === 'trace') {
                logger.warn({ error: err.message }, '[OIDC] Token refresh error');
            }
            return null;
        }
    }
    function validateSessionDuration(session) {
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
    function generateState() {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
    function reconstructExternalUrl(externalUrl, originalUrl) {
        if (!externalUrl)
            return originalUrl;
        try {
            const external = new URL(externalUrl);
            const original = new URL(originalUrl);
            external.pathname = `${external.pathname.replace(/\/$/, '')}${original.pathname}`;
            external.search = original.search;
            external.hash = original.hash;
            return external.toString();
        }
        catch {
            return originalUrl;
        }
    }
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
    async function createPkcePair() {
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
    function decodeIdToken(idToken) {
        try {
            const parts = idToken.split('.');
            if (parts.length !== 3 || !parts[1])
                return null;
            const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
            return JSON.parse(payload);
        }
        catch {
            return null;
        }
    }
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
    let rateLimiter = null;
    if (config.rateLimit && typeof config.rateLimit === 'object' && config.rateLimit.enabled) {
        rateLimiter = createAuthDriverRateLimiter('oidc', config.rateLimit);
    }
    // LOGIN Route
    app.get(loginPath || '/auth/login', async (c) => {
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
            let codeVerifier = null;
            let codeChallenge = null;
            const pkceEnabled = config.pkce?.enabled !== false;
            if (pkceEnabled) {
                try {
                    const pair = await createPkcePair();
                    codeVerifier = pair.verifier;
                    codeChallenge = pair.challenge;
                }
                catch (e) {
                    logger.warn({ error: e.message }, '[OIDC] PKCE generation failed');
                }
            }
            const stateJWT = await encodeSession({
                state,
                returnTo: continueUrl,
                nonce,
                code_verifier: codeVerifier,
                type: 'csrf',
                expires: Date.now() + 600000
            });
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
            let stateId = null;
            if (useServerSideState) {
                stateId = idGenerator();
                const globalStore = globalThis;
                if (!globalStore.__oidc_state_store)
                    globalStore.__oidc_state_store = new Map();
                if (!globalStore.__oidc_state_mapping)
                    globalStore.__oidc_state_mapping = new Map();
                globalStore.__oidc_state_store.set(stateId, {
                    data: stateJWT,
                    expires: Date.now() + 600000
                });
                globalStore.__oidc_state_mapping.set(state, stateId);
                logger.warn({
                    baseURL: config.baseURL,
                    stateStorage: 'server-side',
                    state: state.substring(0, 8) + '...',
                    stateId: stateId.substring(0, 8) + '...'
                }, '[OIDC] DEV MODE: Using server-side state storage');
            }
            else {
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
            applyProviderQuirks(authUrl, issuer || '', config);
            return c.redirect(authUrl.toString(), 302);
        }
        catch (error) {
            logger.error({
                error: error.message,
                stack: error.stack,
                returnTo: c.req.query('returnTo'),
                baseURL: config.baseURL,
                issuer: config.issuer
            }, '[OIDC] Login handler exception');
            return c.json({
                error: 'login_failed',
                message: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }, 500);
        }
    });
    // CALLBACK Route
    const callbackHandler = async (c) => {
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
        let extractedStateId = null;
        if (!stateCookie && state) {
            const stateParts = state.split(':');
            const stateValue = stateParts[0] || '';
            const stateIdFromParam = stateParts.length > 1 ? stateParts[1] : null;
            const globalStore = globalThis;
            if (stateIdFromParam && globalStore.__oidc_state_store) {
                const stored = globalStore.__oidc_state_store.get(stateIdFromParam);
                if (stored && stored.expires > Date.now()) {
                    stateCookie = stored.data;
                    stateSource = 'server-side';
                    extractedStateId = stateIdFromParam;
                    globalStore.__oidc_state_store.delete(stateIdFromParam);
                }
            }
            if (!stateCookie && globalStore.__oidc_state_mapping && globalStore.__oidc_state_store) {
                const mappedStateId = globalStore.__oidc_state_mapping.get(stateValue);
                if (mappedStateId) {
                    const stored = globalStore.__oidc_state_store.get(mappedStateId);
                    if (stored && stored.expires > Date.now()) {
                        stateCookie = stored.data;
                        stateSource = 'server-side';
                        extractedStateId = mappedStateId;
                        globalStore.__oidc_state_store.delete(mappedStateId);
                        globalStore.__oidc_state_mapping.delete(stateValue);
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
        const stateData = await decodeSession(stateCookie);
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
            const tokens = await tokenResponse.json();
            const tokenValidation = validateTokenResponse(tokens, config);
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
            const idTokenValidation = validateIdToken(idTokenClaims, config, {
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
                        }
                        catch (hookErr) {
                            if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
                                logger.error({ hookErr }, '[OIDC] onUserAuthenticated hook failed');
                            }
                        }
                    }
                }
                catch (err) {
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
                }
            }
            const now = Date.now();
            const sessionData = {
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
            const auth = createCookieHelpers(c, config);
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
        }
        catch (err) {
            logger.error({ err }, '[OIDC] Error during token exchange');
            return c.json({ error: 'Authentication failed' }, 500);
        }
    };
    if (rateLimiter) {
        app.get(callbackPath || '/auth/callback', rateLimiter, callbackHandler);
    }
    else {
        app.get(callbackPath || '/auth/callback', callbackHandler);
    }
    // LOGOUT Route
    app.get(logoutPath || '/auth/logout', async (c) => {
        const sessionCookie = getChunkedCookie(c, cookieName || 'oidc_session');
        let idToken;
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
    function matchPath(path, pattern) {
        if (pattern === path)
            return true;
        const regexPattern = pattern
            .replace(/\*\*/g, '___GLOBSTAR___')
            .replace(/\*/g, '[^/]*')
            .replace(/___GLOBSTAR___/g, '.*')
            .replace(/\//g, '\\/')
            + '$';
        const regex = new RegExp('^' + regexPattern);
        return regex.test(path);
    }
    const middleware = async (c, next) => {
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
            }
            else {
                const response = unauthorized('Authentication required');
                return c.json(response, response._status);
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
            }
            else {
                const response = unauthorized('User account is inactive');
                return c.json(response, response._status);
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
        c.set('user', enrichParams.mergedUser || sessionUser);
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
            setChunkedCookie(c, cookieName || 'oidc_session', updatedSessionJWT, {
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
            getCachedSession: (c) => getCachedSession(c, config.cookieName || 'oidc_session'),
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
        get: () => { }
    };
    const handler = createOIDCHandler(config, noopApp, {}, dependencies.events || null);
    return handler.then(h => h.utils);
}
//# sourceMappingURL=oidc-auth.js.map