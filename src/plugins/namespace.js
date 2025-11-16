/**
 * Plugin Namespace Detection and Logging
 *
 * Provides standardized namespace detection and console warnings for all plugins.
 *
 * @module concerns/plugin-namespace
 */

/**
 * List all existing namespaces for a plugin by scanning storage
 *
 * @param {Object} storage - Plugin storage instance
 * @param {string} pluginPrefix - Plugin prefix (e.g., 'recon', 'scheduler', 'cache')
 * @returns {Promise<string[]>} Array of namespace strings, sorted alphabetically
 *
 * @example
 * const storage = plugin.getStorage();
 * const namespaces = await listPluginNamespaces(storage, 'recon');
 * // ['aggressive', 'default', 'stealth', 'uptime']
 */
export async function listPluginNamespaces(storage, pluginPrefix) {
  if (!storage) {
    return [];
  }

  try {
    // Get base key for plugin: plugin=<pluginPrefix>/
    const baseKey = storage.getPluginKey(null);

    // List all keys under plugin prefix
    const allKeys = await storage.list(baseKey);

    // Extract unique namespaces from keys like: plugin=<pluginPrefix>/<namespace>/...
    const namespaces = new Set();
    const prefix = baseKey.endsWith('/') ? baseKey : `${baseKey}/`;

    for (const key of allKeys) {
      // Remove prefix and extract first segment (namespace)
      const relativePath = key.replace(prefix, '');
      const parts = relativePath.split('/');

      if (parts.length > 0 && parts[0]) {
        namespaces.add(parts[0]);
      }
    }

    return Array.from(namespaces).sort();
  } catch (error) {
    // If no keys exist yet or storage error, return empty array
    return [];
  }
}

/**
 * Emit console warnings about namespace detection and usage
 *
 * Standardized format for all plugins:
 * - Lists detected namespaces (if any)
 * - Warns which namespace is being used
 *
 * @param {string} pluginName - Plugin name for logging (e.g., 'ReconPlugin', 'SchedulerPlugin')
 * @param {string} currentNamespace - The namespace being used by this instance
 * @param {string[]} existingNamespaces - Array of detected namespaces
 *
 * @example
 * warnNamespaceUsage('ReconPlugin', 'uptime', ['default', 'stealth']);
 * // Console output:
 * // [ReconPlugin] Detected 2 existing namespace(s): default, stealth
 * // [ReconPlugin] Using namespace: "uptime"
 */
export function warnNamespaceUsage(pluginName, currentNamespace, existingNamespaces = [], logger = console) {
  if (existingNamespaces.length > 0) {
    logger.warn(
      `[${pluginName}] Detected ${existingNamespaces.length} existing namespace(s): ${existingNamespaces.join(', ')}`
    );
  }

  const namespaceDisplay = currentNamespace === '' ? '(none)' : `"${currentNamespace}"`;
  logger.warn(`[${pluginName}] Using namespace: ${namespaceDisplay}`);
}

/**
 * Complete namespace detection and warning flow
 *
 * Convenience method that combines listing and warning in one call.
 *
 * @param {Object} storage - Plugin storage instance
 * @param {string} pluginName - Plugin name for logging
 * @param {string} pluginPrefix - Plugin prefix for storage scanning
 * @param {string} currentNamespace - The namespace being used
 * @returns {Promise<string[]>} Array of detected namespaces
 *
 * @example
 * const namespaces = await detectAndWarnNamespaces(
 *   plugin.getStorage(),
 *   'ReconPlugin',
 *   'recon',
 *   'uptime'
 * );
 * // Console output:
 * // [ReconPlugin] Detected 2 existing namespace(s): default, stealth
 * // [ReconPlugin] Using namespace: "uptime"
 * // Returns: ['default', 'stealth']
 */
export async function detectAndWarnNamespaces(storage, pluginName, pluginPrefix, currentNamespace, logger = console) {
  const existingNamespaces = await listPluginNamespaces(storage, pluginPrefix);
  warnNamespaceUsage(pluginName, currentNamespace, existingNamespaces, logger);
  return existingNamespaces;
}

/**
 * Get namespaced resource name
 *
 * Generates consistent resource names across all plugins.
 * Pattern: plg_<namespace>_<plugin>_<resource>
 * Empty namespace: plg_<plugin>_<resource>
 *
 * @param {string} baseResourceName - Base resource name (e.g., 'plg_recon_hosts')
 * @param {string} namespace - Namespace to apply (empty string = no namespace)
 * @param {string} pluginPrefix - Plugin prefix (e.g., 'plg_recon')
 * @returns {string} Namespaced resource name
 *
 * @example
 * getNamespacedResourceName('plg_recon_hosts', '', 'plg_recon');
 * // 'plg_recon_hosts'
 *
 * getNamespacedResourceName('plg_recon_hosts', 'uptime', 'plg_recon');
 * // 'plg_uptime_recon_hosts'
 *
 * getNamespacedResourceName('plg_scheduler_jobs', 'prod', 'plg_scheduler');
 * // 'plg_prod_scheduler_jobs'
 */
export function getNamespacedResourceName(baseResourceName, namespace, pluginPrefix) {
  if (!namespace) {
    return baseResourceName;
  }

  // Insert namespace after 'plg_' prefix
  // Example: 'plg_recon_hosts' → 'plg_uptime_recon_hosts'
  return baseResourceName.replace('plg_', `plg_${namespace}_`);
}

/**
 * Validate namespace string
 *
 * Ensures namespace follows naming conventions:
 * - Alphanumeric + hyphens + underscores only
 * - 1-50 characters
 * - Empty string is allowed (no namespace)
 *
 * @param {string} namespace - Namespace to validate
 * @throws {Error} If namespace is invalid
 *
 * @example
 * validateNamespace('uptime');        // OK
 * validateNamespace('client-acme');   // OK
 * validateNamespace('prod_env_2');    // OK
 * validateNamespace('');              // OK (no namespace)
 * validateNamespace('invalid space'); // Throws
 * validateNamespace('a'.repeat(51));  // Throws
 */
export function validateNamespace(namespace) {
  // Empty string is allowed (no namespace)
  if (namespace === '') {
    return;
  }

  if (!namespace || typeof namespace !== 'string') {
    throw new Error('Namespace must be a string');
  }

  if (namespace.length > 50) {
    throw new Error('Namespace must be 50 characters or less');
  }

  // Allow alphanumeric, hyphens, and underscores only
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(namespace)) {
    throw new Error(
      'Namespace can only contain alphanumeric characters, hyphens, and underscores'
    );
  }
}

/**
 * Get namespace from config with validation
 *
 * Extracts and validates namespace from plugin config.
 * Defaults to empty string if not specified (no namespace).
 *
 * @param {Object} config - Plugin configuration
 * @param {string} defaultNamespace - Default namespace if not specified (default: '')
 * @returns {string} Validated namespace
 * @throws {Error} If namespace is invalid
 *
 * @example
 * getValidatedNamespace({ namespace: 'uptime' });
 * // 'uptime'
 *
 * getValidatedNamespace({});
 * // ''
 *
 * getValidatedNamespace({ namespace: 'invalid space' });
 * // Throws Error
 */
export function getValidatedNamespace(config = {}, defaultNamespace = '') {
  const namespace = (config.namespace !== undefined && config.namespace !== null) ? config.namespace : defaultNamespace;
  validateNamespace(namespace);
  return namespace;
}
