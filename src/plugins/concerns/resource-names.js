const PREFIX = 'plg_';

function normalizeNamespace(namespace) {
  if (!namespace) return null;
  const text = String(namespace).trim().toLowerCase();
  if (!text) return null;
  const normalized = text
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
  return normalized || null;
}

function applyNamespace(name, namespace) {
  const ensured = ensurePlgPrefix(name);
  if (!namespace) {
    return ensured;
  }

  const withoutPrefix = ensured.slice(PREFIX.length);
  if (withoutPrefix.startsWith(`${namespace}_`)) {
    return ensured;
  }

  return `${PREFIX}${namespace}_${withoutPrefix}`;
}

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

export function resolveResourceName(pluginKey, { defaultName, override, suffix } = {}, options = {}) {
  const namespace = normalizeNamespace(options.namespace);
  const applyOverrideNamespace = options.applyNamespaceToOverrides === true;

  if (!defaultName && !override && !suffix) {
    throw new Error(`[resource-names] Missing name parameters for plugin "${pluginKey}"`);
  }

  if (override) {
    const ensured = ensurePlgPrefix(override);
    return applyOverrideNamespace ? applyNamespace(ensured, namespace) : ensured;
  }

  if (defaultName) {
    const ensured = defaultName.startsWith(PREFIX) ? defaultName : ensurePlgPrefix(defaultName);
    return applyNamespace(ensured, namespace);
  }

  if (!suffix) {
    throw new Error(`[resource-names] Cannot derive resource name for plugin "${pluginKey}" without suffix`);
  }

  const ensured = ensurePlgPrefix(`${pluginKey}_${suffix}`);
  return applyNamespace(ensured, namespace);
}

export function resolveResourceNames(pluginKey, descriptors = {}, options = {}) {
  const result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (typeof descriptor === 'string') {
      result[key] = resolveResourceName(pluginKey, { defaultName: descriptor }, options);
      continue;
    }

    result[key] = resolveResourceName(pluginKey, descriptor, options);
  }
  return result;
}
