import { RobotsParser } from './robots-parser.js';
import { SitemapParser } from './sitemap-parser.js';
export class LinkDiscoverer {
    config;
    patternMatcher;
    robotsParser;
    sitemapParser;
    discovered;
    queued;
    blockedByRobots;
    fromSitemap;
    constructor(config = {}) {
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
        this.robotsParser = config.respectRobotsTxt !== false
            ? new RobotsParser({
                userAgent: this.config.robotsUserAgent,
                cacheTimeout: this.config.robotsCacheTimeout,
                fetcher: config.robotsFetcher || null
            })
            : null;
        this.sitemapParser = config.useSitemaps !== false
            ? new SitemapParser({
                userAgent: this.config.robotsUserAgent,
                maxUrls: this.config.sitemapMaxUrls,
                fetcher: config.sitemapFetcher || null
            })
            : null;
        this.discovered = new Set();
        this.queued = new Set();
        this.blockedByRobots = new Set();
        this.fromSitemap = new Set();
    }
    setPatternMatcher(matcher) {
        this.patternMatcher = matcher;
    }
    setRobotsFetcher(fetcher) {
        if (this.robotsParser) {
            this.robotsParser.setFetcher(fetcher);
        }
    }
    extractLinks(html, baseUrl, currentDepth = 0) {
        if (!this.config.enabled)
            return [];
        if (currentDepth >= this.config.maxDepth)
            return [];
        if (this.discovered.size >= this.config.maxUrls)
            return [];
        const links = [];
        const baseUrlObj = new URL(baseUrl);
        const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
            const url = match[1];
            const anchorText = match[2] ? match[2].trim() : '';
            if (!url || url.trim() === '')
                continue;
            if (url.startsWith('#'))
                continue;
            try {
                const resolvedUrl = new URL(url, baseUrl);
                const normalizedUrl = this._normalizeUrl(resolvedUrl);
                if (this.discovered.has(normalizedUrl))
                    continue;
                if (!this._shouldFollow(resolvedUrl, baseUrlObj))
                    continue;
                let patternMatch = null;
                if (this.patternMatcher) {
                    patternMatch = this.patternMatcher.match(normalizedUrl);
                }
                if (!this._shouldFollowPattern(patternMatch))
                    continue;
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
                if (this.discovered.size >= this.config.maxUrls)
                    break;
            }
            catch {
                continue;
            }
        }
        return links;
    }
    async extractLinksAsync(html, baseUrl, currentDepth = 0) {
        const links = this.extractLinks(html, baseUrl, currentDepth);
        if (!this.robotsParser || !this.config.respectRobotsTxt) {
            return links;
        }
        const results = await Promise.all(links.map(async (link) => {
            const result = await this.robotsParser.isAllowed(link.url);
            return { link, allowed: result.allowed, crawlDelay: result.crawlDelay };
        }));
        const allowedLinks = [];
        for (const { link, allowed, crawlDelay } of results) {
            if (allowed) {
                if (crawlDelay) {
                    link.metadata.crawlDelay = crawlDelay;
                }
                allowedLinks.push(link);
            }
            else {
                this.blockedByRobots.add(link.url);
            }
        }
        return allowedLinks;
    }
    async isAllowedByRobots(url) {
        if (!this.robotsParser || !this.config.respectRobotsTxt) {
            return { allowed: true };
        }
        return await this.robotsParser.isAllowed(url);
    }
    async preloadRobots(url) {
        if (!this.robotsParser)
            return;
        try {
            const urlObj = new URL(url);
            const domain = `${urlObj.protocol}//${urlObj.host}`;
            await this.robotsParser.preload(domain);
        }
        catch {
            // Invalid URL, ignore
        }
    }
    async getSitemaps(url) {
        if (!this.robotsParser)
            return [];
        try {
            const urlObj = new URL(url);
            const domain = `${urlObj.protocol}//${urlObj.host}`;
            return await this.robotsParser.getSitemaps(domain);
        }
        catch {
            return [];
        }
    }
    async discoverFromSitemaps(url, options = {}) {
        if (!this.sitemapParser)
            return [];
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
                const robotsSitemaps = await this.sitemapParser.discoverFromRobotsTxt(`${domain}/robots.txt`);
                sitemapUrls.push(...robotsSitemaps);
            }
            catch {
                // Ignore errors
            }
        }
        if (sitemapUrls.length === 0) {
            try {
                const urlObj = new URL(url);
                const domain = `${urlObj.protocol}//${urlObj.host}`;
                sitemapUrls.push(`${domain}/sitemap.xml`);
            }
            catch {
                return [];
            }
        }
        const allEntries = [];
        const processedSitemaps = new Set();
        for (const sitemapUrl of sitemapUrls) {
            if (processedSitemaps.has(sitemapUrl))
                continue;
            processedSitemaps.add(sitemapUrl);
            try {
                const entries = await this.sitemapParser.parse(sitemapUrl);
                allEntries.push(...entries);
            }
            catch {
                // Ignore individual sitemap errors
            }
        }
        const links = [];
        const baseUrlObj = new URL(url);
        for (const entry of allEntries) {
            if (this.discovered.size >= this.config.maxUrls)
                break;
            if (!entry.url)
                continue;
            try {
                const entryUrl = new URL(entry.url);
                const normalizedUrl = this._normalizeUrl(entryUrl);
                if (this.discovered.has(normalizedUrl))
                    continue;
                if (!this._shouldFollow(entryUrl, baseUrlObj))
                    continue;
                if (opts.checkRobots && this.robotsParser) {
                    const robotsResult = await this.robotsParser.isAllowed(normalizedUrl);
                    if (!robotsResult.allowed) {
                        this.blockedByRobots.add(normalizedUrl);
                        continue;
                    }
                }
                let patternMatch = null;
                if (this.patternMatcher) {
                    patternMatch = this.patternMatcher.match(normalizedUrl);
                }
                if (!this._shouldFollowPattern(patternMatch))
                    continue;
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
            }
            catch {
                // Invalid URL, skip
            }
        }
        return links;
    }
    async parseSitemap(sitemapUrl, options = {}) {
        if (!this.sitemapParser)
            return [];
        try {
            const entries = await this.sitemapParser.parse(sitemapUrl, options);
            return entries;
        }
        catch {
            return [];
        }
    }
    async probeSitemapLocations(url) {
        if (!this.sitemapParser)
            return [];
        try {
            const urlObj = new URL(url);
            const domain = `${urlObj.protocol}//${urlObj.host}`;
            return await this.sitemapParser.probeCommonLocations(domain);
        }
        catch {
            return [];
        }
    }
    _normalizeUrl(urlObj) {
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
    _shouldFollow(urlObj, baseUrlObj) {
        for (const pattern of this.config.defaultIgnore) {
            if (pattern.test(urlObj.href))
                return false;
        }
        if (this.config.ignoreRegex && this.config.ignoreRegex.test(urlObj.href)) {
            return false;
        }
        for (const blocked of this.config.blockedDomains) {
            if (urlObj.hostname.includes(blocked))
                return false;
        }
        if (this.config.sameDomainOnly) {
            const baseDomain = this._getMainDomain(baseUrlObj.hostname);
            const linkDomain = this._getMainDomain(urlObj.hostname);
            if (this.config.includeSubdomains) {
                if (baseDomain !== linkDomain)
                    return false;
            }
            else {
                if (baseUrlObj.hostname !== urlObj.hostname)
                    return false;
            }
        }
        if (this.config.allowedDomains.length > 0) {
            const allowed = this.config.allowedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain));
            if (!allowed)
                return false;
        }
        if (this.config.followRegex && !this.config.followRegex.test(urlObj.href)) {
            return false;
        }
        return true;
    }
    _shouldFollowPattern(patternMatch) {
        if (!this.patternMatcher)
            return true;
        if (this.config.followPatterns.length === 0)
            return true;
        if (!patternMatch || patternMatch.isDefault) {
            return this.config.followPatterns.includes('default');
        }
        return this.config.followPatterns.includes(patternMatch.pattern);
    }
    _getMainDomain(hostname) {
        const parts = hostname.split('.');
        if (parts.length <= 2)
            return hostname;
        return parts.slice(-2).join('.');
    }
    markQueued(url) {
        this.queued.add(this._normalizeUrl(new URL(url)));
    }
    isQueued(url) {
        try {
            return this.queued.has(this._normalizeUrl(new URL(url)));
        }
        catch {
            return false;
        }
    }
    getStats() {
        return {
            discovered: this.discovered.size,
            queued: this.queued.size,
            blockedByRobots: this.blockedByRobots.size,
            fromSitemap: this.fromSitemap.size,
            maxUrls: this.config.maxUrls,
            maxDepth: this.config.maxDepth,
            remaining: this.config.maxUrls - this.discovered.size,
            robotsCacheSize: this.robotsParser?.getCacheStats()?.size || 0,
            sitemapStats: (this.sitemapParser?.getStats() || null)
        };
    }
    reset(options = {}) {
        this.discovered.clear();
        this.queued.clear();
        this.blockedByRobots.clear();
        this.fromSitemap.clear();
        if (options.clearRobotsCache && this.robotsParser) {
            this.robotsParser.clearCache();
        }
        if (options.clearSitemapCache && this.sitemapParser) {
            this.sitemapParser.clearCache();
            this.sitemapParser.resetStats();
        }
    }
    isLimitReached() {
        return this.discovered.size >= this.config.maxUrls;
    }
}
export default LinkDiscoverer;
//# sourceMappingURL=link-discoverer.js.map