/**
 * ReconPlugin - Modular Refactored Version
 *
 * Main orchestrator that coordinates managers, stages, and concerns.
 * Backward compatible with the original monolithic API.
 *
 * Architecture:
 * - Managers: Handle high-level operations (storage, targets, scheduling, dependencies)
 * - Stages: Execute individual reconnaissance tasks (DNS, ports, subdomains, etc.)
 * - Concerns: Shared utilities (command runner, normalizer, report generator, etc.)
 */

import { Plugin } from '../plugin.class.js';

// Managers
import { StorageManager } from './managers/storage-manager.js';
import { TargetManager } from './managers/target-manager.js';
import { SchedulerManager } from './managers/scheduler-manager.js';
import { DependencyManager } from './managers/dependency-manager.js';

// Stages
import { DnsStage } from './stages/dns-stage.js';
import { CertificateStage } from './stages/certificate-stage.js';
import { LatencyStage } from './stages/latency-stage.js';
import { HttpStage } from './stages/http-stage.js';
import { PortsStage } from './stages/ports-stage.js';
import { SubdomainsStage } from './stages/subdomains-stage.js';
import { WebDiscoveryStage } from './stages/web-discovery-stage.js';
import { VulnerabilityStage } from './stages/vulnerability-stage.js';
import { TlsAuditStage } from './stages/tls-audit-stage.js';
import { FingerprintStage } from './stages/fingerprint-stage.js';
import { ScreenshotStage } from './stages/screenshot-stage.js';
import { OsintStage } from './stages/osint-stage.js';
import { WhoisStage } from './stages/whois-stage.js';

// Concerns
import { CommandRunner } from './concerns/command-runner.js';
import { TargetNormalizer } from './concerns/target-normalizer.js';
import { FingerprintBuilder } from './concerns/fingerprint-builder.js';
import { ReportGenerator } from './concerns/report-generator.js';
import { DiffDetector } from './concerns/diff-detector.js';

// Behaviors
import { UptimeBehavior } from './behaviors/uptime-behavior.js';

// Config
import { DEFAULT_CONFIG, BEHAVIOR_PRESETS } from './config/defaults.js';

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * ReconPlugin
 *
 * Main plugin class that orchestrates reconnaissance operations.
 */
export class ReconPlugin extends Plugin {
  static pluginName = 'recon';

  constructor(config = {}) {
    // Pass config to base class (includes namespace handling)
    super(config);

    // Apply behavior preset if specified
    let baseConfig = DEFAULT_CONFIG;

    if (config.behavior && BEHAVIOR_PRESETS[config.behavior]) {
      const preset = BEHAVIOR_PRESETS[config.behavior];
      baseConfig = {
        ...DEFAULT_CONFIG,
        ...preset,
        features: {
          ...DEFAULT_CONFIG.features,
          ...preset.features
        }
      };

      // Emit behavior-applied event
      setTimeout(() => {
        this.emit('recon:behavior-applied', {
          mode: config.behavior,
          preset,
          overrides: config.behaviorOverrides || {},
          final: this.config
        });
      }, 0);
    }

    // Merge with defaults (and preset if applicable)
    this.config = {
      ...baseConfig,
      ...config,
      features: deepMerge(
        deepMerge(baseConfig.features, config.features || {}),
        config.behaviorOverrides?.features || {}
      ),
      storage: {
        ...baseConfig.storage,
        ...(config.storage || {})
      }
    };

    // Initialize command runner
    this.commandRunner = new CommandRunner();

    // Initialize managers
    this.storageManager = null; // Initialized in initialize()
    this.targetManager = null;
    this.schedulerManager = null;
    this.dependencyManager = new DependencyManager(this);

    // Initialize stages
    this.stages = {
      dns: new DnsStage(this),
      certificate: new CertificateStage(this),
      latency: new LatencyStage(this),
      http: new HttpStage(this),
      ports: new PortsStage(this),
      subdomains: new SubdomainsStage(this),
      webDiscovery: new WebDiscoveryStage(this),
      vulnerability: new VulnerabilityStage(this),
      tlsAudit: new TlsAuditStage(this),
      fingerprint: new FingerprintStage(this),
      screenshot: new ScreenshotStage(this),
      osint: new OsintStage(this),
      whois: new WhoisStage(this)
    };
  }

