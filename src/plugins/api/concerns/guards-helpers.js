/**
 * Guards Helpers - Framework-agnostic context creation
 *
 * Creates GuardContext from different web frameworks (Express, Hono, Fastify)
 */

/**
 * Create framework-agnostic GuardContext from Express request
 * @param {Object} req - Express request
 * @returns {Object} GuardContext
 */
export function createExpressContext(req) {
  const context = {
    user: req.user || {},
    params: req.params || {},
    body: req.body || {},
    query: req.query || {},
    headers: req.headers || {},

    // Internal state
    partitionName: null,
    partitionValues: {},
    tenantId: null,
    userId: null,

    // Helper to set partition
    setPartition(name, values) {
      this.partitionName = name;
      this.partitionValues = values;
    },

    // Framework raw (for advanced use)
    raw: { req }
  };

  return context;
}

/**
 * Create framework-agnostic GuardContext from Hono context
 * @param {Object} c - Hono context
 * @returns {Promise<Object>} GuardContext
 */
export async function createHonoContext(c) {
  const context = {
    user: c.get('user') || {},
    params: c.req.param(),
    body: await c.req.json().catch(() => ({})),
    query: c.req.query(),
    headers: Object.fromEntries(c.req.raw.headers.entries()),

    // Internal state
    partitionName: null,
    partitionValues: {},
    tenantId: null,
    userId: null,

    // Helper to set partition
    setPartition(name, values) {
      this.partitionName = name;
      this.partitionValues = values;
    },

    // Framework raw
    raw: { c }
  };

  return context;
}

/**
 * Create framework-agnostic GuardContext from Fastify request
 * @param {Object} request - Fastify request
 * @returns {Object} GuardContext
 */
export function createFastifyContext(request) {
  const context = {
    user: request.user || {},
    params: request.params || {},
    body: request.body || {},
    query: request.query || {},
    headers: request.headers || {},

    // Internal state
    partitionName: null,
    partitionValues: {},
    tenantId: null,
    userId: null,

    // Helper to set partition
    setPartition(name, values) {
      this.partitionName = name;
      this.partitionValues = values;
    },

    // Framework raw
    raw: { request }
  };

  return context;
}

/**
 * Execute guards and apply results to list options
 * @param {Resource} resource - Resource instance
 * @param {Object} context - GuardContext
 * @param {Object} options - List options
 * @returns {Promise<Object>} Modified options
 */
export async function applyGuardsToList(resource, context, options = {}) {
  // Execute list guard
  const allowed = await resource.executeGuard('list', context);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to list');
  }

  // Apply partition from guard if set
  if (context.partitionName) {
    options.partition = context.partitionName;
    options.partitionValues = context.partitionValues || {};
  }

  return options;
}

/**
 * Execute guards for get operation
 * @param {Resource} resource - Resource instance
 * @param {Object} context - GuardContext
 * @param {Object} record - Record to check
 * @returns {Promise<Object|null>} Record if allowed, null if denied
 */
export async function applyGuardsToGet(resource, context, record) {
  if (!record) return null;

  // Execute get guard
  const allowed = await resource.executeGuard('get', context, record);

  if (!allowed) {
    // Return null instead of error (404 instead of 403)
    return null;
  }

  return record;
}

/**
 * Execute guards for insert operation
 * @param {Resource} resource - Resource instance
 * @param {Object} context - GuardContext
 * @param {Object} data - Data to insert
 * @returns {Promise<Object>} Modified data
 */
export async function applyGuardsToInsert(resource, context, data) {
  // Execute insert guard
  const allowed = await resource.executeGuard('insert', context);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to insert');
  }

  // Guard may have modified context.body (e.g., force tenantId/userId)
  if (context.body && typeof context.body === 'object') {
    // Merge guard modifications into data
    return { ...data, ...context.body };
  }

  return data;
}

/**
 * Execute guards for update operation
 * @param {Resource} resource - Resource instance
 * @param {Object} context - GuardContext
 * @param {Object} record - Current record
 * @returns {Promise<boolean>} True if allowed
 */
export async function applyGuardsToUpdate(resource, context, record) {
  if (!record) {
    throw new Error('Resource not found');
  }

  // Execute update guard
  const allowed = await resource.executeGuard('update', context, record);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to update');
  }

  return true;
}

/**
 * Execute guards for delete operation
 * @param {Resource} resource - Resource instance
 * @param {Object} context - GuardContext
 * @param {Object} record - Record to delete
 * @returns {Promise<boolean>} True if allowed
 */
export async function applyGuardsToDelete(resource, context, record) {
  if (!record) {
    throw new Error('Resource not found');
  }

  // Execute delete guard
  const allowed = await resource.executeGuard('delete', context, record);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to delete');
  }

  return true;
}

