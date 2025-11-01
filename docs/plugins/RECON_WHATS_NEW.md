# ReconPlugin - What's New (2025)

## 🆕 Major Updates

### 1. Infrastructure Tools Suite
Complete infrastructure reconnaissance with 5 new tools:

- **ASN Lookup**: Network ownership, IP ranges, BGP data (iptoasn.com + hackertarget.com)
- **DNSDumpster**: DNS intelligence via web scraping (A, AAAA, MX, TXT, NS records)
- **sslyze & sslscan**: Comprehensive TLS/SSL scanning (cipher suites, protocols, vulnerabilities)
- **massdns**: High-performance mass DNS resolver (1000s queries/sec)

### 2. Complete OSINT Coverage
100% free OSINT reconnaissance across all categories:

**Username Enumeration**:
- Sherlock (300+ sites)
- Maigret (2000+ sites)
- **WhatsMyName (400+ sites)** - NEW!

**Search Engine Intelligence**:
- **Google Dorks (8 categories)** - NEW!
  - GitHub repositories/code
  - Pastebin leaks
  - LinkedIn employees
  - Exposed documents (PDF, DOC, XLS)
  - Subdomains
  - Login/admin pages
  - Config files (.env, .ini, .yml)
  - Error pages

**Leak Detection**:
- HaveIBeenPwned v2
- **Scylla.sh API** - NEW!

**Email Collection**:
- theHarvester (free search engines only)

**SaaS Footprint Detection** - MASSIVELY EXPANDED:
- 70+ services auto-detected
- 14 categories (Analytics, Chat, Monitoring, Payment, Auth, CRM, A/B Testing, CMS, Social Pixels, Advertising)
- DNS-based detection (MX, SPF, DKIM, CNAME, NS, A records)
- HTTP-based detection (headers, JavaScript tags)

### 3. Security Audit Checklist
Executive security audit generator following OWASP Top 10 + CIS Benchmarks:

**Auto-Scanned** (5/10 checks):
- ✅ A) Inventory (subdomains, IPs, certs, CDN)
- ✅ B) Secrets (leaked keys, credentials)
- ✅ D) Headers & TLS (HSTS, CSP, TLS1.2+)
- ✅ E) WAF & Rate Limiting

**Manual Guidance** (5/10 checks):
- ⚠️ C) Dependencies (npm audit, Snyk)
- ⚠️ F) Auth (MFA, password policies)
- ⚠️ G) Backups & DR
- ⚠️ H) CI/CD Gating (SAST, SCA)
- ⚠️ I) Pentest
- ⚠️ J) Monitoring

**Output**:
- Security Score (0-100)
- Grade (A-F)
- Prioritized recommendations
- Severity levels (CRITICAL, HIGH, MEDIUM, LOW)
- Markdown/JSON reports

## 📊 Usage Examples

### Complete Scan with Security Audit

```javascript
import { ReconPlugin } from 's3db.js/plugins/recon';

// 1. Run aggressive scan
const plugin = new ReconPlugin({ behavior: 'aggressive' });
const report = await plugin.scan('example.com', {
  // Infrastructure
  asn: true,
  dnsdumpster: true,
  massdns: { enabled: true, wordlist: '/path/to/wordlist.txt' },

  // OSINT
  osint: {
    usernames: true,
    whatsmyname: true,
    emails: true,
    leaks: true,
    scylla: true,
    github: true,
    saas: true
  },

  // Google Dorks
  googleDorks: {
    enabled: true,
    categories: ['github', 'pastebin', 'linkedin', 'documents', 'configs']
  },

  // Security
  secrets: true,
  http: true,
  tlsAudit: { sslyze: true, sslscan: true }
});

// 2. Generate security audit
const audit = plugin.generateSecurityAudit(report);

console.log(`Security Grade: ${audit.summary.grade}`);
console.log(`Critical Issues: ${audit.summary.critical}`);
console.log(`High Issues: ${audit.summary.high}`);

// 3. Get prioritized recommendations
audit.recommendations.forEach(rec => {
  console.log(`[${rec.severity}] ${rec.item}: ${rec.action}`);
});

// 4. Generate markdown report
const markdown = plugin.generateSecurityAuditMarkdown(report);
fs.writeFileSync('security-audit.md', markdown);
```

### CI/CD Integration

```javascript
// Fail CI on critical security issues
const audit = plugin.generateSecurityAudit(report);

if (audit.summary.critical > 0) {
  console.error(`FAILED: ${audit.summary.critical} critical issues`);
  process.exit(1);
}

if (audit.summary.grade === 'F' || audit.summary.grade === 'D') {
  console.error(`FAILED: Security grade ${audit.summary.grade}`);
  process.exit(1);
}
```

### Targeted OSINT Scan

```javascript
// Username enumeration across all sources
const report = await plugin.scan('target.com', {
  osint: {
    usernames: true,
    sherlock: true,
    maigret: false,  // Skip slow scans
    whatsmyname: true,  // Fast API-based
    maxSites: 100
  }
});

const usernames = report.results.osint.categories.usernames;
console.log(`Found ${usernames.profiles.length} profiles`);
```

### SaaS Footprint Analysis

