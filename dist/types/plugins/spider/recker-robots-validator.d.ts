import type { RobotsCheckResult, RobotsParserConfig, CacheStats } from './robots-parser.js';
type ReckerRobotsParseResult = {
    valid: boolean;
    errors: Array<{
        line: number;
        message: string;
    }>;
    warnings: Array<{
        line: number;
        message: string;
    }>;
    directives: Array<{
        type: 'user-agent' | 'allow' | 'disallow' | 'sitemap' | 'crawl-delay' | 'host' | 'clean-param';
        value: string;
        line: number;
    }>;
    userAgentBlocks: Array<{
        userAgents: string[];
        rules: Array<{
            type: 'allow' | 'disallow';
            path: string;
            line: number;
        }>;
        crawlDelay?: number;
    }>;
    sitemaps: string[];
    host?: string;
    blocksAllRobots: boolean;
    blocksImportantPaths: boolean;
    size: number;
};
type ReckerRobotsValidationIssue = {
    type: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    line?: number;
    recommendation?: string;
};
type ReckerRobotsValidationResult = {
    valid: boolean;
    issues: ReckerRobotsValidationIssue[];
    parseResult: ReckerRobotsParseResult;
};
export interface RobotsValidationDetails {
    valid: boolean;
    issues: ReckerRobotsValidationIssue[];
    blocksAllRobots: boolean;
    blocksImportantPaths: boolean;
    host?: string;
    size: number;
}
export declare class ReckerRobotsValidator {
    private config;
    private _context;
    private cache;
    private fetcher;
    private _httpClient;
    private reckerAvailable;
    private parseRobotsTxt;
    private validateRobotsTxt;
    private isPathAllowed;
    private fetchAndValidateRobotsTxt;
    private fallbackParser;
    constructor(config?: RobotsParserConfig);
    private _checkReckerAvailability;
    private _getFallbackParser;
    setFetcher(fetcher: (url: string) => Promise<string>): void;
    isAllowed(url: string): Promise<RobotsCheckResult>;
    private _getCachedOrFetch;
    private _getHttpClient;
    private _fetchRobotsTxt;
    private _getCrawlDelayFromParseResult;
    private _findMatchedRule;
    private _pathMatches;
    getSitemaps(domain: string): Promise<string[]>;
    getCrawlDelay(domain: string): Promise<number | null>;
    preload(domain: string): Promise<void>;
    clearCache(domain?: string): void;
    getCacheStats(): CacheStats;
    validate(url: string): Promise<RobotsValidationDetails | null>;
    validateContent(content: string, baseUrl?: string): Promise<ReckerRobotsValidationResult | null>;
    parseContent(content: string): ReckerRobotsParseResult | null;
    getBlockingStatus(domain: string): {
        blocksAllRobots: boolean;
        blocksImportantPaths: boolean;
    } | null;
    getHost(domain: string): string | null;
    getValidationIssues(domain: string): Promise<ReckerRobotsValidationIssue[]>;
    isReckerEnabled(): boolean;
}
export default ReckerRobotsValidator;
//# sourceMappingURL=recker-robots-validator.d.ts.map