import type { URLPatternMatcher } from './url-pattern-matcher.js';
import { ReckerRobotsValidator } from './recker-robots-validator.js';
import { ReckerSitemapValidator } from './recker-sitemap-validator.js';
import type { LinkDiscovererConfig, DiscoveredLink, RobotsCheckResult, DiscoveryStats, SitemapDiscoveryOptions, ResetOptions } from './link-discoverer.js';
export declare class ReckerLinkDiscoverer {
    private config;
    private patternMatcher;
    private robotsValidator;
    private sitemapValidator;
    private discovered;
    private queued;
    private blockedByRobots;
    private fromSitemap;
    private reckerAvailable;
    private parse;
    private reckerExtractLinks;
    private fallbackDiscoverer;
    constructor(config?: LinkDiscovererConfig);
    private _checkReckerAvailability;
    private _getFallbackDiscoverer;
    setPatternMatcher(matcher: URLPatternMatcher): void;
    setRobotsFetcher(fetcher: (url: string) => Promise<string>): void;
    extractLinksSync(html: string, baseUrl: string, currentDepth?: number): DiscoveredLink[];
    private _extractLinksWithRecker;
    private _extractLinksWithRegex;
    extractLinksAsync(html: string, baseUrl: string, currentDepth?: number): Promise<DiscoveredLink[]>;
    isAllowedByRobots(url: string): Promise<RobotsCheckResult>;
    preloadRobots(url: string): Promise<void>;
    getSitemaps(url: string): Promise<string[]>;
    discoverFromSitemaps(url: string, options?: SitemapDiscoveryOptions): Promise<DiscoveredLink[]>;
    parseSitemap(sitemapUrl: string, options?: Record<string, unknown>): Promise<Array<{
        url?: string;
        [key: string]: unknown;
    }>>;
    probeSitemapLocations(url: string): Promise<Array<{
        url: string;
        exists: boolean;
        format?: string;
    }>>;
    private _normalizeUrl;
    private _shouldFollow;
    private _shouldFollowPattern;
    private _getMainDomain;
    markQueued(url: string): void;
    isQueued(url: string): boolean;
    getStats(): DiscoveryStats;
    reset(options?: ResetOptions): void;
    isLimitReached(): boolean;
    getRobotsValidation(url: string): Promise<ReturnType<ReckerRobotsValidator['validate']> | null>;
    getSitemapValidation(url: string): Promise<ReturnType<ReckerSitemapValidator['validate']> | null>;
    isReckerEnabled(): boolean;
}
export default ReckerLinkDiscoverer;
//# sourceMappingURL=recker-link-discoverer.d.ts.map