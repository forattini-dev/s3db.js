import type { PuppeteerPlugin } from '../puppeteer.plugin.js';
export interface PerformanceThreshold {
    good: number;
    needsImprovement: number;
}
export interface CoreWebVitals {
    lcp: number | null;
    fid: number | null;
    cls: number | null;
    inp: number | null;
    fcp: number | null;
    ttfb: number | null;
}
export interface NavigationTiming {
    dnsStart: number;
    dnsEnd: number;
    dnsDuration: number;
    tcpStart: number;
    tcpEnd: number;
    tcpDuration: number;
    tlsStart: number;
    tlsDuration: number;
    requestStart: number;
    responseStart: number;
    responseEnd: number;
    requestDuration: number;
    responseDuration: number;
    domInteractive: number;
    domContentLoaded: number;
    domComplete: number;
    loadEventStart: number;
    loadEventEnd: number;
    loadEventDuration: number;
    redirectTime: number;
    fetchTime: number;
    totalTime: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
}
export interface ResourceTiming {
    name: string;
    type: string;
    startTime: number;
    duration: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
    dns: number;
    tcp: number;
    tls: number;
    request: number;
    response: number;
    cached: boolean;
}
export interface PaintTiming {
    'first-paint'?: number;
    'first-contentful-paint'?: number;
}
export interface MemoryInfo {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    usedPercent: number;
}
export interface DerivedMetrics {
    tti?: number;
    tbt?: number;
    si?: number;
    resources?: {
        totalRequests: number;
        totalSize: number;
        cachedRequests: number;
        cacheRate: number;
        avgDuration: number;
    };
    resourcesByType?: Array<{
        type: string;
        count: number;
        totalSize: number;
        avgDuration: number;
    }>;
}
export interface PerformanceScores {
    overall: number | null;
    individual: Record<string, number | null>;
}
export interface ResourceSummary {
    total: number;
    byType: Record<string, {
        count: number;
        size: number;
        duration: number;
    }>;
    totalSize: number;
    totalDuration: number;
    cached: number;
    slowest: Array<{
        name: string;
        type: string;
        duration: number;
        size: number;
    }>;
}
export interface Recommendation {
    metric: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestions: string[];
}
export interface PerformanceReport {
    url: string;
    timestamp: number;
    collectionTime: number;
    score: number | null;
    scores: Record<string, number | null>;
    coreWebVitals: CoreWebVitals;
    navigationTiming: NavigationTiming | null;
    paintTiming: PaintTiming | null;
    resources: {
        summary: ResourceSummary;
        details: ResourceTiming[];
    } | null;
    memory: MemoryInfo | null;
    derived: DerivedMetrics;
    custom: unknown;
    screenshots: {
        final: string;
    } | null;
    recommendations: Recommendation[];
}
export interface CollectMetricsOptions {
    waitForLoad?: boolean;
    collectResources?: boolean;
    collectMemory?: boolean;
    collectScreenshots?: boolean;
    customMetrics?: ((page: Page) => Promise<unknown>) | null;
}
export interface ComparisonResult {
    timestamp: number;
    baseline: {
        url: string;
        timestamp: number;
        score: number | null;
    };
    current: {
        url: string;
        timestamp: number;
        score: number | null;
    };
    scoreDelta: number | null;
    improvements: Array<{
        metric: string;
        baseline: number;
        current: number;
        delta: number;
        percentChange: string;
    }>;
    regressions: Array<{
        metric: string;
        baseline: number;
        current: number;
        delta: number;
        percentChange: string;
    }>;
}
interface Page {
    url(): string;
    waitForLoadState?(state: string, options: {
        timeout: number;
    }): Promise<void>;
    evaluateOnNewDocument(fn: () => void): Promise<void>;
    evaluate<T>(fn: () => T): Promise<T>;
    screenshot(options?: {
        encoding?: string;
    }): Promise<string>;
}
export declare class PerformanceManager {
    plugin: PuppeteerPlugin;
    config: Record<string, unknown>;
    thresholds: Record<string, PerformanceThreshold>;
    weights: Record<string, number>;
    constructor(plugin: PuppeteerPlugin);
    collectMetrics(page: Page, options?: CollectMetricsOptions): Promise<PerformanceReport>;
    private _injectWebVitalsScript;
    private _collectCoreWebVitals;
    private _collectNavigationTiming;
    private _collectResourceTiming;
    private _collectPaintTiming;
    private _collectMemoryInfo;
    private _calculateDerivedMetrics;
    private _calculateScores;
    private _summarizeResources;
    private _generateRecommendations;
    private _collectScreenshots;
    compareReports(baseline: PerformanceReport, current: PerformanceReport): ComparisonResult;
    private _delay;
}
export default PerformanceManager;
//# sourceMappingURL=performance-manager.d.ts.map