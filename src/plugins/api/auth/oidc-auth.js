/**
 * OIDC Authentication Driver (Authorization Code Flow)
 *
 * Implements OpenID Connect Authorization Code Flow for client applications.
 * Redirects users to SSO server for login, exchanges authorization code for tokens,
 * and maintains session with cookies.
 *
 * Use this driver when you want "Login with SSO" functionality in your application.
 *
 * @example
 * {
 *   driver: 'oidc',
 *   config: {
 *     issuer: 'http://localhost:4000',
 *     clientId: 'app-client-123',
 *     clientSecret: 'super-secret-key-456',
 *     redirectUri: 'http://localhost:3000/auth/callback',
 *     scopes: ['openid', 'profile', 'email'],
 *     cookieSecret: 'my-cookie-secret-32-chars!!!',
 *     cookieName: 'oidc_session',
 *     cookieMaxAge: 86400000  // 24 hours
 *   }
 * }
 */

import { SignJWT, jwtVerify } from 'jose';

/**
 * Create OIDC authentication handler and routes
 * @param {Object} config - OIDC configuration
 * @param {Object} app - Hono app instance
 * @param {Object} usersResource - s3db.js users resource
 * @returns {Object} Routes and middleware
 */
export function createOIDCHandler(config, app, usersResource) {
  const {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    scopes = ['openid', 'profile', 'email'],
    cookieSecret,
    cookieName = 'oidc_session',
    cookieMaxAge = 86400000, // 24 hours
    loginPath = '/auth/login',
    callbackPath = '/auth/callback',
    logoutPath = '/auth/logout',
    postLoginRedirect = '/',
    postLogoutRedirect = '/'
  } = config;

  if (!issuer) throw new Error('[OIDC Auth] Missing required config: issuer');
  if (!clientId) throw new Error('[OIDC Auth] Missing required config: clientId');
  if (!clientSecret) throw new Error('[OIDC Auth] Missing required config: clientSecret');
  if (!redirectUri) throw new Error('[OIDC Auth] Missing required config: redirectUri');
  if (!cookieSecret) throw new Error('[OIDC Auth] Missing required config: cookieSecret (32+ chars)');

  // OAuth2 endpoints
  const authorizationEndpoint = `${issuer}/oauth/authorize`;
  const tokenEndpoint = `${issuer}/oauth/token`;
  const userinfoEndpoint = `${issuer}/oauth/userinfo`;
  const endSessionEndpoint = `${issuer}/oauth/logout`;

  /**
   * Encode session data as signed JWT (stored in cookie)
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
   * Decode and verify session JWT from cookie
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
   * Generate random state for CSRF protection
   */
  function generateState() {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  // ==================== ROUTES ====================

  /**
   * LOGIN Route - Redirects to SSO authorization endpoint
   * GET /auth/login
   */
  app.get(loginPath, async (c) => {
    // Generate CSRF state
    const state = generateState();

    // Store state in session cookie (short-lived)
    const stateJWT = await encodeSession({ state, type: 'csrf' });
    c.header('Set-Cookie', `${cookieName}_state=${stateJWT}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax`);

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state
    });

    const authUrl = `${authorizationEndpoint}?${params.toString()}`;

    // Redirect to SSO
    return c.redirect(authUrl, 302);
  });

  /**
   * CALLBACK Route - Receives authorization code and exchanges for tokens
   * GET /auth/callback?code=xxx&state=xxx
   */
  app.get(callbackPath, async (c) => {
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
        console.error('[OIDC Auth] Token exchange failed:', error);
        return c.json({ error: 'Failed to exchange code for tokens' }, 500);
      }

      const tokens = await tokenResponse.json();

      // Store tokens in session cookie
      const sessionJWT = await encodeSession({
        access_token: tokens.access_token,
        id_token: tokens.id_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000)
      });

      c.header('Set-Cookie', `${cookieName}=${sessionJWT}; Path=/; HttpOnly; Max-Age=${Math.floor(cookieMaxAge / 1000)}; SameSite=Lax`);

      // Redirect to post-login page
      return c.redirect(postLoginRedirect, 302);

    } catch (err) {
      console.error('[OIDC Auth] Error during token exchange:', err);
      return c.json({ error: 'Authentication failed' }, 500);
    }
  });

  /**
   * LOGOUT Route - Clears session and optionally redirects to SSO logout
   * GET /auth/logout
   */
  app.get(logoutPath, async (c) => {
    // Get session to extract id_token (for SSO logout)
    const sessionCookie = c.req.cookie(cookieName);
    let idToken = null;

    if (sessionCookie) {
      const session = await decodeSession(sessionCookie);
      idToken = session?.id_token;
    }

    // Clear session cookie
    c.header('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; Max-Age=0`);

    // Redirect to SSO logout endpoint (optional)
    if (idToken && endSessionEndpoint) {
      const params = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: `${postLogoutRedirect}`
      });
      return c.redirect(`${endSessionEndpoint}?${params.toString()}`, 302);
    }

    // Or just redirect to post-logout page
    return c.redirect(postLogoutRedirect, 302);
  });

  // ==================== MIDDLEWARE ====================

  /**
   * Authentication middleware - Validates session cookie
   */
  const middleware = async (c, next) => {
    const sessionCookie = c.req.cookie(cookieName);

    if (!sessionCookie) {
      return await next(); // No session, try next auth method
    }

    const session = await decodeSession(sessionCookie);

    if (!session || !session.access_token) {
      return await next(); // Invalid session
    }

    // Check if token expired
    if (session.expires_at && Date.now() > session.expires_at) {
      // TODO: Refresh token logic
      return await next();
    }

    // Decode id_token to get user info (without verification - just for claims)
    let userInfo = {};
    if (session.id_token) {
      try {
        const parts = session.id_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          userInfo = {
            id: payload.sub,
            email: payload.email,
            username: payload.preferred_username || payload.username || payload.email,
            name: payload.name,
            picture: payload.picture,
            role: payload.role || 'user',
            scopes: payload.scope ? payload.scope.split(' ') : (payload.scopes || [])
          };
        }
      } catch (err) {
        console.error('[OIDC Auth] Failed to decode id_token:', err);
      }
    }

    // Optionally fetch user from database
    let user = null;
    if (usersResource && userInfo.id) {
      try {
        user = await usersResource.get(userInfo.id).catch(() => null);

        // Try by email if not found by ID
        if (!user && userInfo.email) {
          const users = await usersResource.query({ email: userInfo.email }, { limit: 1 });
          user = users[0] || null;
        }
      } catch (err) {
        // User not in database
      }
    }

    // Set user in context
    c.set('user', user || {
      ...userInfo,
      active: true,
      isVirtual: true, // Not in local database
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }
    });

    return await next();
  };

  return {
    middleware,
    routes: {
      [loginPath]: 'Login (redirect to SSO)',
      [callbackPath]: 'OAuth2 callback',
      [logoutPath]: 'Logout'
    }
  };
}

export default createOIDCHandler;
