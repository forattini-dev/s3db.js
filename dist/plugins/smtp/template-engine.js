import { TemplateError } from './errors.js';
// Dynamic import for TemplateEngine since it may not be exported in all recker versions
let ReckerTemplateEngine = null;
async function getReckerTemplateEngine() {
    if (ReckerTemplateEngine === null) {
        try {
            const recker = await import('recker');
            ReckerTemplateEngine = recker.TemplateEngine || null;
        }
        catch {
            ReckerTemplateEngine = undefined;
        }
    }
    return ReckerTemplateEngine;
}
export class SMTPTemplateEngine {
    options;
    type;
    templateDir;
    cacheTemplates;
    helpers;
    partials;
    _templateCache;
    _reckerEngine;
    constructor(options = {}) {
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
    async render(templateName, data = {}, options = {}) {
        try {
            if (this.type === 'recker') {
                return await this._renderRecker(templateName, data, options);
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
    async _getReckerEngine() {
        if (this._reckerEngine) {
            return this._reckerEngine;
        }
        const TemplateEngineClass = await getReckerTemplateEngine();
        if (!TemplateEngineClass) {
            throw new TemplateError('TemplateEngine is not available in the installed recker version');
        }
        this._reckerEngine = new TemplateEngineClass();
        for (const [name, fn] of Object.entries(this.helpers)) {
            this._reckerEngine.registerHelper(name, fn);
        }
        for (const [name, partial] of Object.entries(this.partials)) {
            this._reckerEngine.registerPartial(name, partial);
        }
        return this._reckerEngine;
    }
    async _renderRecker(templateName, data = {}, _options = {}) {
        try {
            const engine = await this._getReckerEngine();
            const cacheKey = `recker:${templateName}`;
            let templateSource;
            if (this.cacheTemplates && this._templateCache.has(cacheKey)) {
                templateSource = this._templateCache.get(cacheKey);
            }
            else {
                templateSource = await this._loadTemplate(templateName);
                if (this.cacheTemplates) {
                    this._templateCache.set(cacheKey, templateSource);
                }
            }
            try {
                const rendered = await engine.render(templateSource, data);
                return this._parseRenderedOutput(rendered);
            }
            catch (err) {
                const error = err;
                throw new TemplateError(`Template render error: ${error.message}`, {
                    originalError: error,
                    template: templateName,
                    suggestion: 'Check that all template variables are provided in data'
                });
            }
        }
        catch (err) {
            if (err instanceof TemplateError)
                throw err;
            throw new TemplateError(`Recker error: ${err.message}`, {
                originalError: err,
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
    registerHelper(name, fn) {
        this.helpers[name] = fn;
        if (this._reckerEngine) {
            this._reckerEngine.registerHelper(name, fn);
        }
    }
    registerPartial(name, template) {
        this.partials[name] = template;
        if (this._reckerEngine) {
            this._reckerEngine.registerPartial(name, template);
        }
        for (const key of this._templateCache.keys()) {
            this._templateCache.delete(key);
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
            const engine = await this._getReckerEngine();
            await engine.render(source, {});
            return true;
        }
        catch (_err) {
            return false;
        }
    }
}
//# sourceMappingURL=template-engine.js.map