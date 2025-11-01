# Recon Plugin - Behavior Modes

## Overview

The ReconPlugin supports three behavior modes that automatically configure tool selection, timing, and aggressiveness to match different operational contexts.

## Mode Comparison

| Aspect | `passive` | `stealth` | `aggressive` |
|--------|-----------|-----------|--------------|
| **Use Case** | External recon, OSINT | Authorized pentest, low-noise | Internal audit, red team |
| **Detection Risk** | None | Low | High |
| **Speed** | Fast (API calls only) | Slow (rate-limited) | Very Fast (parallel scans) |
| **Completeness** | Basic | Moderate | Comprehensive |

---

## Mode Specifications

### 🟢 **Passive Mode**

**Philosophy:** Zero active scanning. Only public data sources and non-intrusive queries.

**Enabled Tools:**
- ✅ DNS (Node.js built-in)
- ✅ Certificate Transparency (crt.sh API)
- ✅ Passive subdomain enum (crt.sh only, no brute-force)
- ✅ OSINT (theHarvester)
- ❌ NO port scans
- ❌ NO HTTP requests to target
- ❌ NO brute-force/fuzzing
- ❌ NO active fingerprinting

**Configuration:**
```javascript
{
  behavior: 'passive',
  features: {
    dns: true,
    certificate: false, // no active TLS handshake
    http: { curl: false },
    latency: { ping: false, traceroute: false },
    subdomains: {
      amass: false,      // active DNS queries
      subfinder: false,  // active DNS queries
      assetfinder: false,
      crtsh: true        // passive CT logs
    },
    ports: { nmap: false, masscan: false },
    web: { ffuf: false, feroxbuster: false, gobuster: false },
    vulnerability: { nikto: false, wpscan: false, droopescan: false },
    tlsAudit: { openssl: false, sslyze: false, testssl: false },
    fingerprint: { whatweb: false },
    screenshots: { aquatone: false, eyewitness: false },
    osint: { theHarvester: true, reconNg: false }
  },
  concurrency: 2,
  nmap: { topPorts: 0 }, // disabled
  rateLimit: { enabled: false }
}
```

**Timeout Adjustments:**
- DNS: 5000ms
- CT API: 10000ms

---

### 🟡 **Stealth Mode**

**Philosophy:** Authorized scanning with low noise. Mimics organic traffic patterns.

**Enabled Tools:**
- ✅ DNS (with delays between queries)
- ✅ Certificate inspection (single TLS handshake)
- ✅ HTTP headers (`curl` with realistic User-Agent)
- ✅ ICMP ping (small packet count)
- ✅ Limited port scan (top 10 ports, slow timing)
- ✅ Passive subdomains (CT + 1 active tool)
- ❌ NO mass scans (masscan)
- ❌ NO aggressive brute-force
- ❌ NO vulnerability scanners

**Configuration:**
```javascript
{
  behavior: 'stealth',
  features: {
    dns: true,
    certificate: true,
    http: { curl: true },
    latency: { ping: true, traceroute: false }, // traceroute is noisy
    subdomains: {
      amass: false,       // too noisy
      subfinder: true,    // rate-limited
      assetfinder: false,
      crtsh: true
    },
    ports: {
      nmap: true,         // with -T2 timing
      masscan: false      // too fast/noisy
    },
    web: { ffuf: false, feroxbuster: false, gobuster: false },
    vulnerability: { nikto: false, wpscan: false, droopescan: false },
    tlsAudit: { openssl: true, sslyze: false, testssl: false },
    fingerprint: { whatweb: false },
    screenshots: { aquatone: false, eyewitness: false },
    osint: { theHarvester: false, reconNg: false }
  },
  concurrency: 1,
  ping: { count: 3, timeout: 10000 },
  curl: {
    timeout: 15000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  nmap: {
    topPorts: 10,
    extraArgs: ['-T2', '--max-retries', '1'] // Polite timing
  },
  rateLimit: {
    enabled: true,
    requestsPerMinute: 10,
    delayBetweenStages: 5000 // 5s pause between stages
  }
}
```

**Timeout Adjustments:**
- DNS: 7000ms
- Ping: 10000ms
- Curl: 15000ms
- Nmap: 60000ms (polite scan)

---

### 🔴 **Aggressive Mode**

**Philosophy:** Maximum speed and coverage. For authorized internal audits or red team exercises.

