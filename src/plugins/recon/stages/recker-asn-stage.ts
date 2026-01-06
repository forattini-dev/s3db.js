/**
 * ReckerASNStage
 *
 * ASN (Autonomous System Number) lookup using Recker
 *
 * Uses Recker's DNS client to resolve hostnames (no dig dependency)
 * Uses Recker's HTTP client for API calls
 *
 * Falls back to ASNStage if Recker is not available
 */

import { createHttpClient, type HttpClient } from '../../../concerns/http-client.js';
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

export interface ReckerASNFeatureConfig {
  timeout?: number;
  hackertarget?: boolean;
}

export interface ASNData {
  ip: string;
  asn: string;
  asnNumber: number;
  organization: string | null;
  country: string | null;
  network: string | null;
  source: string;
  _source?: string;
  sources?: string[];
}

export interface ReckerASNAggregatedResult {
  status: string;
  host: string;
  ipAddresses: string[];
  asns: ASNData[];
  networks: string[];
  organizations: string[];
  errors: Record<string, string>;
}

export interface ReckerASNResult extends ReckerASNAggregatedResult {
  _individual: {
    recker: { status: string; source: string };
    iptoasn: { status: string; results: ASNData[] };
    hackertarget: { status: string; results: ASNData[] };
  };
  _aggregated: ReckerASNAggregatedResult;
}

type ReckerDNSClient = {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
};

export class ReckerASNStage {
  private plugin: ReconPlugin;
  private config: ReconPlugin['config'];
  private _httpClient: HttpClient | null = null;

