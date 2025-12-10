/**
 * HttpStage
 *
 * HTTP request testing using RedBlue:
 * - Basic GET requests
 * - Header inspection
 * - Security header audit
 * - Server fingerprinting
 */
export class HttpStage {
    plugin;
    commandRunner;
    config;
    constructor(plugin) {
        this.plugin = plugin;
        this.commandRunner = plugin.commandRunner;
        this.config = plugin.config;
    }
    async execute(target, featureConfig = {}) {
        const url = this._buildUrl(target);
        const result = await this.commandRunner.runRedBlue('web', 'asset', 'get', url, {
            timeout: featureConfig.timeout || 30000,
            flags: this._buildFlags(featureConfig)
        });
        if (result.status === 'unavailable') {
            return {
                status: 'unavailable',
                message: 'RedBlue (rb) is not available',
                metadata: result.metadata
            };
        }
        if (result.status === 'error') {
            return {
                status: 'error',
                message: result.error,
                metadata: result.metadata
            };
        }
        const httpData = this._normalizeHttp(result.data);
        return {
            status: 'ok',
            url,
            ...httpData,
            metadata: result.metadata
        };
    }
    _buildUrl(target) {
        const protocol = target.protocol || 'https';
        const port = target.port && target.port !== this._defaultPortForProtocol(protocol)
            ? `:${target.port}`
            : '';
        const path = target.path || '';
        return `${protocol}://${target.host}${port}${path}`;
    }
    _defaultPortForProtocol(protocol) {
        switch (protocol) {
            case 'http': return 80;
            case 'https': return 443;
            default: return null;
        }
    }
    _buildFlags(config) {
        const flags = [];
        if (config.follow) {
            flags.push('--follow');
        }
        if (config.userAgent) {
            flags.push('--user-agent', config.userAgent);
        }
        if (config.intel) {
            flags.push('--intel');
        }
        if (config.timeout) {
            flags.push('--timeout', String(Math.ceil(config.timeout / 1000)));
        }
        return flags;
    }
    _normalizeHttp(data) {
        if (!data || typeof data !== 'object') {
            return { statusCode: null, headers: {}, body: null };
        }
        if (data.raw) {
            return this._parseRawHttp(data.raw);
        }
        return {
            statusCode: data.statusCode || data.status || data.status_code || null,
            headers: data.headers || {},
            body: data.body || data.content || null,
            contentType: data.contentType || data.content_type || null,
            contentLength: data.contentLength || data.content_length || null,
            server: data.server || null,
            redirects: data.redirects || []
        };
    }
    _parseRawHttp(raw) {
        const lines = raw.split('\n');
        const result = {
            statusCode: null,
            headers: {},
            body: null,
            server: null,
            contentType: null
        };
        let inBody = false;
        const bodyLines = [];
        for (const line of lines) {
            if (inBody) {
                bodyLines.push(line);
                continue;
            }
            if (line.trim() === '') {
                inBody = true;
                continue;
            }
            const statusMatch = line.match(/^HTTP\/[\d.]+\s+(\d+)/);
            if (statusMatch) {
                result.statusCode = parseInt(statusMatch[1]);
                continue;
            }
            const headerMatch = line.match(/^([^:]+):\s*(.+)/);
            if (headerMatch) {
                const key = headerMatch[1].toLowerCase();
                result.headers[key] = headerMatch[2].trim();
            }
        }
        result.body = bodyLines.join('\n');
        result.server = result.headers['server'] || null;
        result.contentType = result.headers['content-type'] || null;
        return result;
    }
    async executeSecurityAudit(target, featureConfig = {}) {
        const url = this._buildUrl(target);
        const result = await this.commandRunner.runRedBlue('web', 'asset', 'security', url, {
            timeout: featureConfig.timeout || 30000
        });
        if (result.status !== 'ok') {
            return result;
        }
        return {
            status: 'ok',
            url,
            securityHeaders: result.data,
            metadata: result.metadata
        };
    }
    async executeGrade(target, featureConfig = {}) {
        const url = this._buildUrl(target);
        const result = await this.commandRunner.runRedBlue('web', 'asset', 'grade', url, {
            timeout: featureConfig.timeout || 30000
        });
        if (result.status !== 'ok') {
            return result;
        }
        return {
            status: 'ok',
            url,
            grade: result.data,
            metadata: result.metadata
        };
    }
}
//# sourceMappingURL=http-stage.js.map