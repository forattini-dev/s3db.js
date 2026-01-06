/**
 * ReckerScrapeStage
 *
 * Web scraping and search reconnaissance using Recker
 *
 * Uses Recker's HTML parser and link extractor for better accuracy
 * Uses Recker's HTTP client for search queries
 *
 * Falls back to GoogleDorksStage if Recker is not available
 */
import { createHttpClient } from '../../../concerns/http-client.js';
export class ReckerScrapeStage {
    plugin;
    config;
    _httpClient = null;
    reckerAvailable = null;
    extractLinks = null;
    parse = null;
    fallbackStage = null;
    constructor(plugin) {
        this.plugin = plugin;
        this.config = plugin.config;
    }
    async _checkReckerAvailability() {
        if (this.reckerAvailable !== null) {
            return this.reckerAvailable;
        }
        try {
            const scrapeModule = await import('recker/scrape');
            this.extractLinks = scrapeModule.extractLinks;
            this.parse = scrapeModule.parseHtmlSync;
            this.reckerAvailable = true;
            return true;
        }
        catch {
            this.reckerAvailable = false;
            return false;
        }
    }
    async _getHttpClient() {
        if (!this._httpClient) {
            this._httpClient = await createHttpClient({
                headers: {
                    'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000,
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
    async _getFallbackStage() {
        if (!this.fallbackStage) {
            const { GoogleDorksStage } = await import('./google-dorks-stage.js');
            this.fallbackStage = new GoogleDorksStage(this.plugin);
        }
        return this.fallbackStage;
    }
    async execute(target, options = {}) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (!isReckerAvailable) {
            return this._executeFallback(target, options);
        }
        const domain = this._extractBaseDomain(target.host);
        const companyName = this._extractCompanyName(domain);
        const result = {
            status: 'ok',
            domain,
            companyName,
            categories: {
                github: null,
                pastebin: null,
                linkedin: null,
                documents: null,
                subdomains: null,
                loginPages: null,
                configs: null,
                errors: null
            },
            summary: {
                totalResults: 0,
                totalCategories: 0
            }
        };
        const individual = {};
        const enabledCategories = options.categories || [
            'github', 'pastebin', 'linkedin', 'documents',
            'subdomains', 'loginPages', 'configs', 'errors'
        ];
        for (const category of enabledCategories) {
            try {
                let categoryData = null;
                switch (category) {
                    case 'github':
                        categoryData = await this._searchGitHub(domain, companyName, options);
                        break;
                    case 'pastebin':
                        categoryData = await this._searchPastebin(domain, companyName, options);
                        break;
                    case 'linkedin':
                        categoryData = await this._searchLinkedIn(domain, companyName, options);
                        break;
                    case 'documents':
                        categoryData = await this._searchDocuments(domain, options);
                        break;
                    case 'subdomains':
                        categoryData = await this._searchSubdomains(domain, options);
                        break;
                    case 'loginPages':
                        categoryData = await this._searchLoginPages(domain, options);
                        break;
                    case 'configs':
                        categoryData = await this._searchConfigs(domain, options);
                        break;
                    case 'errors':
                        categoryData = await this._searchErrors(domain, options);
                        break;
                }
                result.categories[category] = categoryData;
                individual[category] = categoryData;
            }
            catch (error) {
                result.categories[category] = {
                    status: 'error',
                    message: error.message
                };
                individual[category] = {
                    status: 'error',
                    message: error.message
                };
            }
        }
        let totalResults = 0;
        let totalCategories = 0;
        for (const [, data] of Object.entries(result.categories)) {
            if (data && data.status === 'ok') {
                totalCategories++;
                if (data.results) {
                    totalResults += data.results.length;
                }
            }
        }
        result.summary.totalResults = totalResults;
        result.summary.totalCategories = totalCategories;
        return {
            _individual: individual,
            _aggregated: result,
            ...result
        };
    }
    async _performSearch(query, options = {}) {
        const maxResults = options.maxResults || 10;
        const results = [];
        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
            const client = await this._getHttpClient();
            const response = await client.get(url);
            if (!response.ok) {
                return results;
            }
            const html = await response.text();
            const doc = this.parse(html);
            const links = doc.querySelectorAll('.result__url');
            for (const link of links) {
                let resultUrl = (link.textContent || '').trim();
                if (resultUrl.startsWith('//')) {
                    resultUrl = 'https:' + resultUrl;
                }
                if (resultUrl && !results.includes(resultUrl)) {
                    results.push(resultUrl);
                }
                if (results.length >= maxResults) {
                    break;
                }
            }
        }
        catch {
            // Silently fail
        }
        return results;
    }
    async _searchGitHub(domain, companyName, options) {
        const queries = [
            `site:github.com "${companyName}"`,
            `site:github.com "${domain}"`,
            `site:github.com "api" "${domain}"`,
            `site:github.com "config" "${domain}"`
        ];
        const results = [];
        for (const query of queries) {
            const urls = await this._performSearch(query, options);
            results.push(...urls.map(url => ({ url, query })));
            await this._sleep(2000);
        }
        return {
            status: 'ok',
            results: this._deduplicateResults(results),
            count: results.length
        };
    }
    async _searchPastebin(domain, companyName, options) {
        const queries = [
            `site:pastebin.com "${domain}"`,
            `site:pastebin.com "${companyName}"`,
            `site:paste2.org "${domain}"`,
            `site:slexy.org "${domain}"`
        ];
        const results = [];
        for (const query of queries) {
            const urls = await this._performSearch(query, options);
            results.push(...urls.map(url => ({ url, query })));
            await this._sleep(2000);
        }
        return {
            status: 'ok',
            results: this._deduplicateResults(results),
            count: results.length
        };
    }
    async _searchLinkedIn(domain, companyName, options) {
        const queries = [
            `site:linkedin.com/in "${companyName}"`,
            `site:linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, '-')}`
        ];
        const results = [];
        for (const query of queries) {
            const urls = await this._performSearch(query, options);
            results.push(...urls.map(url => ({ url, query })));
            await this._sleep(2000);
        }
        return {
            status: 'ok',
            results: this._deduplicateResults(results),
            count: results.length
        };
    }
    async _searchDocuments(domain, options) {
        const filetypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
        const results = [];
        for (const filetype of filetypes) {
            const query = `site:${domain} filetype:${filetype}`;
            const urls = await this._performSearch(query, options);
            results.push(...urls.map(url => ({ url, filetype, query })));
            await this._sleep(2000);
        }
        return {
            status: 'ok',
            results: this._deduplicateResults(results),
            count: results.length
        };
    }
    async _searchSubdomains(domain, options) {
        const query = `site:*.${domain}`;
        const urls = await this._performSearch(query, options);
        const subdomains = urls.map(url => {
            const match = url.match(/https?:\/\/([^\/]+)/);
            return match ? match[1] : null;
        }).filter((s) => s !== null);
        return {
            status: 'ok',
            results: [...new Set(subdomains)].map(subdomain => ({ url: subdomain, subdomain })),
            count: subdomains.length
        };
    }
    async _searchLoginPages(domain, options) {
        const queries = [
            `site:${domain} inurl:login`,
            `site:${domain} inurl:admin`,
            `site:${domain} inurl:dashboard`,
            `site:${domain} inurl:portal`,
            `site:${domain} intitle:"login" OR intitle:"sign in"`
        ];
        const results = [];
        for (const query of queries) {
            const urls = await this._performSearch(query, options);
            results.push(...urls.map(url => ({ url, query })));
            await this._sleep(2000);
        }
        return {
            status: 'ok',
            results: this._deduplicateResults(results),
            count: results.length
        };
    }
    async _searchConfigs(domain, options) {
        const queries = [
            `site:${domain} ext:env`,
            `site:${domain} ext:config`,
            `site:${domain} ext:ini`,
            `site:${domain} ext:yml`,
            `site:${domain} ext:yaml`,
            `site:${domain} inurl:config`,
            `site:${domain} intitle:"index of" "config"`
        ];
        const results = [];
        for (const query of queries) {
            const urls = await this._performSearch(query, options);
            results.push(...urls.map(url => ({ url, query })));
            await this._sleep(2000);
        }
        return {
            status: 'ok',
            results: this._deduplicateResults(results),
            count: results.length
        };
    }
    async _searchErrors(domain, options) {
        const queries = [
            `site:${domain} intext:"error" OR intext:"exception"`,
            `site:${domain} intext:"stack trace"`,
            `site:${domain} intext:"warning" intitle:"error"`,
            `site:${domain} intext:"mysql" intext:"error"`,
            `site:${domain} intext:"fatal error"`
        ];
        const results = [];
        for (const query of queries) {
            const urls = await this._performSearch(query, options);
            results.push(...urls.map(url => ({ url, query })));
            await this._sleep(2000);
        }
        return {
            status: 'ok',
            results: this._deduplicateResults(results),
            count: results.length
        };
    }
    _deduplicateResults(results) {
        const seen = new Set();
        return results.filter(item => {
            const key = item.url || item.subdomain || '';
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    _extractBaseDomain(host) {
        const parts = host.split('.');
        if (parts.length > 2) {
            return parts.slice(-2).join('.');
        }
        return host;
    }
    _extractCompanyName(domain) {
        const parts = domain.split('.');
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    async _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async _executeFallback(target, options) {
        const fallback = await this._getFallbackStage();
        const fallbackResult = await fallback.execute(target, options);
        return fallbackResult;
    }
    isReckerEnabled() {
        return this.reckerAvailable === true;
    }
}
export default ReckerScrapeStage;
//# sourceMappingURL=recker-scrape-stage.js.map