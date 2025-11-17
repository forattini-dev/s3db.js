export function normalizeAuthConfig(authOptions = {}, logger = null) {
  if (!authOptions) {
    return {
      drivers: [],
      pathRules: [],
      pathAuth: undefined,
      strategy: 'any',
      priorities: {},
      resource: null, // Will be set per-driver or fallback to 'users'
      driver: null
    };
  }

  const normalized = {
    drivers: [],
    pathRules: Array.isArray(authOptions.pathRules) ? authOptions.pathRules : [],
    pathAuth: authOptions.pathAuth,
    strategy: authOptions.strategy || 'any',
    priorities: authOptions.priorities || {},
    createResource: authOptions.createResource !== false
  };

  const seen = new Set();

  const addDriver = (name, driverConfig = {}) => {
    if (!name) return;
    const driverName = String(name).trim();
    if (!driverName || seen.has(driverName)) return;
    seen.add(driverName);

    const config = { ...driverConfig };
    if (!config.resource) {
      config.resource = 'users'; // Default resource
    }

    normalized.drivers.push({
      driver: driverName,
      config
    });
  };

  // Drivers provided as array
  if (Array.isArray(authOptions.drivers)) {
    for (const entry of authOptions.drivers) {
      if (typeof entry === 'string') {
        addDriver(entry, {});
      } else if (entry && typeof entry === 'object') {
        addDriver(entry.driver, entry.config || {});
      }
    }
  }

  // Single driver shortcut
  if (authOptions.driver) {
    if (typeof authOptions.driver === 'string') {
      addDriver(authOptions.driver, authOptions.config || {});
    } else if (typeof authOptions.driver === 'object') {
      addDriver(authOptions.driver.driver, authOptions.driver.config || authOptions.config || {});
    }
  }

  normalized.driver = normalized.drivers.length > 0 ? normalized.drivers[0].driver : null;
  return normalized;
}
