import type { SecurityAnalyzerConfig, SecurityAnalysisResult } from './security-analyzer.js';
type ReckerSecurityReport = {
    grade: string;
    score: number;
    details: Array<{
        header: string;
        value?: string;
        status: 'pass' | 'warn' | 'fail';
        score: number;
        message: string;
        recommendation?: string;
    }>;
    csp?: {
        raw: string;
        directives: Array<{
            name: string;
            values: string[];
            issues: string[];
            severity: 'safe' | 'warn' | 'dangerous';
        }>;
        issues: string[];
        score: number;
        hasUnsafeInline: boolean;
        hasUnsafeEval: boolean;
        hasWildcard: boolean;
        missingDirectives: string[];
    };
    summary: {
        passed: number;
        warnings: number;
        failed: number;
    };
};
interface Page {
    on(event: 'response', handler: (response: PageResponse) => void): void;
    on(event: 'console', handler: (msg: ConsoleMessage) => void): void;
    removeListener(event: string, handler: (...args: unknown[]) => void): void;
    content(): Promise<string>;
    evaluateOnNewDocument(fn: string): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}
interface PageResponse {
    url(): string;
    headers(): Record<string, string>;
}
interface ConsoleMessage {
    type(): string;
    text(): string;
    location(): unknown;
    args(): unknown[];
}
export declare class ReckerSecurityAdapter {
    private config;
    private reckerAvailable;
    private analyzeSecurityHeaders;
    private fallbackAnalyzer;
    private reckerGrade;
    private reckerScore;
    constructor(config?: SecurityAnalyzerConfig);
    private _checkReckerAvailability;
    private _getFallbackAnalyzer;
    analyze(page: Page, baseUrl: string, html?: string, responseHeaders?: Record<string, string>): Promise<SecurityAnalysisResult>;
    analyzeSelective(page: Page, baseUrl: string, html?: string, activities?: string[], responseHeaders?: Record<string, string>): Promise<SecurityAnalysisResult>;
    private _analyzeWithReckerAndPuppeteer;
    private _analyzeSelectiveWithRecker;
    private _analyzeHeadersWithRecker;
    private _mapReckerToSecurityResult;
    private _mergeResults;
    private _mapReckerHeaders;
    private _mapReckerCSP;
    private _mapCORS;
    private _mapTLS;
    getReckerGrade(): string | null;
    getReckerScore(): number | null;
    analyzeHeadersOnly(headers: Record<string, string>): Promise<{
        grade: string;
        score: number;
        report: ReckerSecurityReport;
    } | null>;
}
export default ReckerSecurityAdapter;
//# sourceMappingURL=recker-security-adapter.d.ts.map