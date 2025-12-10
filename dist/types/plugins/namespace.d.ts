import type { PluginStorage } from '../concerns/plugin-storage.js';
import type { S3DBLogger } from '../concerns/logger.js';
export interface NamespaceLogger {
    warn(message: string, ...args: unknown[]): void;
}
export declare function listPluginNamespaces(storage: PluginStorage | null, _pluginPrefix: string): Promise<string[]>;
export declare function warnNamespaceUsage(pluginName: string, currentNamespace: string, existingNamespaces?: string[], logger?: NamespaceLogger | typeof console): void;
export declare function detectAndWarnNamespaces(storage: PluginStorage, pluginName: string, pluginPrefix: string, currentNamespace: string, logger?: NamespaceLogger | S3DBLogger | typeof console): Promise<string[]>;
export declare function getNamespacedResourceName(baseResourceName: string, namespace: string, _pluginPrefix: string): string;
export declare function validateNamespace(namespace: string): void;
export interface PluginConfig {
    namespace?: string | null;
}
export declare function getValidatedNamespace(config?: PluginConfig, defaultNamespace?: string): string;
//# sourceMappingURL=namespace.d.ts.map