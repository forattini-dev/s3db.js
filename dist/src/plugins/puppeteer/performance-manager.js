export class PerformanceManager {
    plugin;
    config;
    thresholds;
    weights;
    constructor(plugin) {
        this.plugin = plugin;
        this.config = (plugin.config.performance) || {};
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
    async collectMetrics(page, options = {}) {
        const { waitForLoad = true, collectResources = true, collectMemory = true, collectScreenshots = false, customMetrics = null } = options;
        const startTime = Date.now();
        try {
            if (waitForLoad && page.waitForLoadState) {
                await page.waitForLoadState('load', { timeout: 30000 }).catch(() => { });
            }
            await this._injectWebVitalsScript(page);
            await this._delay(1000);
            const [coreWebVitals, navigationTiming, resourceTiming, paintTiming, memoryInfo] = await Promise.all([
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
            const report = {
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
        }
        catch (err) {
            this.plugin.emit('performance.collectionFailed', {
                url: page.url(),
                error: err.message
            });
            throw err;
        }
    }
    async _injectWebVitalsScript(page) {
        await page.evaluateOnNewDocument(() => {
            const win = window;
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
                const lastEntry = entries[entries.length - 1];
                win.__WEB_VITALS__.lcp = lastEntry.renderTime || lastEntry.loadTime || null;
            });
            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
            const fidObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    const e = entry;
                    if (!win.__WEB_VITALS__.fid) {
                        win.__WEB_VITALS__.fid = e.processingStart - e.startTime;
                    }
                });
            });
            fidObserver.observe({ type: 'first-input', buffered: true });
            let clsValue = 0;
            const clsObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    const e = entry;
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
                    const e = entry;
                    const duration = e.processingEnd - e.startTime;
                    if (!win.__WEB_VITALS__.inp || duration > win.__WEB_VITALS__.inp) {
                        win.__WEB_VITALS__.inp = duration;
                    }
                });
            });
            inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
            window.addEventListener('load', () => {
                const navTiming = performance.getEntriesByType('navigation')[0];
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
    async _collectCoreWebVitals(page) {
        const vitals = await page.evaluate(() => {
            const win = window;
            return win.__WEB_VITALS__ || {};
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
    async _collectNavigationTiming(page) {
        return await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            if (!nav)
                return null;
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
    async _collectPaintTiming(page) {
        return await page.evaluate(() => {
            const paintEntries = performance.getEntriesByType('paint');
            const result = {};
            paintEntries.forEach(entry => {
                result[entry.name] = entry.startTime;
            });
            return Object.keys(result).length > 0 ? result : null;
        });
    }
    async _collectMemoryInfo(page) {
        try {
            const memoryInfo = await page.evaluate(() => {
                const perf = performance;
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
        }
        catch {
            return null;
        }
    }
    _calculateDerivedMetrics(navigationTiming, resourceTiming) {
        if (!navigationTiming)
            return {};
        const derived = {
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
    _calculateScores(metrics) {
        const individual = {};
        let weightedSum = 0;
        let totalWeight = 0;
        Object.keys(this.thresholds).forEach(metric => {
            const value = metrics[metric];
            const threshold = this.thresholds[metric];
            const weight = this.weights[metric] || 0;
            if (value === null || value === undefined || !threshold) {
                individual[metric] = null;
                return;
            }
            let score;
            if (metric === 'cls') {
                if (value <= threshold.good) {
                    score = 100;
                }
                else if (value <= threshold.needsImprovement) {
                    score = 50 + (50 * (threshold.needsImprovement - value) / (threshold.needsImprovement - threshold.good));
                }
                else {
                    score = Math.max(0, 50 * (1 - (value - threshold.needsImprovement) / threshold.needsImprovement));
                }
            }
            else {
                if (value <= threshold.good) {
                    score = 100;
                }
                else if (value <= threshold.needsImprovement) {
                    score = 50 + (50 * (threshold.needsImprovement - value) / (threshold.needsImprovement - threshold.good));
                }
                else {
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
    _summarizeResources(resources) {
        const summary = {
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
            if (resource.cached)
                summary.cached++;
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
    _generateRecommendations(metrics, resources) {
        const recommendations = [];
        const lcp = metrics.lcp;
        const fid = metrics.fid;
        const cls = metrics.cls;
        const ttfb = metrics.ttfb;
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
    async _collectScreenshots(page) {
        try {
            const screenshots = {
                final: await page.screenshot({ encoding: 'base64' })
            };
            return screenshots;
        }
        catch {
            return null;
        }
    }
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
            scoreDelta: (current.score !== null && baseline.score !== null) ? current.score - baseline.score : null,
            improvements: [],
            regressions: []
        };
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
                }
                else if (delta > 0) {
                    comparison.regressions.push(change);
                }
            }
        });
        return comparison;
    }
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
export default PerformanceManager;
//# sourceMappingURL=performance-manager.js.map