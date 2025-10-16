/**
 * Vector Distance Functions
 *
 * Provides distance/similarity calculations for vector operations.
 * All distance functions return lower values for more similar vectors.
 */

/**
 * Calculate cosine distance between two vectors
 *
 * Range: 0 (identical) to 2 (opposite direction)
 * Best for: Normalized vectors, semantic similarity
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine distance
 * @throws {Error} If vectors have different dimensions
 */
export function cosineDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // Handle zero vectors
  if (denominator === 0) {
    return a.every(v => v === 0) && b.every(v => v === 0) ? 0 : 1;
  }

  const similarity = dotProduct / denominator;

  // Convert similarity [-1, 1] to distance [0, 2]
  return 1 - similarity;
}

/**
 * Calculate euclidean (L2) distance between two vectors
 *
 * Range: [0, ∞)
 * Best for: Geometric proximity, continuous data
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Euclidean distance
 * @throws {Error} If vectors have different dimensions
 */
export function euclideanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate manhattan (L1) distance between two vectors
 *
 * Range: [0, ∞)
 * Best for: Grid-based movement, faster computation
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Manhattan distance
 * @throws {Error} If vectors have different dimensions
 */
export function manhattanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }

  return sum;
}

/**
 * Calculate dot product of two vectors
 *
 * Higher values indicate more similarity (for normalized vectors)
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Dot product
 * @throws {Error} If vectors have different dimensions
 */
export function dotProduct(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  return sum;
}

/**
 * Normalize a vector to unit length (L2 normalization)
 *
 * Converts vector to unit vector pointing in same direction.
 * Useful for cosine similarity calculations.
 *
 * @param {number[]} vector - Vector to normalize
 * @returns {number[]} Normalized vector
 */
export function normalize(vector) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );

  // Handle zero vector
  if (magnitude === 0) {
    return vector.slice(); // Return copy of zero vector
  }

  return vector.map(val => val / magnitude);
}

/**
 * Calculate the magnitude (length) of a vector
 *
 * @param {number[]} vector - Input vector
 * @returns {number} Magnitude
 */
export function magnitude(vector) {
  return Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );
}

/**
 * Check if two vectors are equal within a tolerance
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @param {number} epsilon - Tolerance for floating point comparison
 * @returns {boolean} True if vectors are equal within tolerance
 */
export function vectorsEqual(a, b, epsilon = 1e-10) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > epsilon) {
      return false;
    }
  }

  return true;
}
