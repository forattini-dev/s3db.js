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

import { createHttpClient, type HttpClient } from '../../../concerns/http-client.js';
import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
  config: {
    curl?: {
      userAgent?: string;
    };
  };
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export type DorkCategory = 'github' | 'pastebin' | 'linkedin' | 'documents' | 'subdomains' | 'loginPages' | 'configs' | 'errors';

export interface GoogleDorksFeatureConfig {
  timeout?: number;
  categories?: DorkCategory[];
  maxResults?: number;
}

export interface SearchResultItem {
  url: string;
  query?: string;
  filetype?: string;
  subdomain?: string;
}

export interface CategoryResult {
  status: 'ok' | 'error';
  results?: SearchResultItem[];
  count?: number;
  message?: string;
}

export interface Categories {
  github: CategoryResult | null;
  pastebin: CategoryResult | null;
  linkedin: CategoryResult | null;
  documents: CategoryResult | null;
  subdomains: CategoryResult | null;
  loginPages: CategoryResult | null;
  configs: CategoryResult | null;
  errors: CategoryResult | null;
}

export interface GoogleDorksResult {
  status: string;
  domain: string;
  companyName: string;
  categories: Categories;
  summary: {
    totalResults: number;
    totalCategories: number;
  };
  _individual: Record<string, CategoryResult | null>;
  _aggregated: Omit<GoogleDorksResult, '_individual' | '_aggregated'>;
}

export class GoogleDorksStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];
  private _httpClient: HttpClient | null;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
    this._httpClient = null;
  }

  private async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      this._httpClient = await createHttpClient({
        headers: {
          'User-Agent': this.config.curl?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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

  async execute(target: Target, options: GoogleDorksFeatureConfig = {}): Promise<GoogleDorksResult> {
    const domain = this.extractBaseDomain(target.host);
    const companyName = this.extractCompanyName(domain);

    const result: Omit<GoogleDorksResult, '_individual' | '_aggregated'> = {
      status: 'ok',
      domain,
      companyName,
      categories: {
        github: null,
        pastebin: null,
        linkedin: null,
        documents: null,
        subdomains: null,
        loginPages: null,
        configs: null,
        errors: null
      },
      summary: {
        totalResults: 0,
        totalCategories: 0
      }
    };

    const individual: Record<string, CategoryResult | null> = {};

    const enabledCategories: DorkCategory[] = options.categories || [
      'github', 'pastebin', 'linkedin', 'documents',
      'subdomains', 'loginPages', 'configs', 'errors'
    ];

    for (const category of enabledCategories) {
      try {
        let categoryData: CategoryResult | null = null;

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
        individual[category] = categoryData;

      } catch (error: any) {
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

    let totalResults = 0;
    let totalCategories = 0;

    for (const [, data] of Object.entries(result.categories)) {
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
      ...result
    };
  }

  async searchGitHub(domain: string, companyName: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const queries = [
      `site:github.com "${companyName}"`,
      `site:github.com "${domain}"`,
      `site:github.com "api" "${domain}"`,
      `site:github.com "config" "${domain}"`
    ];

    const results: SearchResultItem[] = [];

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

  async searchPastebin(domain: string, companyName: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const queries = [
      `site:pastebin.com "${domain}"`,
      `site:pastebin.com "${companyName}"`,
      `site:paste2.org "${domain}"`,
      `site:slexy.org "${domain}"`
    ];

    const results: SearchResultItem[] = [];

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

  async searchLinkedIn(domain: string, companyName: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const queries = [
      `site:linkedin.com/in "${companyName}"`,
      `site:linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, '-')}`
    ];

    const results: SearchResultItem[] = [];

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

  async searchDocuments(domain: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const filetypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    const results: SearchResultItem[] = [];

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

  async searchSubdomains(domain: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const query = `site:*.${domain}`;
    const urls = await this.performGoogleSearch(query, options);

    const subdomains = urls.map(url => {
      const match = url.match(/https?:\/\/([^\/]+)/);
      return match ? match[1] : null;
    }).filter((s): s is string => s !== null);

    return {
      status: 'ok',
      results: [...new Set(subdomains)].map(subdomain => ({ url: subdomain, subdomain })),
      count: subdomains.length
    };
  }

  async searchLoginPages(domain: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const queries = [
      `site:${domain} inurl:login`,
      `site:${domain} inurl:admin`,
      `site:${domain} inurl:dashboard`,
      `site:${domain} inurl:portal`,
      `site:${domain} intitle:"login" OR intitle:"sign in"`
    ];

    const results: SearchResultItem[] = [];

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

  async searchConfigs(domain: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const queries = [
      `site:${domain} ext:env`,
      `site:${domain} ext:config`,
      `site:${domain} ext:ini`,
      `site:${domain} ext:yml`,
      `site:${domain} ext:yaml`,
      `site:${domain} inurl:config`,
      `site:${domain} intitle:"index of" "config"`
    ];

    const results: SearchResultItem[] = [];

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

  async searchErrors(domain: string, options: GoogleDorksFeatureConfig = {}): Promise<CategoryResult> {
    const queries = [
      `site:${domain} intext:"error" OR intext:"exception"`,
      `site:${domain} intext:"stack trace"`,
      `site:${domain} intext:"warning" intitle:"error"`,
      `site:${domain} intext:"mysql" intext:"error"`,
      `site:${domain} intext:"fatal error"`
    ];

    const results: SearchResultItem[] = [];

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

  async performGoogleSearch(query: string, options: GoogleDorksFeatureConfig = {}): Promise<string[]> {
    const maxResults = options.maxResults || 10;
    const results: string[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const client = await this._getHttpClient();
      const response = await client.get(url);

      if (!response.ok) {
        return results;
      }

      const html = await response.text();

      const urlMatches = html.matchAll(/class="result__url"[^>]*>([^<]+)</g);

      for (const match of urlMatches) {
        let resultUrl = match[1]!.trim();

        if (resultUrl.startsWith('//')) {
          resultUrl = 'https:' + resultUrl;
        }

        results.push(resultUrl);

        if (results.length >= maxResults) {
          break;
        }
      }

    } catch {
      // Silently fail
    }

    return results;
  }

  deduplicateResults(results: SearchResultItem[]): SearchResultItem[] {
    const seen = new Set<string>();
    return results.filter(item => {
      const key = item.url || item.subdomain || '';
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  extractBaseDomain(host: string): string {
    const parts = host.split('.');
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return host;
  }

  extractCompanyName(domain: string): string {
    const parts = domain.split('.');
    return parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
