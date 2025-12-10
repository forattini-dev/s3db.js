import { PluginError } from '../../errors.js';
const PREFIX = 'plg_';
function normalizeNamespace(namespace) {
    if (!namespace)
        return null;
    const text = String(namespace).trim().toLowerCase();
    if (!text)
        return null;
    const normalized = text
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
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
        throw new PluginError('[resource-names] Resource name must be a non-empty string', {
            pluginName: 'SharedConcerns',
            operation: 'resourceNames:sanitize',
            statusCode: 400,
            retriable: false,
            suggestion: 'Pass a non-empty string when deriving resource names.'
        });
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
        throw new PluginError(`[resource-names] Missing name parameters for plugin "${pluginKey}"`, {
            pluginName: 'SharedConcerns',
            operation: 'resourceNames:resolve',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide at least one of defaultName, override, or suffix when resolving resource names.'
        });
    }
    if (override) {
        const sanitized = sanitizeName(override);
        if (!applyOverrideNamespace) {
            return sanitized;
        }
        const ensured = ensurePlgPrefix(sanitized);
        const resolved = applyNamespace(ensured, namespace);
        return resolved;
    }
    if (defaultName) {
        const ensured = defaultName.startsWith(PREFIX) ? defaultName : ensurePlgPrefix(defaultName);
        const resolved = applyNamespace(ensured, namespace);
        return resolved;
    }
    if (!suffix) {
        throw new PluginError(`[resource-names] Cannot derive resource name for plugin "${pluginKey}" without suffix`, {
            pluginName: 'SharedConcerns',
            operation: 'resourceNames:resolve',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a suffix or defaultName when computing derived resource names.'
        });
    }
    const ensured = ensurePlgPrefix(`${pluginKey}_${suffix}`);
    const resolved = applyNamespace(ensured, namespace);
    return resolved;
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
//# sourceMappingURL=resource-names.js.map