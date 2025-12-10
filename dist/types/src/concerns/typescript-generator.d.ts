export interface GenerateTypesOptions {
    outputPath?: string | null;
    moduleName?: string;
    includeResource?: boolean;
    logLevel?: string;
}
export interface TypeGenResourceConfig {
    attributes?: Record<string, FieldDefinition>;
    timestamps?: boolean;
}
export type FieldDefinition = string | ObjectFieldDefinition;
export interface ObjectFieldDefinition {
    type?: string;
    required?: boolean;
    description?: string;
    props?: Record<string, FieldDefinition>;
    items?: string | ObjectFieldDefinition;
    [key: string]: any;
}
export interface ResourceInterface {
    name: string;
    interfaceName: string;
    resource: ResourceLike;
}
interface ResourceLike {
    config?: TypeGenResourceConfig;
    attributes?: Record<string, FieldDefinition>;
    schema?: {
        _pluginAttributes?: Record<string, string[]>;
    };
}
interface DatabaseLike {
    resources: Record<string, ResourceLike>;
}
export declare function generateTypes(database: DatabaseLike, options?: GenerateTypesOptions): Promise<string>;
export declare function printTypes(database: DatabaseLike, options?: GenerateTypesOptions): Promise<string>;
declare const _default: {
    generateTypes: typeof generateTypes;
    printTypes: typeof printTypes;
};
export default _default;
//# sourceMappingURL=typescript-generator.d.ts.map