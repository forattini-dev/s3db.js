import { gunzipSync } from 'zlib';
import { createHttpClient } from '#src/concerns/http-client.js';
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

type SitemapFormat = 'xml-sitemap' | 'xml-index' | 'text' | 'rss' | 'atom' | 'unknown';

export class SitemapParser {
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

  constructor(config: SitemapParserConfig = {}) {
    this.config = {
      userAgent: config.userAgent || 's3db-spider',
      fetchTimeout: config.fetchTimeout || 30000,
      maxSitemaps: config.maxSitemaps || 50,
      maxUrls: config.maxUrls || 50000,
      followSitemapIndex: config.followSitemapIndex !== false,
      cacheTimeout: config.cacheTimeout || 3600000,
      context: config.context || null,
      ...config
    };

    this._context = this.config.context || null;
    this.cache = new Map();
    this.fetcher = config.fetcher || null;
    this._httpClient = null;

    this.stats = {
      sitemapsParsed: 0,
      urlsExtracted: 0,
      errors: 0
    };
  }

  setFetcher(fetcher: (url: string) => Promise<FetcherResult>): void {
    this.fetcher = fetcher;
  }

  async parse(sitemapUrl: string, options: ParseOptions = {}): Promise<SitemapEntry[]> {
    const opts: ParseOptions & { _depth: number } = {
      recursive: options.recursive !== false,
      maxDepth: options.maxDepth || 3,
      _depth: options._depth || 0
    };

    const cached = this.cache.get(sitemapUrl);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return cached.entries;
    }

    if (opts._depth > opts.maxDepth!) {
      return [];
    }

    if (this.stats.urlsExtracted >= this.config.maxUrls) {
      return [];
    }

    try {
      const { content, contentType } = await this._fetch(sitemapUrl);

      const format = this._detectFormat(sitemapUrl, content, contentType);
      let entries: SitemapEntry[] = [];

      switch (format) {
        case 'xml-sitemap':
          entries = this._parseXmlSitemap(content);
          break;
        case 'xml-index':
          entries = await this._parseXmlIndex(content, opts);
          break;
        case 'text':
          entries = this._parseTextSitemap(content);
          break;
        case 'rss':
          entries = this._parseRssFeed(content);
          break;
        case 'atom':
          entries = this._parseAtomFeed(content);
          break;
        default:
          throw new Error(`Unknown sitemap format: ${format}`);
      }

      this.stats.sitemapsParsed++;
      this.stats.urlsExtracted += entries.length;

      this.cache.set(sitemapUrl, { entries, timestamp: Date.now(), format });

      return entries;

    } catch (error) {
      this.stats.errors++;
      throw error;
    }
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

  private async _fetch(url: string): Promise<{ content: string; contentType: string }> {
    let content: string | Buffer;
    let contentType: string;

    if (this.fetcher) {
      const result = await this.fetcher(url);
      content = (result as FetcherResult).content || (result as unknown as string);
      contentType = (result as FetcherResult).contentType || '';
    } else {
      const client = await this._getHttpClient();
      const response = await client.get(url);

      if (this._context) {
        this._context.processResponse(response as unknown as Parameters<typeof this._context.processResponse>[0], url);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      contentType = response.headers.get('content-type') || '';

      if (url.endsWith('.gz') || contentType.includes('gzip')) {
        const buffer = await response.arrayBuffer();
        content = this._decompress(Buffer.from(buffer));
      } else {
        content = await response.text();
      }
    }

    if (Buffer.isBuffer(content)) {
      if (content[0] === 0x1f && content[1] === 0x8b) {
        content = this._decompress(content);
      } else {
        content = content.toString('utf-8');
      }
    }

    return { content: content as string, contentType: contentType || '' };
  }

  private _decompress(buffer: Buffer): string {
    try {
      return gunzipSync(buffer).toString('utf-8');
    } catch (error) {
      throw new Error(`Failed to decompress gzip: ${(error as Error).message}`);
    }
  }

  private _detectFormat(url: string, content: string, contentType: string = ''): SitemapFormat {
    const contentLower = content.trim().toLowerCase();
    const urlLower = url.toLowerCase();

    if (contentLower.includes('<sitemapindex')) {
      return 'xml-index';
    }

    if (contentLower.includes('<urlset')) {
      return 'xml-sitemap';
    }

    if (contentLower.includes('<rss') || contentLower.includes('<channel>')) {
      return 'rss';
    }

    if (contentLower.includes('<feed') && contentLower.includes('xmlns="http://www.w3.org/2005/atom"')) {
      return 'atom';
    }
    if (contentLower.includes('<feed') && contentLower.includes('atom')) {
      return 'atom';
    }

    if (urlLower.endsWith('.txt')) {
      return 'text';
    }
    if (urlLower.endsWith('.rss')) {
      return 'rss';
    }
    if (urlLower.endsWith('.atom')) {
      return 'atom';
    }

    if (contentType.includes('rss')) {
      return 'rss';
    }
    if (contentType.includes('atom')) {
      return 'atom';
    }

    if (this._looksLikeTextSitemap(content)) {
      return 'text';
    }

    return 'unknown';
  }

  private _looksLikeTextSitemap(content: string): boolean {
    const lines = content.trim().split(/\r?\n/).slice(0, 10);
    const urlCount = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('http://') || trimmed.startsWith('https://');
    }).length;

