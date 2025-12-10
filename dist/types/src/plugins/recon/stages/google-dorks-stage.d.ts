/**
 * GoogleDorksStage
 *
 * Search engine reconnaissance using Google Dorks
 *
 * Discovers:
 * - GitHub repositories
 * - Pastebin leaks
 * - LinkedIn employees
 * - Exposed files (PDF, DOC, XLS)
 * - Subdomains
 * - Login pages
 * - Exposed configs
 *
 * Uses 100% free web scraping (no API key required)
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: {
        curl?: {
            userAgent?: string;
        };
    };
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export type DorkCategory = 'github' | 'pastebin' | 'linkedin' | 'documents' | 'subdomains' | 'loginPages' | 'configs' | 'errors';
export interface GoogleDorksFeatureConfig {
    timeout?: number;
    categories?: DorkCategory[];
    maxResults?: number;
}
export interface SearchResultItem {
    url: string;
    query?: string;
    filetype?: string;
    subdomain?: string;
}
export interface CategoryResult {
    status: 'ok' | 'error';
    results?: SearchResultItem[];
    count?: number;
    message?: string;
}
export interface Categories {
    github: CategoryResult | null;
    pastebin: CategoryResult | null;
    linkedin: CategoryResult | null;
    documents: CategoryResult | null;
    subdomains: CategoryResult | null;
    loginPages: CategoryResult | null;
    configs: CategoryResult | null;
    errors: CategoryResult | null;
}
export interface GoogleDorksResult {
    status: string;
    domain: string;
    companyName: string;
    categories: Categories;
    summary: {
        totalResults: number;
        totalCategories: number;
    };
    _individual: Record<string, CategoryResult | null>;
    _aggregated: Omit<GoogleDorksResult, '_individual' | '_aggregated'>;
}
export declare class GoogleDorksStage {
    private plugin;
    private commandRunner;
    private config;
    private _httpClient;
    constructor(plugin: ReconPlugin);
    private _getHttpClient;
    execute(target: Target, options?: GoogleDorksFeatureConfig): Promise<GoogleDorksResult>;
    searchGitHub(domain: string, companyName: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchPastebin(domain: string, companyName: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchLinkedIn(domain: string, companyName: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchDocuments(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchSubdomains(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchLoginPages(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchConfigs(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    searchErrors(domain: string, options?: GoogleDorksFeatureConfig): Promise<CategoryResult>;
    performGoogleSearch(query: string, options?: GoogleDorksFeatureConfig): Promise<string[]>;
    deduplicateResults(results: SearchResultItem[]): SearchResultItem[];
    extractBaseDomain(host: string): string;
    extractCompanyName(domain: string): string;
    private sleep;
}
//# sourceMappingURL=google-dorks-stage.d.ts.map