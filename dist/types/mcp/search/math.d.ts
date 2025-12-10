/**
 * Mathematical utilities for hybrid search.
 * Reimplemented to avoid external dependencies.
 */
/**
 * Calculates cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical).
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity
 */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/**
 * Calculates Levenshtein (edit) distance between two strings.
 * Uses space-optimized algorithm with O(min(m,n)) space complexity.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance
 */
export declare function levenshtein(a: string, b: string): number;
/**
 * Calculates normalized string similarity between 0 and 1.
 * Uses Levenshtein distance normalized by the maximum string length.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Similarity (1.0 = identical, 0.0 = completely different)
 */
export declare function stringSimilarity(a: string, b: string): number;
/**
 * Reciprocal Rank Fusion (RRF) for combining multiple rankings.
 *
 * @param ranks - Array of rank positions (1-indexed, lower is better)
 * @param k - Smoothing constant
 * @returns Combined RRF score (higher is better)
 */
export declare function reciprocalRankFusion(ranks: number[], k?: number): number;
/**
 * Combines two normalized scores (0-1) using RRF.
 * Converts scores to pseudo-ranks and applies RRF.
 *
 * @param score1 - First score (0-1, higher is better)
 * @param score2 - Second score (0-1, higher is better)
 * @param k - Smoothing constant
 * @returns Combined score
 */
export declare function combineScores(score1: number, score2: number, k?: number): number;
//# sourceMappingURL=math.d.ts.map