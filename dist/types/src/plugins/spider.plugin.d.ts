import { Plugin } from './plugin.class.js';
import { PuppeteerPlugin } from './puppeteer.plugin.js';
import { S3QueuePlugin } from './s3-queue.plugin.js';
import { TTLPlugin } from './ttl.plugin.js';
import { AVAILABLE_ACTIVITIES, ACTIVITY_CATEGORIES, ACTIVITY_PRESETS, getActivitiesByCategory, getAllActivities, getCategoriesWithActivities, validateActivities, getPreset } from './spider/task-activities.js';
import { URLPatternMatcher } from './spider/url-pattern-matcher.js';
import { LinkDiscoverer } from './spider/link-discoverer.js';
import { DeepDiscovery } from './spider/deep-discovery.js';
export interface SpiderPluginConfig {
    logLevel?: string;
    namespace?: string;
    resourcePrefix?: string;
    puppeteer?: Record<string, any>;
    queue?: Record<string, any>;
    ttl?: {
        enabled?: boolean;
        queue?: {
            ttl?: number;
            [key: string]: any;
        };
        [key: string]: any;
    };
    seo?: {
        enabled?: boolean;
        extractMetaTags?: boolean;
        extractOpenGraph?: boolean;
        extractTwitterCard?: boolean;
        extractAssets?: boolean;
        assetMetadata?: boolean;
        [key: string]: any;
    };
    techDetection?: {
        enabled?: boolean;
        detectFrameworks?: boolean;
        detectAnalytics?: boolean;
        detectMarketing?: boolean;
        detectCDN?: boolean;
        detectWebServer?: boolean;
        detectCMS?: boolean;
        [key: string]: any;
    };
    screenshot?: {
        enabled?: boolean;
        captureFullPage?: boolean;
        quality?: number;
        format?: 'jpeg' | 'png';
        maxWidth?: number;
        maxHeight?: number;
        [key: string]: any;
    };
    persistence?: {
        enabled?: boolean;
        saveResults?: boolean;
        saveSEOAnalysis?: boolean;
        saveTechFingerprint?: boolean;
        saveSecurityAnalysis?: boolean;
        saveScreenshots?: boolean;
        savePerformanceMetrics?: boolean;
        [key: string]: any;
    };
    performance?: {
        enabled?: boolean;
        collectCoreWebVitals?: boolean;
        collectNavigationTiming?: boolean;
        collectResourceTiming?: boolean;
        collectMemory?: boolean;
        [key: string]: any;
    };
    security?: {
        enabled?: boolean;
        analyzeSecurityHeaders?: boolean;
        analyzeCSP?: boolean;
        analyzeCORS?: boolean;
        captureConsoleLogs?: boolean;
        consoleLogLevels?: string[];
        maxConsoleLogLines?: number;
        analyzeTLS?: boolean;
        checkVulnerabilities?: boolean;
        captureWebSockets?: boolean;
        maxWebSocketMessages?: number;
        [key: string]: any;
    };
    patterns?: Record<string, any>;
    discovery?: {
        enabled?: boolean;
        maxDepth?: number;
        maxUrls?: number;
        sameDomainOnly?: boolean;
        includeSubdomains?: boolean;
        allowedDomains?: string[];
        blockedDomains?: string[];
        followPatterns?: string[];
        followRegex?: RegExp | null;
        ignoreRegex?: RegExp | null;
        respectRobotsTxt?: boolean;
        ignoreQueryString?: boolean;
        [key: string]: any;
    };
    logger?: any;
}
export declare class SpiderPlugin extends Plugin {
    config: any;
    resourceNames: Record<string, string>;
    puppeteerPlugin: PuppeteerPlugin | null;
    queuePlugin: S3QueuePlugin | null;
    ttlPlugin: TTLPlugin | null;
    seoAnalyzer: any | null;
    techDetector: any | null;
    securityAnalyzer: any | null;
    patternMatcher: URLPatternMatcher | null;
    linkDiscoverer: LinkDiscoverer | null;
    initialized: boolean;
    namespace: string;
    constructor(options?: SpiderPluginConfig);
    /**
     * Initialize SpiderPlugin
     * Creates and initializes bundled plugins
     */
    initialize(): Promise<void>;
    /**
     * Create required resources
     */
    _createResources(): Promise<void>;
    /**
     * Check if a specific activity should be executed
     */
    _shouldExecuteActivity(task: any, activityName: string): boolean;
    /**
     * Check if ANY activity from a category should be executed
     */
    _shouldExecuteCategory(task: any, category: string): boolean;
    /**
     * Get which specific activities from a category should run
     */
    _getRequestedActivities(task: any, category: string): string[];
    /**
     * Setup queue processor function
     */
    _setupQueueProcessor(): Promise<void>;
    /**
     * Enqueue a crawl target
     */
    enqueueTarget(target: any): Promise<any>;
    /**
     * Enqueue multiple targets
     */
    enqueueBatch(targets: any[], defaultConfig?: any): Promise<any[]>;
    /**
     * Get results for a crawl
     */
    getResults(query?: any): Promise<any[]>;
    /**
     * Get SEO analysis for URLs
     */
    getSEOAnalysis(query?: any): Promise<any[]>;
    /**
     * Get technology fingerprints
     */
    getTechFingerprints(query?: any): Promise<any[]>;
    /**
     * Get screenshots
     */
    getScreenshots(query?: any): Promise<any[]>;
    /**
     * Get security analysis records
     */
    getSecurityAnalysis(query?: any): Promise<any[]>;
    /**
     * Get content analysis records (iframes, tracking pixels)
     */
    getContentAnalysis(query?: any): Promise<any[]>;
    /**
     * Get storage analysis records (localStorage, IndexedDB, sessionStorage)
     */
    getStorageAnalysis(query?: any): Promise<any[]>;
    /**
     * Get performance metrics records
     */
    getPerformanceMetrics(query?: any): Promise<any[]>;
    /**
     * Get assets analysis records (CSS, JS, images, videos, audios)
     */
    getAssetsAnalysis(query?: any): Promise<any[]>;
    /**
     * Detect anti-bot services and CAPTCHA implementations on a page
     */
    detectAntiBotServices(page: any): Promise<any>;
    /**
     * Detect browser fingerprinting capabilities and attempts
     */
    detectFingerprinting(page: any): Promise<any>;
    /**
     * Comprehensive anti-bot and fingerprinting detection
     */
    detectAntiBotsAndFingerprinting(page: any): Promise<any>;
    /**
     * Detect WebRTC peer connections and ICE candidates
     */
    detectWebRTC(page: any): Promise<any>;
    /**
     * Detect media streams (audio, video, display capture)
     */
    detectMediaStreams(page: any): Promise<any>;
    /**
     * Detect streaming protocols (HLS, DASH, RTMP, etc.)
     */
    detectStreamingProtocols(page: any): Promise<any>;
    /**
     * Comprehensive WebRTC and streaming detection
     */
    detectWebRTCAndStreams(page: any): Promise<any>;
    /**
     * Capture all storage data (localStorage, sessionStorage, IndexedDB) from page
     */
    captureAllStorage(page: any): Promise<any>;
    /**
     * Get access to the underlying PuppeteerPlugin for advanced usage
     */
    getPuppeteerPlugin(): PuppeteerPlugin | null;
    /**
     * Navigate to a URL using the underlying PuppeteerPlugin
     */
    navigate(url: string, options?: any): Promise<any>;
    /**
     * Match a URL against configured patterns
     */
    matchUrl(url: string): any | null;
    /**
     * Check if a URL matches any pattern (quick check)
     */
    urlMatchesPattern(url: string): boolean;
    /**
     * Add a new URL pattern at runtime
     */
    addPattern(name: string, config: any): void;
    /**
     * Remove a URL pattern
     */
    removePattern(name: string): void;
    /**
     * Get all configured pattern names
     */
    getPatternNames(): string[];
    /**
     * Filter URLs that match specific patterns
     */
    filterUrlsByPattern(urls: string[], patternNames?: string[]): Array<{
        url: string;
        match: any;
    }>;
    /**
     * Get discovery statistics
     */
    getDiscoveryStats(): any;
    /**
     * Reset discovery state (clear discovered/queued URLs)
     */
    resetDiscovery(): void;
    /**
     * Enable or configure auto-discovery at runtime
     */
    enableDiscovery(config?: any): void;
    /**
     * Disable auto-discovery
     */
    disableDiscovery(): void;
    /**
     * Get queue status
     */
    getQueueStatus(): Promise<any>;
    /**
     * Start queue processing
     */
    startProcessing(): Promise<void>;
    /**
     * Stop queue processing
     */
    stopProcessing(): Promise<void>;
    /**
     * Get persistence configuration
     */
    getPersistenceConfig(): any;
    /**
     * Enable persistence
     */
    enablePersistence(config?: any): void;
    /**
     * Disable persistence
     */
    disablePersistence(): void;
    /**
     * Get all available activities
     */
    getAvailableActivities(): any[];
    /**
     * Get activities by category
     */
    getActivitiesByCategory(category: string): any[];
    /**
     * Get all activity categories with their activities
     */
    getActivityCategories(): any;
    /**
     * Get all available activity presets
     */
    getActivityPresets(): Record<string, any>;
    /**
     * Get a specific preset by name
     */
    getPresetByName(presetName: string): any | null;
    /**
     * Validate a list of activity names
     */
    validateActivityList(activityNames: string[]): {
        valid: boolean;
        message?: string;
        invalidActivities?: string[];
    };
    /**
     * Clear all crawl data
     */
    clear(): Promise<void>;
    /**
     * Destroy SpiderPlugin
     * Closes browsers and stops processing
     */
    destroy(): Promise<void>;
}
export default SpiderPlugin;
export { LinkDiscoverer, DeepDiscovery, URLPatternMatcher, AVAILABLE_ACTIVITIES, ACTIVITY_CATEGORIES, ACTIVITY_PRESETS, getActivitiesByCategory, getAllActivities, getCategoriesWithActivities, validateActivities, getPreset };
//# sourceMappingURL=spider.plugin.d.ts.map