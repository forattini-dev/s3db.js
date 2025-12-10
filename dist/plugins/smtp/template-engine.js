import { TemplateError } from './errors.js';
export class SMTPTemplateEngine {
    options;
    type;
    templateDir;
    cacheTemplates;
    helpers;
    partials;
    _templateCache;
    _pendingAsyncHelpers;
    _asyncPlaceholderIndex;
    constructor(options = {}) {
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
    async render(templateName, data = {}, options = {}) {
        try {
            if (this.type === 'handlebars') {
                return await this._renderHandlebars(templateName, data, options);
            }
            else if (typeof this.type === 'function') {
                return await this._renderCustom(templateName, data, options);
            }
            else {
                throw new TemplateError(`Unknown template type: ${this.type}`);
            }
        }
        catch (err) {
            if (err instanceof TemplateError)
                throw err;
            throw new TemplateError(`Template rendering failed: ${err.message}`, {
                originalError: err,
                template: String(templateName),
                suggestion: 'Check template syntax and variable names'
            });
        }
    }
    async _renderHandlebars(templateName, data = {}, _options = {}) {
        try {
            const Handlebars = await import('handlebars');
            const hbs = Handlebars.default;
            for (const [name, fn] of Object.entries(this.helpers)) {
                hbs.registerHelper(name, this._wrapHelper(fn));
            }
            for (const [name, partial] of Object.entries(this.partials)) {
                hbs.registerPartial(name, partial);
            }
            let template;
            const cacheKey = `hbs:${templateName}`;
            if (this.cacheTemplates && this._templateCache.has(cacheKey)) {
                template = this._templateCache.get(cacheKey);
            }
            else {
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
                }
                catch (err) {
                    const error = err;
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
            }
            catch (err) {
                const error = err;
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
            }
            finally {
                this._pendingAsyncHelpers = [];
            }
        }
        catch (err) {
            if (err instanceof TemplateError)
                throw err;
            const error = err;
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
    async _renderCustom(templateName, data = {}, _options = {}) {
        try {
            let templateFn;
            if (typeof templateName === 'function') {
                templateFn = templateName;
            }
            else if (this.type && typeof this.type === 'function') {
                templateFn = this.type;
            }
            else {
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
        }
        catch (err) {
            if (err instanceof TemplateError)
                throw err;
            throw new TemplateError(`Custom template error: ${err.message}`, {
                originalError: err,
                template: String(templateName)
            });
        }
    }
    async _loadTemplate(templateName) {
        if (templateName.includes('\n') || templateName.includes('{{')) {
            return templateName;
        }
        if (this.templateDir) {
            try {
                const fs = await import('fs/promises');
                const path = await import('path');
                const filePath = path.join(this.templateDir, templateName);
                return await fs.readFile(filePath, 'utf8');
            }
            catch (err) {
                throw new TemplateError(`Failed to load template file: ${templateName}`, {
                    originalError: err,
                    suggestion: 'Check that template file exists in templateDir'
                });
            }
        }
        return templateName;
    }
    _parseRenderedOutput(rendered) {
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
                const metadata = this._parseYaml(frontMatter);
                return {
                    subject: metadata.subject || 'No Subject',
                    body: content.trim(),
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
    _parseYaml(yaml) {
        const result = {};
        const lines = yaml.trim().split('\n');
        for (const line of lines) {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                const [, key, value] = match;
                if (value === 'true')
                    result[key] = true;
                else if (value === 'false')
                    result[key] = false;
                else if (!isNaN(Number(value)))
                    result[key] = Number(value);
                else
                    result[key] = value.trim();
            }
        }
        return result;
    }
    _wrapHelper(fn) {
        return (...args) => {
            try {
                const result = fn(...args);
                if (result && typeof result.then === 'function') {
                    const placeholder = `__S3DB_TMPL_ASYNC_${this._asyncPlaceholderIndex++}__`;
                    this._pendingAsyncHelpers.push({
                        placeholder,
                        promise: Promise.resolve(result)
                    });
                    return placeholder;
                }
                return result;
            }
            catch (err) {
                throw err;
            }
        };
    }
    async _resolveAsyncPlaceholders(rendered) {
        if (typeof rendered !== 'string' || this._pendingAsyncHelpers.length === 0) {
            return rendered;
        }
        let finalOutput = rendered;
        for (const { placeholder, promise } of this._pendingAsyncHelpers) {
            try {
                const value = await promise;
                const replacement = value == null ? '' : String(value);
                finalOutput = finalOutput.split(placeholder).join(replacement);
            }
            catch (err) {
                throw new TemplateError(`Async helper error: ${err.message}`, {
                    originalError: err
                });
            }
        }
        return finalOutput;
    }
    registerHelper(name, fn) {
        this.helpers[name] = fn;
    }
    registerPartial(name, template) {
        this.partials[name] = template;
        if (this.type === 'handlebars') {
            for (const key of this._templateCache.keys()) {
                if (key.startsWith('hbs:')) {
                    this._templateCache.delete(key);
                }
            }
        }
    }
    clearCache() {
        this._templateCache.clear();
    }
    getCacheStats() {
        return {
            cacheSize: this._templateCache.size,
            entries: Array.from(this._templateCache.keys())
        };
    }
    async precompile(templateName) {
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
        }
        catch (_err) {
            return false;
        }
    }
}
export const defaultHandlebarsHelpers = {
    formatDate: (date, options) => {
        const format = options.hash.format || 'YYYY-MM-DD';
        if (!date)
            return '';
        const d = new Date(date);
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
    uppercase: (str) => (str ? String(str).toUpperCase() : ''),
    lowercase: (str) => (str ? String(str).toLowerCase() : ''),
    titlecase: (str) => {
        if (!str)
            return '';
        return String(str)
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    },
    eq: (a, b) => a === b,
    default: (value, fallback) => (value ? value : fallback),
    pluralize: (count, singular, plural) => {
        return count === 1 ? singular : plural;
    },
    truncate: (text, options) => {
        const length = options.hash.length || 100;
        const str = String(text || '');
        if (!str || str.length <= length)
            return str;
        return str.substring(0, length) + '...';
    },
    currency: (amount, options) => {
        const locale = options.hash.locale || 'en-US';
        const currency = options.hash.currency || 'USD';
        if (amount == null)
            return '';
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency
            }).format(amount);
        }
        catch (_err) {
            return `${currency} ${amount}`;
        }
    },
    json: (obj) => JSON.stringify(obj, null, 2),
    range: function (n) {
        return Array.from({ length: n }, (_, i) => i + 1);
    }
};
//# sourceMappingURL=template-engine.js.map