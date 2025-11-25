/**
 * Normalize resources configuration for WebSocket plugin
 *
 * Each resource can have:
 * - auth: Array of allowed roles or true/false
 * - protected: Array of field names to filter from responses
 * - guard: Object with operation-specific guard functions
 * - events: Array of events to broadcast ('insert', 'update', 'delete')
 *
 * @param {Object} resourcesConfig - Raw resources configuration
 * @param {Object} logger - Logger instance
 * @returns {Object} Normalized resources configuration
 */
export function normalizeResourcesConfig(resourcesConfig, logger) {
  if (!resourcesConfig) {
    return {};
  }

  const normalized = {};

  for (const [name, config] of Object.entries(resourcesConfig)) {
    normalized[name] = normalizeResourceConfig(name, config, logger);
  }

  return normalized;
}

/**
 * Normalize a single resource configuration
 * @private
 */
function normalizeResourceConfig(name, config, logger) {
  // Handle simple boolean config
  if (config === true) {
    return {
      auth: null,
      protected: [],
      guard: {},
      events: ['insert', 'update', 'delete']
    };
  }

  if (config === false) {
    return null;
  }

  // Handle full config object
  const normalized = {
    auth: normalizeAuth(config.auth),
    protected: normalizeProtected(config.protected),
    guard: normalizeGuard(config.guard),
    events: normalizeEvents(config.events),
    publishAuth: config.publishAuth || null
  };

  // Log configuration
  logger?.debug({
    resource: name,
    hasAuth: !!normalized.auth,
    protectedFields: normalized.protected.length,
    hasGuards: Object.keys(normalized.guard).length > 0,
    events: normalized.events
  }, 'Resource configured for WebSocket');

  return normalized;
}

/**
 * Normalize auth configuration
 * @private
 */
function normalizeAuth(auth) {
  if (auth === undefined || auth === null || auth === true) {
    return null; // No role restriction
  }

  if (auth === false) {
    return false; // Block access
  }

  if (typeof auth === 'string') {
    return [auth];
  }

  if (Array.isArray(auth)) {
    return auth;
  }

  return null;
}

/**
 * Normalize protected fields
 * @private
 */
function normalizeProtected(protected_) {
  if (!protected_) {
    return [];
  }

  if (typeof protected_ === 'string') {
    return [protected_];
  }

  if (Array.isArray(protected_)) {
    return protected_;
  }

  return [];
}

/**
 * Normalize guard functions
 * @private
 */
function normalizeGuard(guard) {
  if (!guard) {
    return {};
  }

  const normalized = {};
  const validOperations = ['list', 'get', 'create', 'update', 'delete', 'subscribe', 'publish'];

  for (const [operation, handler] of Object.entries(guard)) {
    if (validOperations.includes(operation) && typeof handler === 'function') {
      normalized[operation] = handler;
    }
  }

  return normalized;
}

/**
 * Normalize events configuration
 * @private
 */
function normalizeEvents(events) {
  const defaultEvents = ['insert', 'update', 'delete'];

  if (!events) {
    return defaultEvents;
  }

  if (events === false) {
    return [];
  }

  if (typeof events === 'string') {
    return [events];
  }

  if (Array.isArray(events)) {
    return events.filter(e => defaultEvents.includes(e));
  }

  return defaultEvents;
}