    return urlCount >= lines.length * 0.5;
  }

  private _parseXmlSitemap(content: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];

    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(content)) !== null) {
      const urlBlock = match[1];
      if (!urlBlock) continue;
      const entry = this._parseUrlBlock(urlBlock as string);

      if (entry && entry.url) {
        entries.push(entry);

        if (entries.length >= this.config.maxUrls) break;
      }
    }

    return entries;
  }

  private _parseUrlBlock(block: string): SitemapEntry {
    const loc = this._extractTag(block, 'loc');
    const entry: SitemapEntry = {
      url: loc ?? '',
      lastmod: this._extractTag(block, 'lastmod'),
      changefreq: this._extractTag(block, 'changefreq'),
      priority: null,
      source: 'sitemap'
    };

    const priorityStr = this._extractTag(block, 'priority');
    if (priorityStr) {
      entry.priority = parseFloat(priorityStr);
    }

    const images = this._extractImages(block);
    if (images.length > 0) {
      entry.images = images;
    }

    const videos = this._extractVideos(block);
    if (videos.length > 0) {
      entry.videos = videos;
    }

    return entry;
  }

  private _extractTag(xml: string, tagName: string): string | null {
    const patterns = [
      new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i'),
      new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([^\\]]*?)\\]\\]></${tagName}>`, 'i'),
      new RegExp(`<[^:]+:${tagName}>([^<]*)</[^:]+:${tagName}>`, 'i')
    ];

    for (const pattern of patterns) {
      const match = xml.match(pattern);
      if (match) {
        return this._decodeXmlEntities(match[1]!.trim());
      }
    }

    return null;
  }

  private _extractImages(block: string): SitemapImage[] {
    const images: SitemapImage[] = [];
    const imageRegex = /<image:image>([\s\S]*?)<\/image:image>/gi;
    let match: RegExpExecArray | null;

    while ((match = imageRegex.exec(block)) !== null) {
      const imageBlock = match[1]!;
      const image: SitemapImage = {
        url: this._extractTag(imageBlock, 'loc') || this._extractTag(imageBlock, 'image:loc'),
        title: this._extractTag(imageBlock, 'title') || this._extractTag(imageBlock, 'image:title'),
        caption: this._extractTag(imageBlock, 'caption') || this._extractTag(imageBlock, 'image:caption')
      };

      if (image.url) {
        images.push(image);
      }
    }

    return images;
  }

  private _extractVideos(block: string): SitemapVideo[] {
    const videos: SitemapVideo[] = [];
    const videoRegex = /<video:video>([\s\S]*?)<\/video:video>/gi;
    let match: RegExpExecArray | null;

    while ((match = videoRegex.exec(block)) !== null) {
      const videoBlock = match[1]!;
      const video: SitemapVideo = {
        url: this._extractTag(videoBlock, 'content_loc') || this._extractTag(videoBlock, 'video:content_loc'),
        thumbnailUrl: this._extractTag(videoBlock, 'thumbnail_loc') || this._extractTag(videoBlock, 'video:thumbnail_loc'),
        title: this._extractTag(videoBlock, 'title') || this._extractTag(videoBlock, 'video:title'),
        description: this._extractTag(videoBlock, 'description') || this._extractTag(videoBlock, 'video:description')
      };

      if (video.url || video.thumbnailUrl) {
        videos.push(video);
      }
    }

    return videos;
  }

  private async _parseXmlIndex(content: string, opts: ParseOptions & { _depth: number }): Promise<SitemapEntry[]> {
    const sitemapUrls: { url: string; lastmod: string | null }[] = [];

    const sitemapRegex = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
    let match: RegExpExecArray | null;

    while ((match = sitemapRegex.exec(content)) !== null) {
      const sitemapBlock = match[1]!;
      const loc = this._extractTag(sitemapBlock, 'loc');
      const lastmod = this._extractTag(sitemapBlock, 'lastmod');

      if (loc) {
        sitemapUrls.push({ url: loc, lastmod });
      }

      if (sitemapUrls.length >= this.config.maxSitemaps) break;
    }

    if (!opts.recursive) {
      return sitemapUrls.map(s => ({
        url: s.url,
        lastmod: s.lastmod,
        source: 'sitemap-index',
        type: 'sitemap'
      }));
    }

    const allEntries: SitemapEntry[] = [];

    for (const sitemap of sitemapUrls) {
      if (this.stats.urlsExtracted >= this.config.maxUrls) break;

      try {
        const entries = await this.parse(sitemap.url, {
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

  private _parseTextSitemap(content: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const url = line.trim();

      if (!url || url.startsWith('#')) continue;

      if (url.startsWith('http://') || url.startsWith('https://')) {
        entries.push({
          url,
          source: 'sitemap-txt'
        });

        if (entries.length >= this.config.maxUrls) break;
      }
    }

    return entries;
  }

  private _parseRssFeed(content: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(content)) !== null) {
      const itemBlock = match[1]!;

      const url = this._extractTag(itemBlock, 'link');
      const title = this._extractTag(itemBlock, 'title');
      const pubDate = this._extractTag(itemBlock, 'pubDate');
      const description = this._extractTag(itemBlock, 'description');

      if (url) {
        entries.push({
          url,
          title,
          lastmod: pubDate ? this._parseDate(pubDate) : null,
          description: description ? description.slice(0, 200) : null,
          source: 'rss'
        });

        if (entries.length >= this.config.maxUrls) break;
      }
    }

    return entries;
  }

  private _parseAtomFeed(content: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(content)) !== null) {
      const entryBlock = match[1]!;

      const linkMatch = entryBlock.match(/<link[^>]+href=["']([^"']+)["'][^>]*(?:rel=["']alternate["'][^>]*)?(?:\/>|>)/i);
      const url = linkMatch ? linkMatch[1] : null;

      const title = this._extractTag(entryBlock, 'title');
      const updated = this._extractTag(entryBlock, 'updated');
      const published = this._extractTag(entryBlock, 'published');
      const summary = this._extractTag(entryBlock, 'summary');

      if (url) {
        entries.push({
          url: this._decodeXmlEntities(url),
          title,
          lastmod: updated || published || null,
          description: summary ? summary.slice(0, 200) : null,
          source: 'atom'
        });

        if (entries.length >= this.config.maxUrls) break;
      }
    }

    return entries;
  }

  private _decodeXmlEntities(str: string | null): string {
    if (!str) return '';

    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
  }

  private _parseDate(dateStr: string | null): string | null {
    if (!dateStr) return null;

    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toISOString();
    } catch {
      return dateStr;
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
    try {
      const { content } = await this._fetch(robotsTxtUrl);
      const sitemaps: string[] = [];

      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*sitemap:\s*(.+)/i);
        if (match) {
          sitemaps.push(match[1]!.trim());
        }
      }

      return sitemaps;
    } catch {
      return [];
    }
  }

  async probeCommonLocations(baseUrl: string): Promise<ProbeResult[]> {
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
        const { content, contentType } = await this._fetch(url);
        const format = this._detectFormat(url, content, contentType);

        results.push({
          url,
          exists: true,
          format
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
}

export default SitemapParser;
