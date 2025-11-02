# ReconPlugin Tool Coverage & Implementation Roadmap

**Last Updated**: 2025-11-01
**Status**: Analysis Complete - Implementation Roadmap Defined

---

## Executive Summary

Based on industry best practices and the comprehensive tool list provided, this document analyzes the current ReconPlugin implementation against recommended tooling and defines a clear roadmap for achieving full coverage.

**Current Coverage**: 18/35 tools (51%)
**MUST-HAVE Coverage**: 11/15 tools (73%)
**Priority**: Focus on remaining 4 MUST-HAVE tools first

---

## 📊 Current Implementation Status

### ✅ Fully Implemented (18 tools)

| Tool | Category | Stage | Status | Notes |
|------|----------|-------|--------|-------|
| **amass** | Subdomains | `subdomains-stage.js` | ✅ MUST | Passive + active enumeration |
| **subfinder** | Subdomains | `subdomains-stage.js` | ✅ MUST | Fast passive discovery |
| **assetfinder** | Subdomains | `subdomains-stage.js` | ✅ | Additional subdomain source |
| **crt.sh** | Subdomains | `subdomains-stage.js` | ✅ MUST | CT logs (passive) |
| **nmap** | Port Scanning | `ports-stage.js` | ✅ MUST | Service detection + NSE |
| **masscan** | Port Scanning | `ports-stage.js` | ✅ | Mass port scanning |
| **ffuf** | Web Discovery | `web-discovery-stage.js` | ✅ MUST | Directory fuzzing |
| **feroxbuster** | Web Discovery | `web-discovery-stage.js` | ✅ MUST | Recursive discovery |
| **gobuster** | Web Discovery | `web-discovery-stage.js` | ✅ MUST | Fast directory bruteforce |
| **nikto** | Vulnerability | `vulnerability-stage.js` | ✅ | Basic web checks |
| **wpscan** | Vulnerability | `vulnerability-stage.js` | ✅ | WordPress scanner |
| **droopescan** | Vulnerability | `vulnerability-stage.js` | ✅ | Drupal/Joomla scanner |
| **whatweb** | Fingerprinting | `fingerprint-stage.js` | ✅ | Technology detection |
| **sslyze** | TLS Audit | `tls-audit-stage.js` | ✅ | TLS configuration scanner |
| **testssl.sh** | TLS Audit | `tls-audit-stage.js` | ✅ | Comprehensive TLS tests |
| **aquatone** | Screenshots | `screenshot-stage.js` | ✅ | Visual reconnaissance |
| **eyewitness** | Screenshots | `screenshot-stage.js` | ✅ | Screenshot + report |
| **theHarvester** | OSINT | `osint-stage.js` | ✅ | Email/subdomain harvest |

### 🔴 Missing MUST-HAVE Tools (4 tools)

| Tool | Category | Priority | Implementation Effort | Impact |
|------|----------|----------|---------------------|--------|
| **OWASP ZAP** | Vulnerability | MUST | HIGH (new integration) | Active web scanning |
| **Snyk** | SCA | MUST | MEDIUM (API integration) | Dependency vulnerabilities |
| **Gitleaks** | Secrets | MUST | LOW (CLI wrapper) | Secrets detection |
| **Censys/SecurityTrails** | OSINT | MUST | MEDIUM (API integration) | Historical data |

### ⚠️ Missing Nice-to-Have Tools (13 tools)

