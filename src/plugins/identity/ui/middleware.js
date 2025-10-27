/**
 * Identity Provider Middleware
 * Session validation and authentication middleware
 */

/**
 * Session authentication middleware
 * Validates session and attaches user data to context
 * @param {Object} sessionManager - SessionManager instance
 * @param {Object} options - Middleware options
 * @param {boolean} options.required - Require authentication (redirect if not logged in)
 * @param {boolean} options.requireAdmin - Require admin role
 * @param {string} options.redirectTo - Redirect URL if not authenticated
 * @returns {Function} Hono middleware function
 */
export function sessionAuth(sessionManager, options = {}) {
  const {
    required = false,
    requireAdmin = false,
    redirectTo = '/login'
  } = options;

  return async (c, next) => {
    const sessionId = sessionManager.getSessionIdFromRequest(c.req);

    let user = null;
    let session = null;

    if (sessionId) {
      const { valid, session: validSession, reason } = await sessionManager.validateSession(sessionId);

      if (valid) {
        session = validSession;
        user = validSession.metadata || null;
      } else {
        // Clear invalid session cookie
        sessionManager.clearSessionCookie(c);

        if (required) {
          const currentUrl = c.req.url;
          return c.redirect(`${redirectTo}?redirect=${encodeURIComponent(currentUrl)}&error=${encodeURIComponent('Your session has expired. Please log in again.')}`);
        }
      }
    }

    // Check if authentication is required
    if (required && !user) {
      const currentUrl = c.req.url;
      return c.redirect(`${redirectTo}?redirect=${encodeURIComponent(currentUrl)}`);
    }

    // Check if admin is required
    if (requireAdmin && (!user || !user.isAdmin)) {
      return c.html('<h1>403 Forbidden</h1><p>You do not have permission to access this page.</p>', 403);
    }

    // Attach user and session to context
    c.set('user', user);
    c.set('session', session);
    c.set('isAuthenticated', !!user);
    c.set('isAdmin', user?.isAdmin || false);

    await next();
  };
}

/**
 * Admin-only middleware (shorthand)
 * @param {Object} sessionManager - SessionManager instance
 * @returns {Function} Hono middleware function
 */
export function adminOnly(sessionManager) {
  return sessionAuth(sessionManager, {
    required: true,
    requireAdmin: true
  });
}

/**
 * Optional authentication middleware
 * Attaches user if logged in, but doesn't require it
 * @param {Object} sessionManager - SessionManager instance
 * @returns {Function} Hono middleware function
 */
export function optionalAuth(sessionManager) {
  return sessionAuth(sessionManager, {
    required: false,
    requireAdmin: false
  });
}

/**
 * CSRF protection middleware
 * Validates CSRF token for POST/PUT/PATCH/DELETE requests
 * @param {Object} options - CSRF options
 * @param {string[]} options.excludePaths - Paths to exclude from CSRF check
 * @returns {Function} Hono middleware function
 */
export function csrfProtection(options = {}) {
  const {
    excludePaths = []
  } = options;

  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    // Skip CSRF check for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      await next();
      return;
    }

    // Skip CSRF check for excluded paths
    if (excludePaths.some(p => path.startsWith(p))) {
      await next();
      return;
    }

    // For now, skip CSRF validation - will be implemented in polish phase
    // TODO: Implement proper CSRF token generation and validation
    // - Generate token on GET requests, store in session
    // - Include token in forms as hidden field
    // - Validate token on POST/PUT/PATCH/DELETE

    await next();
  };
}

export default {
  sessionAuth,
  adminOnly,
  optionalAuth,
  csrfProtection
};
