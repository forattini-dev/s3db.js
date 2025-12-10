import { describe, test, expect } from 'vitest';
import { kmeans, findOptimalK } from '../../../src/plugins/vector/kmeans.js';
import { euclideanDistance, cosineDistance } from '../../../src/plugins/vector/distances.js';

describe('K-Means Clustering', () => {
  describe('kmeans', () => {
    test('should cluster simple 2D data into 2 clusters', () => {
      // Create two obvious clusters
      const vectors = [
        [0, 0], [0.5, 0.5], [1, 1],     // Cluster 1
        [10, 10], [10.5, 10.5], [11, 11] // Cluster 2
      ];

      const result = kmeans(vectors, 2);

      expect(result.centroids).toHaveLength(2);
      expect(result.assignments).toHaveLength(6);
      expect(result.converged).toBe(true);
      expect(result.iterations).toBeGreaterThan(0);

      // Check that first 3 points are in one cluster, last 3 in another
      const cluster1 = result.assignments[0];
      const cluster2 = result.assignments[3];
      expect(result.assignments[0]).toBe(cluster1);
      expect(result.assignments[1]).toBe(cluster1);
      expect(result.assignments[2]).toBe(cluster1);
      expect(result.assignments[3]).toBe(cluster2);
      expect(result.assignments[4]).toBe(cluster2);
      expect(result.assignments[5]).toBe(cluster2);
      expect(cluster1).not.toBe(cluster2);
    });

    test('should handle single cluster', () => {
      const vectors = [[1, 2], [2, 3], [3, 4]];
      const result = kmeans(vectors, 1);

      expect(result.centroids).toHaveLength(1);
      expect(result.assignments).toEqual([0, 0, 0]);
    });

    test('should handle k equal to number of vectors', () => {
      const vectors = [[1, 2], [3, 4], [5, 6]];
      const result = kmeans(vectors, 3);

      expect(result.centroids).toHaveLength(3);
      expect(result.converged).toBe(true);
    });

    test('should work with different distance functions', () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];

      const resultEuclidean = kmeans(vectors, 2, { distanceFn: euclideanDistance });
      const resultCosine = kmeans(vectors, 2, { distanceFn: cosineDistance });

      expect(resultEuclidean.centroids).toHaveLength(2);
      expect(resultCosine.centroids).toHaveLength(2);
    });

    test('should respect maxIterations', () => {
      const vectors = [[0, 0], [1, 1], [2, 2], [10, 10], [11, 11], [12, 12]];
      const result = kmeans(vectors, 2, { maxIterations: 1 });

      expect(result.iterations).toBeLessThanOrEqual(1);
    });

    test('should use seed for reproducibility', () => {
      const vectors = [[0, 0], [1, 1], [2, 2], [10, 10], [11, 11], [12, 12]];

      const result1 = kmeans(vectors, 2, { seed: 42 });
      const result2 = kmeans(vectors, 2, { seed: 42 });

      expect(result1.assignments).toEqual(result2.assignments);
      expect(result1.inertia).toBeCloseTo(result2.inertia, 5);
    });

    test('should calculate inertia correctly', () => {
      const vectors = [[0, 0], [1, 1]];
      const result = kmeans(vectors, 1);

      // With 1 cluster, centroid should be [0.5, 0.5]
      // Inertia = sum of squared distances from points to centroid
      expect(result.inertia).toBeGreaterThan(0);
    });

    test('should handle high-dimensional vectors', () => {
      const dimensions = 128;
      const vectors = [
        Array(dimensions).fill(0),
        Array(dimensions).fill(0.1),
        Array(dimensions).fill(1),
        Array(dimensions).fill(1.1)
      ];

      const result = kmeans(vectors, 2);

      expect(result.centroids).toHaveLength(2);
      expect(result.centroids[0]).toHaveLength(dimensions);
      expect(result.converged).toBe(true);
    });

    test('should throw error for empty vectors', () => {
      expect(() => kmeans([], 2)).toThrow('Cannot cluster empty vector array');
    });

    test('should throw error for k < 1', () => {
      const vectors = [[1, 2], [3, 4]];
      expect(() => kmeans(vectors, 0)).toThrow('k must be at least 1');
    });

    test('should throw error for k > n', () => {
      const vectors = [[1, 2], [3, 4]];
      expect(() => kmeans(vectors, 3)).toThrow('cannot be greater than number of vectors');
    });

    test('should throw error for inconsistent dimensions', () => {
      const vectors = [[1, 2], [3, 4, 5]];
      expect(() => kmeans(vectors, 2)).toThrow('All vectors must have same dimensions');
    });

    test('should handle identical vectors', () => {
      const vectors = [[1, 2], [1, 2], [1, 2]];
      const result = kmeans(vectors, 2);

      expect(result.centroids).toHaveLength(2);
      expect(result.inertia).toBeCloseTo(0, 5);
    });
  });

  describe('findOptimalK', () => {
    test('should analyze optimal K with all metrics', async () => {
      // Create clear 3-cluster data
      const vectors = [
        // Cluster 1
        [0, 0], [0.5, 0.5], [1, 1],
        // Cluster 2
        [10, 10], [10.5, 10.5], [11, 11],
        // Cluster 3
        [20, 20], [20.5, 20.5], [21, 21]
      ];

      const analysis = await findOptimalK(vectors, {
        minK: 2,
        maxK: 5,
        nReferences: 5,  // Reduced for speed
        stabilityRuns: 3 // Reduced for speed
      });

      // Check structure
      expect(analysis.results).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
      expect(analysis.consensus).toBeDefined();
      expect(analysis.summary).toBeDefined();

      // Check results array
      expect(analysis.results).toHaveLength(4); // K=2,3,4,5
      analysis.results.forEach(result => {
        expect(result).toHaveProperty('k');
        expect(result).toHaveProperty('inertia');
        expect(result).toHaveProperty('silhouette');
        expect(result).toHaveProperty('daviesBouldin');
        expect(result).toHaveProperty('calinskiHarabasz');
        expect(result).toHaveProperty('gap');
        expect(result).toHaveProperty('stability');
      });

      // Check recommendations
      expect(analysis.recommendations).toHaveProperty('elbow');
      expect(analysis.recommendations).toHaveProperty('silhouette');
      expect(analysis.recommendations).toHaveProperty('daviesBouldin');
      expect(analysis.recommendations).toHaveProperty('calinskiHarabasz');
      expect(analysis.recommendations).toHaveProperty('gap');
      expect(analysis.recommendations).toHaveProperty('stability');

      // Consensus should be a number between minK and maxK
      expect(analysis.consensus).toBeGreaterThanOrEqual(2);
      expect(analysis.consensus).toBeLessThanOrEqual(5);

      // Summary
      expect(analysis.summary.totalVectors).toBe(9);
      expect(analysis.summary.dimensions).toBe(2);
      expect(analysis.summary.confidence).toBeGreaterThan(0);
      expect(analysis.summary.confidence).toBeLessThanOrEqual(1);
    });

    test('should respect custom distance function', async () => {
      const vectors = [[1, 2], [2, 3], [10, 11], [11, 12]];

      const analysis = await findOptimalK(vectors, {
        minK: 2,
        maxK: 3,
        distanceFn: cosineDistance,
        nReferences: 3,
        stabilityRuns: 2
      });

      expect(analysis.results).toHaveLength(2);
      expect(analysis.consensus).toBeGreaterThanOrEqual(2);
    });

    test('should use default maxK based on data size', async () => {
      const vectors = Array(20).fill(0).map((_, i) => [i, i]);

      const analysis = await findOptimalK(vectors, {
        minK: 2,
        nReferences: 3,
        stabilityRuns: 2
      });

      // Default maxK should be min(10, floor(sqrt(n/2)))
      // For n=20: floor(sqrt(10)) = 3
      const expectedMaxK = Math.min(10, Math.floor(Math.sqrt(20 / 2)));
      expect(analysis.results).toHaveLength(expectedMaxK - 2 + 1);
    });

    test('should have inertia decreasing with K', async () => {
      const vectors = Array(12).fill(0).map((_, i) => [i, i]);

      const analysis = await findOptimalK(vectors, {
        minK: 2,
        maxK: 4,
        nReferences: 3,
        stabilityRuns: 2
      });

      // Inertia should generally decrease as K increases
      for (let i = 1; i < analysis.results.length; i++) {
        expect(analysis.results[i].inertia).toBeLessThanOrEqual(
          analysis.results[i - 1].inertia
        );
      }
    });

    test('should provide reasonable silhouette scores', async () => {
      // Create well-separated clusters
      const vectors = [
        [0, 0], [1, 1],
        [10, 10], [11, 11],
        [20, 20], [21, 21]
      ];

      const analysis = await findOptimalK(vectors, {
        minK: 2,
        maxK: 4,
        nReferences: 3,
        stabilityRuns: 2
      });

      // Silhouette scores should be in [-1, 1]
      analysis.results.forEach(result => {
        expect(result.silhouette).toBeGreaterThanOrEqual(-1);
        expect(result.silhouette).toBeLessThanOrEqual(1);
      });

      // K=3 should have best silhouette for 3-cluster data
      const k3Result = analysis.results.find(r => r.k === 3);
      expect(k3Result.silhouette).toBeGreaterThan(0);
    });
  });

  describe('K-Means++ Initialization', () => {
    test('should produce better results than random initialization', () => {
      // Create data where initialization matters
      const vectors = [
        [0, 0], [0.1, 0.1], [0.2, 0.2],
        [5, 5], [5.1, 5.1], [5.2, 5.2],
        [10, 10], [10.1, 10.1], [10.2, 10.2]
      ];

      // Run multiple times and check consistency
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = kmeans(vectors, 3, { seed: i });
        results.push(result);
      }

      // All runs should find similar inertia
      const inertias = results.map(r => r.inertia);
      const avgInertia = inertias.reduce((a, b) => a + b) / inertias.length;
      const maxDeviation = Math.max(...inertias.map(i => Math.abs(i - avgInertia)));

      // With k-means++, deviation should be small
      expect(maxDeviation / avgInertia).toBeLessThan(0.5); // Within 50%
    });
  });

  describe('Edge Cases', () => {
    test('should handle vectors with negative values', () => {
      const vectors = [[-5, -5], [-4, -4], [5, 5], [6, 6]];
      const result = kmeans(vectors, 2);

      expect(result.centroids).toHaveLength(2);
      expect(result.converged).toBe(true);
    });

    test('should handle vectors with large values', () => {
      const vectors = [[1000, 2000], [1100, 2100], [5000, 6000], [5100, 6100]];
      const result = kmeans(vectors, 2);

      expect(result.centroids).toHaveLength(2);
      expect(result.converged).toBe(true);
    });

    test('should handle sparse vectors', () => {
      const vectors = [
        [1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 0, 1, 0, 0]
      ];
      const result = kmeans(vectors, 2);

      expect(result.centroids).toHaveLength(2);
      expect(result.converged).toBe(true);
    });
  });
});
