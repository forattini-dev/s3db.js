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
 * @example
 * {
 *   driver: 'oidc',
 *   config: {
 *     issuer: 'http://localhost:4000',
 *     clientId: 'app-client-123',
 *     clientSecret: 'super-secret-key-456',
 *     redirectUri: 'http://localhost:3000/auth/callback',
 *     scopes: ['openid', 'profile', 'email', 'offline_access'],
 *     cookieSecret: 'my-cookie-secret-32-chars!!!',
 *     rollingDuration: 86400000,  // 24 hours
 *     absoluteDuration: 604800000, // 7 days
 *     idpLogout: true,
 *     autoCreateUser: true,
 *     // 🎯 Hook: Called after user is authenticated
 *     onUserAuthenticated: async ({ user, created, claims, tokens, context }) => {
 *       if (created) {
 *         // User was just created - create profile, send welcome email, etc.
 *         await db.resources.profiles.insert({
 *           id: `profile-${user.id}`,
 *           userId: user.id,
 *           bio: '',
 *           onboarded: false
 *         });
 *       }
 *
 *       // Set cookie with API token
 *       context.cookie('api_token', user.apiToken, {
 *         httpOnly: true,
 *         secure: true,
 *         sameSite: 'Lax',
 *         maxAge: 7 * 24 * 60 * 60  // 7 days
 *       });
 *     }
 *   }
 * }
 */

import { SignJWT, jwtVerify } from 'jose';
import { unauthorized } from '../utils/response-formatter.js';
import { createAuthDriverRateLimiter } from '../middlewares/rate-limit.js';

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
    if (config?.verbose) {
      console.warn('[OIDC] clientId is not in UUID format (may be expected for some providers)');
    }
  }

  if (errors.length > 0) {
    throw new Error(`OIDC driver configuration is invalid:\n${errors.map(e => `  - ${e}`).join('\n')}\n\nSee documentation for configuration requirements.`);
  }
}

/**
 * Get or create user from OIDC claims
 * @param {Object} usersResource - s3db.js users resource
 * @param {Object} claims - ID token claims
 * @param {Object} config - OIDC config
 * @returns {Promise<{user: Object, created: boolean}>} User object and creation status
 */