| Tool | Category | Priority | Notes |
|------|----------|----------|-------|
| **recon-ng** | OSINT | MEDIUM | Pipeline framework |
| **massdns** | Resolution | LOW | Already have DNS stage |
| **Wappalyzer/WhatRuns** | Fingerprinting | LOW | Similar to whatweb |
| **waybackurls/gau** | Web Discovery | MEDIUM | Historical endpoints |
| **linkfinder** | Web Discovery | MEDIUM | JS endpoint extraction |
| **Burp Suite** | Manual Testing | N/A | Interactive tool |
| **OpenVAS/Greenbone** | Vulnerability | LOW | Heavy scanner |
| **Nessus** | Vulnerability | N/A | Commercial |
| **subjack/tko-subs** | Cloud | MEDIUM | Subdomain takeover |
| **cloud_enum/s3scanner** | Cloud | MEDIUM | Bucket enumeration |
| **gowitness** | Screenshots | LOW | Already have aquatone |
| **sqlmap** | Exploitation | N/A | Pentest only |
| **Metasploit** | Exploitation | N/A | Pentest only |

---

## 🎯 Implementation Roadmap

### Phase 1: MUST-HAVE Completion (Priority 1)

#### 1.1 OWASP ZAP Integration
**Effort**: 3-5 days | **Priority**: CRITICAL

```javascript
// New stage: zap-stage.js
export class ZapStage {
  async execute(target, options) {
    // ZAP baseline scan (passive)
    // ZAP active scan (configurable)
    // Spider + Ajax Spider
    // Passive rules analysis
    return {
      status: 'ok',
      alerts: [...],
      coverage: {},
      raw: zapReport
    };
  }
}
```

**Integration points**:
- Add to `vulnerability-stage.js` as primary scanner
- Docker support: `owasp/zap2docker-stable`
- API mode: ZAP REST API
- Configurable scan types: baseline, active, full

#### 1.2 Snyk Integration (SCA)
**Effort**: 2-3 days | **Priority**: HIGH

```javascript
// New stage: sca-stage.js (Software Composition Analysis)
export class ScaStage {
  async execute(target, options) {
    // Snyk CLI for repos
    // Dependency scanning
    // License compliance
    // Vulnerability database matching
    return {
      status: 'ok',
      vulnerabilities: [...],
      dependencies: {...},
      licenses: [...],
      raw: snykReport
    };
  }
}
```

**Integration points**:
- Requires API key configuration
- Can scan: package.json, requirements.txt, Gemfile, etc.
- Alternative: OSS Index, Dependabot API

#### 1.3 Gitleaks Integration (Secrets)
**Effort**: 1-2 days | **Priority**: HIGH

```javascript
// New stage: secrets-stage.js
export class SecretsStage {
  async execute(target, options) {
    // Gitleaks scan on URLs/endpoints
    // TruffleHog for git repos
    // Regex patterns for common secrets
    return {
      status: 'ok',
      findings: [...],
      categories: {...},
      raw: gitleaksReport
    };
  }
}
```

**Integration points**:
- Scan JS files from HTTP stage
- Scan wayback URLs
- Scan git repos (if accessible)

#### 1.4 Censys/SecurityTrails Integration
**Effort**: 2-3 days | **Priority**: HIGH

```javascript
// Enhance osint-stage.js
export class OsintStage {
  async execute(target, options) {
    // Existing: theHarvester, reconNg
    // NEW: Censys API (certificates, hosts)
    // NEW: SecurityTrails API (DNS history)
    // NEW: VirusTotal API (passive DNS)
    return {
      status: 'ok',
      censys: {...},
      securityTrails: {...},
      virusTotal: {...},
      historical: [...],
      raw: {...}
    };
  }
}
```

**Integration points**:
- API key management
- Rate limiting per API
- Historical data aggregation

---

### Phase 2: High-Value Additions (Priority 2)

#### 2.1 Historical Endpoints Discovery
**Effort**: 2-3 days | **Tools**: waybackurls, gau, linkfinder

```javascript
// New stage: historical-stage.js
export class HistoricalStage {
  async execute(target, options) {
    // waybackurls - Wayback Machine
    // gau (GetAllUrls) - multiple sources
    // linkfinder - JS endpoint extraction
    return {
      status: 'ok',
      endpoints: [...],
      jsFiles: [...],
      historical: [...],
      sources: {...}
    };
  }
}
```

#### 2.2 Subdomain Takeover Detection
**Effort**: 1-2 days | **Tools**: subjack, tko-subs

