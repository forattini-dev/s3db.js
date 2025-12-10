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
  byType: Record<string, { count: number; size: number; duration: number }>;
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
  screenshots: { final: string } | null;
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
  waitForLoadState?(state: string, options: { timeout: number }): Promise<void>;
  evaluateOnNewDocument(fn: () => void): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  screenshot(options?: { encoding?: string }): Promise<string>;
}

export class PerformanceManager {
  plugin: PuppeteerPlugin;
  config: Record<string, unknown>;
  thresholds: Record<string, PerformanceThreshold>;
  weights: Record<string, number>;

  constructor(plugin: PuppeteerPlugin) {
    this.plugin = plugin;
    this.config = ((plugin.config as unknown as { performance?: Record<string, unknown> }).performance) || {};

    this.thresholds = {
      lcp: { good: 2500, needsImprovement: 4000 },
      fid: { good: 100, needsImprovement: 300 },
      cls: { good: 0.1, needsImprovement: 0.25 },
      ttfb: { good: 800, needsImprovement: 1800 },
      fcp: { good: 1800, needsImprovement: 3000 },
      inp: { good: 200, needsImprovement: 500 },
      si: { good: 3400, needsImprovement: 5800 },
      tbt: { good: 200, needsImprovement: 600 },
      tti: { good: 3800, needsImprovement: 7300 }
    };

    this.weights = {
      lcp: 0.25,
      fid: 0.10,
      cls: 0.15,
      ttfb: 0.10,
      fcp: 0.10,
      inp: 0.10,
      tbt: 0.10,
      tti: 0.10
    };
  }

  async collectMetrics(page: Page, options: CollectMetricsOptions = {}): Promise<PerformanceReport> {
    const {
      waitForLoad = true,
      collectResources = true,
      collectMemory = true,
      collectScreenshots = false,
      customMetrics = null
    } = options;

    const startTime = Date.now();

    try {
      if (waitForLoad && page.waitForLoadState) {
        await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
      }

      await this._injectWebVitalsScript(page);
      await this._delay(1000);

      const [
        coreWebVitals,
        navigationTiming,
        resourceTiming,
        paintTiming,
        memoryInfo
      ] = await Promise.all([
        this._collectCoreWebVitals(page),
        this._collectNavigationTiming(page),
        collectResources ? this._collectResourceTiming(page) : null,
        this._collectPaintTiming(page),
        collectMemory ? this._collectMemoryInfo(page) : null
      ]);

      let customMetricsData = null;
      if (customMetrics && typeof customMetrics === 'function') {
        customMetricsData = await customMetrics(page);
      }

      const derivedMetrics = this._calculateDerivedMetrics(navigationTiming, resourceTiming);

      const scores = this._calculateScores({
        ...coreWebVitals,
        ...derivedMetrics
      });

      let screenshots = null;
      if (collectScreenshots) {
        screenshots = await this._collectScreenshots(page);
      }

      const collectionTime = Date.now() - startTime;

      const report: PerformanceReport = {
        url: page.url(),
        timestamp: Date.now(),
        collectionTime,
        score: scores.overall,
        scores: scores.individual,
        coreWebVitals,
        navigationTiming,
        paintTiming,
        resources: resourceTiming ? {
          summary: this._summarizeResources(resourceTiming),
          details: resourceTiming
        } : null,
        memory: memoryInfo,
        derived: derivedMetrics,
        custom: customMetricsData,
        screenshots,
        recommendations: this._generateRecommendations({
          ...coreWebVitals,
          ...derivedMetrics
        }, resourceTiming)
      };

      this.plugin.emit('performance.metricsCollected', {
        url: page.url(),
        score: report.score,
        collectionTime
      });

      return report;

    } catch (err) {
      this.plugin.emit('performance.collectionFailed', {
        url: page.url(),
        error: (err as Error).message
      });
      throw err;
    }
  }

