/**
 * SecurityAnalyzer
 *
 * Analyzes scan results and generates security audit checklist
 * Based on OWASP Top 10, CIS benchmarks, and industry best practices
 *
 * Usage:
 *   const report = await plugin.scan('example.com', { behavior: 'aggressive' });
 *   const audit = SecurityAnalyzer.analyze(report);
 *   this.logger.info(audit);
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingType = 'pass' | 'fail' | 'warning' | 'info';
export type CheckStatus = 'pass' | 'fail' | 'warning' | 'unknown' | 'manual';
export interface Finding {
    type: FindingType;
    severity: Severity;
    item: string;
    detail: string;
    action?: string;
}
export interface Check {
    id: string;
    name: string;
    description: string;
    status: CheckStatus;
    findings: Finding[];
    score: number;
}
export interface AuditSummary {
    score: number;
    grade: string;
    total: number;
    passed: number;
    failed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
}
export interface Recommendation {
    priority: number;
    severity: Severity;
    category: string;
    item: string;
    action: string;
}
export interface SecurityAudit {
    target: string;
    timestamp: string;
    summary: AuditSummary;
    checklist: Check[];
    recommendations: Recommendation[];
}
export interface CertificateResult {
    validTo?: string;
}
export interface SubdomainsResult {
    subdomains?: string[];
}
export interface OsintCategories {
    saas?: {
        services?: {
            cdn?: {
                provider?: string;
            };
        };
    };
}
export interface OsintResult {
    categories?: OsintCategories;
}
export interface HttpResult {
    headers?: Record<string, string>;
}
export interface TlsAuditTool {
    status: string;
}
export interface TlsAuditResult {
    tools?: {
        openssl?: TlsAuditTool;
    };
}
export interface SecretsResult {
    secrets?: any[];
}
export interface ScanResults {
    subdomains?: SubdomainsResult;
    certificate?: CertificateResult;
    osint?: OsintResult;
    http?: HttpResult;
    tlsAudit?: TlsAuditResult;
    secrets?: SecretsResult;
}
export interface ScanTarget {
    host: string;
}
export interface ScanReport {
    target: ScanTarget;
    timestamp: string;
    results: ScanResults;
}
export declare class SecurityAnalyzer {
    static analyze(report: ScanReport): SecurityAudit;
    static checkInventory(results: ScanResults, summary: AuditSummary): Check;
    static checkSecrets(results: ScanResults, summary: AuditSummary): Check;
    static checkDependencies(_results: ScanResults, summary: AuditSummary): Check;
    static checkSecurityHeaders(results: ScanResults, summary: AuditSummary): Check;
    static checkTLS(results: ScanResults, summary: AuditSummary): Check;
    static checkWAF(results: ScanResults, summary: AuditSummary): Check;
    static checkAuth(_results: ScanResults, summary: AuditSummary): Check;
    static calculateScoreAndGrade(audit: SecurityAudit): void;
    static generateRecommendations(audit: SecurityAudit): void;
    static calculateDaysUntilExpiry(validToDate: string): number | null;
    static generateMarkdownReport(audit: SecurityAudit): string;
}
//# sourceMappingURL=security-analyzer.d.ts.map