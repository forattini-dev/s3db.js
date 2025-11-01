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
 * 2. Email Collection (theHarvester - 100% free)
 * 3. Leak Detection (HaveIBeenPwned v2, Scylla.sh - 100% free)
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

    // Try WhatsMyName (API-based, 400+ sites)
    if (options.whatsmyname !== false) {
      const wmnResult = await this.runWhatsMyName(companyName, options);
      if (wmnResult.status === 'ok') {
        result.sources.whatsmyname = wmnResult;
        result.profiles.push(...wmnResult.found.map(item => ({
          platform: item.site,
          url: item.url,
          username: companyName,
          category: item.category,
          source: 'whatsmyname'
        })));
      } else {
        result.sources.whatsmyname = wmnResult;
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
      emailBreaches: {},
      sources: {
        hibp: [],
        scylla: []
      }
    };

    const maxEmails = options.maxEmailsToCheck || 10;
    const emailsToCheck = emails.slice(0, maxEmails);

    for (const email of emailsToCheck) {
      try {
        result.checked++;

        // Check HaveIBeenPwned
        if (options.hibp !== false) {
          const breaches = await this.checkHaveIBeenPwned(email, options);

          if (breaches.length > 0) {
            result.emailBreaches[email] = result.emailBreaches[email] || [];
            result.emailBreaches[email].push(...breaches);
            result.sources.hibp.push(...breaches.map(b => ({
              ...b,
              email,
              source: 'HaveIBeenPwned'
            })));
          }

          // Rate limiting (HIBP requires 1.5s between requests)
          await this.sleep(1500);
        }

        // Check Scylla.sh
        if (options.scylla !== false) {
          const scyllaResult = await this.checkScylla(email, options);

          if (scyllaResult.status === 'ok' && scyllaResult.breaches.length > 0) {
            result.emailBreaches[email] = result.emailBreaches[email] || [];
            result.emailBreaches[email].push(...scyllaResult.breaches);
            result.sources.scylla.push(...scyllaResult.breaches.map(b => ({
              ...b,
              source: 'Scylla.sh'
            })));
          }

          // Rate limiting for Scylla
          await this.sleep(1000);
        }

      } catch (error) {
        // Continue with next email
      }
    }

    // Combine all breaches from both sources
    result.breaches = [
      ...result.sources.hibp,
      ...result.sources.scylla
    ];

    // Deduplicate breaches by name/source
    const uniqueBreaches = new Map();
    for (const breach of result.breaches) {
      const key = `${breach.Name || breach.source}-${breach.email}`;
      if (!uniqueBreaches.has(key)) {
        uniqueBreaches.set(key, breach);
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
   * Detect SaaS from DNS records (MX, TXT, CNAME, A, NS)
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
      } else if (mx.includes('mailgun')) {
        services.email = { provider: 'Mailgun', evidence: 'MX records' };
      } else if (mx.includes('sendgrid')) {
        services.email = { provider: 'SendGrid', evidence: 'MX records' };
      } else if (mx.includes('postmark')) {
        services.email = { provider: 'Postmark', evidence: 'MX records' };
      } else if (mx.includes('zoho')) {
        services.email = { provider: 'Zoho Mail', evidence: 'MX records' };
      } else if (mx.includes('protonmail')) {
        services.email = { provider: 'ProtonMail', evidence: 'MX records' };
      }
    }

    // Check TXT records for SPF/DKIM/DMARC
    const txtRun = await this.commandRunner.run('dig', ['+short', 'TXT', domain], { timeout: 5000 });
    if (txtRun.ok && txtRun.stdout) {
      const txt = txtRun.stdout.toLowerCase();

      // SPF providers
      if (txt.includes('spf') && txt.includes('include:')) {
        const spfIncludes = txt.match(/include:([^\s"]+)/g) || [];
        const providers = spfIncludes.map(s => s.replace('include:', ''));

        services.spf = {
          providers,
          evidence: 'SPF TXT record'
        };

        // Identify specific services from SPF
        if (providers.some(p => p.includes('mailgun'))) {
          services.emailSending = services.emailSending || [];
          services.emailSending.push({ provider: 'Mailgun', evidence: 'SPF include' });
        }
        if (providers.some(p => p.includes('sendgrid'))) {
          services.emailSending = services.emailSending || [];
          services.emailSending.push({ provider: 'SendGrid', evidence: 'SPF include' });
        }
        if (providers.some(p => p.includes('mailchimp'))) {
          services.emailMarketing = { provider: 'Mailchimp', evidence: 'SPF include' };
        }
        if (providers.some(p => p.includes('constantcontact'))) {
          services.emailMarketing = { provider: 'Constant Contact', evidence: 'SPF include' };
        }
      }

      // DMARC
      if (txt.includes('v=dmarc')) {
        services.dmarc = { enabled: true, evidence: 'DMARC TXT record' };
      }

      // Domain verification TXT records
      if (txt.includes('google-site-verification')) {
        services.domainVerification = services.domainVerification || [];
        services.domainVerification.push({ provider: 'Google', evidence: 'TXT record' });
      }
      if (txt.includes('facebook-domain-verification')) {
        services.domainVerification = services.domainVerification || [];
        services.domainVerification.push({ provider: 'Facebook', evidence: 'TXT record' });
      }
      if (txt.includes('ms=ms')) {
        services.domainVerification = services.domainVerification || [];
        services.domainVerification.push({ provider: 'Microsoft', evidence: 'TXT record' });
      }
    }

    // Check DKIM selectors (common ones)
    const dkimSelectors = ['default', 'google', 'k1', 's1', 'selector1', 'selector2', 'dkim', 'mail'];
    for (const selector of dkimSelectors) {
      const dkimRun = await this.commandRunner.run('dig', ['+short', 'TXT', `${selector}._domainkey.${domain}`], { timeout: 3000 });
      if (dkimRun.ok && dkimRun.stdout && dkimRun.stdout.includes('v=DKIM1')) {
        services.dkim = services.dkim || { selectors: [], evidence: 'DKIM TXT records' };
        services.dkim.selectors.push(selector);
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
      } else if (cname.includes('vercel')) {
        services.hosting = { provider: 'Vercel', evidence: 'CNAME record' };
      } else if (cname.includes('netlify')) {
        services.hosting = { provider: 'Netlify', evidence: 'CNAME record' };
      } else if (cname.includes('herokuapp')) {
        services.hosting = { provider: 'Heroku', evidence: 'CNAME record' };
      } else if (cname.includes('github.io')) {
        services.hosting = { provider: 'GitHub Pages', evidence: 'CNAME record' };
      } else if (cname.includes('digitaloceanspaces')) {
        services.hosting = { provider: 'DigitalOcean Spaces', evidence: 'CNAME record' };
      } else if (cname.includes('s3.amazonaws') || cname.includes('s3-website')) {
        services.hosting = { provider: 'AWS S3', evidence: 'CNAME record' };
      }
    }

    // Check A records for hosting providers (common IP ranges)
    const aRun = await this.commandRunner.run('dig', ['+short', 'A', domain], { timeout: 5000 });
    if (aRun.ok && aRun.stdout) {
      const ips = aRun.stdout.split('\n').filter(line => line.trim());

      for (const ip of ips) {
        // Cloudflare IP ranges
        if (ip.startsWith('104.') || ip.startsWith('172.') || ip.startsWith('173.')) {
          services.cdn = services.cdn || { provider: 'Cloudflare (detected by IP)', evidence: 'A record IP range' };
        }
        // AWS IP ranges (partial detection)
        else if (ip.startsWith('52.') || ip.startsWith('54.') || ip.startsWith('18.')) {
          services.cloud = services.cloud || { provider: 'AWS (likely)', evidence: 'A record IP range' };
        }
        // DigitalOcean IP ranges
        else if (ip.startsWith('159.') || ip.startsWith('167.')) {
          services.cloud = services.cloud || { provider: 'DigitalOcean (likely)', evidence: 'A record IP range' };
        }
      }
    }

    // Check NS records for DNS providers
    const nsRun = await this.commandRunner.run('dig', ['+short', 'NS', domain], { timeout: 5000 });
    if (nsRun.ok && nsRun.stdout) {
      const ns = nsRun.stdout.toLowerCase();

      if (ns.includes('cloudflare')) {
        services.dns = { provider: 'Cloudflare DNS', evidence: 'NS records' };
      } else if (ns.includes('awsdns')) {
        services.dns = { provider: 'AWS Route53', evidence: 'NS records' };
      } else if (ns.includes('googledomains') || ns.includes('ns-cloud')) {
        services.dns = { provider: 'Google Cloud DNS', evidence: 'NS records' };
      } else if (ns.includes('nsone')) {
        services.dns = { provider: 'NS1', evidence: 'NS records' };
      } else if (ns.includes('dnsimple')) {
        services.dns = { provider: 'DNSimple', evidence: 'NS records' };
      } else if (ns.includes('digitalocean')) {
        services.dns = { provider: 'DigitalOcean DNS', evidence: 'NS records' };
      } else if (ns.includes('namecheap')) {
        services.dns = { provider: 'Namecheap DNS', evidence: 'NS records' };
      } else if (ns.includes('godaddy')) {
        services.dns = { provider: 'GoDaddy DNS', evidence: 'NS records' };
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
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (compatible; ReconBot/1.0)'
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });

      // Check headers
      const headers = Object.fromEntries(response.headers.entries());

      if (headers['server']) {
        services.server = {
          software: headers['server'],
          evidence: 'Server header'
        };

        // Detect server-specific services
        const server = headers['server'].toLowerCase();
        if (server.includes('cloudflare')) {
          services.cdn = services.cdn || { provider: 'Cloudflare', evidence: 'Server header' };
        } else if (server.includes('vercel')) {
          services.hosting = { provider: 'Vercel', evidence: 'Server header' };
        } else if (server.includes('netlify')) {
          services.hosting = { provider: 'Netlify', evidence: 'Server header' };
        }
      }

      if (headers['x-powered-by']) {
        services.framework = {
          name: headers['x-powered-by'],
          evidence: 'X-Powered-By header'
        };
      }

      // CDN/hosting-specific headers
      if (headers['cf-ray']) {
        services.cdn = services.cdn || { provider: 'Cloudflare', evidence: 'CF-Ray header' };
      }
      if (headers['x-vercel-id'] || headers['x-vercel-cache']) {
        services.hosting = { provider: 'Vercel', evidence: 'Vercel headers' };
      }
      if (headers['x-nf-request-id']) {
        services.hosting = { provider: 'Netlify', evidence: 'Netlify headers' };
      }
      if (headers['x-amz-cf-id'] || headers['x-amz-request-id']) {
        services.cloud = { provider: 'AWS', evidence: 'AWS headers' };
      }

      // Check body for analytics/tracking/SaaS
      const html = await response.text();

      // Analytics
      const analytics = [];
      if (html.includes('google-analytics') || html.includes('gtag.js') || html.includes('ga.js')) {
        analytics.push({ provider: 'Google Analytics', evidence: 'JavaScript tag' });
      }
      if (html.includes('googletagmanager')) {
        analytics.push({ provider: 'Google Tag Manager', evidence: 'JavaScript tag' });
      }
      if (html.includes('segment.com') || html.includes('analytics.js')) {
        analytics.push({ provider: 'Segment', evidence: 'JavaScript tag' });
      }
      if (html.includes('mixpanel')) {
        analytics.push({ provider: 'Mixpanel', evidence: 'JavaScript tag' });
      }
      if (html.includes('amplitude')) {
        analytics.push({ provider: 'Amplitude', evidence: 'JavaScript tag' });
      }
      if (html.includes('heap.io') || html.includes('heapanalytics')) {
        analytics.push({ provider: 'Heap Analytics', evidence: 'JavaScript tag' });
      }
      if (html.includes('matomo') || html.includes('piwik')) {
        analytics.push({ provider: 'Matomo', evidence: 'JavaScript tag' });
      }
      if (html.includes('plausible.io')) {
        analytics.push({ provider: 'Plausible', evidence: 'JavaScript tag' });
      }
      if (analytics.length > 0) {
        services.analytics = analytics;
      }

      // Heatmap / Session Recording
      const heatmap = [];
      if (html.includes('hotjar')) {
        heatmap.push({ provider: 'Hotjar', evidence: 'JavaScript tag' });
      }
      if (html.includes('fullstory')) {
        heatmap.push({ provider: 'FullStory', evidence: 'JavaScript tag' });
      }
      if (html.includes('logrocket')) {
        heatmap.push({ provider: 'LogRocket', evidence: 'JavaScript tag' });
      }
      if (html.includes('smartlook')) {
        heatmap.push({ provider: 'Smartlook', evidence: 'JavaScript tag' });
      }
      if (html.includes('mouseflow')) {
        heatmap.push({ provider: 'Mouseflow', evidence: 'JavaScript tag' });
      }
      if (heatmap.length > 0) {
        services.heatmap = heatmap;
      }

      // Chat / Customer Support
      const chat = [];
      if (html.includes('intercom')) {
        chat.push({ provider: 'Intercom', evidence: 'JavaScript tag' });
      }
      if (html.includes('drift') && html.includes('drift.com')) {
        chat.push({ provider: 'Drift', evidence: 'JavaScript tag' });
      }
      if (html.includes('zendesk')) {
        chat.push({ provider: 'Zendesk', evidence: 'JavaScript tag' });
      }
      if (html.includes('livechat')) {
        chat.push({ provider: 'LiveChat', evidence: 'JavaScript tag' });
      }
      if (html.includes('crisp.chat')) {
        chat.push({ provider: 'Crisp', evidence: 'JavaScript tag' });
      }
      if (html.includes('tawk.to')) {
        chat.push({ provider: 'Tawk.to', evidence: 'JavaScript tag' });
      }
      if (html.includes('olark')) {
        chat.push({ provider: 'Olark', evidence: 'JavaScript tag' });
      }
      if (chat.length > 0) {
        services.chat = chat;
      }

      // Error Tracking / Monitoring
      const monitoring = [];
      if (html.includes('sentry.io') || html.includes('sentry-cdn')) {
        monitoring.push({ provider: 'Sentry', evidence: 'JavaScript tag' });
      }
      if (html.includes('bugsnag')) {
        monitoring.push({ provider: 'Bugsnag', evidence: 'JavaScript tag' });
      }
      if (html.includes('rollbar')) {
        monitoring.push({ provider: 'Rollbar', evidence: 'JavaScript tag' });
      }
      if (html.includes('newrelic')) {
        monitoring.push({ provider: 'New Relic', evidence: 'JavaScript tag' });
      }
      if (html.includes('datadoghq')) {
        monitoring.push({ provider: 'Datadog', evidence: 'JavaScript tag' });
      }
      if (monitoring.length > 0) {
        services.monitoring = monitoring;
      }

      // Payment Processors
      const payment = [];
      if (html.includes('stripe.com') || html.includes('stripe.js')) {
        payment.push({ provider: 'Stripe', evidence: 'JavaScript tag' });
      }
      if (html.includes('paypal.com')) {
        payment.push({ provider: 'PayPal', evidence: 'JavaScript tag' });
      }
      if (html.includes('braintree')) {
        payment.push({ provider: 'Braintree', evidence: 'JavaScript tag' });
      }
      if (html.includes('adyen')) {
        payment.push({ provider: 'Adyen', evidence: 'JavaScript tag' });
      }
      if (html.includes('square.com')) {
        payment.push({ provider: 'Square', evidence: 'JavaScript tag' });
      }
      if (payment.length > 0) {
        services.payment = payment;
      }

      // Authentication
      const auth = [];
      if (html.includes('auth0')) {
        auth.push({ provider: 'Auth0', evidence: 'JavaScript tag' });
      }
      if (html.includes('firebase')) {
        auth.push({ provider: 'Firebase Auth', evidence: 'JavaScript tag' });
      }
      if (html.includes('okta')) {
        auth.push({ provider: 'Okta', evidence: 'JavaScript tag' });
      }
      if (html.includes('clerk.dev') || html.includes('clerk.com')) {
        auth.push({ provider: 'Clerk', evidence: 'JavaScript tag' });
      }
      if (auth.length > 0) {
        services.auth = auth;
      }

      // CRM / Marketing
      const crm = [];
      if (html.includes('hubspot')) {
        crm.push({ provider: 'HubSpot', evidence: 'JavaScript tag' });
      }
      if (html.includes('salesforce')) {
        crm.push({ provider: 'Salesforce', evidence: 'JavaScript tag' });
      }
      if (html.includes('marketo')) {
        crm.push({ provider: 'Marketo', evidence: 'JavaScript tag' });
      }
      if (html.includes('pardot')) {
        crm.push({ provider: 'Pardot', evidence: 'JavaScript tag' });
      }
      if (html.includes('activecampaign')) {
        crm.push({ provider: 'ActiveCampaign', evidence: 'JavaScript tag' });
      }
      if (crm.length > 0) {
        services.crm = crm;
      }

      // A/B Testing / Personalization
      const abTesting = [];
      if (html.includes('optimizely')) {
        abTesting.push({ provider: 'Optimizely', evidence: 'JavaScript tag' });
      }
      if (html.includes('vwo.com')) {
        abTesting.push({ provider: 'VWO', evidence: 'JavaScript tag' });
      }
      if (html.includes('launchdarkly')) {
        abTesting.push({ provider: 'LaunchDarkly', evidence: 'JavaScript tag' });
      }
      if (html.includes('split.io')) {
        abTesting.push({ provider: 'Split', evidence: 'JavaScript tag' });
      }
      if (abTesting.length > 0) {
        services.abTesting = abTesting;
      }

      // Content / CMS
      const cms = [];
      if (html.includes('wordpress') || html.includes('wp-content')) {
        cms.push({ provider: 'WordPress', evidence: 'HTML structure' });
      }
      if (html.includes('contentful')) {
        cms.push({ provider: 'Contentful', evidence: 'JavaScript tag' });
      }
      if (html.includes('sanity.io')) {
        cms.push({ provider: 'Sanity', evidence: 'JavaScript tag' });
      }
      if (html.includes('prismic.io')) {
        cms.push({ provider: 'Prismic', evidence: 'JavaScript tag' });
      }
      if (html.includes('strapi')) {
        cms.push({ provider: 'Strapi', evidence: 'JavaScript tag' });
      }
      if (cms.length > 0) {
        services.cms = cms;
      }

      // Social Media Pixels
      const socialPixels = [];
      if (html.includes('facebook.net/en_US/fbevents.js') || html.includes('fbq(')) {
        socialPixels.push({ provider: 'Facebook Pixel', evidence: 'JavaScript tag' });
      }
      if (html.includes('linkedin.com/insight')) {
        socialPixels.push({ provider: 'LinkedIn Insight Tag', evidence: 'JavaScript tag' });
      }
      if (html.includes('twitter.com/i/adsct')) {
        socialPixels.push({ provider: 'Twitter Pixel', evidence: 'JavaScript tag' });
      }
      if (html.includes('pinterest.com/ct/')) {
        socialPixels.push({ provider: 'Pinterest Tag', evidence: 'JavaScript tag' });
      }
      if (html.includes('reddit.com/pixel')) {
        socialPixels.push({ provider: 'Reddit Pixel', evidence: 'JavaScript tag' });
      }
      if (socialPixels.length > 0) {
        services.socialPixels = socialPixels;
      }

      // Advertising
      const advertising = [];
      if (html.includes('googleadservices') || html.includes('googlesyndication')) {
        advertising.push({ provider: 'Google Ads', evidence: 'JavaScript tag' });
      }
      if (html.includes('doubleclick')) {
        advertising.push({ provider: 'DoubleClick', evidence: 'JavaScript tag' });
      }
      if (advertising.length > 0) {
        services.advertising = advertising;
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

  /**
   * WhatsMyName - Username enumeration across 400+ sites
   * Uses JSON data from WhatsMyName project
   */
  async runWhatsMyName(username, options = {}) {
    const results = {
      status: 'ok',
      username,
      found: [],
      notFound: [],
      errors: []
    };

    try {
      // Fetch WhatsMyName data
      const wmn_url = 'https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json';
      const response = await fetch(wmn_url, {
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });

      if (!response.ok) {
        results.status = 'error';
        results.message = 'Failed to fetch WhatsMyName data';
        return results;
      }

      const data = await response.json();
      const sites = data.sites || [];

      // Limit sites to check (to avoid rate limiting)
      const maxSites = options.maxSites || 50;
      const sitesToCheck = sites.slice(0, maxSites);

      // Check each site
      for (const site of sitesToCheck) {
        if (!site.uri_check) continue;

        try {
          const checkUrl = site.uri_check.replace('{account}', encodeURIComponent(username));

          const siteResponse = await fetch(checkUrl, {
            method: 'GET',
            headers: {
              'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (compatible; ReconBot/1.0)'
            },
            signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
            redirect: 'follow'
          });

          // Determine if profile exists based on status code
          const exists = siteResponse.status === 200;

          if (exists) {
            results.found.push({
              site: site.name,
              url: checkUrl,
              category: site.cat || 'unknown'
            });
          } else {
            results.notFound.push(site.name);
          }

        } catch (error) {
          results.errors.push({
            site: site.name,
            error: error.message
          });
        }

        // Rate limiting - small delay between requests
        await this.sleep(200);
      }

    } catch (error) {
      results.status = 'error';
      results.message = error.message;
    }

    return results;
  }

  /**
   * Scylla.sh - Free breach data API
   * Check if email/domain appears in breaches
   */
  async checkScylla(email, options = {}) {
    const results = {
      status: 'ok',
      email,
      breaches: []
    };

    try {
      // Scylla.sh API endpoint
      const url = `https://scylla.sh/search?q=email:${encodeURIComponent(email)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (compatible; ReconBot/1.0)',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No breaches found
          return results;
        }

        results.status = 'error';
        results.message = `Scylla API returned ${response.status}`;
        return results;
      }

      const data = await response.json();

      // Parse Scylla response
      if (Array.isArray(data)) {
        results.breaches = data.map(breach => ({
          source: breach.Source || breach.Database || 'Unknown',
          email: breach.Email || email,
          username: breach.Username,
          password: breach.Password ? '[REDACTED]' : null, // Don't store actual passwords
          hash: breach.Hash,
          salt: breach.Salt,
          ip: breach.IP,
          fields: Object.keys(breach)
        }));
      }

    } catch (error) {
      results.status = 'error';
      results.message = error.message;
    }

    return results;
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
