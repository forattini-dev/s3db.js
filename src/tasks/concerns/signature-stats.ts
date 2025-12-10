export interface SignatureStatsOptions {
  alpha?: number;
  maxEntries?: number;
}

export interface SignatureEntry {
  signature: string;
  count: number;
  avgQueueWait: number;
  avgExecution: number;
  successRate: number;
}

export interface SignatureMetrics {
  queueWait?: number;
  execution?: number;
  success?: boolean;
}

export interface SignatureSnapshot {
  signature: string;
  count: number;
  avgQueueWait: number;
  avgExecution: number;
  successRate: number;
}

export class SignatureStats {
  public alpha: number;
  public maxEntries: number;
  public entries: Map<string, SignatureEntry>;

  constructor(options: SignatureStatsOptions = {}) {
    this.alpha = typeof options.alpha === 'number' ? options.alpha : 0.2;
    this.maxEntries = Math.max(1, options.maxEntries ?? 256);
    this.entries = new Map();
  }

  record(signature: string, metrics: SignatureMetrics = {}): void {
    if (!signature) {
      return;
    }
    const entry = this.entries.get(signature) || {
      signature,
      count: 0,
      avgQueueWait: 0,
      avgExecution: 0,
      successRate: 1
    };
    entry.count++;
    entry.avgQueueWait = this._mix(entry.avgQueueWait, metrics.queueWait ?? 0);
    entry.avgExecution = this._mix(entry.avgExecution, metrics.execution ?? 0);
    entry.successRate = this._mix(entry.successRate, metrics.success === false ? 0 : 1);
    this.entries.set(signature, entry);

    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) {
        this.entries.delete(oldestKey);
      }
    }
  }

  snapshot(limit: number = 10): SignatureSnapshot[] {
    if (this.entries.size === 0) {
      return [];
    }
    const sorted = Array.from(this.entries.values()).sort((a, b) => {
      if (a.avgExecution === b.avgExecution) {
        return b.count - a.count;
      }
      return b.avgExecution - a.avgExecution;
    });
    return sorted.slice(0, limit).map((entry) => ({
      signature: entry.signature,
      count: entry.count,
      avgQueueWait: Number(entry.avgQueueWait.toFixed(2)),
      avgExecution: Number(entry.avgExecution.toFixed(2)),
      successRate: Number(entry.successRate.toFixed(2))
    }));
  }

  reset(): void {
    this.entries.clear();
  }

  private _mix(current: number, incoming: number): number {
    if (current === 0) return incoming;
    return current * (1 - this.alpha) + incoming * this.alpha;
  }
}
