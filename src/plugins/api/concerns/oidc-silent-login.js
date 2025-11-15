import { getCookie, setCookie } from 'hono/cookie';

const safeGetCookie = (context, name) => {
  if (context?.req?.cookie) {
    try {
      return context.req.cookie(name);
    } catch (err) {
      // Fall through to hono helper
    }
  }
  try {
    return getCookie(context, name);
  } catch (err) {
    return null;
  }
};

const safeSetCookie = (context, name, value, options) => {
  try {
    setCookie(context, name, value, options);
  } catch (err) {
    // Tests may provide minimal mocks without response helpers.
  }
};

/**
 * OIDC Silent Login (prompt=none)
 *
 * Attempts silent authentication if user has an active session at the IDP.
 * Improves UX by avoiding unnecessary login screens.
 *
 * @module api/concerns/oidc-silent-login
 */

const SILENT_LOGIN_COOKIE = '_silent_login_attempted';
const SILENT_LOGIN_TTL = 3600000; // 1 hour

/**
 * Check if silent login should be attempted
 *
 * @param {Object} context - Request context
 * @param {Object} options - Options
 * @returns {boolean} True if silent login should be attempted
 */
export function shouldAttemptSilentLogin(context, options = {}) {
  const {
    enableSilentLogin = false,
    silentLoginPaths = [],
    excludePaths = []
  } = options;

  // Feature disabled
  if (!enableSilentLogin) {
    return false;
  }

  // User already authenticated
  if (context.get('user') || context.get('session')) {
    return false;
  }

  // Already attempted (prevent infinite loop)
  const attemptedCookie = safeGetCookie(context, SILENT_LOGIN_COOKIE);
  if (attemptedCookie) {
    return false;
  }

  // Not an HTML request (API calls should return 401, not redirect)
  const acceptsHtml = context.req.header('accept')?.includes('text/html');
  if (!acceptsHtml) {
    return false;
  }

  // Check path restrictions
  const path = context.req.path;

  // Exclude specific paths
  if (excludePaths.length > 0) {
    if (excludePaths.some(p => path === p || path.startsWith(p + '/'))) {
      return false;
    }
  }

  // If silentLoginPaths specified, only allow those paths
  if (silentLoginPaths.length > 0) {
    return silentLoginPaths.some(p => path === p || path.startsWith(p + '/'));
  }

  // Default: allow all HTML requests
  return true;
}

/**
 * Mark silent login as attempted
 *
 * Sets a cookie to prevent infinite redirect loops if silent login fails
 *
 * @param {Object} context - Request context
 * @param {Object} options - Cookie options
 */
export function markSilentLoginAttempted(context, options = {}) {
  const {
    secure = true,
    sameSite = 'Lax',
    domain = null,
    path = '/'
  } = options;

  safeSetCookie(context, SILENT_LOGIN_COOKIE, '1', {
    httpOnly: true,
    secure,
    sameSite,
    ...(domain ? { domain } : {}),
    path,
    maxAge: SILENT_LOGIN_TTL / 1000  // Convert ms to seconds
  });
}

/**
 * Clear silent login attempt marker
 *
 * Called after successful login to allow future silent login attempts
 *
 * @param {Object} context - Request context
 * @param {Object} options - Cookie options
 */
export function clearSilentLoginAttempt(context, options = {}) {
  const {
    secure = true,
    sameSite = 'Lax',
    domain = null,
    path = '/'
  } = options;

  // Delete cookie
  safeSetCookie(context, SILENT_LOGIN_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite,
    ...(domain ? { domain } : {}),
    path,
    maxAge: 0
  });
}

/**
 * Handle silent login callback error
 *
 * Called when prompt=none fails (user not logged in at IDP)
 *
 * @param {Object} error - OAuth2 error response
 * @returns {Object} { shouldRedirectToLogin: boolean, reason: string }
 */
export function handleSilentLoginError(error) {
  // Common error codes when silent login fails
  const silentLoginErrors = [
    'login_required',      // User not logged in at IDP
    'consent_required',    // User needs to consent
    'interaction_required', // User interaction needed
    'account_selection_required' // Account selection needed
  ];

  const errorCode = error.error || error.code;

  if (silentLoginErrors.includes(errorCode)) {
    return {
      shouldRedirectToLogin: true,
      reason: errorCode,
      message: 'Silent login failed, redirecting to interactive login'
    };
  }

  // Other errors should be handled normally
  return {
    shouldRedirectToLogin: false,
    reason: errorCode,
    message: error.error_description || 'Authentication error'
  };
}

/**
 * Build silent login authorization URL
 *
 * Same as regular login but with prompt=none
 *
 * @param {string} baseAuthUrl - Base authorization URL
 * @param {Object} params - Authorization parameters
 * @returns {string} Authorization URL with prompt=none
 */
export function buildSilentLoginUrl(baseAuthUrl, params) {
  const url = new URL(baseAuthUrl);

  // Add all params
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  // Force prompt=none for silent login
  url.searchParams.set('prompt', 'none');

  return url.toString();
}
