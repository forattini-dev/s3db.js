/**
 * ASNStage
 *
 * ASN (Autonomous System Number) and Network Intelligence
 *
 * Discovers:
 * - ASN ownership and organization
 * - IP ranges (CIDR blocks)
 * - Network provider information
 * - BGP routing data
 *
 * Uses 100% free APIs:
 * - iptoasn.com (unlimited, free)
 * - hackertarget.com (100 queries/day free)
 */

export class ASNStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  /**
   * Execute ASN lookup
   * @param {Object} target - Target object with host property
   * @param {Object} options - ASN options
   * @returns {Promise<Object>} ASN results
   */
  async execute(target, options = {}) {
    const result = {
      status: 'ok',
      host: target.host,
      ipAddresses: [],
      asns: [],
      networks: [],
      organizations: new Set(),
      errors: {}
    };

    // Step 1: Resolve host to IP addresses
    const ipAddresses = await this.resolveHostToIPs(target.host);
    result.ipAddresses = ipAddresses;

    if (ipAddresses.length === 0) {
      result.status = 'error';
      result.errors.dns = 'Could not resolve host to IP addresses';
      return result;
    }

    // Step 2: Lookup ASN for each IP
    for (const ip of ipAddresses) {
      try {
        // Try iptoasn.com first (faster, unlimited)
        let asnData = await this.lookupASNViaIPToASN(ip, options);

        // Fallback to hackertarget if iptoasn fails
        if (!asnData && options.hackertarget !== false) {
          asnData = await this.lookupASNViaHackerTarget(ip, options);
        }

        if (asnData) {
          result.asns.push(asnData);

          if (asnData.network) {
            result.networks.push(asnData.network);
          }

          if (asnData.organization) {
            result.organizations.add(asnData.organization);
          }
        }

      } catch (error) {
        result.errors[ip] = error.message;
      }
    }

    // Convert Set to Array for JSON serialization
    result.organizations = Array.from(result.organizations);

    // Deduplicate ASNs by ASN number
    result.asns = this.deduplicateASNs(result.asns);

    return result;
  }

  /**
   * Resolve host to IP addresses using dig
   */
  async resolveHostToIPs(host) {
    const ips = [];

    // Resolve A records (IPv4)
    const aRun = await this.commandRunner.run('dig', ['+short', 'A', host], { timeout: 5000 });
    if (aRun.ok && aRun.stdout) {
      const ipv4s = aRun.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^\d+\.\d+\.\d+\.\d+$/.test(line));
      ips.push(...ipv4s);
    }

    // Resolve AAAA records (IPv6)
    const aaaaRun = await this.commandRunner.run('dig', ['+short', 'AAAA', host], { timeout: 5000 });
    if (aaaaRun.ok && aaaaRun.stdout) {
      const ipv6s = aaaaRun.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^[0-9a-f:]+$/i.test(line) && line.includes(':'));
      ips.push(...ipv6s);
    }

    return [...new Set(ips)]; // Deduplicate
  }

  /**
   * Lookup ASN via iptoasn.com (100% free, unlimited)
   * API: https://iptoasn.com/
   */
  async lookupASNViaIPToASN(ip, options = {}) {
    try {
      const url = `https://api.iptoasn.com/v1/as/ip/${encodeURIComponent(ip)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0'
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // iptoasn.com response format:
      // {
      //   "announced": true,
      //   "as_number": 15169,
      //   "as_country_code": "US",
      //   "as_description": "GOOGLE",
      //   "first_ip": "8.8.8.0",
      //   "last_ip": "8.8.8.255",
      //   "as_name": "GOOGLE"
      // }

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

    } catch (error) {
      return null;
    }
  }

  /**
   * Lookup ASN via hackertarget.com (100 queries/day free)
   * API: https://api.hackertarget.com/aslookup/
   */
  async lookupASNViaHackerTarget(ip, options = {}) {
    try {
      const url = `https://api.hackertarget.com/aslookup/?q=${encodeURIComponent(ip)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0'
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });

      if (!response.ok) {
        return null;
      }

      const text = await response.text();

      // hackertarget response format (plain text):
      // "15169","8.8.8.0/24","US","arin","GOOGLE"

      if (text.includes('error') || !text.includes(',')) {
        return null;
      }

      // Parse CSV format
      const parts = text.split(',').map(p => p.replace(/"/g, '').trim());

      if (parts.length < 3) {
        return null;
      }

      const asnNumber = parseInt(parts[0]);
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

    } catch (error) {
      return null;
    }
  }

  /**
   * Deduplicate ASNs by ASN number
   */
  deduplicateASNs(asns) {
    const seen = new Map();

    for (const asn of asns) {
      const key = asn.asnNumber;

      if (!seen.has(key)) {
        seen.set(key, asn);
      } else {
        // Merge data from multiple sources
        const existing = seen.get(key);

        // Prefer more detailed data
        if (asn.network && !existing.network) {
          existing.network = asn.network;
        }

        if (asn.organization && !existing.organization) {
          existing.organization = asn.organization;
        }

        // Track multiple sources
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
}
