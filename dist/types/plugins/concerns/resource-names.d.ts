export interface ResolveNameParams {
    defaultName?: string;
    override?: string;
    suffix?: string;
}
export interface ResolveNameOptions {
    namespace?: string;
    applyNamespaceToOverrides?: boolean;
}
export type ResourceDescriptor = string | ResolveNameParams;
export declare function ensurePlgPrefix(name: string): string;
export declare function resolveResourceName(pluginKey: string, { defaultName, override, suffix }?: ResolveNameParams, options?: ResolveNameOptions): string;
export declare function resolveResourceNames(pluginKey: string, descriptors?: Record<string, ResourceDescriptor>, options?: ResolveNameOptions): Record<string, string>;
//# sourceMappingURL=resource-names.d.ts.map