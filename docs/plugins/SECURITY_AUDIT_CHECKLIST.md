# Security Audit Checklist - ReconPlugin

## Overview

The **SecurityAnalyzer** runs an executable security checklist based on:
- OWASP Top 10
- CIS Benchmarks
- Industry Best Practices

It analyzes results from any scan (passive, stealth, aggressive) and generates an audit report with **findings, severity levels, and recommended actions**.

## Checklist Categories

### A) Inventory ✅
**Run:** `amass + subfinder + crtsh`

**Checks:**
- Subdomains enumeration
- SSL/TLS certificate expiry
- CDN detection

**Auto-detected Issues:**
- Certificate expiring < 30 days (HIGH)
- Certificate expiring < 7 days (CRITICAL)
- Excessive subdomains > 100 (MEDIUM)
- No CDN detected (LOW)

### B) Secrets ✅
**Run:** `gitleaks + pattern matching`

**Checks:**
- Leaked API keys
- Exposed credentials
- Tokens in repos/web pages

**Auto-detected Issues:**
- Any secret found (CRITICAL - automatic fail)
- Exposed config files (.env, config.json) (HIGH)

### C) Dependencies ⚠️
**Manual:** Requires package.json/requirements.txt access

**Actions:**
- Run `npm audit` / `yarn audit` / `snyk test`
- Patch high/critical vulnerabilities
- Enable GitHub Dependabot

### D) Headers & TLS ✅
**Auto-detected via HTTP/TLS scan**

**Checks:**
- HSTS (Strict-Transport-Security)
- CSP (Content-Security-Policy)
- X-Frame-Options
- X-Content-Type-Options
- TLS 1.2+ configuration

**Auto-detected Issues:**
- Missing HSTS (HIGH)
- Missing CSP (MEDIUM)
- Missing X-Frame-Options (MEDIUM)
- Missing X-Content-Type-Options (LOW)
- TLS connection failed (CRITICAL)

### E) WAF & Rate Limiting ✅
**Auto-detected via headers/CDN**

**Checks:**
- WAF presence (Cloudflare, AWS WAF, Akamai, etc.)
- Rate limiting implementation

**Auto-detected Issues:**
- No WAF detected (MEDIUM)

### F) Auth ⚠️
**Manual:** Requires authenticated scan

**Actions:**
- Verify password policies (min 12 chars, complexity)
- Enforce MFA (Multi-Factor Authentication)
- Configure session timeouts (15-30 min)
- Implement brute-force protection (rate limiting, CAPTCHA)

### G) Backups & DR ⚠️
**Manual:** Infrastructure check

**Actions:**
- Test restore from backup
- Document disaster recovery procedures
- Schedule regular backup tests

### H) CI/CD Gating ⚠️
**Manual:** Requires repo access

**Actions:**
- Add SAST checks to PR pipeline (CodeQL, Semgrep)
- Add SCA checks (Snyk, Dependabot)
- Add secrets scanning (gitleaks, truffleHog)
- Block PRs with critical findings

### I) Pentest ⚠️
**Manual:** External service

**Actions:**
- Schedule accredited penetration test
- Fix high/critical findings within SLA
- Retest after remediation

### J) Monitoring ⚠️
**Manual:** Infrastructure check

**Actions:**
- Implement central logging (ELK, Splunk, Datadog)
- Configure security alerts (failed logins, anomalies)
- Set up uptime monitoring
- Create incident response playbook

## Usage

### Basic Usage

```javascript
import { ReconPlugin } from 's3db.js/plugins/recon';

// 1. Run scan (any behavior: passive, stealth, aggressive)
const plugin = new ReconPlugin({ behavior: 'aggressive' });
const report = await plugin.scan('example.com', {
  subdomains: true,
  certificate: true,
  secrets: true,
  http: true,
  tlsAudit: true,
  osint: { saas: true }
});

// 2. Generate security audit
const audit = plugin.generateSecurityAudit(report);

console.log(`Security Score: ${audit.summary.score}/100 (Grade: ${audit.summary.grade})`);
console.log(`Critical: ${audit.summary.critical}`);
console.log(`High: ${audit.summary.high}`);
console.log(`Medium: ${audit.summary.medium}`);
console.log(`Low: ${audit.summary.low}`);
```

