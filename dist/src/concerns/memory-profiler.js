import v8 from 'v8';
import fs from 'fs/promises';
import path from 'path';
export function getMemoryUsage() {
    const usage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers,
        totalHeapSize: heapStats.total_heap_size,
        totalHeapSizeExecutable: heapStats.total_heap_size_executable,
        totalPhysicalSize: heapStats.total_physical_size,
        totalAvailableSize: heapStats.total_available_size,
        usedHeapSize: heapStats.used_heap_size,
        heapSizeLimit: heapStats.heap_size_limit,
        mallocedMemory: heapStats.malloced_memory,
        peakMallocedMemory: heapStats.peak_malloced_memory,
        rssMB: bytesToMB(usage.rss),
        heapTotalMB: bytesToMB(usage.heapTotal),
        heapUsedMB: bytesToMB(usage.heapUsed),
        externalMB: bytesToMB(usage.external),
        heapSizeLimitMB: bytesToMB(heapStats.heap_size_limit)
    };
}
export function bytesToMB(bytes) {
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
}
export async function captureHeapSnapshot(outputDir, prefix = 'heap') {
    await fs.mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const filename = `${prefix}-${timestamp}.heapsnapshot`;
    const filepath = path.join(outputDir, filename);
    const snapshot = v8.writeHeapSnapshot(filepath);
    return snapshot;
}
export function formatMemoryUsage() {
    const usage = getMemoryUsage();
    return `RSS: ${usage.rssMB}MB | Heap: ${usage.heapUsedMB}/${usage.heapTotalMB}MB | External: ${usage.externalMB}MB`;
}
export class MemorySampler {
    samples;
    maxSamples;
    sampleInterval;
    timer;
    isRunning;
    constructor(options = {}) {
        this.samples = [];
        this.maxSamples = options.maxSamples || 100;
        this.sampleInterval = options.sampleIntervalMs || 30000;
        this.timer = null;
        this.isRunning = false;
    }
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.sample();
        this.timer = setInterval(() => {
            this.sample();
        }, this.sampleInterval);
        if (this.timer.unref) {
            this.timer.unref();
        }
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
    }
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
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
        return sample;
    }
    getSamples() {
        return [...this.samples];
    }
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
    detectLeak(threshold = 0.1) {
        if (this.samples.length < 5) {
            return false;
        }
        const recent = this.samples.slice(-5);
        const first = recent[0].heapUsed;
        const last = recent[recent.length - 1].heapUsed;
        const growth = (last - first) / first;
        if (growth > threshold) {
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
    reset() {
        this.samples = [];
    }
}
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
export function forceGC() {
    if (global.gc) {
        global.gc();
        return true;
    }
    return false;
}
export async function measureMemory(fn, withGC = true) {
    const globalWithGC = global;
    if (withGC && globalWithGC.gc) {
        globalWithGC.gc();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const before = getMemoryUsage();
    const startTime = Date.now();
    let result;
    let error;
    try {
        result = await fn();
    }
    catch (err) {
        error = err;
    }
    const duration = Date.now() - startTime;
    if (withGC && globalWithGC.gc) {
        await new Promise(resolve => setTimeout(resolve, 100));
        globalWithGC.gc();
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
//# sourceMappingURL=memory-profiler.js.map