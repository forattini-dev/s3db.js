import type { Context, MiddlewareHandler, Next } from 'hono';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

export interface EJSModule {
  render(template: string, data: unknown, options?: Record<string, unknown>): string;
}

export interface PugModule {
  renderFile(path: string, options?: Record<string, unknown>): string;
}

export type CustomRenderer = (c: Context, template: string, data: Record<string, unknown>, renderOptions: Record<string, unknown>) => Response | Promise<Response>;

export interface TemplateEngineOptions {
  engine?: 'ejs' | 'pug' | 'jsx' | 'custom';
  templatesDir?: string;
  layout?: string | null;
  engineOptions?: Record<string, unknown>;
  customRenderer?: CustomRenderer | null;
}

export interface RenderOptions {
  layout?: string;
  [key: string]: unknown;
}

export interface ContextWithRender extends Context {
  render: (template: string | object, data?: Record<string, unknown>, renderOptions?: RenderOptions) => Promise<Response>;
}

async function loadEJS(): Promise<EJSModule> {
  try {
    const ejs = await import('ejs' as string);
    return (ejs.default || ejs) as EJSModule;
  } catch {
    throw new Error(
      'EJS template engine not installed. Install with: npm install ejs\n' +
      'EJS is a peer dependency to keep the core package lightweight.'
    );
  }
}

async function loadPug(): Promise<PugModule> {
  try {
    const pug = await import('pug' as string);
    return (pug.default || pug) as PugModule;
  } catch {
    throw new Error(
      'Pug template engine not installed. Install with: npm install pug\n' +
      'Pug is a peer dependency to keep the core package lightweight.'
    );
  }
}

export function setupTemplateEngine(options: TemplateEngineOptions = {}): MiddlewareHandler {
  const {
    engine = 'jsx',
    templatesDir = './views',
    layout = null,
    engineOptions = {},
    customRenderer = null
  } = options;

  const templatesPath = resolve(templatesDir);

  return async (c: Context, next: Next): Promise<void | Response> => {
    const contextWithRender = c as ContextWithRender;

    contextWithRender.render = async (template: string | object, data: Record<string, unknown> = {}, renderOptions: RenderOptions = {}): Promise<Response> => {
      if (typeof template === 'object' && template !== null) {
        return c.html(template as unknown as string);
      }

      if (engine === 'pug') {
        const pug = await loadPug();

        const templateFile = (template as string).endsWith('.pug') ? template : `${template}.pug`;
        const templatePath = join(templatesPath, templateFile as string);

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

        const templateFile = (template as string).endsWith('.ejs') ? template : `${template}.ejs`;
        const templatePath = join(templatesPath, templateFile as string);

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
          const layoutFile = layoutName!.endsWith('.ejs') ? layoutName : `${layoutName}.ejs`;
          const layoutPath = join(templatesPath, layoutFile!);

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
        return customRenderer(c, template as string, data, renderOptions);
      }

      throw new Error(`Unsupported template engine: ${engine}`);
    };

    await next();
  };
}

export function ejsEngine(templatesDir: string, options: Omit<TemplateEngineOptions, 'engine' | 'templatesDir'> = {}): MiddlewareHandler {
  return setupTemplateEngine({
    engine: 'ejs',
    templatesDir,
    ...options
  });
}

export function pugEngine(templatesDir: string, options: Omit<TemplateEngineOptions, 'engine' | 'templatesDir'> = {}): MiddlewareHandler {
  return setupTemplateEngine({
    engine: 'pug',
    templatesDir,
    ...options
  });
}

export function jsxEngine(): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<void | Response> => {
    const contextWithRender = c as ContextWithRender;

    contextWithRender.render = async (template: string | object): Promise<Response> => {
      if (typeof template === 'object' && template !== null) {
        return c.html(template as unknown as string);
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
