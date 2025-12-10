import { CrawlContext } from './crawl-context.js';
export interface DeepDiscoveryConfig {
    userAgent?: string;
    timeout?: number;
    maxConcurrent?: number;
    checkSubdomains?: boolean;
    detectFrameworks?: boolean;
    detectEcommerce?: boolean;
    detectCMS?: boolean;
    fetcher?: ((url: string) => Promise<any>) | null;
    context?: CrawlContext | null;
}
export interface DiscoveryOptions {
    includeSitemaps?: boolean;
    includeFeeds?: boolean;
    includeAPIs?: boolean;
    includeStatic?: boolean;
    analyzeRobots?: boolean;
    detectPlatform?: boolean;
    includeSubdomains?: boolean;
}
export interface DiscoveredSitemap {
    url: string;
    type?: string;
    contentType?: string | null;
    source: string;
    priority?: number;
    hasPriority?: boolean;
    hasChangefreq?: boolean;
    hasLastmod?: boolean;
    urlCount?: number;
}
export interface DiscoveredFeed {
    url: string;
    type: string;
    contentType: string | null;
    source: string;
}
export interface DiscoveredAPI {
    url: string;
    type: string;
    contentType: string | null;
    source: string;
}
export interface DiscoveredStaticFile {
    url: string;
    contentType: string | null;
    source: string;
}
export interface DiscoveredPlatform {
    type: string;
    platform: string;
    confidence: number;
    paths: string[];
}
export interface DiscoveredSubdomain {
    subdomain: string;
    url: string;
    source: string;
}
export interface DiscoveredExposedPath {
    path: string;
    type: string;
    source: string;
}
export interface DiscoveredAmpPage {
    url: string;
    source: string;
}
export interface RobotsDirectives {
    crawlDelay?: number | null;
    yandexHost?: string | null;
    noindex?: boolean;
}
export interface DiscoveredData {
    sitemaps: DiscoveredSitemap[];
    feeds: DiscoveredFeed[];
    apis: DiscoveredAPI[];
    staticFiles: DiscoveredStaticFile[];
    frameworks: any[];
    platforms: DiscoveredPlatform[];
    subdomains: DiscoveredSubdomain[];
    exposedPaths: DiscoveredExposedPath[];
    ampPages: DiscoveredAmpPage[];
    robotsDirectives: RobotsDirectives;
}
export interface CrawlerScore {
    score: number;
    strengths: string[];
    warnings: string[];
}
export interface CrawlerCompatibility {
    google: CrawlerScore;
    bing: CrawlerScore;
    yandex: CrawlerScore;
    baidu: CrawlerScore;
    duckduckgo: CrawlerScore;
}
export interface CrawlBudget {
    estimatedPageCount: number;
    crawlDelay: number;
    estimatedCrawlTime: {
        google: string;
        bing: string;
        yandex: string;
        baidu: string;
        duckduckgo: string;
    };
}
export interface DiscoveryStats {
    urlsProbed: number;
    urlsFound: number;
    errors: number;
}
export interface DiscoveryReport {
    domain: string;
    timestamp: string;
    stats: DiscoveryStats;
    discovered: DiscoveredData;
    crawlerCompatibility: CrawlerCompatibility;
    crawlBudget: CrawlBudget;
    summary: {
        sitemapCount: number;
        feedCount: number;
        apiCount: number;
        staticFileCount: number;
        platformCount: number;
        subdomainCount: number;
        exposedPathCount: number;
        ampPageCount: number;
        totalFound: number;
        totalProbed: number;
        successRate: string;
    };
}
export declare class DeepDiscovery {
    private config;
    private _context;
    private _httpClient;
    private discovered;
    private stats;
    private crawlerCompatibility;
    /**
     * @param config - Discovery configuration
     */
    constructor(config?: DeepDiscoveryConfig);
    /**
     * Run complete deep discovery on a domain
     */
    discover(baseUrl: string, options?: DiscoveryOptions): Promise<DiscoveryReport>;
    /**
     * Analyze robots.txt for exposed paths and sitemaps
     */
    private _analyzeRobotsTxt;
    /**
     * Discover all sitemap variants including Google News, Images, Videos
     */
    private _discoverSitemaps;
    /**
     * Discover RSS/Atom/JSON feeds
     */
    private _discoverFeeds;
    /**
     * Detect platform and framework
     */
    private _detectPlatform;
    /**
     * Discover API endpoints
     */
    private _discoverAPIs;
    /**
     * Discover static JSON and config files
     */
    private _discoverStaticFiles;
    /**
     * Check common subdomains for sitemaps
     */
    private _checkSubdomains;
    /**
     * Probe multiple URLs concurrently
     */
    private _probeUrls;
    /**
     * Get or create HTTP client
     * Uses shared CrawlContext if available for consistent session state
     */
    private _getHttpClient;
    /**
     * Check if URL exists (HEAD request)
     */
    private _urlExists;
    /**
     * Get content-type of URL
     */
    private _getContentType;
    /**
     * Fetch URL content
     */
    private _fetch;
    /**
     * Check if path looks like an API
     */
    private _looksLikeAPI;
    /**
     * Detect sitemap type from URL
     */
    private _detectSitemapType;
    /**
     * Get sitemap priority based on type and name
     */
    private _getSitemapPriority;
    /**
     * Detect feed type
     */
    private _detectFeedType;
    /**
     * Detect API type
     */
    private _detectAPIType;
    /**
     * Analyze sitemap content for Bing-specific features
     */
    private _analyzeSitemapContent;
    /**
     * Score crawler compatibility based on sitemap features
     */
    private _scoreSitemapCompatibility;
    /**
     * Calculate crawler compatibility scores
     */
    private _calculateCrawlerScores;
    /**
     * Estimate crawl budget and time
     */
    private _estimateCrawlBudget;
    /**
     * Format seconds to human-readable time
     */
    private _formatTime;
    /**
     * Generate discovery report
     */
    private _generateReport;
    /**
     * Get statistics
     */
    getStats(): DiscoveryStats;
}
export default DeepDiscovery;
//# sourceMappingURL=deep-discovery.d.ts.map