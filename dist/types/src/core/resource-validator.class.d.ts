import { ValidatorManager } from '../validator.class.js';
import type { StringRecord } from '../types/common.types.js';
export interface ValidatorConfig {
    type?: string;
    optional?: boolean;
    min?: number;
    max?: number;
    properties?: AttributesSchema;
    props?: AttributesSchema;
    items?: string | ValidatorConfig;
    strict?: boolean | 'remove';
    [key: string]: unknown;
}
export type AttributeValue = string | boolean | undefined | ValidatorConfig | AttributesSchema;
export interface AttributesSchema {
    [key: string]: AttributeValue | 'remove';
    $$async?: boolean;
    $$strict?: boolean | 'remove';
    $$type?: string;
}
export interface ResourceValidatorConfig {
    attributes?: AttributesSchema;
    strictValidation?: boolean;
    allNestedObjectsOptional?: boolean;
    passphrase?: string;
    bcryptRounds?: number;
    autoEncrypt?: boolean;
    autoDecrypt?: boolean;
}
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationErrorItem[];
    data: StringRecord;
}
export interface ValidationErrorItem {
    message?: string;
    error?: Error;
    field?: string;
    type?: string;
    [key: string]: unknown;
}
export interface ValidationOptions {
    throwOnError?: boolean;
    includeId?: boolean;
    mutateOriginal?: boolean;
}
type ValidateFn = (data: StringRecord) => Promise<true | ValidationErrorItem[]>;
export declare class ResourceValidator {
    attributes: AttributesSchema;
    strictValidation: boolean;
    allNestedObjectsOptional: boolean;
    passphrase?: string;
    bcryptRounds?: number;
    autoEncrypt: boolean;
    autoDecrypt: boolean;
    validatorManager: InstanceType<typeof ValidatorManager>;
    validateFn: ValidateFn;
    constructor(config?: ResourceValidatorConfig);
    compileValidator(): void;
    updateSchema(newAttributes: AttributesSchema): void;
    validate(data: StringRecord, options?: ValidationOptions): Promise<ValidationResult>;
    preprocessAttributesForValidation(attributes: AttributesSchema): AttributesSchema;
    applyDefaults(data: StringRecord): StringRecord;
}
export default ResourceValidator;
//# sourceMappingURL=resource-validator.class.d.ts.map