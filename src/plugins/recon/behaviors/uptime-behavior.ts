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

import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import { getCronManager } from '../../../concerns/cron-manager.js';

export type CheckMethod = 'ping' | 'http' | 'dns';

export interface UptimeBehaviorConfig {
  enabled?: boolean;
  checkInterval?: number;
  aggregationInterval?: number;
  methods?: CheckMethod[];
  alertOnDowntime?: boolean;
  downtimeThreshold?: number;
  timeout?: number;
  retainHistory?: number;
  persistRawChecks?: boolean;
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface MethodResult {
  status: 'ok' | 'error' | 'timeout';
  error?: string;
  latency?: number | null;
  duration?: number;
  statusCode?: number;
  addresses?: string[];
}

export interface CheckResults {
  timestamp: string;
  methods: Record<string, MethodResult>;
  overallStatus?: 'up' | 'down';
}

export interface BufferEntry {
  timestamp: string;
  status: 'up' | 'down';
  methods: Record<string, MethodResult>;
  latency: Record<string, number | null>;
}

export interface LatencyStats {
  avg: string;
  min: string;
  max: string;
  samples: number;
}

export interface MinuteRecord {
  minuteCohort: string;
  timestamp: string;
  sampleCount: number;
  successCount: number;
  failCount: number;
  uptimePercent: string;
  avgLatencies: Record<string, LatencyStats>;
  overallStatus: 'up' | 'down';
}

export interface CheckState {
  status: 'unknown' | 'up' | 'down';
  consecutiveFails: number;
  consecutiveSuccess: number;
  lastCheck: string | null;
  lastUp: string | null;
  lastDown: string | null;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  history: MinuteRecord[];
}

export interface UptimeStatus {
  host: string;
  status: 'unknown' | 'up' | 'down';
  uptimePercentage: string;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  lastCheck: string | null;
  lastUp: string | null;
  lastDown: string | null;
  consecutiveFails: number;
  consecutiveSuccess: number;
  isDown: boolean;
  recentHistory: MinuteRecord[];
}

export interface Transition {
  host: string;
  from: 'unknown' | 'up' | 'down';
  to: 'up' | 'down';
  timestamp: string;
  checkResults: CheckResults;
}

export interface ReconPlugin {
  emit: (event: string, data: any) => void;
  getStorage: () => any;
  namespace?: string;
}

interface Logger {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

export class UptimeBehavior {
  private plugin: ReconPlugin;
  private config: Required<UptimeBehaviorConfig>;
  private checks: Map<string, CheckState>;
  private checkIntervals: Map<string, string>;
  private aggregationIntervals: Map<string, string>;
  private minuteBuffer: Map<string, BufferEntry[]>;
  private logger: Logger;

  constructor(plugin: ReconPlugin, config: UptimeBehaviorConfig = {}) {
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
    this.logger = console as Logger;
  }

  async startMonitoring(target: Target): Promise<UptimeStatus | null> {
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
      await cronManager.scheduleInterval(
        this.config.checkInterval,
        () => this._performCheck(target),
        checkJobName
      );

      this.checkIntervals.set(host, checkJobName);
    }

    if (!this.aggregationIntervals.has(host)) {
      const cronManager = getCronManager();
      const aggregationJobName = `uptime-aggregation-${host}-${Date.now()}`;
      await cronManager.scheduleInterval(
        this.config.aggregationInterval,
        () => this._aggregateMinute(target),
        aggregationJobName
      );

      this.aggregationIntervals.set(host, aggregationJobName);
    }

    return this.getStatus(host);
  }

