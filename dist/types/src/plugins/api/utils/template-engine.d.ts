import type { Context, MiddlewareHandler } from 'hono';
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
export declare function setupTemplateEngine(options?: TemplateEngineOptions): MiddlewareHandler;
export declare function ejsEngine(templatesDir: string, options?: Omit<TemplateEngineOptions, 'engine' | 'templatesDir'>): MiddlewareHandler;
export declare function pugEngine(templatesDir: string, options?: Omit<TemplateEngineOptions, 'engine' | 'templatesDir'>): MiddlewareHandler;
export declare function jsxEngine(): MiddlewareHandler;
declare const _default: {
    setupTemplateEngine: typeof setupTemplateEngine;
    ejsEngine: typeof ejsEngine;
    pugEngine: typeof pugEngine;
    jsxEngine: typeof jsxEngine;
};
export default _default;
//# sourceMappingURL=template-engine.d.ts.map