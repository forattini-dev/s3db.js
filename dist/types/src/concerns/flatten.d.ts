export interface FlattenOptions {
    safe?: boolean;
}
export interface UnflattenOptions {
}
type FlattenValue = unknown;
type FlattenResult = Record<string, FlattenValue>;
/**
 * Flatten nested objects into dot-notation keys
 * Lightweight replacement for 'flat' package (only needed features)
 */
export declare function flatten(obj: unknown, options?: FlattenOptions): FlattenResult;
/**
 * Unflatten dot-notation keys back into nested objects
 * Lightweight replacement for 'flat' package (only needed features)
 */
export declare function unflatten(obj: Record<string, unknown>, _options?: UnflattenOptions): Record<string, unknown>;
export {};
//# sourceMappingURL=flatten.d.ts.map