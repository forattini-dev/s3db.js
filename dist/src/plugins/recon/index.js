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
import { SecretsStage } from './stages/secrets-stage.js';
import { ASNStage } from './stages/asn-stage.js';
import { DNSDumpsterStage } from './stages/dnsdumpster-stage.js';
import { MassDNSStage } from './stages/massdns-stage.js';
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
import { UptimeBehavior } from './behaviors/uptime-behavior.js';
// Config
import { DEFAULT_CONFIG, BEHAVIOR_PRESETS } from './config/defaults.js';
function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            const sourceValue = source[key];
            if (isObject(sourceValue)) {
                if (!(key in target)) {
                    output[key] = sourceValue;
                }
                else {
                    output[key] = deepMerge(target[key], sourceValue);
                }
            }
            else {
                output[key] = sourceValue;
            }
        });
    }
    return output;
}
function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}
export class ReconPlugin extends Plugin {
    static pluginName = 'recon';
    config;
    commandRunner;
    processManager;
    storageManager;
    targetManager;
    schedulerManager;
    dependencyManager;
    stages;
    uptimeBehavior;
    constructor(config = {}) {
        super(config);
        let baseConfig = DEFAULT_CONFIG;
        const behaviorMode = config.behavior || 'default';
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
            features: deepMerge(deepMerge(baseConfig.features || {}, (config.features || {})), (config.behaviorOverrides?.features || {})),
            storage: {
                ...baseConfig.storage,
                ...(config.storage || {})
            }
        };
        this.commandRunner = new CommandRunner(this);
        this.processManager = new ProcessManager();
        this.storageManager = null;
        this.targetManager = null;
        this.schedulerManager = null;
        this.dependencyManager = new DependencyManager(this);
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
            whois: new WhoisStage(this),
            secrets: new SecretsStage(this),
            asn: new ASNStage(this),
            dnsdumpster: new DNSDumpsterStage(this),
            massdns: new MassDNSStage(this),
            googleDorks: new GoogleDorksStage(this)
        };
    }
    async initialize() {
        this.storageManager = new StorageManager(this);
        this.targetManager = new TargetManager(this);
        this.schedulerManager = new SchedulerManager(this);
        if (this.config.behaviors?.uptime?.enabled) {
            this.uptimeBehavior = new UptimeBehavior(this, this.config.behaviors.uptime);
        }
        await this.storageManager.initialize();
        if (this.config.scheduler?.enabled) {
            await this.schedulerManager.start();
        }
        await this.dependencyManager.checkAll();
    }
    async _applyRateLimit(stage) {
        const rateLimit = this.config?.rateLimit;
        if (!rateLimit || rateLimit.enabled === false) {
            return;
        }
        const delayMs = rateLimit.delayBetweenStages ??
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
    async cleanup() {
        if (this.schedulerManager) {
            await this.schedulerManager.stop();
        }
        if (this.uptimeBehavior) {
            this.uptimeBehavior.cleanup();
        }
        if (this.commandRunner.clearCache) {
            this.commandRunner.clearCache();
        }
    }
    async scan(target, options = {}) {
        const startTime = Date.now();
        const normalizedTarget = (typeof target === 'string'
            ? TargetNormalizer.normalize(target)
            : target);
        const scanConfig = {
            ...this.config.features,
            ...options
        };
        const results = {};
        if (scanConfig.dns !== false) {
            results.dns = await this.stages.dns.execute(normalizedTarget, scanConfig.dns);
        }
        if (scanConfig.certificate !== false) {
            results.certificate = await this.stages.certificate.execute(normalizedTarget, scanConfig.certificate);
        }
        if (scanConfig.whois !== false) {
            results.whois = await this.stages.whois.execute(normalizedTarget, scanConfig.whois);
        }
        if (scanConfig.latency !== false) {
            results.latency = await this.stages.latency.execute(normalizedTarget, scanConfig.latency);
        }
        if (scanConfig.http !== false) {
            results.http = await this.stages.http.execute(normalizedTarget, scanConfig.http);
        }
        if (scanConfig.ports !== false) {
            results.ports = await this.stages.ports.execute(normalizedTarget, scanConfig.ports);
        }
        if (scanConfig.subdomains !== false) {
            results.subdomains = await this.stages.subdomains.execute(normalizedTarget, scanConfig.subdomains);
        }
        if (scanConfig.webDiscovery !== false) {
            results.webDiscovery = await this.stages.webDiscovery.execute(normalizedTarget, scanConfig.webDiscovery);
        }
        if (scanConfig.vulnerability !== false) {
            results.vulnerability = await this.stages.vulnerability.execute(normalizedTarget, scanConfig.vulnerability);
        }
        if (scanConfig.tlsAudit !== false) {
            results.tlsAudit = await this.stages.tlsAudit.execute(normalizedTarget, scanConfig.tlsAudit);
        }
        if (scanConfig.fingerprint !== false) {
            results.fingerprint = await this.stages.fingerprint.execute(normalizedTarget, scanConfig.fingerprint);
        }
        if (scanConfig.screenshot !== false) {
            results.screenshot = await this.stages.screenshot.execute(normalizedTarget, scanConfig.screenshot);
        }
        if (scanConfig.osint !== false) {
            results.osint = await this.stages.osint.execute(normalizedTarget, scanConfig.osint);
        }
        if (scanConfig.secrets !== false) {
            results.secrets = await this.stages.secrets.execute(normalizedTarget, scanConfig.secrets);
        }
        if (scanConfig.asn !== false) {
            results.asn = await this.stages.asn.execute(normalizedTarget, scanConfig.asn);
        }
        if (scanConfig.dnsdumpster !== false) {
            results.dnsdumpster = await this.stages.dnsdumpster.execute(normalizedTarget, scanConfig.dnsdumpster);
        }
        if (scanConfig.massdns !== false) {
            results.massdns = await this.stages.massdns.execute(normalizedTarget, scanConfig.massdns);
        }
        if (scanConfig.googleDorks !== false) {
            results.googleDorks = await this.stages.googleDorks.execute(normalizedTarget, scanConfig.googleDorks);
        }
        const fingerprint = FingerprintBuilder.build(results);
        let uptimeStatus = null;
        if (this.uptimeBehavior) {
            try {
                uptimeStatus = this.uptimeBehavior.getStatus(normalizedTarget.host);
            }
            catch (error) {
                // Uptime not monitored for this target, skip
            }
        }
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
        if (this.config.storage?.enabled && this.storageManager) {
            await this.storageManager.persistReport(normalizedTarget, report);
            if (this.config.resources?.persist) {
                await this.storageManager.persistToResources(report);
            }
            if (this.uptimeBehavior && uptimeStatus) {
                await this.uptimeBehavior.linkReportToUptime(normalizedTarget.host, report.id, report.timestamp);
            }
        }
        return report;
    }
    async batchScan(targets, options = {}) {
        const results = [];
        for (const target of targets) {
            try {
                const report = await this.scan(target, options);
                results.push(report);
            }
            catch (error) {
                results.push({
                    target: typeof target === 'string' ? target : target.original || target.host,
                    status: 'error',
                    error: error.message
                });
            }
        }
        return results;
    }
    async getReport(reportId) {
        if (!this.storageManager)
            return null;
        return this.storageManager.getReport(reportId);
    }
    async listReports(options = {}) {
        if (!this.storageManager)
            return [];
        return this.storageManager.listReports(options);
    }
    async getReportsByHost(host, options = {}) {
        if (!this.storageManager) {
            return [];
        }
        return this.storageManager.getReportsByHost(host, options);
    }
    async compareReports(reportId1, reportId2) {
        if (!this.storageManager)
            return null;
        const [report1, report2] = await Promise.all([
            this.storageManager.getReport(reportId1),
            this.storageManager.getReport(reportId2)
        ]);
        if (!report1 || !report2)
            return null;
        return DiffDetector.detect(report1, report2);
    }
    generateMarkdownReport(report) {
        return ReportGenerator.generateMarkdown(report);
    }
    generateJSONReport(report) {
        return ReportGenerator.generateJSON(report);
    }
    generateHTMLReport(report) {
        return ReportGenerator.generateHTML(report);
    }
    generateExecutiveSummary(report) {
        return ReportGenerator.generateExecutiveSummary(report);
    }
    generateSecurityAudit(report) {
        return SecurityAnalyzer.analyze(report);
    }
    generateSecurityAuditMarkdown(report) {
        const audit = SecurityAnalyzer.analyze(report);
        return SecurityAnalyzer.generateMarkdownReport(audit);
    }
    async addTarget(target, schedule = null) {
        if (!this.targetManager)
            return null;
        return this.targetManager.addTarget(target, schedule);
    }
    async removeTarget(targetId) {
        if (!this.targetManager)
            return false;
        return this.targetManager.removeTarget(targetId);
    }
    async listTargets() {
        if (!this.targetManager)
            return [];
        return this.targetManager.listTargets();
    }
    async updateTargetSchedule(targetId, schedule) {
        if (!this.targetManager)
            return null;
        return this.targetManager.updateSchedule(targetId, schedule);
    }
    async getToolStatus() {
        return this.dependencyManager.getStatus();
    }
    async isToolAvailable(toolName) {
        return this.commandRunner.isAvailable(toolName);
    }
    async runScheduledSweep() {
        if (!this.schedulerManager)
            return null;
        return this.schedulerManager.runSweep();
    }
    async getLatestDiff(host) {
        const reports = await this.getReportsByHost(host, { limit: 2, sort: 'desc' });
        if (reports.length < 2) {
            return null;
        }
        return DiffDetector.detect(reports[1], reports[0]);
    }
    async getFingerprint(host) {
        const reports = await this.getReportsByHost(host, { limit: 1 });
        if (reports.length === 0) {
            return null;
        }
        return reports[0].fingerprint;
    }
    _generateReportId() {
        return `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    // ============================================================================
    // UPTIME BEHAVIOR METHODS
    // ============================================================================
    async startUptimeMonitoring(target) {
        if (!this.uptimeBehavior) {
            throw new Error('Uptime behavior is not enabled. Set config.behaviors.uptime.enabled = true');
        }
        const normalizedTarget = (typeof target === 'string'
            ? TargetNormalizer.normalize(target)
            : target);
        return await this.uptimeBehavior.startMonitoring(normalizedTarget);
    }
    stopUptimeMonitoring(host) {
        if (!this.uptimeBehavior) {
            throw new Error('Uptime behavior is not enabled');
        }
        return this.uptimeBehavior.stopMonitoring(host);
    }
    getUptimeStatus(host) {
        if (!this.uptimeBehavior) {
            throw new Error('Uptime behavior is not enabled');
        }
        return this.uptimeBehavior.getStatus(host);
    }
    getAllUptimeStatuses() {
        if (!this.uptimeBehavior) {
            throw new Error('Uptime behavior is not enabled');
        }
        return this.uptimeBehavior.getAllStatuses();
    }
    async loadUptimeStatus(host) {
        if (!this.uptimeBehavior) {
            throw new Error('Uptime behavior is not enabled');
        }
        return await this.uptimeBehavior.loadStatus(host);
    }
    async onStop() {
        this.logger.info('[ReconPlugin] Stopping plugin, cleaning up processes...');
        await this.processManager.cleanup({ silent: false });
    }
    async onUninstall(options = {}) {
        this.logger.info('[ReconPlugin] Uninstalling plugin, cleaning up processes...');
        await this.processManager.forceCleanup();
    }
    afterUninstall() {
        super.afterUninstall();
        this.processManager.cleanup({ silent: true }).catch(() => { });
    }
}
export default ReconPlugin;
//# sourceMappingURL=index.js.map