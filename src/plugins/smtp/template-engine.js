import { TemplateError } from './errors.js';

/**
 * SMTPTemplateEngine - Template rendering for emails
 *
 * Supports:
 * - Handlebars templates (with custom helpers)
 * - Custom template functions
 * - Template caching for performance
 * - Error reporting with line numbers
 */
export class SMTPTemplateEngine {
  constructor(options = {}) {
    this.options = options;
    this.type = options.type || 'handlebars'; // 'handlebars' or 'custom'
    this.templateDir = options.templateDir || null;
    this.cacheTemplates = options.cacheTemplates !== false; // Cache by default
    this.helpers = options.helpers || {};
    this.partials = options.partials || {};

    // Template cache
    this._templateCache = new Map();
  }

  /**
   * Render a template with data
   *
   * @param {string} templateName - Name/path or inline template
   * @param {Object} data - Template variables
   * @param {Object} options - Render options
   * @returns {Object} { subject, body, html }
   */
  async render(templateName, data = {}, options = {}) {
    try {
      if (this.type === 'handlebars') {
        return await this._renderHandlebars(templateName, data, options);
      } else if (typeof this.type === 'function') {
        return await this._renderCustom(templateName, data, options);
      } else {
        throw new TemplateError(`Unknown template type: ${this.type}`);
      }
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      throw new TemplateError(`Template rendering failed: ${err.message}`, {
        originalError: err,
        template: templateName,
        suggestion: 'Check template syntax and variable names'
      });
    }
  }

  /**
   * Render Handlebars template
   * @private
   */
  async _renderHandlebars(templateName, data = {}, options = {}) {
    try {
      const Handlebars = await import('handlebars');
      const hbs = Handlebars.default;

      // Register custom helpers
      for (const [name, fn] of Object.entries(this.helpers)) {
        hbs.registerHelper(name, fn);
      }

      // Register partials
      for (const [name, partial] of Object.entries(this.partials)) {
        hbs.registerPartial(name, partial);
      }

      // Check cache first
      let template;
      const cacheKey = `hbs:${templateName}`;

      if (this.cacheTemplates && this._templateCache.has(cacheKey)) {
        template = this._templateCache.get(cacheKey);
      } else {
        // Load template (either from file or inline)
        const templateSource = await this._loadTemplate(templateName);

        // Compile template
        try {
          template = hbs.compile(templateSource, {
            strict: true,
            noEscape: false,
            preventIndent: false
          });

          // Cache for next time
          if (this.cacheTemplates) {
            this._templateCache.set(cacheKey, template);
          }
        } catch (err) {
          throw new TemplateError(`Handlebars compilation error: ${err.message}`, {
            originalError: err,
            template: templateName,
            line: err.line,
            column: err.column,
            suggestion: 'Check template syntax for invalid expressions'
          });
        }
      }

      // Render template with data
      try {
        const rendered = template(data);

        // Parse rendered output (subject, body, html)
        return this._parseRenderedOutput(rendered);
      } catch (err) {
        throw new TemplateError(`Handlebars render error: ${err.message}`, {
          originalError: err,
          template: templateName,
          suggestion: 'Check that all template variables are provided in data'
        });
      }
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new TemplateError('Handlebars library not installed', {
          suggestion: 'npm install handlebars'
        });
      }
      throw new TemplateError(`Handlebars error: ${err.message}`, {
        originalError: err,
        template: templateName
      });
    }
  }

  /**
   * Render custom function template
   * @private
   */
  async _renderCustom(templateName, data = {}, options = {}) {
    try {
      // templateName should be a function reference or expression
      let templateFn;

      if (typeof templateName === 'function') {
        templateFn = templateName;
      } else if (this.type && typeof this.type === 'function') {
        templateFn = this.type;
      } else {
        throw new TemplateError('Custom template function not provided', {
          suggestion: 'Pass templateFn as a function in options'
        });
      }

      // Execute template function
      const result = await templateFn(data, this.helpers, this.partials);

      // Validate result
      if (typeof result !== 'string' && typeof result !== 'object') {
        throw new TemplateError('Custom template function must return string or object', {
          suggestion: 'Return { subject, body, html } or plain string for body'
        });
      }

      return this._parseRenderedOutput(result);
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      throw new TemplateError(`Custom template error: ${err.message}`, {
        originalError: err,
        template: templateName
      });
    }
  }

  /**
   * Load template from file or return inline
   * @private
   */
  async _loadTemplate(templateName) {
    // If already contains newlines or templates tags, treat as inline
    if (templateName.includes('\n') || templateName.includes('{{')) {
      return templateName;
    }

    // Otherwise, try to load from file
    if (this.templateDir) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filePath = path.join(this.templateDir, templateName);
        return await fs.readFile(filePath, 'utf8');
      } catch (err) {
        throw new TemplateError(`Failed to load template file: ${templateName}`, {
          originalError: err,
          suggestion: 'Check that template file exists in templateDir'
        });
      }
    }

    // Return as-is if no directory
    return templateName;
  }

  /**
   * Parse rendered output into subject, body, html
   * Supports multiple formats:
   * - Plain string → used as body
   * - Object with subject/body/html
   * - YAML front matter (subject, html)
   * @private
   */
  _parseRenderedOutput(rendered) {
    // If already an object, return as-is
    if (typeof rendered === 'object' && rendered !== null) {
      return {
        subject: rendered.subject || 'No Subject',
        body: rendered.body || '',
        html: rendered.html || undefined
      };
    }

    // If plain string, parse for front matter or use as body
    if (typeof rendered === 'string') {
      // Check for YAML front matter (---subject: Title---)
      const frontMatterMatch = rendered.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (frontMatterMatch) {
        const [, frontMatter, content] = frontMatterMatch;
        const metadata = this._parseYaml(frontMatter);

        return {
          subject: metadata.subject || 'No Subject',
          body: content.trim(),
          html: metadata.html || undefined
        };
      }

      // Otherwise, entire output is body
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

  /**
   * Simple YAML parser for front matter
   * @private
   */
  _parseYaml(yaml) {
    const result = {};
    const lines = yaml.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        // Simple value parsing (no nested objects)
        if (value === 'true') result[key] = true;
        else if (value === 'false') result[key] = false;
        else if (!isNaN(value)) result[key] = Number(value);
        else result[key] = value.trim();
      }
    }

    return result;
  }

  /**
   * Register a custom helper function
   */
  registerHelper(name, fn) {
    this.helpers[name] = fn;
  }

  /**
   * Register a partial template
   */
  registerPartial(name, template) {
    this.partials[name] = template;
    // Invalidate cache if using Handlebars
    if (this.type === 'handlebars') {
      for (const key of this._templateCache.keys()) {
        if (key.startsWith('hbs:')) {
          this._templateCache.delete(key);
        }
      }
    }
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this._templateCache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      cacheSize: this._templateCache.size,
      entries: Array.from(this._templateCache.keys())
    };
  }

  /**
   * Precompile template
   */
  async precompile(templateName) {
    try {
      const source = await this._loadTemplate(templateName);

      if (this.type === 'handlebars') {
        const Handlebars = await import('handlebars');
        Handlebars.default.compile(source);
        return true;
      }

      return true;
    } catch (err) {
      return false;
    }
  }
}

