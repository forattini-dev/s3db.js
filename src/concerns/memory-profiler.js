/**
 * Memory Profiling Utilities
 *
 * Provides utilities for profiling memory usage in s3db.js
 * - Heap snapshot capture
 * - Memory usage tracking per component
 * - Heap diff comparison
 * - Memory leak detection
 */

import v8 from 'v8';
import fs from 'fs/promises';
import path from 'path';

/**
 * Get current memory usage statistics
 * @returns {Object} Memory statistics
 */
export function getMemoryUsage() {
  const usage = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();

  return {
    // Process memory usage (in bytes)
    rss: usage.rss,                    // Resident Set Size - total memory allocated
    heapTotal: usage.heapTotal,        // Total heap allocated
    heapUsed: usage.heapUsed,          // Heap actually used
    external: usage.external,          // C++ objects bound to JS
    arrayBuffers: usage.arrayBuffers,  // ArrayBuffer and SharedArrayBuffer

    // Heap statistics from V8
    totalHeapSize: heapStats.total_heap_size,
    totalHeapSizeExecutable: heapStats.total_heap_size_executable,
    totalPhysicalSize: heapStats.total_physical_size,
    totalAvailableSize: heapStats.total_available_size,
    usedHeapSize: heapStats.used_heap_size,
    heapSizeLimit: heapStats.heap_size_limit,
    mallocedMemory: heapStats.malloced_memory,
    peakMallocedMemory: heapStats.peak_malloced_memory,

    // Human-readable formats (in MB)
    rssMB: bytesToMB(usage.rss),
    heapTotalMB: bytesToMB(usage.heapTotal),
    heapUsedMB: bytesToMB(usage.heapUsed),
    externalMB: bytesToMB(usage.external),
    heapSizeLimitMB: bytesToMB(heapStats.heap_size_limit)
  };
}

/**
 * Convert bytes to megabytes
 * @param {number} bytes
 * @returns {number} MB rounded to 2 decimals
 */
export function bytesToMB(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

/**
 * Capture a heap snapshot and save to file
 * @param {string} outputDir - Directory to save snapshot
 * @param {string} [prefix='heap'] - Filename prefix
 * @returns {Promise<string>} Path to saved snapshot file
 */
export async function captureHeapSnapshot(outputDir, prefix = 'heap') {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `${prefix}-${timestamp}.heapsnapshot`;
  const filepath = path.join(outputDir, filename);

  // Write heap snapshot
  const snapshot = v8.writeHeapSnapshot(filepath);

  return snapshot;
}

/**
 * Get memory usage formatted for logging
 * @returns {string} Formatted memory usage
 */
export function formatMemoryUsage() {
  const usage = getMemoryUsage();
  return `RSS: ${usage.rssMB}MB | Heap: ${usage.heapUsedMB}/${usage.heapTotalMB}MB | External: ${usage.externalMB}MB`;
}

/**
 * Memory sampler for tracking memory over time
 */
export class MemorySampler {
  constructor(options = {}) {
    this.samples = [];
    this.maxSamples = options.maxSamples || 100;
    this.sampleInterval = options.sampleIntervalMs || 30000;
    this.timer = null;
    this.isRunning = false;
  }

  /**
   * Start sampling memory usage
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.sample(); // Take initial sample

    this.timer = setInterval(() => {
      this.sample();
    }, this.sampleInterval);

    // Use unref() to prevent interval from keeping the process alive (important for tests)
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stop sampling
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  /**
   * Take a memory sample
   */
  sample() {
    const usage = getMemoryUsage();
    const sample = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB: usage.heapUsedMB
    };

    this.samples.push(sample);

    // Keep only last N samples
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    return sample;
  }

  /**
   * Get all samples
   * @returns {Array} All memory samples
   */
  getSamples() {
    return [...this.samples];
  }

  /**
   * Get statistics from samples
   * @returns {Object} Statistics
   */
  getStats() {
    if (this.samples.length === 0) {
      return null;
    }

    const heapValues = this.samples.map(s => s.heapUsed);
    const min = Math.min(...heapValues);
    const max = Math.max(...heapValues);
    const avg = heapValues.reduce((a, b) => a + b, 0) / heapValues.length;

    return {
      sampleCount: this.samples.length,
      minHeapUsedMB: bytesToMB(min),
      maxHeapUsedMB: bytesToMB(max),
      avgHeapUsedMB: bytesToMB(avg),
      currentHeapUsedMB: bytesToMB(heapValues[heapValues.length - 1]),
      timeRangeMs: this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp
    };
  }

  /**
   * Detect potential memory leak
   * @param {number} threshold - Growth threshold (e.g., 0.1 = 10% growth)
   * @returns {boolean|Object} False if no leak, or leak details if detected
   */
  detectLeak(threshold = 0.1) {
    if (this.samples.length < 5) {
      return false; // Need at least 5 samples
    }

    // Get last 5 samples
    const recent = this.samples.slice(-5);
    const first = recent[0].heapUsed;
    const last = recent[recent.length - 1].heapUsed;

    // Check if heap is consistently growing
    const growth = (last - first) / first;

    if (growth > threshold) {
      // Check if it's consistently growing (not just a spike)
      let consistentGrowth = true;
      for (let i = 1; i < recent.length; i++) {
        if (recent[i].heapUsed < recent[i - 1].heapUsed * 0.95) {
          consistentGrowth = false;
          break;
        }
      }

      if (consistentGrowth) {
        return {
          detected: true,
          growthRate: Math.round(growth * 100),
          startHeapMB: bytesToMB(first),
          endHeapMB: bytesToMB(last),
          samples: recent.length,
          timeRangeMs: recent[recent.length - 1].timestamp - recent[0].timestamp
        };
      }
    }

    return false;
  }

  /**
   * Reset samples
   */
  reset() {
    this.samples = [];
  }
}

