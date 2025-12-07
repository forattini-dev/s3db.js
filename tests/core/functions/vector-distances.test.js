import { describe, test, expect } from 'vitest';
import {
  cosineDistance,
  euclideanDistance,
  manhattanDistance,
  dotProduct,
  normalize,
  magnitude,
  vectorsEqual
} from '../../../src/plugins/vector/distances.js';

describe('Vector Distance Functions', () => {
  describe('cosineDistance', () => {
    test('should calculate cosine distance between identical vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(0, 5);
    });

    test('should calculate cosine distance between orthogonal vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(1, 5); // 90 degrees = distance of 1
    });

    test('should calculate cosine distance between opposite vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [-1, 0, 0];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(2, 5); // 180 degrees = distance of 2
    });

    test('should handle zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [0, 0, 0];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBe(0);
    });

    test('should handle one zero vector', () => {
      const v1 = [1, 2, 3];
      const v2 = [0, 0, 0];
      const dist = cosineDistance(v1, v2);
      expect(dist).toBe(1);
    });

    test('should throw error for dimension mismatch', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(() => cosineDistance(v1, v2)).toThrow('Dimension mismatch');
    });

    test('should work with high-dimensional vectors', () => {
      const dimensions = 1536; // OpenAI ada-002
      const v1 = Array(dimensions).fill(1);
      const v2 = Array(dimensions).fill(1);
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeCloseTo(0, 5);
    });
  });

  describe('euclideanDistance', () => {
    test('should calculate euclidean distance between identical vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBeCloseTo(0, 5);
    });

    test('should calculate euclidean distance correctly', () => {
      const v1 = [0, 0];
      const v2 = [3, 4];
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBeCloseTo(5, 5); // 3-4-5 triangle
    });

    test('should handle zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [0, 0, 0];
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBe(0);
    });

    test('should throw error for dimension mismatch', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(() => euclideanDistance(v1, v2)).toThrow('Dimension mismatch');
    });

    test('should work with high-dimensional vectors', () => {
      const dimensions = 1536;
      const v1 = Array(dimensions).fill(0);
      const v2 = Array(dimensions).fill(0);
      const dist = euclideanDistance(v1, v2);
      expect(dist).toBe(0);
    });
  });

  describe('manhattanDistance', () => {
    test('should calculate manhattan distance between identical vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(0);
    });

    test('should calculate manhattan distance correctly', () => {
      const v1 = [0, 0];
      const v2 = [3, 4];
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(7); // |3-0| + |4-0| = 7
    });

    test('should handle negative differences', () => {
      const v1 = [5, 5];
      const v2 = [2, 8];
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(6); // |5-2| + |5-8| = 3 + 3 = 6
    });

    test('should throw error for dimension mismatch', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(() => manhattanDistance(v1, v2)).toThrow('Dimension mismatch');
    });

    test('should work with high-dimensional vectors', () => {
      const dimensions = 1536;
      const v1 = Array(dimensions).fill(1);
      const v2 = Array(dimensions).fill(2);
      const dist = manhattanDistance(v1, v2);
      expect(dist).toBe(dimensions);
    });
  });

  describe('dotProduct', () => {
    test('should calculate dot product correctly', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];
      const product = dotProduct(v1, v2);
      expect(product).toBe(32); // 1*4 + 2*5 + 3*6 = 32
    });

    test('should return 0 for orthogonal vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      const product = dotProduct(v1, v2);
      expect(product).toBe(0);
    });

    test('should return negative for opposite directions', () => {
      const v1 = [1, 0, 0];
      const v2 = [-1, 0, 0];
      const product = dotProduct(v1, v2);
      expect(product).toBe(-1);
    });

    test('should throw error for dimension mismatch', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(() => dotProduct(v1, v2)).toThrow('Dimension mismatch');
    });
  });

  describe('normalize', () => {
    test('should normalize vector to unit length', () => {
      const v = [3, 4]; // Length 5
      const normalized = normalize(v);
      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);

      // Check magnitude is 1
      const mag = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2);
      expect(mag).toBeCloseTo(1, 5);
    });

    test('should handle already normalized vectors', () => {
      const v = [1, 0, 0];
      const normalized = normalize(v);
      expect(normalized[0]).toBeCloseTo(1, 5);
      expect(normalized[1]).toBeCloseTo(0, 5);
      expect(normalized[2]).toBeCloseTo(0, 5);
    });

    test('should handle zero vectors', () => {
      const v = [0, 0, 0];
      const normalized = normalize(v);
      expect(normalized).toEqual([0, 0, 0]);
    });

    test('should not modify original vector', () => {
      const v = [3, 4];
      const originalCopy = [...v];
      normalize(v);
      expect(v).toEqual(originalCopy);
    });

    test('should work with high-dimensional vectors', () => {
      const dimensions = 1536;
      const v = Array(dimensions).fill(1);
      const normalized = normalize(v);

      // Check magnitude is 1
      const mag = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
      expect(mag).toBeCloseTo(1, 5);
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

    test('should use default epsilon', () => {
      const v1 = [1.0, 2.0, 3.0];
      const v2 = [1.0 + 1e-11, 2.0, 3.0]; // Within default epsilon (1e-10)
      expect(vectorsEqual(v1, v2)).toBe(true);
    });
  });

  describe('Distance Function Consistency', () => {
    test('cosine distance should be symmetric', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];
      expect(cosineDistance(v1, v2)).toBeCloseTo(cosineDistance(v2, v1), 5);
    });

    test('euclidean distance should be symmetric', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];
      expect(euclideanDistance(v1, v2)).toBeCloseTo(euclideanDistance(v2, v1), 5);
    });

    test('manhattan distance should be symmetric', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];
      expect(manhattanDistance(v1, v2)).toBeCloseTo(manhattanDistance(v2, v1), 5);
    });

    test('normalized vectors should have cosine distance in [0, 2]', () => {
      const v1 = normalize([1, 2, 3]);
      const v2 = normalize([4, 5, 6]);
      const dist = cosineDistance(v1, v2);
      expect(dist).toBeGreaterThanOrEqual(0);
      expect(dist).toBeLessThanOrEqual(2);
    });
  });
});
