/**
 * SubdomainsStage
 *
 * Subdomain enumeration using RedBlue:
 * - Certificate Transparency logs
 * - DNS bruteforce with wordlists
 * - Multi-threaded discovery
 * - Subdomain takeover detection
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
  config: Record<string, any>;
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface SubdomainsFeatureConfig {
  timeout?: number;
  passive?: boolean;
  recursive?: boolean;
  wordlist?: string;
  threads?: number;
  checkTakeover?: boolean;
  maxSubdomains?: number;
  spider?: boolean | {
    maxPages?: number;
    maxDepth?: number;
  };
}

export interface TakeoverFingerprint {
  cname: string;
  severity: 'high' | 'medium' | 'low';
}

export interface VulnerableSubdomain {
  subdomain: string;
  provider: string;
  cname: string;
  severity: string;
  evidence: string;
  recommendation: string;
}

export interface TakeoverError {
  subdomain: string;
  error: string;
}

export interface TakeoverResults {
  status: 'ok' | 'vulnerable';
  vulnerable: VulnerableSubdomain[];
  checked: number;
  errors: TakeoverError[];
}

export interface NormalizedSubdomains {
  list: string[];
  sources: Record<string, number>;
}

export interface SubdomainsResult {
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  message?: string;
  total?: number;
  list?: string[];
  sources?: Record<string, number>;
  takeover?: TakeoverResults | null;
  metadata?: Record<string, any>;
}

export class SubdomainsStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: SubdomainsFeatureConfig = {}): Promise<SubdomainsResult> {
    const flags: Record<string, any> = {};
    if (featureConfig.passive) flags.passive = true;
    if (featureConfig.recursive) flags.recursive = true;
    if (featureConfig.wordlist) flags.wordlist = featureConfig.wordlist;
    if (featureConfig.threads) flags.threads = featureConfig.threads;

    const result = await this.commandRunner.runRedBlue(
      'recon',
      'domain',
      'subdomains',
      target.host,
      {
        timeout: featureConfig.timeout || 120000,
        flags
      }
    );

    if (result.status === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'RedBlue (rb) is not available',
        metadata: result.metadata
      };
    }

    if (result.status === 'error') {
      return {
        status: 'error',
        message: result.error,
        metadata: result.metadata
      };
    }

    const subdomains = this._normalizeSubdomains(result.data);

    if (featureConfig.spider) {
      const spiderSubdomains = await this._discoverViaSpider(target, featureConfig);
      for (const sd of spiderSubdomains) {
        if (!subdomains.list.includes(sd)) {
          subdomains.list.push(sd);
          subdomains.sources['spider'] = (subdomains.sources['spider'] || 0) + 1;
        }
      }
      subdomains.list.sort();
    }

    let takeoverResults: TakeoverResults | null = null;
    if (featureConfig.checkTakeover && subdomains.list.length > 0) {
      takeoverResults = await this._checkSubdomainTakeover(
        subdomains.list,
        featureConfig
      );
    }

    return {
      status: subdomains.list.length > 0 ? 'ok' : 'empty',
      total: subdomains.list.length,
      list: subdomains.list,
      sources: subdomains.sources,
      takeover: takeoverResults,
      metadata: result.metadata
    };
  }

  private _normalizeSubdomains(data: any): NormalizedSubdomains {
    if (!data || typeof data !== 'object') {
      return { list: [], sources: {} };
    }

    if (data.raw) {
      const list = (data.raw as string)
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean);
      return { list: [...new Set(list)].sort(), sources: { redblue: list.length } };
    }

    if (Array.isArray(data)) {
      const list = data.map((item: any) =>
        typeof item === 'string' ? item : item.subdomain || item.name || ''
      ).filter(Boolean);
      return { list: [...new Set(list)].sort(), sources: { redblue: list.length } };
    }

    if (data.subdomains) {
      const list = Array.isArray(data.subdomains)
        ? data.subdomains
        : [];
      return {
        list: [...new Set(list as string[])].sort(),
        sources: data.sources || { redblue: list.length }
      };
    }

    return { list: [], sources: {} };
  }

  private async _checkSubdomainTakeover(
    subdomains: string[],
    options: SubdomainsFeatureConfig = {}
  ): Promise<TakeoverResults> {
    const results: TakeoverResults = {
      status: 'ok',
      vulnerable: [],
      checked: 0,
      errors: []
    };

    const takeoverFingerprints: Record<string, TakeoverFingerprint> = {
      'github': {
        cname: 'github.io',
        severity: 'high'
      },
      'heroku': {
        cname: 'herokuapp.com',
        severity: 'high'
      },
      'aws-s3': {
        cname: 's3.amazonaws.com',
        severity: 'high'
      },
      'aws-cloudfront': {
        cname: 'cloudfront.net',
        severity: 'medium'
      },
      'azure': {
        cname: 'azurewebsites.net',
        severity: 'high'
      },
      'shopify': {
        cname: 'myshopify.com',
        severity: 'high'
      }
    };

    const maxSubdomains = options.maxSubdomains || 50;
    const subdomainsToCheck = subdomains.slice(0, maxSubdomains);

    for (const subdomain of subdomainsToCheck) {
      try {
        results.checked++;

        const dnsResult = await this.commandRunner.runRedBlue(
          'dns',
          'record',
          'lookup',
          subdomain,
          {
            timeout: 5000,
            flags: { type: 'CNAME' }
          }
        );

        if (dnsResult.status !== 'ok' || !dnsResult.data) {
          continue;
        }

        const cname = this._extractCname(dnsResult.data);
        if (!cname) continue;

        for (const [provider, fingerprint] of Object.entries(takeoverFingerprints)) {
          if (cname.toLowerCase().includes(fingerprint.cname)) {
            results.vulnerable.push({
              subdomain,
              provider,
              cname,
              severity: fingerprint.severity,
              evidence: `CNAME points to ${cname}`,
              recommendation: `Claim the ${provider} resource or remove the DNS record`
            });
            break;
          }
        }
      } catch (error: any) {
        results.errors.push({
          subdomain,
          error: error.message
        });
      }
    }

    if (results.vulnerable.length > 0) {
      results.status = 'vulnerable';
    }

    return results;
  }

  private _extractCname(data: any): string | null {
    if (typeof data === 'string') {
      return data.trim().replace(/\.$/, '');
    }

    if (data.raw) {
      const match = (data.raw as string).match(/CNAME\s+(\S+)/i);
      return match ? match[1]!.replace(/\.$/, '') : null;
    }

    if (data.cname) {
      const cname = Array.isArray(data.cname) ? data.cname[0] : data.cname;
      return typeof cname === 'string' ? cname.replace(/\.$/, '') : null;
    }

    return null;
  }

  private async _discoverViaSpider(target: Target, featureConfig: SubdomainsFeatureConfig): Promise<string[]> {
    try {
      const { Spider } = await import('recker/scrape') as any;
      const spiderOpts = typeof featureConfig.spider === 'object' ? featureConfig.spider : {};
      const baseDomain = target.host.split('.').slice(-2).join('.');

      const spider = new Spider({
        maxPages: spiderOpts.maxPages ?? 30,
        maxDepth: spiderOpts.maxDepth ?? 2,
        sameDomain: false,
        concurrency: featureConfig.threads ?? 3,
        timeout: featureConfig.timeout || 30000,
        respectRobotsTxt: true,
        rotateUserAgent: true,
      });

      const protocol = target.protocol || 'https';
      const result = await spider.crawl(`${protocol}://${target.host}`);

      const subdomains = new Set<string>();

      for (const page of result.pages || []) {
        this._extractSubdomain(page.url, baseDomain, subdomains);

        for (const link of page.links || []) {
          if (link.href) {
            this._extractSubdomain(link.href, baseDomain, subdomains);
          }
        }
      }

      subdomains.delete(target.host);
      return [...subdomains].sort();
    } catch {
      return [];
    }
  }

  private _extractSubdomain(url: string, baseDomain: string, subdomains: Set<string>): void {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.endsWith(baseDomain) && hostname !== baseDomain) {
        subdomains.add(hostname);
      }
    } catch {
      // invalid URL
    }
  }
}
