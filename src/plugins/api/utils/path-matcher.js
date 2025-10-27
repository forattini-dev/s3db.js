/**
 * Path Matcher - Wildcard-based path matching with specificity sorting
 *
 * Supports:
 * - `*` - Match single path segment (e.g., /api/v1/* → /api/v1/users ✅, /api/v1/users/123 ❌)
 * - `**` - Match multiple segments (e.g., /api/** → /api/v1/users ✅, /api/v1/users/123 ✅)
 *
 * Precedence: Most specific path wins (exact > * > **)
 */

/**
 * Convert wildcard pattern to regex
 * @param {string} pattern - Path pattern with wildcards (*, **)
 * @returns {RegExp} Compiled regex
 * @private
 */
function patternToRegex(pattern) {
  // Escape regex special chars except * and /
  let escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Replace ** with a placeholder first (to avoid conflict with *)
  escaped = escaped.replace(/\*\*/g, '__DOUBLE_STAR__');

  // Replace * with regex that matches any characters except /
  escaped = escaped.replace(/\*/g, '([^/]+)');

  // Replace placeholder with regex that matches any characters including /
  escaped = escaped.replace(/__DOUBLE_STAR__/g, '(.*)');

  // Anchor to start and end
  return new RegExp(`^${escaped}$`);
}

/**
 * Check if a path matches a pattern
 * @param {string} pattern - Path pattern with wildcards
 * @param {string} path - Actual request path
 * @returns {boolean} True if path matches pattern
 * @example
 * matchPath('/api/v1/*', '/api/v1/users') // true
 * matchPath('/api/v1/*', '/api/v1/users/123') // false
 * matchPath('/api/v1/**', '/api/v1/users/123') // true
 */
export function matchPath(pattern, path) {
  const regex = patternToRegex(pattern);
  return regex.test(path);
}

/**
 * Calculate specificity score for a pattern
 * Higher score = more specific = higher precedence
 *
 * Scoring:
 * - Each exact segment: +1000
 * - Each * wildcard: +100
 * - Each ** wildcard: +10
 *
 * @param {string} pattern - Path pattern
 * @returns {number} Specificity score
 * @private
 * @example
 * calculateSpecificity('/api/v1/admin/users') // 4000 (4 exact segments)
 * calculateSpecificity('/api/v1/admin/*') // 3100 (3 exact + 1 *)
 * calculateSpecificity('/api/v1/**') // 2010 (2 exact + 1 **)
 * calculateSpecificity('/api/**') // 1010 (1 exact + 1 **)
 */
function calculateSpecificity(pattern) {
  const segments = pattern.split('/').filter(s => s !== '');

  let score = 0;

  for (const segment of segments) {
    if (segment === '**') {
      score += 10; // Lowest precedence
    } else if (segment === '*') {
      score += 100; // Medium precedence
    } else {
      score += 1000; // Highest precedence (exact match)
    }
  }

  return score;
}

/**
 * Find the best matching rule for a given path
 * Returns the most specific rule that matches the path
 *
 * @param {Array<Object>} rules - Array of path auth rules
 * @param {string} rules[].pattern - Path pattern
 * @param {Array<string>} rules[].drivers - Auth drivers
 * @param {boolean} rules[].required - Whether auth is required
 * @param {string} path - Request path
 * @returns {Object|null} Best matching rule or null if no match
 * @example
 * const rules = [
 *   { pattern: '/api/**', drivers: ['jwt'], required: true },
 *   { pattern: '/api/v1/admin/**', drivers: ['jwt', 'apiKey'], required: true },
 *   { pattern: '/health/*', required: false }
 * ];
 *
 * findBestMatch(rules, '/api/v1/admin/users');
 * // Returns { pattern: '/api/v1/admin/**', ... } (most specific)
 *
 * findBestMatch(rules, '/health/liveness');
 * // Returns { pattern: '/health/*', required: false }
 */
export function findBestMatch(rules, path) {
  if (!rules || rules.length === 0) {
    return null;
  }

  // Find all matching rules
  const matches = rules
    .map(rule => ({
      rule,
      specificity: calculateSpecificity(rule.pattern)
    }))
    .filter(({ rule }) => matchPath(rule.pattern, path))
    .sort((a, b) => b.specificity - a.specificity); // Descending (highest first)

  // Return most specific match
  return matches.length > 0 ? matches[0].rule : null;
}

/**
 * Validate pathAuth configuration
 * @param {Array<Object>} pathAuth - Path auth rules
 * @throws {Error} If configuration is invalid
 */
export function validatePathAuth(pathAuth) {
  if (!Array.isArray(pathAuth)) {
    throw new Error('pathAuth must be an array of rules');
  }

  for (const [index, rule] of pathAuth.entries()) {
    if (!rule.pattern || typeof rule.pattern !== 'string') {
      throw new Error(`pathAuth[${index}]: pattern is required and must be a string`);
    }

    if (!rule.pattern.startsWith('/')) {
      throw new Error(`pathAuth[${index}]: pattern must start with / (got: ${rule.pattern})`);
    }

    if (rule.drivers !== undefined && !Array.isArray(rule.drivers)) {
      throw new Error(`pathAuth[${index}]: drivers must be an array (got: ${typeof rule.drivers})`);
    }

    if (rule.required !== undefined && typeof rule.required !== 'boolean') {
      throw new Error(`pathAuth[${index}]: required must be a boolean (got: ${typeof rule.required})`);
    }

    // Validate drivers (if specified)
    const validDrivers = ['jwt', 'apiKey', 'basic', 'oauth2', 'oidc'];
    if (rule.drivers) {
      for (const driver of rule.drivers) {
        if (!validDrivers.includes(driver)) {
          throw new Error(
            `pathAuth[${index}]: invalid driver '${driver}'. ` +
            `Valid drivers: ${validDrivers.join(', ')}`
          );
        }
      }
    }
  }
}

export default {
  matchPath,
  findBestMatch,
  validatePathAuth
};
