/**
 * MassDNSStage
 *
 * High-performance DNS resolution using RedBlue:
 * - Mass subdomain resolution
 * - Wordlist-based brute force
 * - Fast parallel queries
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
  config: {
    massdns?: {
      wordlist?: string;
    };
  };
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface MassDNSFeatureConfig {
  timeout?: number;
  wordlist?: string;
  rate?: number;
  resolvers?: string;
}

export interface ResolvedSubdomain {
  subdomain: string;
  ip: string | null;
  ips?: string[] | null;
  cname?: string | null;
}

export interface MassDNSData {
  subdomains: ResolvedSubdomain[];
  resolvedCount: number;
  totalAttempts: number | null;
}

export interface MassDNSResult {
  status: 'ok' | 'empty' | 'error' | 'unavailable';
  message?: string;
  host: string;
  subdomains: ResolvedSubdomain[];
  resolvedCount: number;
  totalAttempts?: number | null;
  metadata?: Record<string, any>;
}

export class MassDNSStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: MassDNSFeatureConfig = {}): Promise<MassDNSResult> {
    const wordlist = featureConfig.wordlist || this.config.massdns?.wordlist;

    if (!wordlist) {
      return {
        status: 'error',
        message: 'No wordlist provided for mass DNS resolution',
        host: target.host,
        subdomains: [],
        resolvedCount: 0
      };
    }

    const flags: string[] = ['--wordlist', wordlist];

    if (featureConfig.rate) {
      flags.push('--rate', String(featureConfig.rate));
    }

    if (featureConfig.resolvers) {
      flags.push('--resolvers', featureConfig.resolvers);
    }

    const result = await this.commandRunner.runRedBlue(
      'dns',
      'record',
      'bruteforce',
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
        host: target.host,
        subdomains: [],
        resolvedCount: 0,
        metadata: result.metadata
      };
    }

    if (result.status === 'error') {
      return {
        status: 'error',
        message: result.error,
        host: target.host,
        subdomains: [],
        resolvedCount: 0,
        metadata: result.metadata
      };
    }

    const resolved = this._normalizeResolved(result.data, target.host);

    return {
      status: resolved.subdomains.length > 0 ? 'ok' : 'empty',
      host: target.host,
      ...resolved,
      metadata: result.metadata
    };
  }

  private _normalizeResolved(data: any, baseDomain: string): MassDNSData {
    if (!data || typeof data !== 'object') {
      return { subdomains: [], resolvedCount: 0, totalAttempts: null };
    }

    if (data.raw) {
      return this._parseRawResolved(data.raw, baseDomain);
    }

    const subdomains: ResolvedSubdomain[] = [];

    if (Array.isArray(data.subdomains)) {
      subdomains.push(...data.subdomains.map((s: any) => this._normalizeSubdomain(s)).filter(Boolean));
    } else if (Array.isArray(data.results)) {
      subdomains.push(...data.results.map((s: any) => this._normalizeSubdomain(s)).filter(Boolean));
    } else if (Array.isArray(data.resolved)) {
      subdomains.push(...data.resolved.map((s: any) => this._normalizeSubdomain(s)).filter(Boolean));
    } else if (Array.isArray(data)) {
      subdomains.push(...data.map((s: any) => this._normalizeSubdomain(s)).filter((s): s is ResolvedSubdomain => s !== null));
    }

    return {
      subdomains: subdomains.filter((s): s is ResolvedSubdomain => s !== null),
      resolvedCount: subdomains.length,
      totalAttempts: data.totalAttempts || data.attempts || null
    };
  }

  private _normalizeSubdomain(subdomain: any): ResolvedSubdomain | null {
    if (!subdomain) return null;

    if (typeof subdomain === 'string') {
      return { subdomain, ip: null };
    }

    return {
      subdomain: subdomain.subdomain || subdomain.name || subdomain.host || subdomain.domain,
      ip: subdomain.ip || subdomain.address || subdomain.a || null,
      ips: subdomain.ips || subdomain.addresses || null,
      cname: subdomain.cname || null
    };
  }

  private _parseRawResolved(raw: string, baseDomain: string): MassDNSData {
    const subdomains: ResolvedSubdomain[] = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^([\w\-\.]+)\.\s+A\s+([\d\.]+)$/);
      if (match) {
        const subdomain = match[1]!.replace(/\.$/, '');
        const ip = match[2]!;

        if (subdomain && ip && subdomain.endsWith(baseDomain)) {
          subdomains.push({ subdomain, ip });
        }
        continue;
      }

      const simpleMatch = line.match(/^([\w\-\.]+)\s+([\d\.]+)$/);
      if (simpleMatch) {
        subdomains.push({
          subdomain: simpleMatch[1]!,
          ip: simpleMatch[2] ?? null
        });
      }
    }

    return {
      subdomains,
      resolvedCount: subdomains.length,
      totalAttempts: null
    };
  }
}
