/**
 * WhoisStage
 *
 * WHOIS lookup stage for domain registration information:
 * - Registrar details
 * - Registration/expiration dates
 * - Name servers
 * - Registrant information (when available)
 * - Domain status
 * - DNSSEC status
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WhoisStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.timeout = 15000; // 15 second timeout for WHOIS queries
  }

  /**
   * Execute WHOIS lookup for target domain
   * @param {Object} target - Target object with host property
   * @returns {Object} WHOIS information
   */
  async execute(target) {
    const result = {
      status: 'ok',
      domain: null,
      registrar: null,
      registrant: {},
      dates: {},
      nameservers: [],
      dnssec: null,
      domainStatus: [],
      raw: null,
      errors: {}
    };

    try {
      // Extract base domain from hostname (remove subdomains)
      const domain = this.extractBaseDomain(target.host);
      result.domain = domain;

      // Check if whois command is available
      const hasWhois = await this.checkWhoisAvailable();
      if (!hasWhois) {
        result.status = 'unavailable';
        result.message = 'whois command not found. Install with: apt install whois';
        return result;
      }

      // Execute whois command
      const whoisData = await this.executeWhois(domain);
      result.raw = whoisData;

      // Parse WHOIS data
      const parsed = this.parseWhoisData(whoisData);

      result.registrar = parsed.registrar;
      result.registrant = parsed.registrant;
      result.dates = parsed.dates;
      result.nameservers = parsed.nameservers;
      result.dnssec = parsed.dnssec;
      result.domainStatus = parsed.domainStatus;

      // Calculate days until expiration
      if (parsed.dates.expiration) {
        const expirationDate = new Date(parsed.dates.expiration);
        const now = new Date();
        const daysUntilExpiration = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
        result.dates.daysUntilExpiration = daysUntilExpiration;

        if (daysUntilExpiration < 0) {
          result.status = 'expired';
        } else if (daysUntilExpiration < 30) {
          result.status = 'expiring-soon';
        }
      }

    } catch (error) {
      result.status = 'error';
      result.message = error?.message || 'WHOIS lookup failed';
      result.errors.whois = error?.message;
    }

    return result;
  }

  /**
   * Check if whois command is available
   * @returns {Promise<boolean>}
   */
  async checkWhoisAvailable() {
    try {
      await execAsync('which whois', { timeout: 2000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute whois command
   * @param {string} domain - Domain to lookup
   * @returns {Promise<string>} Raw WHOIS data
   */
  async executeWhois(domain) {
    try {
      const { stdout, stderr } = await execAsync(`whois ${domain}`, {
        timeout: this.timeout,
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      if (stderr && !stdout) {
        throw new Error(`WHOIS query failed: ${stderr}`);
      }

      return stdout;
    } catch (error) {
      if (error.killed) {
        throw new Error(`WHOIS query timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Extract base domain from hostname (remove subdomains)
   * @param {string} host - Full hostname
   * @returns {string} Base domain
   */
  extractBaseDomain(host) {
    // Remove protocol if present
    let domain = host.replace(/^https?:\/\//, '');

    // Remove port if present
    domain = domain.split(':')[0];

    // Remove path if present
    domain = domain.split('/')[0];

    // Extract base domain (last 2 parts for most TLDs, 3 for special cases)
    const parts = domain.split('.');

    // Handle special TLDs like .co.uk, .com.br, etc.
    const specialTlds = ['co.uk', 'com.br', 'com.au', 'co.jp', 'co.za', 'com.mx', 'com.ar'];
    const lastTwoParts = parts.slice(-2).join('.');

    if (specialTlds.includes(lastTwoParts)) {
      return parts.slice(-3).join('.');
    }

    // Default: return last 2 parts (domain.tld)
    return parts.slice(-2).join('.');
  }

  /**
   * Parse raw WHOIS data into structured format
   * @param {string} raw - Raw WHOIS response
   * @returns {Object} Parsed WHOIS data
   */
  parseWhoisData(raw) {
    const lines = raw.split('\n');
    const parsed = {
      registrar: null,
      registrant: {
        name: null,
        organization: null,
        email: null,
        country: null
      },
      dates: {
        created: null,
        updated: null,
        expiration: null
      },
      nameservers: [],
      dnssec: null,
      domainStatus: []
    };

    const registrarPatterns = [
      /Registrar:\s*(.+)/i,
      /Sponsoring Registrar:\s*(.+)/i,
      /Registrar Name:\s*(.+)/i
    ];

    const createdPatterns = [
      /Creation Date:\s*(.+)/i,
      /Created:\s*(.+)/i,
      /Registration Date:\s*(.+)/i,
      /Domain Registration Date:\s*(.+)/i
    ];

    const expirationPatterns = [
      /Registry Expiry Date:\s*(.+)/i,
      /Expiration Date:\s*(.+)/i,
      /Expires:\s*(.+)/i,
      /Expiry Date:\s*(.+)/i,
      /Domain Expiration Date:\s*(.+)/i
    ];

    const updatedPatterns = [
      /Updated Date:\s*(.+)/i,
      /Last Updated:\s*(.+)/i,
      /Modified:\s*(.+)/i
    ];

    const nameserverPatterns = [
      /Name Server:\s*(.+)/i,
      /Nameserver:\s*(.+)/i,
      /nserver:\s*(.+)/i
    ];

    const dnssecPatterns = [
      /DNSSEC:\s*(.+)/i,
      /dnssec:\s*(.+)/i
    ];

    const statusPatterns = [
      /Domain Status:\s*(.+)/i,
      /Status:\s*(.+)/i
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('#')) {
        continue;
      }

      // Parse registrar
      for (const pattern of registrarPatterns) {
        const match = trimmed.match(pattern);
        if (match && !parsed.registrar) {
          parsed.registrar = match[1].trim();
          break;
        }
      }

      // Parse creation date
      for (const pattern of createdPatterns) {
        const match = trimmed.match(pattern);
        if (match && !parsed.dates.created) {
          parsed.dates.created = this.parseDate(match[1].trim());
          break;
        }
      }

      // Parse expiration date
      for (const pattern of expirationPatterns) {
        const match = trimmed.match(pattern);
        if (match && !parsed.dates.expiration) {
          parsed.dates.expiration = this.parseDate(match[1].trim());
          break;
        }
      }

      // Parse updated date
      for (const pattern of updatedPatterns) {
        const match = trimmed.match(pattern);
        if (match && !parsed.dates.updated) {
          parsed.dates.updated = this.parseDate(match[1].trim());
          break;
        }
      }

      // Parse nameservers
      for (const pattern of nameserverPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const ns = match[1].trim().toLowerCase();
          if (ns && !parsed.nameservers.includes(ns)) {
            parsed.nameservers.push(ns);
          }
          break;
        }
      }

      // Parse DNSSEC
      for (const pattern of dnssecPatterns) {
        const match = trimmed.match(pattern);
        if (match && !parsed.dnssec) {
          parsed.dnssec = match[1].trim().toLowerCase();
          break;
        }
      }

      // Parse domain status
      for (const pattern of statusPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const status = match[1].trim();
          if (status && !parsed.domainStatus.includes(status)) {
            parsed.domainStatus.push(status);
          }
          break;
        }
      }

      // Parse registrant information
      if (/Registrant Name:\s*(.+)/i.test(trimmed)) {
        parsed.registrant.name = trimmed.match(/Registrant Name:\s*(.+)/i)[1].trim();
      }
      if (/Registrant Organization:\s*(.+)/i.test(trimmed)) {
        parsed.registrant.organization = trimmed.match(/Registrant Organization:\s*(.+)/i)[1].trim();
      }
      if (/Registrant Email:\s*(.+)/i.test(trimmed)) {
        parsed.registrant.email = trimmed.match(/Registrant Email:\s*(.+)/i)[1].trim();
      }
      if (/Registrant Country:\s*(.+)/i.test(trimmed)) {
        parsed.registrant.country = trimmed.match(/Registrant Country:\s*(.+)/i)[1].trim();
      }
    }

    return parsed;
  }

  /**
   * Parse date string to ISO format
   * @param {string} dateStr - Date string from WHOIS
   * @returns {string|null} ISO date string or null
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    try {
      // Remove timezone abbreviations and extra text
      let cleaned = dateStr
        .replace(/\s*\([^)]+\)/g, '') // Remove parentheses content
        .replace(/\s+[A-Z]{3,4}$/, '') // Remove timezone abbreviations at end
        .trim();

      // Try to parse
      const date = new Date(cleaned);

      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}