  private async _injectWebVitalsScript(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      const win = window as unknown as { __WEB_VITALS__: CoreWebVitals };
      win.__WEB_VITALS__ = {
        lcp: null,
        fid: null,
        cls: null,
        inp: null,
        fcp: null,
        ttfb: null
      };

      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
        win.__WEB_VITALS__.lcp = lastEntry.renderTime || lastEntry.loadTime || null;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const e = entry as PerformanceEntry & { processingStart: number; startTime: number };
          if (!win.__WEB_VITALS__.fid) {
            win.__WEB_VITALS__.fid = e.processingStart - e.startTime;
          }
        });
      });
      fidObserver.observe({ type: 'first-input', buffered: true });

      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
          if (!e.hadRecentInput) {
            clsValue += e.value;
          }
        }
        win.__WEB_VITALS__.cls = clsValue;
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const e = entry as PerformanceEntry & { processingEnd: number; startTime: number };
          const duration = e.processingEnd - e.startTime;
          if (!win.__WEB_VITALS__.inp || duration > win.__WEB_VITALS__.inp) {
            win.__WEB_VITALS__.inp = duration;
          }
        });
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);

      window.addEventListener('load', () => {
        const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navTiming) {
          win.__WEB_VITALS__.ttfb = navTiming.responseStart - navTiming.requestStart;
        }

        const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
        if (fcpEntry) {
          win.__WEB_VITALS__.fcp = fcpEntry.startTime;
        }
      });
    });
  }

  private async _collectCoreWebVitals(page: Page): Promise<CoreWebVitals> {
    const vitals = await page.evaluate(() => {
      const win = window as unknown as { __WEB_VITALS__?: CoreWebVitals };
      return win.__WEB_VITALS__ || {} as Partial<CoreWebVitals>;
    }) as Partial<CoreWebVitals>;

    return {
      lcp: vitals.lcp || null,
      fid: vitals.fid || null,
      cls: vitals.cls || null,
      inp: vitals.inp || null,
      fcp: vitals.fcp || null,
      ttfb: vitals.ttfb || null
    };
  }

  private async _collectNavigationTiming(page: Page): Promise<NavigationTiming | null> {
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (!nav) return null;

      return {
        dnsStart: nav.domainLookupStart,
        dnsEnd: nav.domainLookupEnd,
        dnsDuration: nav.domainLookupEnd - nav.domainLookupStart,
        tcpStart: nav.connectStart,
        tcpEnd: nav.connectEnd,
        tcpDuration: nav.connectEnd - nav.connectStart,
        tlsStart: nav.secureConnectionStart,
        tlsDuration: nav.secureConnectionStart > 0
          ? nav.connectEnd - nav.secureConnectionStart
          : 0,
        requestStart: nav.requestStart,
        responseStart: nav.responseStart,
        responseEnd: nav.responseEnd,
        requestDuration: nav.responseStart - nav.requestStart,
        responseDuration: nav.responseEnd - nav.responseStart,
        domInteractive: nav.domInteractive,
        domContentLoaded: nav.domContentLoadedEventEnd,
        domComplete: nav.domComplete,
        loadEventStart: nav.loadEventStart,
        loadEventEnd: nav.loadEventEnd,
        loadEventDuration: nav.loadEventEnd - nav.loadEventStart,
        redirectTime: nav.redirectEnd - nav.redirectStart,
        fetchTime: nav.responseEnd - nav.fetchStart,
        totalTime: nav.loadEventEnd - nav.fetchStart,
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize
      };
    });
  }

  private async _collectResourceTiming(page: Page): Promise<ResourceTiming[]> {
    return await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

      return resources.map(resource => ({
        name: resource.name,
        type: resource.initiatorType,
        startTime: resource.startTime,
        duration: resource.duration,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
        decodedBodySize: resource.decodedBodySize,
        dns: resource.domainLookupEnd - resource.domainLookupStart,
        tcp: resource.connectEnd - resource.connectStart,
        tls: resource.secureConnectionStart > 0
          ? resource.connectEnd - resource.secureConnectionStart
          : 0,
        request: resource.responseStart - resource.requestStart,
        response: resource.responseEnd - resource.responseStart,
        cached: resource.transferSize === 0 && resource.decodedBodySize > 0
      }));
    });
  }

  private async _collectPaintTiming(page: Page): Promise<PaintTiming | null> {
    return await page.evaluate(() => {
      const paintEntries = performance.getEntriesByType('paint');
      const result: PaintTiming = {};

      paintEntries.forEach(entry => {
        (result as Record<string, number>)[entry.name] = entry.startTime;
      });

      return Object.keys(result).length > 0 ? result : null;
    });
  }

  private async _collectMemoryInfo(page: Page): Promise<MemoryInfo | null> {
    try {
      const memoryInfo = await page.evaluate(() => {
        const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
        if (perf.memory) {
          return {
            usedJSHeapSize: perf.memory.usedJSHeapSize,
            totalJSHeapSize: perf.memory.totalJSHeapSize,
            jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
            usedPercent: (perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100
          };
        }
        return null;
      });

      return memoryInfo;
    } catch {
      return null;
    }
  }

  private _calculateDerivedMetrics(navigationTiming: NavigationTiming | null, resourceTiming: ResourceTiming[] | null): DerivedMetrics {
    if (!navigationTiming) return {};

    const derived: DerivedMetrics = {
      tti: navigationTiming.domInteractive,
      tbt: Math.max(0, navigationTiming.domContentLoaded - navigationTiming.domInteractive - 50),
      si: navigationTiming.domContentLoaded
    };

    if (resourceTiming && resourceTiming.length > 0) {
      const totalSize = resourceTiming.reduce((sum, r) => sum + (r.transferSize || 0), 0);
      const totalRequests = resourceTiming.length;
      const cachedRequests = resourceTiming.filter(r => r.cached).length;
      const avgDuration = resourceTiming.reduce((sum, r) => sum + r.duration, 0) / totalRequests;

      derived.resources = {
        totalRequests,
        totalSize,
        cachedRequests,
        cacheRate: cachedRequests / totalRequests,
        avgDuration
      };

      const byType: Record<string, { count: number; size: number; duration: number }> = {};
      resourceTiming.forEach(r => {
        if (!byType[r.type]) {
          byType[r.type] = { count: 0, size: 0, duration: 0 };
        }
        byType[r.type]!.count++;
        byType[r.type]!.size += r.transferSize || 0;
        byType[r.type]!.duration += r.duration;
      });

      derived.resourcesByType = Object.entries(byType).map(([type, data]) => ({
        type,
        count: data.count,
        totalSize: data.size,
        avgDuration: data.duration / data.count
      }));
    }

    return derived;
  }

  private _calculateScores(metrics: Record<string, unknown>): PerformanceScores {
    const individual: Record<string, number | null> = {};
    let weightedSum = 0;
    let totalWeight = 0;

    Object.keys(this.thresholds).forEach(metric => {
      const value = metrics[metric] as number | null | undefined;
      const threshold = this.thresholds[metric];
      const weight = this.weights[metric] || 0;

      if (value === null || value === undefined || !threshold) {
        individual[metric] = null;
        return;
      }

      let score: number;
      if (metric === 'cls') {
        if (value <= threshold.good) {
          score = 100;
        } else if (value <= threshold.needsImprovement) {
          score = 50 + (50 * (threshold.needsImprovement - value) / (threshold.needsImprovement - threshold.good));
        } else {
          score = Math.max(0, 50 * (1 - (value - threshold.needsImprovement) / threshold.needsImprovement));
        }
      } else {
        if (value <= threshold.good) {
          score = 100;
        } else if (value <= threshold.needsImprovement) {
          score = 50 + (50 * (threshold.needsImprovement - value) / (threshold.needsImprovement - threshold.good));
        } else {
          score = Math.max(0, 50 * (1 - (value - threshold.needsImprovement) / threshold.needsImprovement));
        }
      }

      individual[metric] = Math.round(score);

      if (weight > 0) {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    });

    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

    return {
      overall,
      individual
    };
  }

  private _summarizeResources(resources: ResourceTiming[]): ResourceSummary {
    const summary: ResourceSummary = {
      total: resources.length,
      byType: {},
      totalSize: 0,
      totalDuration: 0,
      cached: 0,
      slowest: []
    };

    resources.forEach(resource => {
      const type = resource.type || 'other';
      if (!summary.byType[type]) {
        summary.byType[type] = { count: 0, size: 0, duration: 0 };
      }
      summary.byType[type].count++;
      summary.byType[type].size += resource.transferSize || 0;
      summary.byType[type].duration += resource.duration;

      summary.totalSize += resource.transferSize || 0;
      summary.totalDuration += resource.duration;
      if (resource.cached) summary.cached++;
    });

    summary.slowest = resources
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map(r => ({
        name: r.name,
        type: r.type,
        duration: Math.round(r.duration),
        size: r.transferSize
      }));

    return summary;
  }

  private _generateRecommendations(metrics: Record<string, unknown>, resources: ResourceTiming[] | null): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const lcp = metrics.lcp as number | null;
    const fid = metrics.fid as number | null;
    const cls = metrics.cls as number | null;
    const ttfb = metrics.ttfb as number | null;

    if (lcp && this.thresholds.lcp && lcp > this.thresholds.lcp.needsImprovement) {
      recommendations.push({
        metric: 'lcp',
        severity: 'high',
        message: `LCP is ${Math.round(lcp)}ms (target: <${this.thresholds.lcp.good}ms)`,
        suggestions: [
          'Optimize largest image/element loading',
          'Use lazy loading for below-the-fold content',
          'Reduce server response times',
          'Use CDN for static assets'
        ]
      });
    }

    if (fid && this.thresholds.fid && fid > this.thresholds.fid.needsImprovement) {
      recommendations.push({
        metric: 'fid',
        severity: 'high',
        message: `FID is ${Math.round(fid)}ms (target: <${this.thresholds.fid.good}ms)`,
        suggestions: [
          'Break up long JavaScript tasks',
          'Use web workers for heavy computations',
          'Defer non-critical JavaScript',
          'Reduce JavaScript execution time'
        ]
      });
    }

    if (cls && this.thresholds.cls && cls > this.thresholds.cls.needsImprovement) {
      recommendations.push({
        metric: 'cls',
        severity: 'high',
        message: `CLS is ${cls.toFixed(3)} (target: <${this.thresholds.cls.good})`,
        suggestions: [
          'Set explicit width/height on images and videos',
          'Reserve space for ads and embeds',
          'Avoid inserting content above existing content',
          'Use transform animations instead of layout-triggering properties'
        ]
      });
    }

    if (ttfb && this.thresholds.ttfb && ttfb > this.thresholds.ttfb.needsImprovement) {
      recommendations.push({
        metric: 'ttfb',
        severity: 'medium',
        message: `TTFB is ${Math.round(ttfb)}ms (target: <${this.thresholds.ttfb.good}ms)`,
        suggestions: [
          'Optimize server processing time',
          'Use server-side caching',
          'Use a CDN',
          'Reduce server redirects'
        ]
      });
    }

    if (resources && resources.length > 0) {
      const totalSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

      if (totalSize > 5 * 1024 * 1024) {
        recommendations.push({
          metric: 'resources',
          severity: 'medium',
          message: `Total page size is ${(totalSize / 1024 / 1024).toFixed(2)}MB`,
          suggestions: [
            'Compress images and use modern formats (WebP, AVIF)',
            'Minify CSS and JavaScript',
            'Remove unused code',
            'Use code splitting'
          ]
        });
      }

      const cacheRate = (resources.length - resources.filter(r => !r.cached).length) / resources.length;
      if (cacheRate < 0.5) {
        recommendations.push({
          metric: 'caching',
          severity: 'low',
          message: `Only ${(cacheRate * 100).toFixed(0)}% of resources are cached`,
          suggestions: [
            'Set appropriate cache headers',
            'Use service workers for offline caching',
            'Implement browser caching strategy'
          ]
        });
      }
    }

    return recommendations;
  }

  private async _collectScreenshots(page: Page): Promise<{ final: string } | null> {
    try {
      const screenshots = {
        final: await page.screenshot({ encoding: 'base64' })
      };

      return screenshots;
    } catch {
      return null;
    }
  }

  compareReports(baseline: PerformanceReport, current: PerformanceReport): ComparisonResult {
    const comparison: ComparisonResult = {
      timestamp: Date.now(),
      baseline: {
        url: baseline.url,
        timestamp: baseline.timestamp,
        score: baseline.score
      },
      current: {
        url: current.url,
        timestamp: current.timestamp,
        score: current.score
      },
      scoreDelta: (current.score !== null && baseline.score !== null) ? current.score - baseline.score : null,
      improvements: [],
      regressions: []
    };

    (Object.keys(baseline.coreWebVitals) as Array<keyof CoreWebVitals>).forEach(metric => {
      const baselineValue = baseline.coreWebVitals[metric];
      const currentValue = current.coreWebVitals[metric];

      if (baselineValue && currentValue) {
        const delta = currentValue - baselineValue;
        const percentChange = (delta / baselineValue) * 100;

        const change = {
          metric,
          baseline: baselineValue,
          current: currentValue,
          delta,
          percentChange: percentChange.toFixed(2)
        };

        if (delta < 0) {
          comparison.improvements.push(change);
        } else if (delta > 0) {
          comparison.regressions.push(change);
        }
      }
    });

    return comparison;
  }

  private async _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default PerformanceManager;
