import { gunzipSync } from 'zlib';
import { createHttpClient } from '#src/concerns/http-client.js';
export class ReckerSitemapValidator {
    config;
    _context;
    cache;
    fetcher;
    _httpClient;
    stats;
    reckerAvailable = null;
    parseSitemap = null;
    validateSitemap = null;
    discoverSitemaps = null;
    fetchAndValidateSitemap = null;
    fallbackParser = null;
    constructor(config = {}) {
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
    async _checkReckerAvailability() {
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
        }
        catch {
            this.reckerAvailable = false;
            return false;
        }
    }
    async _getFallbackParser() {
        if (!this.fallbackParser) {
            const { SitemapParser } = await import('./sitemap-parser.js');
            this.fallbackParser = new SitemapParser(this.config);
        }
        return this.fallbackParser;
    }
    setFetcher(fetcher) {
        this.fetcher = fetcher;
        if (this.fallbackParser) {
            this.fallbackParser.setFetcher(fetcher);
        }
    }
    async parse(sitemapUrl, options = {}) {
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
            const parseResult = this.parseSitemap(content, compressed);
            const validationResult = this.validateSitemap(content, sitemapUrl);
            let entries = [];
            if (parseResult.type === 'sitemapindex' && opts.recursive) {
                entries = await this._parseReckerIndex(parseResult, opts);
            }
            else {
                entries = this._mapReckerUrlsToEntries(parseResult.urls, 'sitemap');
            }
            this.stats.sitemapsParsed++;
            this.stats.urlsExtracted += entries.length;
            const cacheEntry = {
                entries,
                parseResult,
                validationResult,
                timestamp: Date.now(),
                format: parseResult.type
            };
            this.cache.set(sitemapUrl, cacheEntry);
            return entries;
        }
        catch (error) {
            this.stats.errors++;
            throw error;
        }
    }
    async _parseReckerIndex(parseResult, opts) {
        if (!opts.recursive) {
            return parseResult.sitemaps.map(s => ({
                url: s.loc,
                lastmod: s.lastmod || null,
                source: 'sitemap-index',
                type: 'sitemap'
            }));
        }
        const allEntries = [];
        const sitemapsToProcess = parseResult.sitemaps.slice(0, this.config.maxSitemaps);
        for (const sitemap of sitemapsToProcess) {
            if (this.stats.urlsExtracted >= this.config.maxUrls)
                break;
            try {
                const entries = await this.parse(sitemap.loc, {
                    ...opts,
                    _depth: opts._depth + 1
                });
                allEntries.push(...entries);
            }
            catch {
                this.stats.errors++;
            }
        }
        return allEntries;
    }
    _mapReckerUrlsToEntries(urls, source) {
        return urls.slice(0, this.config.maxUrls - this.stats.urlsExtracted).map(url => {
            const entry = {
                url: url.loc,
                lastmod: url.lastmod || null,
                changefreq: url.changefreq || null,
                priority: url.priority ?? null,
                source,
                images: url.images?.map(img => ({
                    url: img.loc,
                    title: img.title || null,
                    caption: img.caption || null
                })),
                videos: url.videos?.map(vid => ({
                    url: vid.contentLoc || vid.playerLoc || null,
                    thumbnailUrl: vid.thumbnailLoc || null,
                    title: vid.title || null,
                    description: vid.description || null
                }))
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
    async _getHttpClient() {
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
            });
        }
        return this._httpClient;
    }
    async _fetch(url) {
        let content;
        let compressed = false;
        if (this.fetcher) {
            const result = await this.fetcher(url);
            content = result.content || result;
        }
        else {
            const client = await this._getHttpClient();
            const response = await client.get(url);
            if (this._context) {
                this._context.processResponse(response, url);
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const contentType = response.headers.get('content-type') || '';
            if (url.endsWith('.gz') || contentType.includes('gzip')) {
                const buffer = await response.arrayBuffer();
                content = this._decompress(Buffer.from(buffer));
                compressed = true;
            }
            else {
                content = await response.text();
            }
        }
        if (Buffer.isBuffer(content)) {
            if (content[0] === 0x1f && content[1] === 0x8b) {
                content = this._decompress(content);
                compressed = true;
            }
            else {
                content = content.toString('utf-8');
            }
        }
        return { content: content, compressed };
    }
    _decompress(buffer) {
        try {
            return gunzipSync(buffer).toString('utf-8');
        }
        catch (error) {
            throw new Error(`Failed to decompress gzip: ${error.message}`);
        }
    }
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size
        };
    }
    clearCache(url) {
        if (url) {
            this.cache.delete(url);
        }
        else {
            this.cache.clear();
        }
    }
    resetStats() {
        this.stats = {
            sitemapsParsed: 0,
            urlsExtracted: 0,
            errors: 0
        };
    }
    async discoverFromRobotsTxt(robotsTxtUrl) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (!isReckerAvailable) {
            const fallback = await this._getFallbackParser();
            return fallback.discoverFromRobotsTxt(robotsTxtUrl);
        }
        try {
            const baseUrl = new URL(robotsTxtUrl).origin;
            const { content } = await this._fetch(robotsTxtUrl);
            return await this.discoverSitemaps(baseUrl, content, async (url) => {
                const { content: text } = await this._fetch(url);
                return { status: 200, text };
            });
        }
        catch {
            return [];
        }
    }
    async probeCommonLocations(baseUrl) {
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
        const results = [];
        for (const path of commonPaths) {
            const url = baseUrl.replace(/\/$/, '') + path;
            try {
                const { content, compressed } = await this._fetch(url);
                const parseResult = this.parseSitemap(content, compressed);
                results.push({
                    url,
                    exists: true,
                    format: parseResult.type
                });
            }
            catch {
                results.push({
                    url,
                    exists: false
                });
            }
        }
        return results;
    }
    async validate(sitemapUrl) {
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
        }
        catch {
            return null;
        }
    }
    async validateContent(content, baseUrl) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (!isReckerAvailable || !this.validateSitemap) {
            return null;
        }
        return this.validateSitemap(content, baseUrl);
    }
    parseContent(content, compressed) {
        if (!this.reckerAvailable || !this.parseSitemap) {
            return null;
        }
        return this.parseSitemap(content, compressed);
    }
    async getValidationIssues(sitemapUrl) {
        const validation = await this.validate(sitemapUrl);
        return validation?.issues || [];
    }
    async getNewsEntries(sitemapUrl) {
        const entries = await this.parse(sitemapUrl);
        return entries.filter(e => e.news);
    }
    async getAlternateLanguages(sitemapUrl) {
        const entries = await this.parse(sitemapUrl);
        const byLanguage = new Map();
        for (const entry of entries) {
            if (entry.alternates) {
                for (const alt of entry.alternates) {
                    const lang = alt.hreflang;
                    if (!byLanguage.has(lang)) {
                        byLanguage.set(lang, []);
                    }
                    byLanguage.get(lang).push(entry);
                }
            }
        }
        return byLanguage;
    }
    async discoverAll(baseUrl) {
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
    isReckerEnabled() {
        return this.reckerAvailable === true;
    }
}
export default ReckerSitemapValidator;
//# sourceMappingURL=recker-sitemap-validator.js.map