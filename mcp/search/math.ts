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
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * Calculates Levenshtein (edit) distance between two strings.
 * Uses space-optimized algorithm with O(min(m,n)) space complexity.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Only need two rows: previous and current
  let prevRow: number[] = new Array(aLen + 1);
  let currRow: number[] = new Array(aLen + 1);

  // Initialize first row
  for (let i = 0; i <= aLen; i++) {
    prevRow[i] = i;
  }

  // Fill in the rest of the matrix
  for (let j = 1; j <= bLen; j++) {
    currRow[0] = j;

    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1,       // deletion
        currRow[i - 1] + 1,   // insertion
        prevRow[i - 1] + cost // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[aLen];
}

/**
 * Calculates normalized string similarity between 0 and 1.
 * Uses Levenshtein distance normalized by the maximum string length.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Similarity (1.0 = identical, 0.0 = completely different)
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Reciprocal Rank Fusion (RRF) for combining multiple rankings.
 *
 * @param ranks - Array of rank positions (1-indexed, lower is better)
 * @param k - Smoothing constant
 * @returns Combined RRF score (higher is better)
 */
export function reciprocalRankFusion(ranks: number[], k: number = 60): number {
  return ranks.reduce((sum, rank) => sum + 1 / (k + rank), 0);
}

/**
 * Combines two normalized scores (0-1) using RRF.
 * Converts scores to pseudo-ranks and applies RRF.
 *
 * @param score1 - First score (0-1, higher is better)
 * @param score2 - Second score (0-1, higher is better)
 * @param k - Smoothing constant
 * @returns Combined score
 */
export function combineScores(score1: number, score2: number, k: number = 60): number {
  // Convert scores to pseudo-ranks (invert so higher score = lower rank)
  const rank1 = 1 + (1 - score1) * 100;
  const rank2 = 1 + (1 - score2) * 100;
  return reciprocalRankFusion([rank1, rank2], k);
}
