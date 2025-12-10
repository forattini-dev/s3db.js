/**
 * LatencyStage
 *
 * Network latency measurement using RedBlue:
 * - ICMP ping with statistics
 * - Traceroute support (when available)
 */
export class LatencyStage {
    plugin;
    commandRunner;
    config;
    constructor(plugin) {
        this.plugin = plugin;
        this.commandRunner = plugin.commandRunner;
        this.config = plugin.config;
    }
    async execute(target, featureConfig = {}) {
        const results = {};
        if (featureConfig.ping !== false) {
            results.ping = await this._executePing(target, featureConfig);
        }
        if (featureConfig.traceroute) {
            results.traceroute = await this._executeTrace(target, featureConfig);
        }
        const hasSuccess = Object.values(results).some(r => r?.status === 'ok');
        return {
            status: hasSuccess ? 'ok' : 'empty',
            ...results
        };
    }
    async _executePing(target, config) {
        const count = config.count || this.config.ping?.count || 4;
        const timeout = config.timeout || this.config.ping?.timeout || 10000;
        const flags = [
            '--count', String(count),
            ...(config.interval ? ['--interval', String(config.interval)] : [])
        ];
        const result = await this.commandRunner.runRedBlue('network', 'host', 'ping', target.host, {
            timeout,
            flags
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
        const metrics = this._normalizeMetrics(result.data);
        return {
            status: 'ok',
            metrics,
            metadata: result.metadata
        };
    }
    async _executeTrace(target, config) {
        const result = await this.commandRunner.runRedBlue('network', 'trace', 'route', target.host, {
            timeout: config.traceTimeout || 30000
        });
        if (result.status !== 'ok') {
            return result;
        }
        return {
            status: 'ok',
            hops: result.data?.hops || result.data,
            metadata: result.metadata
        };
    }
    _normalizeMetrics(data) {
        if (!data || typeof data !== 'object') {
            return this._defaultMetrics();
        }
        if (data.raw) {
            return this._parseRawPing(data.raw);
        }
        return {
            packetsTransmitted: data.packets_transmitted || data.packetsTransmitted || data.sent || null,
            packetsReceived: data.packets_received || data.packetsReceived || data.received || null,
            packetLoss: data.packet_loss || data.packetLoss || data.loss || null,
            min: data.min || data.rtt_min || null,
            avg: data.avg || data.rtt_avg || data.average || null,
            max: data.max || data.rtt_max || null,
            stdDev: data.stddev || data.std_dev || data.mdev || null
        };
    }
    _parseRawPing(raw) {
        const metrics = this._defaultMetrics();
        const packetMatch = raw.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+received,.*?([\d.]+)%\s+packet loss/i);
        if (packetMatch) {
            metrics.packetsTransmitted = parseInt(packetMatch[1]);
            metrics.packetsReceived = parseInt(packetMatch[2]);
            metrics.packetLoss = parseFloat(packetMatch[3]);
        }
        const rttMatch = raw.match(/=\s*([\d.]+)\/([\d.]+)\/([\d.]+)(?:\/([\d.]+))?/);
        if (rttMatch) {
            metrics.min = parseFloat(rttMatch[1]);
            metrics.avg = parseFloat(rttMatch[2]);
            metrics.max = parseFloat(rttMatch[3]);
            if (rttMatch[4]) {
                metrics.stdDev = parseFloat(rttMatch[4]);
            }
        }
        return metrics;
    }
    _defaultMetrics() {
        return {
            packetsTransmitted: null,
            packetsReceived: null,
            packetLoss: null,
            min: null,
            avg: null,
            max: null,
            stdDev: null
        };
    }
}
//# sourceMappingURL=latency-stage.js.map