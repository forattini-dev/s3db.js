/**
 * Default configuration for ReconPlugin
 *
 * All reconnaissance operations are powered by RedBlue (rb).
 * Individual tool configurations have been replaced with feature flags.
 */

export const DEFAULT_FEATURES = {
  dns: true,
  certificate: true,
  whois: true,
  http: true,
  latency: {
    ping: true,
    traceroute: false
  },
  subdomains: {
    enabled: true,
    checkTakeover: false,
    maxSubdomains: 50
  },
  ports: {
    enabled: true,
    topPorts: 100,
    fullScan: false
  },
  web: {
    enabled: false,
    wordlist: null,
    threads: 50,
    recursive: false
  },
  vulnerability: {
    enabled: false,
    strategy: 'auto',
    aggressive: false
  },
  tlsAudit: {
    enabled: true
  },
  fingerprint: {
    enabled: true,
    intel: false
  },
  screenshots: {
    enabled: false
  },
  osint: {
    emails: false,
    usernames: false,
    urls: false,
    social: false,
    maxSites: 50
  },
  googleDorks: {
    enabled: false,
    maxResults: 10,
    categories: ['github', 'pastebin', 'linkedin', 'documents', 'subdomains', 'loginPages', 'configs', 'errors']
  },
  secrets: {
    enabled: false
  },
  asn: {
    enabled: true
  },
  dnsdumpster: {
    enabled: true
  },
  massdns: {
    enabled: false,
    wordlist: null,
    rate: 1000,
    maxSubdomains: 1000
  }
};

export const BEHAVIOR_PRESETS = {
  passive: {
    features: {
      dns: true,
      certificate: false,
      whois: true,
      http: false,
      latency: { ping: false, traceroute: false },
      subdomains: { enabled: true, checkTakeover: false, maxSubdomains: 20 },
      ports: { enabled: false },
      web: { enabled: false },
      vulnerability: { enabled: false },
      tlsAudit: { enabled: false },
      fingerprint: { enabled: false },
      screenshots: { enabled: false },
      osint: { emails: true, usernames: false, urls: false, social: false },
      googleDorks: { enabled: false },
      secrets: { enabled: false },
      asn: { enabled: true },
      dnsdumpster: { enabled: true },
      massdns: { enabled: false }
    },
    concurrency: 2,
    timeout: { default: 30000 },
    rateLimit: { enabled: false, delayBetweenStages: 0 }
  },
  stealth: {
    features: {
      dns: true,
      certificate: true,
      whois: true,
      http: true,
      latency: { ping: true, traceroute: false },
      subdomains: { enabled: true, checkTakeover: true, maxSubdomains: 30 },
      ports: { enabled: true, topPorts: 20 },
      web: { enabled: false },
      vulnerability: { enabled: false },
      tlsAudit: { enabled: true },
      fingerprint: { enabled: true },
      screenshots: { enabled: false },
      osint: { emails: true, usernames: false, urls: false, social: false },
      googleDorks: { enabled: false },
      secrets: { enabled: false },
      asn: { enabled: true },
      dnsdumpster: { enabled: true },
      massdns: { enabled: false }
    },
    concurrency: 1,
    timeout: { default: 60000 },
    rateLimit: { enabled: true, requestsPerMinute: 10, delayBetweenStages: 5000 }
  },
  aggressive: {
    features: {
      dns: true,
      certificate: true,
      whois: true,
      http: true,
      latency: { ping: true, traceroute: true },
      subdomains: { enabled: true, checkTakeover: true, maxSubdomains: 100 },
      ports: { enabled: true, topPorts: 1000, fullScan: false },
      web: { enabled: true, threads: 100 },
      vulnerability: { enabled: true, strategy: 'auto', aggressive: true },
      tlsAudit: { enabled: true },
      fingerprint: { enabled: true, intel: true },
      screenshots: { enabled: false },
      osint: { emails: true, usernames: true, urls: true, social: true, maxSites: 100 },
      googleDorks: { enabled: true, maxResults: 20 },
      secrets: { enabled: false },
      asn: { enabled: true },
      dnsdumpster: { enabled: true },
      massdns: { enabled: true, rate: 5000, maxSubdomains: 5000 }
    },
    concurrency: 8,
    timeout: { default: 120000 },
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
    historyLimit: 50,
    persistRawOutput: false
  },
  scheduler: {
    enabled: false,
    defaultCron: '0 2 * * *'
  },
  resources: {
    persist: true
  },
  behaviors: {
    uptime: {
      enabled: false,
      checkInterval: 20000,
      aggregationInterval: 60000,
      methods: ['ping', 'http'],
      alertOnDowntime: true,
      downtimeThreshold: 3,
      timeout: 5000,
      retainHistory: 30 * 24 * 60 * 60 * 1000,
      persistRawChecks: false
    }
  },
  concurrency: 4,
  timeout: {
    default: 60000,
    dns: 15000,
    http: 30000,
    ports: 120000,
    vulnerability: 180000
  },
  rateLimit: {
    enabled: false,
    requestsPerMinute: 60,
    delayBetweenStages: 1000
  }
};
