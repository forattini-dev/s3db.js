/**
 * ReckerDNSStage
 *
 * DNS Intelligence using Recker's DNS toolkit
 *
 * Discovers:
 * - DNS records (A, AAAA, MX, TXT, NS)
 * - Security records (SPF, DMARC, DKIM, CAA)
 * - DNS health score
 *
 * Uses Recker's native DNS resolution (no external dependencies like dig)
 * Falls back to DNSDumpsterStage if Recker is not available
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
  config: {
    curl?: {
      userAgent?: string;
    };
    storage?: {
      persistRawOutput?: boolean;
    };
  };
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface ReckerDNSFeatureConfig {
  timeout?: number;
  includeSecurityRecords?: boolean;
  includeHealthCheck?: boolean;
}

export interface ARecord {
  hostname: string;
  ip: string;
}

export interface MXRecord {
  priority: string;
  hostname: string;
  ip: string;
}

export interface TXTRecord {
  content: string;
}

export interface NSRecord {
  hostname: string;
  ip: string | null;
}

export interface DNSRecords {
  A: ARecord[];
  AAAA: ARecord[];
  MX: MXRecord[];
  TXT: TXTRecord[];
  NS: NSRecord[];
}

export interface SecurityRecords {
  spf: string[];
  dmarc: string | null;
  dkim: { found: boolean; record?: string } | null;
  caa: { issue?: string[]; issuewild?: string[] } | null;
}

export interface HealthCheck {
  score: number;
  grade: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
  }>;
}

export interface ReckerDNSAggregatedResult {
  status: string;
  host: string;
  dnsRecords: DNSRecords;
  securityRecords: SecurityRecords | null;
  healthCheck: HealthCheck | null;
  errors: Record<string, string>;
}

export interface ReckerDNSResult extends ReckerDNSAggregatedResult {
  _individual: {
    recker: { status: string; source: string };
    fallback: { status: string; source: string } | null;
  };
  _aggregated: ReckerDNSAggregatedResult;
}

type ReckerDNSClient = {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
  resolveMx(hostname: string): Promise<Array<{ priority: number; exchange: string }>>;
  resolveTxt(hostname: string): Promise<string[]>;
  resolveNs(hostname: string): Promise<string[]>;
  getSecurityRecords(domain: string): Promise<{
    spf?: string[];
    dmarc?: string;
    dkim?: string;
    caa?: { issue?: string[]; issuewild?: string[] };
  }>;
};

type ReckerCheckDnsHealth = (domain: string) => Promise<{
  score: number;
  grade: string;
  checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string }>;
}>;

type ReckerCheckDkim = (domain: string, selector?: string) => Promise<{
  found: boolean;
  record?: string;
}>;

export class ReckerDNSStage {
  private plugin: ReconPlugin;
  private config: ReconPlugin['config'];

  private reckerAvailable: boolean | null = null;
  private dnsClient: ReckerDNSClient | null = null;
  private checkDnsHealth: ReckerCheckDnsHealth | null = null;
  private checkDkim: ReckerCheckDkim | null = null;
  private fallbackStage: import('./dnsdumpster-stage.js').DNSDumpsterStage | null = null;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.config = plugin.config;
  }

  private async _checkReckerAvailability(): Promise<boolean> {
    if (this.reckerAvailable !== null) {
      return this.reckerAvailable;
    }

    try {
      const dnsModule = await import('recker/dns');
      const toolkitModule = await import('recker/dns-toolkit');

      this.dnsClient = dnsModule.createDNS() as unknown as ReckerDNSClient;
      this.checkDnsHealth = toolkitModule.checkDnsHealth as ReckerCheckDnsHealth;
      this.checkDkim = toolkitModule.checkDkim as ReckerCheckDkim;

      this.reckerAvailable = true;
      return true;
    } catch {
      this.reckerAvailable = false;
      return false;
    }
  }

  private async _getFallbackStage(): Promise<import('./dnsdumpster-stage.js').DNSDumpsterStage> {
    if (!this.fallbackStage) {
      const { DNSDumpsterStage } = await import('./dnsdumpster-stage.js');
      this.fallbackStage = new DNSDumpsterStage(this.plugin);
    }
    return this.fallbackStage;
  }

  async execute(target: Target, options: ReckerDNSFeatureConfig = {}): Promise<ReckerDNSResult> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      return this._executeFallback(target, options);
    }

    const result: ReckerDNSAggregatedResult = {
      status: 'ok',
      host: target.host,
      dnsRecords: {
        A: [],
        AAAA: [],
        MX: [],
        TXT: [],
        NS: []
      },
      securityRecords: null,
      healthCheck: null,
      errors: {}
    };

    try {
      const [aRecords, aaaaRecords, mxRecords, txtRecords, nsRecords] = await Promise.all([
        this._resolveA(target.host),
        this._resolveAAAA(target.host),
        this._resolveMX(target.host),
        this._resolveTXT(target.host),
        this._resolveNS(target.host)
      ]);

      result.dnsRecords.A = aRecords;
      result.dnsRecords.AAAA = aaaaRecords;
      result.dnsRecords.MX = mxRecords;
      result.dnsRecords.TXT = txtRecords;
      result.dnsRecords.NS = nsRecords;

      if (options.includeSecurityRecords !== false) {
        result.securityRecords = await this._getSecurityRecords(target.host);
      }

      if (options.includeHealthCheck) {
        result.healthCheck = await this._getHealthCheck(target.host);
      }

    } catch (error: any) {
      result.status = 'error';
      result.errors.general = error.message;
    }

    return {
      _individual: {
        recker: { status: 'ok', source: 'recker/dns' },
        fallback: null
      },
      _aggregated: result,
      ...result
    };
  }

  private async _resolveA(host: string): Promise<ARecord[]> {
    try {
      const ips = await this.dnsClient!.resolve4(host);
      return ips.map(ip => ({ hostname: host, ip }));
    } catch {
      return [];
    }
  }

  private async _resolveAAAA(host: string): Promise<ARecord[]> {
    try {
      const ips = await this.dnsClient!.resolve6(host);
      return ips.map(ip => ({ hostname: host, ip }));
    } catch {
      return [];
    }
  }

  private async _resolveMX(host: string): Promise<MXRecord[]> {
    try {
      const records = await this.dnsClient!.resolveMx(host);
      return records.map(r => ({
        priority: String(r.priority),
        hostname: r.exchange,
        ip: ''
      }));
    } catch {
      return [];
    }
  }

  private async _resolveTXT(host: string): Promise<TXTRecord[]> {
    try {
      const records = await this.dnsClient!.resolveTxt(host);
      return records.map(content => ({ content }));
    } catch {
      return [];
    }
  }

  private async _resolveNS(host: string): Promise<NSRecord[]> {
    try {
      const records = await this.dnsClient!.resolveNs(host);
      return records.map(hostname => ({ hostname, ip: null }));
    } catch {
      return [];
    }
  }

  private async _getSecurityRecords(host: string): Promise<SecurityRecords> {
    try {
      const security = await this.dnsClient!.getSecurityRecords(host);

      let dkim: { found: boolean; record?: string } | null = null;
      if (this.checkDkim) {
        try {
          dkim = await this.checkDkim(host, 'default');
        } catch {
          dkim = { found: false };
        }
      }

      return {
        spf: security.spf || [],
        dmarc: security.dmarc || null,
        dkim,
        caa: security.caa || null
      };
    } catch {
      return {
        spf: [],
        dmarc: null,
        dkim: null,
        caa: null
      };
    }
  }

  private async _getHealthCheck(host: string): Promise<HealthCheck | null> {
    if (!this.checkDnsHealth) return null;

    try {
      const health = await this.checkDnsHealth(host);
      return {
        score: health.score,
        grade: health.grade,
        checks: health.checks
      };
    } catch {
      return null;
    }
  }

  private async _executeFallback(target: Target, options: ReckerDNSFeatureConfig): Promise<ReckerDNSResult> {
    const fallback = await this._getFallbackStage();
    const fallbackResult = await fallback.execute(target, {
      timeout: options.timeout,
      fallbackToDig: true
    });

    return {
      _individual: {
        recker: { status: 'unavailable', source: 'recker not installed' },
        fallback: { status: 'ok', source: 'dnsdumpster' }
      },
      _aggregated: {
        status: fallbackResult.status,
        host: fallbackResult.host,
        dnsRecords: fallbackResult.dnsRecords,
        securityRecords: null,
        healthCheck: null,
        errors: fallbackResult.errors
      },
      status: fallbackResult.status,
      host: fallbackResult.host,
      dnsRecords: fallbackResult.dnsRecords,
      securityRecords: null,
      healthCheck: null,
      errors: fallbackResult.errors
    };
  }

  isReckerEnabled(): boolean {
    return this.reckerAvailable === true;
  }
}

export default ReckerDNSStage;
