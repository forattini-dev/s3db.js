/**
 * OIDC Backchannel Logout - OpenID Connect Back-Channel Logout 1.0
 *
 * Enables IDP-initiated logout. When a user logs out at the IDP,
 * the IDP sends a logout token to all registered clients.
 *
 * @module api/concerns/oidc-backchannel-logout
 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html
 */

import { jwtVerify, decodeJwt } from 'jose';

/**
 * Verify backchannel logout token
 *
 * @param {string} logoutToken - Logout token JWT
 * @param {Object} config - OIDC configuration
 * @param {Buffer} signingKey - Signing key for verification
 * @returns {Promise<Object>} Decoded and verified logout token claims
 */
export async function verifyBackchannelLogoutToken(logoutToken, config, signingKey) {
  try {
    // Verify JWT signature and claims
    const { payload } = await jwtVerify(logoutToken, signingKey, {
      issuer: config.issuer,
      audience: config.clientId,
      clockTolerance: 60  // 60 seconds tolerance
    });

    // Validate logout token specific claims
    const validation = validateLogoutTokenClaims(payload);
    if (!validation.valid) {
      throw new Error(`Invalid logout token: ${validation.errors.join(', ')}`);
    }

    return payload;
  } catch (err) {
    throw new Error(`Logout token verification failed: ${err.message}`);
  }
}

/**
 * Validate logout token claims according to spec
 *
 * @param {Object} claims - Decoded logout token claims
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export function validateLogoutTokenClaims(claims) {
  const errors = [];

  // 1. Must have "events" claim with "http://schemas.openid.net/event/backchannel-logout"
  if (!claims.events) {
    errors.push('Missing "events" claim');
  } else {
    const hasBackchannelEvent = claims.events['http://schemas.openid.net/event/backchannel-logout'];
    if (!hasBackchannelEvent) {
      errors.push('Missing backchannel-logout event in "events" claim');
    }
  }

  // 2. Must have either "sub" or "sid" (or both)
  if (!claims.sub && !claims.sid) {
    errors.push('Must have either "sub" (subject) or "sid" (session ID) claim');
  }

  // 3. Must NOT have "nonce" claim (distinguishes from ID token)
  if (claims.nonce !== undefined) {
    errors.push('Logout token must NOT contain "nonce" claim');
  }

  // 4. Must have standard OIDC claims
  if (!claims.iss) {
    errors.push('Missing "iss" (issuer) claim');
  }

  if (!claims.aud) {
    errors.push('Missing "aud" (audience) claim');
  }

  if (!claims.iat) {
    errors.push('Missing "iat" (issued at) claim');
  }

  if (!claims.jti) {
    errors.push('Missing "jti" (JWT ID) claim for replay protection');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Find sessions to logout based on logout token
 *
 * @param {Object} logoutToken - Verified logout token claims
 * @param {Object} sessionStore - Session store instance
 * @returns {Promise<Array<string>>} Session IDs to logout
 */
export async function findSessionsToLogout(logoutToken, sessionStore) {
  const sessionsToLogout = [];

  // If session store supports querying by sub/sid
  if (typeof sessionStore.findBySub === 'function' && logoutToken.sub) {
    const sessions = await sessionStore.findBySub(logoutToken.sub);
    sessionsToLogout.push(...sessions);
  }

  if (typeof sessionStore.findBySid === 'function' && logoutToken.sid) {
    const sessions = await sessionStore.findBySid(logoutToken.sid);
    sessionsToLogout.push(...sessions);
  }

  // Fallback: if store doesn't support querying, return empty array
  // (application must implement custom logic)
  return sessionsToLogout;
}

/**
 * Handle backchannel logout request
 *
 * @param {Object} context - Request context
 * @param {Object} config - OIDC configuration
 * @param {Buffer} signingKey - Signing key for verification
 * @param {Object} sessionStore - Session store instance
 * @returns {Promise<Object>} { success: boolean, sessionsLoggedOut: number, error?: string }
 */
