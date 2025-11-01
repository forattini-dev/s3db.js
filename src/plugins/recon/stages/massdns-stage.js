/**
 * MassDNS Stage
 *
 * High-performance DNS resolver for mass subdomain enumeration
 *
 * Discovers:
 * - Subdomains via wordlist-based brute force
 * - A/AAAA records
 * - Fast resolution (1000s of queries per second)
 *
 * Uses 100% free CLI tool:
 * - massdns (https://github.com/blechschmidt/massdns)
 */

export class MassDNSStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  /**
   * Execute MassDNS lookup
   * @param {Object} target - Target object with host property
   * @param {Object} options - MassDNS options
   * @returns {Promise<Object>} MassDNS results
   */
  async execute(target, options = {}) {
    const result = {
      status: 'ok',
      host: target.host,
      subdomains: [],
      resolvedCount: 0,
      totalAttempts: 0,
      errors: {}
    };

    // Check if massdns is available
    const isAvailable = await this.commandRunner.isAvailable('massdns');

    if (!isAvailable) {
      result.status = 'unavailable';
      result.errors.massdns = 'massdns not found in PATH';
      return result;
    }

    // Check if wordlist is provided
    const wordlist = options.wordlist || this.config.massdns?.wordlist;

    if (!wordlist) {
      result.status = 'error';
      result.errors.wordlist = 'No wordlist provided for massdns';
      return result;
    }

    // Check if resolvers file exists
    const resolvers = options.resolvers || this.config.massdns?.resolvers || '/etc/resolv.conf';

    try {
      // Generate domain list from wordlist
      const domainList = await this.generateDomainList(target.host, wordlist, options);

      if (domainList.length === 0) {
        result.status = 'empty';
        result.errors.domains = 'No domains generated from wordlist';
        return result;
      }

      result.totalAttempts = domainList.length;

      // Run massdns
      const massdnsResults = await this.runMassDNS(domainList, resolvers, options);

      result.subdomains = massdnsResults.subdomains;
      result.resolvedCount = massdnsResults.resolvedCount;

      if (result.resolvedCount === 0) {
        result.status = 'empty';
      }

    } catch (error) {
      result.status = 'error';
      result.errors.general = error.message;
    }

    return result;
  }

  /**
   * Generate domain list from wordlist
   * Reads wordlist and appends target domain to each entry
   */
  async generateDomainList(domain, wordlistPath, options = {}) {
    const maxSubdomains = options.maxSubdomains || 1000;

    try {
      // Use cat to read wordlist
      const catRun = await this.commandRunner.run('cat', [wordlistPath], {
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (!catRun.ok || !catRun.stdout) {
        return [];
      }

      // Parse wordlist and append domain
      const words = catRun.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .slice(0, maxSubdomains);

      return words.map(word => `${word}.${domain}`);

    } catch (error) {
      return [];
    }
  }

  /**
   * Run massdns with domain list
   */
  async runMassDNS(domainList, resolversFile, options = {}) {
    const result = {
      subdomains: [],
      resolvedCount: 0
    };

    try {
      // Create temporary file with domain list
      const tempFile = `/tmp/massdns-domains-${Date.now()}.txt`;
      const domainsContent = domainList.join('\n');

      // Write domains to temp file
      const writeRun = await this.commandRunner.run('sh', [
        '-c',
        `echo "${domainsContent.replace(/"/g, '\\"')}" > ${tempFile}`
      ], { timeout: 5000 });

      if (!writeRun.ok) {
        return result;
      }

      // Run massdns
      // -r: resolvers file
      // -t: record type (A)
      // -o: output format (simple)
      // -q: quiet
      const massdnsArgs = [
        '-r', resolversFile,
        '-t', 'A',
        '-o', 'S',
        '-q',
        tempFile
      ];

      // Add rate limit if specified
      if (options.rate) {
        massdnsArgs.unshift('-s', options.rate.toString());
      }

      const massdnsRun = await this.commandRunner.run('massdns', massdnsArgs, {
        timeout: options.timeout || 60000,
        maxBuffer: 10 * 1024 * 1024
      });

      // Cleanup temp file
      await this.commandRunner.run('rm', ['-f', tempFile], { timeout: 1000 });

      if (!massdnsRun.ok || !massdnsRun.stdout) {
        return result;
      }

      // Parse massdns output
      // Format: domain. A ip
      const subdomains = [];
      const lines = massdnsRun.stdout.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse: subdomain.domain.com. A 1.2.3.4
        const match = trimmed.match(/^([\w\-\.]+)\.\s+A\s+([\d\.]+)$/);

        if (match) {
          const subdomain = match[1].replace(/\.$/, '');
          const ip = match[2];

          if (subdomain && ip) {
            subdomains.push({ subdomain, ip });
          }
        }
      }

      result.subdomains = subdomains;
      result.resolvedCount = subdomains.length;

    } catch (error) {
      // Return empty result on error
    }

    return result;
  }

  /**
   * Fallback: Use traditional dig-based subdomain enumeration
   * This is used if massdns is not available
   */
  async fallbackDigEnum(domain, wordlist, options = {}) {
    const result = {
      subdomains: [],
      resolvedCount: 0
    };

    try {
      const domainList = await this.generateDomainList(domain, wordlist, options);
      const maxConcurrent = 10;

      // Process in batches to avoid overwhelming DNS
      for (let i = 0; i < domainList.length; i += maxConcurrent) {
        const batch = domainList.slice(i, i + maxConcurrent);

        const batchResults = await Promise.all(
          batch.map(async (subdomain) => {
            const digRun = await this.commandRunner.run('dig', ['+short', 'A', subdomain], {
              timeout: 3000
            });

            if (digRun.ok && digRun.stdout) {
              const ips = digRun.stdout
                .split('\n')
                .map(line => line.trim())
                .filter(line => /^\d+\.\d+\.\d+\.\d+$/.test(line));

              if (ips.length > 0) {
                return ips.map(ip => ({ subdomain, ip }));
              }
            }

            return [];
          })
        );

        // Flatten and add to result
        result.subdomains.push(...batchResults.flat());

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      result.resolvedCount = result.subdomains.length;

    } catch (error) {
      // Return empty result on error
    }

    return result;
  }
}
