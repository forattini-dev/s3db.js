import os from 'node:os';
import v8 from 'node:v8';

export interface MemoryInfo {
  totalSystem: number;
  freeSystem: number;
  heapTotal: number;
  heapUsed: number;
  heapLimit: number;
  rss: number;
}

export interface MemoryLimitConfig {
  maxMemoryBytes?: number;
  maxMemoryPercent?: number;
  heapUsageThreshold?: number;
}

export function getMemoryInfo(): MemoryInfo {
  const memUsage = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();

  return {
    totalSystem: os.totalmem(),
    freeSystem: os.freemem(),
    heapTotal: memUsage.heapTotal,
    heapUsed: memUsage.heapUsed,
    heapLimit: heapStats.heap_size_limit,
    rss: memUsage.rss
  };
}

export function calculateMaxMemoryFromPercent(percent: number): number {
  if (percent <= 0 || percent > 1) {
    throw new Error('maxMemoryPercent must be between 0 and 1');
  }
  return Math.floor(os.totalmem() * percent);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function isHeapUnderPressure(threshold: number = 0.6): boolean {
  const heapStats = v8.getHeapStatistics();
  const heapLimit = heapStats.heap_size_limit;
  if (!heapLimit || heapLimit <= 0) return false;

  const { heapUsed } = process.memoryUsage();
  return (heapUsed / heapLimit) >= threshold;
}

export interface MemoryLimitResult {
  maxMemoryBytes: number;
  inferredPercent?: number;
  derivedFromPercent?: boolean;
  heapLimit: number;
}

export function resolveCacheMemoryLimit(config: MemoryLimitConfig): MemoryLimitResult {
  const heapStats = v8.getHeapStatistics();
  const heapLimit = heapStats.heap_size_limit;

  if (config.maxMemoryBytes && config.maxMemoryBytes > 0) {
    return {
      maxMemoryBytes: config.maxMemoryBytes,
      heapLimit,
      derivedFromPercent: false
    };
  }

  if (config.maxMemoryPercent && config.maxMemoryPercent > 0) {
    const maxMemoryBytes = calculateMaxMemoryFromPercent(config.maxMemoryPercent);
    return {
      maxMemoryBytes,
      inferredPercent: config.maxMemoryPercent,
      derivedFromPercent: true,
      heapLimit
    };
  }

  const defaultPercent = 0.25;
  const maxMemoryBytes = Math.floor(heapLimit * defaultPercent);

  return {
    maxMemoryBytes,
    inferredPercent: defaultPercent,
    derivedFromPercent: true,
    heapLimit
  };
}