/**
 * Compare two memory snapshots
 * @param {Object} before - Before snapshot
 * @param {Object} after - After snapshot
 * @returns {Object} Comparison
 */
export function compareMemorySnapshots(before, after) {
  const diff = {
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
    rss: after.rss - before.rss
  };

  return {
    diff,
    diffMB: {
      heapUsed: bytesToMB(diff.heapUsed),
      heapTotal: bytesToMB(diff.heapTotal),
      external: bytesToMB(diff.external),
      rss: bytesToMB(diff.rss)
    },
    before: {
      heapUsedMB: before.heapUsedMB,
      heapTotalMB: before.heapTotalMB,
      externalMB: before.externalMB,
      rssMB: before.rssMB
    },
    after: {
      heapUsedMB: after.heapUsedMB,
      heapTotalMB: after.heapTotalMB,
      externalMB: after.externalMB,
      rssMB: after.rssMB
    }
  };
}

/**
 * Force garbage collection (requires --expose-gc flag)
 * @returns {boolean} True if GC was triggered
 */
export function forceGC() {
  if (global.gc) {
    global.gc();
    return true;
  }
  return false;
}

/**
 * Measure memory usage of a function
 * @param {Function} fn - Function to measure
 * @param {boolean} [withGC=true] - Run GC before and after
 * @returns {Promise<Object>} Memory usage and result
 */
export async function measureMemory(fn, withGC = true) {
  // Force GC before measurement
  if (withGC && global.gc) {
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const before = getMemoryUsage();
  const startTime = Date.now();

  let result;
  let error;
  try {
    result = await fn();
  } catch (err) {
    error = err;
  }

  const duration = Date.now() - startTime;

  // Force GC after measurement (optional)
  if (withGC && global.gc) {
    await new Promise(resolve => setTimeout(resolve, 100));
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const after = getMemoryUsage();
  const comparison = compareMemorySnapshots(before, after);

  return {
    result,
    error,
    duration,
    memory: comparison,
    heapGrowthMB: comparison.diffMB.heapUsed
  };
}

export default {
  getMemoryUsage,
  bytesToMB,
  captureHeapSnapshot,
  formatMemoryUsage,
  MemorySampler,
  compareMemorySnapshots,
  forceGC,
  measureMemory
};
