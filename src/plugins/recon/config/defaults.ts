/**
 * Default configuration for ReconPlugin
 *
 * All reconnaissance operations are powered by RedBlue (rb).
 * Individual tool configurations have been replaced with feature flags.
 */

export interface LatencyFeatures {
  ping: boolean;
  traceroute: boolean;
}

export interface SubdomainsFeatures {
  enabled: boolean;
  checkTakeover: boolean;
  maxSubdomains: number;
}

export interface PortsFeatures {
  enabled: boolean;
  topPorts?: number;
  fullScan?: boolean;
}

export interface WebFeatures {
  enabled: boolean;
  wordlist?: string | null;
  threads?: number;
  recursive?: boolean;
}

export interface VulnerabilityFeatures {
  enabled: boolean;
  strategy?: 'auto' | 'manual';
  aggressive?: boolean;
}

export interface TlsAuditFeatures {
  enabled: boolean;
}

export interface FingerprintFeatures {
  enabled: boolean;
  intel?: boolean;
}

export interface ScreenshotsFeatures {
  enabled: boolean;
}

export interface OsintFeatures {
  emails: boolean;
  usernames: boolean;
  urls: boolean;
  social: boolean;
  maxSites?: number;
}

export interface GoogleDorksFeatures {
  enabled: boolean;
  maxResults?: number;
  categories?: string[];
}

export interface SecretsFeatures {
  enabled: boolean;
}

export interface AsnFeatures {
  enabled: boolean;
}

export interface DnsdumpsterFeatures {
  enabled: boolean;
}

export interface ReconFeatures {
  dns: boolean;
  certificate: boolean;
  whois: boolean;
  http: boolean;
  latency: LatencyFeatures;
  subdomains: SubdomainsFeatures;
  ports: PortsFeatures;
  web: WebFeatures;
  vulnerability: VulnerabilityFeatures;
  tlsAudit: TlsAuditFeatures;
  fingerprint: FingerprintFeatures;
  screenshots: ScreenshotsFeatures;
  osint: OsintFeatures;
  googleDorks: GoogleDorksFeatures;
  secrets: SecretsFeatures;
  asn: AsnFeatures;
  dnsdumpster: DnsdumpsterFeatures;
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute?: number;
  delayBetweenStages: number;
}

export interface TimeoutConfig {
  default: number;
  dns?: number;
  http?: number;
  ports?: number;
  vulnerability?: number;
}

export interface BehaviorPreset {
  features: ReconFeatures;
  concurrency: number;
  timeout: TimeoutConfig;
  rateLimit: RateLimitConfig;
}

export interface UptimeBehaviorConfig {
  enabled: boolean;
  checkInterval: number;
  aggregationInterval: number;
  methods: Array<'ping' | 'http' | 'dns'>;
  alertOnDowntime: boolean;
  downtimeThreshold: number;
  timeout: number;
  retainHistory: number;
  persistRawChecks: boolean;
}

export interface BehaviorsConfig {
  uptime: UptimeBehaviorConfig;
}

export interface StorageConfig {
  enabled: boolean;
  historyLimit: number;
  persistRawOutput: boolean;
}

export interface SchedulerConfig {
  enabled: boolean;
  defaultCron: string;
  cron?: string;
  runOnStart?: boolean;
}

export interface ResourcesConfig {
  persist: boolean;
}

export interface ReconPluginConfig {
  features: ReconFeatures;
  storage: StorageConfig;
  scheduler: SchedulerConfig;
  resources: ResourcesConfig;
  behaviors: BehaviorsConfig;
  concurrency: number;
  timeout: TimeoutConfig;
  rateLimit: RateLimitConfig;
}

export const DEFAULT_FEATURES: ReconFeatures = {
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
  }
};

export const BEHAVIOR_PRESETS: Record<string, BehaviorPreset> = {
  passive: {
    features: {
      dns: true,
      certificate: false,
      whois: true,
      http: false,
      latency: { ping: false, traceroute: false },
      subdomains: { enabled: true, checkTakeover: false, maxSubdomains: 20 },
      ports: { enabled: false, topPorts: 100, fullScan: false },
      web: { enabled: false, wordlist: null, threads: 50, recursive: false },
      vulnerability: { enabled: false, strategy: 'auto', aggressive: false },
      tlsAudit: { enabled: false },
      fingerprint: { enabled: false, intel: false },
      screenshots: { enabled: false },
      osint: { emails: true, usernames: false, urls: false, social: false, maxSites: 50 },
      googleDorks: { enabled: false, maxResults: 10, categories: [] },
      secrets: { enabled: false },
      asn: { enabled: true },
      dnsdumpster: { enabled: true },
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
      ports: { enabled: true, topPorts: 20, fullScan: false },
      web: { enabled: false, wordlist: null, threads: 50, recursive: false },
      vulnerability: { enabled: false, strategy: 'auto', aggressive: false },
      tlsAudit: { enabled: true },
      fingerprint: { enabled: true, intel: false },
      screenshots: { enabled: false },
      osint: { emails: true, usernames: false, urls: false, social: false, maxSites: 50 },
      googleDorks: { enabled: false, maxResults: 10, categories: [] },
      secrets: { enabled: false },
      asn: { enabled: true },
      dnsdumpster: { enabled: true },
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
      web: { enabled: true, wordlist: null, threads: 100, recursive: false },
      vulnerability: { enabled: true, strategy: 'auto', aggressive: true },
      tlsAudit: { enabled: true },
      fingerprint: { enabled: true, intel: true },
      screenshots: { enabled: false },
      osint: { emails: true, usernames: true, urls: true, social: true, maxSites: 100 },
      googleDorks: { enabled: true, maxResults: 20, categories: [] },
      secrets: { enabled: false },
      asn: { enabled: true },
      dnsdumpster: { enabled: true },
    },
    concurrency: 8,
    timeout: { default: 120000 },
    rateLimit: { enabled: false, delayBetweenStages: 0 }
  }
};

export const DEFAULT_CONFIG: ReconPluginConfig = {
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