/**
 * Built-in Handlebars helpers
 */
export const defaultHandlebarsHelpers = {
  /**
   * Format date
   * @example {{formatDate createdAt format="YYYY-MM-DD"}}
   */
  formatDate: (date, options) => {
    const format = options.hash.format || 'YYYY-MM-DD';
    if (!date) return '';

    const d = new Date(date);
    const year = d.getFullYear();
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

  /**
   * Uppercase string
   * @example {{uppercase name}}
   */
  uppercase: (str) => (str ? String(str).toUpperCase() : ''),

  /**
   * Lowercase string
   * @example {{lowercase name}}
   */
  lowercase: (str) => (str ? String(str).toLowerCase() : ''),

  /**
   * Titlecase string
   * @example {{titlecase name}}
   */
  titlecase: (str) => {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Conditional comparison
   * @example {{#if (eq status "active")}}Active{{/if}}
   */
  eq: (a, b) => a === b,

  /**
   * Default value
   * @example {{default value "N/A"}}
   */
  default: (value, fallback) => (value ? value : fallback),

  /**
   * Pluralize
   * @example {{pluralize count "item" "items"}}
   */
  pluralize: (count, singular, plural) => {
    return count === 1 ? singular : plural;
  },

  /**
   * Truncate string
   * @example {{truncate text length=50}}
   */
  truncate: (text, options) => {
    const length = options.hash.length || 100;
    if (!text || text.length <= length) return text;
    return text.substring(0, length) + '...';
  },

  /**
   * Currency formatting
   * @example {{currency price}}
   */
  currency: (amount, options) => {
    const locale = options.hash.locale || 'en-US';
    const currency = options.hash.currency || 'USD';

    if (!amount && amount !== 0) return '';

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency
      }).format(amount);
    } catch (err) {
      return `${currency} ${amount}`;
    }
  },

  /**
   * JSON stringify (for embedded data)
   * @example {{json data}}
   */
  json: (obj) => JSON.stringify(obj, null, 2),

  /**
   * Repeat block
   * @example {{#each (range 5)}}Item {{this}}{{/each}}
   */
  range: function(n) {
    return Array.from({ length: n }, (_, i) => i + 1);
  }
};
