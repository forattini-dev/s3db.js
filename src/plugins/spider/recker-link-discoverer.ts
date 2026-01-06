import type { URLPatternMatcher, MatchResult } from './url-pattern-matcher.js';
import { ReckerRobotsValidator } from './recker-robots-validator.js';
import { ReckerSitemapValidator } from './recker-sitemap-validator.js';
import type {
  LinkDiscovererConfig,
  DiscoveredLink,
  RobotsCheckResult,
  DiscoveryStats,
  SitemapDiscoveryOptions,
  ResetOptions
} from './link-discoverer.js';

type ReckerExtractedLink = {
  href: string;
  text: string;
  rel?: string;
  target?: string;
  title?: string;
  type?: 'internal' | 'external' | 'anchor' | 'mailto' | 'tel';
  hasImage?: boolean;
  hasImageWithAlt?: boolean;
  hasSvg?: boolean;
  hasSvgWithTitle?: boolean;
  ariaLabel?: string;
};

type ReckerHTMLElement = {
  querySelectorAll(selector: string): ReckerHTMLElement[];
  getAttribute(name: string): string | null;
  textContent: string | null;
};

type ReckerParse = (html: string) => ReckerHTMLElement;
type ReckerExtractLinks = (
  root: ReckerHTMLElement,
  options?: { selector?: string; absolute?: boolean; baseUrl?: string }
) => ReckerExtractedLink[];

export class ReckerLinkDiscoverer {
  private config: Required<Omit<LinkDiscovererConfig, 'robotsFetcher' | 'sitemapFetcher' | 'followRegex' | 'ignoreRegex'>> & {
    followRegex: RegExp | null;
    ignoreRegex: RegExp | null;
  };
  private patternMatcher: URLPatternMatcher | null;
  private robotsValidator: ReckerRobotsValidator | null;
  private sitemapValidator: ReckerSitemapValidator | null;
  private discovered: Set<string>;
  private queued: Set<string>;
  private blockedByRobots: Set<string>;
  private fromSitemap: Set<string>;

  private reckerAvailable: boolean | null = null;
  private parse: ReckerParse | null = null;
  private reckerExtractLinks: ReckerExtractLinks | null = null;
  private fallbackDiscoverer: import('./link-discoverer.js').LinkDiscoverer | null = null;

