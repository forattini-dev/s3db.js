/**
 * Path-based Authentication Matcher
 *
 * Provides path-specific authentication rules with precedence by specificity.
 * More specific paths override less specific ones.
 *
 * @example
 * const rules = [
 *   { path: '/app/**', methods: ['oidc'], required: true },
 *   { path: '/api/v1/**', methods: ['basic', 'oidc'], required: true },
 *   { path: '/health', methods: [], required: false },
 *   { path: '/**', methods: [], required: false } // default
 * ];
 *
 * const rule = findAuthRule('/app/dashboard', rules);
 * // => { path: '/app/**', methods: ['oidc'], required: true }
 */

/**
 * Calculate path specificity score (higher = more specific)
 * @param {string} pattern - Path pattern with wildcards
 * @returns {number} Specificity score
 */
function calculateSpecificity(pattern) {
  let score = 0;

  // Exact matches (no wildcards) are most specific
  if (!pattern.includes('*') && !pattern.includes(':')) {
    score += 10000;
  }

  // Count path segments (more segments = more specific)
  const segments = pattern.split('/').filter(s => s.length > 0);
  score += segments.length * 100;

  // Penalize wildcards (fewer wildcards = more specific)
  const singleWildcards = (pattern.match(/(?<!\*)\*(?!\*)/g) || []).length;
  const doubleWildcards = (pattern.match(/\*\*/g) || []).length;
  score -= singleWildcards * 10;
  score -= doubleWildcards * 50;

  // Penalize route params (e.g., :id)
  const params = (pattern.match(/:[^/]+/g) || []).length;
  score -= params * 5;

  return score;
}

/**
 * Convert glob pattern to regex
 * @param {string} pattern - Glob pattern
 * @returns {RegExp} Regular expression
 */
function patternToRegex(pattern) {
  // Escape special regex characters except * and :
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Handle route params (:id, :userId, etc.)
  regexPattern = regexPattern.replace(/:([^/]+)/g, '([^/]+)');

  // Handle wildcards
  regexPattern = regexPattern
    .replace(/\*\*/g, '___GLOBSTAR___')  // Temporary placeholder
    .replace(/\*/g, '[^/]*')              // * matches anything except /
    .replace(/___GLOBSTAR___/g, '.*');    // ** matches everything including /

  // Anchor to start and end
  regexPattern = '^' + regexPattern + '$';

  return new RegExp(regexPattern);
}

/**
 * Check if path matches pattern
 * @param {string} path - Request path
 * @param {string} pattern - Path pattern with wildcards
 * @returns {boolean} True if matches
 */
export function matchPath(path, pattern) {
  // Exact match (fast path)
  if (path === pattern) return true;

  // Regex match
  const regex = patternToRegex(pattern);
  return regex.test(path);
}

/**
 * Find matching auth rule for path (most specific wins)
 * @param {string} path - Request path
 * @param {Array<Object>} rules - Auth rules
 * @param {string} rules[].path - Path pattern
 * @param {Array<string>} rules[].methods - Allowed auth methods
 * @param {boolean} rules[].required - If true, auth is required
 * @param {string} rules[].strategy - Auth strategy ('any' or 'priority')
 * @param {Object} rules[].priorities - Priority map for 'priority' strategy
 * @returns {Object|null} Matching rule or null
 */
export function findAuthRule(path, rules = []) {
  if (!rules || rules.length === 0) {
    return null;
  }

  // Find all matching rules
  const matches = rules
    .map(rule => ({
      ...rule,
      specificity: calculateSpecificity(rule.path)
    }))
    .filter(rule => matchPath(path, rule.path))
    .sort((a, b) => b.specificity - a.specificity); // Highest specificity first

  // Return most specific match
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Create path-based auth middleware
 * @param {Object} options - Middleware options
 * @param {Array<Object>} options.rules - Path-based auth rules
 * @param {Object} options.authMiddlewares - Available auth middlewares by name
 * @param {Function} options.unauthorizedHandler - Handler for unauthorized requests
 * @returns {Function} Hono middleware
 */
export function createPathBasedAuthMiddleware(options = {}) {
  const {
    rules = [],
    authMiddlewares = {},
    unauthorizedHandler = null
  } = options;

  return async (c, next) => {
    const currentPath = c.req.path;

    // Find matching rule
    const rule = findAuthRule(currentPath, rules);

    // No rule = no auth required (default public)
    if (!rule) {
      return await next();
    }

    // Rule says auth not required = public
    if (!rule.required) {
      return await next();
    }

    // Rule says auth required but no methods = error in config
    if (rule.methods.length === 0 && rule.required) {
      console.error(`[Path Auth] Invalid rule: path "${rule.path}" requires auth but has no methods`);
      if (unauthorizedHandler) {
        return unauthorizedHandler(c, 'Configuration error');
      }
      return c.json({ error: 'Configuration error' }, 500);
    }

    // Get allowed auth middlewares for this path
    const allowedMiddlewares = rule.methods
      .map(methodName => ({
        name: methodName,
        middleware: authMiddlewares[methodName]
      }))
      .filter(m => m.middleware);

    if (allowedMiddlewares.length === 0) {
      console.error(`[Path Auth] No middlewares found for methods: ${rule.methods.join(', ')}`);
      if (unauthorizedHandler) {
        return unauthorizedHandler(c, 'No auth methods available');
      }
      return c.json({ error: 'No auth methods available' }, 500);
    }

    // Sort by priority if strategy is 'priority'
    const strategy = rule.strategy || 'any';
    const priorities = rule.priorities || {};

    if (strategy === 'priority' && Object.keys(priorities).length > 0) {
      allowedMiddlewares.sort((a, b) => {
        const priorityA = priorities[a.name] || 999;
        const priorityB = priorities[b.name] || 999;
        return priorityA - priorityB; // Lower number = higher priority
      });
    }

    // Try each auth method
    for (const { name, middleware } of allowedMiddlewares) {
      let authSuccess = false;
      const tempNext = async () => {
        authSuccess = true;
      };

      // Try auth method
      await middleware(c, tempNext);

      // If auth succeeded, continue
      if (authSuccess && c.get('user')) {
        return await next();
      }
    }

    // No auth method succeeded
    if (unauthorizedHandler) {
      return unauthorizedHandler(c, `Authentication required. Allowed methods: ${rule.methods.join(', ')}`);
    }

    return c.json({
      error: 'Unauthorized',
      message: `Authentication required. Allowed methods: ${rule.methods.join(', ')}`
    }, 401);
  };
}

export default {
  matchPath,
  findAuthRule,
  calculateSpecificity,
  createPathBasedAuthMiddleware
};
