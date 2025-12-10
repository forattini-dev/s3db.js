export interface DependencyInfo {
    version: string;
    description: string;
    installCommand: string;
    npmUrl: string;
}
export interface PluginDefinition {
    name: string;
    docsUrl: string;
    dependencies: Record<string, DependencyInfo>;
}
export interface ValidationOptions {
    throwOnError?: boolean;
    checkVersions?: boolean;
    callerName?: string;
}
export interface ValidationResult {
    valid: boolean;
    missing: string[];
    incompatible: string[];
    messages: string[];
}
export interface PluginDependencyError extends Error {
    pluginId: string;
    pluginName: string;
    missing: string[];
    incompatible: string[];
    docsUrl: string;
}
export declare const PLUGIN_DEPENDENCIES: Record<string, PluginDefinition>;
export declare function requirePluginDependency(pluginId: string, optionsOrCallerName?: ValidationOptions | string): Promise<ValidationResult>;
export declare function checkPluginDependencies(pluginIds: string[], options?: ValidationOptions): Promise<Map<string, ValidationResult>>;
export declare function getPluginDependencyReport(): Promise<string>;
export default requirePluginDependency;
//# sourceMappingURL=plugin-dependencies.d.ts.map