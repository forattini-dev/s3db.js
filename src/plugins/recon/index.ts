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

import { Plugin, type PluginConfig } from '../plugin.class.js';

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
import { SecretsStage } from './stages/secrets-stage.js';
import { ASNStage } from './stages/asn-stage.js';
import { DNSDumpsterStage } from './stages/dnsdumpster-stage.js';
import { GoogleDorksStage } from './stages/google-dorks-stage.js';

// Concerns
import { CommandRunner } from './concerns/command-runner.js';
import { TargetNormalizer } from './concerns/target-normalizer.js';
import { FingerprintBuilder } from './concerns/fingerprint-builder.js';
import { ReportGenerator } from './concerns/report-generator.js';
import { DiffDetector } from './concerns/diff-detector.js';
import { SecurityAnalyzer } from './concerns/security-analyzer.js';
import { ProcessManager } from './concerns/process-manager.js';

// Behaviors
import { UptimeBehavior, UptimeBehaviorConfig, UptimeStatus } from './behaviors/uptime-behavior.js';

// Config
import { DEFAULT_CONFIG, BEHAVIOR_PRESETS } from './config/defaults.js';

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
  original?: string;
}

export interface ScanFeatures {
  dns?: boolean | Record<string, any>;
  certificate?: boolean | Record<string, any>;
  whois?: boolean | Record<string, any>;
  latency?: boolean | Record<string, any>;
  http?: boolean | Record<string, any>;
  ports?: boolean | Record<string, any>;
  subdomains?: boolean | Record<string, any>;
  webDiscovery?: boolean | Record<string, any>;
  vulnerability?: boolean | Record<string, any>;
  tlsAudit?: boolean | Record<string, any>;
  fingerprint?: boolean | Record<string, any>;
  screenshot?: boolean | Record<string, any>;
  osint?: boolean | Record<string, any>;
  secrets?: boolean | Record<string, any>;
  asn?: boolean | Record<string, any>;
  dnsdumpster?: boolean | Record<string, any>;
  googleDorks?: boolean | Record<string, any>;
}

export interface ReconConfig {
  behavior?: string;
  behaviorOverrides?: {
    features?: Partial<ScanFeatures>;
  };
  features?: Partial<ScanFeatures>;
  storage?: {
    enabled?: boolean;
    [key: string]: any;
  };
  scheduler?: {
    enabled?: boolean;
    [key: string]: any;
  };
  behaviors?: {
    uptime?: UptimeBehaviorConfig;
  };
  resources?: {
    persist?: boolean;
    [key: string]: any;
  };
  rateLimit?: {
    enabled?: boolean;
    delayBetweenStages?: number;
    requestsPerMinute?: number;
  };
  [key: string]: any;
}

export interface ScanReport {
  id: string;
  timestamp: string;
  target: Target;
  duration: number;
  status: 'completed' | 'error';
  results: Record<string, any>;
  fingerprint: Record<string, any>;
  uptime: {
    status: string;
    uptimePercentage: string;
    lastCheck: string | null;
    isDown: boolean;
    consecutiveFails: number;
  } | null;
}

export interface DiffResult {
  added: string[];
  removed: string[];
  changed: Record<string, { old: any; new: any }>;
}

export interface SecurityAudit {
  findings: any[];
  recommendations: string[];
  score: number;
}

interface Stages {
  dns: DnsStage;
  certificate: CertificateStage;
  latency: LatencyStage;
  http: HttpStage;
  ports: PortsStage;
  subdomains: SubdomainsStage;
  webDiscovery: WebDiscoveryStage;
  vulnerability: VulnerabilityStage;
  tlsAudit: TlsAuditStage;
  fingerprint: FingerprintStage;
  screenshot: ScreenshotStage;
  osint: OsintStage;
  whois: WhoisStage;
  secrets: SecretsStage;
  asn: ASNStage;
  dnsdumpster: DNSDumpsterStage;
  googleDorks: GoogleDorksStage;
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target } as T;
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      const sourceValue = source[key as keyof typeof source];
      if (isObject(sourceValue)) {
        if (!(key in target)) {
          (output as any)[key] = sourceValue;
        } else {
          (output as any)[key] = deepMerge((target as any)[key], sourceValue as Record<string, any>);
        }
      } else {
        (output as any)[key] = sourceValue;
      }
    });
  }
  return output;
}