  constructor(config: LinkDiscovererConfig = {}) {
    this.config = {
      enabled: config.enabled !== false,
      maxDepth: config.maxDepth || 3,
      maxUrls: config.maxUrls || 1000,
      sameDomainOnly: config.sameDomainOnly !== false,
      includeSubdomains: config.includeSubdomains !== false,
      allowedDomains: config.allowedDomains || [],
      blockedDomains: config.blockedDomains || [],
      followPatterns: config.followPatterns || [],
      followRegex: config.followRegex || null,
      ignoreRegex: config.ignoreRegex || null,
      respectRobotsTxt: config.respectRobotsTxt !== false,
      ignoreQueryString: config.ignoreQueryString || false,
      ignoreHash: config.ignoreHash !== false,
      robotsUserAgent: config.robotsUserAgent || 's3db-spider',
      robotsCacheTimeout: config.robotsCacheTimeout || 3600000,
      useSitemaps: config.useSitemaps !== false,
      sitemapMaxUrls: config.sitemapMaxUrls || 10000,
      defaultIgnore: config.defaultIgnore || [
        /\.(css|js|json|xml|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i,
        /^mailto:/i,
        /^tel:/i,
        /^javascript:/i,
        /^#/,
        /\/login/i,
        /\/logout/i,
        /\/signin/i,
        /\/signout/i,
        /\/cart/i,
        /\/checkout/i,
        /\/account/i,
        /\/privacy/i,
        /\/terms/i,
        /\/cookie/i
      ]
    };

    this.patternMatcher = null;

    this.robotsValidator = config.respectRobotsTxt !== false
      ? new ReckerRobotsValidator({
          userAgent: this.config.robotsUserAgent,
          cacheTimeout: this.config.robotsCacheTimeout,
          fetcher: config.robotsFetcher || null
        })
      : null;

    this.sitemapValidator = config.useSitemaps !== false
      ? new ReckerSitemapValidator({
          userAgent: this.config.robotsUserAgent,
          maxUrls: this.config.sitemapMaxUrls
        })
      : null;

    this.discovered = new Set();
    this.queued = new Set();
    this.blockedByRobots = new Set();
    this.fromSitemap = new Set();
  }

  private async _checkReckerAvailability(): Promise<boolean> {
    if (this.reckerAvailable !== null) {
      return this.reckerAvailable;
    }

    try {
      const parserModule = await import('recker/scrape/parser');
      const extractorsModule = await import('recker/scrape/extractors');
      this.parse = parserModule.parse as unknown as ReckerParse;
      this.reckerExtractLinks = extractorsModule.extractLinks as unknown as ReckerExtractLinks;
      this.reckerAvailable = true;
      return true;
    } catch {
      // Fallback: try main module
      try {
        const recker = await import('recker');
        if (recker.parseHtmlSync && recker.extractLinks) {
          this.parse = recker.parseHtmlSync as unknown as ReckerParse;
          this.reckerExtractLinks = recker.extractLinks as unknown as ReckerExtractLinks;
          this.reckerAvailable = true;
          return true;
        }
      } catch {
        // Recker not available
      }
    }
    this.reckerAvailable = false;
    return false;
  }

  private async _getFallbackDiscoverer(): Promise<import('./link-discoverer.js').LinkDiscoverer> {
    if (!this.fallbackDiscoverer) {
      const { LinkDiscoverer } = await import('./link-discoverer.js');
      this.fallbackDiscoverer = new LinkDiscoverer(this.config);
    }
    return this.fallbackDiscoverer;
  }

  setPatternMatcher(matcher: URLPatternMatcher): void {
    this.patternMatcher = matcher;
    if (this.fallbackDiscoverer) {
      this.fallbackDiscoverer.setPatternMatcher(matcher);
    }
  }

  setRobotsFetcher(fetcher: (url: string) => Promise<string>): void {
    if (this.robotsValidator) {
      this.robotsValidator.setFetcher(fetcher);
    }
    if (this.fallbackDiscoverer) {
      this.fallbackDiscoverer.setRobotsFetcher(fetcher);
    }
  }

  extractLinksSync(html: string, baseUrl: string, currentDepth: number = 0): DiscoveredLink[] {
    if (!this.config.enabled) return [];
    if (currentDepth >= this.config.maxDepth) return [];
    if (this.discovered.size >= this.config.maxUrls) return [];

    if (!this.reckerAvailable || !this.parse || !this.reckerExtractLinks) {
      return this._extractLinksWithRegex(html, baseUrl, currentDepth);
    }

    return this._extractLinksWithRecker(html, baseUrl, currentDepth);
  }

  private _extractLinksWithRecker(html: string, baseUrl: string, currentDepth: number): DiscoveredLink[] {
    const links: DiscoveredLink[] = [];
    const baseUrlObj = new URL(baseUrl);

    try {
      const root = this.parse!(html);
      const extracted = this.reckerExtractLinks!(root, { baseUrl, absolute: true });

      for (const item of extracted) {
        if (!item.href || item.href.trim() === '') continue;
        if (item.type === 'anchor' || item.type === 'mailto' || item.type === 'tel') continue;

        try {
          const resolvedUrl = new URL(item.href, baseUrl);
          const normalizedUrl = this._normalizeUrl(resolvedUrl);

          if (this.discovered.has(normalizedUrl)) continue;
          if (!this._shouldFollow(resolvedUrl, baseUrlObj)) continue;

          let patternMatch: MatchResult | null = null;
          if (this.patternMatcher) {
            patternMatch = this.patternMatcher.match(normalizedUrl);
          }

          if (!this._shouldFollowPattern(patternMatch)) continue;

          this.discovered.add(normalizedUrl);

          links.push({
            url: normalizedUrl,
            anchorText: item.text || item.ariaLabel,
            depth: currentDepth + 1,
            sourceUrl: baseUrl,
            pattern: patternMatch?.pattern || null,
            params: patternMatch?.params || {},
            activities: patternMatch?.activities || [],
            metadata: {
              ...patternMatch?.metadata,
              discoveredFrom: baseUrl,
              depth: currentDepth + 1,
              anchorText: item.text,
              rel: item.rel,
              target: item.target,
              title: item.title,
              linkType: item.type,
              hasImage: item.hasImage,
              ariaLabel: item.ariaLabel
            }
          });

          if (this.discovered.size >= this.config.maxUrls) break;

        } catch {
          continue;
        }
      }

    } catch {
      return this._extractLinksWithRegex(html, baseUrl, currentDepth);
    }

    return links;
  }

  private _extractLinksWithRegex(html: string, baseUrl: string, currentDepth: number): DiscoveredLink[] {
    const links: DiscoveredLink[] = [];
    const baseUrlObj = new URL(baseUrl);

    const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = hrefRegex.exec(html)) !== null) {
      const url = match[1];
      const anchorText = match[2] ? match[2].trim() : '';

      if (!url || url.trim() === '') continue;
      if (url.startsWith('#')) continue;

      try {
        const resolvedUrl = new URL(url, baseUrl);
        const normalizedUrl = this._normalizeUrl(resolvedUrl);

        if (this.discovered.has(normalizedUrl)) continue;
        if (!this._shouldFollow(resolvedUrl, baseUrlObj)) continue;

        let patternMatch: MatchResult | null = null;
        if (this.patternMatcher) {
          patternMatch = this.patternMatcher.match(normalizedUrl);
        }

        if (!this._shouldFollowPattern(patternMatch)) continue;

        this.discovered.add(normalizedUrl);

        links.push({
          url: normalizedUrl,
          anchorText,
          depth: currentDepth + 1,
          sourceUrl: baseUrl,
          pattern: patternMatch?.pattern || null,
          params: patternMatch?.params || {},
          activities: patternMatch?.activities || [],
          metadata: {
            ...patternMatch?.metadata,
            discoveredFrom: baseUrl,
            depth: currentDepth + 1,
            anchorText
          }
        });

        if (this.discovered.size >= this.config.maxUrls) break;

      } catch {
        continue;
      }
    }

