export class Benchmark {
    name;
    startTime;
    endTime;
    results;
    constructor(name) {
        this.name = name;
        this.startTime = null;
        this.endTime = null;
        this.results = [];
    }
    start() {
        this.startTime = Date.now();
    }
    end() {
        this.endTime = Date.now();
        return this.elapsed();
    }
    elapsed() {
        if (this.startTime === null || this.endTime === null) {
            return 0;
        }
        return this.endTime - this.startTime;
    }
    async measure(fn) {
        this.start();
        const result = await fn();
        this.end();
        this.results.push({
            duration: this.elapsed(),
            timestamp: Date.now()
        });
        return result;
    }
    async measureRepeated(fn, iterations = 10) {
        const results = [];
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
    percentile(arr, p) {
        if (arr.length === 0)
            return 0;
        const sorted = arr.slice().sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
    report() {
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
export async function benchmark(name, fn) {
    const b = new Benchmark(name);
    await b.measure(fn);
    b.report();
    return b;
}
//# sourceMappingURL=benchmark.js.map