  /**
   * Plugin initialization hook
   */
  async initialize() {
    // Initialize managers that need database access
    this.storageManager = new StorageManager(this);
    this.targetManager = new TargetManager(this);
    this.schedulerManager = new SchedulerManager(this);

    // Initialize uptime behavior if enabled
    if (this.config.behaviors?.uptime?.enabled) {
      this.uptimeBehavior = new UptimeBehavior(this, this.config.behaviors.uptime);
    }

    // Create plugin storage resources
    await this.storageManager.initialize();

    // Start scheduler if enabled
    if (this.config.scheduler?.enabled) {
      await this.schedulerManager.start();
    }

    // Check tool dependencies
    await this.dependencyManager.checkAll();
  }

  /**
   * Plugin cleanup hook
   */
  async cleanup() {
    // Stop scheduler
    if (this.schedulerManager) {
      await this.schedulerManager.stop();
    }

    // Stop uptime monitoring
    if (this.uptimeBehavior) {
      this.uptimeBehavior.cleanup();
    }

    // Clear command runner cache
    this.commandRunner.clearCache();
  }

  /**
   * Scan a target (main public API)
   *
   * @param {string|object} target - Target URL/domain or normalized target object
   * @param {object} options - Scan options
   * @returns {Promise<object>} Scan report
   */
  async scan(target, options = {}) {
    const startTime = Date.now();

    // Normalize target
    const normalizedTarget = typeof target === 'string'
      ? TargetNormalizer.normalize(target)
      : target;

    // Merge options with config
    const scanConfig = {
      ...this.config.features,
      ...options
    };

    // Execute scan
    const results = {};

    // DNS stage
    if (scanConfig.dns !== false) {
      results.dns = await this.stages.dns.execute(normalizedTarget, scanConfig.dns);
    }

    // Certificate stage
    if (scanConfig.certificate !== false) {
      results.certificate = await this.stages.certificate.execute(normalizedTarget, scanConfig.certificate);
    }

    // WHOIS stage
    if (scanConfig.whois !== false) {
      results.whois = await this.stages.whois.execute(normalizedTarget, scanConfig.whois);
    }

    // Latency stage
    if (scanConfig.latency !== false) {
      results.latency = await this.stages.latency.execute(normalizedTarget, scanConfig.latency);
    }

    // HTTP stage
    if (scanConfig.http !== false) {
      results.http = await this.stages.http.execute(normalizedTarget, scanConfig.http);
    }

    // Ports stage
    if (scanConfig.ports !== false) {
      results.ports = await this.stages.ports.execute(normalizedTarget, scanConfig.ports);
    }

    // Subdomains stage
    if (scanConfig.subdomains !== false) {
      results.subdomains = await this.stages.subdomains.execute(normalizedTarget, scanConfig.subdomains);
    }

    // Web discovery stage
    if (scanConfig.webDiscovery !== false) {
      results.webDiscovery = await this.stages.webDiscovery.execute(normalizedTarget, scanConfig.webDiscovery);
    }

    // Vulnerability stage
    if (scanConfig.vulnerability !== false) {
      results.vulnerability = await this.stages.vulnerability.execute(normalizedTarget, scanConfig.vulnerability);
    }

    // TLS audit stage
    if (scanConfig.tlsAudit !== false) {
      results.tlsAudit = await this.stages.tlsAudit.execute(normalizedTarget, scanConfig.tlsAudit);
    }

    // Fingerprint stage
    if (scanConfig.fingerprint !== false) {
      results.fingerprint = await this.stages.fingerprint.execute(normalizedTarget, scanConfig.fingerprint);
    }

    // Screenshot stage
    if (scanConfig.screenshot !== false) {
      results.screenshot = await this.stages.screenshot.execute(normalizedTarget, scanConfig.screenshot);
    }

    // OSINT stage
    if (scanConfig.osint !== false) {
      results.osint = await this.stages.osint.execute(normalizedTarget, scanConfig.osint);
    }

    // Build consolidated fingerprint
    const fingerprint = FingerprintBuilder.build(results);

    // Get uptime status if monitoring is enabled
    let uptimeStatus = null;
    if (this.uptimeBehavior) {
      try {
        uptimeStatus = this.uptimeBehavior.getStatus(normalizedTarget.host);
      } catch (error) {
        // Uptime not monitored for this target, skip
      }
    }

    // Create report
    const report = {
      id: this._generateReportId(),
      timestamp: new Date().toISOString(),
      target: normalizedTarget,
      duration: Date.now() - startTime,
      status: 'completed',
      results,
      fingerprint,
      uptime: uptimeStatus ? {
        status: uptimeStatus.status,
        uptimePercentage: uptimeStatus.uptimePercentage,
        lastCheck: uptimeStatus.lastCheck,
        isDown: uptimeStatus.isDown,
        consecutiveFails: uptimeStatus.consecutiveFails
      } : null
    };

    // Persist report if storage enabled and manager is initialized
    if (this.config.storage.enabled && this.storageManager) {
      // Layer 1 + 2: Persist to PluginStorage (raw + aggregated)
      await this.storageManager.persistReport(normalizedTarget, report);

      // Layer 3: Persist to Database Resources (queryable)
      if (this.config.resources.persist) {
        await this.storageManager.persistToResources(report);
      }

      // Link report to uptime monitoring if enabled
      if (this.uptimeBehavior && uptimeStatus) {
        await this.uptimeBehavior.linkReportToUptime(
          normalizedTarget.host,
          report.id,
          report.timestamp
        );
      }
    }

    return report;
  }

