/**
 * UptimeBehavior
 *
 * Monitors target availability and calculates uptime metrics:
 * - Periodic health checks (ping, HTTP, DNS)
 * - Uptime percentage calculation
 * - Downtime detection and alerting
 * - Historical availability tracking
 *
 * Usage:
 * ```typescript
 * const plugin = new ReconPlugin({
 *   behaviors: {
 *     uptime: {
 *       enabled: true,
 *       interval: 60000,        // Check every 60 seconds
 *       methods: ['ping', 'http', 'dns'],
 *       alertOnDowntime: true,
 *       downtimeThreshold: 3    // 3 failed checks = downtime
 *     }
 *   }
 * });
 * ```
 */
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import { getCronManager } from '../../../concerns/cron-manager.js';
export class UptimeBehavior {
    plugin;
    config;
    checks;
    checkIntervals;
    aggregationIntervals;
    minuteBuffer;
    logger;
    constructor(plugin, config = {}) {
        this.plugin = plugin;
        this.config = {
            enabled: true,
            checkInterval: 20000,
            aggregationInterval: 60000,
            methods: ['ping', 'http'],
            alertOnDowntime: true,
            downtimeThreshold: 3,
            timeout: 5000,
            retainHistory: 30 * 24 * 60 * 60 * 1000,
            persistRawChecks: false,
            ...config
        };
        this.checks = new Map();
        this.checkIntervals = new Map();
        this.aggregationIntervals = new Map();
        this.minuteBuffer = new Map();
        this.logger = console;
    }
    async startMonitoring(target) {
        const host = target.host;
        if (!this.checks.has(host)) {
            this.checks.set(host, {
                status: 'unknown',
                consecutiveFails: 0,
                consecutiveSuccess: 0,
                lastCheck: null,
                lastUp: null,
                lastDown: null,
                totalChecks: 0,
                successfulChecks: 0,
                failedChecks: 0,
                history: []
            });
        }
        if (!this.minuteBuffer.has(host)) {
            this.minuteBuffer.set(host, []);
        }
        if (!this.checkIntervals.has(host)) {
            await this._performCheck(target);
            const cronManager = getCronManager();
            const checkJobName = `uptime-check-${host}-${Date.now()}`;
            await cronManager.scheduleInterval(this.config.checkInterval, () => this._performCheck(target), checkJobName);
            this.checkIntervals.set(host, checkJobName);
        }
        if (!this.aggregationIntervals.has(host)) {
            const cronManager = getCronManager();
            const aggregationJobName = `uptime-aggregation-${host}-${Date.now()}`;
            await cronManager.scheduleInterval(this.config.aggregationInterval, () => this._aggregateMinute(target), aggregationJobName);
            this.aggregationIntervals.set(host, aggregationJobName);
        }
        return this.getStatus(host);
    }
    stopMonitoring(host) {
        const cronManager = getCronManager();
        const checkJobName = this.checkIntervals.get(host);
        if (checkJobName) {
            cronManager.stop(checkJobName);
            this.checkIntervals.delete(host);
        }
        const aggregationJobName = this.aggregationIntervals.get(host);
        if (aggregationJobName) {
            cronManager.stop(aggregationJobName);
            this.aggregationIntervals.delete(host);
        }
        this.minuteBuffer.delete(host);
    }
    getStatus(host) {
        const check = this.checks.get(host);
        if (!check) {
            return null;
        }
        const uptimePercentage = check.totalChecks > 0
            ? (check.successfulChecks / check.totalChecks) * 100
            : 0;
        return {
            host,
            status: check.status,
            uptimePercentage: uptimePercentage.toFixed(2),
            totalChecks: check.totalChecks,
            successfulChecks: check.successfulChecks,
            failedChecks: check.failedChecks,
            lastCheck: check.lastCheck,
            lastUp: check.lastUp,
            lastDown: check.lastDown,
            consecutiveFails: check.consecutiveFails,
            consecutiveSuccess: check.consecutiveSuccess,
            isDown: check.consecutiveFails >= this.config.downtimeThreshold,
            recentHistory: check.history.slice(-10)
        };
    }
    getAllStatuses() {
        const statuses = [];
        for (const host of this.checks.keys()) {
            const status = this.getStatus(host);
            if (status) {
                statuses.push(status);
            }
        }
        return statuses;
    }
    async _performCheck(target) {
        const host = target.host;
        const check = this.checks.get(host);
        if (!check)
            return;
        const timestamp = new Date().toISOString();
        const results = {
            timestamp,
            methods: {}
        };
        for (const method of this.config.methods) {
            try {
                switch (method) {
                    case 'ping':
                        results.methods.ping = await this._checkPing(target);
                        break;
                    case 'http':
                        results.methods.http = await this._checkHttp(target);
                        break;
                    case 'dns':
                        results.methods.dns = await this._checkDns(target);
                        break;
                }
            }
            catch (error) {
                results.methods[method] = {
                    status: 'error',
                    error: error.message
                };
            }
        }
        const anySuccess = Object.values(results.methods).some(r => r.status === 'ok');
        results.overallStatus = anySuccess ? 'up' : 'down';
        check.totalChecks++;
        check.lastCheck = timestamp;
        if (results.overallStatus === 'up') {
            check.successfulChecks++;
            check.consecutiveFails = 0;
            check.consecutiveSuccess++;
            check.lastUp = timestamp;
            if (check.status === 'down') {
                await this._handleTransition(target, 'down', 'up', results);
            }
            check.status = 'up';
        }
        else {
            check.failedChecks++;
            check.consecutiveFails++;
            check.consecutiveSuccess = 0;
            if (check.consecutiveFails >= this.config.downtimeThreshold) {
                check.lastDown = timestamp;
                if (check.status !== 'down') {
                    await this._handleTransition(target, check.status, 'down', results);
                }
                check.status = 'down';
            }
        }
        const buffer = this.minuteBuffer.get(host) || [];
        buffer.push({
            timestamp,
            status: results.overallStatus,
            methods: results.methods,
            latency: this._extractLatency(results.methods)
        });
        this.minuteBuffer.set(host, buffer);
        if (this.config.persistRawChecks) {
            await this._persistRawCheck(host, results);
        }
    }
    async _aggregateMinute(target) {
        const host = target.host;
        const check = this.checks.get(host);
        const buffer = this.minuteBuffer.get(host) || [];
        if (buffer.length === 0 || !check)
            return;
        const minuteCohort = this._extractMinuteCohort(buffer[0].timestamp);
        const successCount = buffer.filter(c => c.status === 'up').length;
        const failCount = buffer.filter(c => c.status === 'down').length;
        const uptimePercent = ((successCount / buffer.length) * 100).toFixed(2);
        const avgLatencies = this._calculateAverageLatencies(buffer);
        const minuteRecord = {
            minuteCohort,
            timestamp: buffer[0].timestamp,
            sampleCount: buffer.length,
            successCount,
            failCount,
            uptimePercent,
            avgLatencies,
            overallStatus: parseFloat(uptimePercent) >= 66.67 ? 'up' : 'down'
        };
        check.history.push(minuteRecord);
        this._pruneHistory(check);
        await this._persistStatus(host, check);
        await this._persistMinuteCohort(host, minuteRecord);
        this.minuteBuffer.set(host, []);
    }
    _extractMinuteCohort(isoTimestamp) {
        return isoTimestamp.substring(0, 16);
    }
    _calculateAverageLatencies(buffer) {
        const latencies = {};
        const methods = Object.keys(buffer[0]?.methods || {});
        for (const method of methods) {
            const values = buffer
                .map(b => b.latency?.[method])
                .filter((v) => v != null && !isNaN(v));
            if (values.length > 0) {
                latencies[method] = {
                    avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
                    min: Math.min(...values).toFixed(2),
                    max: Math.max(...values).toFixed(2),
                    samples: values.length
                };
            }
        }
        return latencies;
    }
    _extractLatency(methods) {
        const latencies = {};
        for (const [method, result] of Object.entries(methods)) {
            if (result.status === 'ok') {
                latencies[method] = result.latency || result.duration || null;
            }
        }
        return latencies;
    }
    async _checkPing(target) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const proc = spawn('ping', ['-c', '1', '-W', String(Math.floor(this.config.timeout / 1000)), target.host]);
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            proc.on('close', (code) => {
                const duration = Date.now() - startTime;
                if (code === 0) {
                    const match = stdout.match(/time=([0-9.]+)\s*ms/);
                    const latency = match ? parseFloat(match[1]) : null;
                    resolve({
                        status: 'ok',
                        latency,
                        duration
                    });
                }
                else {
                    resolve({
                        status: 'error',
                        error: stderr || 'Ping failed',
                        duration
                    });
                }
            });
            proc.on('error', (error) => {
                resolve({
                    status: 'error',
                    error: error.message,
                    duration: Date.now() - startTime
                });
            });
            setTimeout(() => {
                proc.kill();
                resolve({
                    status: 'timeout',
                    error: 'Ping timeout',
                    duration: this.config.timeout
                });
            }, this.config.timeout);
        });
    }
    async _checkHttp(target) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const protocol = target.protocol === 'http' ? http : https;
            const port = target.port || (target.protocol === 'http' ? 80 : 443);
            const url = `${target.protocol || 'https'}://${target.host}:${port}${target.path || '/'}`;
            const req = protocol.get(url, {
                timeout: this.config.timeout,
                rejectUnauthorized: false
            }, (res) => {
                const duration = Date.now() - startTime;
                resolve({
                    status: 'ok',
                    statusCode: res.statusCode,
                    duration
                });
                res.resume();
            });
            req.on('error', (error) => {
                resolve({
                    status: 'error',
                    error: error.message,
                    duration: Date.now() - startTime
                });
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({
                    status: 'timeout',
                    error: 'HTTP timeout',
                    duration: this.config.timeout
                });
            });
        });
    }
    async _checkDns(target) {
        const startTime = Date.now();
        try {
            const addresses = await dns.resolve4(target.host);
            const duration = Date.now() - startTime;
            return {
                status: 'ok',
                addresses,
                duration
            };
        }
        catch (error) {
            return {
                status: 'error',
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }
    async _handleTransition(target, fromStatus, toStatus, checkResults) {
        const transition = {
            host: target.host,
            from: fromStatus,
            to: toStatus,
            timestamp: new Date().toISOString(),
            checkResults
        };
        if (this.plugin.emit) {
            this.plugin.emit('uptime:transition', transition);
        }
        if (toStatus === 'down' && this.config.alertOnDowntime) {
            await this._sendDowntimeAlert(target, transition);
        }
        this.logger.info(`[UptimeBehavior] ${target.host}: ${fromStatus} -> ${toStatus}`);
        await this._persistTransition(transition);
    }
    async _sendDowntimeAlert(target, transition) {
        const check = this.checks.get(target.host);
        this.logger.warn(`[ALERT] Target ${target.host} is DOWN!`, {
            consecutiveFails: check?.consecutiveFails,
            lastUp: check?.lastUp,
            checkResults: transition.checkResults
        });
    }
    _pruneHistory(check) {
        const cutoffTime = Date.now() - this.config.retainHistory;
        check.history = check.history.filter(entry => {
            return new Date(entry.timestamp).getTime() > cutoffTime;
        });
    }
    async _persistStatus(host, check) {
        try {
            const storage = this.plugin.getStorage();
            if (!storage)
                return;
            const namespace = this.plugin.namespace || '';
            const key = storage.getPluginKey(null, namespace, 'uptime', host, 'status.json');
            await storage.set(key, {
                host,
                status: check.status,
                totalChecks: check.totalChecks,
                successfulChecks: check.successfulChecks,
                failedChecks: check.failedChecks,
                uptimePercentage: ((check.successfulChecks / check.totalChecks) * 100).toFixed(2),
                lastCheck: check.lastCheck,
                lastUp: check.lastUp,
                lastDown: check.lastDown,
                consecutiveFails: check.consecutiveFails,
                consecutiveSuccess: check.consecutiveSuccess,
                updatedAt: new Date().toISOString()
            }, { behavior: 'body-only' });
        }
        catch (error) {
            this.logger.error(`Failed to persist uptime status for ${host}:`, error.message);
        }
    }
    async _persistTransition(transition) {
        try {
            const storage = this.plugin.getStorage();
            if (!storage)
                return;
            const namespace = this.plugin.namespace || '';
            const timestamp = transition.timestamp.replace(/[:.]/g, '-');
            const key = storage.getPluginKey(null, namespace, 'uptime', transition.host, 'transitions', `${timestamp}.json`);
            await storage.set(key, transition, { behavior: 'body-only' });
        }
        catch (error) {
            this.logger.error(`Failed to persist transition for ${transition.host}:`, error.message);
        }
    }
    async _persistMinuteCohort(host, minuteRecord) {
        try {
            const storage = this.plugin.getStorage();
            if (!storage)
                return;
            const namespace = this.plugin.namespace || '';
            const day = minuteRecord.minuteCohort.substring(0, 10);
            const hourMinute = minuteRecord.minuteCohort.substring(11).replace(':', '-');
            const key = storage.getPluginKey(null, namespace, 'uptime', host, 'cohorts', day, `${hourMinute}.json`);
            await storage.set(key, minuteRecord, { behavior: 'body-only' });
        }
        catch (error) {
            this.logger.error(`Failed to persist minute cohort for ${host}:`, error.message);
        }
    }
    async _persistRawCheck(host, checkResult) {
        try {
            const storage = this.plugin.getStorage();
            if (!storage)
                return;
            const namespace = this.plugin.namespace || '';
            const timestamp = checkResult.timestamp.replace(/[:.]/g, '-');
            const key = storage.getPluginKey(null, namespace, 'uptime', host, 'raw', `${timestamp}.json`);
            await storage.set(key, checkResult, { behavior: 'body-only' });
        }
        catch (error) {
            this.logger.error(`Failed to persist raw check for ${host}:`, error.message);
        }
    }
    async loadStatus(host) {
        try {
            const storage = this.plugin.getStorage();
            if (!storage)
                return null;
            const namespace = this.plugin.namespace || '';
            const key = storage.getPluginKey(null, namespace, 'uptime', host, 'status.json');
            return await storage.get(key);
        }
        catch (error) {
            return null;
        }
    }
    async linkReportToUptime(host, reportId, reportTimestamp) {
        try {
            const storage = this.plugin.getStorage();
            if (!storage)
                return;
            const status = this.getStatus(host);
            if (!status)
                return;
            const namespace = this.plugin.namespace || '';
            const timestamp = reportTimestamp.replace(/[:.]/g, '-');
            const key = storage.getPluginKey(null, namespace, 'uptime', host, 'scans', `${timestamp}.json`);
            await storage.set(key, {
                host,
                reportId,
                reportTimestamp,
                uptimeStatus: status.status,
                uptimePercentage: status.uptimePercentage,
                consecutiveFails: status.consecutiveFails,
                linkedAt: new Date().toISOString()
            }, { behavior: 'body-only' });
        }
        catch (error) {
            this.logger.error(`Failed to link report to uptime for ${host}:`, error.message);
        }
    }
    cleanup() {
        for (const host of this.checkIntervals.keys()) {
            this.stopMonitoring(host);
        }
        this.checks.clear();
        this.checkIntervals.clear();
        this.aggregationIntervals.clear();
        this.minuteBuffer.clear();
    }
}
//# sourceMappingURL=uptime-behavior.js.map