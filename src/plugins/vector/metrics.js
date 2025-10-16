/**
 * Clustering Evaluation Metrics
 *
 * Provides multiple metrics for evaluating clustering quality
 * and determining optimal number of clusters (K).
 */

import { euclideanDistance } from './distances.js';
import { kmeans } from './kmeans.js';

/**
 * Calculate Silhouette Score for clustering quality
 *
 * Measures how similar each point is to its own cluster compared to other clusters.
 *
 * Range: [-1, 1]
 * - Close to 1: Well clustered
 * - Close to 0: On border between clusters
 * - Negative: Likely in wrong cluster
 *
 * @param {number[][]} vectors - Input vectors
 * @param {number[]} assignments - Cluster assignments
 * @param {number[][]} centroids - Cluster centroids
 * @param {Function} distanceFn - Distance function
 * @returns {number} Average silhouette score
 */
export function silhouetteScore(vectors, assignments, centroids, distanceFn = euclideanDistance) {
  const k = centroids.length;
  const n = vectors.length;

  // Group vectors by cluster
  const clusters = Array(k).fill(null).map(() => []);
  vectors.forEach((vector, i) => {
    clusters[assignments[i]].push(i);
  });

  let totalScore = 0;
  let validPoints = 0;

  // Handle case where all points are in different clusters
  if (clusters.every(c => c.length <= 1)) {
    return 0;
  }

  for (let i = 0; i < n; i++) {
    const clusterIdx = assignments[i];
    const cluster = clusters[clusterIdx];

    // Skip singleton clusters
    if (cluster.length === 1) continue;

    // a(i): Average distance to points in same cluster
    let a = 0;
    for (const j of cluster) {
      if (i !== j) {
        a += distanceFn(vectors[i], vectors[j]);
      }
    }
    a /= (cluster.length - 1);

    // b(i): Minimum average distance to points in other clusters
    let b = Infinity;
    for (let otherCluster = 0; otherCluster < k; otherCluster++) {
      if (otherCluster === clusterIdx) continue;

      const otherPoints = clusters[otherCluster];
      if (otherPoints.length === 0) continue;

      let avgDist = 0;
      for (const j of otherPoints) {
        avgDist += distanceFn(vectors[i], vectors[j]);
      }
      avgDist /= otherPoints.length;

      b = Math.min(b, avgDist);
    }

    // If no other clusters exist (k=1), skip this point
    if (b === Infinity) continue;

    // Silhouette coefficient for point i
    const maxAB = Math.max(a, b);
    const s = maxAB === 0 ? 0 : (b - a) / maxAB;
    totalScore += s;
    validPoints++;
  }

  return validPoints > 0 ? totalScore / validPoints : 0;
}

/**
 * Calculate Davies-Bouldin Index
 *
 * Measures average similarity between each cluster and its most similar cluster.
 * Lower is better (minimum 0).
 *
 * @param {number[][]} vectors - Input vectors
 * @param {number[]} assignments - Cluster assignments
 * @param {number[][]} centroids - Cluster centroids
 * @param {Function} distanceFn - Distance function
 * @returns {number} Davies-Bouldin index
 */
export function daviesBouldinIndex(vectors, assignments, centroids, distanceFn = euclideanDistance) {
  const k = centroids.length;

  // Calculate average distance from points to their centroid (cluster scatter)
  const scatters = new Array(k).fill(0);
  const clusterCounts = new Array(k).fill(0);

  vectors.forEach((vector, i) => {
    const cluster = assignments[i];
    scatters[cluster] += distanceFn(vector, centroids[cluster]);
    clusterCounts[cluster]++;
  });

  for (let i = 0; i < k; i++) {
    if (clusterCounts[i] > 0) {
      scatters[i] /= clusterCounts[i];
    }
  }

  // Calculate Davies-Bouldin index
  let dbIndex = 0;
  let validClusters = 0;

  for (let i = 0; i < k; i++) {
    if (clusterCounts[i] === 0) continue;

    let maxRatio = 0;
    for (let j = 0; j < k; j++) {
      if (i === j || clusterCounts[j] === 0) continue;

      const centroidDist = distanceFn(centroids[i], centroids[j]);
      if (centroidDist === 0) continue;

      const ratio = (scatters[i] + scatters[j]) / centroidDist;
      maxRatio = Math.max(maxRatio, ratio);
    }

    dbIndex += maxRatio;
    validClusters++;
  }

  return validClusters > 0 ? dbIndex / validClusters : 0;
}

