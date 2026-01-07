export interface SMTPTemplateEngineOptions {
    type?: 'recker' | 'handlebars' | CustomTemplateFunction;
    templateDir?: string | null;
    cacheTemplates?: boolean;
    helpers?: Record<string, HelperFunction>;
    partials?: Record<string, string>;
}
export type HelperFunction = ((...args: any[]) => any);
export type CustomTemplateFunction = (data: Record<string, unknown>, helpers: Record<string, HelperFunction>, partials: Record<string, string>) => string | RenderedOutput | Promise<string | RenderedOutput>;
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
export declare class SMTPTemplateEngine {
    options: SMTPTemplateEngineOptions;
    type: 'recker' | 'handlebars' | CustomTemplateFunction;
    templateDir: string | null;
    cacheTemplates: boolean;
    helpers: Record<string, HelperFunction>;
    partials: Record<string, string>;
    private _templateCache;
    private _reckerEngine;
    constructor(options?: SMTPTemplateEngineOptions);
    render(templateName: string | CustomTemplateFunction, data?: Record<string, unknown>, options?: RenderOptions): Promise<RenderedOutput>;
    private _getReckerEngine;
    private _renderRecker;
    private _renderCustom;
    private _loadTemplate;
    private _parseRenderedOutput;
    private _parseYaml;
    registerHelper(name: string, fn: HelperFunction): void;
    registerPartial(name: string, template: string): void;
    clearCache(): void;
    getCacheStats(): CacheStats;
    precompile(templateName: string): Promise<boolean>;
}
//# sourceMappingURL=template-engine.d.ts.map