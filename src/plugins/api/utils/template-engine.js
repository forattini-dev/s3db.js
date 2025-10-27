/**
 * Template Engine Support for API Plugin
 *
 * Provides c.render() helper that works with multiple template engines:
 * - EJS (for mrt-shortner compatibility)
 * - JSX (Hono native)
 * - Custom engines via setRenderer()
 *
 * @example
 * // EJS usage
 * app.use('*', setupTemplateEngine({
 *   engine: 'ejs',
 *   templatesDir: './views',
 *   layout: 'layouts/main'
 * }));
 *
 * app.get('/page', async (c) => {
 *   return c.render('landing', { urlCount: 1000 });
 * });
 *
 * @example
 * // JSX usage (no setup needed)
 * app.get('/page', (c) => {
 *   return c.render(<h1>Hello</h1>);
 * });
 */

import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

/**
 * Lazy-load EJS (peer dependency)
 * @returns {Promise<Object>} EJS module
 */
async function loadEJS() {
  try {
    const ejs = await import('ejs');
    return ejs.default || ejs;
  } catch (err) {
    throw new Error(
      'EJS template engine not installed. Install with: npm install ejs\n' +
      'EJS is a peer dependency to keep the core package lightweight.'
    );
  }
}

/**
 * Setup template engine middleware
 * @param {Object} options - Template engine options
 * @param {string} options.engine - Engine name: 'ejs', 'jsx', 'custom'
 * @param {string} options.templatesDir - Directory containing templates (required for EJS)
 * @param {string} options.layout - Default layout template (optional for EJS)
 * @param {Object} options.engineOptions - Additional engine-specific options
 * @param {Function} options.customRenderer - Custom render function (for 'custom' engine)
 * @returns {Function} Hono middleware
 */
export function setupTemplateEngine(options = {}) {
  const {
    engine = 'jsx',
    templatesDir = './views',
    layout = null,
    engineOptions = {},
    customRenderer = null
  } = options;

  // Resolve templates directory
  const templatesPath = resolve(templatesDir);

  return async (c, next) => {
    /**
     * Render template with data
     * @param {string|JSX.Element} template - Template name (for EJS) or JSX element
     * @param {Object} data - Data to pass to template
     * @param {Object} renderOptions - Render-specific options
     * @returns {Response} HTML response
     */
    c.render = async (template, data = {}, renderOptions = {}) => {
      // JSX: Direct rendering (Hono native)
      if (typeof template === 'object' && template !== null) {
        // Assume it's a JSX element
        return c.html(template);
      }

      // EJS: File-based rendering
      if (engine === 'ejs') {
        // Lazy-load EJS
        const ejs = await loadEJS();

        const templateFile = template.endsWith('.ejs') ? template : `${template}.ejs`;
        const templatePath = join(templatesPath, templateFile);

        if (!existsSync(templatePath)) {
          throw new Error(`Template not found: ${templatePath}`);
        }

        // Read and render template
        const templateContent = await readFile(templatePath, 'utf-8');

        // Merge global data + render data
        const renderData = {
          ...data,
          // Add helpers that EJS templates might expect
          _url: c.req.url,
          _path: c.req.path,
          _method: c.req.method
        };

        // Render template
        const html = ejs.render(templateContent, renderData, {
          filename: templatePath, // For includes to work
          ...engineOptions,
          ...renderOptions
        });

        // If layout specified, wrap in layout
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
            body: html // Content goes into <%- body %>
          }, {
            filename: layoutPath,
            ...engineOptions
          });

          return c.html(wrappedHtml);
        }

        return c.html(html);
      }

      // Custom: User-provided renderer
      if (engine === 'custom' && customRenderer) {
        return customRenderer(c, template, data, renderOptions);
      }

      throw new Error(`Unsupported template engine: ${engine}`);
    };

    await next();
  };
}

/**
 * Create EJS template engine middleware (convenience wrapper)
 * @param {string} templatesDir - Directory containing templates
 * @param {Object} options - Additional options
 * @returns {Function} Hono middleware
 */
export function ejsEngine(templatesDir, options = {}) {
  return setupTemplateEngine({
    engine: 'ejs',
    templatesDir,
    ...options
  });
}

/**
 * Create JSX template engine middleware (convenience wrapper)
 * Note: JSX rendering is built into Hono, this just provides c.render()
 * @returns {Function} Hono middleware
 */
export function jsxEngine() {
  return async (c, next) => {
    c.render = (template, data = {}) => {
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
  jsxEngine
};