/**
 * Calculate Calinski-Harabasz Index (Variance Ratio Criterion)
 *
 * Ratio of between-cluster dispersion to within-cluster dispersion.
 * Higher is better.
 *
 * @param {number[][]} vectors - Input vectors
 * @param {number[]} assignments - Cluster assignments
 * @param {number[][]} centroids - Cluster centroids
 * @param {Function} distanceFn - Distance function
 * @returns {number} Calinski-Harabasz index
 */
export function calinskiHarabaszIndex(vectors, assignments, centroids, distanceFn = euclideanDistance) {
  const n = vectors.length;
  const k = centroids.length;

  if (k === 1 || k === n) return 0;

  // Calculate overall centroid
  const dimensions = vectors[0].length;
  const overallCentroid = new Array(dimensions).fill(0);

  vectors.forEach(vector => {
    vector.forEach((val, dim) => {
      overallCentroid[dim] += val;
    });
  });

  overallCentroid.forEach((val, dim, arr) => {
    arr[dim] = val / n;
  });

  // Calculate between-cluster dispersion (BGSS)
  const clusterCounts = new Array(k).fill(0);
  vectors.forEach((vector, i) => {
    clusterCounts[assignments[i]]++;
  });

  let bgss = 0;
  for (let i = 0; i < k; i++) {
    if (clusterCounts[i] === 0) continue;
    const dist = distanceFn(centroids[i], overallCentroid);
    bgss += clusterCounts[i] * dist * dist;
  }

  // Calculate within-cluster dispersion (WCSS)
  let wcss = 0;
  vectors.forEach((vector, i) => {
    const cluster = assignments[i];
    const dist = distanceFn(vector, centroids[cluster]);
    wcss += dist * dist;
  });

  if (wcss === 0) return 0;

  // Calinski-Harabasz index
  return (bgss / (k - 1)) / (wcss / (n - k));
}

/**
 * Calculate Gap Statistic
 *
 * Compares clustering to random uniform distribution.
 * Higher gap indicates better clustering.
 *
 * @param {number[][]} vectors - Input vectors
 * @param {number[]} assignments - Cluster assignments
 * @param {number[][]} centroids - Cluster centroids
 * @param {Function} distanceFn - Distance function
 * @param {number} nReferences - Number of reference datasets
 * @returns {Promise<Object>} Gap statistic results
 */
