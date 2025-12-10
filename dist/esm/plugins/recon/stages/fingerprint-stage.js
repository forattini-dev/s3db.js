/**
 * FingerprintStage
 *
 * Web technology fingerprinting using RedBlue:
 * - Framework/CMS detection
 * - Server technology identification
 * - JavaScript library detection
 * - Version detection
 */
export class FingerprintStage {
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
        const result = await this.commandRunner.runRedBlue('web', 'asset', 'fingerprint', url, {
            timeout: featureConfig.timeout || 30000,
            flags: featureConfig.intel ? ['--intel'] : []
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
        const fingerprint = this._normalizeFingerprint(result.data);
        return {
            status: fingerprint.technologies.length > 0 ? 'ok' : 'empty',
            url,
            ...fingerprint,
            metadata: result.metadata
        };
    }
    _buildUrl(target) {
        const protocol = target.protocol || 'https';
        const port = target.port && target.port !== (protocol === 'http' ? 80 : 443)
            ? `:${target.port}`
            : '';
        return `${protocol}://${target.host}${port}${target.path || ''}`;
    }
    _normalizeFingerprint(data) {
        if (!data || typeof data !== 'object') {
            return { technologies: [], server: null, framework: null };
        }
        if (data.raw) {
            return this._parseRawFingerprint(data.raw);
        }
        const technologies = [];
        if (Array.isArray(data.technologies)) {
            technologies.push(...data.technologies.map((t) => this._normalizeTech(t)).filter((t) => t !== null));
        }
        else if (Array.isArray(data)) {
            technologies.push(...data.map((t) => this._normalizeTech(t)).filter((t) => t !== null));
        }
        if (data.server && !technologies.some(t => t.category === 'server')) {
            technologies.push({ name: data.server, category: 'server' });
        }
        if (data.framework && !technologies.some(t => t.category === 'framework')) {
            technologies.push({ name: data.framework, category: 'framework' });
        }
        if (data.cms && !technologies.some(t => t.category === 'cms')) {
            technologies.push({ name: data.cms, category: 'cms' });
        }
        return {
            technologies: technologies.filter((t) => t !== null),
            server: data.server || null,
            framework: data.framework || null,
            cms: data.cms || null,
            headers: data.headers || {},
            cookies: data.cookies || []
        };
    }
    _normalizeTech(tech) {
        if (!tech)
            return null;
        if (typeof tech === 'string') {
            return { name: tech, category: 'unknown', version: null };
        }
        return {
            name: tech.name || tech.technology || 'Unknown',
            version: tech.version || null,
            category: tech.category || tech.type || 'unknown',
            confidence: tech.confidence || null
        };
    }
    _parseRawFingerprint(raw) {
        const technologies = [];
        const lines = raw.split('\n').filter(Boolean);
        for (const line of lines) {
            const match = line.match(/^\s*(.+?)(?:\s+\[(.+?)\])?(?:\s+v?([\d.]+))?$/);
            if (match) {
                technologies.push({
                    name: match[1].trim(),
                    category: match[2] || 'unknown',
                    version: match[3] || null
                });
            }
        }
        return {
            technologies,
            server: null,
            framework: null,
            cms: null,
            headers: {},
            cookies: []
        };
    }
}
//# sourceMappingURL=fingerprint-stage.js.map