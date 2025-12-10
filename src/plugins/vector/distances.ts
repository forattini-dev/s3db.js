import { ValidationError } from '../../errors.js';

function assertSameDimensions(a: number[], b: number[], operation: string): void {
  if (a.length !== b.length) {
    throw new ValidationError(`Dimension mismatch: ${a.length} vs ${b.length}`, {
      operation,
      pluginName: 'VectorPlugin',
      retriable: false,
      suggestion: 'Ensure both vectors have identical lengths before calling distance utilities.',
      metadata: { vectorALength: a.length, vectorBLength: b.length }
    });
  }
}

export function cosineDistance(a: number[], b: number[]): number {
  assertSameDimensions(a, b, 'cosineDistance');

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return a.every(v => v === 0) && b.every(v => v === 0) ? 0 : 1;
  }

  const similarity = dotProduct / denominator;

  return 1 - similarity;
}

export function euclideanDistance(a: number[], b: number[]): number {
  assertSameDimensions(a, b, 'euclideanDistance');

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

export function manhattanDistance(a: number[], b: number[]): number {
  assertSameDimensions(a, b, 'manhattanDistance');

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i]! - b[i]!);
  }

  return sum;
}

export function dotProduct(a: number[], b: number[]): number {
  assertSameDimensions(a, b, 'dotProduct');

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }

  return sum;
}

export function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );

  if (magnitude === 0) {
    return vector.slice();
  }

  return vector.map(val => val / magnitude);
}

export function magnitude(vector: number[]): number {
  return Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );
}

export function vectorsEqual(a: number[], b: number[], epsilon: number = 1e-10): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) > epsilon) {
      return false;
    }
  }

  return true;
}
