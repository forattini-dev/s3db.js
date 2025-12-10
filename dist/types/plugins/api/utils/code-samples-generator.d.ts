export interface RouteMetadata {
    method: string;
    path: string;
    requestSchema?: OpenAPISchema;
    responseSchema?: OpenAPISchema;
    guards?: unknown[];
}
export interface OpenAPISchema {
    type?: string;
    format?: string;
    example?: unknown;
    default?: unknown;
    properties?: Record<string, OpenAPISchema>;
    items?: OpenAPISchema;
    required?: string[];
    enum?: unknown[];
    pattern?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
}
export interface CodeSamples {
    curl: string;
    nodejs: string;
    javascript: string;
    python: string;
    php: string;
    go: string;
    response: unknown;
}
export interface ErrorResponse {
    status: number;
    code: string;
    description: string;
    example: {
        success: boolean;
        error: {
            message: string;
            code: string;
            status: number;
            details?: unknown[];
        };
    };
}
export declare class CodeSamplesGenerator {
    static generate(route: RouteMetadata, baseUrl?: string): CodeSamples;
    static generateExampleFromSchema(schema: OpenAPISchema | null | undefined): unknown;
    private static generateObjectExample;
    private static generateArrayExample;
    private static generateStringExample;
    private static generateNumberExample;
    private static generateCurl;
    private static generateNodeJS;
    private static generateJavaScript;
    private static generatePython;
    private static generatePHP;
    private static generateGo;
    static generateErrorResponses(route: RouteMetadata): ErrorResponse[];
    private static generateValidationErrorExample;
}
//# sourceMappingURL=code-samples-generator.d.ts.map