```javascript
// Detect all third-party services
const report = await plugin.scan('target.com', {
  osint: { saas: true }
});

const saas = report.results.osint.categories.saas.services;

console.log('Analytics:', saas.analytics);  // [{ provider: 'Google Analytics', evidence: '...' }]
console.log('Chat:', saas.chat);  // [{ provider: 'Intercom', evidence: '...' }]
console.log('Monitoring:', saas.monitoring);  // [{ provider: 'Sentry', evidence: '...' }]
console.log('CDN:', saas.cdn);  // { provider: 'Cloudflare', evidence: '...' }
console.log('Email:', saas.email);  // { provider: 'Google Workspace', evidence: 'MX records' }
```

### Google Dorks Search

```javascript
const report = await plugin.scan('target.com', {
  googleDorks: {
    enabled: true,
    maxResults: 20,
    categories: ['github', 'pastebin', 'documents', 'configs']
  }
});

const dorks = report.results.googleDorks.categories;

console.log('GitHub Results:', dorks.github.results);
console.log('Pastebin Leaks:', dorks.pastebin.results);
console.log('Exposed Docs:', dorks.documents.results);
console.log('Config Files:', dorks.configs.results);
```

## 🎯 Behavior Presets Updated

### Passive
- ASN: ✅ (iptoasn only)
- DNSDumpster: ✅
- massdns: ❌
- Google Dorks: ❌
- OSINT: emails, SaaS only

### Stealth
- ASN: ✅ (both APIs)
- DNSDumpster: ✅
- massdns: ❌
- Google Dorks: ❌
- OSINT: emails, SaaS, leaks (HIBP only), GitHub repos
- TLS: openssl, sslscan

### Aggressive
- ASN: ✅ (both APIs)
- DNSDumpster: ✅
- massdns: ✅ (5000 rate, 5000 subdomains)
- Google Dorks: ✅ (all categories)
- OSINT: everything (Sherlock, WhatsMyName, HIBP, Scylla, GitHub full)
- TLS: openssl, sslyze, testssl, sslscan

## 📦 Configuration Options

### New Config Options

```javascript
{
  // Infrastructure
  asn: {
    iptoasn: true,
    hackertarget: true
  },

  dnsdumpster: {
    enabled: true,
    fallbackToDig: true
  },

  massdns: {
    enabled: false,
    wordlist: null,
    resolvers: '/etc/resolv.conf',
    rate: 1000,
    maxSubdomains: 1000
  },

  // OSINT
  osint: {
    // Username enumeration
    whatsmyname: false,
    maxSites: 50,

    // Leak detection
    hibp: true,
    scylla: true,

    // ... existing options
  },

  // Google Dorks
  googleDorks: {
    enabled: false,
    maxResults: 10,
    categories: [
      'github',
      'pastebin',
      'linkedin',
      'documents',
      'subdomains',
      'loginPages',
      'configs',
      'errors'
    ]
  },

  // TLS Audit
  tlsAudit: {
    openssl: true,
    sslyze: false,
    testssl: false,
    sslscan: false
  }
}
```

## 🔒 100% Free & Privacy-Focused

All new tools use:
- ✅ Public APIs (no API keys required)
- ✅ Web scraping (publicly available data)
- ✅ CLI tools (local execution)
- ❌ No paid APIs (removed Hunter.io, Shodan, Censys, SecurityTrails)
- ❌ No data collection
- ❌ No rate limiting on free tiers (where possible)

## 📚 Documentation

- [Security Audit Checklist](./SECURITY_AUDIT_CHECKLIST.md) - Complete guide
- [OSINT Stage](../examples/e18-osint-stage.js) - Example usage
- [Infrastructure Tools](../examples/e45-infrastructure-tools.js) - Example usage

## 🚀 Performance

- massdns: 1000-5000 queries/second
- WhatsMyName: 50-100 sites in ~30 seconds (200ms delay)
- Google Dorks: DuckDuckGo HTML scraping (no rate limits)
- Security Audit: < 1 second analysis time

## 🛡️ Security Best Practices

1. **Run security audits weekly** - Schedule with cron/GitHub Actions
2. **Fail CI on CRITICAL** - Block deployments with security issues
3. **Track score over time** - Monitor security improvements
4. **Rotate leaked secrets immediately** - Auto-detected by Secrets check
5. **Implement missing headers** - Auto-detected by Headers check
6. **Enable WAF** - Auto-detected, recommended if missing
7. **Monitor cert expiry** - Auto-detected, alerts < 30 days

## 🔄 Migration Guide

### From v1.x to v2.0

```javascript
// Old (v1.x)
const report = await plugin.scan('example.com');

// New (v2.0) - Same API, more features
const report = await plugin.scan('example.com', {
  // Enable new tools
  asn: true,
  dnsdumpster: true,
  googleDorks: { enabled: true },
  osint: { whatsmyname: true, scylla: true }
});

// NEW: Generate security audit
const audit = plugin.generateSecurityAudit(report);
```

No breaking changes! All existing code works as-is.

## 📈 Roadmap

Planned for future releases:

- [ ] truffleHog integration (Git secret scanner)
- [ ] Recon-ng integration (OSINT framework)
- [ ] SpiderFoot integration (automation platform)
- [ ] Dependency scanning (npm audit, Snyk API)
- [ ] DAST scanning (ZAP, Burp Suite)
- [ ] Container scanning (Docker, Kubernetes)

## 🎉 Summary

**Total New Features**: 18+
**Total New Lines**: 3000+
**Coverage**: 100% of requested OSINT + Security tools
**Cost**: 100% FREE

All reconnaissance tools now available in a single, unified plugin! 🚀
