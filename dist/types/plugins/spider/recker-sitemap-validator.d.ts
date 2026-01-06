import type { SitemapParserConfig, SitemapEntry, ParseOptions, SitemapStats, ProbeResult, FetcherResult } from './sitemap-parser.js';
type ReckerSitemapUrl = {
    loc: string;
    lastmod?: string;
    changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    priority?: number;
    images?: Array<{
        loc: string;
        caption?: string;
        title?: string;
    }>;
    videos?: Array<{
        thumbnailLoc: string;
        title: string;
        description: string;
        contentLoc?: string;
        playerLoc?: string;
    }>;
    news?: {
        publicationName: string;
        publicationLanguage: string;
        publicationDate: string;
        title: string;
    };
    alternates?: Array<{
        hreflang: string;
        href: string;
    }>;
};
type ReckerSitemapIndex = {
    loc: string;
    lastmod?: string;
};
type ReckerSitemapParseResult = {
    type: 'urlset' | 'sitemapindex' | 'unknown';
    valid: boolean;
    errors: string[];
    warnings: string[];
    urls: ReckerSitemapUrl[];
    sitemaps: ReckerSitemapIndex[];
    urlCount: number;
    size: number;
    compressed: boolean;
};
type ReckerSitemapValidationIssue = {
    type: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    url?: string;
    recommendation?: string;
};
type ReckerSitemapValidationResult = {
    valid: boolean;
    issues: ReckerSitemapValidationIssue[];
    parseResult: ReckerSitemapParseResult;
};
export interface SitemapValidationDetails {
    valid: boolean;
    issues: ReckerSitemapValidationIssue[];
    type: 'urlset' | 'sitemapindex' | 'unknown';
    urlCount: number;
    size: number;
    compressed: boolean;
    errors: string[];
    warnings: string[];
}
export interface SitemapEntryExtended extends SitemapEntry {
    news?: {
        publicationName: string;
        publicationLanguage: string;
        publicationDate: string;
        title: string;
    };
    alternates?: Array<{
        hreflang: string;
        href: string;
    }>;
}
export declare class ReckerSitemapValidator {
    private config;
    private _context;
    private cache;
    private fetcher;
    private _httpClient;
    private stats;
    private reckerAvailable;
    private parseSitemap;
    private validateSitemap;
    private discoverSitemaps;
    private fetchAndValidateSitemap;
    private fallbackParser;
    constructor(config?: SitemapParserConfig);
    private _checkReckerAvailability;
    private _getFallbackParser;
    setFetcher(fetcher: (url: string) => Promise<FetcherResult>): void;
    parse(sitemapUrl: string, options?: ParseOptions): Promise<SitemapEntry[]>;
    private _parseReckerIndex;
    private _mapReckerUrlsToEntries;
    private _getHttpClient;
    private _fetch;
    private _decompress;
    getStats(): SitemapStats;
    clearCache(url?: string): void;
    resetStats(): void;
    discoverFromRobotsTxt(robotsTxtUrl: string): Promise<string[]>;
    probeCommonLocations(baseUrl: string): Promise<ProbeResult[]>;
    validate(sitemapUrl: string): Promise<SitemapValidationDetails | null>;
    validateContent(content: string, baseUrl?: string): Promise<ReckerSitemapValidationResult | null>;
    parseContent(content: string, compressed?: boolean): ReckerSitemapParseResult | null;
    getValidationIssues(sitemapUrl: string): Promise<ReckerSitemapValidationIssue[]>;
    getNewsEntries(sitemapUrl: string): Promise<SitemapEntryExtended[]>;
    getAlternateLanguages(sitemapUrl: string): Promise<Map<string, SitemapEntryExtended[]>>;
    discoverAll(baseUrl: string): Promise<{
        fromRobots: string[];
        fromProbing: ProbeResult[];
        all: string[];
    }>;
    isReckerEnabled(): boolean;
}
export default ReckerSitemapValidator;
//# sourceMappingURL=recker-sitemap-validator.d.ts.map