export async function gapStatistic(vectors, assignments, centroids, distanceFn = euclideanDistance, nReferences = 10) {
  const n = vectors.length;
  const k = centroids.length;
  const dimensions = vectors[0].length;

  // Calculate within-cluster dispersion for actual data
  let wk = 0;
  vectors.forEach((vector, i) => {
    const dist = distanceFn(vector, centroids[assignments[i]]);
    wk += dist * dist;
  });
  wk = Math.log(wk + 1e-10); // Add small value to avoid log(0)

  // Generate reference datasets and calculate their dispersions
  const referenceWks = [];

  // Find min/max for each dimension to create uniform distribution
  const mins = new Array(dimensions).fill(Infinity);
  const maxs = new Array(dimensions).fill(-Infinity);

  vectors.forEach(vector => {
    vector.forEach((val, dim) => {
      mins[dim] = Math.min(mins[dim], val);
      maxs[dim] = Math.max(maxs[dim], val);
    });
  });

  // Generate reference datasets
  for (let ref = 0; ref < nReferences; ref++) {
    const refVectors = [];

    for (let i = 0; i < n; i++) {
      const refVector = new Array(dimensions);
      for (let dim = 0; dim < dimensions; dim++) {
        refVector[dim] = mins[dim] + Math.random() * (maxs[dim] - mins[dim]);
      }
      refVectors.push(refVector);
    }

    // Cluster reference data
    const refResult = kmeans(refVectors, k, { maxIterations: 50, distanceFn });

    let refWk = 0;
    refVectors.forEach((vector, i) => {
      const dist = distanceFn(vector, refResult.centroids[refResult.assignments[i]]);
      refWk += dist * dist;
    });
    referenceWks.push(Math.log(refWk + 1e-10));
  }

  // Calculate gap statistic
  const expectedWk = referenceWks.reduce((a, b) => a + b, 0) / nReferences;
  const gap = expectedWk - wk;

  // Calculate standard deviation
  const sdk = Math.sqrt(
    referenceWks.reduce((sum, wk) => sum + Math.pow(wk - expectedWk, 2), 0) / nReferences
  );
  const sk = sdk * Math.sqrt(1 + 1 / nReferences);

  return { gap, sk, expectedWk, actualWk: wk };
}

/**
 * Analyze clustering stability across multiple runs
 *
 * Higher stability (lower variance) indicates better K.
 *
 * @param {number[][]} vectors - Input vectors
 * @param {number} k - Number of clusters
 * @param {Object} options - Configuration options
 * @returns {Object} Stability metrics
 */
export function clusteringStability(vectors, k, options = {}) {
  const {
    nRuns = 10,
    distanceFn = euclideanDistance,
    ...kmeansOptions
  } = options;

  const inertias = [];
  const allAssignments = [];

  // Run k-means multiple times with different initializations
  for (let run = 0; run < nRuns; run++) {
    const result = kmeans(vectors, k, {
      ...kmeansOptions,
      distanceFn,
      seed: run // Different seed for each run
    });

    inertias.push(result.inertia);
    allAssignments.push(result.assignments);
  }

  // Calculate pairwise assignment similarity
  const assignmentSimilarities = [];
  for (let i = 0; i < nRuns - 1; i++) {
    for (let j = i + 1; j < nRuns; j++) {
      const similarity = calculateAssignmentSimilarity(allAssignments[i], allAssignments[j]);
      assignmentSimilarities.push(similarity);
    }
  }

  // Calculate statistics
  const avgInertia = inertias.reduce((a, b) => a + b, 0) / nRuns;
  const stdInertia = Math.sqrt(
    inertias.reduce((sum, val) => sum + Math.pow(val - avgInertia, 2), 0) / nRuns
  );

  const avgSimilarity = assignmentSimilarities.length > 0
    ? assignmentSimilarities.reduce((a, b) => a + b, 0) / assignmentSimilarities.length
    : 1;

  return {
    avgInertia,
    stdInertia,
    cvInertia: avgInertia !== 0 ? stdInertia / avgInertia : 0, // Coefficient of variation
    avgSimilarity,
    stability: avgSimilarity // Higher is more stable
  };
}

/**
 * Calculate similarity between two assignment arrays
 *
 * Returns value between 0 and 1 indicating how often
 * pairs of points are assigned to same cluster in both assignments.
 *
 * @param {number[]} assignments1 - First assignment array
 * @param {number[]} assignments2 - Second assignment array
 * @returns {number} Similarity score [0, 1]
 */
function calculateAssignmentSimilarity(assignments1, assignments2) {
  const n = assignments1.length;
  let matches = 0;

  // Count how many pairs of points are clustered together in both assignments
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameCluster1 = assignments1[i] === assignments1[j];
      const sameCluster2 = assignments2[i] === assignments2[j];
      if (sameCluster1 === sameCluster2) {
        matches++;
      }
    }
  }

  const totalPairs = (n * (n - 1)) / 2;
  return totalPairs > 0 ? matches / totalPairs : 1;
}
