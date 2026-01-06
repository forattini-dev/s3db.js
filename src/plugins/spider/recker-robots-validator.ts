import { createHttpClient } from '#src/concerns/http-client.js';
import type { CrawlContext } from './crawl-context.js';
import type { RobotsCheckResult, RobotsParserConfig, CacheStats, ParsedRules } from './robots-parser.js';

type ReckerRobotsParseResult = {
  valid: boolean;
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
  directives: Array<{
    type: 'user-agent' | 'allow' | 'disallow' | 'sitemap' | 'crawl-delay' | 'host' | 'clean-param';
    value: string;
    line: number;
  }>;
  userAgentBlocks: Array<{
    userAgents: string[];
    rules: Array<{ type: 'allow' | 'disallow'; path: string; line: number }>;
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

type ReckerParseRobotsTxt = (content: string) => ReckerRobotsParseResult;
type ReckerValidateRobotsTxt = (content: string, baseUrl?: string) => ReckerRobotsValidationResult;
type ReckerIsPathAllowed = (parseResult: ReckerRobotsParseResult, path: string, userAgent?: string) => boolean;
type ReckerFetchAndValidate = (url: string, fetcher?: (url: string) => Promise<{ status: number; text: string }>) => Promise<ReckerRobotsValidationResult & { exists: boolean; status?: number }>;

interface CacheEntry {
  parseResult: ReckerRobotsParseResult | null;
  validationResult: ReckerRobotsValidationResult | null;
  timestamp: number;
}

interface HttpClient {
  get(url: string): Promise<HttpResponse>;
}

interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface RobotsValidationDetails {
  valid: boolean;
  issues: ReckerRobotsValidationIssue[];
  blocksAllRobots: boolean;
  blocksImportantPaths: boolean;
  host?: string;
  size: number;
}

export class ReckerRobotsValidator {
  private config: Required<Omit<RobotsParserConfig, 'context' | 'fetcher'>> & {
    context: CrawlContext | null;
    fetcher: ((url: string) => Promise<string>) | null;
  };
  private _context: CrawlContext | null;
  private cache: Map<string, CacheEntry>;
  private fetcher: ((url: string) => Promise<string>) | null;
  private _httpClient: HttpClient | null;

  private reckerAvailable: boolean | null = null;
  private parseRobotsTxt: ReckerParseRobotsTxt | null = null;
  private validateRobotsTxt: ReckerValidateRobotsTxt | null = null;
  private isPathAllowed: ReckerIsPathAllowed | null = null;
  private fetchAndValidateRobotsTxt: ReckerFetchAndValidate | null = null;
  private fallbackParser: import('./robots-parser.js').RobotsParser | null = null;

  constructor(config: RobotsParserConfig = {}) {
    this.config = {
      userAgent: config.userAgent || 's3db-spider',
      defaultAllow: config.defaultAllow !== false,
      cacheTimeout: config.cacheTimeout || 3600000,
      fetchTimeout: config.fetchTimeout || 10000,
      context: config.context || null,
      fetcher: config.fetcher || null
    };

    this._context = this.config.context;
    this.cache = new Map();
    this.fetcher = this.config.fetcher;
    this._httpClient = null;
  }

  private async _checkReckerAvailability(): Promise<boolean> {
    if (this.reckerAvailable !== null) {
      return this.reckerAvailable;
    }

    try {
      const robotsModule = await import('recker/seo/validators/robots');
      this.parseRobotsTxt = robotsModule.parseRobotsTxt;
      this.validateRobotsTxt = robotsModule.validateRobotsTxt;
      this.isPathAllowed = robotsModule.isPathAllowed;
      this.fetchAndValidateRobotsTxt = robotsModule.fetchAndValidateRobotsTxt;
      this.reckerAvailable = true;
      return true;
    } catch {
      this.reckerAvailable = false;
      return false;
    }
  }

  private async _getFallbackParser(): Promise<import('./robots-parser.js').RobotsParser> {
    if (!this.fallbackParser) {
      const { RobotsParser } = await import('./robots-parser.js');
      this.fallbackParser = new RobotsParser(this.config);
    }
    return this.fallbackParser;
  }

  setFetcher(fetcher: (url: string) => Promise<string>): void {
    this.fetcher = fetcher;
    if (this.fallbackParser) {
      this.fallbackParser.setFetcher(fetcher);
    }
  }

  async isAllowed(url: string): Promise<RobotsCheckResult> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      const fallback = await this._getFallbackParser();
      return fallback.isAllowed(url);
    }

    try {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      const path = urlObj.pathname + urlObj.search;

      const cached = await this._getCachedOrFetch(domain);

      if (!cached.parseResult) {
        return { allowed: this.config.defaultAllow, source: 'no-robots-txt' };
      }

      const allowed = this.isPathAllowed!(cached.parseResult, path, this.config.userAgent);
      const crawlDelay = this._getCrawlDelayFromParseResult(cached.parseResult);
      const matchedRule = this._findMatchedRule(cached.parseResult, path);

      return {
        allowed,
        crawlDelay,
        source: 'robots-txt',
        matchedRule
      };

    } catch (error) {
      return {
        allowed: this.config.defaultAllow,
        source: 'error',
        error: (error as Error).message
      };
    }
  }

  private async _getCachedOrFetch(domain: string): Promise<CacheEntry> {
    const cached = this.cache.get(domain);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return cached;
    }

    const robotsUrl = `${domain}/robots.txt`;
    let content: string | null = null;

    try {
      if (this.fetcher) {
        content = await this.fetcher(robotsUrl);
      } else {
        content = await this._fetchRobotsTxt(robotsUrl);
      }
    } catch {
      const entry: CacheEntry = {
        parseResult: null,
        validationResult: null,
        timestamp: Date.now()
      };
      this.cache.set(domain, entry);
      return entry;
    }

    const parseResult = this.parseRobotsTxt!(content);
    const validationResult = this.validateRobotsTxt!(content, domain);

    const entry: CacheEntry = {
      parseResult,
      validationResult,
      timestamp: Date.now()
    };

    this.cache.set(domain, entry);
    return entry;
  }

  private async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      const baseConfig = this._context
        ? this._context.getHttpClientConfig('https://example.com')
        : {
            headers: {
              'User-Agent': this.config.userAgent
            }
          };

      this._httpClient = await createHttpClient({
        ...baseConfig,
        timeout: this.config.fetchTimeout,
        retry: {
          maxAttempts: 2,
          delay: 500,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      }) as unknown as HttpClient;
    }
    return this._httpClient;
  }

  private async _fetchRobotsTxt(url: string): Promise<string> {
    const client = await this._getHttpClient();
    const response = await client.get(url);

    if (this._context) {
      this._context.processResponse(
        response as unknown as Parameters<typeof this._context.processResponse>[0],
        url
      );
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  }

  private _getCrawlDelayFromParseResult(parseResult: ReckerRobotsParseResult): number | null {
    const userAgentLower = this.config.userAgent.toLowerCase();

    for (const block of parseResult.userAgentBlocks) {
      const agents = block.userAgents.map(a => a.toLowerCase());

      if (agents.includes(userAgentLower)) {
        return block.crawlDelay ? block.crawlDelay * 1000 : null;
      }
    }

    for (const block of parseResult.userAgentBlocks) {
      const agents = block.userAgents.map(a => a.toLowerCase());

      for (const agent of agents) {
        if (agent !== '*' && (agent.includes(userAgentLower) || userAgentLower.includes(agent))) {
          return block.crawlDelay ? block.crawlDelay * 1000 : null;
        }
      }
    }

    for (const block of parseResult.userAgentBlocks) {
      if (block.userAgents.map(a => a.toLowerCase()).includes('*')) {
        return block.crawlDelay ? block.crawlDelay * 1000 : null;
      }
    }

    return null;
  }

  private _findMatchedRule(parseResult: ReckerRobotsParseResult, path: string): string | undefined {
    const userAgentLower = this.config.userAgent.toLowerCase();

    let targetBlock: ReckerRobotsParseResult['userAgentBlocks'][0] | null = null;

    for (const block of parseResult.userAgentBlocks) {
      const agents = block.userAgents.map(a => a.toLowerCase());
      if (agents.includes(userAgentLower)) {
        targetBlock = block;
        break;
      }
    }

    if (!targetBlock) {
      for (const block of parseResult.userAgentBlocks) {
        const agents = block.userAgents.map(a => a.toLowerCase());
        for (const agent of agents) {
          if (agent !== '*' && (agent.includes(userAgentLower) || userAgentLower.includes(agent))) {
            targetBlock = block;
            break;
          }
        }
        if (targetBlock) break;
      }
    }

    if (!targetBlock) {
      for (const block of parseResult.userAgentBlocks) {
        if (block.userAgents.map(a => a.toLowerCase()).includes('*')) {
          targetBlock = block;
          break;
        }
      }
    }

    if (!targetBlock) return undefined;

    const sortedRules = [...targetBlock.rules].sort((a, b) => {
      const lenA = a.path.replace(/\*/g, '').length;
      const lenB = b.path.replace(/\*/g, '').length;
      return lenB - lenA;
    });

    for (const rule of sortedRules) {
      if (this._pathMatches(path, rule.path)) {
        return rule.path;
      }
    }

    return undefined;
  }

  private _pathMatches(path: string, pattern: string): boolean {
    let escaped = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&');
    escaped = escaped.replace(/\*/g, '.*');

    if (escaped.endsWith('$')) {
      escaped = escaped.slice(0, -1) + '$';
    } else {
      escaped = escaped + '.*';
    }

    const regex = new RegExp(`^${escaped}$`, 'i');
    return regex.test(path);
  }

  async getSitemaps(domain: string): Promise<string[]> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      const fallback = await this._getFallbackParser();
      return fallback.getSitemaps(domain);
    }

    const cached = await this._getCachedOrFetch(domain);
    return cached.parseResult?.sitemaps || [];
  }

  async getCrawlDelay(domain: string): Promise<number | null> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      const fallback = await this._getFallbackParser();
      return fallback.getCrawlDelay(domain);
    }

    const cached = await this._getCachedOrFetch(domain);
    if (!cached.parseResult) return null;

    return this._getCrawlDelayFromParseResult(cached.parseResult);
  }

  async preload(domain: string): Promise<void> {
    await this._getCachedOrFetch(domain);
  }

  clearCache(domain?: string): void {
    if (domain) {
      this.cache.delete(domain);
    } else {
      this.cache.clear();
    }
  }

  getCacheStats(): CacheStats {
    return {
      size: this.cache.size,
      domains: [...this.cache.keys()]
    };
  }

  async validate(url: string): Promise<RobotsValidationDetails | null> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      return null;
    }

    try {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      const cached = await this._getCachedOrFetch(domain);

      if (!cached.validationResult || !cached.parseResult) {
        return null;
      }

      return {
        valid: cached.validationResult.valid,
        issues: cached.validationResult.issues,
        blocksAllRobots: cached.parseResult.blocksAllRobots,
        blocksImportantPaths: cached.parseResult.blocksImportantPaths,
        host: cached.parseResult.host,
        size: cached.parseResult.size
      };
    } catch {
      return null;
    }
  }

  async validateContent(content: string, baseUrl?: string): Promise<ReckerRobotsValidationResult | null> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable || !this.validateRobotsTxt) {
      return null;
    }

    return this.validateRobotsTxt(content, baseUrl);
  }

  parseContent(content: string): ReckerRobotsParseResult | null {
    if (!this.reckerAvailable || !this.parseRobotsTxt) {
      return null;
    }

    return this.parseRobotsTxt(content);
  }

  getBlockingStatus(domain: string): {
    blocksAllRobots: boolean;
    blocksImportantPaths: boolean;
  } | null {
    const cached = this.cache.get(domain);
    if (!cached?.parseResult) return null;

    return {
      blocksAllRobots: cached.parseResult.blocksAllRobots,
      blocksImportantPaths: cached.parseResult.blocksImportantPaths
    };
  }

  getHost(domain: string): string | null {
    const cached = this.cache.get(domain);
    return cached?.parseResult?.host || null;
  }

  async getValidationIssues(domain: string): Promise<ReckerRobotsValidationIssue[]> {
    const cached = await this._getCachedOrFetch(domain);
    return cached.validationResult?.issues || [];
  }

  isReckerEnabled(): boolean {
    return this.reckerAvailable === true;
  }
}

export default ReckerRobotsValidator;
