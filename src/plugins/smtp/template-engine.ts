import { TemplateEngine as ReckerTemplateEngine } from 'recker';
import { TemplateError } from './errors.js';

export interface SMTPTemplateEngineOptions {
  type?: 'recker' | 'handlebars' | CustomTemplateFunction;
  templateDir?: string | null;
  cacheTemplates?: boolean;
  helpers?: Record<string, HelperFunction>;
  partials?: Record<string, string>;
}

export type HelperFunction = ((...args: any[]) => any);
export type CustomTemplateFunction = (
  data: Record<string, unknown>,
  helpers: Record<string, HelperFunction>,
  partials: Record<string, string>
) => string | RenderedOutput | Promise<string | RenderedOutput>;

export interface RenderedOutput {
  subject?: string;
  body?: string;
  html?: string;
}

export interface RenderOptions {
  [key: string]: unknown;
}

export interface CacheStats {
  cacheSize: number;
  entries: string[];
}

interface YamlMetadata {
  subject?: string;
  html?: string;
  [key: string]: unknown;
}

export class SMTPTemplateEngine {
  public options: SMTPTemplateEngineOptions;
  public type: 'recker' | 'handlebars' | CustomTemplateFunction;
  public templateDir: string | null;
  public cacheTemplates: boolean;
  public helpers: Record<string, HelperFunction>;
  public partials: Record<string, string>;
  private _templateCache: Map<string, string>;
  private _reckerEngine: ReckerTemplateEngine | null;

  constructor(options: SMTPTemplateEngineOptions = {}) {
    this.options = options;
    this.type = options.type || 'recker';
    if (this.type === 'handlebars') {
      this.type = 'recker';
    }
    this.templateDir = options.templateDir || null;
    this.cacheTemplates = options.cacheTemplates !== false;
    this.helpers = options.helpers || {};
    this.partials = options.partials || {};
    this._templateCache = new Map();
    this._reckerEngine = null;
  }

  async render(
    templateName: string | CustomTemplateFunction,
    data: Record<string, unknown> = {},
    options: RenderOptions = {}
  ): Promise<RenderedOutput> {
    try {
      if (this.type === 'recker') {
        return await this._renderRecker(templateName as string, data, options);
      } else if (typeof this.type === 'function') {
        return await this._renderCustom(templateName, data, options);
      } else {
        throw new TemplateError(`Unknown template type: ${this.type}`);
      }
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      throw new TemplateError(`Template rendering failed: ${(err as Error).message}`, {
        originalError: err as Error,
        template: String(templateName),
        suggestion: 'Check template syntax and variable names'
      });
    }
  }

  private _getReckerEngine(): ReckerTemplateEngine {
    if (this._reckerEngine) {
      return this._reckerEngine;
    }

    this._reckerEngine = new ReckerTemplateEngine();

    for (const [name, fn] of Object.entries(this.helpers)) {
      this._reckerEngine.registerHelper(name, fn);
    }

    for (const [name, partial] of Object.entries(this.partials)) {
      this._reckerEngine.registerPartial(name, partial);
    }

    return this._reckerEngine;
  }

  private async _renderRecker(
    templateName: string,
    data: Record<string, unknown> = {},
    _options: RenderOptions = {}
  ): Promise<RenderedOutput> {
    try {
      const engine = await this._getReckerEngine();
      const cacheKey = `recker:${templateName}`;

      let templateSource: string;
      if (this.cacheTemplates && this._templateCache.has(cacheKey)) {
        templateSource = this._templateCache.get(cacheKey)!;
      } else {
        templateSource = await this._loadTemplate(templateName);
        if (this.cacheTemplates) {
          this._templateCache.set(cacheKey, templateSource);
        }
      }

      try {
        const rendered = await engine.render(templateSource, data);
        return this._parseRenderedOutput(rendered);
      } catch (err) {
        const error = err as Error;
        throw new TemplateError(`Template render error: ${error.message}`, {
          originalError: error,
          template: templateName,
          suggestion: 'Check that all template variables are provided in data'
        });
      }
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      throw new TemplateError(`Recker error: ${(err as Error).message}`, {
        originalError: err as Error,
        template: templateName
      });
    }
  }