function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export class ReconPlugin extends Plugin {
  static pluginName = 'recon';

  config: ReconConfig;
  commandRunner: CommandRunner;
  processManager: ProcessManager;
  storageManager: StorageManager | null;
  targetManager: TargetManager | null;
  schedulerManager: SchedulerManager | null;
  dependencyManager: DependencyManager;
  stages: Stages;
  uptimeBehavior?: UptimeBehavior;

  constructor(config: ReconConfig = {}) {
    super(config as PluginConfig);

    let baseConfig = DEFAULT_CONFIG;
    const behaviorMode = config.behavior || 'default';

    if (config.behavior && BEHAVIOR_PRESETS[config.behavior as keyof typeof BEHAVIOR_PRESETS]) {
      const preset = BEHAVIOR_PRESETS[config.behavior as keyof typeof BEHAVIOR_PRESETS];
      baseConfig = {
        ...DEFAULT_CONFIG,
        ...preset!,
        features: {
          ...DEFAULT_CONFIG.features,
          ...preset!.features
        }
      };

      setTimeout(() => {
        this.emit('recon:behavior-applied', {
          mode: config.behavior,
          preset,
          overrides: config.behaviorOverrides || {},
          final: this.config
        });
      }, 0);
    }

    this.config = {
      ...baseConfig,
      ...config,
      behavior: behaviorMode,
      features: deepMerge(
        deepMerge(baseConfig.features || {}, (config.features || {}) as any) as any,
        (config.behaviorOverrides?.features || {}) as any
      ),
      storage: {
        ...baseConfig.storage,
        ...(config.storage || {})
      }
    };

    this.commandRunner = new CommandRunner(this as any);

    this.processManager = new ProcessManager();

    this.storageManager = null;
    this.targetManager = null;
    this.schedulerManager = null;
    this.dependencyManager = new DependencyManager(this as any);

    this.stages = {
      dns: new DnsStage(this as any),
      certificate: new CertificateStage(this as any),
      latency: new LatencyStage(this as any),
      http: new HttpStage(this as any),
      ports: new PortsStage(this as any),
      subdomains: new SubdomainsStage(this as any),
      webDiscovery: new WebDiscoveryStage(this as any),
      vulnerability: new VulnerabilityStage(this as any),
      tlsAudit: new TlsAuditStage(this as any),
      fingerprint: new FingerprintStage(this as any),
      screenshot: new ScreenshotStage(this as any),
      osint: new OsintStage(this as any),
      whois: new WhoisStage(this as any),
      secrets: new SecretsStage(this as any),
      asn: new ASNStage(this as any),
      dnsdumpster: new DNSDumpsterStage(this as any),
      googleDorks: new GoogleDorksStage(this as any)
    };
  }

  async initialize(): Promise<void> {
    this.storageManager = new StorageManager(this as any);
    this.targetManager = new TargetManager(this as any);
    this.schedulerManager = new SchedulerManager(this as any);

    if (this.config.behaviors?.uptime?.enabled) {
      this.uptimeBehavior = new UptimeBehavior(this as any, this.config.behaviors.uptime);
    }

    await this.storageManager.initialize();

    if (this.config.scheduler?.enabled) {
      await this.schedulerManager.start();
    }

    await this.dependencyManager.checkAll();
  }

  private async _applyRateLimit(stage: string): Promise<void> {
    const rateLimit = this.config?.rateLimit;
    if (!rateLimit || rateLimit.enabled === false) {
      return;
    }

    const delayMs =
      rateLimit.delayBetweenStages ??
      (rateLimit.requestsPerMinute
        ? Math.floor(60000 / Math.max(1, rateLimit.requestsPerMinute))
        : 0);

    if (delayMs > 0) {
      this.emit('recon:rate-limit-delay', {
        stage,
        delayMs
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  async cleanup(): Promise<void> {
    if (this.schedulerManager) {
      await this.schedulerManager.stop();
    }

    if (this.uptimeBehavior) {
      this.uptimeBehavior.cleanup();
    }

    if ((this.commandRunner as any).clearCache) {
      (this.commandRunner as any).clearCache();
    }
  }

  async scan(target: string | Target, options: Partial<ScanFeatures> = {}): Promise<ScanReport> {
    const startTime = Date.now();

    const normalizedTarget = (typeof target === 'string'
      ? TargetNormalizer.normalize(target)
      : target) as Target;

    const scanConfig = {
      ...this.config.features,
      ...options
    };

    const results: Record<string, any> = {};

    if (scanConfig.dns !== false) {
      results.dns = await this.stages.dns.execute(normalizedTarget, scanConfig.dns as any);
    }

    if (scanConfig.certificate !== false) {
      results.certificate = await this.stages.certificate.execute(normalizedTarget, scanConfig.certificate as any);
    }

    if (scanConfig.whois !== false) {
      results.whois = await this.stages.whois.execute(normalizedTarget, scanConfig.whois as any);
    }

    if (scanConfig.latency !== false) {
      results.latency = await this.stages.latency.execute(normalizedTarget, scanConfig.latency as any);
    }

    if (scanConfig.http !== false) {
      results.http = await this.stages.http.execute(normalizedTarget, scanConfig.http as any);
    }

    if (scanConfig.ports !== false) {
      results.ports = await this.stages.ports.execute(normalizedTarget, scanConfig.ports as any);
    }

    if (scanConfig.subdomains !== false) {
      results.subdomains = await this.stages.subdomains.execute(normalizedTarget, scanConfig.subdomains as any);
    }

    if (scanConfig.webDiscovery !== false) {
      results.webDiscovery = await this.stages.webDiscovery.execute(normalizedTarget, scanConfig.webDiscovery as any);
    }

    if (scanConfig.vulnerability !== false) {
      results.vulnerability = await this.stages.vulnerability.execute(normalizedTarget, scanConfig.vulnerability as any);
    }

    if (scanConfig.tlsAudit !== false) {
      results.tlsAudit = await this.stages.tlsAudit.execute(normalizedTarget, scanConfig.tlsAudit as any);
    }

    if (scanConfig.fingerprint !== false) {
      results.fingerprint = await this.stages.fingerprint.execute(normalizedTarget, scanConfig.fingerprint as any);
    }

    if (scanConfig.screenshot !== false) {
      results.screenshot = await this.stages.screenshot.execute(normalizedTarget, scanConfig.screenshot as any);
    }

    if (scanConfig.osint !== false) {
      results.osint = await this.stages.osint.execute(normalizedTarget, scanConfig.osint as any);
    }

    if (scanConfig.secrets !== false) {
      results.secrets = await this.stages.secrets.execute(normalizedTarget, scanConfig.secrets as any);
    }

    if (scanConfig.asn !== false) {
      results.asn = await this.stages.asn.execute(normalizedTarget, scanConfig.asn as any);
    }

    if (scanConfig.dnsdumpster !== false) {
      results.dnsdumpster = await this.stages.dnsdumpster.execute(normalizedTarget, scanConfig.dnsdumpster as any);
    }

    if (scanConfig.googleDorks !== false) {
      results.googleDorks = await this.stages.googleDorks.execute(normalizedTarget, scanConfig.googleDorks as any);
    }

    const fingerprint = FingerprintBuilder.build(results);

    let uptimeStatus: UptimeStatus | null = null;
    if (this.uptimeBehavior) {
      try {
        uptimeStatus = this.uptimeBehavior.getStatus(normalizedTarget.host);
      } catch (error) {
        // Uptime not monitored for this target, skip
      }
    }

    const report: ScanReport = {
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

    if (this.config.storage?.enabled && this.storageManager) {
      await (this.storageManager as any).persistReport(normalizedTarget, report);

      if (this.config.resources?.persist) {
        await (this.storageManager as any).persistToResources(report);
      }

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

  async batchScan(targets: (string | Target)[], options: Partial<ScanFeatures> = {}): Promise<(ScanReport | { target: string; status: 'error'; error: string })[]> {
    const results: (ScanReport | { target: string; status: 'error'; error: string })[] = [];

    for (const target of targets) {
      try {
        const report = await this.scan(target, options);
        results.push(report);
      } catch (error: any) {
        results.push({
          target: typeof target === 'string' ? target : target.original || target.host,
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  async getReport(reportId: string): Promise<ScanReport | null> {
    if (!this.storageManager) return null;
    return (this.storageManager as any).getReport(reportId);
  }

  async listReports(options: Record<string, any> = {}): Promise<ScanReport[]> {
    if (!this.storageManager) return [];
    return (this.storageManager as any).listReports(options);
  }

  async getReportsByHost(host: string, options: Record<string, any> = {}): Promise<ScanReport[]> {
    if (!this.storageManager) {
      return [];
    }
    return (this.storageManager as any).getReportsByHost(host, options);
  }

  async compareReports(reportId1: string, reportId2: string): Promise<DiffResult | null> {
    if (!this.storageManager) return null;

    const [report1, report2] = await Promise.all([
      (this.storageManager as any).getReport(reportId1),
      (this.storageManager as any).getReport(reportId2)
    ]);

    if (!report1 || !report2) return null;

    return DiffDetector.detect(report1 as any, report2 as any) as unknown as DiffResult | null;
  }

  generateMarkdownReport(report: ScanReport): string {
    return ReportGenerator.generateMarkdown(report as any);
  }

  generateJSONReport(report: ScanReport): string {
    return ReportGenerator.generateJSON(report as any);
  }

  generateHTMLReport(report: ScanReport): string {
    return ReportGenerator.generateHTML(report as any);
  }

  generateExecutiveSummary(report: ScanReport): string {
    return ReportGenerator.generateExecutiveSummary(report as any) as unknown as string;
  }

  generateSecurityAudit(report: ScanReport): SecurityAudit {
    return SecurityAnalyzer.analyze(report as any) as unknown as SecurityAudit;
  }

  generateSecurityAuditMarkdown(report: ScanReport): string {
    const audit = SecurityAnalyzer.analyze(report as any);
    return SecurityAnalyzer.generateMarkdownReport(audit as any);
  }

  async addTarget(target: string | Target, schedule: string | null = null): Promise<any> {
    if (!this.targetManager) return null;
    return (this.targetManager as any).addTarget(target, schedule);
  }

  async removeTarget(targetId: string): Promise<boolean> {
    if (!this.targetManager) return false;
    return (this.targetManager as any).removeTarget(targetId);
  }

  async listTargets(): Promise<any[]> {
    if (!this.targetManager) return [];
    return (this.targetManager as any).listTargets();
  }

  async updateTargetSchedule(targetId: string, schedule: string): Promise<any> {
    if (!this.targetManager) return null;
    return (this.targetManager as any).updateSchedule(targetId, schedule);
  }

  async getToolStatus(): Promise<Record<string, boolean>> {
    return (this.dependencyManager as any).getStatus();
  }

  async isToolAvailable(toolName: string): Promise<boolean> {
    return (this.commandRunner as any).isAvailable(toolName);
  }

  async runScheduledSweep(): Promise<any> {
    if (!this.schedulerManager) return null;
    return (this.schedulerManager as any).runSweep();
  }

  async getLatestDiff(host: string): Promise<DiffResult | null> {
    const reports = await this.getReportsByHost(host, { limit: 2, sort: 'desc' });

    if (reports.length < 2) {
      return null;
    }

    return DiffDetector.detect(reports[1] as any, reports[0] as any) as unknown as DiffResult | null;
  }

  async getFingerprint(host: string): Promise<Record<string, any> | null> {
    const reports = await this.getReportsByHost(host, { limit: 1 });

    if (reports.length === 0) {
      return null;
    }

    return reports[0]!.fingerprint;
  }

  private _generateReportId(): string {
    return `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ============================================================================
  // UPTIME BEHAVIOR METHODS
  // ============================================================================

  async startUptimeMonitoring(target: string | Target): Promise<UptimeStatus | null> {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled. Set config.behaviors.uptime.enabled = true');
    }

    const normalizedTarget = (typeof target === 'string'
      ? TargetNormalizer.normalize(target)
      : target) as Target;

    return await this.uptimeBehavior.startMonitoring(normalizedTarget);
  }

  stopUptimeMonitoring(host: string): void {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return this.uptimeBehavior.stopMonitoring(host);
  }

  getUptimeStatus(host: string): UptimeStatus | null {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return this.uptimeBehavior.getStatus(host);
  }

  getAllUptimeStatuses(): UptimeStatus[] {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return this.uptimeBehavior.getAllStatuses();
  }

  async loadUptimeStatus(host: string): Promise<any> {
    if (!this.uptimeBehavior) {
      throw new Error('Uptime behavior is not enabled');
    }

    return await this.uptimeBehavior.loadStatus(host);
  }

  override async onStop(): Promise<void> {
    this.logger.info('[ReconPlugin] Stopping plugin, cleaning up processes...');
    await this.processManager.cleanup({ silent: false });
  }

  override async onUninstall(options: Record<string, any> = {}): Promise<void> {
    this.logger.info('[ReconPlugin] Uninstalling plugin, cleaning up processes...');
    await this.processManager.forceCleanup();
  }

  override afterUninstall(): void {
    super.afterUninstall();

    this.processManager.cleanup({ silent: true }).catch(() => {});
  }
}

export default ReconPlugin;
