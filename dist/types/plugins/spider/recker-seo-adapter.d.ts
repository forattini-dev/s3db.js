import type { AnalysisResult, SEOAnalyzerConfig } from './seo-analyzer.js';
type ReckerSeoReport = {
    url: string;
    timestamp: Date;
    grade: string;
    score: number;
    summary: {
        totalChecks: number;
        passed: number;
        warnings: number;
        errors: number;
        infos: number;
        passRate: number;
        issuesByCategory: Record<string, {
            passed: number;
            warnings: number;
            errors: number;
        }>;
        topIssues: Array<{
            name: string;
            message: string;
            category: string;
            severity: 'error' | 'warning';
        }>;
        quickWins: string[];
        vitals: {
            htmlSize?: number;
            domElements?: number;
            ttfb?: number;
            totalTime?: number;
            wordCount: number;
            totalWordCount?: number;
            readingTime: number;
            imageCount: number;
            linkCount: number;
        };
        completeness: {
            meta: number;
            social: number;
            technical: number;
            content: number;
            images: number;
            links: number;
        };
    };
    checks: Array<{
        name: string;
        category: string;
        status: 'pass' | 'warn' | 'fail' | 'info';
        message: string;
        value?: string | number;
        recommendation?: string;
    }>;
    title?: {
        text: string;
        length: number;
    };
    metaDescription?: {
        text: string;
        length: number;
    };
    openGraph?: {
        title?: string;
        description?: string;
        image?: string;
        url?: string;
        type?: string;
        siteName?: string;
    };
    twitterCard?: {
        card?: string;
        title?: string;
        description?: string;
        image?: string;
        site?: string;
    };
    structuredData: {
        count: number;
        types: string[];
        items: Record<string, unknown>[];
    };
    content: {
        wordCount: number;
        totalWordCount?: number;
        characterCount: number;
        sentenceCount: number;
        paragraphCount: number;
        readingTimeMinutes: number;
        avgWordsPerSentence: number;
        avgParagraphLength: number;
        listCount: number;
        strongTagCount: number;
        emTagCount: number;
        fleschReadingEase?: number;
        hasQuestionHeadings?: boolean;
    };
    headings: {
        structure: Array<{
            level: number;
            text: string;
            count: number;
        }>;
        h1Count: number;
        hasProperHierarchy: boolean;
        issues: string[];
    };
    keywords: {
        primary: string | null;
        secondary: string[];
        density: Record<string, number>;
    };
    links: {
        total: number;
        internal: number;
        external: number;
        nofollow: number;
        broken: number;
        withoutText: number;
        sponsoredLinks: number;
        ugcLinks: number;
        internalHttpLinks?: number;
        internalHttpLinkUrls?: string[];
    };
    images: {
        total: number;
        withAlt: number;
        withoutAlt: number;
        lazy: number;
        missingDimensions: number;
        modernFormats: number;
        altTextLengths: number[];
        imageAltTexts: string[];
        imageFilenames: string[];
        imagesWithAsyncDecoding: number;
    };
    social: {
        openGraph: {
            present: boolean;
            hasTitle: boolean;
            hasDescription: boolean;
            hasImage: boolean;
            hasUrl: boolean;
            issues: string[];
        };
        twitterCard: {
            present: boolean;
            hasCard: boolean;
            hasTitle: boolean;
            hasDescription: boolean;
            hasImage: boolean;
            issues: string[];
        };
    };
    technical: {
        hasCanonical: boolean;
        canonicalUrl?: string;
        hasRobotsMeta: boolean;
        robotsContent?: string[];
        hasViewport: boolean;
        hasCharset: boolean;
        hasLang: boolean;
        langValue?: string;
    };
};
export declare class ReckerSEOAdapter {
    private config;
    private reckerAvailable;
    private analyzeSeo;
    private fallbackAnalyzer;
    constructor(config?: SEOAnalyzerConfig);
    private _checkReckerAvailability;
    private _getFallbackAnalyzer;
    analyze(html: string, baseUrl: string): Promise<AnalysisResult>;
    analyzeSelective(html: string, baseUrl: string, activities?: string[]): Promise<AnalysisResult>;
    private _analyzeWithRecker;
    private _mapActivitiesToCategories;
    private _mapReckerToAnalysisResult;
    private _mapOnPageSEO;
    private _mapAccessibility;
    private _mapInternalLinks;
    private _mapKeywordOptimization;
    private _mapSEOScore;
    getReckerGrade(): string | null;
    getDetailedReport(html: string, baseUrl: string): Promise<ReckerSeoReport | null>;
}
export default ReckerSEOAdapter;
//# sourceMappingURL=recker-seo-adapter.d.ts.map