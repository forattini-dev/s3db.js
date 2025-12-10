/**
 * ReconPlugin Concerns
 *
 * Shared utilities and helpers for reconnaissance operations:
 * - Target normalization
 * - Command execution
 * - Fingerprint building
 * - Diff detection
 * - Report generation
 * - Security analysis
 * - Process management
 */

export { TargetNormalizer, type NormalizedTarget } from './target-normalizer.js';

export {
  CommandRunner,
  type CommandOptions,
  type CommandResult,
  type ReconPlugin
} from './command-runner.js';

export {
  FingerprintBuilder,
  type DnsRecords as FingerprintDnsRecords,
  type DnsResult as FingerprintDnsResult,
  type CertificateResult as FingerprintCertificateResult,
  type LatencyResult as FingerprintLatencyResult,
  type PortInfo as FingerprintPortInfo,
  type PortsResult as FingerprintPortsResult,
  type SubdomainsResult as FingerprintSubdomainsResult,
  type WebDiscoveryTool as FingerprintWebDiscoveryTool,
  type WebDiscoveryResult as FingerprintWebDiscoveryResult,
  type HttpResult as FingerprintHttpResult,
  type FingerprintStageResult,
  type OsintResult as FingerprintOsintResult,
  type TlsAuditResult as FingerprintTlsAuditResult,
  type VulnerabilityResult as FingerprintVulnerabilityResult,
  type StageResults,
  type Infrastructure,
  type AttackSurface,
  type Technologies,
  type Security,
  type Fingerprint,
  type FingerprintSummary,
  type FingerprintDiff
} from './fingerprint-builder.js';

export {
  DiffDetector,
  type DnsRecords as DiffDnsRecords,
  type DnsResult as DiffDnsResult,
  type CertificateResult as DiffCertificateResult,
  type PortInfo as DiffPortInfo,
  type PortsResult as DiffPortsResult,
  type SubdomainsResult as DiffSubdomainsResult,
  type WebDiscoveryResult as DiffWebDiscoveryResult,
  type FingerprintResult as DiffFingerprintResult,
  type TlsAuditResult as DiffTlsAuditResult,
  type VulnerabilityResult as DiffVulnerabilityResult,
  type ReportResults as DiffReportResults,
  type Report as DiffReport,
  type DiffChanges,
  type DiffSummary,
  type DiffResult
} from './diff-detector.js';

export {
  ReportGenerator,
  type DnsRecords as ReportDnsRecords,
  type DnsResult as ReportDnsResult,
  type CertificateResult as ReportCertificateResult,
  type LatencyResult as ReportLatencyResult,
  type PortInfo as ReportPortInfo,
  type PortsResult as ReportPortsResult,
  type SubdomainsResult as ReportSubdomainsResult,
  type WebDiscoveryTool as ReportWebDiscoveryTool,
  type WebDiscoveryResult as ReportWebDiscoveryResult,
  type HttpResult as ReportHttpResult,
  type FingerprintStageResult as ReportFingerprintStageResult,
  type TlsAuditResult as ReportTlsAuditResult,
  type VulnerabilityTool as ReportVulnerabilityTool,
  type VulnerabilityResult as ReportVulnerabilityResult,
  type ScreenshotTool,
  type ScreenshotResult,
  type OsintResult as ReportOsintResult,
  type ReportResults,
  type Report,
  type ExecutiveSummaryFindings,
  type ExecutiveSummary
} from './report-generator.js';

export {
  SecurityAnalyzer,
  type Severity,
  type FindingType,
  type CheckStatus,
  type Finding,
  type Check,
  type AuditSummary,
  type Recommendation,
  type SecurityAudit,
  type CertificateResult as SecurityCertificateResult,
  type SubdomainsResult as SecuritySubdomainsResult,
  type OsintCategories,
  type OsintResult as SecurityOsintResult,
  type HttpResult as SecurityHttpResult,
  type TlsAuditTool,
  type TlsAuditResult as SecurityTlsAuditResult,
  type SecretsResult,
  type ScanResults,
  type ScanTarget,
  type ScanReport
} from './security-analyzer.js';

export {
  ProcessManager,
  type TrackOptions,
  type TrackedProcess,
  type ProcessInfo,
  type CleanupOptions
} from './process-manager.js';