**Enabled Tools:**
- ✅ Full DNS enumeration
- ✅ All subdomain tools in parallel
- ✅ Port scans (nmap + masscan)
- ✅ Web discovery (ffuf/feroxbuster)
- ✅ Vulnerability scanners (nikto, wpscan)
- ✅ TLS audits (sslyze, testssl.sh)
- ✅ Screenshots (aquatone)
- ✅ Fingerprinting (whatweb)

**Configuration:**
```javascript
{
  behavior: 'aggressive',
  features: {
    dns: true,
    certificate: true,
    http: { curl: true },
    latency: { ping: true, traceroute: true },
    subdomains: {
      amass: true,
      subfinder: true,
      assetfinder: true,
      crtsh: true
    },
    ports: {
      nmap: true,
      masscan: true  // full port scan
    },
    web: {
      ffuf: true,
      feroxbuster: true,
      gobuster: true,
      wordlist: '/usr/share/wordlists/dirb/big.txt', // larger wordlist
      threads: 100
    },
    vulnerability: {
      nikto: true,
      wpscan: true,
      droopescan: true
    },
    tlsAudit: {
      openssl: true,
      sslyze: true,
      testssl: true
    },
    fingerprint: { whatweb: true },
    screenshots: { aquatone: true, eyewitness: false },
    osint: { theHarvester: true, reconNg: false }
  },
  concurrency: 8, // high parallelism
  ping: { count: 4, timeout: 5000 },
  traceroute: { cycles: 3, timeout: 10000 },
  curl: { timeout: 8000 },
  nmap: {
    topPorts: 100,
    extraArgs: ['-T4', '-sV', '--version-intensity', '5']
  },
  masscan: {
    ports: '1-65535',
    rate: 5000
  },
  rateLimit: { enabled: false }
}
```

**Timeout Adjustments:**
- DNS: 5000ms (fast fail)
- Ping: 5000ms
- Nmap: 120000ms (full scan)
- Web discovery: 300000ms (5min wordlist brute-force)

---

## Implementation Notes

### Auto-Configuration
When `behavior` is set, it overrides individual feature toggles:

```javascript
const plugin = new ReconPlugin({
  behavior: 'stealth', // overrides features below
  features: {
    ports: { nmap: true } // ignored, stealth mode controls this
  }
});
```

### Manual Overrides
Users can override specific tools while keeping mode defaults:

```javascript
const plugin = new ReconPlugin({
  behavior: 'passive',
  behaviorOverrides: {
    features: {
      certificate: true // enable cert check in passive mode
    }
  }
});
```

### Rate Limiting
- **Passive:** No limits (API calls only)
- **Stealth:** 10 requests/min, 5s delay between stages
- **Aggressive:** No limits

### Logging & Audit
All modes emit `recon:behavior-applied` event:

```javascript
plugin.on('recon:behavior-applied', ({ mode, target, config }) => {
  logger.info(`Recon ${mode} mode applied to ${target}`);
});
```

---

## Security & Compliance

### Passive Mode
- ✅ Safe for external recon (no active scanning)
- ✅ No WAF/IDS alerts
- ✅ GDPR/privacy-friendly (public data only)

### Stealth Mode
- ⚠️ Requires authorization (active scanning)
- ⚠️ May trigger rate limits on weak WAFs
- ✅ Minimal noise for security monitoring

### Aggressive Mode
- 🔴 **REQUIRES EXPLICIT AUTHORIZATION**
- 🔴 Will trigger WAF/IDS alerts
- 🔴 May violate ToS of cloud providers
- 🔴 Recommended only for internal networks

---

## Example Workflows

### External Asset Discovery (OSINT)
```javascript
await plugin.runDiagnostics('target.com', {
  behavior: 'passive',
  persist: true
});
// Only uses CT logs, DNS, theHarvester
```

### Authorized Pentest
```javascript
await plugin.runDiagnostics('client.example.com', {
  behavior: 'stealth',
  persist: true
});
// Slow scans, realistic timing, low detection risk
```

### Internal Security Audit
```javascript
await plugin.runDiagnostics('intranet.corp.local', {
  behavior: 'aggressive',
  behaviorOverrides: {
    nmap: { topPorts: 1000 }
  },
  persist: true
});
// Full scan with all tools, maximum speed
```

---

## Future Enhancements

1. **Custom Modes:** Allow users to define `modes.pentesting` with custom presets
2. **Adaptive Mode:** Auto-switch from stealth → passive if WAF blocks detected
3. **Compliance Templates:** `behavior: 'gdpr-compliant'`, `behavior: 'pci-dss-audit'`
4. **Rate Limit Auto-Tuning:** Detect 429/503 responses and slow down automatically
