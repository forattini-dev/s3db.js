import { CrawlContext } from './crawl-context.js';
import { createHttpClient } from '#src/concerns/http-client.js';
export class HybridFetcher {
    context;
    strategy;
    timeout;
    navigationTimeout;
    puppeteerOptions;
    _customHttpClient;
    _httpClient;
    _browser;
    _puppeteer;
    _jsPatterns;
    stats;
    constructor(config = {}) {
        this.context = config.context || new CrawlContext(config);
        this.strategy = config.strategy || 'auto';
        this.timeout = config.timeout || 30000;
        this.navigationTimeout = config.navigationTimeout || 30000;
        this.puppeteerOptions = config.puppeteerOptions || {};
        this._customHttpClient = config.httpClient || null;
        this._httpClient = null;
        this._browser = null;
        this._puppeteer = null;
        this._jsPatterns = config.jsDetectionPatterns || [
            /<div\s+id=["']root["']\s*>\s*<\/div>/i,
            /<div\s+id=["']app["']\s*>\s*<\/div>/i,
            /<div\s+id=["']__next["']\s*>/i,
            /__NEXT_DATA__/,
            /__NUXT__/,
            /window\.__INITIAL_STATE__/,
            /window\.__PRELOADED_STATE__/,
            /ng-app|ng-controller|ng-view/,
            /\sv-cloak[\s>]|\sv-if=|\sv-for=/,
            /data-reactroot/,
            /data-react-helmet/,
            /<body[^>]*>\s*<noscript>/i,
            /<body[^>]*>\s*<div[^>]*>\s*<\/div>\s*<script/i
        ];
        this.stats = {
            reckerRequests: 0,
            puppeteerRequests: 0,
            fallbacks: 0,
            errors: 0
        };
    }
    async _getHttpClient(url) {
        if (this._customHttpClient) {
            return this._customHttpClient;
        }
        if (!this._httpClient) {
            const config = this.context.getHttpClientConfig(url || 'https://example.com');
            config.timeout = this.timeout;
            this._httpClient = await createHttpClient(config);
        }
        return this._httpClient;
    }
    async _getBrowser() {
        if (!this._browser) {
            if (!this._puppeteer) {
                try {
                    this._puppeteer = await import('puppeteer');
                }
                catch {
                    try {
                        this._puppeteer = await import('puppeteer-core');
                    }
                    catch {
                        throw new Error('Neither puppeteer nor puppeteer-core is installed. Install one to use browser features.');
                    }
                }
            }
            const config = {
                ...this.context.getLaunchConfig(),
                ...this.puppeteerOptions
            };
            this._browser = await this._puppeteer.default.launch(config);
        }
        return this._browser;
    }
    _needsJavaScript(html) {
        if (!html || typeof html !== 'string' || html.trim() === '')
            return true;
        for (const pattern of this._jsPatterns) {
            if (pattern.test(html)) {
                return true;
            }
        }
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            const bodyContent = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').trim();
            const textContent = bodyContent.replace(/<[^>]+>/g, '').trim();
            if (textContent.length < 100 && html.includes('<script')) {
                return true;
            }
        }
        return false;
    }
    async fetchWithRecker(url, options = {}) {
        const client = await this._getHttpClient(url);
        const headers = {
            ...this.context._headers,
            'User-Agent': this.context.userAgent,
            ...options.headers
        };
        const cookieHeader = this.context.getCookieHeader(url);
        if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
        }
        if (this.context._referer) {
            headers['Referer'] = this.context._referer;
        }
        let response;
        const method = (options.method || 'GET').toLowerCase();
        if (method === 'get') {
            response = await client.get(url, { headers });
        }
        else if (method === 'post') {
            response = await client.post(url, { headers, body: options.body });
        }
        else {
            response = await client.request(url, { ...options, headers });
        }
        this.context.processResponse(response, url);
        this.stats.reckerRequests++;
        const html = await response.text();
        return {
            html,
            response,
            url,
            ok: response.ok,
            status: response.status,
            headers: response.headers,
            source: 'recker',
            method: 'http'
        };
    }
    async fetchWithPuppeteer(url, options = {}) {
        const browser = await this._getBrowser();
        const page = await browser.newPage();
        try {
            await this.context.configurePage(page);
            const waitUntil = options.waitUntil || 'networkidle2';
            const timeout = options.timeout || this.timeout;
            const response = await page.goto(url, { waitUntil, timeout });
            await this.context.importFromPuppeteer(page);
            this.context.setReferer(url);
            this.stats.puppeteerRequests++;
            const html = await page.content();
            if (options.keepPage) {
                return {
                    html,
                    page,
                    response: response || undefined,
                    status: response?.status(),
                    source: 'puppeteer'
                };
            }
            await page.close();
            return {
                html,
                response: response || undefined,
                status: response?.status(),
                source: 'puppeteer'
            };
        }
        catch (error) {
            await page.close().catch(() => { });
            throw error;
        }
    }
    async fetch(url, options = {}) {
        try {
            if (this.strategy === 'puppeteer-only') {
                return await this.fetchWithPuppeteer(url, options);
            }
            if (this.strategy === 'recker-only') {
                return await this.fetchWithRecker(url, options);
            }
            const result = await this.fetchWithRecker(url, options);
            if (this._needsJavaScript(result.html)) {
                this.stats.fallbacks++;
                try {
                    return await this.fetchWithPuppeteer(url, options);
                }
                catch (e) {
                    console.warn(`Puppeteer fallback failed for ${url}: ${e.message}`);
                    return result;
                }
            }
            return result;
        }
        catch (error) {
            this.stats.errors++;
            throw error;
        }
    }
    async post(url, options = {}) {
        return this.fetchWithRecker(url, { ...options, method: 'POST' });
    }
    async head(url, options = {}) {
        const client = await this._getHttpClient(url);
        const headers = {
            'User-Agent': this.context.userAgent,
            ...options.headers
        };
        const response = await client.request(url, { method: 'HEAD', headers });
        return {
            status: response.status,
            headers: response.headers,
            ok: response.ok
        };
    }
    async needsPuppeteer(url) {
        try {
            const result = await this.fetchWithRecker(url);
            return this._needsJavaScript(result.html);
        }
        catch {
            return true;
        }
    }
    getStats() {
        return {
            ...this.stats,
            browserActive: !!this._browser,
            httpClientActive: !!this._httpClient
        };
    }
    async close() {
        if (this._browser) {
            await this._browser.close();
            this._browser = null;
        }
        this._httpClient = null;
    }
    async isPuppeteerAvailable() {
        try {
            await import('puppeteer');
            return true;
        }
        catch {
            try {
                await import('puppeteer-core');
                return true;
            }
            catch {
                return false;
            }
        }
    }
}
export default HybridFetcher;
//# sourceMappingURL=hybrid-fetcher.js.map