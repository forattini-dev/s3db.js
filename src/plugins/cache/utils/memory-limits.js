import fs from 'node:fs';
import os from 'node:os';
import v8 from 'node:v8';

/**
 * Read cgroup memory limit (v2 first, fallback to v1)
 */
function readCgroupLimit() {
  const candidates = [
    '/sys/fs/cgroup/memory.max',                          // cgroup v2
    '/sys/fs/cgroup/memory/memory.limit_in_bytes',        // cgroup v1
  ];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8').trim();
        if (!raw || raw === 'max') continue;
        const value = Number.parseInt(raw, 10);
        if (Number.isFinite(value) && value > 0) {
          return value;
        }
      }
    } catch {
      // ignore and continue
    }
  }

  return null;
}

/**
 * Get effective memory limit that takes container cgroups into account.
 * Falls back to os.totalmem() when no limit is imposed.
 */
export function getEffectiveTotalMemoryBytes() {
  const cgroupLimit = readCgroupLimit();
  if (cgroupLimit && Number.isFinite(cgroupLimit) && cgroupLimit > 0) {
    return cgroupLimit;
  }
  return os.totalmem();
}

/**
 * Compute safe cache memory boundaries based on environment.
 *
 * @param {Object} options
 * @param {number|undefined} options.maxMemoryBytes - explicit limit
 * @param {number|undefined} options.maxMemoryPercent - fraction (0..1)
 * @param {number} [options.safetyPercent=0.75] - fraction of effective memory to cap cache (default 75%)
 * @returns {{ maxMemoryBytes: number, derivedFromPercent: boolean, effectiveTotal: number, heapLimit: number }}
 */
export function resolveCacheMemoryLimit({
  maxMemoryBytes,
  maxMemoryPercent,
  safetyPercent = 0.75,
} = {}) {
  const heapStats = v8.getHeapStatistics();
  const heapLimit = heapStats?.heap_size_limit ?? 0;
  const effectiveTotal = getEffectiveTotalMemoryBytes();

  let resolvedBytes = 0;
  let derivedFromPercent = false;

  if (typeof maxMemoryBytes === 'number' && maxMemoryBytes > 0) {
    resolvedBytes = maxMemoryBytes;
  } else if (typeof maxMemoryPercent === 'number' && maxMemoryPercent > 0) {
    const percent = Math.max(0, Math.min(maxMemoryPercent, 1));
    resolvedBytes = Math.floor(effectiveTotal * percent);
    derivedFromPercent = true;
  }

  // Always cap by heap limit * safetyPercent if both are available
  if (heapLimit > 0) {
    const heapCap = Math.floor(heapLimit * safetyPercent);
    if (resolvedBytes === 0 || heapCap < resolvedBytes) {
      resolvedBytes = heapCap;
      derivedFromPercent = derivedFromPercent || maxMemoryPercent > 0;
    }
  }

  // Final fallback: take safetyPercent of effective total memory
  if (resolvedBytes === 0) {
    resolvedBytes = Math.floor(effectiveTotal * safetyPercent);
    derivedFromPercent = true;
  }

  // Guard against zero/negative values
  if (!Number.isFinite(resolvedBytes) || resolvedBytes <= 0) {
    resolvedBytes = Math.floor(effectiveTotal * 0.5);
    derivedFromPercent = true;
  }

  const inferredPercent = effectiveTotal > 0
    ? resolvedBytes / effectiveTotal
    : null;

  return {
    maxMemoryBytes: resolvedBytes,
    derivedFromPercent,
    effectiveTotal,
    heapLimit,
    inferredPercent,
  };
}