  private reckerAvailable: boolean | null = null;
  private dnsClient: ReckerDNSClient | null = null;
  private fallbackStage: import('./asn-stage.js').ASNStage | null = null;

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
      this.dnsClient = dnsModule.createDNS() as unknown as ReckerDNSClient;
      this.reckerAvailable = true;
      return true;
    } catch {
      this.reckerAvailable = false;
      return false;
    }
  }

  private async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      this._httpClient = await createHttpClient({
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0'
        },
        timeout: 10000,
        retry: {
          maxAttempts: 2,
          delay: 500,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      });
    }
    return this._httpClient;
  }

  private async _getFallbackStage(): Promise<import('./asn-stage.js').ASNStage> {
    if (!this.fallbackStage) {
      const { ASNStage } = await import('./asn-stage.js');
      this.fallbackStage = new ASNStage(this.plugin);
    }
    return this.fallbackStage;
  }

  async execute(target: Target, options: ReckerASNFeatureConfig = {}): Promise<ReckerASNResult> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      return this._executeFallback(target, options);
    }

    const result: ReckerASNAggregatedResult = {
      status: 'ok',
      host: target.host,
      ipAddresses: [],
      asns: [],
      networks: [],
      organizations: [],
      errors: {}
    };

    const individual = {
      recker: { status: 'ok', source: 'recker/dns' },
      iptoasn: { status: 'ok', results: [] as ASNData[] },
      hackertarget: { status: 'ok', results: [] as ASNData[] }
    };

    const ipAddresses = await this._resolveHostToIPs(target.host);
    result.ipAddresses = ipAddresses;

    if (ipAddresses.length === 0) {
      result.status = 'error';
      result.errors.dns = 'Could not resolve host to IP addresses';
      individual.recker.status = 'error';

      return {
        _individual: individual,
        _aggregated: result,
        ...result
      };
    }

    const organizationsSet = new Set<string>();

    for (const ip of ipAddresses) {
      try {
        let asnData = await this._lookupASNViaIPToASN(ip);

        if (asnData) {
          asnData._source = 'iptoasn';
          individual.iptoasn.results.push({ ...asnData });
          result.asns.push(asnData);

          if (asnData.network) {
            result.networks.push(asnData.network);
          }

          if (asnData.organization) {
            organizationsSet.add(asnData.organization);
          }
        } else if (options.hackertarget !== false) {
          asnData = await this._lookupASNViaHackerTarget(ip);

          if (asnData) {
            asnData._source = 'hackertarget';
            individual.hackertarget.results.push({ ...asnData });
            result.asns.push(asnData);

            if (asnData.network) {
              result.networks.push(asnData.network);
            }

            if (asnData.organization) {
              organizationsSet.add(asnData.organization);
            }
          }
        }
      } catch (error: any) {
        result.errors[ip] = error.message;
      }
    }

    result.organizations = Array.from(organizationsSet);
    result.asns = this._deduplicateASNs(result.asns);

    if (individual.iptoasn.results.length === 0) {
      individual.iptoasn.status = 'unavailable';
    }
    if (individual.hackertarget.results.length === 0 && options.hackertarget !== false) {
      individual.hackertarget.status = 'unavailable';
    }

    return {
      _individual: individual,
      _aggregated: result,
      ...result
    };
  }

  private async _resolveHostToIPs(host: string): Promise<string[]> {
    const ips: string[] = [];

    try {
      const ipv4s = await this.dnsClient!.resolve4(host);
      ips.push(...ipv4s);
    } catch {
      // No A records
    }

    try {
      const ipv6s = await this.dnsClient!.resolve6(host);
      ips.push(...ipv6s);
    } catch {
      // No AAAA records
    }

    return [...new Set(ips)];
  }

  private async _lookupASNViaIPToASN(ip: string): Promise<ASNData | null> {
    try {
      const url = `https://api.iptoasn.com/v1/as/ip/${encodeURIComponent(ip)}`;
      const client = await this._getHttpClient();
      const response = await client.get(url);

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as any;

      if (!data.announced || !data.as_number) {
        return null;
      }

      return {
        ip,
        asn: `AS${data.as_number}`,
        asnNumber: data.as_number,
        organization: data.as_description || data.as_name,
        country: data.as_country_code,
        network: data.first_ip && data.last_ip
          ? `${data.first_ip} - ${data.last_ip}`
          : null,
        source: 'iptoasn.com'
      };
    } catch {
      return null;
    }
  }

  private async _lookupASNViaHackerTarget(ip: string): Promise<ASNData | null> {
    try {
      const url = `https://api.hackertarget.com/aslookup/?q=${encodeURIComponent(ip)}`;
      const client = await this._getHttpClient();
      const response = await client.get(url);

      if (!response.ok) {
        return null;
      }

      const text = await response.text();

      if (text.includes('error') || !text.includes(',')) {
        return null;
      }

      const parts = text.split(',').map(p => p.replace(/"/g, '').trim());

      if (parts.length < 3) {
        return null;
      }

      const asnNumber = parseInt(parts[0]!);
      const network = parts[1] || null;
      const country = parts[2] || null;
      const organization = parts[4] || parts[3] || null;

      return {
        ip,
        asn: `AS${asnNumber}`,
        asnNumber,
        organization,
        country,
        network,
        source: 'hackertarget.com'
      };
    } catch {
      return null;
    }
  }

  private _deduplicateASNs(asns: ASNData[]): ASNData[] {
    const seen = new Map<number, ASNData>();

    for (const asn of asns) {
      const key = asn.asnNumber;

      if (!seen.has(key)) {
        seen.set(key, asn);
      } else {
        const existing = seen.get(key)!;

        if (asn.network && !existing.network) {
          existing.network = asn.network;
        }

        if (asn.organization && !existing.organization) {
          existing.organization = asn.organization;
        }

        if (!existing.sources) {
          existing.sources = [existing.source];
        }
        if (!existing.sources.includes(asn.source)) {
          existing.sources.push(asn.source);
        }
      }
    }

    return Array.from(seen.values());
  }

  private async _executeFallback(target: Target, options: ReckerASNFeatureConfig): Promise<ReckerASNResult> {
    const fallback = await this._getFallbackStage();
    const fallbackResult = await fallback.execute(target, options);

    return {
      _individual: {
        recker: { status: 'unavailable', source: 'recker not installed' },
        iptoasn: fallbackResult._individual.iptoasn,
        hackertarget: fallbackResult._individual.hackertarget
      },
      _aggregated: {
        status: fallbackResult.status,
        host: fallbackResult.host,
        ipAddresses: fallbackResult.ipAddresses,
        asns: fallbackResult.asns,
        networks: fallbackResult.networks,
        organizations: fallbackResult.organizations,
        errors: fallbackResult.errors
      },
      status: fallbackResult.status,
      host: fallbackResult.host,
      ipAddresses: fallbackResult.ipAddresses,
      asns: fallbackResult.asns,
      networks: fallbackResult.networks,
      organizations: fallbackResult.organizations,
      errors: fallbackResult.errors
    };
  }

  isReckerEnabled(): boolean {
    return this.reckerAvailable === true;
  }
}

export default ReckerASNStage;
