import { createHttpClient } from '#src/concerns/http-client.js';
export class RobotsParser {
    config;
    _context;
    cache;
    fetcher;
    _httpClient;
    constructor(config = {}) {
        this.config = {
            userAgent: config.userAgent || 's3db-spider',
            defaultAllow: config.defaultAllow !== false,
            cacheTimeout: config.cacheTimeout || 3600000,
            fetchTimeout: config.fetchTimeout || 10000,
            context: config.context || null,
            ...config
        };
        this._context = this.config.context ?? null;
        this.cache = new Map();
        this.fetcher = config.fetcher || null;
        this._httpClient = null;
    }
    setFetcher(fetcher) {
        this.fetcher = fetcher;
    }
    async isAllowed(url) {
        try {
            const urlObj = new URL(url);
            const domain = `${urlObj.protocol}//${urlObj.host}`;
            const path = urlObj.pathname + urlObj.search;
            const rules = await this._getRules(domain);
            if (!rules) {
                return { allowed: this.config.defaultAllow, source: 'no-robots-txt' };
            }
            const agentRules = this._findAgentRules(rules);
            if (!agentRules || agentRules.rules.length === 0) {
                return { allowed: this.config.defaultAllow, source: 'no-matching-agent' };
            }
            const result = this._checkPath(path, agentRules);
            return {
                allowed: result.allowed,
                crawlDelay: result.crawlDelay,
                source: 'robots-txt',
                matchedRule: result.matchedRule
            };
        }
        catch (error) {
            return {
                allowed: this.config.defaultAllow,
                source: 'error',
                error: error.message
            };
        }
    }
    async _getRules(domain) {
        const cached = this.cache.get(domain);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
            return cached.rules;
        }
        const robotsUrl = `${domain}/robots.txt`;
        let content = null;
        try {
            if (this.fetcher) {
                content = await this.fetcher(robotsUrl);
            }
            else {
                content = await this._fetchRobotsTxt(robotsUrl);
            }
        }
        catch {
            this.cache.set(domain, { rules: null, timestamp: Date.now() });
            return null;
        }
        const rules = this._parse(content);
        this.cache.set(domain, { rules, timestamp: Date.now() });
        return rules;
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
    async _fetchRobotsTxt(url) {
        const client = await this._getHttpClient();
        const response = await client.get(url);
        if (this._context) {
            this._context.processResponse(response, url);
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    }
    _parse(content) {
        const rules = {
            agents: new Map(),
            sitemaps: []
        };
        if (!content || typeof content !== 'string') {
            return rules;
        }
        const lines = content.split(/\r?\n/);
        let currentAgents = [];
        for (let line of lines) {
            const commentIndex = line.indexOf('#');
            if (commentIndex !== -1) {
                line = line.slice(0, commentIndex);
            }
            line = line.trim();
            if (!line)
                continue;
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1)
                continue;
            const directive = line.slice(0, colonIndex).trim().toLowerCase();
            const value = line.slice(colonIndex + 1).trim();
            switch (directive) {
                case 'user-agent':
                    if (currentAgents.length > 0 && this._hasRules(rules, currentAgents)) {
                        currentAgents = [];
                    }
                    currentAgents.push(value.toLowerCase());
                    for (const agent of currentAgents) {
                        if (!rules.agents.has(agent)) {
                            rules.agents.set(agent, {
                                allow: [],
                                disallow: [],
                                crawlDelay: null
                            });
                        }
                    }
                    break;
                case 'allow':
                    if (value && currentAgents.length > 0) {
                        for (const agent of currentAgents) {
                            const agentRules = rules.agents.get(agent);
                            agentRules.allow.push(this._compilePattern(value));
                        }
                    }
                    break;
                case 'disallow':
                    if (currentAgents.length > 0) {
                        for (const agent of currentAgents) {
                            const agentRules = rules.agents.get(agent);
                            if (value) {
                                agentRules.disallow.push(this._compilePattern(value));
                            }
                        }
                    }
                    break;
                case 'crawl-delay':
                    if (currentAgents.length > 0) {
                        const delay = parseFloat(value);
                        if (!isNaN(delay) && delay >= 0) {
                            for (const agent of currentAgents) {
                                const agentRules = rules.agents.get(agent);
                                agentRules.crawlDelay = delay * 1000;
                            }
                        }
                    }
                    break;
                case 'sitemap':
                    if (value) {
                        rules.sitemaps.push(value);
                    }
                    break;
            }
        }
        return rules;
    }
    _hasRules(rules, agents) {
        for (const agent of agents) {
            const agentRules = rules.agents.get(agent);
            if (agentRules && (agentRules.allow.length > 0 || agentRules.disallow.length > 0)) {
                return true;
            }
        }
        return false;
    }
    _compilePattern(pattern) {
        let escaped = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&');
        escaped = escaped.replace(/\*/g, '.*');
        if (escaped.endsWith('$')) {
            escaped = escaped.slice(0, -1) + '$';
        }
        else {
            escaped = escaped + '.*';
        }
        return {
            original: pattern,
            regex: new RegExp(`^${escaped}$`, 'i'),
            length: pattern.replace(/\*/g, '').length
        };
    }
    _findAgentRules(rules) {
        const userAgent = this.config.userAgent.toLowerCase();
        if (rules.agents.has(userAgent)) {
            return this._combineRules(rules.agents.get(userAgent));
        }
        for (const [agent, agentRules] of rules.agents) {
            if (agent !== '*' && (agent.includes(userAgent) || userAgent.includes(agent))) {
                return this._combineRules(agentRules);
            }
        }
        if (rules.agents.has('*')) {
            return this._combineRules(rules.agents.get('*'));
        }
        return null;
    }
    _combineRules(agentRules) {
        const combined = [];
        for (const rule of agentRules.allow) {
            combined.push({ type: 'allow', ...rule });
        }
        for (const rule of agentRules.disallow) {
            combined.push({ type: 'disallow', ...rule });
        }
        combined.sort((a, b) => b.length - a.length);
        return {
            rules: combined,
            crawlDelay: agentRules.crawlDelay
        };
    }
    _checkPath(path, agentRules) {
        const { rules, crawlDelay } = agentRules;
        if (rules.length === 0) {
            return { allowed: true, crawlDelay };
        }
        for (const rule of rules) {
            if (rule.regex.test(path)) {
                return {
                    allowed: rule.type === 'allow',
                    crawlDelay,
                    matchedRule: rule.original
                };
            }
        }
        return { allowed: true, crawlDelay };
    }
    async getSitemaps(domain) {
        const rules = await this._getRules(domain);
        return rules?.sitemaps || [];
    }
    async getCrawlDelay(domain) {
        const rules = await this._getRules(domain);
        if (!rules)
            return null;
        const agentRules = this._findAgentRules(rules);
        return agentRules?.crawlDelay || null;
    }
    async preload(domain) {
        await this._getRules(domain);
    }
    clearCache(domain) {
        if (domain) {
            this.cache.delete(domain);
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
}
export default RobotsParser;
//# sourceMappingURL=robots-parser.js.map