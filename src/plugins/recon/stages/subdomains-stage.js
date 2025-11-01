/**
 * SubdomainsStage
 *
 * Subdomain enumeration with multiple tools:
 * - amass (OWASP, comprehensive)
 * - subfinder (fast, API-based)
 * - assetfinder (passive)
 * - crt.sh (certificate transparency logs)
 */

export class SubdomainsStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    const aggregated = new Set();
    const sources = {};

    const executeCliCollector = async (name, command, args, parser) => {
      if (!featureConfig[name]) {
        return;
      }
      const run = await this.commandRunner.run(command, args, { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      if (!run.ok) {
        sources[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      const items = parser(run.stdout, run.stderr);
      items.forEach((item) => aggregated.add(item));
      sources[name] = {
        status: 'ok',
        count: items.length,
        sample: items.slice(0, 10)
      };
      if (this.config.storage.persistRawOutput) {
        sources[name].raw = this._truncateOutput(run.stdout);
      }
    };

    await executeCliCollector('amass', 'amass', ['enum', '-d', target.host, '-o', '-'], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    await executeCliCollector('subfinder', 'subfinder', ['-d', target.host, '-silent'], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    await executeCliCollector('assetfinder', 'assetfinder', ['--subs-only', target.host], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    if (featureConfig.crtsh) {
      try {
        const response = await fetch(`https://crt.sh/?q=%25.${target.host}&output=json`, {
          headers: { 'User-Agent': this.config.curl.userAgent },
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });
        if (response.ok) {
          const data = await response.json();
          const entries = Array.isArray(data) ? data : [];
          const hostnames = entries
            .map((entry) => entry.name_value)
            .filter(Boolean)
            .flatMap((value) => value.split('\n'))
            .map((value) => value.trim())
            .filter(Boolean);
          hostnames.forEach((hostname) => aggregated.add(hostname));
          sources.crtsh = {
            status: 'ok',
            count: hostnames.length,
            sample: hostnames.slice(0, 10)
          };
        } else {
          sources.crtsh = {
            status: 'error',
            message: `crt.sh responded with status ${response.status}`
          };
        }
      } catch (error) {
        sources.crtsh = {
          status: 'error',
          message: error?.message || 'crt.sh lookup failed'
        };
      }
    }

    const list = Array.from(aggregated).sort();

    // Check for subdomain takeover vulnerabilities
    let takeoverResults = null;
    if (featureConfig.checkTakeover && list.length > 0) {
      takeoverResults = await this.checkSubdomainTakeover(list, featureConfig);
    }

    return {
      _individual: sources,
      _aggregated: {
        status: list.length > 0 ? 'ok' : 'empty',
        total: list.length,
        list,
        sources,
        takeover: takeoverResults
      },
      status: list.length > 0 ? 'ok' : 'empty',
      total: list.length,
      list,
      sources,
      takeover: takeoverResults
    };
  }

  /**
   * Check for subdomain takeover vulnerabilities
   * @param {Array<string>} subdomains - List of subdomains
   * @param {Object} options - Takeover check options
   * @returns {Promise<Object>} Takeover check results
   */
  async checkSubdomainTakeover(subdomains, options = {}) {
    const results = {
      status: 'ok',
      vulnerable: [],
      checked: 0,
      errors: []
    };

    // Known fingerprints for subdomain takeover
    const takeoverFingerprints = {
      'github': {
        cname: 'github.io',
        response: ['There isn\'t a GitHub Pages site here', 'For root URLs'],
        severity: 'high'
      },
      'heroku': {
        cname: 'herokuapp.com',
        response: ['No such app', 'There\'s nothing here'],
        severity: 'high'
      },
      'aws-s3': {
        cname: 's3.amazonaws.com',
        response: ['NoSuchBucket', 'The specified bucket does not exist'],
        severity: 'high'
      },
      'aws-cloudfront': {
        cname: 'cloudfront.net',
        response: ['The request could not be satisfied', 'Bad request'],
        severity: 'medium'
      },
      'azure': {
        cname: 'azurewebsites.net',
        response: ['404 Web Site not found', 'Error 404'],
        severity: 'high'
      },
      'bitbucket': {
        cname: 'bitbucket.io',
        response: ['Repository not found'],
        severity: 'high'
      },
      'fastly': {
        cname: 'fastly.net',
        response: ['Fastly error: unknown domain'],
        severity: 'medium'
      },
      'shopify': {
        cname: 'myshopify.com',
        response: ['Sorry, this shop is currently unavailable'],
        severity: 'high'
      }
    };

    const maxSubdomains = options.maxSubdomains || 50;
    const subdomainsToCheck = subdomains.slice(0, maxSubdomains);

    for (const subdomain of subdomainsToCheck) {
      try {
        results.checked++;

        // Check CNAME record
        const cname = await this.resolveCNAME(subdomain);

        if (cname) {
          // Check if CNAME matches known vulnerable patterns
          for (const [provider, fingerprint] of Object.entries(takeoverFingerprints)) {
            if (cname.toLowerCase().includes(fingerprint.cname)) {
              // Fetch the subdomain to check for error responses
              const httpCheck = await this.checkHttpResponse(subdomain);

              if (httpCheck && httpCheck.status >= 400) {
                // Check if response contains takeover indicators
                const isVulnerable = fingerprint.response.some(indicator =>
                  httpCheck.body?.toLowerCase().includes(indicator.toLowerCase())
                );

                if (isVulnerable) {
                  results.vulnerable.push({
                    subdomain,
                    provider,
                    cname,
                    severity: fingerprint.severity,
                    evidence: `CNAME points to ${cname} but returns ${httpCheck.status}`,
                    status: httpCheck.status,
                    recommendation: `Claim the ${provider} resource or remove the DNS record`
                  });
                }
              }
            }
          }
        }
      } catch (error) {
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

  /**
   * Resolve CNAME record for a domain
   * @param {string} domain - Domain to resolve
   * @returns {Promise<string|null>} CNAME record or null
   */
  async resolveCNAME(domain) {
    const run = await this.commandRunner.run('dig', ['+short', 'CNAME', domain], {
      timeout: 5000
    });

    if (run.ok && run.stdout) {
      const cname = run.stdout.trim().replace(/\.$/, ''); // Remove trailing dot
      return cname || null;
    }

    return null;
  }

  /**
   * Check HTTP response for a subdomain
   * @param {string} subdomain - Subdomain to check
   * @returns {Promise<Object|null>} HTTP response details
   */
  async checkHttpResponse(subdomain) {
    try {
      const run = await this.commandRunner.run('curl', [
        '-sL',
        '-w', '%{http_code}',
        '-m', '10',
        `https://${subdomain}`
      ], {
        timeout: 15000,
        maxBuffer: 1024 * 1024 // 1MB max
      });

      if (run.ok) {
        const output = run.stdout;
        const statusMatch = output.match(/(\d{3})$/);
        const status = statusMatch ? parseInt(statusMatch[1]) : 0;
        const body = output.replace(/\d{3}$/, '');

        return { status, body };
      }
    } catch (error) {
      // Ignore errors, subdomain might not be accessible
    }

    return null;
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
