/**
 * PortsStage
 *
 * Port scanning using RedBlue:
 * - Common ports preset (fast)
 * - Full port range scanning
 * - Service detection with banners
 * - Fast mode (masscan-style)
 */
export class PortsStage {
    plugin;
    commandRunner;
    config;
    constructor(plugin) {
        this.plugin = plugin;
        this.commandRunner = plugin.commandRunner;
        this.config = plugin.config;
    }
    async execute(target, featureConfig = {}) {
        const result = await this.commandRunner.runRedBlue('network', 'ports', 'scan', target.host, {
            timeout: featureConfig.timeout || 60000,
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
        const ports = this._normalizePorts(result.data);
        return {
            status: ports.length > 0 ? 'ok' : 'empty',
            openPorts: ports,
            total: ports.length,
            metadata: result.metadata
        };
    }
    _buildFlags(config) {
        const flags = [];
        if (config.preset) {
            flags.push('--preset', config.preset);
        }
        else {
            flags.push('--preset', 'common');
        }
        if (config.fast) {
            flags.push('--fast');
        }
        if (config.threads) {
            flags.push('--threads', String(config.threads));
        }
        if (config.timeout) {
            flags.push('--timeout', String(config.timeout));
        }
        if (config.intel) {
            flags.push('--intel');
        }
        return flags;
    }
    _normalizePorts(data) {
        if (!data || typeof data !== 'object') {
            return [];
        }
        if (data.raw) {
            return this._parseRawOutput(data.raw);
        }
        if (Array.isArray(data)) {
            return data.map(port => this._normalizePortEntry(port)).filter((p) => p !== null);
        }
        if (data.ports) {
            return data.ports.map((port) => this._normalizePortEntry(port)).filter((p) => p !== null);
        }
        if (data.open_ports) {
            return data.open_ports.map((port) => this._normalizePortEntry(port)).filter((p) => p !== null);
        }
        return [];
    }
    _normalizePortEntry(entry) {
        if (!entry)
            return null;
        if (typeof entry === 'number') {
            return { port: entry, protocol: 'tcp', state: 'open' };
        }
        if (typeof entry === 'string') {
            const match = entry.match(/^(\d+)(\/(\w+))?/);
            if (match) {
                return {
                    port: parseInt(match[1]),
                    protocol: match[3] || 'tcp',
                    state: 'open'
                };
            }
            return null;
        }
        return {
            port: entry.port || entry.portNumber || entry.number,
            protocol: entry.protocol || entry.proto || 'tcp',
            state: entry.state || entry.status || 'open',
            service: entry.service || entry.serviceName || null,
            banner: entry.banner || entry.version || null,
            product: entry.product || null
        };
    }
    _parseRawOutput(raw) {
        const ports = [];
        const lines = raw.split('\n');
        for (const line of lines) {
            const portMatch = line.match(/(\d+)\/(\w+)\s+(open|filtered)/i);
            if (portMatch) {
                ports.push({
                    port: parseInt(portMatch[1]),
                    protocol: portMatch[2].toLowerCase(),
                    state: portMatch[3].toLowerCase()
                });
            }
        }
        return ports;
    }
    async executeRangeScan(target, startPort, endPort, featureConfig = {}) {
        const result = await this.commandRunner.runRedBlue('network', 'ports', 'range', target.host, {
            timeout: featureConfig.timeout || 120000,
            flags: [
                String(startPort),
                String(endPort),
                ...(featureConfig.fast ? ['--fast'] : []),
                ...(featureConfig.threads ? ['--threads', String(featureConfig.threads)] : [])
            ]
        });
        if (result.status !== 'ok') {
            return result;
        }
        const ports = this._normalizePorts(result.data);
        return {
            status: ports.length > 0 ? 'ok' : 'empty',
            openPorts: ports,
            total: ports.length,
            range: { start: startPort, end: endPort },
            metadata: result.metadata
        };
    }
}
//# sourceMappingURL=ports-stage.js.map