# 🔒 ReconPlugin - Security Guidelines

## ⚠️ CRITICAL: Never Test Against Public Servers Without Authorization

**Testing reconnaissance tools against public servers is:**

### 🚨 Illegal
- Violates Computer Fraud and Abuse Act (CFAA) in the US
- Breaks LGPD/Marco Civil da Internet in Brazil
- May violate cybercrime laws in your jurisdiction
- Can result in criminal prosecution

### 🚫 Unethical
- Port scanning without permission is hostile reconnaissance
- Vulnerability detection is a form of intrusion
- Fingerprinting services can be seen as attack preparation
- Violates responsible disclosure principles

### ⚡ Dangerous
- Triggers Intrusion Detection Systems (IDS)
- May result in IP bans
- Can be logged and reported to authorities
- Damages reputation and professional standing

---

## ✅ Safe Testing Practices

### 1. **Use Reserved Test Domains**

```javascript
// ✅ SAFE - Reserved for testing (RFC 2606)
'example.com'
'example.org'
'example.net'
'test.example.com'
'localhost.example.com'
```

### 2. **Use Localhost/Loopback**

```javascript
// ✅ SAFE - Local only
'localhost'
'127.0.0.1'
'::1'
'127.0.0.0/8'
```

### 3. **Use Mocks/Stubs**

```javascript
// ✅ SAFE - No real network calls
vi.spyOn(dns, 'lookup').mockResolvedValue([
  { address: '127.0.0.1', family: 4 }
]);

vi.spyOn(execPromise, 'default').mockResolvedValue({
  stdout: 'mocked output',
  stderr: ''
});
```

### 4. **Use Controlled Test Environments**

```javascript
// ✅ SAFE - Your own infrastructure
'internal-test-server.local'
'10.0.0.100' // Private network
'192.168.1.100' // Private network
'172.16.0.100' // Private network
```

---

## 🧪 Test Suite Compliance

Our test suite follows these guidelines:

### Current Test Files
- ✅ `tests/plugins/recon.plugin.test.js` - Uses `example.com` + mocks
- ✅ `tests/plugins/recon.plugin.api.test.js` - Uses `example.com` + stubs
- ✅ `tests/plugins/recon.plugin.behaviors.test.js` - Uses mocks only

### What We Mock
- ✅ DNS lookups (`dns.lookup`, `dns.resolve4`, `dns.resolveMx`)
- ✅ External commands (`nmap`, `subfinder`, `amass`, `nuclei`)
- ✅ HTTP requests (Puppeteer, axios)
- ✅ Port scans
- ✅ Certificate queries

**Result**: ZERO real network calls to external hosts!

---

## 📝 Code Review Checklist

Before merging ReconPlugin changes, verify:

- [ ] No hardcoded public URLs (except `example.com`)
- [ ] All external calls are mocked in tests
- [ ] No real DNS lookups in CI/CD
- [ ] No port scanning of public IPs
- [ ] Documentation warns about authorization
- [ ] Examples use `localhost` or `example.com`

---

## 🎯 Production Usage Guidelines

### ✅ Authorized Use Cases
- Scanning your own infrastructure with written permission
- Penetration testing with signed engagement letter
- Bug bounty programs (within scope)
- Internal security audits
- CTF competitions (sandboxed environments)

### ❌ Never Do This
```javascript
// ❌ ILLEGAL - No authorization
await plugin.runDiagnostics('google.com');
await plugin.runDiagnostics('github.com');
await plugin.runDiagnostics('random-company.com');
```

### ✅ Do This Instead
```javascript
// ✅ LEGAL - Your own domain
await plugin.runDiagnostics('my-company.com', {
  // Ensure you have written authorization
});

// ✅ LEGAL - Internal network
await plugin.runDiagnostics('10.0.0.50', {
  // Your own infrastructure
});

// ✅ LEGAL - Localhost testing
await plugin.runDiagnostics('localhost');
```

---

## 📋 Authorization Template

Before using ReconPlugin in production, obtain written authorization:

```
AUTHORIZATION FOR SECURITY TESTING

I, [NAME], [TITLE] at [COMPANY], hereby authorize [YOUR_NAME/TEAM]
to perform security reconnaissance and testing on the following assets:

Scope:
- Domains: [list]
- IP Ranges: [list]
- Date Range: [start] to [end]

Out of Scope:
- [list anything explicitly forbidden]

Authorized Activities:
- Port scanning
- Service fingerprinting
- Subdomain enumeration
- TLS/SSL analysis
- Web technology detection

[SIGNATURE]
[DATE]
```

---

## 🔗 Legal Resources

- [CFAA (USA)](https://www.law.cornell.edu/uscode/text/18/1030)
- [LGPD (Brazil)](https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Bug Bounty Code of Conduct](https://www.bugcrowd.com/resources/essentials/code-of-conduct/)

---

## 💡 Remember

> **"Just because you CAN scan it, doesn't mean you SHOULD scan it."**

Always get explicit written permission before performing any reconnaissance activities.

---

**Last Updated**: 2025-01-02
**Maintainer**: s3db.js team
**Contact**: security@[your-domain]
