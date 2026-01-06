import type { CrawlContext } from './crawl-context.js';
export interface LlmsTxtLink {
    text: string;
    url: string;
    description?: string;
    section?: string;
}
export interface LlmsTxtSection {
    title: string;
    content: string;
    links: LlmsTxtLink[];
}
export interface LlmsTxtParseResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    siteName?: string;
    siteDescription?: string;
    sections: LlmsTxtSection[];
    links: LlmsTxtLink[];
    hasFullVersion: boolean;
    rawContent: string;
    size: number;
}
export interface LlmsTxtValidationIssue {
    type: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    line?: number;
    recommendation?: string;
}
export interface LlmsTxtValidationResult {
    valid: boolean;
    issues: LlmsTxtValidationIssue[];
    parseResult: LlmsTxtParseResult;
}
export interface LlmsTxtCheckResult {
    exists: boolean;
    valid: boolean;
    status?: number;
    fullVersionExists?: boolean;
    siteName?: string;
    siteDescription?: string;
    sections: LlmsTxtSection[];
    links: LlmsTxtLink[];
    issues: LlmsTxtValidationIssue[];
    errors: string[];
    warnings: string[];
    size?: number;
}
export interface LlmsTxtTemplateOptions {
    siteName: string;
    siteDescription: string;
    sections?: Array<{
        title: string;
        links: Array<{
            text: string;
            url: string;
            description?: string;
        }>;
    }>;
}
export interface LlmsTxtValidatorConfig {
    userAgent?: string;
    fetchTimeout?: number;
    cacheTimeout?: number;
    context?: CrawlContext | null;
}
export declare class ReckerLlmsTxtValidator {
    private config;
    private _context;
    private cache;
    private _httpClient;
    private reckerAvailable;
    private parseLlmsTxt;
    private validateLlmsTxt;
    private fetchAndValidateLlmsTxt;
    private generateLlmsTxtTemplate;
    constructor(config?: LlmsTxtValidatorConfig);
    private _checkReckerAvailability;
    private _getHttpClient;
    check(domain: string): Promise<LlmsTxtCheckResult>;
    private _fallbackCheck;
    private _simpleParse;
    validate(domain: string): Promise<LlmsTxtValidationResult | null>;
    validateContent(content: string, baseUrl?: string): LlmsTxtValidationResult | null;
    parseContent(content: string): LlmsTxtParseResult | null;
    generateTemplate(options: LlmsTxtTemplateOptions): string | null;
    private _fallbackGenerateTemplate;
    checkFullVersion(domain: string): Promise<{
        exists: boolean;
        status?: number;
        size?: number;
    }>;
    getLinks(domain: string): Promise<LlmsTxtLink[]>;
    getSections(domain: string): Promise<LlmsTxtSection[]>;
    clearCache(domain?: string): void;
    getCacheStats(): {
        size: number;
        domains: string[];
    };
    isReckerEnabled(): boolean;
}
export default ReckerLlmsTxtValidator;
//# sourceMappingURL=recker-llms-validator.d.ts.map