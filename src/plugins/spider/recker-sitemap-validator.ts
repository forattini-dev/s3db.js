import { gunzipSync } from 'zlib';
import { createHttpClient } from '#src/concerns/http-client.js';
import type { CrawlContext } from './crawl-context.js';
import type {
  SitemapParserConfig,
  SitemapEntry,
  SitemapImage,
  SitemapVideo,
  ParseOptions,
  SitemapStats,
  ProbeResult,
  FetcherResult
} from './sitemap-parser.js';

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

type ReckerParseSitemap = (content: string, compressed?: boolean) => ReckerSitemapParseResult;
type ReckerValidateSitemap = (content: string, baseUrl?: string) => ReckerSitemapValidationResult;
type ReckerDiscoverSitemaps = (
  baseUrl: string,
  robotsTxtContent?: string,
  fetcher?: (url: string) => Promise<{ status: number; text: string }>
) => Promise<string[]>;
type ReckerFetchAndValidateSitemap = (
  url: string,
  fetcher?: (url: string) => Promise<{ status: number; text: string; headers?: Record<string, string> }>
) => Promise<ReckerSitemapValidationResult & { exists: boolean; status?: number }>;

interface CacheEntry {
  entries: SitemapEntry[];
  parseResult: ReckerSitemapParseResult | null;
  validationResult: ReckerSitemapValidationResult | null;
  timestamp: number;
  format: string;
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

export class ReckerSitemapValidator {
  private config: Required<Omit<SitemapParserConfig, 'context' | 'fetcher'>> & {
    context: CrawlContext | null;
    fetcher: ((url: string) => Promise<FetcherResult>) | null;
  };
  private _context: CrawlContext | null;
  private cache: Map<string, CacheEntry>;
  private fetcher: ((url: string) => Promise<FetcherResult>) | null;
  private _httpClient: HttpClient | null;
  private stats: {
    sitemapsParsed: number;
    urlsExtracted: number;
    errors: number;
  };

  private reckerAvailable: boolean | null = null;
  private parseSitemap: ReckerParseSitemap | null = null;
  private validateSitemap: ReckerValidateSitemap | null = null;
  private discoverSitemaps: ReckerDiscoverSitemaps | null = null;
  private fetchAndValidateSitemap: ReckerFetchAndValidateSitemap | null = null;
  private fallbackParser: import('./sitemap-parser.js').SitemapParser | null = null;

  constructor(config: SitemapParserConfig = {}) {
    this.config = {
      userAgent: config.userAgent || 's3db-spider',
      fetchTimeout: config.fetchTimeout || 30000,
      maxSitemaps: config.maxSitemaps || 50,
      maxUrls: config.maxUrls || 50000,
      followSitemapIndex: config.followSitemapIndex !== false,
      cacheTimeout: config.cacheTimeout || 3600000,
      context: config.context || null,
      fetcher: config.fetcher || null
    };

    this._context = this.config.context;
    this.cache = new Map();
    this.fetcher = this.config.fetcher;
    this._httpClient = null;

    this.stats = {
      sitemapsParsed: 0,
      urlsExtracted: 0,
      errors: 0
    };
  }

  private async _checkReckerAvailability(): Promise<boolean> {
    if (this.reckerAvailable !== null) {
      return this.reckerAvailable;
    }

    try {
      const sitemapModule = await import('recker/seo/validators/sitemap');
      this.parseSitemap = sitemapModule.parseSitemap;
      this.validateSitemap = sitemapModule.validateSitemap;
      this.discoverSitemaps = sitemapModule.discoverSitemaps;
      this.fetchAndValidateSitemap = sitemapModule.fetchAndValidateSitemap;
      this.reckerAvailable = true;
      return true;
    } catch {
      this.reckerAvailable = false;
      return false;
    }
  }

  private async _getFallbackParser(): Promise<import('./sitemap-parser.js').SitemapParser> {
    if (!this.fallbackParser) {
      const { SitemapParser } = await import('./sitemap-parser.js');
      this.fallbackParser = new SitemapParser(this.config);
    }
    return this.fallbackParser;
  }

  setFetcher(fetcher: (url: string) => Promise<FetcherResult>): void {
    this.fetcher = fetcher;
    if (this.fallbackParser) {
      this.fallbackParser.setFetcher(fetcher);
    }
  }

  async parse(sitemapUrl: string, options: ParseOptions = {}): Promise<SitemapEntry[]> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      const fallback = await this._getFallbackParser();
      return fallback.parse(sitemapUrl, options);
    }

    const opts = {
      recursive: options.recursive !== false,
      maxDepth: options.maxDepth || 3,
      _depth: options._depth || 0
    };