    return links;
  }

  async extractLinksAsync(html: string, baseUrl: string, currentDepth: number = 0): Promise<DiscoveredLink[]> {
    await this._checkReckerAvailability();

    const links = this.extractLinksSync(html, baseUrl, currentDepth);

    if (!this.robotsValidator || !this.config.respectRobotsTxt) {
      return links;
    }

    const results = await Promise.all(
      links.map(async (link) => {
        const result = await this.robotsValidator!.isAllowed(link.url);
        return { link, allowed: result.allowed, crawlDelay: result.crawlDelay };
      })
    );

    const allowedLinks: DiscoveredLink[] = [];
    for (const { link, allowed, crawlDelay } of results) {
      if (allowed) {
        if (crawlDelay) {
          link.metadata.crawlDelay = crawlDelay;
        }
        allowedLinks.push(link);
      } else {
        this.blockedByRobots.add(link.url);
      }
    }

    return allowedLinks;
  }

  async isAllowedByRobots(url: string): Promise<RobotsCheckResult> {
    if (!this.robotsValidator || !this.config.respectRobotsTxt) {
      return { allowed: true };
    }
    return await this.robotsValidator.isAllowed(url);
  }

  async preloadRobots(url: string): Promise<void> {
    if (!this.robotsValidator) return;

    try {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      await this.robotsValidator.preload(domain);
    } catch {
      // Invalid URL, ignore
    }
  }

  async getSitemaps(url: string): Promise<string[]> {
    if (!this.robotsValidator) return [];

    try {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      return await this.robotsValidator.getSitemaps(domain);
    } catch {
      return [];
    }
  }

  async discoverFromSitemaps(url: string, options: SitemapDiscoveryOptions = {}): Promise<DiscoveredLink[]> {
    if (!this.sitemapValidator) return [];

    const opts = {
      autoDiscover: options.autoDiscover !== false,
      sitemapUrls: options.sitemapUrls || [],
      checkRobots: options.checkRobots !== false
    };

    const sitemapUrls = [...opts.sitemapUrls];

    if (opts.autoDiscover) {
      try {
        const urlObj = new URL(url);
        const domain = `${urlObj.protocol}//${urlObj.host}`;
        const robotsSitemaps = await this.sitemapValidator.discoverFromRobotsTxt(`${domain}/robots.txt`);
        sitemapUrls.push(...robotsSitemaps);
      } catch {
        // Ignore errors
      }
    }

    if (sitemapUrls.length === 0) {
      try {
        const urlObj = new URL(url);
        const domain = `${urlObj.protocol}//${urlObj.host}`;
        sitemapUrls.push(`${domain}/sitemap.xml`);
      } catch {
        return [];
      }
    }

    const allEntries: Array<{
      url: string;
      source: string;
      lastmod?: string | null;
      changefreq?: string | null;
      priority?: number | null;
      title?: string | null;
    }> = [];
    const processedSitemaps = new Set<string>();

    for (const sitemapUrl of sitemapUrls) {
      if (processedSitemaps.has(sitemapUrl)) continue;
      processedSitemaps.add(sitemapUrl);

      try {
        const entries = await this.sitemapValidator.parse(sitemapUrl);
        allEntries.push(...entries);
      } catch {
        // Ignore individual sitemap errors
      }
    }

    const links: DiscoveredLink[] = [];
    const baseUrlObj = new URL(url);

    for (const entry of allEntries) {
      if (this.discovered.size >= this.config.maxUrls) break;
      if (!entry.url) continue;

      try {
        const entryUrl = new URL(entry.url);
        const normalizedUrl = this._normalizeUrl(entryUrl);

        if (this.discovered.has(normalizedUrl)) continue;
        if (!this._shouldFollow(entryUrl, baseUrlObj)) continue;

        if (opts.checkRobots && this.robotsValidator) {
          const robotsResult = await this.robotsValidator.isAllowed(normalizedUrl);
          if (!robotsResult.allowed) {
            this.blockedByRobots.add(normalizedUrl);
            continue;
          }
        }

        let patternMatch: MatchResult | null = null;
        if (this.patternMatcher) {
          patternMatch = this.patternMatcher.match(normalizedUrl);
        }

        if (!this._shouldFollowPattern(patternMatch)) continue;

        this.discovered.add(normalizedUrl);
        this.fromSitemap.add(normalizedUrl);

        links.push({
          url: normalizedUrl,
          depth: 0,
          sourceUrl: entry.source || 'sitemap',
          pattern: patternMatch?.pattern || null,
          params: patternMatch?.params || {},
          activities: patternMatch?.activities || [],
          metadata: {
            ...patternMatch?.metadata,
            fromSitemap: true,
            lastmod: entry.lastmod || null,
            changefreq: entry.changefreq || null,
            priority: entry.priority || null,
            title: entry.title || null
          }
        });

      } catch {
        // Invalid URL, skip
      }
    }

    return links;
  }

  async parseSitemap(
    sitemapUrl: string,
    options: Record<string, unknown> = {}
  ): Promise<Array<{ url?: string; [key: string]: unknown }>> {
    if (!this.sitemapValidator) return [];

    try {
      const entries = await this.sitemapValidator.parse(sitemapUrl, options);
      return entries as unknown as Array<{ url?: string; [key: string]: unknown }>;
    } catch {
      return [];
    }
  }

  async probeSitemapLocations(url: string): Promise<Array<{ url: string; exists: boolean; format?: string }>> {
    if (!this.sitemapValidator) return [];

    try {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      return await this.sitemapValidator.probeCommonLocations(domain);
    } catch {
      return [];
    }
  }

  private _normalizeUrl(urlObj: URL): string {
    let normalized = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.slice(0, -1);
    }

    if (!this.config.ignoreQueryString && urlObj.search) {
      const params = new URLSearchParams(urlObj.search);
      const sortedParams = new URLSearchParams([...params.entries()].sort());
      const queryString = sortedParams.toString();
      if (queryString) {
        normalized += '?' + queryString;
      }
    }

    return normalized;
  }

  private _shouldFollow(urlObj: URL, baseUrlObj: URL): boolean {
    for (const pattern of this.config.defaultIgnore) {
      if (pattern.test(urlObj.href)) return false;
    }

    if (this.config.ignoreRegex && this.config.ignoreRegex.test(urlObj.href)) {
      return false;
    }

    for (const blocked of this.config.blockedDomains) {
      if (urlObj.hostname.includes(blocked)) return false;
    }

    if (this.config.sameDomainOnly) {
      const baseDomain = this._getMainDomain(baseUrlObj.hostname);
      const linkDomain = this._getMainDomain(urlObj.hostname);

      if (this.config.includeSubdomains) {
        if (baseDomain !== linkDomain) return false;
      } else {
        if (baseUrlObj.hostname !== urlObj.hostname) return false;
      }
    }

    if (this.config.allowedDomains.length > 0) {
      const allowed = this.config.allowedDomains.some(domain =>
        urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
      );
      if (!allowed) return false;
    }

    if (this.config.followRegex && !this.config.followRegex.test(urlObj.href)) {
      return false;
    }

    return true;
  }

  private _shouldFollowPattern(patternMatch: MatchResult | null): boolean {
    if (!this.patternMatcher) return true;
    if (this.config.followPatterns.length === 0) return true;

    if (!patternMatch || patternMatch.isDefault) {
      return this.config.followPatterns.includes('default');
    }

    return this.config.followPatterns.includes(patternMatch.pattern);
  }

  private _getMainDomain(hostname: string): string {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }

  markQueued(url: string): void {
    this.queued.add(this._normalizeUrl(new URL(url)));
  }

  isQueued(url: string): boolean {
    try {
      return this.queued.has(this._normalizeUrl(new URL(url)));
    } catch {
      return false;
    }
  }

  getStats(): DiscoveryStats {
    return {
      discovered: this.discovered.size,
      queued: this.queued.size,
      blockedByRobots: this.blockedByRobots.size,
      fromSitemap: this.fromSitemap.size,
      maxUrls: this.config.maxUrls,
      maxDepth: this.config.maxDepth,
      remaining: this.config.maxUrls - this.discovered.size,
      robotsCacheSize: this.robotsValidator?.getCacheStats()?.size || 0,
      sitemapStats: (this.sitemapValidator?.getStats() || null) as Record<string, unknown> | null
    };
  }

  reset(options: ResetOptions = {}): void {
    this.discovered.clear();
    this.queued.clear();
    this.blockedByRobots.clear();
    this.fromSitemap.clear();

    if (options.clearRobotsCache && this.robotsValidator) {
      this.robotsValidator.clearCache();
    }

    if (options.clearSitemapCache && this.sitemapValidator) {
      this.sitemapValidator.clearCache();
      this.sitemapValidator.resetStats();
    }
  }

  isLimitReached(): boolean {
    return this.discovered.size >= this.config.maxUrls;
  }

  async getRobotsValidation(url: string): Promise<ReturnType<ReckerRobotsValidator['validate']> | null> {
    if (!this.robotsValidator) return null;
    return this.robotsValidator.validate(url);
  }

  async getSitemapValidation(url: string): Promise<ReturnType<ReckerSitemapValidator['validate']> | null> {
    if (!this.sitemapValidator) return null;

    try {
      const urlObj = new URL(url);
      const sitemapUrl = `${urlObj.protocol}//${urlObj.host}/sitemap.xml`;
      return this.sitemapValidator.validate(sitemapUrl);
    } catch {
      return null;
    }
  }

  isReckerEnabled(): boolean {
    return this.reckerAvailable === true;
  }
}

export default ReckerLinkDiscoverer;
