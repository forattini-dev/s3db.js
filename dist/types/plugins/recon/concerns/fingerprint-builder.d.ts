/**
 * FingerprintBuilder
 *
 * Aggregates data from multiple stage results to build a consolidated fingerprint:
 * - DNS records (IPs, nameservers, mail servers)
 * - Open ports and services
 * - Subdomains
 * - Technology stack
 * - TLS/SSL configuration
 * - HTTP headers and server info
 */
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
    status: string;
    records: DnsRecords;
}
export interface CertificateResult {
    status: string;
    issuer?: Record<string, any>;
    subject?: Record<string, any>;
    validFrom?: string;
    validTo?: string;
    fingerprint?: string;
    subjectAltName?: string[];
}
export interface LatencyResult {
    status: string;
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
    status: string;
    openPorts?: PortInfo[];
    scanners?: Record<string, any>;
}
export interface SubdomainsResult {
    status: string;
    total?: number;
    list?: string[];
    sources?: Record<string, any>;
}
export interface WebDiscoveryTool {
    status: string;
    paths?: string[];
}
export interface WebDiscoveryResult {
    status: string;
    tools?: Record<string, WebDiscoveryTool>;
}
export interface HttpResult {
    status: string;
    headers?: Record<string, string>;
}
export interface FingerprintStageResult {
    status: string;
    technologies?: string[];
    cms?: string;
    frameworks?: string[];
}
export interface OsintResult {
    status: string;
    tools?: Record<string, any>;
}
export interface TlsAuditResult {
    status: string;
    grade?: string;
    tools?: Record<string, any>;
}
export interface VulnerabilityResult {
    status: string;
    tools?: Record<string, {
        status: string;
        vulnerabilities?: any[];
    }>;
}
export interface StageResults {
    dns?: DnsResult;
    certificate?: CertificateResult;
    latency?: LatencyResult;
    ports?: PortsResult;
    subdomains?: SubdomainsResult;
    webDiscovery?: WebDiscoveryResult;
    http?: HttpResult;
    fingerprint?: FingerprintStageResult;
    osint?: OsintResult;
    tlsAudit?: TlsAuditResult;
    vulnerability?: VulnerabilityResult;
}
export interface Infrastructure {
    ips?: {
        ipv4: string[];
        ipv6: string[];
    };
    nameservers?: string[];
    mailServers?: string[];
    txtRecords?: string[];
    certificate?: {
        issuer?: Record<string, any>;
        subject?: Record<string, any>;
        validFrom?: string;
        validTo?: string;
        fingerprint?: string;
        sans?: string[];
    };
    latency?: {
        ping?: any;
        traceroute?: any;
    };
}
export interface AttackSurface {
    openPorts?: PortInfo[];
    portScanners?: string[];
    subdomains?: {
        total: number;
        list: string[];
        sources: string[];
    };
    discoveredPaths?: {
        total: number;
        list: string[];
    };
}
export interface Technologies {
    server?: string;
    poweredBy?: string;
    httpHeaders?: Record<string, string>;
    detected?: string[];
    cms?: string;
    frameworks?: string[];
    osint?: Record<string, any>;
}
export interface Security {
    tls?: Record<string, any>;
    vulnerabilities?: Record<string, any>;
    headers?: {
        hsts?: string;
        csp?: string;
        xFrameOptions?: string;
        xContentTypeOptions?: string;
        xXssProtection?: string;
        referrerPolicy?: string;
    };
}
export interface Fingerprint {
    infrastructure: Infrastructure;
    attackSurface: AttackSurface;
    technologies: Technologies;
    security: Security;
}
export interface FingerprintSummary {
    totalIPs: number;
    totalPorts: number;
    totalSubdomains: number;
    totalPaths: number;
    hasCertificate: boolean;
    hasTLSAudit: boolean;
    hasVulnerabilities: boolean;
    detectedTechnologies: number;
}
export interface FingerprintDiff {
    infrastructure?: Record<string, any> | null;
    attackSurface?: Record<string, any> | null;
    technologies?: Record<string, any> | null;
    security?: Record<string, any> | null;
}
export declare class FingerprintBuilder {
    static build(stageResults: StageResults): Fingerprint;
    static _buildInfrastructure(stageResults: StageResults): Infrastructure;
    static _buildAttackSurface(stageResults: StageResults): AttackSurface;
    static _buildTechnologies(stageResults: StageResults): Technologies;
    static _buildSecurity(stageResults: StageResults): Security;
    static buildSummary(fingerprint: Fingerprint): FingerprintSummary;
    static diff(oldFingerprint: Fingerprint, newFingerprint: Fingerprint): FingerprintDiff;
    static _diffInfrastructure(oldInfra?: Infrastructure, newInfra?: Infrastructure): Record<string, any> | null;
    static _diffAttackSurface(oldSurface?: AttackSurface, newSurface?: AttackSurface): Record<string, any> | null;
    static _diffTechnologies(oldTech?: Technologies, newTech?: Technologies): Record<string, any> | null;
    static _diffSecurity(oldSec?: Security, newSec?: Security): Record<string, any> | null;
}
//# sourceMappingURL=fingerprint-builder.d.ts.map