export type AttributeSchema = string;
export interface BaseAttributes {
    [key: string]: AttributeSchema;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export interface ResourceConfig {
    name?: string;
    attributes?: BaseAttributes;
    [key: string]: any;
}
export interface ResourcesConfig {
    users?: ResourceConfig;
    tenants?: ResourceConfig;
    clients?: ResourceConfig;
}
export declare const BASE_USER_ATTRIBUTES: BaseAttributes;
export declare const BASE_TENANT_ATTRIBUTES: BaseAttributes;
export declare const BASE_CLIENT_ATTRIBUTES: BaseAttributes;
export declare function validateExtraAttributes(baseAttributes: BaseAttributes, userAttributes: BaseAttributes | undefined, resourceType: string): ValidationResult;
export declare function mergeResourceConfig(baseConfig: ResourceConfig, userConfig: ResourceConfig | undefined, resourceType: string): ResourceConfig;
export declare function validateResourcesConfig(resourcesConfig: ResourcesConfig | null | undefined): ValidationResult;
declare const _default: {
    BASE_USER_ATTRIBUTES: BaseAttributes;
    BASE_TENANT_ATTRIBUTES: BaseAttributes;
    BASE_CLIENT_ATTRIBUTES: BaseAttributes;
    validateExtraAttributes: typeof validateExtraAttributes;
    mergeResourceConfig: typeof mergeResourceConfig;
    validateResourcesConfig: typeof validateResourcesConfig;
};
export default _default;
//# sourceMappingURL=resource-schemas.d.ts.map