```javascript
// Enhance subdomains-stage.js
async checkTakeover(subdomain) {
  // Check for dangling CNAME
  // Verify provider responses
  // Test for takeover vulnerability
  return {
    vulnerable: boolean,
    provider: string,
    evidence: string
  };
}
```

#### 2.3 Cloud Bucket Enumeration
**Effort**: 2-3 days | **Tools**: cloud_enum, s3scanner

```javascript
// New stage: cloud-stage.js
export class CloudStage {
  async execute(target, options) {
    // S3 bucket enumeration
    // GCS bucket checks
    // Azure blob checks
    return {
      status: 'ok',
      buckets: [...],
      permissions: {...},
      findings: [...]
    };
  }
}
```

---

### Phase 3: Runtime & Monitoring Integration (Priority 3)

#### 3.1 WAF Detection & Analysis
**Effort**: 2-3 days

```javascript
// New stage: waf-stage.js
export class WafStage {
  async execute(target, options) {
    // Detect WAF presence (Cloudflare, AWS WAF, etc.)
    // Test WAF rules
    // Rate limit detection
    return {
      status: 'ok',
      waf: {...},
      rules: [...],
      bypasses: [...]
    };
  }
}
```

#### 3.2 SIEM Integration Helpers
**Effort**: 3-5 days

```javascript
// New export: SIEM formatters
export class SiemExporter {
  exportToElk(report) { /* ELK format */ }
  exportToSplunk(report) { /* Splunk format */ }
  exportToDatadog(report) { /* Datadog format */ }
}
```

---

## 🏗️ Architectural Recommendations

### 1. Stage Organization

Current structure is good, but add:

```
src/plugins/recon/stages/
├── existing stages...
├── zap-stage.js          # OWASP ZAP scanner
├── sca-stage.js          # Software Composition Analysis
├── secrets-stage.js      # Secrets detection
├── historical-stage.js   # Historical endpoints
├── cloud-stage.js        # Cloud asset enumeration
├── waf-stage.js          # WAF detection
└── compliance-stage.js   # Compliance checks
```

### 2. API Key Management

Add centralized API key manager:

```javascript
// managers/api-key-manager.js
export class ApiKeyManager {
  constructor(plugin) {
    this.keys = {
      snyk: process.env.SNYK_API_KEY,
      censys: process.env.CENSYS_API_KEY,
      securityTrails: process.env.SECURITYTRAILS_API_KEY,
      virusTotal: process.env.VT_API_KEY
    };
  }

  getKey(service) {
    if (!this.keys[service]) {
      this.plugin.emit('recon:api-key-missing', { service });
    }
    return this.keys[service];
  }
}
```

### 3. Docker Support for Heavy Tools

```javascript
// managers/docker-manager.js
export class DockerManager {
  async runZap(target, options) {
    // docker run owasp/zap2docker-stable zap-baseline.py
  }

  async runOpenVas(target, options) {
    // docker run greenbone/openvas
  }
}
```

### 4. Rate Limiting per Tool

Enhance current rate limiter:

```javascript
// config/rate-limits.js
export const TOOL_RATE_LIMITS = {
  censys: { requests: 120, window: 300000 },      // 120 req/5min
  securityTrails: { requests: 50, window: 60000 }, // 50 req/min
  virusTotal: { requests: 4, window: 60000 },      // 4 req/min (free)
  snyk: { requests: 100, window: 3600000 }         // 100 req/hour
};
```

---

## 📝 Implementation Priority Matrix

