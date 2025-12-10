/**
 * DiffDetector
 *
 * Change detection between scan runs:
 * - Compares fingerprints
 * - Identifies infrastructure changes
 * - Tracks attack surface evolution
 * - Detects security posture changes
 */
import type { NormalizedTarget } from './target-normalizer.js';
export interface DnsRecords {
    A?: string[];
    AAAA?: string[];
    NS?: string[];
    MX?: Array<{
        priority?: number;
        exchange: string;
    } | string>;
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
export interface PortInfo {
    port: number;
    protocol?: string;
    service?: string;
    state?: string;
}
export interface PortsResult {
    status?: string;
    openPorts?: PortInfo[];
}
export interface SubdomainsResult {
    status?: string;
    list?: string[];
    total?: number;
}
export interface WebDiscoveryResult {
    status?: string;
    tools?: Record<string, {
        status: string;
        paths?: string[];
    }>;
}
export interface FingerprintResult {
    status?: string;
    technologies?: string[];
}
export interface TlsAuditResult {
    status?: string;
    grade?: string;
}
export interface VulnerabilityResult {
    status?: string;
    tools?: Record<string, {
        status: string;
        vulnerabilities?: any[];
    }>;
}
export interface ReportResults {
    dns?: DnsResult;
    certificate?: CertificateResult;
    ports?: PortsResult;
    subdomains?: SubdomainsResult;
    webDiscovery?: WebDiscoveryResult;
    fingerprint?: FingerprintResult;
    tlsAudit?: TlsAuditResult;
    vulnerability?: VulnerabilityResult;
}
export interface Report {
    timestamp: string;
    target: NormalizedTarget;
    results?: ReportResults;
}
export interface DiffChanges {
    dns?: Record<string, any> | null;
    certificate?: Record<string, any> | null;
    ports?: Record<string, any> | null;
    subdomains?: Record<string, any> | null;
    paths?: Record<string, any> | null;
    technologies?: Record<string, any> | null;
    security?: Record<string, any> | null;
}
export interface DiffSummary {
    totalChanges: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    hasInfrastructureChanges: boolean;
    hasAttackSurfaceChanges: boolean;
    hasSecurityChanges: boolean;
}
export interface DiffResult {
    timestamp: string;
    previousScan: string;
    currentScan: string;
    changes: DiffChanges;
    summary: DiffSummary;
}
export declare class DiffDetector {
    static detect(previousReport: Report | null, currentReport: Report | null): DiffResult | null;
    static _detectDnsChanges(oldDns?: DnsResult, newDns?: DnsResult): Record<string, any> | null;
    static _detectCertificateChanges(oldCert?: CertificateResult, newCert?: CertificateResult): Record<string, any> | null;
    static _detectPortChanges(oldPorts?: PortsResult, newPorts?: PortsResult): Record<string, any> | null;
    static _detectSubdomainChanges(oldSubs?: SubdomainsResult, newSubs?: SubdomainsResult): Record<string, any> | null;
    static _detectPathChanges(oldWeb?: WebDiscoveryResult, newWeb?: WebDiscoveryResult): Record<string, any> | null;
    static _detectTechnologyChanges(oldFP?: FingerprintResult, newFP?: FingerprintResult): Record<string, any> | null;
    static _detectSecurityChanges(oldTLS?: TlsAuditResult, newTLS?: TlsAuditResult, oldVuln?: VulnerabilityResult, newVuln?: VulnerabilityResult): Record<string, any> | null;
    static _countVulnerabilities(vulnData: VulnerabilityResult): number;
    static _calculateSummary(changes: DiffChanges): DiffSummary;
}
//# sourceMappingURL=diff-detector.d.ts.map