import type { CrawlContext } from './crawl-context.js';
export interface RobotsParserConfig {
    userAgent?: string;
    defaultAllow?: boolean;
    cacheTimeout?: number;
    fetchTimeout?: number;
    fetcher?: ((url: string) => Promise<string>) | null;
    context?: CrawlContext | null;
}
export interface RobotsCheckResult {
    allowed: boolean;
    crawlDelay?: number | null;
    source: string;
    error?: string;
    matchedRule?: string;
}
export interface CompiledPattern {
    original: string;
    regex: RegExp;
    length: number;
}
export interface RuleWithType extends CompiledPattern {
    type: 'allow' | 'disallow';
}
export interface AgentRules {
    allow: CompiledPattern[];
    disallow: CompiledPattern[];
    crawlDelay: number | null;
}
export interface CombinedRules {
    rules: RuleWithType[];
    crawlDelay: number | null;
}
export interface ParsedRules {
    agents: Map<string, AgentRules>;
    sitemaps: string[];
}
export interface CacheEntry {
    rules: ParsedRules | null;
    timestamp: number;
}
export interface CacheStats {
    size: number;
    domains: string[];
}
interface HttpClient {
    get(url: string): Promise<HttpResponse>;
}
interface HttpResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}
export declare class RobotsParser {
    config: RobotsParserConfig & {
        userAgent: string;
        defaultAllow: boolean;
        cacheTimeout: number;
        fetchTimeout: number;
    };
    _context: CrawlContext | null;
    cache: Map<string, CacheEntry>;
    fetcher: ((url: string) => Promise<string>) | null;
    _httpClient: HttpClient | null;
    constructor(config?: RobotsParserConfig);
    setFetcher(fetcher: (url: string) => Promise<string>): void;
    isAllowed(url: string): Promise<RobotsCheckResult>;
    private _getRules;
    private _getHttpClient;
    private _fetchRobotsTxt;
    _parse(content: string | null): ParsedRules;
    private _hasRules;
    private _compilePattern;
    private _findAgentRules;
    private _combineRules;
    private _checkPath;
    getSitemaps(domain: string): Promise<string[]>;
    getCrawlDelay(domain: string): Promise<number | null>;
    preload(domain: string): Promise<void>;
    clearCache(domain?: string): void;
    getCacheStats(): CacheStats;
}
export default RobotsParser;
//# sourceMappingURL=robots-parser.d.ts.map