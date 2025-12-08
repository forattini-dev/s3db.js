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

import { createHttpClient } from '#src/concerns/http-client.js';

export class DNSDumpsterStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
    this._httpClient = null;
  }

  async _getHttpClient() {
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

  /**
   * Execute DNSDumpster lookup
   * @param {Object} target - Target object with host property
   * @param {Object} options - DNSDumpster options
   * @returns {Promise<Object>} DNSDumpster results
   */
  async execute(target, options = {}) {
    const result = {
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

    // Track individual tool results for artifact persistence
    const individual = {
      dnsdumpster: { status: 'ok', data: null, raw: null },
      dig: { status: 'ok', records: {} }
    };

    try {
      // DNSDumpster requires two-step process:
      // 1. GET to obtain CSRF token
      // 2. POST with token to get results

      const baseUrl = 'https://dnsdumpster.com/';

      // Step 1: Get CSRF token
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

      // Step 2: Submit query
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

      // Save raw HTML if persistRawOutput is enabled
      if (this.config?.storage?.persistRawOutput) {
        individual.dnsdumpster.raw = data.substring(0, 50000); // Truncate to 50KB
      }

      // Step 3: Parse HTML response
      const parsed = this.parseHtmlResponse(data);

      result.dnsRecords = parsed.dnsRecords;
      result.subdomains = parsed.subdomains;
      result.relatedDomains = parsed.relatedDomains;

      // Store parsed data in individual results
      individual.dnsdumpster.data = parsed;

    } catch (error) {
      result.status = 'error';
      result.errors.general = error.message;
      individual.dnsdumpster.status = 'error';
    }

    // Fallback to dig if DNSDumpster fails
    if (result.status === 'error' && options.fallbackToDig !== false) {
      const digResults = await this.fallbackDigLookup(target.host);
      result.dnsRecords = digResults.dnsRecords;
      result.status = 'ok_fallback';
      individual.dig = digResults;
    }

    return {
      _individual: individual,
      _aggregated: result,
      ...result // Root level for compatibility
    };
  }

  /**
   * Get CSRF token from DNSDumpster homepage
   */
  async getCsrfToken(baseUrl, options = {}) {
    try {
      const client = await this._getHttpClient();
      const response = await client.get(baseUrl);

      if (!response.ok) {
        return [null, null];
      }

      const html = await response.text();
      const cookies = response.headers.get('set-cookie') || '';

      // Extract CSRF token from HTML
      // Format: <input type='hidden' name='csrfmiddlewaretoken' value='TOKEN' />
      const csrfMatch = html.match(/name='csrfmiddlewaretoken'\s+value='([^']+)'/);

      if (!csrfMatch) {
        return [null, null];
      }

      const csrfToken = csrfMatch[1];

      return [csrfToken, cookies];

    } catch (error) {
      return [null, null];
    }
  }

  /**
   * Submit query to DNSDumpster
   */
  async submitQuery(baseUrl, domain, csrfToken, cookie, options = {}) {
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

    } catch (error) {
      return null;
    }
  }

  /**
   * Parse HTML response from DNSDumpster
   *
   * DNSDumpster returns HTML tables with DNS records.
   * We need to extract data from these tables.
   */
  parseHtmlResponse(html) {
    const result = {
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

    // Extract DNS Host Records (A)
    // Format: <td class="col-md-4">subdomain.example.com<br>IP</td>
    const aRecordMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\w\-\.]+)<br>([\d\.]+)<\/td>[\s\S]*?<\/tr>/g);
    for (const match of aRecordMatches) {
      const hostname = match[1];
      const ip = match[2];
      if (hostname && ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        result.dnsRecords.A.push({ hostname, ip });

        // Also add to subdomains if it's a subdomain
        if (hostname.includes('.')) {
          result.subdomains.push(hostname);
        }
      }
    }

    // Extract MX Records
    // Format: <td class="col-md-4">priority mail.example.com<br>IP</td>
    const mxRecordMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)\s+([\w\-\.]+)<br>([\d\.]+)<\/td>[\s\S]*?<\/tr>/g);
    for (const match of mxRecordMatches) {
      const priority = match[1];
      const hostname = match[2];
      const ip = match[3];
      if (hostname && ip) {
        result.dnsRecords.MX.push({ priority, hostname, ip });
      }
    }

    // Extract TXT Records
    // Format: <td class="col-md-10">TXT content</td>
    const txtSectionMatch = html.match(/TXT Records[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (txtSectionMatch) {
      const txtMatches = txtSectionMatch[1].matchAll(/<td[^>]*>([^<]+)<\/td>/g);
      for (const match of txtMatches) {
        const content = match[1].trim();
        if (content && content.length > 0) {
          result.dnsRecords.TXT.push({ content });
        }
      }
    }

    // Extract NS Records
    // Format similar to A records
    const nsSectionMatch = html.match(/DNS Servers[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (nsSectionMatch) {
      const nsMatches = nsSectionMatch[1].matchAll(/<td[^>]*>([\w\-\.]+)<br>([\d\.]+)<\/td>/g);
      for (const match of nsMatches) {
        const hostname = match[1];
        const ip = match[2];
        if (hostname && ip) {
          result.dnsRecords.NS.push({ hostname, ip });
        }
      }
    }

    // Deduplicate subdomains
    result.subdomains = [...new Set(result.subdomains)];

    return result;
  }

  /**
   * Fallback: Use dig commands for basic DNS records
   * This is used if DNSDumpster scraping fails
   */
  async fallbackDigLookup(host) {
    const result = {
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
      // A records
      const aRun = await this.commandRunner.run('dig', ['+short', 'A', host], { timeout: 5000 });
      if (aRun.ok && aRun.stdout) {
        const ips = aRun.stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => /^\d+\.\d+\.\d+\.\d+$/.test(line));

        result.dnsRecords.A = ips.map(ip => ({ hostname: host, ip }));
      }

      // AAAA records
      const aaaaRun = await this.commandRunner.run('dig', ['+short', 'AAAA', host], { timeout: 5000 });
      if (aaaaRun.ok && aaaaRun.stdout) {
        const ips = aaaaRun.stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => /^[0-9a-f:]+$/i.test(line) && line.includes(':'));

        result.dnsRecords.AAAA = ips.map(ip => ({ hostname: host, ip }));
      }

      // MX records
      const mxRun = await this.commandRunner.run('dig', ['+short', 'MX', host], { timeout: 5000 });
      if (mxRun.ok && mxRun.stdout) {
        const mxRecords = mxRun.stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => {
            const parts = line.split(' ');
            if (parts.length === 2) {
              return { priority: parts[0], hostname: parts[1].replace(/\.$/, ''), ip: null };
            }
            return null;
          })
          .filter(Boolean);

        result.dnsRecords.MX = mxRecords;
      }

      // TXT records
      const txtRun = await this.commandRunner.run('dig', ['+short', 'TXT', host], { timeout: 5000 });
      if (txtRun.ok && txtRun.stdout) {
        const txtRecords = txtRun.stdout
          .split('\n')
          .map(line => line.trim().replace(/"/g, ''))
          .filter(line => line.length > 0)
          .map(content => ({ content }));

        result.dnsRecords.TXT = txtRecords;
      }

      // NS records
      const nsRun = await this.commandRunner.run('dig', ['+short', 'NS', host], { timeout: 5000 });
      if (nsRun.ok && nsRun.stdout) {
        const nsRecords = nsRun.stdout
          .split('\n')
          .map(line => line.trim().replace(/\.$/, ''))
          .filter(line => line.length > 0)
          .map(hostname => ({ hostname, ip: null }));

        result.dnsRecords.NS = nsRecords;
      }

    } catch (error) {
      // Silently fail, return empty results
    }

    return result;
  }
}