async function getOrCreateUser(usersResource, claims, config) {
  const {
    autoCreateUser = true,
    userIdClaim = 'sub',
    fallbackIdClaims = ['email', 'preferred_username'],
    lookupFields = ['email', 'preferred_username']
  } = config;

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

  let user = null;
  // Try direct lookups by id
  for (const candidate of candidateIds) {
    try {
      user = await usersResource.get(candidate);
      break;
    } catch (_) {
      // Not found, continue with next candidate
    }
  }

  // Fallback: query by lookup fields
  if (!user) {
    const fields = Array.isArray(lookupFields) ? lookupFields : [lookupFields];
    for (const field of fields) {
      if (!field) continue;
      const value = claims[field];
      if (!value) continue;
      const results = await usersResource.query({ [field]: value }, { limit: 1 });
      if (results.length > 0) {
        user = results[0];
        break;
      }
    }
  }

  const now = new Date().toISOString();

  if (user) {
    // Update existing user
    const updates = {
      lastLoginAt: now,
      metadata: {
        ...user.metadata,
        oidc: {
          sub: claims.sub,
          provider: config.issuer,
          lastSync: now,
          claims: {
            name: claims.name,
            email: claims.email,
            picture: claims.picture
          }
        }
      }
    };

    // Update name if changed
    if (claims.name && claims.name !== user.name) {
      updates.name = claims.name;
    }

    // Call beforeUpdateUser hook if configured (allows refreshing external API data)
    if (config.beforeUpdateUser && typeof config.beforeUpdateUser === 'function') {
      try {
        const enrichedData = await config.beforeUpdateUser({
          user,
          updates,
          claims,
          usersResource
        });

        // Merge enriched data into updates
        if (enrichedData && typeof enrichedData === 'object') {
          Object.assign(updates, enrichedData);
          // Deep merge metadata
          if (enrichedData.metadata) {
            updates.metadata = {
              ...updates.metadata,
              ...enrichedData.metadata
            };
          }
        }
      } catch (hookErr) {
          if (c.get('verbose')) {
            console.error('[OIDC] beforeUpdateUser hook failed:', hookErr);
          }
        // Continue with default updates (don't block auth)
      }
    }

    user = await usersResource.update(userId, updates);
    return { user, created: false };
  }

  if (!autoCreateUser) {
    return { user: null, created: false };
  }

  // Determine ID for new user
  const newUserId = candidateIds[0];

  if (!newUserId) {
    throw new Error('Cannot determine user ID from OIDC claims');
  }

  const newUser = {
    id: newUserId,
    email: claims.email || newUserId,
    username: claims.preferred_username || claims.email || newUserId,
    name: claims.name || claims.email || newUserId,
    picture: claims.picture || null,
    role: config.defaultRole || 'user',
    scopes: config.defaultScopes || ['openid', 'profile', 'email'],
    active: true,
    apiKey: null, // Will be generated on first API usage if needed
    lastLoginAt: now,
    metadata: {
      oidc: {
        sub: claims.sub,
        provider: config.issuer,
        createdAt: now,
        claims: {
          name: claims.name,
          email: claims.email,
          picture: claims.picture
        }
      },
      costCenterId: config.defaultCostCenter || null,
      teamId: config.defaultTeam || null
    }
  };

  // Call beforeCreateUser hook if configured (allows enriching with external API data)
  if (config.beforeCreateUser && typeof config.beforeCreateUser === 'function') {
    try {
      const enrichedData = await config.beforeCreateUser({
        user: newUser,
        claims,
        usersResource
      });

      // Merge enriched data into newUser
      if (enrichedData && typeof enrichedData === 'object') {
        Object.assign(newUser, enrichedData);
        // Deep merge metadata
        if (enrichedData.metadata) {
          newUser.metadata = {
            ...newUser.metadata,
            ...enrichedData.metadata
          };
        }
      }
    } catch (hookErr) {
      if (c.get('verbose')) {
        console.error('[OIDC] beforeCreateUser hook failed:', hookErr);
      }
      // Continue with default user data (don't block auth)
    }
  }

  user = await usersResource.insert(newUser);
  return { user, created: true };
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(tokenEndpoint, refreshToken, clientId, clientSecret) {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
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
export function createOIDCHandler(config, app, usersResource, events = null) {
  // Apply defaults
  const finalConfig = {
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
    defaultRole: 'user',
    defaultScopes: ['openid', 'profile', 'email'],
    rateLimit: config.rateLimit !== undefined ? config.rateLimit : {
      enabled: true,
      windowMs: 900000, // 15 minutes
      maxAttempts: 5,
      skipSuccessfulRequests: true
    },
    ...config
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
    autoRefreshTokens,
    refreshThreshold,
    cookieSecure,
    cookieSameSite
  } = finalConfig;

  // OAuth2 endpoints
  const authorizationEndpoint = `${issuer}/oauth/authorize`;
  const tokenEndpoint = `${issuer}/oauth/token`;
  const logoutEndpoint = `${issuer}/oauth2/v2.0/logout`; // Azure AD format

  /**
   * Encode session data as signed JWT
   */
  async function encodeSession(data) {
    const secret = new TextEncoder().encode(cookieSecret);
    const jwt = await new SignJWT(data)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${Math.floor(cookieMaxAge / 1000)}s`)
      .sign(secret);
    return jwt;
  }

  /**
   * Decode and verify session JWT
   */
  async function decodeSession(jwt) {
    try {
      const secret = new TextEncoder().encode(cookieSecret);
      const { payload } = await jwtVerify(jwt, secret);
      return payload;
    } catch (err) {
      return null;
    }
  }

  /**
   * Validate session (rolling + absolute duration)
   */
  function validateSessionDuration(session) {
    const now = Date.now();

    // Check absolute expiry
    if (session.issued_at + absoluteDuration < now) {
      return { valid: false, reason: 'absolute_expired' };
    }

    // Check rolling expiry
    if (session.last_activity + rollingDuration < now) {
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

  // ==================== ROUTES ====================

  // Create rate limiter if enabled
  let rateLimiter = null;
  if (finalConfig.rateLimit?.enabled) {
    rateLimiter = createAuthDriverRateLimiter('oidc', finalConfig.rateLimit);
  }

  /**
   * LOGIN Route
   */
  app.get(loginPath, async (c) => {
    const state = generateState();
    const returnTo = c.req.query('returnTo') || postLoginRedirect;

    // Store state and returnTo in short-lived cookie
    const stateJWT = await encodeSession({
      state,
      returnTo,
      type: 'csrf',
      expires: Date.now() + 600000
    });
    c.header('Set-Cookie', `${cookieName}_state=${stateJWT}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax`);

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state
    });

    return c.redirect(`${authorizationEndpoint}?${params.toString()}`, 302);
  });

  /**
   * CALLBACK Route (with rate limiting)
   */
  const callbackHandler = async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');

    // Validate CSRF state
    const stateCookie = c.req.cookie(`${cookieName}_state`);
    if (!stateCookie) {
      return c.json({ error: 'Missing state cookie (CSRF protection)' }, 400);
    }

    const stateData = await decodeSession(stateCookie);
    if (!stateData || stateData.state !== state) {
      return c.json({ error: 'Invalid state (CSRF protection)' }, 400);
    }

    // Clear state cookie
    c.header('Set-Cookie', `${cookieName}_state=; Path=/; HttpOnly; Max-Age=0`);

    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400);
    }

    // Exchange code for tokens
    try {
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        if (c.get('verbose')) {
          console.error('[OIDC] Token exchange failed:', error);
        }
        return c.json({ error: 'Failed to exchange code for tokens' }, 500);
      }

      const tokens = await tokenResponse.json();

      // Decode id_token claims
      const idTokenClaims = decodeIdToken(tokens.id_token);
      if (!idTokenClaims) {
        return c.json({ error: 'Failed to decode id_token' }, 500);
      }

      // Auto-create/update user
      let user = null;
      let userCreated = false;
      if (usersResource) {
        try {
          const result = await getOrCreateUser(usersResource, idTokenClaims, finalConfig);
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
                provider: finalConfig.issuer
              });
            }

            events.emitUserEvent('login', {
              user: { id: user.id, email: user.email, name: user.name },
              source: 'oidc',
              provider: finalConfig.issuer,
              newUser: userCreated
            });
          }

          // Call onUserAuthenticated hook if configured
          if (finalConfig.onUserAuthenticated && typeof finalConfig.onUserAuthenticated === 'function') {
            try {
              await finalConfig.onUserAuthenticated({
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
              if (c.get('verbose')) {
                console.error('[OIDC] onUserAuthenticated hook failed:', hookErr);
              }
              // Don't block authentication if hook fails
            }
          }
        } catch (err) {
          if (c.get('verbose')) {
            console.error('[OIDC] Failed to create/update user:', err);
          }
          // Continue without user (will use token claims only)
        }
      }

      // Create session with user data
      const now = Date.now();
      const sessionData = {
        access_token: tokens.access_token,
        id_token: tokens.id_token,
        refresh_token: tokens.refresh_token,
        expires_at: now + (tokens.expires_in * 1000),
        issued_at: now,
        last_activity: now,

        // User data (avoid DB lookup on every request)
        user: user ? {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          picture: user.picture,
          role: user.role,
          scopes: user.scopes,
          active: user.active,
          metadata: {
            costCenterId: user.metadata?.costCenterId,
            teamId: user.metadata?.teamId
          }
        } : {
          id: idTokenClaims.sub,
          email: idTokenClaims.email,
          username: idTokenClaims.preferred_username || idTokenClaims.email,
          name: idTokenClaims.name,
          picture: idTokenClaims.picture,
          role: 'user',
          scopes: scopes,
          active: true,
          isVirtual: true
        }
      };

      const sessionJWT = await encodeSession(sessionData);

      // Set session cookie
      const cookieOptions = [
        `${cookieName}=${sessionJWT}`,
        'Path=/',
        'HttpOnly',
        `Max-Age=${Math.floor(cookieMaxAge / 1000)}`,
        `SameSite=${cookieSameSite}`
      ];

      if (cookieSecure) {
        cookieOptions.push('Secure');
      }

      c.header('Set-Cookie', cookieOptions.join('; '));

      // Redirect to original destination or default post-login page
      const redirectUrl = stateData.returnTo || postLoginRedirect;
      return c.redirect(redirectUrl, 302);

    } catch (err) {
      if (c.get('verbose')) {
        console.error('[OIDC] Error during token exchange:', err);
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
    const sessionCookie = c.req.cookie(cookieName);
    let idToken = null;

    if (sessionCookie) {
      const session = await decodeSession(sessionCookie);
      idToken = session?.id_token;
    }

    // Clear session cookie
    c.header('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Max-Age=0`);

    // IdP logout (Azure AD/Entra compatible)
    if (idpLogout && idToken) {
      const params = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: `${postLogoutRedirect}`
      });
      return c.redirect(`${logoutEndpoint}?${params.toString()}`, 302);
    }

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
    const protectedPaths = finalConfig.protectedPaths || [];
    const currentPath = c.req.path;

    // Skip auth routes (login, callback, logout)
    if (currentPath === loginPath || currentPath === callbackPath || currentPath === logoutPath) {
      return await next();
    }

    // If protectedPaths is configured, only enforce OIDC on matching paths
    if (protectedPaths.length > 0) {
      const isProtected = protectedPaths.some(pattern => matchPath(currentPath, pattern));

      if (!isProtected) {
        // Not a protected path, skip OIDC check (allows other auth methods)
        return await next();
      }
    }

    const sessionCookie = c.req.cookie(cookieName);

    if (!sessionCookie) {
      // No session - redirect to login or return 401
      // Content negotiation: check if client expects HTML
      const acceptHeader = c.req.header('accept') || '';
      const acceptsHtml = acceptHeader.includes('text/html');

      if (acceptsHtml) {
        // Browser request - redirect to login
        const returnTo = encodeURIComponent(currentPath);
        return c.redirect(`${loginPath}?returnTo=${returnTo}`, 302);
      } else {
        // API request - return JSON 401
        const response = unauthorized('Authentication required');
        return c.json(response, response._status);
      }
    }

    const session = await decodeSession(sessionCookie);

    if (!session || !session.access_token) {
      return await next();
    }

    // Validate session duration
    const validation = validateSessionDuration(session);
    if (!validation.valid) {
      // Session expired, clear cookie
      c.header('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Max-Age=0`);
      return await next();
    }

    // Auto-refresh tokens if needed
    if (autoRefreshTokens && session.refresh_token && session.expires_at) {
      const timeUntilExpiry = session.expires_at - Date.now();

      if (timeUntilExpiry < refreshThreshold) {
        try {
          const newTokens = await refreshAccessToken(
            tokenEndpoint,
            session.refresh_token,
            clientId,
            clientSecret
          );

          session.access_token = newTokens.access_token;
          session.expires_at = Date.now() + (newTokens.expires_in * 1000);

          // If new refresh token provided, update it
          if (newTokens.refresh_token) {
            session.refresh_token = newTokens.refresh_token;
          }
        } catch (err) {
          if (c.get('verbose')) {
            console.error('[OIDC] Token refresh failed:', err);
          }
          // Continue with existing token (will expire soon)
        }
      }
    }

    // Update last_activity (rolling session)
    session.last_activity = Date.now();

    // Check if user is active (if field exists)
    if (session.user.active !== undefined && !session.user.active) {
      // User account is inactive, clear session
      c.header('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Max-Age=0`);

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

    // Set user in context
    c.set('user', {
      ...session.user,
      authMethod: 'oidc',
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at
      }
    });

    // Re-encode session with updated last_activity and tokens
    const newSessionJWT = await encodeSession(session);

    const cookieOptions = [
      `${cookieName}=${newSessionJWT}`,
      'Path=/',
      'HttpOnly',
      `Max-Age=${Math.floor(cookieMaxAge / 1000)}`,
      `SameSite=${cookieSameSite}`
    ];

    if (cookieSecure) {
      cookieOptions.push('Secure');
    }

    c.header('Set-Cookie', cookieOptions.join('; '));

    return await next();
  };

  return {
    middleware,
    routes: {
      [loginPath]: 'Login (redirect to SSO)',
      [callbackPath]: 'OAuth2 callback',
      [logoutPath]: 'Logout (local + IdP)'
    },
    config: finalConfig
  };
}

export default createOIDCHandler;
