/**
 * Guards - Authorization checks for resources
 *
 * Guards determine if a user can perform an operation on a resource.
 * Supports: functions, scopes, roles, and combined logic.
 *
 * NEW: Guards can now receive full RouteContext for access to:
 * - ctx.user, ctx.resources, ctx.param(), ctx.query()
 * - ctx.setPartition() for tenant isolation
 */

/**
 * Check if guard passes (NEW: supports RouteContext)
 *
 * @param {Object|RouteContext} ctxOrUser - RouteContext (new) or user object (legacy)
 * @param {Function|string|Array|Object|null} guard - Guard configuration
 * @param {Object|null} recordOrContext - Record being accessed (update/delete) or legacy context
 * @returns {boolean} True if authorized
 *
 * @example
 * // NEW: Guard with RouteContext
 * users.guard = {
 *   list: (ctx) => {
 *     if (ctx.user.scopes?.includes('preset:admin')) return true;
 *     ctx.setPartition('byUserId', { userId: ctx.user.id });
 *     return true;
 *   }
 * };
 *
 * @example
 * // LEGACY: Guard with user object (still works!)
 * users.guard = {
 *   list: (user, context) => {
 *     return user.scopes?.includes('preset:admin');
 *   }
 * };
 */
export function checkGuard(ctxOrUser, guard, recordOrContext = null) {
  // No guard = public access
  if (!guard) {
    return true;
  }

  // Detect if first param is RouteContext (has .user property and ._currentResource)
  const isRouteContext = ctxOrUser && typeof ctxOrUser === 'object' &&
                          ('user' in ctxOrUser || '_currentResource' in ctxOrUser);

  const ctx = isRouteContext ? ctxOrUser : null;
  const user = isRouteContext ? ctxOrUser.user : ctxOrUser;
  const record = isRouteContext ? recordOrContext : null;
  const legacyContext = isRouteContext ? {} : (recordOrContext || {});

  // No user = unauthorized (unless guard explicitly allows)
  if (!user && guard !== true) {
    return false;
  }

  // Guard is boolean
  if (typeof guard === 'boolean') {
    return guard;
  }

  // Guard is function
  if (typeof guard === 'function') {
    try {
      // NEW: Pass RouteContext if available, else legacy (user, context) signature
      if (ctx) {
        // Detect guard signature: (ctx, record) or (ctx)
        const guardLength = guard.length;

        if (guardLength >= 2 && record !== null) {
          return guard(ctx, record);  // (ctx, record) for update/delete
        } else {
          return guard(ctx);  // (ctx) for list/create
        }
      } else {
        // LEGACY: (user, context) signature
        return guard(user, legacyContext);
      }
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
        if (ctx) {
          return guard.check(ctx, record);
        } else {
          return guard.check(user, legacyContext);
        }
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
 * Create guard middleware for Hono (NEW: with RouteContext + global guards)
 * @param {Object} guards - Resource-specific guards configuration
 * @param {string} operation - Operation name
 * @param {Object} options - Options { resource, database, plugins, globalGuards }
 * @returns {Function} Hono middleware
 */
export function guardMiddleware(guards, operation, options = {}) {
  return async (c, next) => {
    // Import RouteContext dynamically to avoid circular dependency
    const { RouteContext } = await import('../concerns/route-context.js');

    const legacyContext = c.get('customRouteContext') || {};
    const { database, resource, plugins = {}, globalGuards = null } = { ...legacyContext, ...options };

    // Create RouteContext for guard
    const ctx = new RouteContext(c, database, resource, plugins);

    // Priority: resource guards > global guards > no guard (public)
    let guard = getOperationGuard(guards, operation);

    // If no resource-specific guard, check global guards
    if (guard === null && globalGuards) {
      guard = getOperationGuard(globalGuards, operation);
    }

    // Check guard (pass RouteContext)
    const authorized = checkGuard(ctx, guard, null);

    if (!authorized) {
      return c.json({
        success: false,
        error: {
          message: 'Forbidden: Insufficient permissions',
          code: 'FORBIDDEN',
          details: {
            operation,
            user: ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null
          }
        },
        _status: 403
      }, 403);
    }

    // Store partition filters in context for use by route handlers
    if (ctx.hasPartitionFilters()) {
      c.set('partitionFilters', ctx.getPartitionFilters());
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
