/**
 * DNSDumpster Stage
 *
 * DNS Intelligence via dnsdumpster.com web scraping
 *
 * Discovers:
 * - DNS records (A, AAAA, MX, TXT, NS)
 * - Subdomains
 * - Related domains
 * - Network map data
 *
 * Uses 100% free web scraping (no API key required)
 * - dnsdumpster.com (unlimited, requires CSRF token handling)
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

export interface DNSDumpsterFeatureConfig {
  timeout?: number;
  fallbackToDig?: boolean;
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

export interface ParsedDNSData {
  dnsRecords: DNSRecords;
  subdomains: string[];
  relatedDomains: string[];
}

export interface IndividualResults {
  dnsdumpster: { status: string; data: ParsedDNSData | null; raw: string | null };
  dig: { status: string; records: Record<string, any>; dnsRecords?: DNSRecords; subdomains?: string[]; relatedDomains?: string[] };
}

export interface DNSDumpsterAggregatedResult {
  status: string;
  host: string;
  dnsRecords: DNSRecords;
  subdomains: string[];
  relatedDomains: string[];
  errors: Record<string, string>;
}

export interface DNSDumpsterResult extends DNSDumpsterAggregatedResult {
  _individual: IndividualResults;
  _aggregated: DNSDumpsterAggregatedResult;
}

export class DNSDumpsterStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];
  private _httpClient: HttpClient | null;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
    this._httpClient = null;
  }

  private async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      this._httpClient = await createHttpClient({
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (compatible; ReconBot/1.0)'
        },
        timeout: 15000,
        retry: {
          maxAttempts: 2,
          delay: 1000,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      });
    }
    return this._httpClient;
  }

  async execute(target: Target, options: DNSDumpsterFeatureConfig = {}): Promise<DNSDumpsterResult> {
    const result: DNSDumpsterAggregatedResult = {
      status: 'ok',
      host: target.host,
      dnsRecords: {
        A: [],
        AAAA: [],
        MX: [],
        TXT: [],
        NS: []
      },
      subdomains: [],
      relatedDomains: [],
      errors: {}
    };

    const individual: IndividualResults = {
      dnsdumpster: { status: 'ok', data: null, raw: null },
      dig: { status: 'ok', records: {} }
    };

    try {
      const baseUrl = 'https://dnsdumpster.com/';

      const [csrfToken, cookie] = await this.getCsrfToken(baseUrl, options);

      if (!csrfToken) {
        result.status = 'error';
        result.errors.csrf = 'Failed to obtain CSRF token from DNSDumpster';
        individual.dnsdumpster.status = 'error';

        return {
          _individual: individual,
          _aggregated: result,
          ...result
        };
      }

      const data = await this.submitQuery(baseUrl, target.host, csrfToken, cookie, options);

      if (!data) {
        result.status = 'error';
        result.errors.query = 'Failed to retrieve data from DNSDumpster';
        individual.dnsdumpster.status = 'error';

        return {
          _individual: individual,
          _aggregated: result,
          ...result
        };
      }

      if (this.config?.storage?.persistRawOutput) {
        individual.dnsdumpster.raw = data.substring(0, 50000);
      }

      const parsed = this.parseHtmlResponse(data);

      result.dnsRecords = parsed.dnsRecords;
      result.subdomains = parsed.subdomains;
      result.relatedDomains = parsed.relatedDomains;

      individual.dnsdumpster.data = parsed;

    } catch (error: any) {
      result.status = 'error';
      result.errors.general = error.message;
      individual.dnsdumpster.status = 'error';
    }

    if (result.status === 'error' && options.fallbackToDig !== false) {
      const digResults = await this.fallbackDigLookup(target.host);
      result.dnsRecords = digResults.dnsRecords;
      result.status = 'ok_fallback';
      individual.dig = { ...individual.dig, ...digResults };
    }

    return {
      _individual: individual,
      _aggregated: result,
      ...result
    };
  }

  async getCsrfToken(baseUrl: string, options: DNSDumpsterFeatureConfig = {}): Promise<[string | null, string]> {
    try {
      const client = await this._getHttpClient();
      const response = await client.get(baseUrl);

      if (!response.ok) {
        return [null, ''];
      }

      const html = await response.text();
      const cookies = response.headers.get('set-cookie') || '';

      const csrfMatch = html.match(/name='csrfmiddlewaretoken'\s+value='([^']+)'/);

      if (!csrfMatch) {
        return [null, ''];
      }

      const csrfToken = csrfMatch[1]!;

      return [csrfToken ?? null, cookies];

    } catch {
      return [null, ''];
    }
  }

  async submitQuery(
    baseUrl: string,
    domain: string,
    csrfToken: string,
    cookie: string,
    options: DNSDumpsterFeatureConfig = {}
  ): Promise<string | null> {
    try {
      const formData = new URLSearchParams();
      formData.append('csrfmiddlewaretoken', csrfToken);
      formData.append('targetip', domain);
      formData.append('user', 'free');

      const client = await this._getHttpClient();
      const response = await client.post(baseUrl, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': baseUrl,
          'Cookie': cookie
        },
        body: formData.toString()
      });

      if (!response.ok) {
        return null;
      }

      return await response.text();

    } catch {
      return null;
    }
  }

  parseHtmlResponse(html: string): ParsedDNSData {
    const result: ParsedDNSData = {
      dnsRecords: {
        A: [],
        AAAA: [],
        MX: [],
        TXT: [],
        NS: []
      },
      subdomains: [],
      relatedDomains: []
    };

    const aRecordMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\w\-\.]+)<br>([\d\.]+)<\/td>[\s\S]*?<\/tr>/g);
    for (const match of aRecordMatches) {
      const hostname = match[1];
      const ip = match[2];
      if (hostname && ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        result.dnsRecords.A.push({ hostname, ip });

        if (hostname.includes('.')) {
          result.subdomains.push(hostname);
        }
      }
    }

    const mxRecordMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)\s+([\w\-\.]+)<br>([\d\.]+)<\/td>[\s\S]*?<\/tr>/g);
    for (const match of mxRecordMatches) {
      const priority = match[1]!;
      const hostname = match[2]!;
      const ip = match[3]!;
      if (hostname && ip) {
        result.dnsRecords.MX.push({ priority, hostname, ip });
      }
    }

    const txtSectionMatch = html.match(/TXT Records[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (txtSectionMatch) {
      const txtMatches = txtSectionMatch[1]!.matchAll(/<td[^>]*>([^<]+)<\/td>/g);
      for (const match of txtMatches) {
        const content = (match[1] ?? '').trim();
        if (content && content.length > 0) {
          result.dnsRecords.TXT.push({ content });
        }
      }
    }

    const nsSectionMatch = html.match(/DNS Servers[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (nsSectionMatch) {
      const nsMatches = nsSectionMatch[1]!.matchAll(/<td[^>]*>([\w\-\.]+)<br>([\d\.]+)<\/td>/g);
      for (const match of nsMatches) {
        const hostname = match[1]!;
        const ip = match[2]!;
        if (hostname && ip) {
          result.dnsRecords.NS.push({ hostname, ip });
        }
      }
    }

    result.subdomains = [...new Set(result.subdomains)];

    return result;
  }

  async fallbackDigLookup(host: string): Promise<{ dnsRecords: DNSRecords; subdomains: string[]; relatedDomains: string[] }> {
    const result: { dnsRecords: DNSRecords; subdomains: string[]; relatedDomains: string[] } = {
      dnsRecords: {
        A: [],
        AAAA: [],
        MX: [],
        TXT: [],
        NS: []
      },
      subdomains: [],
      relatedDomains: []
    };

    try {
      const aRun = await this.commandRunner.runSimple('dig', ['+short', 'A', host], { timeout: 5000 });
      if (aRun.status === 'ok' && aRun.raw) {
        const ips = aRun.raw
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => /^\d+\.\d+\.\d+\.\d+$/.test(line));

        result.dnsRecords.A = ips.map((ip: string) => ({ hostname: host, ip }));
      }

      const aaaaRun = await this.commandRunner.runSimple('dig', ['+short', 'AAAA', host], { timeout: 5000 });
      if (aaaaRun.status === 'ok' && aaaaRun.raw) {
        const ips = aaaaRun.raw
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => /^[0-9a-f:]+$/i.test(line) && line.includes(':'));

        result.dnsRecords.AAAA = ips.map((ip: string) => ({ hostname: host, ip }));
      }

      const mxRun = await this.commandRunner.runSimple('dig', ['+short', 'MX', host], { timeout: 5000 });
      if (mxRun.status === 'ok' && mxRun.raw) {
        const mxRecords = mxRun.raw
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
          .map((line: string) => {
            const parts = line.split(' ');
            if (parts.length === 2) {
              return { priority: parts[0]!, hostname: parts[1]!.replace(/\.$/, ''), ip: '' };
            }
            return null;
          })
          .filter((r): r is MXRecord => r !== null);

        result.dnsRecords.MX = mxRecords;
      }

      const txtRun = await this.commandRunner.runSimple('dig', ['+short', 'TXT', host], { timeout: 5000 });
      if (txtRun.status === 'ok' && txtRun.raw) {
        const txtRecords = txtRun.raw
          .split('\n')
          .map((line: string) => line.trim().replace(/"/g, ''))
          .filter((line: string) => line.length > 0)
          .map((content: string) => ({ content }));

        result.dnsRecords.TXT = txtRecords;
      }

      const nsRun = await this.commandRunner.runSimple('dig', ['+short', 'NS', host], { timeout: 5000 });
      if (nsRun.status === 'ok' && nsRun.raw) {
        const nsRecords = nsRun.raw
          .split('\n')
          .map((line: string) => line.trim().replace(/\.$/, ''))
          .filter((line: string) => line.length > 0)
          .map((hostname: string) => ({ hostname, ip: null }));

        result.dnsRecords.NS = nsRecords;
      }

    } catch {
      // Silently fail, return empty results
    }

    return result;
  }
}