### Generate Markdown Report

```javascript
// Generate markdown audit report
const markdown = plugin.generateSecurityAuditMarkdown(report);

// Save to file
import fs from 'fs';
fs.writeFileSync('security-audit.md', markdown);
```

### Example Output

```json
{
  "target": "example.com",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "summary": {
    "score": 75,
    "grade": "C",
    "total": 7,
    "passed": 3,
    "failed": 2,
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 1
  },
  "checklist": [
    {
      "id": "A",
      "name": "Inventory",
      "status": "pass",
      "score": 95,
      "findings": [
        {
          "type": "pass",
          "severity": "info",
          "item": "Subdomains Enumeration",
          "detail": "23 subdomains discovered"
        },
        {
          "type": "pass",
          "severity": "info",
          "item": "Certificate Validity",
          "detail": "SSL certificate valid for 87 days"
        },
        {
          "type": "warning",
          "severity": "low",
          "item": "No CDN Detected",
          "action": "Consider Cloudflare, Fastly, or AWS CloudFront"
        }
      ]
    },
    {
      "id": "B",
      "name": "Secrets",
      "status": "pass",
      "score": 100,
      "findings": [
        {
          "type": "pass",
          "severity": "info",
          "item": "No Secrets Detected",
          "action": "Continue monitoring. Implement pre-commit hooks"
        }
      ]
    },
    {
      "id": "D1",
      "name": "Security Headers",
      "status": "fail",
      "score": 65,
      "findings": [
        {
          "type": "fail",
          "severity": "high",
          "item": "Missing HSTS",
          "action": "Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"
        },
        {
          "type": "fail",
          "severity": "medium",
          "item": "Missing CSP",
          "action": "Implement CSP to prevent XSS. Start with report-only mode."
        }
      ]
    }
  ],
  "recommendations": [
    {
      "priority": 2,
      "severity": "high",
      "category": "Security Headers",
      "item": "Missing HSTS",
      "action": "Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"
    },
    {
      "priority": 3,
      "severity": "medium",
      "category": "Security Headers",
      "item": "Missing CSP",
      "action": "Implement CSP to prevent XSS. Start with report-only mode."
    }
  ]
}
```

### Example Markdown Report

```markdown
# Security Audit Report

**Target:** example.com
**Date:** 1/1/2025, 12:00:00 AM
**Score:** 75/100 (Grade: C)

## Summary

- Total Checks: 7
- Passed: 3
- Failed: 2
- Critical: 0
- High: 1
- Medium: 2
- Low: 1

## Checklist

### ✅ A) Inventory
*Subdomains, IPs, certificates, CDN detection*

- ✓ **Subdomains Enumeration**: 23 subdomains discovered
- ✓ **Certificate Validity**: SSL certificate valid for 87 days
- ℹ **No CDN Detected**: No CDN detected
  - Action: Consider Cloudflare, Fastly, or AWS CloudFront

### ✅ B) Secrets
*Leaked API keys, credentials, tokens*

- ✓ **No Secrets Detected**: No exposed secrets found
  - Action: Continue monitoring. Implement pre-commit hooks (gitleaks, truffleHog)

### ❌ D1) Security Headers
*HSTS, CSP, X-Frame-Options, etc.*

- ✗ **Missing HSTS**: Strict-Transport-Security header not found
  - Action: Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
- ✗ **Missing CSP**: Content-Security-Policy header not found
  - Action: Implement CSP to prevent XSS. Start with report-only mode.

## Priority Recommendations

1. **[HIGH]** Missing HSTS
   - Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

2. **[MEDIUM]** Missing CSP
   - Implement CSP to prevent XSS. Start with report-only mode.
```

