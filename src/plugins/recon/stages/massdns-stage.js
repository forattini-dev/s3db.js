/**
 * MassDNSStage
 *
 * High-performance DNS resolution using RedBlue:
 * - Mass subdomain resolution
 * - Wordlist-based brute force
 * - Fast parallel queries
 */

export class MassDNSStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
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

    const flags = ['--wordlist', wordlist];

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

  _normalizeResolved(data, baseDomain) {
    if (!data || typeof data !== 'object') {
      return { subdomains: [], resolvedCount: 0, totalAttempts: 0 };
    }

    if (data.raw) {
      return this._parseRawResolved(data.raw, baseDomain);
    }

    const subdomains = [];

    if (Array.isArray(data.subdomains)) {
      subdomains.push(...data.subdomains.map(s => this._normalizeSubdomain(s)));
    } else if (Array.isArray(data.results)) {
      subdomains.push(...data.results.map(s => this._normalizeSubdomain(s)));
    } else if (Array.isArray(data.resolved)) {
      subdomains.push(...data.resolved.map(s => this._normalizeSubdomain(s)));
    } else if (Array.isArray(data)) {
      subdomains.push(...data.map(s => this._normalizeSubdomain(s)));
    }

    return {
      subdomains: subdomains.filter(Boolean),
      resolvedCount: subdomains.length,
      totalAttempts: data.totalAttempts || data.attempts || null
    };
  }

  _normalizeSubdomain(subdomain) {
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

  _parseRawResolved(raw, baseDomain) {
    const subdomains = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^([\w\-\.]+)\.\s+A\s+([\d\.]+)$/);
      if (match) {
        const subdomain = match[1].replace(/\.$/, '');
        const ip = match[2];

        if (subdomain && ip && subdomain.endsWith(baseDomain)) {
          subdomains.push({ subdomain, ip });
        }
        continue;
      }

      const simpleMatch = line.match(/^([\w\-\.]+)\s+([\d\.]+)$/);
      if (simpleMatch) {
        subdomains.push({
          subdomain: simpleMatch[1],
          ip: simpleMatch[2]
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
