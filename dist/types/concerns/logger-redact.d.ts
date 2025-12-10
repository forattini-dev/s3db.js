declare const BUILT_IN_SENSITIVE_FIELDS: string[];
export declare function createRedactRules(customPatterns?: RegExp[]): string[];
export declare function isSensitiveField(fieldName: string, customPatterns?: RegExp[]): boolean;
export interface TruncatedPayload {
    _truncated: true;
    _originalSize: number;
    _maxSize: number;
    _data: unknown;
}
export declare function createPayloadRedactionSerializer(maxBytes?: number): (value: unknown) => unknown;
export declare function createSensitiveDataSerializer(customPatterns?: RegExp[]): (data: unknown) => unknown;
declare const _default: {
    createRedactRules: typeof createRedactRules;
    isSensitiveField: typeof isSensitiveField;
    createPayloadRedactionSerializer: typeof createPayloadRedactionSerializer;
    createSensitiveDataSerializer: typeof createSensitiveDataSerializer;
    BUILT_IN_SENSITIVE_FIELDS: string[];
};
export default _default;
export { BUILT_IN_SENSITIVE_FIELDS };
//# sourceMappingURL=logger-redact.d.ts.map