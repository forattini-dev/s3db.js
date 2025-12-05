import { describe, test, expect } from 'vitest';
import {
  cosineDistance,
  euclideanDistance,
  manhattanDistance,
  dotProduct,
  normalize,
  magnitude,
  vectorsEqual
} from '../../src/plugins/vector/distances.js';

describe('Vector Distance Functions - Extended Coverage', () => {
  describe('cosineDistance - Edge Cases', () => {
    test('should handle one zero vector and one non-zero', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBe(1);  // Should return 1, not NaN
    });

    test('should handle negative values', () => {
      const v1 = [-1, -2, -3];
      const v2 = [1, 2, 3];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(2, 5);  // Opposite directions
    });

    test('should handle mixed positive and negative', () => {
      const v1 = [1, -1, 0];
      const v2 = [-1, 1, 0];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(2, 5);  // Opposite
    });

    test('should handle very small values', () => {
      const v1 = [0.0001, 0.0002, 0.0003];
      const v2 = [0.0001, 0.0002, 0.0003];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(0, 5);
    });

    test('should handle large values', () => {
      const v1 = [1000000, 2000000, 3000000];
      const v2 = [1000000, 2000000, 3000000];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(0, 5);
    });

    test('should handle single dimension vectors', () => {
      const v1 = [5];
      const v2 = [3];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(0, 5);  // Same direction
    });
  });

  describe('euclideanDistance - Edge Cases', () => {
    test('should handle negative coordinates', () => {
      const v1 = [-3, -4];
      const v2 = [0, 0];
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBeCloseTo(5, 5);
    });

    test('should handle large dimensions', () => {
      const dim = 1000;
      const v1 = Array(dim).fill(1);
      const v2 = Array(dim).fill(2);
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBeCloseTo(Math.sqrt(dim), 5);
    });

    test('should handle single dimension', () => {
      const v1 = [10];
      const v2 = [3];
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBe(7);
    });

    test('should handle fractional values', () => {
      const v1 = [0.5, 0.5];
      const v2 = [1.5, 1.5];
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBeCloseTo(Math.sqrt(2), 5);
    });
  });

  describe('manhattanDistance - Edge Cases', () => {
    test('should handle all negative values', () => {
      const v1 = [-5, -10];
      const v2 = [-3, -7];
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(5);  // |(-5)-(-3)| + |(-10)-(-7)| = 2 + 3 = 5
    });

    test('should handle zero difference', () => {
      const v1 = [5, 10, 15];
      const v2 = [5, 10, 15];
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(0);
    });

    test('should handle single dimension', () => {
      const v1 = [10];
      const v2 = [3];
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(7);
    });

    test('should handle large dimensions', () => {
      const dim = 1000;
      const v1 = Array(dim).fill(1);
      const v2 = Array(dim).fill(2);
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(dim);  // Each dimension contributes 1
    });
  });

  describe('dotProduct - Edge Cases', () => {
    test('should handle zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      const product = dotProduct(v1, v2);
      expect(product).toBe(0);
    });

    test('should handle negative values', () => {
      const v1 = [1, -2, 3];
      const v2 = [-1, 2, -3];
      const product = dotProduct(v1, v2);
      expect(product).toBe(-14);  // 1*(-1) + (-2)*2 + 3*(-3) = -1 -4 -9 = -14
    });

    test('should handle single dimension', () => {
      const v1 = [5];
      const v2 = [3];
      const product = dotProduct(v1, v2);
      expect(product).toBe(15);
    });

    test('should handle large values', () => {
      const v1 = [1000, 2000];
      const v2 = [3000, 4000];
      const product = dotProduct(v1, v2);
      expect(product).toBe(11000000);
    });

    test('should be commutative', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];
      expect(dotProduct(v1, v2)).toBe(dotProduct(v2, v1));
    });
  });

  describe('normalize - Edge Cases', () => {
    test('should handle already normalized vectors', () => {
      const v = [1, 0, 0];
      const normalized = normalize(v);
      expect(normalized[0]).toBeCloseTo(1, 5);
      expect(normalized[1]).toBeCloseTo(0, 5);
      expect(normalized[2]).toBeCloseTo(0, 5);
    });

    test('should handle negative values', () => {
      const v = [-3, -4];
      const normalized = normalize(v);
      expect(normalized[0]).toBeCloseTo(-0.6, 5);
      expect(normalized[1]).toBeCloseTo(-0.8, 5);

      const mag = Math.sqrt(normalized[0]**2 + normalized[1]**2);
      expect(mag).toBeCloseTo(1, 5);
    });

    test('should handle mixed positive and negative', () => {
      const v = [1, -1, 1, -1];
      const normalized = normalize(v);
      const mag = Math.sqrt(normalized.reduce((sum, val) => sum + val*val, 0));
      expect(mag).toBeCloseTo(1, 5);
    });

    test('should handle very small vectors', () => {
      const v = [0.0001, 0.0002, 0.0003];
      const normalized = normalize(v);
      const mag = Math.sqrt(normalized.reduce((sum, val) => sum + val*val, 0));
      expect(mag).toBeCloseTo(1, 5);
    });

    test('should handle single dimension', () => {
      const v = [5];
      const normalized = normalize(v);
      expect(normalized[0]).toBeCloseTo(1, 5);
    });

    test('should return copy of zero vector unchanged', () => {
      const v = [0, 0, 0];
      const normalized = normalize(v);
      expect(normalized).toEqual([0, 0, 0]);
      expect(normalized).not.toBe(v);  // Should be a copy
    });

    test('should not modify original vector', () => {
      const v = [3, 4];
      const original = [...v];
      normalize(v);
      expect(v).toEqual(original);
    });
  });

  describe('magnitude', () => {
    test('should calculate magnitude correctly', () => {
      const v = [3, 4];
      const mag = magnitude(v);
      expect(mag).toBeCloseTo(5, 5);
    });

    test('should return 0 for zero vector', () => {
      const v = [0, 0, 0];
      const mag = magnitude(v);
      expect(mag).toBe(0);
    });

    test('should return 1 for unit vectors', () => {
      const v = [1, 0, 0];
      const mag = magnitude(v);
      expect(mag).toBe(1);
    });

    test('should handle negative values', () => {
      const v = [-3, -4];
      const mag = magnitude(v);
      expect(mag).toBeCloseTo(5, 5);
    });

    test('should handle single dimension', () => {
      const v = [7];
      const mag = magnitude(v);
      expect(mag).toBe(7);
    });

    test('should handle large dimensions', () => {
      const dim = 100;
      const v = Array(dim).fill(1);
      const mag = magnitude(v);
      expect(mag).toBeCloseTo(Math.sqrt(dim), 5);
    });
  });

  describe('vectorsEqual', () => {
    test('should return true for identical vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];
      expect(vectorsEqual(v1, v2)).toBe(true);
    });

    test('should return false for different vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 4];
      expect(vectorsEqual(v1, v2)).toBe(false);
    });

    test('should return false for different dimensions', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(vectorsEqual(v1, v2)).toBe(false);
    });

    test('should handle floating point comparison with epsilon', () => {
      const v1 = [1.0000001, 2, 3];
      const v2 = [1.0000002, 2, 3];
      expect(vectorsEqual(v1, v2, 1e-5)).toBe(true);
      expect(vectorsEqual(v1, v2, 1e-10)).toBe(false);
    });

    test('should handle negative values', () => {
      const v1 = [-1, -2, -3];
      const v2 = [-1, -2, -3];
      expect(vectorsEqual(v1, v2)).toBe(true);
    });

    test('should handle zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [0, 0, 0];
      expect(vectorsEqual(v1, v2)).toBe(true);
    });

    test('should handle very small differences', () => {
      const v1 = [1.0, 2.0, 3.0];
      const v2 = [1.0 + 1e-15, 2.0, 3.0];
      expect(vectorsEqual(v1, v2)).toBe(true);
    });

    test('should handle large values', () => {
      const v1 = [1000000, 2000000];
      const v2 = [1000000, 2000000];
      expect(vectorsEqual(v1, v2)).toBe(true);
    });

    test('should respect custom epsilon', () => {
      const v1 = [1.0, 2.0];
      const v2 = [1.1, 2.0];
      expect(vectorsEqual(v1, v2, 0.2)).toBe(true);
      expect(vectorsEqual(v1, v2, 0.05)).toBe(false);
    });
  });

  describe('All Functions - Dimension Mismatch', () => {
    test('cosineDistance should throw on mismatch', () => {
      expect(() => cosineDistance([1, 2], [1, 2, 3])).toThrow('Dimension mismatch');
    });

    test('euclideanDistance should throw on mismatch', () => {
      expect(() => euclideanDistance([1, 2], [1, 2, 3])).toThrow('Dimension mismatch');
    });

    test('manhattanDistance should throw on mismatch', () => {
      expect(() => manhattanDistance([1, 2], [1, 2, 3])).toThrow('Dimension mismatch');
    });

    test('dotProduct should throw on mismatch', () => {
      expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow('Dimension mismatch');
    });
  });

  describe('Distance Properties', () => {
    test('all distances should be non-negative', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];

      expect(cosineDistance(v1, v2)).toBeGreaterThanOrEqual(0);
      expect(euclideanDistance(v1, v2)).toBeGreaterThanOrEqual(0);
      expect(manhattanDistance(v1, v2)).toBeGreaterThanOrEqual(0);
    });

    test('all distances should be symmetric', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];

      expect(cosineDistance(v1, v2)).toBeCloseTo(cosineDistance(v2, v1), 10);
      expect(euclideanDistance(v1, v2)).toBeCloseTo(euclideanDistance(v2, v1), 10);
      expect(manhattanDistance(v1, v2)).toBeCloseTo(manhattanDistance(v2, v1), 10);
    });

    test('distance to self should be zero', () => {
      const v = [1, 2, 3];

      expect(cosineDistance(v, v)).toBeCloseTo(0, 5);
      expect(euclideanDistance(v, v)).toBeCloseTo(0, 5);
      expect(manhattanDistance(v, v)).toBeCloseTo(0, 5);
    });
  });

  describe('Normalized Vector Properties', () => {
    test('normalized vectors should have magnitude 1', () => {
      const vectors = [
        [3, 4],
        [1, 2, 3, 4, 5],
        [-5, 12],
        [0.1, 0.2, 0.3]
      ];

      vectors.forEach(v => {
        const normalized = normalize(v);
        const mag = magnitude(normalized);
        expect(mag).toBeCloseTo(1, 5);
      });
    });

    test('normalized vectors should have same direction', () => {
      const v1 = [3, 4];
      const v2 = [6, 8];  // Same direction, different magnitude

      const n1 = normalize(v1);
      const n2 = normalize(v2);

      // Should have same normalized values
      expect(n1[0]).toBeCloseTo(n2[0], 5);
      expect(n1[1]).toBeCloseTo(n2[1], 5);
    });

    test('cosine distance between normalized vectors', () => {
      const v1 = normalize([3, 4]);
      const v2 = normalize([4, 3]);

      const dist = cosineDistance(v1, v2);
      expect(dist).toBeGreaterThanOrEqual(0);
      expect(dist).toBeLessThanOrEqual(2);
    });
  });
});
