export interface EncodingComparison {
    original: number;
    base64Pure: number;
    base64Prefixed: number;
    urlPure: number;
    urlPrefixed: number;
    optimized: number;
    optimizedMethod: 'none' | 'ascii-marked' | 'url' | 'base64' | 'unknown';
}
export declare function optimizedEncode(value: unknown): string;
export declare function optimizedDecode(value: unknown): unknown;
export declare function compareEncodings(value: unknown): EncodingComparison;
//# sourceMappingURL=optimized-encoding.d.ts.map