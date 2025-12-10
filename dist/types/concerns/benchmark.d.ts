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
export declare class Benchmark {
    name: string;
    startTime: number | null;
    endTime: number | null;
    results: BenchmarkResult[];
    constructor(name: string);
    start(): void;
    end(): number;
    elapsed(): number;
    measure<T>(fn: () => Promise<T>): Promise<T>;
    measureRepeated(fn: () => Promise<unknown>, iterations?: number): Promise<BenchmarkStats>;
    percentile(arr: number[], p: number): number;
    report(): void;
}
export declare function benchmark(name: string, fn: () => Promise<unknown>): Promise<Benchmark>;
//# sourceMappingURL=benchmark.d.ts.map