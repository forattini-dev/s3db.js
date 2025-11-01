/**
 * Default configuration for ReconPlugin
 */

export const DEFAULT_FEATURES = {
  dns: true,
  certificate: true,
  whois: true,
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
    crtsh: true,
    checkTakeover: false,
    maxSubdomains: 50
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
    // Username Enumeration
    usernames: false,
    sherlock: false,
    maigret: false,

    // Email Collection
    emails: false,
    theHarvester: false,
    hunter: false,
    hunterApiKey: null,

    // Leak Detection
    leaks: false,
    hibpApiKey: null,
    maxEmailsToCheck: 10,

    // GitHub Reconnaissance
    github: false,
    githubToken: null,
    githubRepos: false,
    githubCode: false,
    githubUsers: false,
    maxRepos: 10,
    maxCodeResults: 10,
    maxUsers: 10,

    // SaaS Footprint Detection
    saas: false,

    // Social Media Mapping
    socialMedia: false,
    linkedin: false,
    twitter: false,
    facebook: false
  },
  secrets: {
    gitleaks: true,
    patterns: true,
    maxUrls: 20
  }
};

export const BEHAVIOR_PRESETS = {
  passive: {
    features: {
      dns: true,
      certificate: false,
      whois: true,
      http: { curl: false },
      latency: { ping: false, traceroute: false },
      subdomains: { amass: false, subfinder: false, assetfinder: false, crtsh: true, checkTakeover: false, maxSubdomains: 20 },
      ports: { nmap: false, masscan: false },
      web: { ffuf: false, feroxbuster: false, gobuster: false },
      vulnerability: { nikto: false, wpscan: false, droopescan: false },
      tlsAudit: { openssl: false, sslyze: false, testssl: false },
      fingerprint: { whatweb: false },
      screenshots: { aquatone: false, eyewitness: false },
      osint: {
        // Only passive OSINT for passive preset
        emails: true,
        theHarvester: true,
        saas: true,  // DNS-based SaaS detection
        leaks: false,
        github: false,
        usernames: false,
        socialMedia: false
      },
      secrets: { gitleaks: false, patterns: true, maxUrls: 10 }
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
      whois: true,
      http: { curl: true },
      latency: { ping: true, traceroute: false },
      subdomains: { amass: false, subfinder: true, assetfinder: false, crtsh: true, checkTakeover: true, maxSubdomains: 30 },
      ports: { nmap: true, masscan: false },
      web: { ffuf: false, feroxbuster: false, gobuster: false },
      vulnerability: { nikto: false, wpscan: false, droopescan: false },
      tlsAudit: { openssl: true, sslyze: false, testssl: false },
      fingerprint: { whatweb: false },
      screenshots: { aquatone: false, eyewitness: false },
      osint: {
        // Balanced OSINT for stealth preset
        emails: true,
        theHarvester: true,
        saas: true,
        leaks: true,
        maxEmailsToCheck: 5,
        github: true,
        githubRepos: true,
        githubCode: false,
        maxRepos: 5,
        usernames: false,
        socialMedia: false
      },
      secrets: { gitleaks: true, patterns: true, maxUrls: 15 }
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
      whois: true,
      http: { curl: true },
      latency: { ping: true, traceroute: true },
      subdomains: { amass: true, subfinder: true, assetfinder: true, crtsh: true, checkTakeover: true, maxSubdomains: 100 },
      ports: { nmap: true, masscan: true },
      web: { ffuf: true, feroxbuster: true, gobuster: true, threads: 100 },
      vulnerability: { nikto: true, wpscan: true, droopescan: true },
      tlsAudit: { openssl: true, sslyze: true, testssl: true },
      fingerprint: { whatweb: true },
      screenshots: { aquatone: true, eyewitness: false },
      osint: {
        // Full OSINT for aggressive preset
        emails: true,
        theHarvester: true,
        saas: true,
        leaks: true,
        maxEmailsToCheck: 20,
        github: true,
        githubRepos: true,
        githubCode: true,
        githubUsers: true,
        maxRepos: 20,
        maxCodeResults: 20,
        maxUsers: 20,
        usernames: true,
        sherlock: true,
        maigret: false,  // Too slow for aggressive
        socialMedia: true,
        linkedin: true,
        twitter: true,
        facebook: true
      },
      secrets: { gitleaks: true, patterns: true, maxUrls: 30 }
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

/**
 * Default plugin configuration
 */
export const DEFAULT_CONFIG = {
  features: DEFAULT_FEATURES,
  storage: {
    enabled: true,
    historyLimit: 50
  },
  scheduler: {
    enabled: false,
    defaultCron: '0 2 * * *' // 2 AM daily
  },
  resources: {
    persist: true
  },
  behaviors: {
    uptime: {
      enabled: false,
      checkInterval: 20000,         // Check every 20 seconds (3 samples per minute)
      aggregationInterval: 60000,   // Aggregate and persist every 60 seconds (1 minute cohorts)
      methods: ['ping', 'http'],    // ping, http, dns
      alertOnDowntime: true,
      downtimeThreshold: 3,         // 3 failed checks = downtime (60 seconds)
      timeout: 5000,                // 5 seconds timeout per check
      retainHistory: 30 * 24 * 60 * 60 * 1000,  // 30 days
      persistRawChecks: false       // Only persist aggregated minute data (save storage)
    }
  },
  concurrency: 4,
  ping: {
    count: 4,
    timeout: 5000
  },
  traceroute: {
    cycles: 3,
    timeout: 10000
  },
  curl: {
    timeout: 10000,
    userAgent: 'Mozilla/5.0 (compatible; ReconBot/1.0)'
  },
  nmap: {
    topPorts: 20,
    extraArgs: ['-T4']
  },
  masscan: {
    ports: '1-1000',
    rate: 1000
  },
  rateLimit: {
    enabled: false,
    requestsPerMinute: 60,
    delayBetweenStages: 1000
  }
};
