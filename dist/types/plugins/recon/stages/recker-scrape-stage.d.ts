/**
 * ReckerScrapeStage
 *
 * Web scraping and search reconnaissance using Recker
 *
 * Uses Recker's HTML parser and link extractor for better accuracy
 * Uses Recker's HTTP client for search queries
 *
 * Falls back to GoogleDorksStage if Recker is not available
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
export interface ReckerScrapeFeatureConfig {
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
export interface ReckerScrapeResult {
    status: string;
    domain: string;
    companyName: string;
    categories: Categories;
    summary: {
        totalResults: number;
        totalCategories: number;
    };
    _individual: Record<string, CategoryResult | null>;
    _aggregated: Omit<ReckerScrapeResult, '_individual' | '_aggregated'>;
}
export declare class ReckerScrapeStage {
    private plugin;
    private config;
    private _httpClient;
    private reckerAvailable;
    private extractLinks;
    private parse;
    private fallbackStage;
    constructor(plugin: ReconPlugin);
    private _checkReckerAvailability;
    private _getHttpClient;
    private _getFallbackStage;
    execute(target: Target, options?: ReckerScrapeFeatureConfig): Promise<ReckerScrapeResult>;
    private _performSearch;
    private _searchGitHub;
    private _searchPastebin;
    private _searchLinkedIn;
    private _searchDocuments;
    private _searchSubdomains;
    private _searchLoginPages;
    private _searchConfigs;
    private _searchErrors;
    private _deduplicateResults;
    private _extractBaseDomain;
    private _extractCompanyName;
    private _sleep;
    private _executeFallback;
    isReckerEnabled(): boolean;
}
export default ReckerScrapeStage;
//# sourceMappingURL=recker-scrape-stage.d.ts.map