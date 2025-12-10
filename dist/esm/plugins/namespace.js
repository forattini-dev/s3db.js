export async function listPluginNamespaces(storage, _pluginPrefix) {
    if (!storage) {
        return [];
    }
    try {
        const baseKey = storage.getPluginKey(null);
        const allKeys = await storage.list(baseKey);
        const namespaces = new Set();
        const prefix = baseKey.endsWith('/') ? baseKey : `${baseKey}/`;
        for (const key of allKeys) {
            const relativePath = key.replace(prefix, '');
            const parts = relativePath.split('/');
            if (parts.length > 0 && parts[0]) {
                namespaces.add(parts[0]);
            }
        }
        return Array.from(namespaces).sort();
    }
    catch {
        return [];
    }
}
export function warnNamespaceUsage(pluginName, currentNamespace, existingNamespaces = [], logger = console) {
    if (existingNamespaces.length > 0) {
        logger.warn(`[${pluginName}] Detected ${existingNamespaces.length} existing namespace(s): ${existingNamespaces.join(', ')}`);
    }
    const namespaceDisplay = currentNamespace === '' ? '(none)' : `"${currentNamespace}"`;
    logger.warn(`[${pluginName}] Using namespace: ${namespaceDisplay}`);
}
export async function detectAndWarnNamespaces(storage, pluginName, pluginPrefix, currentNamespace, logger = console) {
    const existingNamespaces = await listPluginNamespaces(storage, pluginPrefix);
    warnNamespaceUsage(pluginName, currentNamespace, existingNamespaces, logger);
    return existingNamespaces;
}
export function getNamespacedResourceName(baseResourceName, namespace, _pluginPrefix) {
    if (!namespace) {
        return baseResourceName;
    }
    return baseResourceName.replace('plg_', `plg_${namespace}_`);
}
export function validateNamespace(namespace) {
    if (namespace === '') {
        return;
    }
    if (!namespace || typeof namespace !== 'string') {
        throw new Error('Namespace must be a string');
    }
    if (namespace.length > 50) {
        throw new Error('Namespace must be 50 characters or less');
    }
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(namespace)) {
        throw new Error('Namespace can only contain alphanumeric characters, hyphens, and underscores');
    }
}
export function getValidatedNamespace(config = {}, defaultNamespace = '') {
    const namespace = (config.namespace !== undefined && config.namespace !== null) ? config.namespace : defaultNamespace;
    validateNamespace(namespace);
    return namespace;
}
//# sourceMappingURL=namespace.js.map