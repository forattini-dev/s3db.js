import os from 'os';

export interface AdaptiveTuningOptions {
  minConcurrency?: number;
  maxConcurrency?: number;
  targetLatency?: number;
  targetMemoryPercent?: number;
  adjustmentInterval?: number;
}

export interface TaskMetrics {
  latency: number;
  queueWait: number;
  success: boolean;
  retries: number;
  heapDelta: number;
}

export interface ConcurrencyAdjustment {
  timestamp: number;
  old: number;
  new: number;
  reason: string;
  metrics: {
    avgLatency: number;
    avgMemory: number;
    avgThroughput: number;
  };
}

export interface AdaptiveMetrics {
  latencies: number[];
  throughputs: number[];
  memoryUsages: number[];
  errorRates: number[];
  concurrencyHistory: ConcurrencyAdjustment[];
}

export interface MetricsSummary {
  current: number;
  avgLatency: number;
  avgMemory: number;
  avgThroughput: number;
  history: ConcurrencyAdjustment[];
}

export class AdaptiveTuning {
  minConcurrency: number;
  maxConcurrency: number;
  targetLatency: number;
  targetMemoryPercent: number;
  adjustmentInterval: number;
  metrics: AdaptiveMetrics;
  currentConcurrency: number;
  lastAdjustment: number;
  intervalId: ReturnType<typeof setInterval> | null;

  constructor(options: AdaptiveTuningOptions = {}) {
    this.minConcurrency = options.minConcurrency || 1;
    this.maxConcurrency = options.maxConcurrency || 100;
    this.targetLatency = options.targetLatency || 200;
    this.targetMemoryPercent = options.targetMemoryPercent || 0.7;
    this.adjustmentInterval = options.adjustmentInterval || 5000;

    this.metrics = {
      latencies: [],
      throughputs: [],
      memoryUsages: [],
      errorRates: [],
      concurrencyHistory: []
    };

    this.currentConcurrency = this.suggestInitial();
    this.lastAdjustment = Date.now();

    this.intervalId = null;
    this.startMonitoring();
  }

  suggestInitial(): number {
    const totalMemoryMB = os.totalmem() / 1024 / 1024;
    const freeMemoryMB = os.freemem() / 1024 / 1024;
    const usedPercent = (totalMemoryMB - freeMemoryMB) / totalMemoryMB;

    let suggested: number;

    if (totalMemoryMB < 512) {
      suggested = 2;
    } else if (totalMemoryMB < 1024) {
      suggested = 5;
    } else if (totalMemoryMB < 2048) {
      suggested = 10;
    } else if (totalMemoryMB < 4096) {
      suggested = 20;
    } else if (totalMemoryMB < 8192) {
      suggested = 30;
    } else {
      suggested = 20;
    }

    if (usedPercent > 0.8) {
      suggested = Math.max(1, Math.floor(suggested * 0.5));
    } else if (usedPercent > 0.7) {
      suggested = Math.max(1, Math.floor(suggested * 0.7));
    }

    suggested = Math.min(Math.max(this.minConcurrency, Math.floor(suggested * 0.5)), 20);

    return suggested;
  }

  recordTaskMetrics(task: TaskMetrics): void {
    const memoryUsed = process.memoryUsage().heapUsed / os.totalmem();

    this.metrics.latencies.push(task.latency);
    this.metrics.memoryUsages.push(memoryUsed);

    if (this.metrics.latencies.length > 100) {
      this.metrics.latencies.shift();
      this.metrics.memoryUsages.shift();
    }

    const recentTasks = this.metrics.latencies.filter((_, i) => {
      return i >= this.metrics.latencies.length - 10;
    }).length;

    const windowMs = 1000;
    const throughput = (recentTasks / windowMs) * 1000;
    this.metrics.throughputs.push(throughput);
    if (this.metrics.throughputs.length > 100) {
      this.metrics.throughputs.shift();
    }
  }

  startMonitoring(): void {
    this.intervalId = setInterval(() => {
      this.adjust();
    }, this.adjustmentInterval);

    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  adjust(): number | null {
    if (this.metrics.latencies.length < 10) {
      return null;
    }

    const avgLatency = this._avg(this.metrics.latencies);
    const avgMemory = this._avg(this.metrics.memoryUsages);
    const avgThroughput = this._avg(this.metrics.throughputs);

    let adjustment = 0;
    let reason = '';

    if (avgMemory > this.targetMemoryPercent) {
      adjustment = -Math.ceil(this.currentConcurrency * 0.2);
      reason = `memory pressure (${(avgMemory * 100).toFixed(1)}%)`;
    } else if (avgLatency > this.targetLatency * 1.5) {
      adjustment = -Math.ceil(this.currentConcurrency * 0.1);
      reason = `high latency (${avgLatency.toFixed(0)}ms)`;
    } else if (avgLatency < this.targetLatency * 0.5 && avgMemory < this.targetMemoryPercent * 0.8) {
      adjustment = Math.ceil(this.currentConcurrency * 0.2);
      reason = 'good performance, scaling up';
    } else if (avgLatency > this.targetLatency * 1.2) {
      adjustment = -Math.ceil(this.currentConcurrency * 0.05);
      reason = 'slight latency increase';
    }

    if (adjustment !== 0) {
      const newConcurrency = Math.max(
        this.minConcurrency,
        Math.min(this.maxConcurrency, this.currentConcurrency + adjustment)
      );

      if (newConcurrency !== this.currentConcurrency) {
        const oldConcurrency = this.currentConcurrency;
        this.currentConcurrency = newConcurrency;
        this.lastAdjustment = Date.now();

        this.metrics.concurrencyHistory.push({
          timestamp: Date.now(),
          old: oldConcurrency,
          new: newConcurrency,
          reason,
          metrics: {
            avgLatency,
            avgMemory,
            avgThroughput
          }
        });

        if (this.metrics.concurrencyHistory.length > 100) {
          this.metrics.concurrencyHistory.shift();
        }

        return newConcurrency;
      }
    }

    return null;
  }

  getConcurrency(): number {
    return this.currentConcurrency;
  }

  getMetrics(): MetricsSummary {
    if (this.metrics.latencies.length === 0) {
      return {
        current: this.currentConcurrency,
        avgLatency: 0,
        avgMemory: 0,
        avgThroughput: 0,
        history: []
      };
    }

    return {
      current: this.currentConcurrency,
      avgLatency: this._avg(this.metrics.latencies),
      avgMemory: this._avg(this.metrics.memoryUsages),
      avgThroughput: this._avg(this.metrics.throughputs),
      history: this.metrics.concurrencyHistory.slice(-10)
    };
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private _avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}