  /**
   * Scan multiple targets in batch
   */
  async batchScan(targets, options = {}) {
    const results = [];

    for (const target of targets) {
      try {
        const report = await this.scan(target, options);
        results.push(report);
      } catch (error) {
        results.push({
          target: typeof target === 'string' ? target : target.original,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get scan report by ID
   */
  async getReport(reportId) {
    return this.storageManager.getReport(reportId);
  }

  /**
   * List all reports
   */
  async listReports(options = {}) {
    return this.storageManager.listReports(options);
  }

  /**
   * Get reports for a specific host
   */
  async getReportsByHost(host, options = {}) {
    if (!this.storageManager) {
      return [];
    }
    return this.storageManager.getReportsByHost(host, options);
  }

  /**
   * Compare two reports and detect changes
   */
  async compareReports(reportId1, reportId2) {
    const [report1, report2] = await Promise.all([
      this.storageManager.getReport(reportId1),
      this.storageManager.getReport(reportId2)
    ]);

    return DiffDetector.detect(report1, report2);
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report) {
    return ReportGenerator.generateMarkdown(report);
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(report) {
    return ReportGenerator.generateJSON(report);
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(report) {
    return ReportGenerator.generateHTML(report);
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary(report) {
    return ReportGenerator.generateExecutiveSummary(report);
  }

  /**
   * Add dynamic target for scheduled scanning
   */
  async addTarget(target, schedule = null) {
    return this.targetManager.addTarget(target, schedule);
  }

  /**
   * Remove dynamic target
   */
  async removeTarget(targetId) {
    return this.targetManager.removeTarget(targetId);
  }

  /**
   * List all dynamic targets
   */
  async listTargets() {
    return this.targetManager.listTargets();
  }

  /**
   * Update target schedule
   */
  async updateTargetSchedule(targetId, schedule) {
    return this.targetManager.updateSchedule(targetId, schedule);
  }

  /**
   * Get tool availability status
   */
  async getToolStatus() {
    return this.dependencyManager.getStatus();
  }

  /**
   * Check if a specific tool is available
   */
  async isToolAvailable(toolName) {
    return this.commandRunner.isAvailable(toolName);
  }

  /**
   * Run a scheduled sweep of all targets
   */
  async runScheduledSweep() {
    return this.schedulerManager.runSweep();
  }

  /**
   * Get diff between latest scans for a host
   */
  async getLatestDiff(host) {
    const reports = await this.getReportsByHost(host, { limit: 2, sort: 'desc' });

    if (reports.length < 2) {
      return null;
    }

    return DiffDetector.detect(reports[1], reports[0]);
  }

  /**
   * Get fingerprint for a host
   */
  async getFingerprint(host) {
    const reports = await this.getReportsByHost(host, { limit: 1 });

    if (reports.length === 0) {
      return null;
    }

    return reports[0].fingerprint;
  }

  /**
   * Generate report ID
   */
  _generateReportId() {
    return `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ============================================================================
  // UPTIME BEHAVIOR METHODS
  // ============================================================================

  /**
   * Start monitoring uptime for a target
   */
  async startUptimeMonitoring(target) {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled. Set config.behaviors.uptime.enabled = true');
    }

    const normalizedTarget = typeof target === 'string'
      ? TargetNormalizer.normalize(target)
      : target;

    return await this.uptimeBehavior.startMonitoring(normalizedTarget);
  }

  /**
   * Stop monitoring uptime for a target
   */
  stopUptimeMonitoring(host) {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return this.uptimeBehavior.stopMonitoring(host);
  }

  /**
   * Get uptime status for a target
   */
  getUptimeStatus(host) {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return this.uptimeBehavior.getStatus(host);
  }

  /**
   * Get uptime statuses for all monitored targets
   */
  getAllUptimeStatuses() {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return this.uptimeBehavior.getAllStatuses();
  }

  /**
   * Load historical uptime status from storage
   */
  async loadUptimeStatus(host) {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return await this.uptimeBehavior.loadStatus(host);
  }

  // ============================================================================
  // BACKWARD COMPATIBILITY METHODS
  // These methods maintain compatibility with the original monolithic API
  // ============================================================================

  /**
   * Legacy method: runDiagnostics (alias for scan)
   * @deprecated Use scan() instead
   */
  async runDiagnostics(target, options = {}) {
    return this.scan(target, options);
  }

  /**
   * Legacy method: generateClientReport
   * @deprecated Use generateMarkdownReport() instead
   */
  async generateClientReport(host, format = 'markdown') {
    const reports = await this.getReportsByHost(host, { limit: 1 });

    if (reports.length === 0) {
      return format === 'json' ? '{}' : '# No reports found';
    }

    const report = reports[0];

    if (format === 'json') {
      return this.generateJSONReport(report);
    }

    return this.generateMarkdownReport(report);
  }

  /**
   * Legacy method: _runWebDiscovery (now part of stages)
   * @deprecated Access via stages.webDiscovery.execute() instead
   */
  async _runWebDiscovery(target, config) {
    return this.stages.webDiscovery.execute(target, config);
  }

  /**
   * Legacy method: _emitDiffAlerts
   * @deprecated Use compareReports() and handle alerts manually
   */
  async _emitDiffAlerts(host, report, diffs) {
    for (const diff of diffs) {
      if (diff.severity === 'critical' || diff.severity === 'high') {
        this.emit('recon:alert', {
          host,
          severity: diff.severity,
          change: diff.change,
          timestamp: report.timestamp
        });
      }
    }
  }

  /**
   * Legacy method: _applyRateLimit
   * @deprecated Rate limiting is now handled automatically
   */
  async _applyRateLimit(stageName) {
    if (!this.config.rateLimit?.enabled) {
      return;
    }

    const delay = this.config.rateLimit.delayBetweenStages || 1000;

    this.emit('recon:rate-limit-delay', {
      stage: stageName,
      delayMs: delay
    });

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Legacy method: _getResource (proxy to database)
   * @deprecated Access via database.getResource() directly
   */
  async _getResource(resourceName) {
    if (!this.database) {
      return null;
    }

    const fullName = `plg_recon_${resourceName}`;

    try {
      return await this.database.getResource(fullName);
    } catch (error) {
      return null;
    }
  }

  /**
   * Legacy hook: afterInstall
   * Registers legacy alias database.plugins.network
   */
  afterInstall() {
    super.afterInstall();

    // Register legacy alias
    if (this.database) {
      this.database.plugins.network = this;
    }
  }

  /**
   * Legacy hook: afterUninstall
   * Removes legacy alias database.plugins.network
   */
  afterUninstall() {
    super.afterUninstall();

    // Remove legacy alias
    if (this.database && this.database.plugins.network === this) {
      delete this.database.plugins.network;
    }
  }
}

// Export for backward compatibility
export default ReconPlugin;
