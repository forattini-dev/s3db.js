export interface TaskQueueStats {
  queueSize: number;
  activeCount: number;
  processedCount: number;
  errorCount: number;
  concurrency?: number;
  effectiveConcurrency?: number;
}

export interface PerformanceMetrics {
  avgExecution: number;
  p95Execution: number;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
}

export interface Snapshot {
  timestamp: number;
  taskQueue: TaskQueueStats | null;
  performance: PerformanceMetrics | null;
  system: SystemMetrics;
}

export interface TaskQueueReport {
  totalProcessed: number;
  totalErrors: number;
  avgQueueSize: number;
  avgConcurrency: number;
}

export interface PerformanceReport {
  avgLatency: number;
  p95Latency: number;
}

export interface SystemReport {
  avgMemoryMB: number;
  peakMemoryMB: number;
}

export interface MonitorReport {
  duration: number;
  snapshots: number;
  taskQueue: TaskQueueReport | null;
  performance: PerformanceReport | null;
  system: SystemReport;
}

interface DatabaseClient {
  getQueueStats?: () => TaskQueueStats;
  getAggregateMetrics?: () => PerformanceMetrics;
}

interface DatabaseLike {
  client?: DatabaseClient;
}

export class PerformanceMonitor {
  db: DatabaseLike;
  snapshots: Snapshot[];
  intervalId: ReturnType<typeof setInterval> | null;

  constructor(database: DatabaseLike) {
    this.db = database;
    this.snapshots = [];
    this.intervalId = null;
  }

  start(intervalMs: number = 10000): void {
    this.intervalId = setInterval(() => {
      this.takeSnapshot();
    }, intervalMs);

    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  takeSnapshot(): Snapshot {
    const client = this.db?.client;
    const snapshot: Snapshot = {
      timestamp: Date.now(),
      taskQueue: client?.getQueueStats ? client.getQueueStats() : null,
      performance: client?.getAggregateMetrics ? client.getAggregateMetrics() : null,
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
      }
    };

    this.snapshots.push(snapshot);

    if (this.snapshots.length > 100) {
      this.snapshots.shift();
    }

    if (snapshot.taskQueue) {
      console.log(`[PerformanceMonitor] ${new Date().toISOString()}`);
      console.log(
        `  Queue: ${snapshot.taskQueue.queueSize} pending, ${snapshot.taskQueue.activeCount} active`
      );
      if (snapshot.performance) {
        console.log(
          `  Performance: ${snapshot.performance.avgExecution.toFixed(0)}ms avg, ${snapshot.performance.p95Execution.toFixed(0)}ms p95`
        );
      }
      const configured = snapshot.taskQueue.concurrency;
      const effective = snapshot.taskQueue.effectiveConcurrency;
      const concurrencyLabel =
        configured && effective && configured !== effective
          ? `${configured} (effective ${effective})`
          : configured ?? effective ?? 'n/a';
      console.log(`  Concurrency: ${concurrencyLabel}`);
      console.log(`  Memory: ${(snapshot.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`);
    }

    return snapshot;
  }

  getReport(): MonitorReport | null {
    if (this.snapshots.length === 0) return null;

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    let taskQueue: TaskQueueReport | null = null;
    if (first!.taskQueue && last!.taskQueue) {
      taskQueue = {
        totalProcessed: last!.taskQueue.processedCount - first!.taskQueue.processedCount,
        totalErrors: last!.taskQueue.errorCount - first!.taskQueue.errorCount,
        avgQueueSize: this._avg(this.snapshots.map((s) => s.taskQueue?.queueSize || 0)),
        avgConcurrency: this._avg(
          this.snapshots.map(
            (s) =>
              s.taskQueue?.effectiveConcurrency ??
              s.taskQueue?.concurrency ??
              0
          )
        )
      };
    }

    let performance: PerformanceReport | null = null;
    if (this.snapshots.some((s) => s.performance)) {
      const perfSnapshots = this.snapshots.filter((s) => s.performance);
      performance = {
        avgLatency: this._avg(perfSnapshots.map((s) => s.performance!.avgExecution)),
        p95Latency: this._avg(perfSnapshots.map((s) => s.performance!.p95Execution))
      };
    }

    const system: SystemReport = {
      avgMemoryMB: this._avg(this.snapshots.map((s) => s.system.memoryUsage.heapUsed)) / 1024 / 1024,
      peakMemoryMB: Math.max(...this.snapshots.map((s) => s.system.memoryUsage.heapUsed)) / 1024 / 1024
    };

    return {
      duration: last!.timestamp - first!.timestamp,
      snapshots: this.snapshots.length,
      taskQueue,
      performance,
      system
    };
  }

  private _avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}
