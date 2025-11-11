/**
 * Session Tracking Middleware
 *
 * Tracks user sessions for analytics and monitoring purposes.
 * Creates persistent session IDs stored in encrypted cookies.
 *
 * Features:
 * - Encrypted session IDs (AES-256-GCM)
 * - Optional database storage
 * - Auto-update on each request
 * - Custom session enrichment
 * - IP, User-Agent, Referer tracking
 *
 * @example
 * import { createSessionTrackingMiddleware } from './middlewares/session-tracking.js';
 *
 * const middleware = createSessionTrackingMiddleware({
 *   enabled: true,
 *   resource: 'sessions',
 *   cookieName: 'session_id',
 *   passphrase: process.env.SESSION_SECRET,
 *   updateOnRequest: true,
 *   enrichSession: async ({ session, context }) => ({
 *     userAgent: context.req.header('user-agent'),
 *     ip: context.req.header('x-forwarded-for')
 *   })
 * }, db);
 *
 * app.use('*', middleware);
 *
 * // In route handlers:
 * app.get('/r/:id', async (c) => {
 *   const sessionId = c.get('sessionId');
 *   const session = c.get('session');
 *   console.log('Session:', sessionId);
 * });
 */

import { encrypt, decrypt } from '../../../concerns/crypto.js';
import { idGenerator } from '../../../concerns/id.js';

/**
 * Create session tracking middleware
 *
 * @param {Object} config - Session configuration
 * @param {boolean} config.enabled - Enable session tracking (default: false)
 * @param {string} config.resource - Resource name for DB storage (optional)
 * @param {string} config.cookieName - Cookie name (default: 'session_id')
 * @param {number} config.cookieMaxAge - Cookie max age in ms (default: 30 days)
 * @param {boolean} config.cookieSecure - Secure flag (default: production mode)
 * @param {string} config.cookieSameSite - SameSite policy (default: 'Strict')
 * @param {boolean} config.updateOnRequest - Update session on each request (default: true)
 * @param {string} config.passphrase - Encryption passphrase (required)
 * @param {Function} config.enrichSession - Custom session enrichment function
 * @param {Object} db - Database instance
 * @returns {Function} Hono middleware
 */
export function createSessionTrackingMiddleware(config = {}, db) {
  const {
    enabled = false,
    resource = null,
    cookieName = 'session_id',
    cookieMaxAge = 2592000000, // 30 days
    cookieSecure = process.env.NODE_ENV === 'production',
    cookieSameSite = 'Strict',
    updateOnRequest = true,
    passphrase = null,
    enrichSession = null
  } = config;

  // If disabled, return no-op middleware
  if (!enabled) {
    return async (c, next) => await next();
  }

  // Validate required config
  if (!passphrase) {
    throw new Error('sessionTracking.passphrase is required when sessionTracking.enabled = true');
  }

  // Get sessions resource if configured
  const sessionsResource = resource && db ? db.resources[resource] : null;

  return async (c, next) => {
    let session = null;
    let sessionId = null;
    let isNewSession = false;

    // 1. Check if session cookie exists
    const sessionCookie = c.req.cookie(cookieName);

    if (sessionCookie) {
      try {
        // Decrypt session ID
        sessionId = await decrypt(sessionCookie, passphrase);

        // Load from DB if resource configured
        if (sessionsResource) {
          const exists = await sessionsResource.exists(sessionId);
          if (exists) {
            session = await sessionsResource.get(sessionId);
          }
        } else {
          // No DB storage - create minimal session object
          session = { id: sessionId };
        }
      } catch (err) {
        if (c.get('verbose')) {
          console.error('[SessionTracking] Failed to decrypt cookie:', err.message);
        }
        // Will create new session below
      }
    }

    // 2. Create new session if needed
    if (!session) {
      isNewSession = true;
      sessionId = idGenerator();

      const sessionData = {
        id: sessionId,
        userAgent: c.req.header('user-agent') || null,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null,
        referer: c.req.header('referer') || null,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      };

      // Enrich with custom data
      if (enrichSession && typeof enrichSession === 'function') {
        try {
          const enriched = await enrichSession({ session: sessionData, context: c });
          if (enriched && typeof enriched === 'object') {
            Object.assign(sessionData, enriched);
          }
        } catch (enrichErr) {
          if (c.get('verbose')) {
            console.error('[SessionTracking] enrichSession failed:', enrichErr.message);
          }
        }
      }

      // Save to DB if resource configured
      if (sessionsResource) {
        try {
          session = await sessionsResource.insert(sessionData);
        } catch (insertErr) {
          if (c.get('verbose')) {
            console.error('[SessionTracking] Failed to insert session:', insertErr.message);
          }
          session = sessionData; // Use in-memory fallback
        }
      } else {
        session = sessionData;
      }
    }

    // 3. Update session on each request (if enabled and not new)
    else if (updateOnRequest && !isNewSession && sessionsResource) {
      const updates = {
        lastSeenAt: new Date().toISOString(),
        lastUserAgent: c.req.header('user-agent') || null,
        lastIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null
      };

      // Fire-and-forget update (don't block request)
      sessionsResource.update(sessionId, updates).catch((updateErr) => {
        if (c.get('verbose')) {
          console.error('[SessionTracking] Failed to update session:', updateErr.message);
        }
      });

      // Update local copy
      Object.assign(session, updates);
    }

    // 4. Set/refresh cookie
    try {
      const encryptedSessionId = await encrypt(sessionId, passphrase);

      c.header(
        'Set-Cookie',
        `${cookieName}=${encryptedSessionId}; ` +
        `Max-Age=${Math.floor(cookieMaxAge / 1000)}; ` +
        `Path=/; ` +
        `HttpOnly; ` +
        (cookieSecure ? 'Secure; ' : '') +
        `SameSite=${cookieSameSite}`
      );
    } catch (encryptErr) {
      if (c.get('verbose')) {
        console.error('[SessionTracking] Failed to encrypt session ID:', encryptErr.message);
      }
    }

    // 5. Expose to context
    c.set('sessionId', sessionId);
    c.set('session', session);

    await next();
  };
}

export default createSessionTrackingMiddleware;
