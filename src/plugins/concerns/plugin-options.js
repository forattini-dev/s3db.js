const NULLISH = Symbol('nullish');

const pickOr = (value, fallback = null) => {
  return value === undefined ? fallback : value;
};

const ensureAssigned = (context, key, value) => {
  if (!context || typeof context !== 'object') return;

  if (value === NULLISH) {
    if (context[key] === undefined) {
      context[key] = null;
    }
    return;
  }

  context[key] = value;
};

/**
 * Normalizes standard plugin options and assigns defaults.
 *
 * @param {object} plugin - Plugin instance receiving the options.
 * @param {object} [options] - Options provided by the caller.
 * @param {object} [fallback] - Optional fallback values when options are omitted.
 * @returns {object} normalized options object.
 */
export function normalizePluginOptions(plugin, options = {}, fallback = {}) {
  const normalized = {
    ...options,
    verbose: pickOr(options.verbose, pickOr(fallback.verbose, false)),
    resources: pickOr(options.resources, pickOr(fallback.resources, NULLISH)),
    database: pickOr(options.database, pickOr(fallback.database, NULLISH)),
    client: pickOr(options.client, pickOr(fallback.client, NULLISH))
  };

  if (normalized.resources === NULLISH) normalized.resources = null;
  if (normalized.database === NULLISH) normalized.database = null;
  if (normalized.client === NULLISH) normalized.client = null;

  ensureAssigned(plugin, 'verbose', normalized.verbose);
  ensureAssigned(plugin, 'resources', normalized.resources === null ? NULLISH : normalized.resources);
  ensureAssigned(plugin, 'database', normalized.database === null ? NULLISH : normalized.database);
  ensureAssigned(plugin, 'client', normalized.client === null ? NULLISH : normalized.client);

  return normalized;
}

export default normalizePluginOptions;