/**
 * Check if user has required scopes
 *
 * @param {Array<string>} requiredScopes - Required scopes
 * @param {string} mode - 'any' or 'all' (default: 'any')
 * @returns {Function} Guard function
 *
 * @example
 * // Require admin scope
 * guard: {
 *   delete: requireScopes(['admin'])
 * }
 *
 * @example
 * // Require ANY of multiple scopes
 * guard: {
 *   update: requireScopes(['admin', 'moderator'], 'any')
 * }
 *
 * @example
 * // Require ALL scopes
 * guard: {
 *   create: requireScopes(['write:urls', 'verified'], 'all')
 * }
 */
export function requireScopes(requiredScopes, mode = 'any') {
  if (!Array.isArray(requiredScopes)) {
    requiredScopes = [requiredScopes];
  }

  return (ctx) => {
    const userScopes = ctx.user?.scopes || [];

    if (mode === 'all') {
      // User must have ALL required scopes
      return requiredScopes.every(scope => userScopes.includes(scope));
    }

    // mode === 'any': User must have AT LEAST ONE required scope
    return requiredScopes.some(scope => userScopes.includes(scope));
  };
}

/**
 * Check if user has required role
 *
 * @param {string|Array<string>} role - Required role(s)
 * @returns {Function} Guard function
 *
 * @example
 * guard: {
 *   delete: requireRole('admin')
 * }
 *
 * @example
 * // Multiple roles (any)
 * guard: {
 *   update: requireRole(['admin', 'moderator'])
 * }
 */
export function requireRole(role) {
  const roles = Array.isArray(role) ? role : [role];

  return (ctx) => {
    const userRole = ctx.user?.role;
    const userRoles = ctx.user?.roles || [];

    // Check single role field
    if (userRole && roles.includes(userRole)) {
      return true;
    }

    // Check roles array
    return roles.some(r => userRoles.includes(r));
  };
}

/**
 * Require admin scope (shorthand for requireScopes(['admin']))
 *
 * @returns {Function} Guard function
 *
 * @example
 * guard: {
 *   delete: requireAdmin()
 * }
 */
export function requireAdmin() {
  return requireScopes(['admin']);
}

/**
 * Check ownership (record.userId === ctx.user.sub)
 *
 * @param {string} field - Field to check (default: 'userId')
 * @returns {Function} Guard function
 *
 * @example
 * guard: {
 *   update: requireOwnership(),
 *   delete: requireOwnership('createdBy')
 * }
 */
export function requireOwnership(field = 'userId') {
  return (ctx, resource) => {
    if (!resource) return false;

    const userId = ctx.user?.sub || ctx.user?.id;
    if (!userId) return false;

    return resource[field] === userId;
  };
}

/**
 * Combine guards with OR logic (any guard passes = allowed)
 *
 * @param {...Function} guards - Guard functions
 * @returns {Function} Combined guard function
 *
 * @example
 * guard: {
 *   delete: anyOf(
 *     requireAdmin(),
 *     requireOwnership()
 *   )
 * }
 */
export function anyOf(...guards) {
  return async (ctx, resource) => {
    for (const guard of guards) {
      const result = await guard(ctx, resource);
      if (result) return true;
    }
    return false;
  };
}

/**
 * Combine guards with AND logic (all guards must pass)
 *
 * @param {...Function} guards - Guard functions
 * @returns {Function} Combined guard function
 *
 * @example
 * guard: {
 *   create: allOf(
 *     requireScopes(['write:urls']),
 *     (ctx) => ctx.user.verified === true
 *   )
 * }
 */
export function allOf(...guards) {
  return async (ctx, resource) => {
    for (const guard of guards) {
      const result = await guard(ctx, resource);
      if (!result) return false;
    }
    return true;
  };
}

/**
 * Check if user belongs to specific tenant
 *
 * @param {string} tenantField - Field name in resource (default: 'tenantId')
 * @returns {Function} Guard function
 *
 * @example
 * guard: {
 *   '*': (ctx) => {
 *     ctx.tenantId = ctx.user.tenantId || ctx.user.tid;
 *     return !!ctx.tenantId;
 *   },
 *   update: requireTenant()
 * }
 */
export function requireTenant(tenantField = 'tenantId') {
  return (ctx, resource) => {
    if (!resource) return true; // Let wildcard/insert guards handle

    const userTenantId = ctx.tenantId || ctx.user?.tenantId || ctx.user?.tid;
    if (!userTenantId) return false;

    return resource[tenantField] === userTenantId;
  };
}
