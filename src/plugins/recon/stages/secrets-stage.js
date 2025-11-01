/**
 * SecretsStage
 *
 * Secrets detection stage using multiple methods:
 * - Gitleaks: Industry-standard secrets scanner
 * - TruffleHog: Git repository secret scanning
 * - Regex patterns: Common API keys, tokens, credentials
 * - JS file analysis: Extract endpoints and potential secrets
 *
 * Scans:
 * - JavaScript files from HTTP responses
 * - Wayback/historical URLs
 * - Git repositories (if accessible)
 * - Configuration files
 * - Environment variables in responses
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);

export class SecretsStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.timeout = 30000; // 30 second timeout for scans
  }

  /**
   * Execute secrets detection scan
   * @param {Object} target - Target object with host property
   * @param {Object} options - Scan options
   * @returns {Object} Secrets findings
   */
  async execute(target, options = {}) {
    const result = {
      status: 'ok',
      findings: [],
      summary: {
        total: 0,
        highSeverity: 0,
        mediumSeverity: 0,
        lowSeverity: 0,
        byType: {}
      },
      scanners: {},
      errors: {}
    };

    try {
      // Check which scanners are available
      const availableScanners = await this.checkAvailableScanners();

      // Collect URLs to scan (from HTTP stage if available)
      const urlsToScan = this.collectUrlsToScan(target, options);

      // Run Gitleaks if available
      if (availableScanners.gitleaks && options.gitleaks !== false) {
        try {
          const gitleaksFindings = await this.runGitleaks(urlsToScan, options);
          result.scanners.gitleaks = gitleaksFindings;
          result.findings.push(...gitleaksFindings.findings);
        } catch (error) {
          result.errors.gitleaks = error.message;
        }
      }

      // Run regex-based pattern matching (always available)
      if (options.patterns !== false) {
        try {
          const patternFindings = await this.runPatternMatching(urlsToScan, options);
          result.scanners.patterns = patternFindings;
          result.findings.push(...patternFindings.findings);
        } catch (error) {
          result.errors.patterns = error.message;
        }
      }

      // Deduplicate and categorize findings
      result.findings = this.deduplicateFindings(result.findings);
      result.summary = this.buildSummary(result.findings);

      if (result.findings.length === 0) {
        result.status = 'clean';
      } else if (result.summary.highSeverity > 0) {
        result.status = 'critical';
      } else if (result.summary.mediumSeverity > 0) {
        result.status = 'warning';
      }

    } catch (error) {
      result.status = 'error';
      result.message = error?.message || 'Secrets scan failed';
      result.errors.scan = error?.message;
    }

    return result;
  }

  /**
   * Check which secret scanners are available
   * @returns {Promise<Object>} Available scanners
   */
  async checkAvailableScanners() {
    const scanners = {
      gitleaks: false,
      trufflehog: false
    };

    try {
      await execAsync('which gitleaks', { timeout: 2000 });
      scanners.gitleaks = true;
    } catch (error) {
      // Gitleaks not available
    }

    try {
      await execAsync('which trufflehog', { timeout: 2000 });
      scanners.trufflehog = true;
    } catch (error) {
      // TruffleHog not available
    }

    return scanners;
  }

  /**
   * Collect URLs to scan from target and previous stages
   * @param {Object} target - Target object
   * @param {Object} options - Scan options
   * @returns {Array<string>} URLs to scan
   */
  collectUrlsToScan(target, options) {
    const urls = [];

    // Add main target URL
    const protocol = target.protocol || 'https';
    const port = target.port ? `:${target.port}` : '';
    urls.push(`${protocol}://${target.host}${port}`);

    // Add common paths that might contain secrets
    const commonPaths = [
      '/',
      '/robots.txt',
      '/sitemap.xml',
      '/.git/config',
      '/.env',
      '/config.json',
      '/package.json',
      '/composer.json',
      '/app.js',
      '/main.js',
      '/bundle.js',
      '/vendor.js'
    ];

    for (const path of commonPaths) {
      urls.push(`${protocol}://${target.host}${port}${path}`);
    }

    // Add custom URLs if provided
    if (options.urls && Array.isArray(options.urls)) {
      urls.push(...options.urls);
    }

    return [...new Set(urls)]; // Deduplicate
  }

  /**
   * Run Gitleaks scanner
   * @param {Array<string>} urls - URLs to scan
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} Gitleaks findings
   */
  async runGitleaks(urls, options) {
    const findings = {
      status: 'ok',
      findings: [],
      scannedUrls: urls.length
    };

    // Create temporary directory for scan
    const tmpDir = join(tmpdir(), `gitleaks-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpDir, { recursive: true });

    try {
      // Fetch content from URLs
      const contentFiles = [];

      for (const url of urls.slice(0, options.maxUrls || 20)) {
        try {
          const response = await this.fetchUrl(url);
          if (response && response.body) {
            const filename = join(tmpDir, `${randomBytes(4).toString('hex')}.txt`);
            await writeFile(filename, response.body);
            contentFiles.push({ filename, url });
          }
        } catch (error) {
          // Skip URLs that fail to fetch
        }
      }

      // Run Gitleaks detect on each file
      for (const { filename, url } of contentFiles) {
        try {
          const gitleaksOutput = await this.executeGitleaks(filename, options);

          if (gitleaksOutput && gitleaksOutput.length > 0) {
            for (const finding of gitleaksOutput) {
              findings.findings.push({
                type: finding.RuleID || 'unknown',
                description: finding.Description || finding.RuleID,
                severity: this.mapGitleaksSeverity(finding),
                location: url,
                line: finding.StartLine,
                match: finding.Match || finding.Secret?.substring(0, 50),
                file: finding.File,
                scanner: 'gitleaks'
              });
            }
          }
        } catch (error) {
          // Continue with next file
        }
      }

      // Cleanup temporary files
      for (const { filename } of contentFiles) {
        try {
          await unlink(filename);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

    } finally {
      // Cleanup temporary directory
      try {
        await execAsync(`rm -rf "${tmpDir}"`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    return findings;
  }

  /**
   * Execute Gitleaks command
   * @param {string} filepath - File to scan
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} Gitleaks findings
   */
  async executeGitleaks(filepath, options) {
    try {
      const { stdout } = await execAsync(
        `gitleaks detect --no-git --source "${filepath}" --report-format json --report-path /dev/stdout`,
        {
          timeout: this.timeout,
          maxBuffer: 5 * 1024 * 1024 // 5MB buffer
        }
      );

      if (!stdout || stdout.trim() === '') {
        return [];
      }

      return JSON.parse(stdout);
    } catch (error) {
      // Gitleaks exits with code 1 if leaks found
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout);
        } catch (parseError) {
          return [];
        }
      }
      throw error;
    }
  }

  /**
   * Map Gitleaks severity to our scale
   * @param {Object} finding - Gitleaks finding
   * @returns {string} Severity level
   */
  mapGitleaksSeverity(finding) {
    // Gitleaks doesn't provide severity, so we classify by rule type
    const highSeverityRules = [
      'aws-access-token',
      'aws-secret-key',
      'github-pat',
      'github-oauth',
      'private-key',
      'slack-token',
      'stripe-api-key'
    ];

    const ruleId = (finding.RuleID || '').toLowerCase();

    if (highSeverityRules.some(rule => ruleId.includes(rule))) {
      return 'high';
    }

    if (ruleId.includes('api') || ruleId.includes('token') || ruleId.includes('key')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Run regex-based pattern matching
   * @param {Array<string>} urls - URLs to scan
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} Pattern findings
   */
  async runPatternMatching(urls, options) {
    const findings = {
      status: 'ok',
      findings: [],
      scannedUrls: 0
    };

    // Common secret patterns
    const patterns = [
      {
        name: 'AWS Access Key',
        regex: /AKIA[0-9A-Z]{16}/g,
        severity: 'high',
        description: 'AWS Access Key ID found'
      },
      {
        name: 'AWS Secret Key',
        regex: /aws(.{0,20})?['\"][0-9a-zA-Z\/+]{40}['\"]?/gi,
        severity: 'high',
        description: 'Possible AWS Secret Access Key'
      },
      {
        name: 'GitHub Token',
        regex: /gh[pousr]_[0-9a-zA-Z]{36}/g,
        severity: 'high',
        description: 'GitHub Personal Access Token'
      },
      {
        name: 'Generic API Key',
        regex: /api[_-]?key['\"]?\s*[:=]\s*['\"]?([0-9a-zA-Z\-_]{20,})['\"]?/gi,
        severity: 'medium',
        description: 'Generic API key pattern'
      },
      {
        name: 'Slack Token',
        regex: /xox[baprs]-[0-9a-zA-Z\-]+/g,
        severity: 'high',
        description: 'Slack token found'
      },
      {
        name: 'Stripe API Key',
        regex: /sk_live_[0-9a-zA-Z]{24,}/g,
        severity: 'high',
        description: 'Stripe live API key'
      },
      {
        name: 'Private Key',
        regex: /-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----/g,
        severity: 'high',
        description: 'Private key detected'
      },
      {
        name: 'JWT Token',
        regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        severity: 'medium',
        description: 'JWT token found'
      },
      {
        name: 'Database URL',
        regex: /(postgres|mysql|mongodb):\/\/[^\s]+/gi,
        severity: 'medium',
        description: 'Database connection string'
      }
    ];

    // Scan URLs
    for (const url of urls.slice(0, options.maxUrls || 20)) {
      try {
        const response = await this.fetchUrl(url);

        if (response && response.body) {
          findings.scannedUrls++;

          // Test each pattern
          for (const pattern of patterns) {
            const matches = response.body.matchAll(pattern.regex);

            for (const match of matches) {
              findings.findings.push({
                type: pattern.name,
                description: pattern.description,
                severity: pattern.severity,
                location: url,
                match: match[0].substring(0, 100), // Truncate long matches
                context: this.extractContext(response.body, match.index, 50),
                scanner: 'regex-patterns'
              });
            }
          }
        }
      } catch (error) {
        // Continue with next URL
      }
    }

    return findings;
  }

  /**
   * Fetch URL content
   * @param {string} url - URL to fetch
   * @returns {Promise<Object>} Response with body
   */
  async fetchUrl(url) {
    try {
      const { stdout, stderr } = await execAsync(
        `curl -sL -m 10 "${url}"`,
        {
          timeout: 15000,
          maxBuffer: 2 * 1024 * 1024 // 2MB max response
        }
      );

      return {
        body: stdout,
        error: stderr
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract context around a match
   * @param {string} text - Full text
   * @param {number} index - Match index
   * @param {number} contextLength - Characters before/after
   * @returns {string} Context string
   */
  extractContext(text, index, contextLength) {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + contextLength);

    let context = text.substring(start, end);

    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context.replace(/\s+/g, ' ').trim();
  }

  /**
   * Deduplicate findings by match content
   * @param {Array} findings - All findings
   * @returns {Array} Deduplicated findings
   */
  deduplicateFindings(findings) {
    const seen = new Set();
    const unique = [];

    for (const finding of findings) {
      const key = `${finding.type}:${finding.match}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(finding);
      }
    }

    return unique;
  }

  /**
   * Build summary statistics
   * @param {Array} findings - All findings
   * @returns {Object} Summary object
   */
  buildSummary(findings) {
    const summary = {
      total: findings.length,
      highSeverity: 0,
      mediumSeverity: 0,
      lowSeverity: 0,
      byType: {}
    };

    for (const finding of findings) {
      // Count by severity
      if (finding.severity === 'high') {
        summary.highSeverity++;
      } else if (finding.severity === 'medium') {
        summary.mediumSeverity++;
      } else {
        summary.lowSeverity++;
      }

      // Count by type
      summary.byType[finding.type] = (summary.byType[finding.type] || 0) + 1;
    }

    return summary;
  }
}
