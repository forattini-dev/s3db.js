import type { MiddlewareHandler } from 'hono';
export interface ValidationOptions {
    validateOnInsert?: boolean;
    validateOnUpdate?: boolean;
    partial?: boolean;
}
export interface ValidationError {
    field?: string;
    attribute?: string;
    message: string;
    expected?: unknown;
    actual?: unknown;
}
export interface ValidationResult {
    valid: boolean;
    errors?: ValidationError[];
    data?: Record<string, unknown>;
}
export interface SchemaLike {
    validate(data: unknown, options?: {
        partial?: boolean;
        strict?: boolean;
    }): ValidationResult;
}
export interface ResourceLike {
    schema: SchemaLike;
}
export interface QueryParamRule {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean';
    min?: number;
    max?: number;
    enum?: string[];
}
export interface QuerySchema {
    [key: string]: QueryParamRule;
}
export interface FormattedError {
    field: string;
    message: string;
    expected?: unknown;
    actual?: unknown;
}
export declare function createValidationMiddleware(resource: ResourceLike, options?: ValidationOptions): MiddlewareHandler;
export declare function createQueryValidation(schema?: QuerySchema): MiddlewareHandler;
export declare const listQueryValidation: MiddlewareHandler;
declare const _default: {
    createValidationMiddleware: typeof createValidationMiddleware;
    createQueryValidation: typeof createQueryValidation;
    listQueryValidation: MiddlewareHandler;
};
export default _default;
//# sourceMappingURL=validator.d.ts.map