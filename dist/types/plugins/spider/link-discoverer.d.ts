import { RobotsParser } from './robots-parser.js';
import { SitemapParser } from './sitemap-parser.js';
import type { URLPatternMatcher } from './url-pattern-matcher.js';
export interface LinkDiscovererConfig {
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
    ignoreHash?: boolean;
    robotsUserAgent?: string;
    robotsCacheTimeout?: number;
    useSitemaps?: boolean;
    sitemapMaxUrls?: number;
    defaultIgnore?: RegExp[];
    robotsFetcher?: ((url: string) => Promise<string>) | null;
    sitemapFetcher?: ((url: string) => Promise<string>) | null;
}
export interface DiscoveredLink {
    url: string;
    anchorText?: string;
    depth: number;
    sourceUrl: string;
    pattern: string | null;
    params: Record<string, string>;
    activities: string[];
    metadata: Record<string, unknown>;
}
export interface RobotsCheckResult {
    allowed: boolean;
    crawlDelay?: number | null;
}
export interface DiscoveryStats {
    discovered: number;
    queued: number;
    blockedByRobots: number;
    fromSitemap: number;
    maxUrls: number;
    maxDepth: number;
    remaining: number;
    robotsCacheSize: number;
    sitemapStats: Record<string, unknown> | null;
}
export interface SitemapDiscoveryOptions {
    autoDiscover?: boolean;
    sitemapUrls?: string[];
    checkRobots?: boolean;
}
export interface ResetOptions {
    clearRobotsCache?: boolean;
    clearSitemapCache?: boolean;
}
export declare class LinkDiscoverer {
    config: Required<Omit<LinkDiscovererConfig, 'robotsFetcher' | 'sitemapFetcher' | 'followRegex' | 'ignoreRegex'>> & {
        followRegex: RegExp | null;
        ignoreRegex: RegExp | null;
    };
    patternMatcher: URLPatternMatcher | null;
    robotsParser: RobotsParser | null;
    sitemapParser: SitemapParser | null;
    discovered: Set<string>;
    queued: Set<string>;
    blockedByRobots: Set<string>;
    fromSitemap: Set<string>;
    constructor(config?: LinkDiscovererConfig);
    setPatternMatcher(matcher: URLPatternMatcher): void;
    setRobotsFetcher(fetcher: (url: string) => Promise<string>): void;
    extractLinks(html: string, baseUrl: string, currentDepth?: number): DiscoveredLink[];
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
}
export default LinkDiscoverer;
//# sourceMappingURL=link-discoverer.d.ts.map