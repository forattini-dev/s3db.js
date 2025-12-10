export interface BenchmarkResult {
  duration: number;
  timestamp: number;
}

export interface BenchmarkStats {
  iterations: number;
  results: number[];
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export class Benchmark {
  name: string;
  startTime: number | null;
  endTime: number | null;
  results: BenchmarkResult[];

  constructor(name: string) {
    this.name = name;
    this.startTime = null;
    this.endTime = null;
    this.results = [];
  }

  start(): void {
    this.startTime = Date.now();
  }

  end(): number {
    this.endTime = Date.now();
    return this.elapsed();
  }

  elapsed(): number {
    if (this.startTime === null || this.endTime === null) {
      return 0;
    }
    return this.endTime - this.startTime;
  }

  async measure<T>(fn: () => Promise<T>): Promise<T> {
    this.start();
    const result = await fn();
    this.end();

    this.results.push({
      duration: this.elapsed(),
      timestamp: Date.now()
    });

    return result;
  }

  async measureRepeated(fn: () => Promise<unknown>, iterations: number = 10): Promise<BenchmarkStats> {
    const results: number[] = [];

    for (let i = 0; i < iterations; i++) {
      this.start();
      await fn();
      this.end();

      results.push(this.elapsed());
    }

    return {
      iterations,
      results,
      avg: results.reduce((a, b) => a + b, 0) / results.length,
      min: Math.min(...results),
      max: Math.max(...results),
      p50: this.percentile(results, 0.5),
      p95: this.percentile(results, 0.95),
      p99: this.percentile(results, 0.99)
    };
  }

  percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)]!;
  }

  report(): void {
    console.log(`\n[Benchmark] ${this.name}`);
    console.log(`  Duration: ${this.elapsed()}ms`);
    console.log(`  Runs: ${this.results.length}`);

    if (this.results.length > 1) {
      const durations = this.results.map((r) => r.duration);
      console.log(`  Avg: ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)}ms`);
      console.log(`  Min: ${Math.min(...durations)}ms`);
      console.log(`  Max: ${Math.max(...durations)}ms`);
    }
  }
}

export async function benchmark(name: string, fn: () => Promise<unknown>): Promise<Benchmark> {
  const b = new Benchmark(name);
  await b.measure(fn);
  b.report();
  return b;
}
