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
 * ```javascript
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
  constructor(plugin, config = {}) {
    this.plugin = plugin;
    this.config = {
      enabled: true,
      checkInterval: 20000,         // Check every 20 seconds
      aggregationInterval: 60000,   // Aggregate every 60 seconds (1 minute cohorts)
      methods: ['ping', 'http'],    // ping, http, dns
      alertOnDowntime: true,
      downtimeThreshold: 3,         // Failed checks before considered down
      timeout: 5000,                // 5 seconds timeout
      retainHistory: 30 * 24 * 60 * 60 * 1000,  // 30 days
      persistRawChecks: false,      // Only persist aggregated data
      ...config
    };

    this.checks = new Map();              // target.host -> { status, consecutiveFails, lastCheck, history }
    this.checkIntervals = new Map();      // target.host -> jobName (20s checks)
    this.aggregationIntervals = new Map(); // target.host -> jobName (60s aggregation)
    this.minuteBuffer = new Map();        // target.host -> [check1, check2, check3] (buffer for current minute)
  }

  /**
   * Start monitoring a target
   */
  async startMonitoring(target) {
    const host = target.host;

    // Initialize check state
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
        history: []  // Stores minute-aggregated data
      });
    }

    // Initialize minute buffer
    if (!this.minuteBuffer.has(host)) {
      this.minuteBuffer.set(host, []);
    }

    // Start periodic checks (every 20 seconds)
    if (!this.checkIntervals.has(host)) {
      // Run first check immediately
      await this._performCheck(target);

      // Schedule periodic checks
      const cronManager = getCronManager();
      const checkJobName = cronManager.scheduleInterval(
        this.config.checkInterval,
        () => this._performCheck(target),
        `uptime-check-${host}-${Date.now()}`
      );

      this.checkIntervals.set(host, checkJobName);
    }

    // Start aggregation interval (every 60 seconds)
    if (!this.aggregationIntervals.has(host)) {
      const cronManager = getCronManager();
      const aggregationJobName = cronManager.scheduleInterval(
        this.config.aggregationInterval,
        () => this._aggregateMinute(target),
        `uptime-aggregation-${host}-${Date.now()}`
      );

      this.aggregationIntervals.set(host, aggregationJobName);
    }

    return this.getStatus(host);
  }

  /**
   * Stop monitoring a target
   */
  stopMonitoring(host) {
    const cronManager = getCronManager();

    // Stop check interval
    const checkJobName = this.checkIntervals.get(host);
    if (checkJobName) {
      cronManager.stop(checkJobName);
      this.checkIntervals.delete(host);
    }

    // Stop aggregation interval
    const aggregationJobName = this.aggregationIntervals.get(host);
    if (aggregationJobName) {
      cronManager.stop(aggregationJobName);
      this.aggregationIntervals.delete(host);
    }

    // Clear minute buffer
    this.minuteBuffer.delete(host);
  }

  /**
   * Get current uptime status for a target
   */
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
      recentHistory: check.history.slice(-10) // Last 10 checks
    };
  }

  /**
   * Get uptime statistics for all monitored targets
   */
  getAllStatuses() {
    const statuses = [];
    for (const host of this.checks.keys()) {
      statuses.push(this.getStatus(host));
    }
    return statuses;
  }

  /**
   * Perform a health check on a target
   */
  async _performCheck(target) {
    const host = target.host;
    const check = this.checks.get(host);
    if (!check) return;

    const timestamp = new Date().toISOString();
    const results = {
      timestamp,
      methods: {}
    };

    // Run all configured check methods
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
      } catch (error) {
        results.methods[method] = {
          status: 'error',
          error: error.message
        };
      }
    }

    // Determine overall status (at least one method succeeded)
    const anySuccess = Object.values(results.methods).some(r => r.status === 'ok');
    results.overallStatus = anySuccess ? 'up' : 'down';

    // Update check state
    check.totalChecks++;
    check.lastCheck = timestamp;

    if (results.overallStatus === 'up') {
      check.successfulChecks++;
      check.consecutiveFails = 0;
      check.consecutiveSuccess++;
      check.lastUp = timestamp;

      // Transition from down to up
      if (check.status === 'down') {
        await this._handleTransition(target, 'down', 'up', results);
      }

      check.status = 'up';
    } else {
      check.failedChecks++;
      check.consecutiveFails++;
      check.consecutiveSuccess = 0;

      // Check if threshold reached
      if (check.consecutiveFails >= this.config.downtimeThreshold) {
        check.lastDown = timestamp;

        // Transition from up to down
        if (check.status !== 'down') {
          await this._handleTransition(target, check.status, 'down', results);
        }

        check.status = 'down';
      }
    }

    // Add to minute buffer for aggregation
    const buffer = this.minuteBuffer.get(host) || [];
    buffer.push({
      timestamp,
      status: results.overallStatus,
      methods: results.methods,
      latency: this._extractLatency(results.methods)
    });
    this.minuteBuffer.set(host, buffer);

    // Optionally persist raw checks (if enabled)
    if (this.config.persistRawChecks) {
      await this._persistRawCheck(host, results);
    }
  }

  /**
   * Aggregate minute buffer and persist
   */
  async _aggregateMinute(target) {
    const host = target.host;
    const check = this.checks.get(host);
    const buffer = this.minuteBuffer.get(host) || [];

    if (buffer.length === 0) return;

    // Calculate minute-aggregated metrics
    const minuteCohort = this._extractMinuteCohort(buffer[0].timestamp);
    const successCount = buffer.filter(c => c.status === 'up').length;
    const failCount = buffer.filter(c => c.status === 'down').length;
    const uptimePercent = ((successCount / buffer.length) * 100).toFixed(2);

    // Calculate average latency per method
    const avgLatencies = this._calculateAverageLatencies(buffer);

    // Create aggregated minute record
    const minuteRecord = {
      minuteCohort,  // "2025-01-01T12:34" (minute precision)
      timestamp: buffer[0].timestamp,  // First check of the minute
      sampleCount: buffer.length,
      successCount,
      failCount,
      uptimePercent,
      avgLatencies,
      overallStatus: uptimePercent >= 66.67 ? 'up' : 'down'  // 2/3 samples up = minute up
    };

    // Add to history (minute-aggregated)
    check.history.push(minuteRecord);

    // Prune old history
    this._pruneHistory(check);

    // Persist aggregated status
    await this._persistStatus(host, check);

    // Persist minute cohort
    await this._persistMinuteCohort(host, minuteRecord);

    // Clear buffer
    this.minuteBuffer.set(host, []);
  }

  /**
   * Extract minute cohort from ISO timestamp
   */
  _extractMinuteCohort(isoTimestamp) {
    // "2025-01-01T12:34:56.789Z" -> "2025-01-01T12:34"
    return isoTimestamp.substring(0, 16);
  }

  /**
   * Calculate average latencies across samples
   */
  _calculateAverageLatencies(buffer) {
    const latencies = {};
    const methods = Object.keys(buffer[0]?.methods || {});

    for (const method of methods) {
      const values = buffer
        .map(b => b.latency?.[method])
        .filter(v => v != null && !isNaN(v));

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

  /**
   * Extract latency from check methods
   */
  _extractLatency(methods) {
    const latencies = {};

    for (const [method, result] of Object.entries(methods)) {
      if (result.status === 'ok') {
        latencies[method] = result.latency || result.duration || null;
      }
    }

    return latencies;
  }

  /**
   * Check target via ICMP ping
   */
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
          // Extract latency from ping output
          const match = stdout.match(/time=([0-9.]+)\s*ms/);
          const latency = match ? parseFloat(match[1]) : null;

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

      proc.on('error', (error) => {
        resolve({
          status: 'error',
          error: error.message,
          duration: Date.now() - startTime
        });
      });

      // Timeout handling
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

  /**
   * Check target via HTTP/HTTPS request
   */
  async _checkHttp(target) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const protocol = target.protocol === 'http' ? http : https;
      const port = target.port || (target.protocol === 'http' ? 80 : 443);
      const url = `${target.protocol}://${target.host}:${port}${target.path || '/'}`;

      const req = protocol.get(url, {
        timeout: this.config.timeout,
        rejectUnauthorized: false // Accept self-signed certs
      }, (res) => {
        const duration = Date.now() - startTime;

        resolve({
          status: 'ok',
          statusCode: res.statusCode,
          duration
        });

        // Consume response to free up memory
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

  /**
   * Check target via DNS resolution
   */
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
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Handle status transitions (up->down, down->up)
   */
  async _handleTransition(target, fromStatus, toStatus, checkResults) {
    const transition = {
      host: target.host,
      from: fromStatus,
      to: toStatus,
      timestamp: new Date().toISOString(),
      checkResults
    };

    // Emit event
    if (this.plugin.emit) {
      this.plugin.emit('uptime:transition', transition);
    }

    // Alert on downtime
    if (toStatus === 'down' && this.config.alertOnDowntime) {
      await this._sendDowntimeAlert(target, transition);
    }

    // Log transition
    console.log(`[UptimeBehavior] ${target.host}: ${fromStatus} -> ${toStatus}`);

    // Persist transition event
    await this._persistTransition(transition);
  }

  /**
   * Send downtime alert
   */
  async _sendDowntimeAlert(target, transition) {
    // This can be extended to send alerts via:
    // - Webhook
    // - Email
    // - Slack/Discord
    // - PagerDuty
    // For now, just log

    console.warn(`[ALERT] Target ${target.host} is DOWN!`, {
      consecutiveFails: this.checks.get(target.host).consecutiveFails,
      lastUp: this.checks.get(target.host).lastUp,
      checkResults: transition.checkResults
    });
  }

  /**
   * Prune old history entries
   */
  _pruneHistory(check) {
    const cutoffTime = Date.now() - this.config.retainHistory;
    check.history = check.history.filter(entry => {
      return new Date(entry.timestamp).getTime() > cutoffTime;
    });
  }

  /**
   * Persist uptime status to plugin storage
   */
  async _persistStatus(host, check) {
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
    } catch (error) {
      console.error(`Failed to persist uptime status for ${host}:`, error.message);
    }
  }

  /**
   * Persist transition event
   */
  async _persistTransition(transition) {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const namespace = this.plugin.namespace || '';
      const timestamp = transition.timestamp.replace(/[:.]/g, '-');
      const key = storage.getPluginKey(null, namespace, 'uptime', transition.host, 'transitions', `${timestamp}.json`);

      await storage.set(key, transition, { behavior: 'body-only' });
    } catch (error) {
      console.error(`Failed to persist transition for ${transition.host}:`, error.message);
    }
  }

  /**
   * Persist minute cohort (aggregated data)
   */
  async _persistMinuteCohort(host, minuteRecord) {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const namespace = this.plugin.namespace || '';

      // Store minute cohorts: plugin=recon/<namespace>/uptime/<host>/cohorts/<YYYY-MM-DD>/<HH-MM>.json
      const day = minuteRecord.minuteCohort.substring(0, 10); // "2025-01-01"
      const hourMinute = minuteRecord.minuteCohort.substring(11).replace(':', '-'); // "12-34"

      const key = storage.getPluginKey(null, namespace, 'uptime', host, 'cohorts', day, `${hourMinute}.json`);

      await storage.set(key, minuteRecord, { behavior: 'body-only' });
    } catch (error) {
      console.error(`Failed to persist minute cohort for ${host}:`, error.message);
    }
  }

  /**
   * Persist raw check (if enabled)
   */
  async _persistRawCheck(host, checkResult) {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const namespace = this.plugin.namespace || '';
      const timestamp = checkResult.timestamp.replace(/[:.]/g, '-');
      const key = storage.getPluginKey(null, namespace, 'uptime', host, 'raw', `${timestamp}.json`);

      await storage.set(key, checkResult, { behavior: 'body-only' });
    } catch (error) {
      console.error(`Failed to persist raw check for ${host}:`, error.message);
    }
  }

  /**
   * Load historical status from storage
   */
  async loadStatus(host) {
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

  /**
   * Associate a scan report with uptime history
   * This creates a link between reconnaissance scans and uptime monitoring
   */
  async linkReportToUptime(host, reportId, reportTimestamp) {
    try {
      const storage = this.plugin.getStorage();
      if (!storage) return;

      const status = this.getStatus(host);
      if (!status) return;

      const namespace = this.plugin.namespace || '';

      // Create a link entry
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
    } catch (error) {
      console.error(`Failed to link report to uptime for ${host}:`, error.message);
    }
  }

  /**
   * Cleanup - stop all monitoring
   */
  cleanup() {
    // Stop all check intervals
    for (const host of this.checkIntervals.keys()) {
      this.stopMonitoring(host);
    }

    // Clear all maps
    this.checks.clear();
    this.checkIntervals.clear();
    this.aggregationIntervals.clear();
    this.minuteBuffer.clear();
  }
}
