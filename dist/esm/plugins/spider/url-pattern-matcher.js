export class URLPatternMatcher {
    patterns;
    defaultPattern;
    constructor(patterns = {}) {
        this.patterns = new Map();
        this.defaultPattern = null;
        for (const [name, config] of Object.entries(patterns)) {
            if (name === 'default') {
                this.defaultPattern = {
                    name: 'default',
                    ...config
                };
            }
            else {
                this.patterns.set(name, this._compilePattern(name, config));
            }
        }
    }
    _compilePattern(name, config) {
        const pattern = {
            name,
            original: config.match,
            activities: config.activities || [],
            extract: config.extract || {},
            priority: config.priority || 0,
            metadata: config.metadata || {},
            regex: null,
            paramNames: []
        };
        if (config.match instanceof RegExp) {
            pattern.regex = config.match;
            pattern.paramNames = Object.keys(config.extract || {});
        }
        else if (typeof config.match === 'string') {
            const { regex, paramNames } = this._pathToRegex(config.match);
            pattern.regex = regex;
            pattern.paramNames = paramNames;
        }
        return pattern;
    }
    _pathToRegex(path) {
        const paramNames = [];
        let regexStr = path;
        let queryPattern = '';
        const queryIndex = path.indexOf('?');
        if (queryIndex !== -1) {
            queryPattern = path.slice(queryIndex + 1);
            regexStr = path.slice(0, queryIndex);
        }
        regexStr = regexStr.replace(/\*\*/g, '___DOUBLE_STAR___');
        regexStr = regexStr.replace(/\*/g, '___SINGLE_STAR___');
        regexStr = regexStr.replace(/:(\w+)\?/g, (_, name) => {
            paramNames.push(name);
            return '___OPT_PARAM___';
        });
        regexStr = regexStr.replace(/:(\w+)/g, (_, name) => {
            paramNames.push(name);
            return '___REQ_PARAM___';
        });
        regexStr = regexStr.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        regexStr = regexStr.replace(/___DOUBLE_STAR___/g, '.*');
        regexStr = regexStr.replace(/___SINGLE_STAR___/g, '[^/]+');
        regexStr = regexStr.replace(/___OPT_PARAM___/g, '([^/]*)');
        regexStr = regexStr.replace(/___REQ_PARAM___/g, '([^/]+)');
        if (queryPattern) {
            const queryParts = queryPattern.split('&');
            for (const part of queryParts) {
                const [, value] = part.split('=');
                if (value && value.startsWith(':')) {
                    const paramName = value.slice(1);
                    paramNames.push(paramName);
                }
            }
            regexStr += '(?:\\?.*)?';
        }
        const regex = new RegExp(`^${regexStr}\\/?(?:[?#].*)?$`, 'i');
        return { regex, paramNames };
    }
    match(url) {
        let urlObj;
        try {
            urlObj = new URL(url);
        }
        catch {
            urlObj = { pathname: url, search: '', searchParams: new URLSearchParams() };
        }
        const path = urlObj.pathname;
        const matches = [];
        for (const [name, pattern] of this.patterns) {
            if (!pattern.regex)
                continue;
            const match = pattern.regex.exec(path);
            if (match) {
                const params = this._extractParams(match, pattern, urlObj);
                matches.push({
                    pattern: name,
                    params,
                    activities: pattern.activities,
                    metadata: { ...pattern.metadata, ...params },
                    priority: pattern.priority,
                    config: pattern
                });
            }
        }
        matches.sort((a, b) => {
            if (b.priority !== a.priority)
                return b.priority - a.priority;
            return Object.keys(b.params).length - Object.keys(a.params).length;
        });
        if (matches.length > 0) {
            return matches[0] ?? null;
        }
        if (this.defaultPattern) {
            return {
                pattern: 'default',
                params: {},
                activities: this.defaultPattern.activities || [],
                metadata: this.defaultPattern.metadata || {},
                priority: -1,
                config: this.defaultPattern,
                isDefault: true
            };
        }
        return null;
    }
    _extractParams(match, pattern, urlObj) {
        const params = {};
        for (let i = 0; i < pattern.paramNames.length; i++) {
            const name = pattern.paramNames[i];
            const value = match[i + 1];
            if (value !== undefined) {
                params[name] = decodeURIComponent(value);
            }
        }
        if (pattern.extract && urlObj.searchParams) {
            for (const [paramName, queryKey] of Object.entries(pattern.extract)) {
                if (typeof queryKey === 'string') {
                    const value = urlObj.searchParams.get(queryKey);
                    if (value) {
                        params[paramName] = value;
                    }
                }
            }
        }
        return params;
    }
    matches(url) {
        const result = this.match(url);
        return result !== null && !result.isDefault;
    }
    getPatternNames() {
        return [...this.patterns.keys()];
    }
    addPattern(name, config) {
        if (name === 'default') {
            this.defaultPattern = { name: 'default', ...config };
        }
        else {
            this.patterns.set(name, this._compilePattern(name, config));
        }
    }
    removePattern(name) {
        if (name === 'default') {
            this.defaultPattern = null;
        }
        else {
            this.patterns.delete(name);
        }
    }
    filterUrls(urls, patternNames = []) {
        const results = [];
        for (const url of urls) {
            const match = this.match(url);
            if (match && !match.isDefault) {
                if (patternNames.length === 0 || patternNames.includes(match.pattern)) {
                    results.push({ url, match });
                }
            }
        }
        return results;
    }
}
export default URLPatternMatcher;
//# sourceMappingURL=url-pattern-matcher.js.map