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
