import type { CrawlContext } from './crawl-context.js';
export interface SitemapParserConfig {
    userAgent?: string;
    fetchTimeout?: number;
    maxSitemaps?: number;
    maxUrls?: number;
    followSitemapIndex?: boolean;
    cacheTimeout?: number;
    fetcher?: ((url: string) => Promise<FetcherResult>) | null;
    context?: CrawlContext | null;
}
export interface FetcherResult {
    content: string | Buffer;
    contentType?: string;
}
export interface SitemapEntry {
    url: string;
    lastmod?: string | null;
    changefreq?: string | null;
    priority?: number | null;
    title?: string | null;
    description?: string | null;
    source: string;
    type?: string;
    images?: SitemapImage[];
    videos?: SitemapVideo[];
}
export interface SitemapImage {
    url?: string | null;
    title?: string | null;
    caption?: string | null;
}
export interface SitemapVideo {
    url?: string | null;
    thumbnailUrl?: string | null;
    title?: string | null;
    description?: string | null;
}
export interface ParseOptions {
    recursive?: boolean;
    maxDepth?: number;
    _depth?: number;
}
export interface CacheEntry {
    entries: SitemapEntry[];
    timestamp: number;
    format: string;
}
export interface SitemapStats {
    sitemapsParsed: number;
    urlsExtracted: number;
    errors: number;
    cacheSize: number;
}
export interface ProbeResult {
    url: string;
    exists: boolean;
    format?: string;
}
interface HttpClient {
    get(url: string): Promise<HttpResponse>;
}
interface HttpResponse {
    ok: boolean;
    status: number;
    headers: Headers;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
}
interface Headers {
    get(name: string): string | null;
}
export declare class SitemapParser {
    config: SitemapParserConfig & {
        userAgent: string;
        fetchTimeout: number;
        maxSitemaps: number;
        maxUrls: number;
        followSitemapIndex: boolean;
        cacheTimeout: number;
    };
    _context: CrawlContext | null;
    cache: Map<string, CacheEntry>;
    fetcher: ((url: string) => Promise<FetcherResult>) | null;
    _httpClient: HttpClient | null;
    stats: {
        sitemapsParsed: number;
        urlsExtracted: number;
        errors: number;
    };
    constructor(config?: SitemapParserConfig);
    setFetcher(fetcher: (url: string) => Promise<FetcherResult>): void;
    parse(sitemapUrl: string, options?: ParseOptions): Promise<SitemapEntry[]>;
    private _getHttpClient;
    private _fetch;
    private _decompress;
    private _detectFormat;
    private _looksLikeTextSitemap;
    private _parseXmlSitemap;
    private _parseUrlBlock;
    private _extractTag;
    private _extractImages;
    private _extractVideos;
    private _parseXmlIndex;
    private _parseTextSitemap;
    private _parseRssFeed;
    private _parseAtomFeed;
    private _decodeXmlEntities;
    private _parseDate;
    getStats(): SitemapStats;
    clearCache(url?: string): void;
    resetStats(): void;
    discoverFromRobotsTxt(robotsTxtUrl: string): Promise<string[]>;
    probeCommonLocations(baseUrl: string): Promise<ProbeResult[]>;
}
export default SitemapParser;
//# sourceMappingURL=sitemap-parser.d.ts.map