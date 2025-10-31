const PREFIX = 'plg_';

function sanitizeName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('[resource-names] Resource name must be a non-empty string');
  }
  return name.trim();
}

export function ensurePlgPrefix(name) {
  const sanitized = sanitizeName(name);
  if (sanitized.startsWith(PREFIX)) {
    return sanitized;
  }
  return `${PREFIX}${sanitized.replace(/^\_+/, '')}`;
}

export function resolveResourceName(pluginKey, { defaultName, override, suffix } = {}) {
  if (!defaultName && !override && !suffix) {
    throw new Error(`[resource-names] Missing name parameters for plugin "${pluginKey}"`);
  }

  if (override) {
    return ensurePlgPrefix(override);
  }

  if (defaultName) {
    return defaultName.startsWith(PREFIX) ? defaultName : ensurePlgPrefix(defaultName);
  }

  if (!suffix) {
    throw new Error(`[resource-names] Cannot derive resource name for plugin "${pluginKey}" without suffix`);
  }

  return ensurePlgPrefix(`${pluginKey}_${suffix}`);
}

export function resolveResourceNames(pluginKey, descriptors = {}) {
  const result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (typeof descriptor === 'string') {
      result[key] = resolveResourceName(pluginKey, { defaultName: descriptor });
      continue;
    }

    result[key] = resolveResourceName(pluginKey, descriptor);
  }
  return result;
}
