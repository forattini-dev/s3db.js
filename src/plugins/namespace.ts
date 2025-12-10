import type { PluginStorage } from '../concerns/plugin-storage.js';
import type { S3DBLogger } from '../concerns/logger.js';

export interface NamespaceLogger {
  warn(message: string, ...args: unknown[]): void;
}

export async function listPluginNamespaces(
  storage: PluginStorage | null,
  _pluginPrefix: string
): Promise<string[]> {
  if (!storage) {
    return [];
  }

  try {
    const baseKey = storage.getPluginKey(null);

    const allKeys = await storage.list(baseKey);

    const namespaces = new Set<string>();
    const prefix = baseKey.endsWith('/') ? baseKey : `${baseKey}/`;

    for (const key of allKeys) {
      const relativePath = key.replace(prefix, '');
      const parts = relativePath.split('/');

      if (parts.length > 0 && parts[0]) {
        namespaces.add(parts[0]);
      }
    }

    return Array.from(namespaces).sort();
  } catch {
    return [];
  }
}

export function warnNamespaceUsage(
  pluginName: string,
  currentNamespace: string,
  existingNamespaces: string[] = [],
  logger: NamespaceLogger | typeof console = console
): void {
  if (existingNamespaces.length > 0) {
    logger.warn(
      `[${pluginName}] Detected ${existingNamespaces.length} existing namespace(s): ${existingNamespaces.join(', ')}`
    );
  }

  const namespaceDisplay = currentNamespace === '' ? '(none)' : `"${currentNamespace}"`;
  logger.warn(`[${pluginName}] Using namespace: ${namespaceDisplay}`);
}

export async function detectAndWarnNamespaces(
  storage: PluginStorage,
  pluginName: string,
  pluginPrefix: string,
  currentNamespace: string,
  logger: NamespaceLogger | S3DBLogger | typeof console = console
): Promise<string[]> {
  const existingNamespaces = await listPluginNamespaces(storage, pluginPrefix);
  warnNamespaceUsage(pluginName, currentNamespace, existingNamespaces, logger as NamespaceLogger);
  return existingNamespaces;
}

export function getNamespacedResourceName(
  baseResourceName: string,
  namespace: string,
  _pluginPrefix: string
): string {
  if (!namespace) {
    return baseResourceName;
  }

  return baseResourceName.replace('plg_', `plg_${namespace}_`);
}

export function validateNamespace(namespace: string): void {
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
    throw new Error(
      'Namespace can only contain alphanumeric characters, hyphens, and underscores'
    );
  }
}

export interface PluginConfig {
  namespace?: string | null;
}

export function getValidatedNamespace(
  config: PluginConfig = {},
  defaultNamespace: string = ''
): string {
  const namespace = (config.namespace !== undefined && config.namespace !== null) ? config.namespace : defaultNamespace;
  validateNamespace(namespace);
  return namespace;
}
