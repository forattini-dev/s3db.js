import { createHttpClient } from '#src/concerns/http-client.js';
import type { CrawlContext } from './crawl-context.js';

export interface LlmsTxtLink {
  text: string;
  url: string;
  description?: string;
  section?: string;
}

export interface LlmsTxtSection {
  title: string;
  content: string;
  links: LlmsTxtLink[];
}

export interface LlmsTxtParseResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  siteName?: string;
  siteDescription?: string;
  sections: LlmsTxtSection[];
  links: LlmsTxtLink[];
  hasFullVersion: boolean;
  rawContent: string;
  size: number;
}

export interface LlmsTxtValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  line?: number;
  recommendation?: string;
}

export interface LlmsTxtValidationResult {
  valid: boolean;
  issues: LlmsTxtValidationIssue[];
  parseResult: LlmsTxtParseResult;
}

export interface LlmsTxtCheckResult {
  exists: boolean;
  valid: boolean;
  status?: number;
  fullVersionExists?: boolean;
  siteName?: string;
  siteDescription?: string;
  sections: LlmsTxtSection[];
  links: LlmsTxtLink[];
  issues: LlmsTxtValidationIssue[];
  errors: string[];
  warnings: string[];
  size?: number;
}

export interface LlmsTxtTemplateOptions {
  siteName: string;
  siteDescription: string;
  sections?: Array<{
    title: string;
    links: Array<{
      text: string;
      url: string;
      description?: string;
    }>;
  }>;
}

export interface LlmsTxtValidatorConfig {
  userAgent?: string;
  fetchTimeout?: number;
  cacheTimeout?: number;
  context?: CrawlContext | null;
}

type ReckerParseLlmsTxt = (content: string) => LlmsTxtParseResult;
type ReckerValidateLlmsTxt = (content: string, baseUrl?: string) => LlmsTxtValidationResult;
type ReckerFetchAndValidateLlmsTxt = (
  url: string,
  fetcher?: (url: string) => Promise<{ status: number; text: string }>
) => Promise<LlmsTxtValidationResult & { exists: boolean; status?: number; fullVersionExists?: boolean }>;
type ReckerGenerateLlmsTxtTemplate = (options: LlmsTxtTemplateOptions) => string;

interface CacheEntry {
  result: LlmsTxtCheckResult;
  timestamp: number;
}

interface HttpClient {
  get(url: string): Promise<HttpResponse>;
}

interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export class ReckerLlmsTxtValidator {
  private config: Required<Omit<LlmsTxtValidatorConfig, 'context'>> & {
    context: CrawlContext | null;
  };
  private _context: CrawlContext | null;
  private cache: Map<string, CacheEntry>;
  private _httpClient: HttpClient | null;

  private reckerAvailable: boolean | null = null;
  private parseLlmsTxt: ReckerParseLlmsTxt | null = null;
  private validateLlmsTxt: ReckerValidateLlmsTxt | null = null;
  private fetchAndValidateLlmsTxt: ReckerFetchAndValidateLlmsTxt | null = null;
  private generateLlmsTxtTemplate: ReckerGenerateLlmsTxtTemplate | null = null;

  constructor(config: LlmsTxtValidatorConfig = {}) {
    this.config = {
      userAgent: config.userAgent || 's3db-spider',
      fetchTimeout: config.fetchTimeout || 10000,
      cacheTimeout: config.cacheTimeout || 3600000,
      context: config.context || null
    };

    this._context = this.config.context;
    this.cache = new Map();
    this._httpClient = null;
  }

  private async _checkReckerAvailability(): Promise<boolean> {
    if (this.reckerAvailable !== null) {
      return this.reckerAvailable;
    }

    try {
      const llmsModule = await import('recker/seo/validators/llms-txt');
      this.parseLlmsTxt = llmsModule.parseLlmsTxt;
      this.validateLlmsTxt = llmsModule.validateLlmsTxt;
      this.fetchAndValidateLlmsTxt = llmsModule.fetchAndValidateLlmsTxt;
      this.generateLlmsTxtTemplate = llmsModule.generateLlmsTxtTemplate;
      this.reckerAvailable = true;
      return true;
    } catch {
      this.reckerAvailable = false;
      return false;
    }
  }

  private async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      const baseConfig = this._context
        ? this._context.getHttpClientConfig('https://example.com')
        : {
            headers: {
              'User-Agent': this.config.userAgent
            }
          };

      this._httpClient = await createHttpClient({
        ...baseConfig,
        timeout: this.config.fetchTimeout,
        retry: {
          maxAttempts: 2,
          delay: 500,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      }) as unknown as HttpClient;
    }
    return this._httpClient;
  }

  async check(domain: string): Promise<LlmsTxtCheckResult> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      return this._fallbackCheck(domain);
    }

    const normalizedDomain = domain.replace(/\/$/, '');
    const llmsUrl = `${normalizedDomain}/llms.txt`;

    const cached = this.cache.get(normalizedDomain);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return cached.result;
    }

    try {
      const fetchResult = await this.fetchAndValidateLlmsTxt!(llmsUrl, async (url) => {
        const client = await this._getHttpClient();
        const response = await client.get(url);

        if (this._context) {
          this._context.processResponse(
            response as unknown as Parameters<typeof this._context.processResponse>[0],
            url
          );
        }

        return {
          status: response.ok ? 200 : response.status,
          text: response.ok ? await response.text() : ''
        };
      });

      const result: LlmsTxtCheckResult = {
        exists: fetchResult.exists,
        valid: fetchResult.valid,
        status: fetchResult.status,
        fullVersionExists: fetchResult.fullVersionExists,
        siteName: fetchResult.parseResult.siteName,
        siteDescription: fetchResult.parseResult.siteDescription,
        sections: fetchResult.parseResult.sections,
        links: fetchResult.parseResult.links,
        issues: fetchResult.issues,
        errors: fetchResult.parseResult.errors,
        warnings: fetchResult.parseResult.warnings,
        size: fetchResult.parseResult.size
      };

      this.cache.set(normalizedDomain, { result, timestamp: Date.now() });

      return result;

    } catch (error) {
      return {
        exists: false,
        valid: false,
        sections: [],
        links: [],
        issues: [{
          type: 'error',
          code: 'FETCH_ERROR',
          message: `Failed to fetch llms.txt: ${(error as Error).message}`
        }],
        errors: [(error as Error).message],
        warnings: []
      };
    }
  }

  private async _fallbackCheck(domain: string): Promise<LlmsTxtCheckResult> {
    const normalizedDomain = domain.replace(/\/$/, '');
    const llmsUrl = `${normalizedDomain}/llms.txt`;

    try {
      const client = await this._getHttpClient();
      const response = await client.get(llmsUrl);

      if (!response.ok) {
        return {
          exists: false,
          valid: false,
          status: response.status,
          sections: [],
          links: [],
          issues: [{
            type: 'info',
            code: 'NOT_FOUND',
            message: 'llms.txt file not found',
            recommendation: 'Consider adding an llms.txt file for AI SEO'
          }],
          errors: [],
          warnings: []
        };
      }

      const content = await response.text();
      const parsed = this._simpleParse(content);

      return {
        exists: true,
        valid: parsed.sections.length > 0 || !!parsed.siteName,
        status: 200,
        siteName: parsed.siteName,
        siteDescription: parsed.siteDescription,
        sections: parsed.sections,
        links: parsed.links,
        issues: [],
        errors: [],
        warnings: ['Recker not available - using basic parsing'],
        size: content.length
      };

    } catch (error) {
      return {
        exists: false,
        valid: false,
        sections: [],
        links: [],
        issues: [],
        errors: [(error as Error).message],
        warnings: []
      };
    }
  }

  private _simpleParse(content: string): {
    siteName?: string;
    siteDescription?: string;
    sections: LlmsTxtSection[];
    links: LlmsTxtLink[];
  } {
    const lines = content.split(/\r?\n/);
    const sections: LlmsTxtSection[] = [];
    const links: LlmsTxtLink[] = [];
    let siteName: string | undefined;
    let siteDescription: string | undefined;
    let currentSection: LlmsTxtSection | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('# ') && !siteName) {
        siteName = trimmed.slice(2).trim();
        continue;
      }

      if (trimmed.startsWith('>') && !siteDescription) {
        siteDescription = trimmed.slice(1).trim();
        continue;
      }

      if (trimmed.startsWith('## ')) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: trimmed.slice(3).trim(),
          content: '',
          links: []
        };
        continue;
      }

      const linkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)(?:\s*-\s*(.+))?$/);
      if (linkMatch) {
        const link: LlmsTxtLink = {
          text: linkMatch[1]!,
          url: linkMatch[2]!,
          description: linkMatch[3]?.trim(),
          section: currentSection?.title
        };
        links.push(link);
        if (currentSection) {
          currentSection.links.push(link);
        }
        continue;
      }

      if (currentSection && trimmed) {
        currentSection.content += (currentSection.content ? '\n' : '') + trimmed;
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return { siteName, siteDescription, sections, links };
  }

  async validate(domain: string): Promise<LlmsTxtValidationResult | null> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable) {
      return null;
    }

    const checkResult = await this.check(domain);

    if (!checkResult.exists) {
      return null;
    }

    const normalizedDomain = domain.replace(/\/$/, '');
    const llmsUrl = `${normalizedDomain}/llms.txt`;

    try {
      const client = await this._getHttpClient();
      const response = await client.get(llmsUrl);
      const content = await response.text();

      return this.validateLlmsTxt!(content, normalizedDomain);
    } catch {
      return null;
    }
  }

  validateContent(content: string, baseUrl?: string): LlmsTxtValidationResult | null {
    if (!this.reckerAvailable || !this.validateLlmsTxt) {
      return null;
    }

    return this.validateLlmsTxt(content, baseUrl);
  }

  parseContent(content: string): LlmsTxtParseResult | null {
    if (!this.reckerAvailable || !this.parseLlmsTxt) {
      return null;
    }

    return this.parseLlmsTxt(content);
  }

  generateTemplate(options: LlmsTxtTemplateOptions): string | null {
    if (!this.reckerAvailable || !this.generateLlmsTxtTemplate) {
      return this._fallbackGenerateTemplate(options);
    }

    return this.generateLlmsTxtTemplate(options);
  }

  private _fallbackGenerateTemplate(options: LlmsTxtTemplateOptions): string {
    const lines: string[] = [];

    lines.push(`# ${options.siteName}`);
    lines.push('');
    lines.push(`> ${options.siteDescription}`);
    lines.push('');

    if (options.sections) {
      for (const section of options.sections) {
        lines.push(`## ${section.title}`);
        lines.push('');
        for (const link of section.links) {
          if (link.description) {
            lines.push(`[${link.text}](${link.url}) - ${link.description}`);
          } else {
            lines.push(`[${link.text}](${link.url})`);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  async checkFullVersion(domain: string): Promise<{
    exists: boolean;
    status?: number;
    size?: number;
  }> {
    const normalizedDomain = domain.replace(/\/$/, '');
    const llmsFullUrl = `${normalizedDomain}/llms-full.txt`;

    try {
      const client = await this._getHttpClient();
      const response = await client.get(llmsFullUrl);

      if (!response.ok) {
        return { exists: false, status: response.status };
      }

      const content = await response.text();
      return {
        exists: true,
        status: 200,
        size: content.length
      };
    } catch {
      return { exists: false };
    }
  }

  async getLinks(domain: string): Promise<LlmsTxtLink[]> {
    const result = await this.check(domain);
    return result.links;
  }

  async getSections(domain: string): Promise<LlmsTxtSection[]> {
    const result = await this.check(domain);
    return result.sections;
  }

  clearCache(domain?: string): void {
    if (domain) {
      const normalizedDomain = domain.replace(/\/$/, '');
      this.cache.delete(normalizedDomain);
    } else {
      this.cache.clear();
    }
  }

  getCacheStats(): { size: number; domains: string[] } {
    return {
      size: this.cache.size,
      domains: [...this.cache.keys()]
    };
  }

  isReckerEnabled(): boolean {
    return this.reckerAvailable === true;
  }
}

export default ReckerLlmsTxtValidator;
