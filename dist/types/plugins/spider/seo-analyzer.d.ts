export interface SEOAnalyzerConfig {
    extractMetaTags?: boolean;
    extractOpenGraph?: boolean;
    extractTwitterCard?: boolean;
    extractAssets?: boolean;
    assetMetadata?: boolean;
    analyzeOnPageSEO?: boolean;
    analyzeAccessibility?: boolean;
    analyzeInternalLinks?: boolean;
    analyzeKeywordOptimization?: boolean;
}
export interface AnalysisResult {
    metaTags: Record<string, string> | null;
    openGraph: Record<string, string> | null;
    twitterCard: Record<string, string> | null;
    canonical: string | null;
    alternates: Array<{
        hreflang: string;
        href: string;
    }>;
    assets: AssetsAnalysis | null;
    onPageSEO: OnPageSEOAnalysis | null;
    accessibility: AccessibilityAnalysis | null;
    internalLinks: InternalLinksAnalysis | null;
    keywordOptimization: KeywordOptimizationAnalysis | null;
    seoScore: SEOScore | number;
}
export interface SEOScore {
    score: number;
    maxScore: number;
    percentage: string;
}
export interface AssetsAnalysis {
    stylesheets: Array<{
        href: string;
        media?: string;
        type: string;
    }>;
    scripts: Array<{
        src: string;
        async?: boolean;
        defer?: boolean;
        type: string;
    }>;
    images: Array<{
        src: string | null;
        alt?: string;
        width?: string | null;
        height?: string | null;
    }>;
    videos: Array<{
        sources: Array<{
            src: string | null;
            type: string | null;
        }>;
        poster?: string | null;
        controls?: boolean;
    }>;
    audios: Array<{
        sources: Array<{
            src: string | null;
            type: string | null;
        }>;
        controls?: boolean;
    }>;
    summary: {
        totalStylesheets: number;
        totalScripts: number;
        totalImages: number;
        totalVideos: number;
        totalAudios: number;
        imageFormats: Record<string, number>;
        videoFormats: Record<string, number>;
        audioFormats: Record<string, number>;
    };
}
export interface OnPageSEOAnalysis {
    title: {
        text: string;
        length: number;
        hasKeyword: boolean;
        quality: string;
    } | null;
    h1: {
        count: number;
        texts: Array<{
            text: string;
            quality: string;
        }>;
        issue: string | null;
    } | null;
    headingStructure: {
        total: number;
        byLevel: Record<string, number>;
        hierarchy: string | null;
        issue: string | null;
    } | null;
    paragraphs: {
        count: number;
        avgLength: number;
        quality: {
            total: number;
            tooShort: number;
            readability: string;
        };
        issue: string | null;
    } | null;
    lists: {
        count: number;
        unordered: number;
        ordered: number;
        totalItems: number;
    } | null;
    images: {
        count: number;
        withAlt: number;
        withoutAlt: number;
        images: Array<{
            src: string | null;
            alt: string | null;
            hasAlt: boolean;
            width: string | null;
            height: string | null;
        }>;
    } | null;
    contentMetrics?: {
        totalWordCount: number;
        mainContentWordCount: number;
        contentRatio: number;
        characterCount: number;
        quality: string;
        detectedContentContainers: Array<{
            selector: string;
            wordCount: number;
            matchType: string;
        }>;
        suggestions: string[];
    } | null;
    url?: string | null;
    recommendations: string[];
}
export interface AccessibilityAnalysis {
    langAttribute: {
        present: boolean;
        value: string | null;
        issue: string | null;
    } | null;
    headingStructure: {
        count: number;
        startsWithH1: boolean;
        properlySorted: boolean;
        issue: string | null;
    } | null;
    altText: {
        total: number;
        withAlt: number;
        withoutAlt: number;
        percentage: number;
        issue: string | null;
    } | null;
    formLabels: {
        inputs: number;
        labels: number;
        inputsWithLabels: number;
        issue: string | null;
    } | null;
    semanticHTML: {
        elements: Record<string, number>;
        score: number;
        issue: string | null;
    } | null;
    contrastRatios: unknown | null;
    ariaLabels: {
        total: number;
        withAriaLabel: number;
        withRole: number;
    } | null;
    keyboardNavigation: {
        focusableElements: number;
        withTabindex: number;
        hasSkipLink: boolean;
    } | null;
    recommendations: string[];
}
export interface InternalLinksAnalysis {
    total: number;
    sameDomain: {
        count: number;
        links: LinkAnalysis[];
    };
    subdomains: {
        count: number;
        links: LinkAnalysis[];
        list: string[];
    };
    external: {
        count: number;
        links: LinkAnalysis[];
        domains: Record<string, number>;
    };
    orphaned: number;
    anchorTextQuality: {
        total: number;
        descriptive: number;
        poor: number;
        examples: string[];
    } | null;
    topicalClusters: {
        clusters: string[];
        strength: number[];
        recommendation: string | null;
    } | null;
    recommendations: string[];
    referralAttributes?: {
        total: number;
        nofollow: number;
        noopener: number;
        noreferrer: number;
        sponsored: number;
        ugc: number;
        externalAttr: number;
        targetBlank: number;
        hasRel: number;
        followable: number;
    };
}
export interface LinkAnalysis {
    href: string;
    text: string;
    quality: string;
    hostname: string;
    isSubdomain?: boolean;
    domain?: string;
    referral: {
        nofollow: boolean;
        noopener: boolean;
        noreferrer: boolean;
        external: boolean;
        ugc: boolean;
        sponsored: boolean;
        target: string | null;
        rel: string | null;
    };
}
export interface KeywordOptimizationAnalysis {
    primaryKeyword: string | null;
    secondaryKeywords: string[];
    keywordDensity: string | null;
    inTitle: boolean;
    inH1: boolean;
    inFirstParagraph: boolean;
    distribution: any | null;
    recommendations: string[];
}
export declare class SEOAnalyzer {
    private config;
    constructor(config?: SEOAnalyzerConfig);
    /**
     * Selective SEO analysis based on requested activities
     */
    analyzeSelective(html: string, baseUrl: string, activities?: string[]): AnalysisResult;
    /**
     * Comprehensive SEO analysis
     */
    analyze(html: string, baseUrl: string): AnalysisResult;
    /**
     * Analyze on-page SEO structure
     */
    private _analyzeOnPageSEO;
    /**
     * Intelligent content length analysis
     * Detects main content containers and excludes navigation/boilerplate
     */
    private _analyzeContentLength;
    /**
     * Estimate main content if no container is found
     * Uses heuristics: paragraphs, lists, headers
     */
    private _estimateMainContent;
    /**
     * Get match type for container selector
     */
    private _getMatchType;
    /**
     * Analyze accessibility (WCAG 2.1 basics)
     */
    private _analyzeAccessibility;
    /**
     * Analyze internal linking strategy
     */
    private _analyzeInternalLinks;
    /**
     * Extract main domain from hostname (removes subdomains)
     */
    private _getMainDomain;
    /**
     * Analyze keyword optimization
     */
    private _analyzeKeywordOptimization;
    /**
     * Calculate overall SEO score
     */
    private _calculateSEOScore;
    private _evaluateTitleQuality;
    private _evaluateHeadingQuality;
    private _countHeadingsByLevel;
    private _analyzeHeadingHierarchy;
    private _findHeadingIssues;
    private _calculateAverageLength;
    private _analyzeParagraphQuality;
    private _evaluateAnchorQuality;
    private _checkHeadingOrder;
    private _countInputsWithLabels;
    private _extractMetaTags;
    private _extractMetaTagsRegex;
    private _extractOpenGraph;
    private _extractOpenGraphRegex;
    private _extractTwitterCard;
    private _extractTwitterCardRegex;
    private _extractCanonical;
    private _extractCanonicalRegex;
    private _extractAlternates;
    private _extractAlternatesRegex;
    private _extractAssets;
    private _extractAssetsRegex;
    private _extractImageFormats;
    private _extractVideoFormats;
    private _extractAudioFormats;
}
export default SEOAnalyzer;
//# sourceMappingURL=seo-analyzer.d.ts.map