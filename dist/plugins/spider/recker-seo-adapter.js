const ACTIVITY_TO_CATEGORY = {
    'seo_meta_tags': 'meta',
    'seo_opengraph': 'og',
    'seo_twitter_card': 'twitter',
    'seo_content_analysis': 'content',
    'seo_heading_structure': 'headings',
    'seo_links_analysis': 'links',
    'seo_accessibility': 'accessibility',
    'seo_keyword_optimization': 'content'
};
export class ReckerSEOAdapter {
    config;
    reckerAvailable = null;
    analyzeSeo = null;
    fallbackAnalyzer = null;
    constructor(config = {}) {
        this.config = {
            extractMetaTags: config.extractMetaTags !== false,
            extractOpenGraph: config.extractOpenGraph !== false,
            extractTwitterCard: config.extractTwitterCard !== false,
            extractAssets: config.extractAssets !== false,
            assetMetadata: config.assetMetadata !== false,
            analyzeOnPageSEO: config.analyzeOnPageSEO !== false,
            analyzeAccessibility: config.analyzeAccessibility !== false,
            analyzeInternalLinks: config.analyzeInternalLinks !== false,
            analyzeKeywordOptimization: config.analyzeKeywordOptimization !== false
        };
    }
    async _checkReckerAvailability() {
        if (this.reckerAvailable !== null) {
            return this.reckerAvailable;
        }
        try {
            const recker = await import('recker');
            if (recker.analyzeSeo) {
                this.analyzeSeo = recker.analyzeSeo;
                this.reckerAvailable = true;
                return true;
            }
        }
        catch {
            // Recker not available
        }
        this.reckerAvailable = false;
        return false;
    }
    async _getFallbackAnalyzer() {
        if (!this.fallbackAnalyzer) {
            const { SEOAnalyzer } = await import('./seo-analyzer.js');
            this.fallbackAnalyzer = new SEOAnalyzer(this.config);
        }
        return this.fallbackAnalyzer;
    }
    async analyze(html, baseUrl) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (isReckerAvailable && this.analyzeSeo) {
            return this._analyzeWithRecker(html, baseUrl);
        }
        const fallback = await this._getFallbackAnalyzer();
        return fallback.analyze(html, baseUrl);
    }
    async analyzeSelective(html, baseUrl, activities = []) {
        if (!activities || activities.length === 0) {
            return this.analyze(html, baseUrl);
        }
        const isReckerAvailable = await this._checkReckerAvailability();
        if (isReckerAvailable && this.analyzeSeo) {
            const categories = this._mapActivitiesToCategories(activities);
            return this._analyzeWithRecker(html, baseUrl, categories);
        }
        const fallback = await this._getFallbackAnalyzer();
        return fallback.analyzeSelective(html, baseUrl, activities);
    }
    async _analyzeWithRecker(html, baseUrl, categories) {
        if (!this.analyzeSeo) {
            throw new Error('Recker analyzeSeo not available');
        }
        const report = await this.analyzeSeo(html, {
            baseUrl,
            analyzeContent: true,
            rules: categories ? { categories } : undefined
        });
        return this._mapReckerToAnalysisResult(report, baseUrl);
    }
    _mapActivitiesToCategories(activities) {
        const categories = new Set();
        for (const activity of activities) {
            const category = ACTIVITY_TO_CATEGORY[activity];
            if (category) {
                categories.add(category);
            }
        }
        return Array.from(categories);
    }
    _mapReckerToAnalysisResult(report, baseUrl) {
        const metaTags = {};
        if (report.title?.text) {
            metaTags.title = report.title.text;
        }
        if (report.metaDescription?.text) {
            metaTags.description = report.metaDescription.text;
        }
        if (report.technical.hasViewport) {
            metaTags.viewport = 'present';
        }
        if (report.technical.hasRobotsMeta && report.technical.robotsContent) {
            metaTags.robots = report.technical.robotsContent.join(', ');
        }
        const openGraph = {};
        if (report.openGraph) {
            if (report.openGraph.title)
                openGraph.title = report.openGraph.title;
            if (report.openGraph.description)
                openGraph.description = report.openGraph.description;
            if (report.openGraph.image)
                openGraph.image = report.openGraph.image;
            if (report.openGraph.url)
                openGraph.url = report.openGraph.url;
            if (report.openGraph.type)
                openGraph.type = report.openGraph.type;
            if (report.openGraph.siteName)
                openGraph.site_name = report.openGraph.siteName;
        }
        const twitterCard = {};
        if (report.twitterCard) {
            if (report.twitterCard.card)
                twitterCard.card = report.twitterCard.card;
            if (report.twitterCard.title)
                twitterCard.title = report.twitterCard.title;
            if (report.twitterCard.description)
                twitterCard.description = report.twitterCard.description;
            if (report.twitterCard.image)
                twitterCard.image = report.twitterCard.image;
            if (report.twitterCard.site)
                twitterCard.site = report.twitterCard.site;
        }
        const onPageSEO = this._mapOnPageSEO(report);
        const accessibility = this._mapAccessibility(report);
        const internalLinks = this._mapInternalLinks(report);
        const keywordOptimization = this._mapKeywordOptimization(report);
        const seoScore = this._mapSEOScore(report);
        return {
            metaTags: Object.keys(metaTags).length > 0 ? metaTags : null,
            openGraph: Object.keys(openGraph).length > 0 ? openGraph : null,
            twitterCard: Object.keys(twitterCard).length > 0 ? twitterCard : null,
            canonical: report.technical.canonicalUrl || null,
            alternates: [],
            assets: null,
            onPageSEO,
            accessibility,
            internalLinks,
            keywordOptimization,
            seoScore
        };
    }
    _mapOnPageSEO(report) {
        const recommendations = [];
        for (const issue of report.summary.topIssues) {
            recommendations.push(issue.message);
        }
        for (const win of report.summary.quickWins) {
            recommendations.push(win);
        }
        const h1Texts = report.headings.structure
            .filter(h => h.level === 1)
            .map(h => ({ text: h.text, quality: 'good' }));
        return {
            title: report.title ? {
                text: report.title.text,
                length: report.title.length,
                hasKeyword: true,
                quality: report.title.length >= 30 && report.title.length <= 60 ? 'optimal' :
                    report.title.length < 30 ? 'short' : 'long'
            } : null,
            h1: {
                count: report.headings.h1Count,
                texts: h1Texts,
                issue: report.headings.h1Count !== 1
                    ? `Found ${report.headings.h1Count} H1 tags (should be 1)`
                    : null
            },
            headingStructure: {
                total: report.headings.structure.reduce((sum, h) => sum + h.count, 0),
                byLevel: report.headings.structure.reduce((acc, h) => {
                    acc[`H${h.level}`] = h.count;
                    return acc;
                }, {}),
                hierarchy: report.headings.hasProperHierarchy ? 'proper' : 'improper',
                issue: report.headings.issues[0] || null
            },
            paragraphs: {
                count: report.content.paragraphCount,
                avgLength: report.content.avgParagraphLength,
                quality: {
                    total: report.content.paragraphCount,
                    tooShort: 0,
                    readability: report.content.fleschReadingEase && report.content.fleschReadingEase >= 60
                        ? 'good'
                        : 'needs-improvement'
                },
                issue: report.content.paragraphCount < 3 ? 'Limited content - should have more paragraphs' : null
            },
            lists: {
                count: report.content.listCount,
                unordered: report.content.listCount,
                ordered: 0,
                totalItems: 0
            },
            images: {
                count: report.images.total,
                withAlt: report.images.withAlt,
                withoutAlt: report.images.withoutAlt,
                images: report.images.imageFilenames.map((filename, i) => ({
                    src: filename,
                    alt: report.images.imageAltTexts[i] || null,
                    hasAlt: !!report.images.imageAltTexts[i],
                    width: null,
                    height: null
                }))
            },
            contentMetrics: {
                totalWordCount: report.content.totalWordCount || report.content.wordCount,
                mainContentWordCount: report.content.wordCount,
                contentRatio: report.content.totalWordCount
                    ? report.content.wordCount / report.content.totalWordCount
                    : 1,
                characterCount: report.content.characterCount,
                quality: report.content.wordCount < 300 ? 'short' :
                    report.content.wordCount < 1000 ? 'medium' : 'comprehensive',
                detectedContentContainers: [],
                suggestions: recommendations.slice(0, 3)
            },
            url: report.url,
            recommendations
        };
    }
    _mapAccessibility(report) {
        const recommendations = [];
        const accessibilityChecks = report.checks.filter(c => c.category === 'accessibility');
        for (const check of accessibilityChecks) {
            if (check.status === 'fail' || check.status === 'warn') {
                recommendations.push(check.recommendation || check.message);
            }
        }
        return {
            langAttribute: {
                present: report.technical.hasLang,
                value: report.technical.langValue || null,
                issue: !report.technical.hasLang ? 'Missing lang attribute on <html>' : null
            },
            headingStructure: {
                count: report.headings.structure.reduce((sum, h) => sum + h.count, 0),
                startsWithH1: report.headings.h1Count > 0,
                properlySorted: report.headings.hasProperHierarchy,
                issue: !report.headings.hasProperHierarchy
                    ? 'Heading hierarchy not properly ordered'
                    : null
            },
            altText: {
                total: report.images.total,
                withAlt: report.images.withAlt,
                withoutAlt: report.images.withoutAlt,
                percentage: report.images.total > 0
                    ? (report.images.withAlt / report.images.total) * 100
                    : 100,
                issue: report.images.withoutAlt > 0
                    ? `${report.images.withoutAlt} images without alt text`
                    : null
            },
            formLabels: {
                inputs: 0,
                labels: 0,
                inputsWithLabels: 0,
                issue: null
            },
            semanticHTML: {
                elements: {},
                score: report.summary.completeness.content,
                issue: null
            },
            contrastRatios: null,
            ariaLabels: {
                total: 0,
                withAriaLabel: 0,
                withRole: 0
            },
            keyboardNavigation: {
                focusableElements: 0,
                withTabindex: 0,
                hasSkipLink: false
            },
            recommendations
        };
    }
    _mapInternalLinks(report) {
        const recommendations = [];
        const linkChecks = report.checks.filter(c => c.category === 'links');
        for (const check of linkChecks) {
            if (check.status === 'fail' || check.status === 'warn') {
                recommendations.push(check.recommendation || check.message);
            }
        }
        if (report.links.internal < 5) {
            recommendations.push('Add more internal links to create topical clusters and improve SEO');
        }
        return {
            total: report.links.total,
            sameDomain: {
                count: report.links.internal,
                links: []
            },
            subdomains: {
                count: 0,
                links: [],
                list: []
            },
            external: {
                count: report.links.external,
                links: [],
                domains: {}
            },
            orphaned: 0,
            anchorTextQuality: {
                total: report.links.total,
                descriptive: report.links.total - report.links.withoutText,
                poor: report.links.withoutText,
                examples: []
            },
            topicalClusters: {
                clusters: [],
                strength: [],
                recommendation: report.links.internal < 5
                    ? 'Create more internal links to establish topical clusters'
                    : null
            },
            recommendations,
            referralAttributes: {
                total: report.links.total,
                nofollow: report.links.nofollow,
                noopener: 0,
                noreferrer: 0,
                sponsored: report.links.sponsoredLinks,
                ugc: report.links.ugcLinks,
                externalAttr: 0,
                targetBlank: 0,
                hasRel: report.links.nofollow + report.links.sponsoredLinks + report.links.ugcLinks,
                followable: report.links.total - report.links.nofollow
            }
        };
    }
    _mapKeywordOptimization(report) {
        const recommendations = [];
        const contentChecks = report.checks.filter(c => c.category === 'content');
        for (const check of contentChecks) {
            if (check.status === 'fail' || check.status === 'warn') {
                recommendations.push(check.recommendation || check.message);
            }
        }
        const primaryKeyword = report.keywords?.primary || null;
        const titleText = report.title?.text?.toLowerCase() || '';
        const h1Texts = report.headings.structure
            .filter(h => h.level === 1)
            .map(h => h.text.toLowerCase());
        return {
            primaryKeyword,
            secondaryKeywords: report.keywords?.secondary || [],
            keywordDensity: primaryKeyword && report.keywords?.density?.[primaryKeyword]
                ? (report.keywords.density[primaryKeyword] * 100).toFixed(2)
                : null,
            inTitle: primaryKeyword ? titleText.includes(primaryKeyword.toLowerCase()) : false,
            inH1: primaryKeyword ? h1Texts.some(h1 => h1.includes(primaryKeyword.toLowerCase())) : false,
            inFirstParagraph: false,
            distribution: report.keywords?.density || null,
            recommendations
        };
    }
    _mapSEOScore(report) {
        return {
            score: report.score,
            maxScore: 100,
            percentage: report.score.toFixed(1)
        };
    }
    getReckerGrade() {
        return null;
    }
    async getDetailedReport(html, baseUrl) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (!isReckerAvailable || !this.analyzeSeo) {
            return null;
        }
        return this.analyzeSeo(html, {
            baseUrl,
            analyzeContent: true
        });
    }
}
export default ReckerSEOAdapter;
//# sourceMappingURL=recker-seo-adapter.js.map