| Tool/Feature | Effort | Impact | Priority | Timeline |
|--------------|--------|--------|----------|----------|
| **OWASP ZAP** | HIGH | HIGH | 🔴 P1 | Week 1-2 |
| **Gitleaks** | LOW | HIGH | 🔴 P1 | Week 1 |
| **Snyk/SCA** | MEDIUM | HIGH | 🔴 P1 | Week 2 |
| **Censys API** | MEDIUM | HIGH | 🔴 P1 | Week 2-3 |
| **Historical Endpoints** | MEDIUM | MEDIUM | 🟡 P2 | Week 3-4 |
| **Subdomain Takeover** | LOW | HIGH | 🟡 P2 | Week 3 |
| **Cloud Enumeration** | MEDIUM | MEDIUM | 🟡 P2 | Week 4 |
| **WAF Detection** | MEDIUM | LOW | 🟢 P3 | Week 5 |
| **SIEM Integration** | HIGH | MEDIUM | 🟢 P3 | Week 6-7 |

---

## 🚀 Quick Wins (Implement First)

### 1. Gitleaks Integration (1-2 days)
**Why**: Low effort, high impact, no API keys required

### 2. Subdomain Takeover (1-2 days)
**Why**: Simple check, high security value

### 3. Censys API (2-3 days)
**Why**: Immediate value for passive recon

### 4. OWASP ZAP Baseline (3-5 days)
**Why**: Industry standard, comprehensive scanning

---

## 📦 Dependencies & Prerequisites

### External Tools Required

```bash
# Phase 1 (MUST-HAVE)
docker pull owasp/zap2docker-stable
npm install -g snyk
go install github.com/gitleaks/gitleaks/v8@latest

# Phase 2 (Nice-to-have)
go install github.com/lc/gau/v2/cmd/gau@latest
go install github.com/tomnomnom/waybackurls@latest
go install github.com/GerbenJavado/LinkFinder@latest
go install github.com/haccer/subjack@latest
```

### API Keys Required

```bash
# .env.example
SNYK_API_KEY=your_snyk_key
CENSYS_API_ID=your_censys_id
CENSYS_API_SECRET=your_censys_secret
SECURITYTRAILS_API_KEY=your_st_key
VT_API_KEY=your_virustotal_key
```

---

## 🎓 Learning Resources

### For Implementation

- **OWASP ZAP**: https://www.zaproxy.org/docs/docker/
- **Snyk CLI**: https://docs.snyk.io/snyk-cli
- **Gitleaks**: https://github.com/gitleaks/gitleaks
- **Censys API**: https://search.censys.io/api
- **SecurityTrails API**: https://securitytrails.com/corp/api

### For Testing

- **OWASP WebGoat**: Vulnerable app for testing
- **DVWA**: Damn Vulnerable Web Application
- **Test sites**: scanme.nmap.org, testphp.vulnweb.com

---

## ✅ Acceptance Criteria

### Phase 1 Complete When:
- [ ] OWASP ZAP integrated with baseline + active scan modes
- [ ] Gitleaks scanning implemented for JS files + URLs
- [ ] Snyk SCA scanning for common package managers
- [ ] Censys/SecurityTrails API integration with rate limiting
- [ ] All 4 MUST-HAVE tools have comprehensive tests
- [ ] Documentation updated with new stages
- [ ] Examples generated for each new tool

### Phase 2 Complete When:
- [ ] Historical endpoint discovery (waybackurls + gau)
- [ ] Subdomain takeover detection integrated
- [ ] Cloud bucket enumeration (S3 + GCS + Azure)
- [ ] All tools have artifact generation
- [ ] Performance benchmarks documented

### Phase 3 Complete When:
- [ ] WAF detection implemented
- [ ] SIEM export formatters complete
- [ ] Docker manager for heavy tools
- [ ] Full CI/CD integration examples
- [ ] Production deployment guide

---

## 🤝 Next Steps

1. **Review & Approve**: Stakeholder review of roadmap
2. **Resource Allocation**: Assign developers to Phase 1
3. **Environment Setup**: Configure API keys, Docker, etc.
4. **Sprint Planning**: Break Phase 1 into 2-week sprints
5. **Implementation**: Start with Gitleaks (quick win)

---

**Document Owner**: ReconPlugin Maintainers
**Last Review**: 2025-11-01
**Next Review**: After Phase 1 completion
