/**
 * PerformanceManager - Chromium Performance Metrics Collection
 *
 * Collects comprehensive performance data including:
 * - Core Web Vitals (LCP, FID, CLS, TTFB, FCP, INP)
 * - Navigation Timing API
 * - Resource Timing API
 * - Paint Timing API
 * - Memory Usage
 * - Network Waterfall
 * - Lighthouse-style scoring (0-100)
 *
 * Usage:
 * ```javascript
 * const metrics = await performanceManager.collectMetrics(page);
 * this.logger.info(metrics.score); // 85/100
 * this.logger.info(metrics.coreWebVitals.lcp); // 2.5s
 * ```
 */
export class PerformanceManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.config = plugin.config.performance || {};

    // Core Web Vitals thresholds (Google's standards)
    this.thresholds = {
      lcp: { good: 2500, needsImprovement: 4000 }, // Largest Contentful Paint (ms)
      fid: { good: 100, needsImprovement: 300 }, // First Input Delay (ms)
      cls: { good: 0.1, needsImprovement: 0.25 }, // Cumulative Layout Shift (score)
      ttfb: { good: 800, needsImprovement: 1800 }, // Time to First Byte (ms)
      fcp: { good: 1800, needsImprovement: 3000 }, // First Contentful Paint (ms)
      inp: { good: 200, needsImprovement: 500 }, // Interaction to Next Paint (ms)
      si: { good: 3400, needsImprovement: 5800 }, // Speed Index (ms)
      tbt: { good: 200, needsImprovement: 600 }, // Total Blocking Time (ms)
      tti: { good: 3800, needsImprovement: 7300 } // Time to Interactive (ms)
    };

    // Scoring weights (Lighthouse-inspired)
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

  /**
   * Collect all performance metrics from page
   * @param {Page} page - Puppeteer page
   * @param {Object} options - Collection options
   * @returns {Promise<Object>} Performance report
   */
  async collectMetrics(page, options = {}) {
    const {
      waitForLoad = true,
      collectResources = true,
      collectMemory = true,
      collectScreenshots = false,
      customMetrics = null
    } = options;

    const startTime = Date.now();

    try {
      // Wait for page load if requested
      if (waitForLoad) {
        await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {
          // Continue even if timeout
        });
      }

      // Inject Core Web Vitals measurement script
      await this._injectWebVitalsScript(page);

      // Wait for metrics to be available
      await this._delay(1000);

      // Collect all metrics
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

      // Collect custom metrics if provided
      let customMetricsData = null;
      if (customMetrics && typeof customMetrics === 'function') {
        customMetricsData = await customMetrics(page);
      }

      // Calculate derived metrics
      const derivedMetrics = this._calculateDerivedMetrics(navigationTiming, resourceTiming);

      // Calculate scores
      const scores = this._calculateScores({
        ...coreWebVitals,
        ...derivedMetrics
      });

      // Collect screenshots if requested
      let screenshots = null;
      if (collectScreenshots) {
        screenshots = await this._collectScreenshots(page);
      }

      const collectionTime = Date.now() - startTime;

      const report = {
        url: page.url(),
        timestamp: Date.now(),
        collectionTime,

        // Overall score (0-100)
        score: scores.overall,

        // Individual scores
        scores: scores.individual,

        // Core Web Vitals
        coreWebVitals,

        // Timing APIs
        navigationTiming,
        paintTiming,

        // Resource data
        resources: resourceTiming ? {
          summary: this._summarizeResources(resourceTiming),
          details: resourceTiming
        } : null,

        // Memory usage
        memory: memoryInfo,

        // Derived metrics
        derived: derivedMetrics,

        // Custom metrics
        custom: customMetricsData,

        // Screenshots
        screenshots,

        // Recommendations
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
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Inject Web Vitals measurement script
   * @private
   */
  async _injectWebVitalsScript(page) {
    await page.evaluateOnNewDocument(() => {
      // Store Web Vitals metrics
      window.__WEB_VITALS__ = {
        lcp: null,
        fid: null,
        cls: null,
        inp: null,
        fcp: null,
        ttfb: null
      };

      // LCP - Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        window.__WEB_VITALS__.lcp = lastEntry.renderTime || lastEntry.loadTime;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // FID - First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (!window.__WEB_VITALS__.fid) {
            window.__WEB_VITALS__.fid = entry.processingStart - entry.startTime;
          }
        });
      });
      fidObserver.observe({ type: 'first-input', buffered: true });

      // CLS - Cumulative Layout Shift
      let clsValue = 0;
      let clsEntries = [];
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            clsEntries.push(entry);
          }
        }
        window.__WEB_VITALS__.cls = clsValue;
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      // INP - Interaction to Next Paint (new metric)
      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const duration = entry.processingEnd - entry.startTime;
          if (!window.__WEB_VITALS__.inp || duration > window.__WEB_VITALS__.inp) {
            window.__WEB_VITALS__.inp = duration;
          }
        });
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });

      // Navigation Timing API v2
      window.addEventListener('load', () => {
        const navTiming = performance.getEntriesByType('navigation')[0];
        if (navTiming) {
          window.__WEB_VITALS__.ttfb = navTiming.responseStart - navTiming.requestStart;
        }

        // FCP - First Contentful Paint
        const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
        if (fcpEntry) {
          window.__WEB_VITALS__.fcp = fcpEntry.startTime;
        }
      });
    });
  }

  /**
   * Collect Core Web Vitals
   * @private
   */
  async _collectCoreWebVitals(page) {
    const vitals = await page.evaluate(() => {
      return window.__WEB_VITALS__ || {};
    });

    return {
      lcp: vitals.lcp || null,
      fid: vitals.fid || null,
      cls: vitals.cls || null,
      inp: vitals.inp || null,
      fcp: vitals.fcp || null,
      ttfb: vitals.ttfb || null
    };
  }

  /**
   * Collect Navigation Timing API metrics
   * @private
   */
  async _collectNavigationTiming(page) {
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (!nav) return null;

      return {
        // DNS
        dnsStart: nav.domainLookupStart,
        dnsEnd: nav.domainLookupEnd,
        dnsDuration: nav.domainLookupEnd - nav.domainLookupStart,

        // TCP
        tcpStart: nav.connectStart,
        tcpEnd: nav.connectEnd,
        tcpDuration: nav.connectEnd - nav.connectStart,

        // TLS/SSL
        tlsStart: nav.secureConnectionStart,
        tlsDuration: nav.secureConnectionStart > 0
          ? nav.connectEnd - nav.secureConnectionStart
          : 0,

        // Request/Response
        requestStart: nav.requestStart,
        responseStart: nav.responseStart,
        responseEnd: nav.responseEnd,
        requestDuration: nav.responseStart - nav.requestStart,
        responseDuration: nav.responseEnd - nav.responseStart,

        // DOM Processing
        domInteractive: nav.domInteractive,
        domContentLoaded: nav.domContentLoadedEventEnd,
        domComplete: nav.domComplete,

        // Load Events
        loadEventStart: nav.loadEventStart,
        loadEventEnd: nav.loadEventEnd,
        loadEventDuration: nav.loadEventEnd - nav.loadEventStart,

        // Total times
        redirectTime: nav.redirectEnd - nav.redirectStart,
        fetchTime: nav.responseEnd - nav.fetchStart,
        totalTime: nav.loadEventEnd - nav.fetchStart,

        // Transfer size
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize
      };
    });
  }

  /**
   * Collect Resource Timing API metrics
   * @private
   */
  async _collectResourceTiming(page) {
    return await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');

      return resources.map(resource => ({
        name: resource.name,
        type: resource.initiatorType,
        startTime: resource.startTime,
        duration: resource.duration,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
        decodedBodySize: resource.decodedBodySize,

        // Timing breakdown
        dns: resource.domainLookupEnd - resource.domainLookupStart,
        tcp: resource.connectEnd - resource.connectStart,
        tls: resource.secureConnectionStart > 0
          ? resource.connectEnd - resource.secureConnectionStart
          : 0,
        request: resource.responseStart - resource.requestStart,
        response: resource.responseEnd - resource.responseStart,

        // Caching
        cached: resource.transferSize === 0 && resource.decodedBodySize > 0
      }));
    });
  }

  /**
   * Collect Paint Timing API metrics
   * @private
   */
  async _collectPaintTiming(page) {
    return await page.evaluate(() => {
      const paintEntries = performance.getEntriesByType('paint');
      const result = {};

      paintEntries.forEach(entry => {
        result[entry.name] = entry.startTime;
      });

      return result;
    });
  }

  /**
   * Collect memory information
   * @private
   */
  async _collectMemoryInfo(page) {
    try {
      const memoryInfo = await page.evaluate(() => {
        if (performance.memory) {
          return {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            usedPercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
          };
        }
        return null;
      });

      return memoryInfo;
    } catch (err) {
      return null;
    }
  }

  /**
   * Calculate derived metrics
   * @private
   */
  _calculateDerivedMetrics(navigationTiming, resourceTiming) {
    if (!navigationTiming) return {};

    const derived = {
      // Time to Interactive (simplified calculation)
      tti: navigationTiming.domInteractive,

      // Total Blocking Time (simplified - would need long task API)
      tbt: Math.max(0, navigationTiming.domContentLoaded - navigationTiming.domInteractive - 50),

      // Speed Index (simplified approximation)
      si: navigationTiming.domContentLoaded
    };

    // Calculate resource metrics if available
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

      // Breakdown by type
      const byType = {};
      resourceTiming.forEach(r => {
        if (!byType[r.type]) {
          byType[r.type] = { count: 0, size: 0, duration: 0 };
        }
        byType[r.type].count++;
        byType[r.type].size += r.transferSize || 0;
        byType[r.type].duration += r.duration;
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

  /**
   * Calculate performance scores
   * @private
   */
  _calculateScores(metrics) {
    const individual = {};
    let weightedSum = 0;
    let totalWeight = 0;

    // Score each metric
    Object.keys(this.thresholds).forEach(metric => {
      const value = metrics[metric];
      const threshold = this.thresholds[metric];
      const weight = this.weights[metric] || 0;

      if (value === null || value === undefined) {
        individual[metric] = null;
        return;
      }

      // Calculate score (0-100)
      let score;
      if (metric === 'cls') {
        // CLS is different - lower is better, no milliseconds
        if (value <= threshold.good) {
          score = 100;
        } else if (value <= threshold.needsImprovement) {
          score = 50 + (50 * (threshold.needsImprovement - value) / (threshold.needsImprovement - threshold.good));
        } else {
          score = Math.max(0, 50 * (1 - (value - threshold.needsImprovement) / threshold.needsImprovement));
        }
      } else {
        // Time-based metrics
        if (value <= threshold.good) {
          score = 100;
        } else if (value <= threshold.needsImprovement) {
          score = 50 + (50 * (threshold.needsImprovement - value) / (threshold.needsImprovement - threshold.good));
        } else {
          score = Math.max(0, 50 * (1 - (value - threshold.needsImprovement) / threshold.needsImprovement));
        }
      }

      individual[metric] = Math.round(score);

      // Add to weighted sum
      if (weight > 0) {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    });

    // Calculate overall score
    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

    return {
      overall,
      individual
    };
  }

  /**
   * Summarize resource timing data
   * @private
   */
  _summarizeResources(resources) {
    const summary = {
      total: resources.length,
      byType: {},
      totalSize: 0,
      totalDuration: 0,
      cached: 0,
      slowest: []
    };

    // Group by type
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

    // Find slowest resources
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

  /**
   * Generate performance recommendations
   * @private
   */
  _generateRecommendations(metrics, resources) {
    const recommendations = [];

    // LCP recommendations
    if (metrics.lcp && metrics.lcp > this.thresholds.lcp.needsImprovement) {
      recommendations.push({
        metric: 'lcp',
        severity: 'high',
        message: `LCP is ${Math.round(metrics.lcp)}ms (target: <${this.thresholds.lcp.good}ms)`,
        suggestions: [
          'Optimize largest image/element loading',
          'Use lazy loading for below-the-fold content',
          'Reduce server response times',
          'Use CDN for static assets'
        ]
      });
    }

    // FID recommendations
    if (metrics.fid && metrics.fid > this.thresholds.fid.needsImprovement) {
      recommendations.push({
        metric: 'fid',
        severity: 'high',
        message: `FID is ${Math.round(metrics.fid)}ms (target: <${this.thresholds.fid.good}ms)`,
        suggestions: [
          'Break up long JavaScript tasks',
          'Use web workers for heavy computations',
          'Defer non-critical JavaScript',
          'Reduce JavaScript execution time'
        ]
      });
    }

    // CLS recommendations
    if (metrics.cls && metrics.cls > this.thresholds.cls.needsImprovement) {
      recommendations.push({
        metric: 'cls',
        severity: 'high',
        message: `CLS is ${metrics.cls.toFixed(3)} (target: <${this.thresholds.cls.good})`,
        suggestions: [
          'Set explicit width/height on images and videos',
          'Reserve space for ads and embeds',
          'Avoid inserting content above existing content',
          'Use transform animations instead of layout-triggering properties'
        ]
      });
    }

    // TTFB recommendations
    if (metrics.ttfb && metrics.ttfb > this.thresholds.ttfb.needsImprovement) {
      recommendations.push({
        metric: 'ttfb',
        severity: 'medium',
        message: `TTFB is ${Math.round(metrics.ttfb)}ms (target: <${this.thresholds.ttfb.good}ms)`,
        suggestions: [
          'Optimize server processing time',
          'Use server-side caching',
          'Use a CDN',
          'Reduce server redirects'
        ]
      });
    }

    // Resource recommendations
    if (resources && resources.length > 0) {
      const totalSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
      const uncachedSize = resources
        .filter(r => !r.cached)
        .reduce((sum, r) => sum + (r.transferSize || 0), 0);

      if (totalSize > 5 * 1024 * 1024) { // 5MB
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

  /**
   * Collect screenshots at key moments
   * @private
   */
  async _collectScreenshots(page) {
    try {
      const screenshots = {
        final: await page.screenshot({ encoding: 'base64' })
      };

      return screenshots;
    } catch (err) {
      return null;
    }
  }

  /**
   * Compare two performance reports
   * @param {Object} baseline - Baseline report
   * @param {Object} current - Current report
   * @returns {Object} Comparison result
   */
  compareReports(baseline, current) {
    const comparison = {
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
      scoreDelta: current.score - baseline.score,
      improvements: [],
      regressions: []
    };

    // Compare Core Web Vitals
    Object.keys(baseline.coreWebVitals).forEach(metric => {
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

  /**
   * Delay helper
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default PerformanceManager;