  stopMonitoring(host: string): void {
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

  getStatus(host: string): UptimeStatus | null {
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

  getAllStatuses(): UptimeStatus[] {
    const statuses: UptimeStatus[] = [];
    for (const host of this.checks.keys()) {
      const status = this.getStatus(host);
      if (status) {
        statuses.push(status);
      }
    }
    return statuses;
  }

  private async _performCheck(target: Target): Promise<void> {
    const host = target.host;
    const check = this.checks.get(host);
    if (!check) return;

    const timestamp = new Date().toISOString();
    const results: CheckResults = {
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
      } catch (error: any) {
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
    } else {
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

  private async _aggregateMinute(target: Target): Promise<void> {
    const host = target.host;
    const check = this.checks.get(host);
    const buffer = this.minuteBuffer.get(host) || [];

    if (buffer.length === 0 || !check) return;

    const minuteCohort = this._extractMinuteCohort(buffer[0]!.timestamp);
    const successCount = buffer.filter(c => c.status === 'up').length;
    const failCount = buffer.filter(c => c.status === 'down').length;
    const uptimePercent = ((successCount / buffer.length) * 100).toFixed(2);

    const avgLatencies = this._calculateAverageLatencies(buffer);

    const minuteRecord: MinuteRecord = {
      minuteCohort,
      timestamp: buffer[0]!.timestamp,
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

  private _extractMinuteCohort(isoTimestamp: string): string {
    return isoTimestamp.substring(0, 16);
  }

  private _calculateAverageLatencies(buffer: BufferEntry[]): Record<string, LatencyStats> {
    const latencies: Record<string, LatencyStats> = {};
    const methods = Object.keys(buffer[0]?.methods || {});

    for (const method of methods) {
      const values = buffer
        .map(b => b.latency?.[method])
        .filter((v): v is number => v != null && !isNaN(v));

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

  private _extractLatency(methods: Record<string, MethodResult>): Record<string, number | null> {
    const latencies: Record<string, number | null> = {};

    for (const [method, result] of Object.entries(methods)) {
      if (result.status === 'ok') {
        latencies[method] = result.latency || result.duration || null;
      }
    }

    return latencies;
  }

  private async _checkPing(target: Target): Promise<MethodResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const proc: ChildProcessWithoutNullStreams = spawn('ping', ['-c', '1', '-W', String(Math.floor(this.config.timeout / 1000)), target.host]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        const duration = Date.now() - startTime;

        if (code === 0) {
          const match = stdout.match(/time=([0-9.]+)\s*ms/);
          const latency = match ? parseFloat(match[1]!) : null;

          resolve({
            status: 'ok',
            latency,
            duration
          });
        } else {
          resolve({
            status: 'error',
            error: stderr || 'Ping failed',
            duration
          });
        }
      });

      proc.on('error', (error: Error) => {
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

  private async _checkHttp(target: Target): Promise<MethodResult> {
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

      req.on('error', (error: Error) => {
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

  private async _checkDns(target: Target): Promise<MethodResult> {
    const startTime = Date.now();

    try {
      const addresses = await dns.resolve4(target.host);
      const duration = Date.now() - startTime;

      return {
        status: 'ok',
        addresses,
        duration
      };
    } catch (error: any) {
      return {
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  private async _handleTransition(target: Target, fromStatus: 'unknown' | 'up' | 'down', toStatus: 'up' | 'down', checkResults: CheckResults): Promise<void> {
    const transition: Transition = {
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

  private async _sendDowntimeAlert(target: Target, transition: Transition): Promise<void> {
    const check = this.checks.get(target.host);
    this.logger.warn(`[ALERT] Target ${target.host} is DOWN!`, {
      consecutiveFails: check?.consecutiveFails,
      lastUp: check?.lastUp,
      checkResults: transition.checkResults
    });
  }

  private _pruneHistory(check: CheckState): void {
    const cutoffTime = Date.now() - this.config.retainHistory;
    check.history = check.history.filter(entry => {
      return new Date(entry.timestamp).getTime() > cutoffTime;
    });
  }

  private async _persistStatus(host: string, check: CheckState): Promise<void> {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

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
    } catch (error: any) {
      this.logger.error(`Failed to persist uptime status for ${host}:`, error.message);
    }
  }

  private async _persistTransition(transition: Transition): Promise<void> {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const namespace = this.plugin.namespace || '';
      const timestamp = transition.timestamp.replace(/[:.]/g, '-');
      const key = storage.getPluginKey(null, namespace, 'uptime', transition.host, 'transitions', `${timestamp}.json`);

      await storage.set(key, transition, { behavior: 'body-only' });
    } catch (error: any) {
      this.logger.error(`Failed to persist transition for ${transition.host}:`, error.message);
    }
  }

  private async _persistMinuteCohort(host: string, minuteRecord: MinuteRecord): Promise<void> {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const namespace = this.plugin.namespace || '';

      const day = minuteRecord.minuteCohort.substring(0, 10);
      const hourMinute = minuteRecord.minuteCohort.substring(11).replace(':', '-');

      const key = storage.getPluginKey(null, namespace, 'uptime', host, 'cohorts', day, `${hourMinute}.json`);

      await storage.set(key, minuteRecord, { behavior: 'body-only' });
    } catch (error: any) {
      this.logger.error(`Failed to persist minute cohort for ${host}:`, error.message);
    }
  }

  private async _persistRawCheck(host: string, checkResult: CheckResults): Promise<void> {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const namespace = this.plugin.namespace || '';
      const timestamp = checkResult.timestamp.replace(/[:.]/g, '-');
      const key = storage.getPluginKey(null, namespace, 'uptime', host, 'raw', `${timestamp}.json`);

      await storage.set(key, checkResult, { behavior: 'body-only' });
    } catch (error: any) {
      this.logger.error(`Failed to persist raw check for ${host}:`, error.message);
    }
  }

  async loadStatus(host: string): Promise<any> {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return null;

      const namespace = this.plugin.namespace || '';
      const key = storage.getPluginKey(null, namespace, 'uptime', host, 'status.json');
      return await storage.get(key);
    } catch (error) {
      return null;
    }
  }

  async linkReportToUptime(host: string, reportId: string, reportTimestamp: string): Promise<void> {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const status = this.getStatus(host);
      if (!status) return;

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
    } catch (error: any) {
      this.logger.error(`Failed to link report to uptime for ${host}:`, error.message);
    }
  }

  cleanup(): void {
    for (const host of this.checkIntervals.keys()) {
      this.stopMonitoring(host);
    }

    this.checks.clear();
    this.checkIntervals.clear();
    this.aggregationIntervals.clear();
    this.minuteBuffer.clear();
  }
}