## Severity Levels

| Severity | Score Impact | Priority | Example |
|----------|--------------|----------|---------|
| CRITICAL | -25 points | P0 | Leaked secrets, TLS failure, cert expired |
| HIGH | -15 points | P1 | Missing HSTS, cert expiring < 30 days |
| MEDIUM | -10 points | P2 | Missing CSP, no WAF, excessive subdomains |
| LOW | -5 points | P3 | Missing X-Content-Type-Options, no CDN |
| INFO | 0 points | - | Informational findings |

## Grading Scale

| Grade | Score Range | Description |
|-------|-------------|-------------|
| A | 90-100 | Excellent security posture |
| B | 80-89 | Good security, minor improvements needed |
| C | 70-79 | Acceptable, moderate improvements needed |
| D | 60-69 | Poor, significant improvements needed |
| F | 0-59 | Failing, critical improvements required |

## Integration with CI/CD

```javascript
// ci-security-check.js
import { ReconPlugin } from 's3db.js/plugins/recon';

const plugin = new ReconPlugin({ behavior: 'aggressive' });
const report = await plugin.scan(process.env.DOMAIN, {
  subdomains: true,
  secrets: true,
  http: true,
  tlsAudit: true
});

const audit = plugin.generateSecurityAudit(report);

console.log(`Security Grade: ${audit.summary.grade}`);

// Fail CI if critical issues found
if (audit.summary.critical > 0) {
  console.error(`FAILED: ${audit.summary.critical} critical security issues found!`);
  process.exit(1);
}

// Warn if high issues found
if (audit.summary.high > 0) {
  console.warn(`WARNING: ${audit.summary.high} high security issues found!`);
}

// Generate report
const markdown = plugin.generateSecurityAuditMarkdown(report);
fs.writeFileSync('security-audit.md', markdown);

console.log('Security audit passed!');
```

## Best Practices

1. **Run regularly**: Schedule weekly scans with `cron` or GitHub Actions
2. **Track over time**: Compare audits to measure security improvements
3. **Automate fixes**: Implement auto-renewal for certs, auto-patching for deps
4. **Set thresholds**: Fail CI/CD on CRITICAL, warn on HIGH
5. **Document exceptions**: If you can't fix something, document why
6. **Retest after fixes**: Verify improvements with new scan
7. **Combine with manual tests**: Auto-scan + pentest = comprehensive coverage

## Manual Checks Checklist

Print this checklist for manual verification:

```
□ C) Dependencies
  □ Run npm audit / yarn audit / snyk test
  □ Patch high/critical vulnerabilities
  □ Enable GitHub Dependabot

□ F) Auth
  □ Password policies: min 12 chars, complexity required
  □ MFA enforced for all users
  □ Session timeout: 15-30 min
  □ Brute-force protection: rate limiting + CAPTCHA

□ G) Backups & DR
  □ Backup tested and restore verified
  □ DR procedures documented
  □ Regular backup tests scheduled

□ H) CI/CD Gating
  □ SAST checks in PR pipeline (CodeQL, Semgrep)
  □ SCA checks (Snyk, Dependabot)
  □ Secrets scanning (gitleaks, truffleHog)
  □ PRs blocked on critical findings

□ I) Pentest
  □ Accredited pentest scheduled
  □ High/critical findings fixed
  □ Retest completed

□ J) Monitoring
  □ Central logging enabled (ELK, Splunk, Datadog)
  □ Security alerts configured
  □ Uptime monitoring active
  □ Incident response playbook created
```

## See Also

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)
- [Mozilla Security Guidelines](https://wiki.mozilla.org/Security/Guidelines)
- [Security Headers](https://securityheaders.com/)
- [SSL Labs](https://www.ssllabs.com/)