    const cached = this.cache.get(sitemapUrl);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return cached.entries;
    }

    if (opts._depth > opts.maxDepth) {
      return [];
    }

    if (this.stats.urlsExtracted >= this.config.maxUrls) {
      return [];
    }

    try {
      const { content, compressed } = await this._fetch(sitemapUrl);

      const parseResult = this.parseSitemap!(content, compressed);
      const validationResult = this.validateSitemap!(content, sitemapUrl);

      let entries: SitemapEntry[] = [];

      if (parseResult.type === 'sitemapindex' && opts.recursive) {
        entries = await this._parseReckerIndex(parseResult, opts);
      } else {
        entries = this._mapReckerUrlsToEntries(parseResult.urls, 'sitemap');
      }

      this.stats.sitemapsParsed++;
      this.stats.urlsExtracted += entries.length;

      const cacheEntry: CacheEntry = {
        entries,
        parseResult,
        validationResult,
        timestamp: Date.now(),
        format: parseResult.type
      };
      this.cache.set(sitemapUrl, cacheEntry);

      return entries;

    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  private async _parseReckerIndex(
    parseResult: ReckerSitemapParseResult,
    opts: { recursive: boolean; maxDepth: number; _depth: number }
  ): Promise<SitemapEntry[]> {
    if (!opts.recursive) {
      return parseResult.sitemaps.map(s => ({
        url: s.loc,
        lastmod: s.lastmod || null,
        source: 'sitemap-index',
        type: 'sitemap'
      }));
    }

    const allEntries: SitemapEntry[] = [];
    const sitemapsToProcess = parseResult.sitemaps.slice(0, this.config.maxSitemaps);

    for (const sitemap of sitemapsToProcess) {
      if (this.stats.urlsExtracted >= this.config.maxUrls) break;

      try {
        const entries = await this.parse(sitemap.loc, {
          ...opts,
          _depth: opts._depth + 1
        });
        allEntries.push(...entries);
      } catch {
        this.stats.errors++;
      }
    }

    return allEntries;
  }

  private _mapReckerUrlsToEntries(urls: ReckerSitemapUrl[], source: string): SitemapEntry[] {
    return urls.slice(0, this.config.maxUrls - this.stats.urlsExtracted).map(url => {
      const entry: SitemapEntryExtended = {
        url: url.loc,
        lastmod: url.lastmod || null,
        changefreq: url.changefreq || null,
        priority: url.priority ?? null,
        source,
        images: url.images?.map(img => ({
          url: img.loc,
          title: img.title || null,
          caption: img.caption || null
        })) as SitemapImage[],
        videos: url.videos?.map(vid => ({
          url: vid.contentLoc || vid.playerLoc || null,
          thumbnailUrl: vid.thumbnailLoc || null,
          title: vid.title || null,
          description: vid.description || null
        })) as SitemapVideo[]
      };

      if (url.news) {
        entry.news = url.news;
      }

      if (url.alternates && url.alternates.length > 0) {
        entry.alternates = url.alternates;
      }

      return entry;
    });
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
          delay: 1000,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      }) as unknown as HttpClient;
    }
    return this._httpClient;
  }

  private async _fetch(url: string): Promise<{ content: string; compressed: boolean }> {
    let content: string | Buffer;
    let compressed = false;

    if (this.fetcher) {
      const result = await this.fetcher(url);
      content = result.content || (result as unknown as string);
    } else {
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

      const contentType = response.headers.get('content-type') || '';

      if (url.endsWith('.gz') || contentType.includes('gzip')) {
        const buffer = await response.arrayBuffer();
        content = this._decompress(Buffer.from(buffer));
        compressed = true;
      } else {
        content = await response.text();
      }
    }

    if (Buffer.isBuffer(content)) {
      if (content[0] === 0x1f && content[1] === 0x8b) {
        content = this._decompress(content);
        compressed = true;
      } else {
        content = content.toString('utf-8');
      }
    }

    return { content: content as string, compressed };
  }

  private _decompress(buffer: Buffer): string {
    try {
      return gunzipSync(buffer).toString('utf-8');
    } catch (error) {
      throw new Error(`Failed to decompress gzip: ${(error as Error).message}`);
    }
  }

  getStats(): SitemapStats {
    return {
      ...this.stats,
      cacheSize: this.cache.size
    };
  }

  clearCache(url?: string): void {
    if (url) {
      this.cache.delete(url);
    } else {
      this.cache.clear();
    }
  }

  resetStats(): void {
    this.stats = {
      sitemapsParsed: 0,
      urlsExtracted: 0,
      errors: 0
    };
  }

  async discoverFromRobotsTxt(robotsTxtUrl: string): Promise<string[]> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      const fallback = await this._getFallbackParser();
      return fallback.discoverFromRobotsTxt(robotsTxtUrl);
    }

    try {
      const baseUrl = new URL(robotsTxtUrl).origin;
      const { content } = await this._fetch(robotsTxtUrl);

      return await this.discoverSitemaps!(baseUrl, content, async (url) => {
        const { content: text } = await this._fetch(url);
        return { status: 200, text };
      });
    } catch {
      return [];
    }
  }

  async probeCommonLocations(baseUrl: string): Promise<ProbeResult[]> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      const fallback = await this._getFallbackParser();
      return fallback.probeCommonLocations(baseUrl);
    }

    const commonPaths = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap.xml.gz',
      '/sitemaps/sitemap.xml',
      '/sitemap.txt',
      '/feed.xml',
      '/rss.xml',
      '/atom.xml',
      '/feed',
      '/rss'
    ];

    const results: ProbeResult[] = [];

    for (const path of commonPaths) {
      const url = baseUrl.replace(/\/$/, '') + path;

      try {
        const { content, compressed } = await this._fetch(url);
        const parseResult = this.parseSitemap!(content, compressed);

        results.push({
          url,
          exists: true,
          format: parseResult.type
        });
      } catch {
        results.push({
          url,
          exists: false
        });
      }
    }

    return results;
  }

  async validate(sitemapUrl: string): Promise<SitemapValidationDetails | null> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      return null;
    }

    try {
      let cached = this.cache.get(sitemapUrl);

      if (!cached || Date.now() - cached.timestamp >= this.config.cacheTimeout) {
        await this.parse(sitemapUrl);
        cached = this.cache.get(sitemapUrl);
      }

      if (!cached?.validationResult || !cached?.parseResult) {
        return null;
      }

      return {
        valid: cached.validationResult.valid,
        issues: cached.validationResult.issues,
        type: cached.parseResult.type,
        urlCount: cached.parseResult.urlCount,
        size: cached.parseResult.size,
        compressed: cached.parseResult.compressed,
        errors: cached.parseResult.errors,
        warnings: cached.parseResult.warnings
      };
    } catch {
      return null;
    }
  }

  async validateContent(content: string, baseUrl?: string): Promise<ReckerSitemapValidationResult | null> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable || !this.validateSitemap) {
      return null;
    }

    return this.validateSitemap(content, baseUrl);
  }

  parseContent(content: string, compressed?: boolean): ReckerSitemapParseResult | null {
    if (!this.reckerAvailable || !this.parseSitemap) {
      return null;
    }

    return this.parseSitemap(content, compressed);
  }

  async getValidationIssues(sitemapUrl: string): Promise<ReckerSitemapValidationIssue[]> {
    const validation = await this.validate(sitemapUrl);
    return validation?.issues || [];
  }

  async getNewsEntries(sitemapUrl: string): Promise<SitemapEntryExtended[]> {
    const entries = await this.parse(sitemapUrl);
    return (entries as SitemapEntryExtended[]).filter(e => e.news);
  }

  async getAlternateLanguages(sitemapUrl: string): Promise<Map<string, SitemapEntryExtended[]>> {
    const entries = await this.parse(sitemapUrl);
    const byLanguage = new Map<string, SitemapEntryExtended[]>();

    for (const entry of entries as SitemapEntryExtended[]) {
      if (entry.alternates) {
        for (const alt of entry.alternates) {
          const lang = alt.hreflang;
          if (!byLanguage.has(lang)) {
            byLanguage.set(lang, []);
          }
          byLanguage.get(lang)!.push(entry);
        }
      }
    }

    return byLanguage;
  }

  async discoverAll(baseUrl: string): Promise<{
    fromRobots: string[];
    fromProbing: ProbeResult[];
    all: string[];
  }> {
    const robotsTxtUrl = `${baseUrl.replace(/\/$/, '')}/robots.txt`;

    const [fromRobots, fromProbing] = await Promise.all([
      this.discoverFromRobotsTxt(robotsTxtUrl),
      this.probeCommonLocations(baseUrl)
    ]);

    const foundFromProbing = fromProbing
      .filter(p => p.exists)
      .map(p => p.url);

    const all = [...new Set([...fromRobots, ...foundFromProbing])];

    return {
      fromRobots,
      fromProbing,
      all
    };
  }

  isReckerEnabled(): boolean {
    return this.reckerAvailable === true;
  }
}

export default ReckerSitemapValidator;
