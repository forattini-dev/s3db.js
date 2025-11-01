/**
 * OsintStage
 *
 * Open Source Intelligence - Digital footprint mapping for organizations and individuals.
 *
 * LEGAL DISCLAIMER:
 * - Only collect publicly available information
 * - Do NOT use social engineering, exploits, or unauthorized access
 * - Respect rate limits and terms of service
 * - Use for defensive security and authorized testing only
 *
 * Categories:
 * 1. Username Enumeration (Sherlock, Maigret, WhatsMyName)
 * 2. Email Collection (theHarvester, Hunter.io)
 * 3. Leak Detection (HaveIBeenPwned, Dehashed)
 * 4. GitHub Reconnaissance (repos, mentions, code search)
 * 5. SaaS Footprint (DNS records, JS fingerprinting)
 * 6. Social Media Mapping (LinkedIn, Twitter, etc.)
 */

export class OsintStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  /**
   * Execute OSINT scan
   * @param {Object} target - Target object with host/domain property
   * @param {Object} options - OSINT options
   * @returns {Promise<Object>} OSINT results
   */
  async execute(target, featureConfig = {}) {
    const domain = this.extractBaseDomain(target.host);
    const companyName = this.extractCompanyName(domain);

    const result = {
      status: 'ok',
      domain,
      companyName,
      categories: {
        usernames: null,
        emails: null,
        leaks: null,
        github: null,
        saas: null,
        socialMedia: null
      },
      summary: {
        totalProfiles: 0,
        totalEmails: 0,
        totalLeaks: 0,
        totalRepos: 0,
        totalSaasServices: 0
      },
      errors: {}
    };

    // 1. Username Enumeration
    if (featureConfig.usernames !== false) {
      try {
        result.categories.usernames = await this.enumerateUsernames(companyName, featureConfig);
        result.summary.totalProfiles = result.categories.usernames.profiles?.length || 0;
      } catch (error) {
        result.errors.usernames = error.message;
      }
    }

    // 2. Email Collection
    if (featureConfig.emails !== false) {
      try {
        result.categories.emails = await this.collectEmails(domain, featureConfig);
        result.summary.totalEmails = result.categories.emails.addresses?.length || 0;
      } catch (error) {
        result.errors.emails = error.message;
      }
    }

    // 3. Leak Detection
    if (featureConfig.leaks !== false && result.categories.emails?.addresses?.length > 0) {
      try {
        result.categories.leaks = await this.detectLeaks(result.categories.emails.addresses, featureConfig);
        result.summary.totalLeaks = result.categories.leaks.breaches?.length || 0;
      } catch (error) {
        result.errors.leaks = error.message;
      }
    }

    // 4. GitHub Reconnaissance
    if (featureConfig.github !== false) {
      try {
        result.categories.github = await this.githubRecon(companyName, domain, featureConfig);
        result.summary.totalRepos = result.categories.github.repositories?.length || 0;
      } catch (error) {
        result.errors.github = error.message;
      }
    }

    // 5. SaaS Footprint Detection
    if (featureConfig.saas !== false) {
      try {
        result.categories.saas = await this.detectSaasFootprint(domain, featureConfig);
        result.summary.totalSaasServices = Object.keys(result.categories.saas.services || {}).length;
      } catch (error) {
        result.errors.saas = error.message;
      }
    }

    // 6. Social Media Mapping
    if (featureConfig.socialMedia !== false) {
      try {
        result.categories.socialMedia = await this.mapSocialMedia(companyName, domain, featureConfig);
      } catch (error) {
        result.errors.socialMedia = error.message;
      }
    }

    return result;
  }

  /**
   * 1. Username Enumeration
   * Search for company/brand username across social platforms
   */
  async enumerateUsernames(companyName, options = {}) {
    const result = {
      status: 'ok',
      searchTerm: companyName,
      profiles: [],
      sources: {}
    };

    // Try Sherlock (username enumeration across 300+ sites)
    if (options.sherlock !== false) {
      const sherlockResult = await this.runSherlock(companyName, options);
      if (sherlockResult.status === 'ok') {
        result.sources.sherlock = sherlockResult;
        result.profiles.push(...sherlockResult.profiles);
      } else {
        result.sources.sherlock = sherlockResult;
      }
    }

    // Try Maigret (similar to Sherlock but more sites)
    if (options.maigret !== false) {
      const maigretResult = await this.runMaigret(companyName, options);
      if (maigretResult.status === 'ok') {
        result.sources.maigret = maigretResult;
        result.profiles.push(...maigretResult.profiles);
      } else {
        result.sources.maigret = maigretResult;
      }
    }

    // Deduplicate profiles by URL
    result.profiles = this.deduplicateProfiles(result.profiles);

    return result;
  }

  /**
   * Run Sherlock username search
   */
  async runSherlock(username, options = {}) {
    const run = await this.commandRunner.run('sherlock', [username, '--json'], {
      timeout: 60000,
      maxBuffer: 5 * 1024 * 1024
    });

    if (!run.ok) {
      return {
        status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
        message: run.error?.message || 'Sherlock failed',
        stderr: run.stderr
      };
    }

    try {
      const profiles = [];
      const lines = run.stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.url && data.status === 'claimed') {
            profiles.push({
              platform: data.site_name,
              url: data.url,
              username: username,
              source: 'sherlock'
            });
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }

      return {
        status: 'ok',
        profiles,
        count: profiles.length
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Failed to parse Sherlock output',
        error: error.message
      };
    }
  }

  /**
   * Run Maigret username search
   */
  async runMaigret(username, options = {}) {
    const run = await this.commandRunner.run('maigret', [username, '--json', '--timeout', '30'], {
      timeout: 90000,
      maxBuffer: 10 * 1024 * 1024
    });

    if (!run.ok) {
      return {
        status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
        message: run.error?.message || 'Maigret failed',
        stderr: run.stderr
      };
    }

    try {
      const profiles = [];
      const data = JSON.parse(run.stdout);

      for (const [siteName, siteData] of Object.entries(data)) {
        if (siteData.status === 'FOUND' && siteData.url) {
          profiles.push({
            platform: siteName,
            url: siteData.url,
            username: username,
            source: 'maigret',
            tags: siteData.tags || []
          });
        }
      }

      return {
        status: 'ok',
        profiles,
        count: profiles.length
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Failed to parse Maigret output',
        error: error.message
      };
    }
  }

  /**
   * 2. Email Collection
   * Collect public emails associated with domain
   */
  async collectEmails(domain, options = {}) {
    const result = {
      status: 'ok',
      domain,
      addresses: [],
      sources: {}
    };

    // theHarvester (already in config)
    if (options.theHarvester !== false) {
      const harvesterResult = await this.runTheHarvester(domain, options);
      if (harvesterResult.status === 'ok') {
        result.sources.theHarvester = harvesterResult;
        result.addresses.push(...harvesterResult.emails);
      } else {
        result.sources.theHarvester = harvesterResult;
      }
    }

    // Deduplicate emails
    result.addresses = [...new Set(result.addresses)].sort();

    return result;
  }

  /**
   * Run theHarvester for email collection
   */
  async runTheHarvester(domain, options = {}) {
    const sources = options.harvesterSources || ['bing', 'google', 'duckduckgo'];
    const run = await this.commandRunner.run('theHarvester', [
      '-d', domain,
      '-b', sources.join(','),
      '-l', '500'
    ], {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024
    });

    if (!run.ok) {
      return {
        status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
        message: run.error?.message || 'theHarvester failed',
        stderr: run.stderr
      };
    }

    // Parse email addresses from output
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = [...new Set((run.stdout.match(emailRegex) || []).filter(email =>
      email.toLowerCase().includes(domain.toLowerCase())
    ))];

    return {
      status: 'ok',
      emails,
      count: emails.length
    };
  }


  /**
   * 3. Leak Detection
   * Check if emails appear in known breaches (HaveIBeenPwned)
   */
  async detectLeaks(emails, options = {}) {
    const result = {
      status: 'ok',
      checked: 0,
      breaches: [],
      emailBreaches: {}
    };

    const maxEmails = options.maxEmailsToCheck || 10;
    const emailsToCheck = emails.slice(0, maxEmails);

    for (const email of emailsToCheck) {
      try {
        result.checked++;

        const breaches = await this.checkHaveIBeenPwned(email, options);

        if (breaches.length > 0) {
          result.emailBreaches[email] = breaches;
          result.breaches.push(...breaches.map(b => ({
            ...b,
            email
          })));
        }

        // Rate limiting (HIBP requires 1.5s between requests)
        await this.sleep(1500);

      } catch (error) {
        // Continue with next email
      }
    }

    // Deduplicate breaches by name
    const uniqueBreaches = new Map();
    for (const breach of result.breaches) {
      if (!uniqueBreaches.has(breach.Name)) {
        uniqueBreaches.set(breach.Name, breach);
      }
    }
    result.breaches = Array.from(uniqueBreaches.values());

    return result;
  }

  /**
   * Check HaveIBeenPwned API for email breaches
   * NOTE: Uses public API (no key required) but has strict rate limits
   */
  async checkHaveIBeenPwned(email, options = {}) {
    try {
      // Using v2 API which is still free (v3 requires paid API key)
      // Note: v2 is deprecated but still works for basic breach checking
      const url = `https://haveibeenpwned.com/api/v2/breachedaccount/${encodeURIComponent(email)}`;

      const headers = {
        'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0'
      };

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });

      if (response.status === 404) {
        // No breaches found
        return [];
      }

      if (response.status === 429) {
        // Rate limited - too many requests
        return [];
      }

      if (!response.ok) {
        throw new Error(`HIBP API returned ${response.status}`);
      }

      const breaches = await response.json();
      return breaches;

    } catch (error) {
      // Rate limited or error - continue gracefully
      return [];
    }
  }

  /**
   * 4. GitHub Reconnaissance
   * Search for organization repos, code mentions, and potential leaks
   */
  async githubRecon(companyName, domain, options = {}) {
    const result = {
      status: 'ok',
      searchTerms: {
        company: companyName,
        domain: domain
      },
      repositories: [],
      codeMentions: [],
      users: []
    };

    // Search for organization repositories
    if (options.githubRepos !== false) {
      const repoResults = await this.searchGitHubRepos(companyName, options);
      result.repositories = repoResults.repositories || [];
    }

    // Search for code mentions
    if (options.githubCode !== false) {
      const codeResults = await this.searchGitHubCode(domain, options);
      result.codeMentions = codeResults.mentions || [];
    }

    // Search for users
    if (options.githubUsers !== false) {
      const userResults = await this.searchGitHubUsers(companyName, options);
      result.users = userResults.users || [];
    }

    return result;
  }

  /**
   * Search GitHub repositories
   */
  async searchGitHubRepos(query, options = {}) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${options.maxRepos || 10}`;

      const headers = {
        'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0',
        'Accept': 'application/vnd.github+json'
      };

      if (options.githubToken) {
        headers['Authorization'] = `Bearer ${options.githubToken}`;
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
      });

      if (!response.ok) {
        return {
          status: 'error',
          message: `GitHub API returned ${response.status}`,
          repositories: []
        };
      }

      const data = await response.json();
      const repositories = (data.items || []).map(repo => ({
        name: repo.full_name,
        url: repo.html_url,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        updated: repo.updated_at
      }));

      return {
        status: 'ok',
        repositories,
        count: repositories.length
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        repositories: []
      };
    }
  }

  /**
   * Search GitHub code for domain mentions
   */
  async searchGitHubCode(query, options = {}) {
    try {
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=${options.maxCodeResults || 10}`;

      const headers = {
        'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0',
        'Accept': 'application/vnd.github+json'
      };

      if (options.githubToken) {
        headers['Authorization'] = `Bearer ${options.githubToken}`;
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
      });

      if (!response.ok) {
        return {
          status: 'error',
          message: `GitHub API returned ${response.status}`,
          mentions: []
        };
      }

      const data = await response.json();
      const mentions = (data.items || []).map(item => ({
        repository: item.repository.full_name,
        path: item.path,
        url: item.html_url,
        sha: item.sha
      }));

      return {
        status: 'ok',
        mentions,
        count: mentions.length
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        mentions: []
      };
    }
  }

  /**
   * Search GitHub users
   */
  async searchGitHubUsers(query, options = {}) {
    try {
      const url = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=${options.maxUsers || 10}`;

      const headers = {
        'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0',
        'Accept': 'application/vnd.github+json'
      };

      if (options.githubToken) {
        headers['Authorization'] = `Bearer ${options.githubToken}`;
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
      });

      if (!response.ok) {
        return {
          status: 'error',
          message: `GitHub API returned ${response.status}`,
          users: []
        };
      }

      const data = await response.json();
      const users = (data.items || []).map(user => ({
        username: user.login,
        url: user.html_url,
        avatar: user.avatar_url,
        type: user.type
      }));

      return {
        status: 'ok',
        users,
        count: users.length
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        users: []
      };
    }
  }

  /**
   * 5. SaaS Footprint Detection
   * Detect third-party services via DNS, JS, headers
   */
  async detectSaasFootprint(domain, options = {}) {
    const result = {
      status: 'ok',
      domain,
      services: {}
    };

    // Check DNS records for SaaS indicators
    const dnsServices = await this.detectSaasFromDNS(domain, options);
    Object.assign(result.services, dnsServices);

    // Check HTTP headers and JS for SaaS fingerprints
    const httpServices = await this.detectSaasFromHTTP(domain, options);
    Object.assign(result.services, httpServices);

    return result;
  }

  /**
   * Detect SaaS from DNS records (MX, TXT, CNAME)
   */
  async detectSaasFromDNS(domain, options = {}) {
    const services = {};

    // Check MX records for email providers
    const mxRun = await this.commandRunner.run('dig', ['+short', 'MX', domain], { timeout: 5000 });
    if (mxRun.ok && mxRun.stdout) {
      const mx = mxRun.stdout.toLowerCase();

      if (mx.includes('google') || mx.includes('gmail')) {
        services.email = { provider: 'Google Workspace', evidence: 'MX records' };
      } else if (mx.includes('outlook') || mx.includes('microsoft')) {
        services.email = { provider: 'Microsoft 365', evidence: 'MX records' };
      } else if (mx.includes('mail.protection.outlook')) {
        services.email = { provider: 'Microsoft Exchange Online', evidence: 'MX records' };
      }
    }

    // Check TXT records for SPF/DKIM
    const txtRun = await this.commandRunner.run('dig', ['+short', 'TXT', domain], { timeout: 5000 });
    if (txtRun.ok && txtRun.stdout) {
      const txt = txtRun.stdout.toLowerCase();

      if (txt.includes('spf') && txt.includes('include:')) {
        const spfIncludes = txt.match(/include:([^\s"]+)/g) || [];
        services.spf = {
          providers: spfIncludes.map(s => s.replace('include:', '')),
          evidence: 'SPF TXT record'
        };
      }

      if (txt.includes('v=dmarc')) {
        services.dmarc = { enabled: true, evidence: 'DMARC TXT record' };
      }
    }

    // Check CNAME for CDN/hosting
    const cnameRun = await this.commandRunner.run('dig', ['+short', 'CNAME', domain], { timeout: 5000 });
    if (cnameRun.ok && cnameRun.stdout) {
      const cname = cnameRun.stdout.toLowerCase();

      if (cname.includes('cloudflare')) {
        services.cdn = { provider: 'Cloudflare', evidence: 'CNAME record' };
      } else if (cname.includes('fastly')) {
        services.cdn = { provider: 'Fastly', evidence: 'CNAME record' };
      } else if (cname.includes('akamai')) {
        services.cdn = { provider: 'Akamai', evidence: 'CNAME record' };
      } else if (cname.includes('cloudfront')) {
        services.cdn = { provider: 'AWS CloudFront', evidence: 'CNAME record' };
      }
    }

    return services;
  }

  /**
   * Detect SaaS from HTTP headers and JavaScript
   */
  async detectSaasFromHTTP(domain, options = {}) {
    const services = {};

    try {
      const url = `https://${domain}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });

      // Check headers
      const headers = Object.fromEntries(response.headers.entries());

      if (headers['server']) {
        services.server = {
          software: headers['server'],
          evidence: 'Server header'
        };
      }

      if (headers['x-powered-by']) {
        services.framework = {
          name: headers['x-powered-by'],
          evidence: 'X-Powered-By header'
        };
      }

      // Check body for analytics/tracking
      const html = await response.text();

      if (html.includes('google-analytics') || html.includes('gtag.js')) {
        services.analytics = { provider: 'Google Analytics', evidence: 'JavaScript tag' };
      }

      if (html.includes('googletagmanager')) {
        services.tagManager = { provider: 'Google Tag Manager', evidence: 'JavaScript tag' };
      }

      if (html.includes('hotjar')) {
        services.heatmap = { provider: 'Hotjar', evidence: 'JavaScript tag' };
      }

      if (html.includes('intercom')) {
        services.chat = { provider: 'Intercom', evidence: 'JavaScript tag' };
      }

      if (html.includes('stripe')) {
        services.payment = { provider: 'Stripe', evidence: 'JavaScript tag' };
      }

    } catch (error) {
      // Ignore HTTP errors
    }

    return services;
  }

  /**
   * 6. Social Media Mapping
   * Map company presence across social platforms
   */
  async mapSocialMedia(companyName, domain, options = {}) {
    const result = {
      status: 'ok',
      platforms: {}
    };

    // LinkedIn
    if (options.linkedin !== false) {
      result.platforms.linkedin = {
        status: 'manual',
        message: 'LinkedIn search requires manual verification or API access',
        searchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`
      };
    }

    // Twitter/X
    if (options.twitter !== false) {
      result.platforms.twitter = {
        status: 'manual',
        message: 'Twitter search requires API access',
        searchUrl: `https://twitter.com/search?q=${encodeURIComponent(companyName)}&f=user`
      };
    }

    // Facebook
    if (options.facebook !== false) {
      result.platforms.facebook = {
        status: 'manual',
        message: 'Facebook search requires manual verification',
        searchUrl: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(companyName)}`
      };
    }

    return result;
  }

  // ========================================
  // Helper Methods
  // ========================================

  extractBaseDomain(host) {
    // Remove subdomain, keep base domain
    const parts = host.split('.');
    if (parts.length > 2) {
      // Handle special TLDs like .co.uk
      const specialTLDs = ['co.uk', 'com.br', 'co.jp', 'co.za', 'com.mx', 'com.ar'];
      const lastTwo = parts.slice(-2).join('.');

      if (specialTLDs.includes(lastTwo)) {
        return parts.slice(-3).join('.');
      }

      return parts.slice(-2).join('.');
    }
    return host;
  }

  extractCompanyName(domain) {
    // Extract company name from domain (simple heuristic)
    return domain.split('.')[0];
  }

  deduplicateProfiles(profiles) {
    const seen = new Set();
    return profiles.filter(profile => {
      if (seen.has(profile.url)) {
        return false;
      }
      seen.add(profile.url);
      return true;
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