export async function handleBackchannelLogout(context, config, signingKey, sessionStore) {
  try {
    // Get logout token from request body
    const body = await context.req.parseBody();
    const logoutToken = body.logout_token;

    if (!logoutToken) {
      return {
        success: false,
        error: 'Missing logout_token parameter',
        statusCode: 400
      };
    }

    // Verify logout token
    const claims = await verifyBackchannelLogoutToken(logoutToken, config, signingKey);

    // Find sessions to logout
    const sessionIds = await findSessionsToLogout(claims, sessionStore);

    // Logout sessions
    let loggedOut = 0;
    for (const sessionId of sessionIds) {
      try {
        await sessionStore.destroy(sessionId);
        loggedOut++;
      } catch (err) {
        console.error(`[OIDC] Failed to destroy session ${sessionId}:`, err.message);
      }
    }

    // Emit logout event if configured
    if (config.onBackchannelLogout && typeof config.onBackchannelLogout === 'function') {
      try {
        await config.onBackchannelLogout({
          claims,
          sessionIds,
          loggedOut
        });
      } catch (err) {
        console.error('[OIDC] onBackchannelLogout hook failed:', err.message);
      }
    }

    return {
      success: true,
      sessionsLoggedOut: loggedOut,
      statusCode: 200
    };
  } catch (err) {
    console.error('[OIDC] Backchannel logout error:', err.message);
    return {
      success: false,
      error: err.message,
      statusCode: 400
    };
  }
}

/**
 * Register backchannel logout route
 *
 * @param {Object} app - Hono app instance
 * @param {string} path - Logout endpoint path
 * @param {Object} config - OIDC configuration
 * @param {Buffer} signingKey - Signing key for verification
 * @param {Object} sessionStore - Session store instance
 */
export function registerBackchannelLogoutRoute(app, path, config, signingKey, sessionStore) {
  if (!sessionStore) {
    throw new Error('Backchannel logout requires a session store');
  }

  app.post(path, async (c) => {
    const result = await handleBackchannelLogout(c, config, signingKey, sessionStore);

    if (result.success) {
      return c.text('', result.statusCode);
    } else {
      return c.json({ error: result.error }, result.statusCode);
    }
  });
}

/**
 * Check if provider supports backchannel logout
 *
 * @param {Object} discoveryDoc - OpenID Discovery document
 * @returns {boolean} True if backchannel logout is supported
 */
export function providerSupportsBackchannelLogout(discoveryDoc) {
  return discoveryDoc?.backchannel_logout_supported === true;
}

/**
 * Get backchannel logout URI for provider registration
 *
 * @param {string} baseUrl - Application base URL
 * @param {string} logoutPath - Logout endpoint path
 * @returns {string} Full backchannel logout URI
 */
export function getBackchannelLogoutUri(baseUrl, logoutPath = '/auth/backchannel-logout') {
  const url = new URL(logoutPath, baseUrl);
  return url.toString();
}

/**
 * Validate backchannel logout configuration
 *
 * @param {Object} config - OIDC configuration
 * @param {Object} discoveryDoc - OpenID Discovery document
 * @returns {Object} { valid: boolean, errors: Array<string>, warnings: Array<string> }
 */
export function validateBackchannelLogoutConfig(config, discoveryDoc) {
  const errors = [];
  const warnings = [];

  if (!providerSupportsBackchannelLogout(discoveryDoc)) {
    errors.push('Provider does not support backchannel logout (backchannel_logout_supported is false or missing)');
  }

  if (!config.sessionStore) {
    errors.push('Backchannel logout requires sessionStore to be configured');
  }

  if (!config.backchannelLogoutUri) {
    warnings.push('backchannelLogoutUri not configured. You must register this URI with your provider.');
  }

  // Check if session store supports querying
  if (config.sessionStore) {
    const supportsFindBySub = typeof config.sessionStore.findBySub === 'function';
    const supportsFindBySid = typeof config.sessionStore.findBySid === 'function';

    if (!supportsFindBySub && !supportsFindBySid) {
      warnings.push(
        'Session store does not implement findBySub() or findBySid(). ' +
        'You must implement custom logout logic in onBackchannelLogout hook.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null,
    warnings: warnings.length > 0 ? warnings : null
  };
}
