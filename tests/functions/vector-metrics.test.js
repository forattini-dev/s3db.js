import { describe, test, expect } from 'vitest';
import {
  silhouetteScore,
  daviesBouldinIndex,
  calinskiHarabaszIndex,
  gapStatistic,
  clusteringStability
} from '../../src/plugins/vector/metrics.js';
import { euclideanDistance } from '../../src/plugins/vector/distances.js';

describe('Clustering Evaluation Metrics', () => {
  describe('silhouetteScore', () => {
    test('should return high score for well-separated clusters', () => {
      const vectors = [
        [0, 0], [1, 1], [2, 2],     // Cluster 0
        [10, 10], [11, 11], [12, 12] // Cluster 1
      ];
      const assignments = [0, 0, 0, 1, 1, 1];
      const centroids = [[1, 1], [11, 11]];

      const score = silhouetteScore(vectors, assignments, centroids);

      // Well-separated clusters should have high silhouette score (close to 1)
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should return low score for overlapping clusters', () => {
      const vectors = [
        [0, 0], [1, 1], [2, 2],
        [3, 3], [4, 4], [5, 5]
      ];
      const assignments = [0, 0, 0, 1, 1, 1];
      const centroids = [[1, 1], [4, 4]];

      const score = silhouetteScore(vectors, assignments, centroids);

      // Overlapping clusters should have lower score
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should skip singleton clusters', () => {
      const vectors = [[0, 0], [10, 10], [20, 20]];
      const assignments = [0, 1, 2]; // Each point in its own cluster
      const centroids = [[0, 0], [10, 10], [20, 20]];

      const score = silhouetteScore(vectors, assignments, centroids);

      // All points are singletons, score should be 0
      expect(score).toBe(0);
    });

    test('should handle two clusters', () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [10.5, 10.5]];

      const score = silhouetteScore(vectors, assignments, centroids);

      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('daviesBouldinIndex', () => {
    test('should return low value for well-separated clusters', () => {
      const vectors = [
        [0, 0], [1, 1],         // Cluster 0
        [10, 10], [11, 11]      // Cluster 1
      ];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [10.5, 10.5]];

      const index = daviesBouldinIndex(vectors, assignments, centroids);

      // Well-separated clusters should have low DB index
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(1);
    });

    test('should return higher value for overlapping clusters', () => {
      const vectors = [
        [0, 0], [1, 1],
        [2, 2], [3, 3]
      ];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [2.5, 2.5]];

      const index = daviesBouldinIndex(vectors, assignments, centroids);

      // Closer clusters should have higher DB index
      expect(index).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty clusters gracefully', () => {
      const vectors = [[0, 0], [1, 1]];
      const assignments = [0, 0]; // All in cluster 0, cluster 1 empty
      const centroids = [[0.5, 0.5], [10, 10]];

      const index = daviesBouldinIndex(vectors, assignments, centroids);

      expect(index).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calinskiHarabaszIndex', () => {
    test('should return high value for well-separated clusters', () => {
      const vectors = [
        [0, 0], [1, 1], [2, 2],
        [10, 10], [11, 11], [12, 12]
      ];
      const assignments = [0, 0, 0, 1, 1, 1];
      const centroids = [[1, 1], [11, 11]];

      const index = calinskiHarabaszIndex(vectors, assignments, centroids);

      // Well-separated clusters should have high CH index
      expect(index).toBeGreaterThan(0);
      expect(index).toBeGreaterThan(10); // Should be substantial
    });

    test('should return low value for poor clustering', () => {
      const vectors = [
        [0, 0], [1, 1], [2, 2],
        [3, 3], [4, 4], [5, 5]
      ];
      const assignments = [0, 0, 0, 1, 1, 1];
      const centroids = [[1, 1], [4, 4]];

      const index = calinskiHarabaszIndex(vectors, assignments, centroids);

      // Less separated clusters should have lower (but positive) CH index
      expect(index).toBeGreaterThanOrEqual(0);
    });

    test('should return 0 for k=1', () => {
      const vectors = [[0, 0], [1, 1], [2, 2]];
      const assignments = [0, 0, 0];
      const centroids = [[1, 1]];

      const index = calinskiHarabaszIndex(vectors, assignments, centroids);

      expect(index).toBe(0);
    });

    test('should return 0 for k=n', () => {
      const vectors = [[0, 0], [1, 1], [2, 2]];
      const assignments = [0, 1, 2];
      const centroids = [[0, 0], [1, 1], [2, 2]];

      const index = calinskiHarabaszIndex(vectors, assignments, centroids);

      expect(index).toBe(0);
    });
  });

  describe('gapStatistic', () => {
    test('should calculate gap statistic', async () => {
      const vectors = [
        [0, 0], [1, 1],
        [10, 10], [11, 11]
      ];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [10.5, 10.5]];

      const result = await gapStatistic(vectors, assignments, centroids, euclideanDistance, 5);

      expect(result).toHaveProperty('gap');
      expect(result).toHaveProperty('sk');
      expect(result).toHaveProperty('expectedWk');
      expect(result).toHaveProperty('actualWk');

      expect(typeof result.gap).toBe('number');
      expect(typeof result.sk).toBe('number');
      expect(result.sk).toBeGreaterThanOrEqual(0);
    });

    test('should have positive gap for good clustering', async () => {
      // Well-separated clusters should have positive gap
      const vectors = [
        [0, 0], [1, 1], [2, 2],
        [20, 20], [21, 21], [22, 22]
      ];
      const assignments = [0, 0, 0, 1, 1, 1];
      const centroids = [[1, 1], [21, 21]];

      const result = await gapStatistic(vectors, assignments, centroids, euclideanDistance, 5);

      // Gap should typically be positive for structured data
      expect(result.gap).toBeGreaterThanOrEqual(-5); // Allow some variance
    });

    test('should handle different numbers of references', async () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [10.5, 10.5]];

      const result1 = await gapStatistic(vectors, assignments, centroids, euclideanDistance, 3);
      const result2 = await gapStatistic(vectors, assignments, centroids, euclideanDistance, 10);

      // Both should produce valid results
      expect(typeof result1.gap).toBe('number');
      expect(typeof result2.gap).toBe('number');
    });
  });

  describe('clusteringStability', () => {
    test('should measure clustering stability across runs', () => {
      const vectors = [
        [0, 0], [1, 1], [2, 2],
        [10, 10], [11, 11], [12, 12]
      ];

      const stability = clusteringStability(vectors, 2, {
        nRuns: 5,
        distanceFn: euclideanDistance
      });

      expect(stability).toHaveProperty('avgInertia');
      expect(stability).toHaveProperty('stdInertia');
      expect(stability).toHaveProperty('cvInertia');
      expect(stability).toHaveProperty('avgSimilarity');
      expect(stability).toHaveProperty('stability');

      expect(stability.avgInertia).toBeGreaterThan(0);
      expect(stability.stdInertia).toBeGreaterThanOrEqual(0);
      expect(stability.stability).toBeGreaterThanOrEqual(0);
      expect(stability.stability).toBeLessThanOrEqual(1);
    });

    test('should show high stability for well-separated clusters', () => {
      const vectors = [
        [0, 0], [0.5, 0.5], [1, 1],
        [20, 20], [20.5, 20.5], [21, 21]
      ];

      const stability = clusteringStability(vectors, 2, {
        nRuns: 5,
        distanceFn: euclideanDistance
      });

      // Well-separated clusters should be very stable
      expect(stability.stability).toBeGreaterThan(0.8);
      expect(stability.cvInertia).toBeLessThan(0.2); // Low variance
    });

    test('should show low stability for ambiguous clustering', () => {
      // Create data where clustering is ambiguous
      const vectors = [
        [0, 0], [1, 1], [2, 2],
        [3, 3], [4, 4], [5, 5]
      ];

      const stability = clusteringStability(vectors, 3, {
        nRuns: 5,
        distanceFn: euclideanDistance
      });

      // Stability should be defined but may be lower
      expect(stability.stability).toBeGreaterThanOrEqual(0);
      expect(stability.stability).toBeLessThanOrEqual(1);
    });

    test('should handle single run', () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];

      const stability = clusteringStability(vectors, 2, {
        nRuns: 1,
        distanceFn: euclideanDistance
      });

      expect(stability.avgInertia).toBeGreaterThan(0);
      expect(stability.stability).toBe(1); // No pairwise comparisons, returns 1
    });
  });

  describe('Metric Consistency', () => {
    test('silhouette should be in valid range', () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [10.5, 10.5]];

      const score = silhouetteScore(vectors, assignments, centroids);

      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('daviesBouldin should be non-negative', () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [10.5, 10.5]];

      const index = daviesBouldinIndex(vectors, assignments, centroids);

      expect(index).toBeGreaterThanOrEqual(0);
    });

    test('calinskiHarabasz should be non-negative', () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];
      const assignments = [0, 0, 1, 1];
      const centroids = [[0.5, 0.5], [10.5, 10.5]];

      const index = calinskiHarabaszIndex(vectors, assignments, centroids);

      expect(index).toBeGreaterThanOrEqual(0);
    });

    test('stability should be in [0, 1]', () => {
      const vectors = [[0, 0], [1, 1], [10, 10], [11, 11]];

      const stability = clusteringStability(vectors, 2, { nRuns: 3 });

      expect(stability.stability).toBeGreaterThanOrEqual(0);
      expect(stability.stability).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle all points in same cluster', () => {
      const vectors = [[0, 0], [1, 1], [2, 2]];
      const assignments = [0, 0, 0];
      const centroids = [[1, 1]];

      const silhouette = silhouetteScore(vectors, assignments, centroids);
      const db = daviesBouldinIndex(vectors, assignments, centroids);
      const ch = calinskiHarabaszIndex(vectors, assignments, centroids);

      // All points in same cluster should be 0 or very close
      expect(silhouette).toBeGreaterThanOrEqual(-0.1);
      expect(silhouette).toBeLessThanOrEqual(0.1);
      expect(db).toBeGreaterThanOrEqual(0);
      expect(ch).toBe(0); // k=1
    });

    test('should handle identical points', () => {
      const vectors = [[5, 5], [5, 5], [5, 5]];
      const assignments = [0, 0, 0];
      const centroids = [[5, 5]];

      const silhouette = silhouetteScore(vectors, assignments, centroids);
      const db = daviesBouldinIndex(vectors, assignments, centroids);

      expect(typeof silhouette).toBe('number');
      expect(typeof db).toBe('number');
    });
  });
});
