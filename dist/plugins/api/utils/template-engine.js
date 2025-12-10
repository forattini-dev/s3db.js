import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
async function loadEJS() {
    try {
        const ejs = await import('ejs');
        return (ejs.default || ejs);
    }
    catch {
        throw new Error('EJS template engine not installed. Install with: npm install ejs\n' +
            'EJS is a peer dependency to keep the core package lightweight.');
    }
}
async function loadPug() {
    try {
        const pug = await import('pug');
        return (pug.default || pug);
    }
    catch {
        throw new Error('Pug template engine not installed. Install with: npm install pug\n' +
            'Pug is a peer dependency to keep the core package lightweight.');
    }
}
export function setupTemplateEngine(options = {}) {
    const { engine = 'jsx', templatesDir = './views', layout = null, engineOptions = {}, customRenderer = null } = options;
    const templatesPath = resolve(templatesDir);
    return async (c, next) => {
        const contextWithRender = c;
        contextWithRender.render = async (template, data = {}, renderOptions = {}) => {
            if (typeof template === 'object' && template !== null) {
                return c.html(template);
            }
            if (engine === 'pug') {
                const pug = await loadPug();
                const templateFile = template.endsWith('.pug') ? template : `${template}.pug`;
                const templatePath = join(templatesPath, templateFile);
                if (!existsSync(templatePath)) {
                    throw new Error(`Template not found: ${templatePath}`);
                }
                const renderData = {
                    ...data,
                    _url: c.req.url,
                    _path: c.req.path,
                    _method: c.req.method
                };
                const html = pug.renderFile(templatePath, {
                    ...renderData,
                    ...engineOptions,
                    ...renderOptions
                });
                return c.html(html);
            }
            if (engine === 'ejs') {
                const ejs = await loadEJS();
                const templateFile = template.endsWith('.ejs') ? template : `${template}.ejs`;
                const templatePath = join(templatesPath, templateFile);
                if (!existsSync(templatePath)) {
                    throw new Error(`Template not found: ${templatePath}`);
                }
                const templateContent = await readFile(templatePath, 'utf-8');
                const renderData = {
                    ...data,
                    _url: c.req.url,
                    _path: c.req.path,
                    _method: c.req.method
                };
                const html = ejs.render(templateContent, renderData, {
                    filename: templatePath,
                    ...engineOptions,
                    ...renderOptions
                });
                if (layout || renderOptions.layout) {
                    const layoutName = renderOptions.layout || layout;
                    const layoutFile = layoutName.endsWith('.ejs') ? layoutName : `${layoutName}.ejs`;
                    const layoutPath = join(templatesPath, layoutFile);
                    if (!existsSync(layoutPath)) {
                        throw new Error(`Layout not found: ${layoutPath}`);
                    }
                    const layoutContent = await readFile(layoutPath, 'utf-8');
                    const wrappedHtml = ejs.render(layoutContent, {
                        ...renderData,
                        body: html
                    }, {
                        filename: layoutPath,
                        ...engineOptions
                    });
                    return c.html(wrappedHtml);
                }
                return c.html(html);
            }
            if (engine === 'custom' && customRenderer) {
                return customRenderer(c, template, data, renderOptions);
            }
            throw new Error(`Unsupported template engine: ${engine}`);
        };
        await next();
    };
}
export function ejsEngine(templatesDir, options = {}) {
    return setupTemplateEngine({
        engine: 'ejs',
        templatesDir,
        ...options
    });
}
export function pugEngine(templatesDir, options = {}) {
    return setupTemplateEngine({
        engine: 'pug',
        templatesDir,
        ...options
    });
}
export function jsxEngine() {
    return async (c, next) => {
        const contextWithRender = c;
        contextWithRender.render = async (template) => {
            if (typeof template === 'object' && template !== null) {
                return c.html(template);
            }
            throw new Error('JSX engine requires JSX element, not string template name');
        };
        await next();
    };
}
export default {
    setupTemplateEngine,
    ejsEngine,
    pugEngine,
    jsxEngine
};
//# sourceMappingURL=template-engine.js.map