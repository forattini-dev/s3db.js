/**
 * Default configuration for ReconPlugin
 */

export const DEFAULT_FEATURES = {
  dns: true,
  certificate: true,
  http: {
    curl: true
  },
  latency: {
    ping: true,
    traceroute: true
  },
  subdomains: {
    amass: true,
    subfinder: true,
    assetfinder: false,
    crtsh: true
  },
  ports: {
    nmap: true,
    masscan: false
  },
  web: {
    ffuf: false,
    feroxbuster: false,
    gobuster: false,
    wordlist: null,
    threads: 50
  },
  vulnerability: {
    nikto: false,
    wpscan: false,
    droopescan: false
  },
  tlsAudit: {
    sslyze: false,
    testssl: false,
    openssl: true
  },
  fingerprint: {
    whatweb: false
  },
  screenshots: {
    aquatone: false,
    eyewitness: false
  },
  osint: {
    theHarvester: false,
    reconNg: false
  }
};

export const BEHAVIOR_PRESETS = {
  passive: {
    features: {
      dns: true,
      certificate: false,
      http: { curl: false },
      latency: { ping: false, traceroute: false },
      subdomains: { amass: false, subfinder: false, assetfinder: false, crtsh: true },
      ports: { nmap: false, masscan: false },
      web: { ffuf: false, feroxbuster: false, gobuster: false },
      vulnerability: { nikto: false, wpscan: false, droopescan: false },
      tlsAudit: { openssl: false, sslyze: false, testssl: false },
      fingerprint: { whatweb: false },
      screenshots: { aquatone: false, eyewitness: false },
      osint: { theHarvester: true, reconNg: false }
    },
    concurrency: 2,
    ping: { count: 3, timeout: 5000 },
    curl: { timeout: 10000 },
    nmap: { topPorts: 0 },
    rateLimit: { enabled: false, delayBetweenStages: 0 }
  },
  stealth: {
    features: {
      dns: true,
      certificate: true,
      http: { curl: true },
      latency: { ping: true, traceroute: false },
      subdomains: { amass: false, subfinder: true, assetfinder: false, crtsh: true },
      ports: { nmap: true, masscan: false },
      web: { ffuf: false, feroxbuster: false, gobuster: false },
      vulnerability: { nikto: false, wpscan: false, droopescan: false },
      tlsAudit: { openssl: true, sslyze: false, testssl: false },
      fingerprint: { whatweb: false },
      screenshots: { aquatone: false, eyewitness: false },
      osint: { theHarvester: false, reconNg: false }
    },
    concurrency: 1,
    ping: { count: 3, timeout: 10000 },
    traceroute: { cycles: 3, timeout: 15000 },
    curl: {
      timeout: 15000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    nmap: { topPorts: 10, extraArgs: ['-T2', '--max-retries', '1'] },
    rateLimit: { enabled: true, requestsPerMinute: 10, delayBetweenStages: 5000 }
  },
  aggressive: {
    features: {
      dns: true,
      certificate: true,
      http: { curl: true },
      latency: { ping: true, traceroute: true },
      subdomains: { amass: true, subfinder: true, assetfinder: true, crtsh: true },
      ports: { nmap: true, masscan: true },
      web: { ffuf: true, feroxbuster: true, gobuster: true, threads: 100 },
      vulnerability: { nikto: true, wpscan: true, droopescan: true },
      tlsAudit: { openssl: true, sslyze: true, testssl: true },
      fingerprint: { whatweb: true },
      screenshots: { aquatone: true, eyewitness: false },
      osint: { theHarvester: true, reconNg: false }
    },
    concurrency: 8,
    ping: { count: 4, timeout: 5000 },
    traceroute: { cycles: 3, timeout: 10000 },
    curl: { timeout: 8000 },
    nmap: { topPorts: 100, extraArgs: ['-T4', '-sV', '--version-intensity', '5'] },
    masscan: { ports: '1-65535', rate: 5000 },
    rateLimit: { enabled: false, delayBetweenStages: 0 }
  }
};
