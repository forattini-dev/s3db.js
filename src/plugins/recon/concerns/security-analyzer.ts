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

export class SecurityAnalyzer {
  static analyze(report: ScanReport): SecurityAudit {
    const audit: SecurityAudit = {
      target: report.target.host,
      timestamp: report.timestamp,
      summary: {
        score: 0,
        grade: 'F',
        total: 0,
        passed: 0,
        failed: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      checklist: [],
      recommendations: []
    };

    const results = report.results;

    audit.checklist.push(this.checkInventory(results, audit.summary));
    audit.checklist.push(this.checkSecrets(results, audit.summary));
    audit.checklist.push(this.checkDependencies(results, audit.summary));
    audit.checklist.push(this.checkSecurityHeaders(results, audit.summary));
    audit.checklist.push(this.checkTLS(results, audit.summary));
    audit.checklist.push(this.checkWAF(results, audit.summary));
    audit.checklist.push(this.checkAuth(results, audit.summary));

    this.calculateScoreAndGrade(audit);
    this.generateRecommendations(audit);

    return audit;
  }

  static checkInventory(results: ScanResults, summary: AuditSummary): Check {
    const check: Check = {
      id: 'A',
      name: 'Inventory',
      description: 'Subdomains, IPs, certificates, CDN detection',
      status: 'unknown',
      findings: [],
      score: 100
    };

    summary.total++;

    if (results.subdomains) {
      const count = results.subdomains.subdomains?.length || 0;

      check.findings.push({
        type: count > 0 ? 'pass' : 'info',
        severity: 'info',
        item: 'Subdomains Enumeration',
        detail: `${count} subdomains discovered`,
        action: count > 50 ? 'Review all subdomains for unnecessary exposure' : 'OK'
      });

      if (count > 100) {
        check.findings.push({
          type: 'warning',
          severity: 'medium',
          item: 'Excessive Subdomains',
          detail: `${count} subdomains may indicate wildcard DNS or shadow IT`,
          action: 'Review subdomain creation policies and implement DNS zone monitoring'
        });
        summary.medium++;
        check.score -= 10;
      }
    }

    if (results.certificate) {
      const validTo = results.certificate.validTo;
      if (validTo) {
        const daysUntilExpiry = this.calculateDaysUntilExpiry(validTo);

        if (daysUntilExpiry !== null && daysUntilExpiry < 7) {
          check.findings.push({
            type: 'fail',
            severity: 'critical',
            item: 'Certificate Expiring',
            detail: `SSL certificate expires in ${daysUntilExpiry} days`,
            action: 'Renew SSL certificate IMMEDIATELY. Implement auto-renewal (Let\'s Encrypt)'
          });
          summary.critical++;
          summary.failed++;
          check.score -= 25;
        } else if (daysUntilExpiry !== null && daysUntilExpiry < 30) {
          check.findings.push({
            type: 'warning',
            severity: 'high',
            item: 'Certificate Expiring Soon',
            detail: `SSL certificate expires in ${daysUntilExpiry} days`,
            action: 'Renew SSL certificate soon. Set up expiry monitoring/alerts'
          });
          summary.high++;
          check.score -= 15;
        } else {
          check.findings.push({
            type: 'pass',
            severity: 'info',
            item: 'Certificate Validity',
            detail: `SSL certificate valid for ${daysUntilExpiry} days`
          });
        }
      }
    }

    if (results.osint?.categories?.saas?.services?.cdn) {
      const cdn = results.osint.categories.saas.services.cdn;
      check.findings.push({
        type: 'pass',
        severity: 'info',
        item: 'CDN Detected',
        detail: `Using ${cdn.provider}`,
        action: 'CDN provides DDoS protection and performance benefits'
      });
    } else {
      check.findings.push({
        type: 'warning',
        severity: 'low',
        item: 'No CDN Detected',
        detail: 'No CDN detected',
        action: 'Consider Cloudflare, Fastly, or AWS CloudFront for DDoS protection'
      });
      summary.low++;
      check.score -= 5;
    }

    check.status = check.score >= 80 ? 'pass' : (check.score >= 60 ? 'warning' : 'fail');
    if (check.status === 'pass') summary.passed++;

    return check;
  }

  static checkSecrets(results: ScanResults, summary: AuditSummary): Check {
    const check: Check = {
      id: 'B',
      name: 'Secrets',
      description: 'Leaked API keys, credentials, tokens',
      status: 'unknown',
      findings: [],
      score: 100
    };

    summary.total++;

    if (results.secrets) {
      const secretsFound = results.secrets.secrets?.length || 0;

      if (secretsFound > 0) {
        check.findings.push({
          type: 'fail',
          severity: 'critical',
          item: 'Secrets Exposed',
          detail: `${secretsFound} potential secrets found publicly`,
          action: 'IMMEDIATE: Rotate all exposed keys, tokens, credentials. Revoke compromised secrets. Review commit history.'
        });
        summary.critical += secretsFound;
        summary.failed++;
        check.score = 0;
        check.status = 'fail';
      } else {
        check.findings.push({
          type: 'pass',
          severity: 'info',
          item: 'No Secrets Detected',
          detail: 'No exposed secrets found',
          action: 'Continue monitoring. Implement pre-commit hooks (gitleaks, truffleHog)'
        });
        summary.passed++;
        check.status = 'pass';
      }
    } else {
      check.findings.push({
        type: 'info',
        severity: 'info',
        item: 'Secrets Scan Not Run',
        detail: 'Secrets detection stage was not executed',
        action: 'Run scan with secrets detection enabled'
      });
      check.status = 'unknown';
    }

    return check;
  }

  static checkDependencies(_results: ScanResults, summary: AuditSummary): Check {
    const check: Check = {
      id: 'C',
      name: 'Dependencies',
      description: 'Vulnerable packages (requires manual setup)',
      status: 'manual',
      findings: [{
        type: 'info',
        severity: 'info',
        item: 'Manual Check Required',
        detail: 'Dependency scanning requires package.json/requirements.txt access',
        action: 'Run: npm audit, yarn audit, snyk test, or GitHub Dependabot. Patch high/critical vulnerabilities.'
      }],
      score: 0
    };

    summary.total++;

    return check;
  }

  static checkSecurityHeaders(results: ScanResults, summary: AuditSummary): Check {
    const check: Check = {
      id: 'D1',
      name: 'Security Headers',
      description: 'HSTS, CSP, X-Frame-Options, etc.',
      status: 'unknown',
      findings: [],
      score: 100
    };

    summary.total++;

    if (results.http?.headers) {
      const headers = results.http.headers;

      if (!headers['strict-transport-security']) {
        check.findings.push({
          type: 'fail',
          severity: 'high',
          item: 'Missing HSTS',
          detail: 'Strict-Transport-Security header not found',
          action: 'Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'
        });
        summary.high++;
        check.score -= 20;
      } else {
        check.findings.push({
          type: 'pass',
          severity: 'info',
          item: 'HSTS Enabled',
          detail: headers['strict-transport-security']
        });
      }

      if (!headers['content-security-policy'] && !headers['content-security-policy-report-only']) {
        check.findings.push({
          type: 'fail',
          severity: 'medium',
          item: 'Missing CSP',
          detail: 'Content-Security-Policy header not found',
          action: 'Implement CSP to prevent XSS. Start with report-only mode.'
        });
        summary.medium++;
        check.score -= 15;
      } else {
        check.findings.push({
          type: 'pass',
          severity: 'info',
          item: 'CSP Present',
          detail: 'Content-Security-Policy configured'
        });
      }

      if (!headers['x-frame-options']) {
        check.findings.push({
          type: 'fail',
          severity: 'medium',
          item: 'Missing X-Frame-Options',
          detail: 'Clickjacking protection not found',
          action: 'Add header: X-Frame-Options: DENY or SAMEORIGIN'
        });
        summary.medium++;
        check.score -= 10;
      }

      if (!headers['x-content-type-options']) {
        check.findings.push({
          type: 'warning',
          severity: 'low',
          item: 'Missing X-Content-Type-Options',
          detail: 'MIME-sniffing protection not found',
          action: 'Add header: X-Content-Type-Options: nosniff'
        });
        summary.low++;
        check.score -= 5;
      }
    }

    check.status = check.score >= 80 ? 'pass' : (check.score >= 60 ? 'warning' : 'fail');
    if (check.status === 'pass') summary.passed++;
    else if (check.status === 'fail') summary.failed++;

    return check;
  }

  static checkTLS(results: ScanResults, summary: AuditSummary): Check {
    const check: Check = {
      id: 'D2',
      name: 'TLS Configuration',
      description: 'TLS 1.2+, modern ciphers',
      status: 'unknown',
      findings: [],
      score: 100
    };

    summary.total++;

    if (results.tlsAudit) {
      const tlsOk = results.tlsAudit.tools?.openssl?.status === 'ok';

      if (tlsOk) {
        check.findings.push({
          type: 'pass',
          severity: 'info',
          item: 'TLS Available',
          detail: 'TLS connection successful',
          action: 'Ensure TLS 1.2+ only. Disable TLS 1.0/1.1. Use modern cipher suites (sslyze/testssl for details).'
        });
        summary.passed++;
        check.status = 'pass';
      } else {
        check.findings.push({
          type: 'fail',
          severity: 'critical',
          item: 'TLS Connection Failed',
          detail: 'Unable to establish TLS connection',
          action: 'Verify SSL/TLS configuration and certificate validity'
        });
        summary.critical++;
        summary.failed++;
        check.score = 0;
        check.status = 'fail';
      }
    }

    return check;
  }

  static checkWAF(results: ScanResults, summary: AuditSummary): Check {
    const check: Check = {
      id: 'E',
      name: 'WAF & Rate Limiting',
      description: 'Web Application Firewall detection',
      status: 'unknown',
      findings: [],
      score: 100
    };

    summary.total++;

    const hasCloudflare = results.osint?.categories?.saas?.services?.cdn?.provider?.includes('Cloudflare');
    const hasWAFHeader = results.http?.headers?.['cf-ray'] || results.http?.headers?.['x-sucuri-id'];

    if (hasCloudflare || hasWAFHeader) {
      check.findings.push({
        type: 'pass',
        severity: 'info',
        item: 'WAF Detected',
        detail: hasCloudflare ? 'Cloudflare WAF detected' : 'WAF headers detected',
        action: 'WAF is active. Monitor and tune rules regularly. Review false positives.'
      });
      summary.passed++;
      check.status = 'pass';
    } else {
      check.findings.push({
        type: 'warning',
        severity: 'medium',
        item: 'No WAF Detected',
        detail: 'No Web Application Firewall detected',
        action: 'Implement WAF (Cloudflare, AWS WAF, Akamai) for OWASP Top 10 protection. Configure rate limiting.'
      });
      summary.medium++;
      check.score -= 15;
      check.status = 'warning';
    }

    return check;
  }

  static checkAuth(_results: ScanResults, summary: AuditSummary): Check {
    const check: Check = {
      id: 'F',
      name: 'Authentication',
      description: 'Password policies, MFA, sessions (manual)',
      status: 'manual',
      findings: [{
        type: 'info',
        severity: 'info',
        item: 'Manual Check Required',
        detail: 'Authentication audit requires authenticated scan',
        action: 'Verify: password policies (min 12 chars, complexity), MFA enforcement, session timeouts (15-30 min), brute-force protection (rate limiting, CAPTCHA)'
      }],
      score: 0
    };

    summary.total++;

    return check;
  }

  static calculateScoreAndGrade(audit: SecurityAudit): void {
    let totalScore = 0;
    let scoredChecks = 0;

    for (const check of audit.checklist) {
      if (check.status !== 'manual' && check.status !== 'unknown') {
        totalScore += check.score;
        scoredChecks++;
      }
    }

    audit.summary.score = scoredChecks > 0 ? Math.round(totalScore / scoredChecks) : 0;

    if (audit.summary.score >= 90) audit.summary.grade = 'A';
    else if (audit.summary.score >= 80) audit.summary.grade = 'B';
    else if (audit.summary.score >= 70) audit.summary.grade = 'C';
    else if (audit.summary.score >= 60) audit.summary.grade = 'D';
    else audit.summary.grade = 'F';
  }

  static generateRecommendations(audit: SecurityAudit): void {
    const recommendations: Recommendation[] = [];

    for (const check of audit.checklist) {
      for (const finding of check.findings) {
        if (finding.type === 'fail' && finding.action) {
          recommendations.push({
            priority: finding.severity === 'critical' ? 1 : (finding.severity === 'high' ? 2 : 3),
            severity: finding.severity,
            category: check.name,
            item: finding.item,
            action: finding.action
          });
        }
      }
    }

    recommendations.sort((a, b) => a.priority - b.priority);

    audit.recommendations = recommendations;
  }

  static calculateDaysUntilExpiry(validToDate: string): number | null {
    if (!validToDate) return null;

    const expiry = new Date(validToDate);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  static generateMarkdownReport(audit: SecurityAudit): string {
    let md = `# Security Audit Report\n\n`;
    md += `**Target:** ${audit.target}\n`;
    md += `**Date:** ${new Date(audit.timestamp).toLocaleString()}\n`;
    md += `**Score:** ${audit.summary.score}/100 (Grade: ${audit.summary.grade})\n\n`;

    md += `## Summary\n\n`;
    md += `- Total Checks: ${audit.summary.total}\n`;
    md += `- Passed: ${audit.summary.passed}\n`;
    md += `- Failed: ${audit.summary.failed}\n`;
    md += `- Critical: ${audit.summary.critical}\n`;
    md += `- High: ${audit.summary.high}\n`;
    md += `- Medium: ${audit.summary.medium}\n`;
    md += `- Low: ${audit.summary.low}\n\n`;

    md += `## Checklist\n\n`;

    for (const check of audit.checklist) {
      const statusIcon = check.status === 'pass' ? '✅' : (check.status === 'fail' ? '❌' : '⚠️');
      md += `### ${statusIcon} ${check.id}) ${check.name}\n`;
      md += `*${check.description}*\n\n`;

      for (const finding of check.findings) {
        const icon = finding.type === 'pass' ? '✓' : (finding.type === 'fail' ? '✗' : 'ℹ');
        md += `- ${icon} **${finding.item}**: ${finding.detail}\n`;
        if (finding.action) {
          md += `  - Action: ${finding.action}\n`;
        }
      }

      md += `\n`;
    }

    if (audit.recommendations.length > 0) {
      md += `## Priority Recommendations\n\n`;

      for (const rec of audit.recommendations) {
        md += `${rec.priority}. **[${rec.severity.toUpperCase()}]** ${rec.item}\n`;
        md += `   - ${rec.action}\n\n`;
      }
    }

    return md;
  }
}
