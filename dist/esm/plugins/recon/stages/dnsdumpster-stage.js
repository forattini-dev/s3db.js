/**
 * DNSDumpster Stage
 *
 * DNS Intelligence via dnsdumpster.com web scraping
 *
 * Discovers:
 * - DNS records (A, AAAA, MX, TXT, NS)
 * - Subdomains
 * - Related domains
 * - Network map data
 *
 * Uses 100% free web scraping (no API key required)
 * - dnsdumpster.com (unlimited, requires CSRF token handling)
 */
import { createHttpClient } from '../../../concerns/http-client.js';
export class DNSDumpsterStage {
    plugin;
    commandRunner;
    config;
    _httpClient;
    constructor(plugin) {
        this.plugin = plugin;
        this.commandRunner = plugin.commandRunner;
        this.config = plugin.config;
        this._httpClient = null;
    }
    async _getHttpClient() {
        if (!this._httpClient) {
            this._httpClient = await createHttpClient({
                headers: {
                    'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (compatible; ReconBot/1.0)'
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
    async execute(target, options = {}) {
        const result = {
            status: 'ok',
            host: target.host,
            dnsRecords: {
                A: [],
                AAAA: [],
                MX: [],
                TXT: [],
                NS: []
            },
            subdomains: [],
            relatedDomains: [],
            errors: {}
        };
        const individual = {
            dnsdumpster: { status: 'ok', data: null, raw: null },
            dig: { status: 'ok', records: {} }
        };
        try {
            const baseUrl = 'https://dnsdumpster.com/';
            const [csrfToken, cookie] = await this.getCsrfToken(baseUrl, options);
            if (!csrfToken) {
                result.status = 'error';
                result.errors.csrf = 'Failed to obtain CSRF token from DNSDumpster';
                individual.dnsdumpster.status = 'error';
                return {
                    _individual: individual,
                    _aggregated: result,
                    ...result
                };
            }
            const data = await this.submitQuery(baseUrl, target.host, csrfToken, cookie, options);
            if (!data) {
                result.status = 'error';
                result.errors.query = 'Failed to retrieve data from DNSDumpster';
                individual.dnsdumpster.status = 'error';
                return {
                    _individual: individual,
                    _aggregated: result,
                    ...result
                };
            }
            if (this.config?.storage?.persistRawOutput) {
                individual.dnsdumpster.raw = data.substring(0, 50000);
            }
            const parsed = this.parseHtmlResponse(data);
            result.dnsRecords = parsed.dnsRecords;
            result.subdomains = parsed.subdomains;
            result.relatedDomains = parsed.relatedDomains;
            individual.dnsdumpster.data = parsed;
        }
        catch (error) {
            result.status = 'error';
            result.errors.general = error.message;
            individual.dnsdumpster.status = 'error';
        }
        if (result.status === 'error' && options.fallbackToDig !== false) {
            const digResults = await this.fallbackDigLookup(target.host);
            result.dnsRecords = digResults.dnsRecords;
            result.status = 'ok_fallback';
            individual.dig = { ...individual.dig, ...digResults };
        }
        return {
            _individual: individual,
            _aggregated: result,
            ...result
        };
    }
    async getCsrfToken(baseUrl, options = {}) {
        try {
            const client = await this._getHttpClient();
            const response = await client.get(baseUrl);
            if (!response.ok) {
                return [null, ''];
            }
            const html = await response.text();
            const cookies = response.headers.get('set-cookie') || '';
            const csrfMatch = html.match(/name='csrfmiddlewaretoken'\s+value='([^']+)'/);
            if (!csrfMatch) {
                return [null, ''];
            }
            const csrfToken = csrfMatch[1];
            return [csrfToken ?? null, cookies];
        }
        catch {
            return [null, ''];
        }
    }
    async submitQuery(baseUrl, domain, csrfToken, cookie, options = {}) {
        try {
            const formData = new URLSearchParams();
            formData.append('csrfmiddlewaretoken', csrfToken);
            formData.append('targetip', domain);
            formData.append('user', 'free');
            const client = await this._getHttpClient();
            const response = await client.post(baseUrl, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': baseUrl,
                    'Cookie': cookie
                },
                body: formData.toString()
            });
            if (!response.ok) {
                return null;
            }
            return await response.text();
        }
        catch {
            return null;
        }
    }
    parseHtmlResponse(html) {
        const result = {
            dnsRecords: {
                A: [],
                AAAA: [],
                MX: [],
                TXT: [],
                NS: []
            },
            subdomains: [],
            relatedDomains: []
        };
        const aRecordMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\w\-\.]+)<br>([\d\.]+)<\/td>[\s\S]*?<\/tr>/g);
        for (const match of aRecordMatches) {
            const hostname = match[1];
            const ip = match[2];
            if (hostname && ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                result.dnsRecords.A.push({ hostname, ip });
                if (hostname.includes('.')) {
                    result.subdomains.push(hostname);
                }
            }
        }
        const mxRecordMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)\s+([\w\-\.]+)<br>([\d\.]+)<\/td>[\s\S]*?<\/tr>/g);
        for (const match of mxRecordMatches) {
            const priority = match[1];
            const hostname = match[2];
            const ip = match[3];
            if (hostname && ip) {
                result.dnsRecords.MX.push({ priority, hostname, ip });
            }
        }
        const txtSectionMatch = html.match(/TXT Records[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
        if (txtSectionMatch) {
            const txtMatches = txtSectionMatch[1].matchAll(/<td[^>]*>([^<]+)<\/td>/g);
            for (const match of txtMatches) {
                const content = (match[1] ?? '').trim();
                if (content && content.length > 0) {
                    result.dnsRecords.TXT.push({ content });
                }
            }
        }
        const nsSectionMatch = html.match(/DNS Servers[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
        if (nsSectionMatch) {
            const nsMatches = nsSectionMatch[1].matchAll(/<td[^>]*>([\w\-\.]+)<br>([\d\.]+)<\/td>/g);
            for (const match of nsMatches) {
                const hostname = match[1];
                const ip = match[2];
                if (hostname && ip) {
                    result.dnsRecords.NS.push({ hostname, ip });
                }
            }
        }
        result.subdomains = [...new Set(result.subdomains)];
        return result;
    }
    async fallbackDigLookup(host) {
        const result = {
            dnsRecords: {
                A: [],
                AAAA: [],
                MX: [],
                TXT: [],
                NS: []
            },
            subdomains: [],
            relatedDomains: []
        };
        try {
            const aRun = await this.commandRunner.runSimple('dig', ['+short', 'A', host], { timeout: 5000 });
            if (aRun.status === 'ok' && aRun.raw) {
                const ips = aRun.raw
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => /^\d+\.\d+\.\d+\.\d+$/.test(line));
                result.dnsRecords.A = ips.map((ip) => ({ hostname: host, ip }));
            }
            const aaaaRun = await this.commandRunner.runSimple('dig', ['+short', 'AAAA', host], { timeout: 5000 });
            if (aaaaRun.status === 'ok' && aaaaRun.raw) {
                const ips = aaaaRun.raw
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => /^[0-9a-f:]+$/i.test(line) && line.includes(':'));
                result.dnsRecords.AAAA = ips.map((ip) => ({ hostname: host, ip }));
            }
            const mxRun = await this.commandRunner.runSimple('dig', ['+short', 'MX', host], { timeout: 5000 });
            if (mxRun.status === 'ok' && mxRun.raw) {
                const mxRecords = mxRun.raw
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0)
                    .map((line) => {
                    const parts = line.split(' ');
                    if (parts.length === 2) {
                        return { priority: parts[0], hostname: parts[1].replace(/\.$/, ''), ip: '' };
                    }
                    return null;
                })
                    .filter((r) => r !== null);
                result.dnsRecords.MX = mxRecords;
            }
            const txtRun = await this.commandRunner.runSimple('dig', ['+short', 'TXT', host], { timeout: 5000 });
            if (txtRun.status === 'ok' && txtRun.raw) {
                const txtRecords = txtRun.raw
                    .split('\n')
                    .map((line) => line.trim().replace(/"/g, ''))
                    .filter((line) => line.length > 0)
                    .map((content) => ({ content }));
                result.dnsRecords.TXT = txtRecords;
            }
            const nsRun = await this.commandRunner.runSimple('dig', ['+short', 'NS', host], { timeout: 5000 });
            if (nsRun.status === 'ok' && nsRun.raw) {
                const nsRecords = nsRun.raw
                    .split('\n')
                    .map((line) => line.trim().replace(/\.$/, ''))
                    .filter((line) => line.length > 0)
                    .map((hostname) => ({ hostname, ip: null }));
                result.dnsRecords.NS = nsRecords;
            }
        }
        catch {
            // Silently fail, return empty results
        }
        return result;
    }
}
//# sourceMappingURL=dnsdumpster-stage.js.map