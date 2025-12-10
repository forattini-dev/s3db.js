/**
 * ReportGenerator
 *
 * Client-facing report generation:
 * - Markdown reports (human-readable)
 * - JSON reports (machine-readable)
 * - HTML reports (browser-friendly)
 * - Executive summaries
 */
import type { NormalizedTarget } from './target-normalizer.js';
export interface DnsRecords {
    A?: string[];
    AAAA?: string[];
    NS?: string[];
    MX?: Array<{
        priority: number;
        exchange: string;
    }>;
    TXT?: string[];
}
export interface DnsResult {
    status?: string;
    records?: DnsRecords;
}
export interface CertificateResult {
    status?: string;
    issuer?: Record<string, any>;
    subject?: Record<string, any>;
    validFrom?: string;
    validTo?: string;
    fingerprint?: string;
    subjectAltName?: string[];
}
export interface LatencyResult {
    status?: string;
    ping?: {
        min?: number;
        avg?: number;
        max?: number;
        packetLoss?: number;
    };
    traceroute?: {
        hops?: any[];
    };
}
export interface PortInfo {
    port: number;
    protocol?: string;
    service?: string;
    state?: string;
}
export interface PortsResult {
    status?: string;
    openPorts?: PortInfo[];
    scanners?: Record<string, any>;
}
export interface SubdomainsResult {
    status?: string;
    total?: number;
    list?: string[];
    sources?: Record<string, any>;
}
export interface WebDiscoveryTool {
    status: string;
    paths?: string[];
}
export interface WebDiscoveryResult {
    status?: string;
    tools?: Record<string, WebDiscoveryTool>;
}
export interface HttpResult {
    status?: string;
    headers?: Record<string, string>;
}
export interface FingerprintStageResult {
    status?: string;
    technologies?: string[];
    cms?: string;
    frameworks?: string[];
}
export interface TlsAuditResult {
    status?: string;
    grade?: string;
    tools?: Record<string, any>;
}
export interface VulnerabilityTool {
    status: string;
    vulnerabilities?: any[];
}
export interface VulnerabilityResult {
    status?: string;
    tools?: Record<string, VulnerabilityTool>;
}
export interface ScreenshotTool {
    status: string;
    outputDir?: string;
}
export interface ScreenshotResult {
    status?: string;
    tools?: Record<string, ScreenshotTool>;
}
export interface OsintResult {
    status?: string;
    tools?: Record<string, any>;
}
export interface ReportResults {
    dns?: DnsResult;
    certificate?: CertificateResult;
    latency?: LatencyResult;
    ports?: PortsResult;
    subdomains?: SubdomainsResult;
    webDiscovery?: WebDiscoveryResult;
    http?: HttpResult;
    fingerprint?: FingerprintStageResult;
    tlsAudit?: TlsAuditResult;
    vulnerability?: VulnerabilityResult;
    screenshot?: ScreenshotResult;
    osint?: OsintResult;
}
export interface Report {
    target: NormalizedTarget;
    timestamp: string;
    duration: number;
    status: string;
    results?: ReportResults;
}
export interface ExecutiveSummaryFindings {
    openPorts: number;
    subdomains: number;
    technologies: number;
    vulnerabilities: number;
}
export interface ExecutiveSummary {
    target: string;
    scanDate: string;
    status: string;
    duration: number;
    findings: ExecutiveSummaryFindings;
    riskLevel: string;
    recommendations: string[];
}
export declare class ReportGenerator {
    static generateMarkdown(report: Report): string;
    static _generateExecutiveSummary(report: Report): string;
    static _generateDnsSection(dns: DnsResult): string;
    static _generateCertificateSection(cert: CertificateResult): string;
    static _generateLatencySection(latency: LatencyResult): string;
    static _generatePortsSection(ports: PortsResult): string;
    static _generateSubdomainsSection(subdomains: SubdomainsResult): string;
    static _generateWebDiscoverySection(web: WebDiscoveryResult): string;
    static _generateHttpSection(http: HttpResult): string;
    static _generateFingerprintSection(fingerprint: FingerprintStageResult): string;
    static _generateTlsAuditSection(tls: TlsAuditResult): string;
    static _generateVulnerabilitySection(vuln: VulnerabilityResult): string;
    static _generateScreenshotSection(screenshot: ScreenshotResult): string;
    static _generateOsintSection(osint: OsintResult): string;
    static generateJSON(report: Report): string;
    static generateHTML(report: Report): string;
    static generateExecutiveSummary(report: Report): ExecutiveSummary;
    static _countVulnerabilities(vulnData?: VulnerabilityResult): number;
    static _calculateRiskLevel(report: Report): string;
    static _generateRecommendations(report: Report): string[];
}
//# sourceMappingURL=report-generator.d.ts.map