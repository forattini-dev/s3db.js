import { createHttpClient } from '#src/concerns/http-client.js';
export class ReckerLlmsTxtValidator {
    config;
    _context;
    cache;
    _httpClient;
    reckerAvailable = null;
    parseLlmsTxt = null;
    validateLlmsTxt = null;
    fetchAndValidateLlmsTxt = null;
    generateLlmsTxtTemplate = null;
    constructor(config = {}) {
        this.config = {
            userAgent: config.userAgent || 's3db-spider',
            fetchTimeout: config.fetchTimeout || 10000,
            cacheTimeout: config.cacheTimeout || 3600000,
            context: config.context || null
        };
        this._context = this.config.context;
        this.cache = new Map();
        this._httpClient = null;
    }
    async _checkReckerAvailability() {
        if (this.reckerAvailable !== null) {
            return this.reckerAvailable;
        }
        try {
            const llmsModule = await import('recker/seo/validators/llms-txt');
            this.parseLlmsTxt = llmsModule.parseLlmsTxt;
            this.validateLlmsTxt = llmsModule.validateLlmsTxt;
            this.fetchAndValidateLlmsTxt = llmsModule.fetchAndValidateLlmsTxt;
            this.generateLlmsTxtTemplate = llmsModule.generateLlmsTxtTemplate;
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
            });
        }
        return this._httpClient;
    }
    async check(domain) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (!isReckerAvailable) {
            return this._fallbackCheck(domain);
        }
        const normalizedDomain = domain.replace(/\/$/, '');
        const llmsUrl = `${normalizedDomain}/llms.txt`;
        const cached = this.cache.get(normalizedDomain);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
            return cached.result;
        }
        try {
            const fetchResult = await this.fetchAndValidateLlmsTxt(llmsUrl, async (url) => {
                const client = await this._getHttpClient();
                const response = await client.get(url);
                if (this._context) {
                    this._context.processResponse(response, url);
                }
                return {
                    status: response.ok ? 200 : response.status,
                    text: response.ok ? await response.text() : ''
                };
            });
            const result = {
                exists: fetchResult.exists,
                valid: fetchResult.valid,
                status: fetchResult.status,
                fullVersionExists: fetchResult.fullVersionExists,
                siteName: fetchResult.parseResult.siteName,
                siteDescription: fetchResult.parseResult.siteDescription,
                sections: fetchResult.parseResult.sections,
                links: fetchResult.parseResult.links,
                issues: fetchResult.issues,
                errors: fetchResult.parseResult.errors,
                warnings: fetchResult.parseResult.warnings,
                size: fetchResult.parseResult.size
            };
            this.cache.set(normalizedDomain, { result, timestamp: Date.now() });
            return result;
        }
        catch (error) {
            return {
                exists: false,
                valid: false,
                sections: [],
                links: [],
                issues: [{
                        type: 'error',
                        code: 'FETCH_ERROR',
                        message: `Failed to fetch llms.txt: ${error.message}`
                    }],
                errors: [error.message],
                warnings: []
            };
        }
    }
    async _fallbackCheck(domain) {
        const normalizedDomain = domain.replace(/\/$/, '');
        const llmsUrl = `${normalizedDomain}/llms.txt`;
        try {
            const client = await this._getHttpClient();
            const response = await client.get(llmsUrl);
            if (!response.ok) {
                return {
                    exists: false,
                    valid: false,
                    status: response.status,
                    sections: [],
                    links: [],
                    issues: [{
                            type: 'info',
                            code: 'NOT_FOUND',
                            message: 'llms.txt file not found',
                            recommendation: 'Consider adding an llms.txt file for AI SEO'
                        }],
                    errors: [],
                    warnings: []
                };
            }
            const content = await response.text();
            const parsed = this._simpleParse(content);
            return {
                exists: true,
                valid: parsed.sections.length > 0 || !!parsed.siteName,
                status: 200,
                siteName: parsed.siteName,
                siteDescription: parsed.siteDescription,
                sections: parsed.sections,
                links: parsed.links,
                issues: [],
                errors: [],
                warnings: ['Recker not available - using basic parsing'],
                size: content.length
            };
        }
        catch (error) {
            return {
                exists: false,
                valid: false,
                sections: [],
                links: [],
                issues: [],
                errors: [error.message],
                warnings: []
            };
        }
    }
    _simpleParse(content) {
        const lines = content.split(/\r?\n/);
        const sections = [];
        const links = [];
        let siteName;
        let siteDescription;
        let currentSection = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            if (trimmed.startsWith('# ') && !siteName) {
                siteName = trimmed.slice(2).trim();
                continue;
            }
            if (trimmed.startsWith('>') && !siteDescription) {
                siteDescription = trimmed.slice(1).trim();
                continue;
            }
            if (trimmed.startsWith('## ')) {
                if (currentSection) {
                    sections.push(currentSection);
                }
                currentSection = {
                    title: trimmed.slice(3).trim(),
                    content: '',
                    links: []
                };
                continue;
            }
            const linkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)(?:\s*-\s*(.+))?$/);
            if (linkMatch) {
                const link = {
                    text: linkMatch[1],
                    url: linkMatch[2],
                    description: linkMatch[3]?.trim(),
                    section: currentSection?.title
                };
                links.push(link);
                if (currentSection) {
                    currentSection.links.push(link);
                }
                continue;
            }
            if (currentSection && trimmed) {
                currentSection.content += (currentSection.content ? '\n' : '') + trimmed;
            }
        }
        if (currentSection) {
            sections.push(currentSection);
        }
        return { siteName, siteDescription, sections, links };
    }
    async validate(domain) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (!isReckerAvailable) {
            return null;
        }
        const checkResult = await this.check(domain);
        if (!checkResult.exists) {
            return null;
        }
        const normalizedDomain = domain.replace(/\/$/, '');
        const llmsUrl = `${normalizedDomain}/llms.txt`;
        try {
            const client = await this._getHttpClient();
            const response = await client.get(llmsUrl);
            const content = await response.text();
            return this.validateLlmsTxt(content, normalizedDomain);
        }
        catch {
            return null;
        }
    }
    validateContent(content, baseUrl) {
        if (!this.reckerAvailable || !this.validateLlmsTxt) {
            return null;
        }
        return this.validateLlmsTxt(content, baseUrl);
    }
    parseContent(content) {
        if (!this.reckerAvailable || !this.parseLlmsTxt) {
            return null;
        }
        return this.parseLlmsTxt(content);
    }
    generateTemplate(options) {
        if (!this.reckerAvailable || !this.generateLlmsTxtTemplate) {
            return this._fallbackGenerateTemplate(options);
        }
        return this.generateLlmsTxtTemplate(options);
    }
    _fallbackGenerateTemplate(options) {
        const lines = [];
        lines.push(`# ${options.siteName}`);
        lines.push('');
        lines.push(`> ${options.siteDescription}`);
        lines.push('');
        if (options.sections) {
            for (const section of options.sections) {
                lines.push(`## ${section.title}`);
                lines.push('');
                for (const link of section.links) {
                    if (link.description) {
                        lines.push(`[${link.text}](${link.url}) - ${link.description}`);
                    }
                    else {
                        lines.push(`[${link.text}](${link.url})`);
                    }
                }
                lines.push('');
            }
        }
        return lines.join('\n');
    }
    async checkFullVersion(domain) {
        const normalizedDomain = domain.replace(/\/$/, '');
        const llmsFullUrl = `${normalizedDomain}/llms-full.txt`;
        try {
            const client = await this._getHttpClient();
            const response = await client.get(llmsFullUrl);
            if (!response.ok) {
                return { exists: false, status: response.status };
            }
            const content = await response.text();
            return {
                exists: true,
                status: 200,
                size: content.length
            };
        }
        catch {
            return { exists: false };
        }
    }
    async getLinks(domain) {
        const result = await this.check(domain);
        return result.links;
    }
    async getSections(domain) {
        const result = await this.check(domain);
        return result.sections;
    }
    clearCache(domain) {
        if (domain) {
            const normalizedDomain = domain.replace(/\/$/, '');
            this.cache.delete(normalizedDomain);
        }
        else {
            this.cache.clear();
        }
    }
    getCacheStats() {
        return {
            size: this.cache.size,
            domains: [...this.cache.keys()]
        };
    }
    isReckerEnabled() {
        return this.reckerAvailable === true;
    }
}
export default ReckerLlmsTxtValidator;
//# sourceMappingURL=recker-llms-validator.js.map