  private async _renderCustom(
    templateName: string | CustomTemplateFunction,
    data: Record<string, unknown> = {},
    _options: RenderOptions = {}
  ): Promise<RenderedOutput> {
    try {
      let templateFn: CustomTemplateFunction;

      if (typeof templateName === 'function') {
        templateFn = templateName;
      } else if (this.type && typeof this.type === 'function') {
        templateFn = this.type;
      } else {
        throw new TemplateError('Custom template function not provided', {
          suggestion: 'Pass templateFn as a function in options'
        });
      }

      const result = await templateFn(data, this.helpers, this.partials);

      if (typeof result !== 'string' && typeof result !== 'object') {
        throw new TemplateError('Custom template function must return string or object', {
          suggestion: 'Return { subject, body, html } or plain string for body'
        });
      }

      return this._parseRenderedOutput(result);
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      throw new TemplateError(`Custom template error: ${(err as Error).message}`, {
        originalError: err as Error,
        template: String(templateName)
      });
    }
  }

  private async _loadTemplate(templateName: string): Promise<string> {
    if (templateName.includes('\n') || templateName.includes('{{')) {
      return templateName;
    }

    if (this.templateDir) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filePath = path.join(this.templateDir, templateName);
        return await fs.readFile(filePath, 'utf8');
      } catch (err) {
        throw new TemplateError(`Failed to load template file: ${templateName}`, {
          originalError: err as Error,
          suggestion: 'Check that template file exists in templateDir'
        });
      }
    }

    return templateName;
  }

  private _parseRenderedOutput(rendered: string | RenderedOutput): RenderedOutput {
    if (typeof rendered === 'object' && rendered !== null) {
      return {
        subject: rendered.subject || 'No Subject',
        body: rendered.body || '',
        html: rendered.html || undefined
      };
    }

    if (typeof rendered === 'string') {
      const frontMatterMatch = rendered.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (frontMatterMatch) {
        const [, frontMatter, content] = frontMatterMatch;
        const metadata = this._parseYaml(frontMatter!);

        return {
          subject: metadata.subject || 'No Subject',
          body: content!.trim(),
          html: metadata.html || undefined
        };
      }

      return {
        subject: 'No Subject',
        body: rendered.trim(),
        html: undefined
      };
    }

    throw new TemplateError('Invalid rendered output format', {
      suggestion: 'Template must return string or { subject, body, html }'
    });
  }

  private _parseYaml(yaml: string): YamlMetadata {
    const result: YamlMetadata = {};
    const lines = yaml.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        if (value === 'true') result[key!] = true;
        else if (value === 'false') result[key!] = false;
        else if (!isNaN(Number(value))) result[key!] = Number(value);
        else result[key!] = value!.trim();
      }
    }

    return result;
  }

  registerHelper(name: string, fn: HelperFunction): void {
    this.helpers[name] = fn;
    if (this._reckerEngine) {
      this._reckerEngine.registerHelper(name, fn);
    }
  }

  registerPartial(name: string, template: string): void {
    this.partials[name] = template;
    if (this._reckerEngine) {
      this._reckerEngine.registerPartial(name, template);
    }
    for (const key of this._templateCache.keys()) {
      this._templateCache.delete(key);
    }
  }

  clearCache(): void {
    this._templateCache.clear();
  }

  getCacheStats(): CacheStats {
    return {
      cacheSize: this._templateCache.size,
      entries: Array.from(this._templateCache.keys())
    };
  }

  async precompile(templateName: string): Promise<boolean> {
    try {
      const source = await this._loadTemplate(templateName);
      const engine = this._getReckerEngine();
      await engine.render(source, {});
      return true;
    } catch (_err) {
      return false;
    }
  }
}
