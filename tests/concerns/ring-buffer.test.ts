import { describe, it, expect, beforeEach } from 'vitest';
import { RingBuffer, LatencyBuffer } from '../../src/concerns/ring-buffer.js';

describe('RingBuffer', () => {
  describe('basic operations', () => {
    it('should initialize with correct capacity', () => {
      const buffer = new RingBuffer<number>(10);
      expect(buffer.count).toBe(0);
      expect(buffer.isFull).toBe(false);
    });

    it('should throw for invalid capacity', () => {
      expect(() => new RingBuffer<number>(0)).toThrow('capacity must be at least 1');
      expect(() => new RingBuffer<number>(-1)).toThrow('capacity must be at least 1');
    });

    it('should push and retrieve values', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.count).toBe(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should wrap around when full', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      expect(buffer.count).toBe(3);
      expect(buffer.isFull).toBe(true);
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });

    it('should clear buffer', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.clear();

      expect(buffer.count).toBe(0);
      expect(buffer.toArray()).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle single element capacity', () => {
      const buffer = new RingBuffer<string>(1);
      buffer.push('a');
      buffer.push('b');
      buffer.push('c');

      expect(buffer.count).toBe(1);
      expect(buffer.toArray()).toEqual(['c']);
    });

    it('should handle different types', () => {
      const buffer = new RingBuffer<{ id: number }>(3);
      buffer.push({ id: 1 });
      buffer.push({ id: 2 });

      expect(buffer.toArray()).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });
});

describe('LatencyBuffer', () => {
  let buffer: LatencyBuffer;

  beforeEach(() => {
    buffer = new LatencyBuffer(100);
  });

  describe('percentile calculations', () => {
    it('should return 0 for empty buffer', () => {
      expect(buffer.percentile(50)).toBe(0);
      expect(buffer.p50()).toBe(0);
      expect(buffer.p95()).toBe(0);
      expect(buffer.p99()).toBe(0);
    });

    it('should calculate correct percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        buffer.push(i);
      }

      expect(buffer.p50()).toBe(50);
      expect(buffer.p95()).toBe(95);
      expect(buffer.p99()).toBe(99);
    });

    it('should handle p0 and p100', () => {
      buffer.push(10);
      buffer.push(20);
      buffer.push(30);

      expect(buffer.percentile(0)).toBe(10);
      expect(buffer.percentile(100)).toBe(30);
    });

    it('should throw for invalid percentile', () => {
      expect(() => buffer.percentile(-1)).toThrow('Percentile must be between 0 and 100');
      expect(() => buffer.percentile(101)).toThrow('Percentile must be between 0 and 100');
    });
  });

  describe('statistics', () => {
    it('should calculate min/max correctly', () => {
      buffer.push(50);
      buffer.push(10);
      buffer.push(30);
      buffer.push(90);

      expect(buffer.min()).toBe(10);
      expect(buffer.max()).toBe(90);
    });

    it('should calculate average correctly', () => {
      buffer.push(10);
      buffer.push(20);
      buffer.push(30);

      expect(buffer.avg()).toBe(20);
    });

    it('should return complete stats', () => {
      buffer.push(10);
      buffer.push(20);
      buffer.push(30);
      buffer.push(40);
      buffer.push(50);

      const stats = buffer.getStats();

      expect(stats.count).toBe(5);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.avg).toBe(30);
    });
  });

  describe('caching', () => {
    it('should cache sorted array for performance', () => {
      for (let i = 0; i < 50; i++) {
        buffer.push(Math.random() * 100);
      }

      const p50First = buffer.p50();
      const p50Second = buffer.p50();

      expect(p50First).toBe(p50Second);
    });

    it('should invalidate cache on push', () => {
      buffer.push(10);
      buffer.push(20);
      const p50Before = buffer.p50();

      buffer.push(1000);
      const p50After = buffer.p50();

      expect(p50After).not.toBe(p50Before);
    });

    it('should invalidate cache on clear', () => {
      buffer.push(10);
      buffer.push(20);
      buffer.p50();

      buffer.clear();

      expect(buffer.p50()).toBe(0);
      expect(buffer.count).toBe(0);
    });
  });

  describe('realistic latency scenarios', () => {
    it('should track heartbeat latencies accurately', () => {
      const latencies = [12, 15, 18, 11, 14, 16, 13, 200, 17, 12];

      for (const lat of latencies) {
        buffer.push(lat);
      }

      const stats = buffer.getStats();

      expect(stats.count).toBe(10);
      expect(stats.min).toBe(11);
      expect(stats.max).toBe(200);
      expect(stats.p99).toBe(200);
      expect(stats.p50).toBeLessThan(20);
    });

    it('should handle rolling window correctly', () => {
      const smallBuffer = new LatencyBuffer(5);

      smallBuffer.push(100);
      smallBuffer.push(100);
      smallBuffer.push(100);
      smallBuffer.push(100);
      smallBuffer.push(100);

      expect(smallBuffer.avg()).toBe(100);

      smallBuffer.push(10);
      smallBuffer.push(10);
      smallBuffer.push(10);
      smallBuffer.push(10);
      smallBuffer.push(10);

      expect(smallBuffer.avg()).toBe(10);
      expect(smallBuffer.max()).toBe(10);
    });
  });
});
