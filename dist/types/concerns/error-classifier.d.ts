export declare const RETRIABLE: "RETRIABLE";
export declare const NON_RETRIABLE: "NON_RETRIABLE";
export type ErrorClassification = typeof RETRIABLE | typeof NON_RETRIABLE;
export interface ClassifyOptions {
    retryableErrors?: string[];
    nonRetriableErrors?: string[];
}
export interface ClassifiableError extends Error {
    code?: string;
    statusCode?: number;
    retriable?: boolean;
}
export declare class ErrorClassifier {
    static classify(error: ClassifiableError | null | undefined, options?: ClassifyOptions): ErrorClassification;
    static isRetriable(error: ClassifiableError | null | undefined, options?: ClassifyOptions): boolean;
    static isNonRetriable(error: ClassifiableError | null | undefined, options?: ClassifyOptions): boolean;
}
//# sourceMappingURL=error-classifier.d.ts.map