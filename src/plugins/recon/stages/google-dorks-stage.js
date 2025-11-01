/**
 * GoogleDorksStage
 *
 * Search engine reconnaissance using Google Dorks
 *
 * Discovers:
 * - GitHub repositories
 * - Pastebin leaks
 * - LinkedIn employees
 * - Exposed files (PDF, DOC, XLS)
 * - Subdomains
 * - Login pages
 * - Exposed configs
 *
 * Uses 100% free web scraping (no API key required)
 */

export class GoogleDorksStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  /**
   * Execute Google Dorks search
   * @param {Object} target - Target object with host property
   * @param {Object} options - Google Dorks options
   * @returns {Promise<Object>} Search results
   */
  async execute(target, options = {}) {
    const domain = this.extractBaseDomain(target.host);
    const companyName = this.extractCompanyName(domain);

    const result = {
      status: 'ok',
      domain,
      companyName,
      categories: {
        github: null,        // GitHub repos/code
        pastebin: null,      // Pastebin leaks
        linkedin: null,      // LinkedIn employees
        documents: null,     // Exposed docs (PDF, DOC, XLS)
        subdomains: null,    // Subdomains via Google
        loginPages: null,    // Login/admin pages
        configs: null,       // Config files
        errors: null         // Error pages revealing info
      },
      summary: {
        totalResults: 0,
        totalCategories: 0
      }
    };

    // Track individual category results for artifact persistence
    const individual = {};

    const enabledCategories = options.categories || [
      'github', 'pastebin', 'linkedin', 'documents',
      'subdomains', 'loginPages', 'configs', 'errors'
    ];

    // Execute each category
    for (const category of enabledCategories) {
      try {
        let categoryData = null;

        switch (category) {
          case 'github':
            categoryData = await this.searchGitHub(domain, companyName, options);
            break;
          case 'pastebin':
            categoryData = await this.searchPastebin(domain, companyName, options);
            break;
          case 'linkedin':
            categoryData = await this.searchLinkedIn(domain, companyName, options);
            break;
          case 'documents':
            categoryData = await this.searchDocuments(domain, options);
            break;
          case 'subdomains':
            categoryData = await this.searchSubdomains(domain, options);
            break;
          case 'loginPages':
            categoryData = await this.searchLoginPages(domain, options);
            break;
          case 'configs':
            categoryData = await this.searchConfigs(domain, options);
            break;
          case 'errors':
            categoryData = await this.searchErrors(domain, options);
            break;
        }

        result.categories[category] = categoryData;
        individual[category] = categoryData; // Store in individual too

      } catch (error) {
        result.categories[category] = {
          status: 'error',
          message: error.message
        };
        individual[category] = {
          status: 'error',
          message: error.message
        };
      }
    }

    // Calculate summary
    let totalResults = 0;
    let totalCategories = 0;

    for (const [category, data] of Object.entries(result.categories)) {
      if (data && data.status === 'ok') {
        totalCategories++;
        if (data.results) {
          totalResults += data.results.length;
        }
      }
    }

    result.summary.totalResults = totalResults;
    result.summary.totalCategories = totalCategories;

    return {
      _individual: individual,
      _aggregated: result,
      ...result // Root level for compatibility
    };
  }

  /**
   * Search GitHub for company repos/code
   * Dork: site:github.com "companyname"
   */
  async searchGitHub(domain, companyName, options = {}) {
    const queries = [
      `site:github.com "${companyName}"`,
      `site:github.com "${domain}"`,
      `site:github.com "api" "${domain}"`,
      `site:github.com "config" "${domain}"`
    ];

    const results = [];

    for (const query of queries) {
      const urls = await this.performGoogleSearch(query, options);
      results.push(...urls.map(url => ({ url, query })));

      // Rate limit
      await this.sleep(2000);
    }

    return {
      status: 'ok',
      results: this.deduplicateResults(results),
      count: results.length
    };
  }

  /**
   * Search Pastebin for leaks
   * Dork: site:pastebin.com "domain.com"
   */
  async searchPastebin(domain, companyName, options = {}) {
    const queries = [
      `site:pastebin.com "${domain}"`,
      `site:pastebin.com "${companyName}"`,
      `site:paste2.org "${domain}"`,
      `site:slexy.org "${domain}"`
    ];

    const results = [];

    for (const query of queries) {
      const urls = await this.performGoogleSearch(query, options);
      results.push(...urls.map(url => ({ url, query })));

      await this.sleep(2000);
    }

    return {
      status: 'ok',
      results: this.deduplicateResults(results),
      count: results.length
    };
  }

  /**
   * Search LinkedIn for employees
   * Dork: site:linkedin.com/in "companyname"
   */
  async searchLinkedIn(domain, companyName, options = {}) {
    const queries = [
      `site:linkedin.com/in "${companyName}"`,
      `site:linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, '-')}`
    ];

    const results = [];

    for (const query of queries) {
      const urls = await this.performGoogleSearch(query, options);
      results.push(...urls.map(url => ({ url, query })));

      await this.sleep(2000);
    }

    return {
      status: 'ok',
      results: this.deduplicateResults(results),
      count: results.length
    };
  }

  /**
   * Search for exposed documents
   * Dork: site:domain.com filetype:pdf|doc|xls
   */
  async searchDocuments(domain, options = {}) {
    const filetypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    const results = [];

    for (const filetype of filetypes) {
      const query = `site:${domain} filetype:${filetype}`;
      const urls = await this.performGoogleSearch(query, options);
      results.push(...urls.map(url => ({ url, filetype, query })));

      await this.sleep(2000);
    }

    return {
      status: 'ok',
      results: this.deduplicateResults(results),
      count: results.length
    };
  }

  /**
   * Search for subdomains
   * Dork: site:*.domain.com
   */
  async searchSubdomains(domain, options = {}) {
    const query = `site:*.${domain}`;
    const urls = await this.performGoogleSearch(query, options);

    const subdomains = urls.map(url => {
      const match = url.match(/https?:\/\/([^\/]+)/);
      return match ? match[1] : null;
    }).filter(Boolean);

    return {
      status: 'ok',
      results: [...new Set(subdomains)].map(subdomain => ({ subdomain })),
      count: subdomains.length
    };
  }

  /**
   * Search for login/admin pages
   * Dork: site:domain.com inurl:login|admin|dashboard
   */
  async searchLoginPages(domain, options = {}) {
    const queries = [
      `site:${domain} inurl:login`,
      `site:${domain} inurl:admin`,
      `site:${domain} inurl:dashboard`,
      `site:${domain} inurl:portal`,
      `site:${domain} intitle:"login" OR intitle:"sign in"`
    ];

    const results = [];

    for (const query of queries) {
      const urls = await this.performGoogleSearch(query, options);
      results.push(...urls.map(url => ({ url, query })));

      await this.sleep(2000);
    }

    return {
      status: 'ok',
      results: this.deduplicateResults(results),
      count: results.length
    };
  }

  /**
   * Search for config files
   * Dork: site:domain.com ext:env|config|ini|yml
   */
  async searchConfigs(domain, options = {}) {
    const queries = [
      `site:${domain} ext:env`,
      `site:${domain} ext:config`,
      `site:${domain} ext:ini`,
      `site:${domain} ext:yml`,
      `site:${domain} ext:yaml`,
      `site:${domain} inurl:config`,
      `site:${domain} intitle:"index of" "config"`
    ];

    const results = [];

    for (const query of queries) {
      const urls = await this.performGoogleSearch(query, options);
      results.push(...urls.map(url => ({ url, query })));

      await this.sleep(2000);
    }

    return {
      status: 'ok',
      results: this.deduplicateResults(results),
      count: results.length
    };
  }

  /**
   * Search for error pages (can reveal paths, versions, etc.)
   * Dork: site:domain.com intext:"error" OR intext:"warning"
   */
  async searchErrors(domain, options = {}) {
    const queries = [
      `site:${domain} intext:"error" OR intext:"exception"`,
      `site:${domain} intext:"stack trace"`,
      `site:${domain} intext:"warning" intitle:"error"`,
      `site:${domain} intext:"mysql" intext:"error"`,
      `site:${domain} intext:"fatal error"`
    ];

    const results = [];

    for (const query of queries) {
      const urls = await this.performGoogleSearch(query, options);
      results.push(...urls.map(url => ({ url, query })));

      await this.sleep(2000);
    }

    return {
      status: 'ok',
      results: this.deduplicateResults(results),
      count: results.length
    };
  }

  /**
   * Perform actual Google search
   * Note: Google blocks automated queries, so this uses DuckDuckGo as fallback
   */
  async performGoogleSearch(query, options = {}) {
    const maxResults = options.maxResults || 10;
    const results = [];

    try {
      // Try DuckDuckGo HTML search (more permissive than Google)
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
      });

      if (!response.ok) {
        return results;
      }

      const html = await response.text();

      // Parse DuckDuckGo results
      // Format: <a class="result__a" href="//duckduckgo.com/l/?uddg=URL&rut=...">
      const urlMatches = html.matchAll(/class="result__url"[^>]*>([^<]+)</g);

      for (const match of urlMatches) {
        let resultUrl = match[1].trim();

        // Clean up URL
        if (resultUrl.startsWith('//')) {
          resultUrl = 'https:' + resultUrl;
        }

        results.push(resultUrl);

        if (results.length >= maxResults) {
          break;
        }
      }

    } catch (error) {
      // Silently fail
    }

    return results;
  }

  /**
   * Deduplicate results by URL
   */
  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(item => {
      const url = item.url || item.subdomain;
      if (seen.has(url)) {
        return false;
      }
      seen.add(url);
      return true;
    });
  }

  /**
   * Extract base domain from host
   */
  extractBaseDomain(host) {
    const parts = host.split('.');
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return host;
  }

  /**
   * Extract company name from domain
   */
  extractCompanyName(domain) {
    const parts = domain.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }

  /**
   * Sleep helper
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
