/**
 * Guards - Authorization checks for resources
 *
 * Guards determine if a user can perform an operation on a resource.
 * Supports: functions, scopes, roles, and combined logic.
 */

/**
 * Check if user passes guard
 * @param {Object} user - Authenticated user object
 * @param {Function|string|Array|Object|null} guard - Guard configuration
 * @param {Object} context - Additional context (data, resourceName, operation)
 * @returns {boolean} True if authorized
 */
export function checkGuard(user, guard, context = {}) {
  // No guard = public access
  if (!guard) {
    return true;
  }

  // No user = unauthorized (unless guard explicitly allows)
  if (!user && guard !== true) {
    return false;
  }

  // Guard is boolean
  if (typeof guard === 'boolean') {
    return guard;
  }

  // Guard is function: (user, context) => boolean
  if (typeof guard === 'function') {
    try {
      return guard(user, context);
    } catch (err) {
      console.error('[Guards] Error executing guard function:', err);
      return false;
    }
  }

  // Guard is string: scope name (e.g., 'read:users')
  if (typeof guard === 'string') {
    return hasScope(user, guard);
  }

  // Guard is array: any scope matches (OR logic)
  if (Array.isArray(guard)) {
    return guard.some(scope => hasScope(user, scope));
  }

  // Guard is object: check properties
  if (typeof guard === 'object') {
    // Check role
    if (guard.role) {
      if (Array.isArray(guard.role)) {
        if (!guard.role.includes(user.role)) {
          return false;
        }
      } else if (user.role !== guard.role) {
        return false;
      }
    }

    // Check scopes (all must match - AND logic)
    if (guard.scopes) {
      const requiredScopes = Array.isArray(guard.scopes) ? guard.scopes : [guard.scopes];
      if (!requiredScopes.every(scope => hasScope(user, scope))) {
        return false;
      }
    }

    // Check custom function
    if (guard.check && typeof guard.check === 'function') {
      try {
        return guard.check(user, context);
      } catch (err) {
        console.error('[Guards] Error executing guard.check function:', err);
        return false;
      }
    }

    return true;
  }

  // Unknown guard type = deny
  return false;
}

/**
 * Check if user has specific scope
 * @param {Object} user - User object
 * @param {string} scope - Scope name (e.g., 'read:users')
 * @returns {boolean} True if user has scope
 */
export function hasScope(user, scope) {
  if (!user || !user.scopes) {
    return false;
  }

  if (!Array.isArray(user.scopes)) {
    return false;
  }

  // Direct match
  if (user.scopes.includes(scope)) {
    return true;
  }

  // Wildcard match (e.g., 'admin:*' matches 'admin:users')
  const wildcards = user.scopes.filter(s => s.endsWith(':*'));
  for (const wildcard of wildcards) {
    const prefix = wildcard.slice(0, -2); // Remove ':*'
    if (scope.startsWith(prefix + ':')) {
      return true;
    }
  }

  // Super admin wildcard ('*' matches everything)
  if (user.scopes.includes('*')) {
    return true;
  }

  return false;
}

/**
 * Get operation-specific guard from guards config
 * @param {Object} guards - Guards configuration
 * @param {string} operation - Operation name ('list', 'get', 'create', 'update', 'delete')
 * @returns {Function|string|Array|Object|null} Guard for operation
 */
export function getOperationGuard(guards, operation) {
  if (!guards) {
    return null;
  }

  // If guards is a function/string/array, apply to all operations
  if (typeof guards === 'function' || typeof guards === 'string' || Array.isArray(guards)) {
    return guards;
  }

  // If guards is object, get operation-specific guard
  if (typeof guards === 'object') {
    // Check for specific operation
    if (guards[operation] !== undefined) {
      return guards[operation];
    }

    // Fallback to 'all' or default
    if (guards.all !== undefined) {
      return guards.all;
    }

    // Map operation aliases
    const aliases = {
      list: 'read',
      get: 'read',
      create: 'write',
      update: 'write',
      delete: 'write'
    };

    if (aliases[operation] && guards[aliases[operation]] !== undefined) {
      return guards[aliases[operation]];
    }
  }

  return null;
}

/**
 * Create guard middleware for Hono
 * @param {Object} guards - Guards configuration
 * @param {string} operation - Operation name
 * @returns {Function} Hono middleware
 */
export function guardMiddleware(guards, operation) {
  return async (c, next) => {
    const user = c.get('user');
    const guard = getOperationGuard(guards, operation);

    // Check guard
    const authorized = checkGuard(user, guard, {
      operation,
      resourceName: c.req.param('resource'),
      data: c.req.method !== 'GET' ? await c.req.json().catch(() => ({})) : {}
    });

    if (!authorized) {
      return c.json({
        success: false,
        error: {
          message: 'Forbidden: Insufficient permissions',
          code: 'FORBIDDEN',
          details: {
            operation,
            user: user ? { id: user.id, role: user.role } : null
          }
        },
        _status: 403
      }, 403);
    }

    await next();
  };
}

export default {
  checkGuard,
  hasScope,
  getOperationGuard,
  guardMiddleware
};
