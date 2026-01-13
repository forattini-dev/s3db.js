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
export declare const DEFAULT_FEATURES: ReconFeatures;
export declare const BEHAVIOR_PRESETS: Record<string, BehaviorPreset>;
export declare const DEFAULT_CONFIG: ReconPluginConfig;
//# sourceMappingURL=defaults.d.ts.map