import { TemplateError } from './errors.js';

export interface SMTPTemplateEngineOptions {
  type?: 'handlebars' | CustomTemplateFunction;
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

interface AsyncPlaceholder {
  placeholder: string;
  promise: Promise<unknown>;
}

interface YamlMetadata {
  subject?: string;
  html?: string;
  [key: string]: unknown;
}

type CompiledTemplate = (data: Record<string, unknown>) => string;

export class SMTPTemplateEngine {
  public options: SMTPTemplateEngineOptions;
  public type: 'handlebars' | CustomTemplateFunction;
  public templateDir: string | null;
  public cacheTemplates: boolean;
  public helpers: Record<string, HelperFunction>;
  public partials: Record<string, string>;
  private _templateCache: Map<string, CompiledTemplate>;
  private _pendingAsyncHelpers: AsyncPlaceholder[];
  private _asyncPlaceholderIndex: number;

  constructor(options: SMTPTemplateEngineOptions = {}) {
    this.options = options;
    this.type = options.type || 'handlebars';
    this.templateDir = options.templateDir || null;
    this.cacheTemplates = options.cacheTemplates !== false;
    this.helpers = options.helpers || {};
    this.partials = options.partials || {};
    this._templateCache = new Map();
    this._pendingAsyncHelpers = [];
    this._asyncPlaceholderIndex = 0;
  }

  async render(
    templateName: string | CustomTemplateFunction,
    data: Record<string, unknown> = {},
    options: RenderOptions = {}
  ): Promise<RenderedOutput> {
    try {
      if (this.type === 'handlebars') {
        return await this._renderHandlebars(templateName as string, data, options);
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

  private async _renderHandlebars(
    templateName: string,
    data: Record<string, unknown> = {},
    _options: RenderOptions = {}
  ): Promise<RenderedOutput> {
    try {
      const Handlebars = await import('handlebars');
      const hbs = Handlebars.default;

      for (const [name, fn] of Object.entries(this.helpers)) {
        hbs.registerHelper(name, this._wrapHelper(fn));
      }

      for (const [name, partial] of Object.entries(this.partials)) {
        hbs.registerPartial(name, partial);
      }

      let template: CompiledTemplate;
      const cacheKey = `hbs:${templateName}`;

      if (this.cacheTemplates && this._templateCache.has(cacheKey)) {
        template = this._templateCache.get(cacheKey)!;
      } else {
        const templateSource = await this._loadTemplate(templateName);

        try {
          template = hbs.compile(templateSource, {
            strict: false,
            noEscape: false,
            preventIndent: false
          });

          if (this.cacheTemplates) {
            this._templateCache.set(cacheKey, template);
          }
        } catch (err) {
          const error = err as Error & { line?: number; column?: number };
          throw new TemplateError(`Handlebars compilation error: ${error.message}`, {
            originalError: error,
            template: templateName,
            line: error.line,
            column: error.column,
            suggestion: 'Check template syntax for invalid expressions'
          });
        }
      }

      try {
        const rendered = template(data);
        const finalOutput = await this._resolveAsyncPlaceholders(rendered);
        return this._parseRenderedOutput(finalOutput);
      } catch (err) {
        const error = err as Error;
        if (typeof error?.message === 'string' && error.message.toLowerCase().includes('parse error')) {
          throw new TemplateError(`Handlebars compilation error: ${error.message}`, {
            originalError: error,
            template: templateName
          });
        }
        throw new TemplateError(`Handlebars render error: ${error.message}`, {
          originalError: error,
          template: templateName,
          suggestion: 'Check that all template variables are provided in data'
        });
      } finally {
        this._pendingAsyncHelpers = [];
      }
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      const error = err as Error & { code?: string };
      if (typeof error?.message === 'string' && error.message.toLowerCase().includes('parse error')) {
        throw new TemplateError(`Handlebars compilation error: ${error.message}`, {
          originalError: error,
          template: templateName
        });
      }
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new TemplateError('Handlebars library not installed', {
          suggestion: 'npm install handlebars'
        });
      }
      throw new TemplateError(`Handlebars error: ${error.message}`, {
        originalError: error,
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

  private _wrapHelper(fn: HelperFunction): HelperFunction {
    return (...args: unknown[]) => {
      try {
        const result = fn(...args);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          const placeholder = `__S3DB_TMPL_ASYNC_${this._asyncPlaceholderIndex++}__`;
          this._pendingAsyncHelpers.push({
            placeholder,
            promise: Promise.resolve(result)
          });
          return placeholder;
        }
        return result;
      } catch (err) {
        throw err;
      }
    };
  }

  private async _resolveAsyncPlaceholders(rendered: string): Promise<string> {
    if (typeof rendered !== 'string' || this._pendingAsyncHelpers.length === 0) {
      return rendered;
    }

    let finalOutput = rendered;
    for (const { placeholder, promise } of this._pendingAsyncHelpers) {
      try {
        const value = await promise;
        const replacement = value == null ? '' : String(value);
        finalOutput = finalOutput.split(placeholder).join(replacement);
      } catch (err) {
        throw new TemplateError(`Async helper error: ${(err as Error).message}`, {
          originalError: err as Error
        });
      }
    }

    return finalOutput;
  }

  registerHelper(name: string, fn: HelperFunction): void {
    this.helpers[name] = fn;
  }

  registerPartial(name: string, template: string): void {
    this.partials[name] = template;
    if (this.type === 'handlebars') {
      for (const key of this._templateCache.keys()) {
        if (key.startsWith('hbs:')) {
          this._templateCache.delete(key);
        }
      }
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

      if (this.type === 'handlebars') {
        const Handlebars = await import('handlebars');
        const compiled = Handlebars.default.compile(source, {
          strict: false
        });
        compiled({});
        return true;
      }

      return true;
    } catch (_err) {
      return false;
    }
  }
}

export interface HandlebarsOptions {
  hash: Record<string, unknown>;
}

export const defaultHandlebarsHelpers: Record<string, HelperFunction> = {
  formatDate: (date: unknown, options: HandlebarsOptions): string => {
    const format = (options.hash.format as string) || 'YYYY-MM-DD';
    if (!date) return '';

    const d = new Date(date as string | number | Date);
    const year = String(d.getFullYear());
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    const second = String(d.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hour)
      .replace('mm', minute)
      .replace('ss', second);
  },

  uppercase: (str: unknown): string => (str ? String(str).toUpperCase() : ''),

  lowercase: (str: unknown): string => (str ? String(str).toLowerCase() : ''),

  titlecase: (str: unknown): string => {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  eq: (a: unknown, b: unknown): boolean => a === b,

  default: (value: unknown, fallback: unknown): unknown => (value ? value : fallback),

  pluralize: (count: number, singular: string, plural: string): string => {
    return count === 1 ? singular : plural;
  },

  truncate: (text: unknown, options: HandlebarsOptions): string => {
    const length = (options.hash.length as number) || 100;
    const str = String(text || '');
    if (!str || str.length <= length) return str;
    return str.substring(0, length) + '...';
  },

  currency: (amount: unknown, options: HandlebarsOptions): string => {
    const locale = (options.hash.locale as string) || 'en-US';
    const currency = (options.hash.currency as string) || 'USD';

    if (amount == null) return '';

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency
      }).format(amount as number);
    } catch (_err) {
      return `${currency} ${amount}`;
    }
  },

  json: (obj: unknown): string => JSON.stringify(obj, null, 2),

  range: function(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i + 1);
  }
};
