export declare const encode: (n: number) => string;
export declare const decode: (s: string) => number;
export declare const encodeDecimal: (n: number) => string;
export declare const decodeDecimal: (s: string) => number;
/**
 * Fixed-point encoding optimized for normalized values (typically -1 to 1)
 * Common in embeddings, similarity scores, probabilities, etc.
 *
 * Achieves ~77% compression vs encodeDecimal for embedding vectors.
 */
export declare const encodeFixedPoint: (n: number, precision?: number) => string;
/**
 * Decodes fixed-point encoded values
 */
export declare const decodeFixedPoint: (s: string, precision?: number) => number;
/**
 * Batch encoding for arrays of fixed-point numbers (optimized for embeddings)
 *
 * Achieves ~17% additional compression vs individual encodeFixedPoint by using
 * a single prefix for the entire array instead of one prefix per value.
 */
export declare const encodeFixedPointBatch: (values: number[], precision?: number) => string;
/**
 * Decodes batch-encoded fixed-point arrays
 */
export declare const decodeFixedPointBatch: (s: string, precision?: number) => number[];
//# sourceMappingURL=base62.d.ts.map