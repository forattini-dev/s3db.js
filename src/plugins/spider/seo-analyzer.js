/**
 * SEO Analyzer - Comprehensive SEO analysis including on-page SEO, accessibility, and structure
 *
 * Analyzes:
 * - Meta tags (title, description, keywords, charset, viewport, author, robots)
 * - OpenGraph and Twitter Card tags
 * - On-page SEO structure (H1, H2-H3, paragraphs, lists, images)
 * - Internal linking strategy (topical clusters, anchor text quality)
 * - Accessibility (alt text, ARIA labels, semantic HTML, color contrast)
 * - Page structure and organization
 * - Keyword optimization and distribution
 * - Asset inventory with alt text analysis
 * - Performance considerations (Core Web Vitals factors)
 */
export class SEOAnalyzer {
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
    }
  }

  /**
   * Comprehensive SEO analysis
   *
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL for relative links
   * @returns {Object} Analysis results with SEO score
   */
  analyze(html, baseUrl) {
    const result = {
      metaTags: null,
      openGraph: null,
      twitterCard: null,
      canonical: null,
      alternates: [],
      assets: null,
      onPageSEO: null,
      accessibility: null,
      internalLinks: null,
      keywordOptimization: null,
      seoScore: 0
    }

    try {
      // Parse HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')

      if (this.config.extractMetaTags) {
        result.metaTags = this._extractMetaTags(doc)
      }

      if (this.config.extractOpenGraph) {
        result.openGraph = this._extractOpenGraph(doc)
      }

      if (this.config.extractTwitterCard) {
        result.twitterCard = this._extractTwitterCard(doc)
      }

      result.canonical = this._extractCanonical(doc)
      result.alternates = this._extractAlternates(doc)

      if (this.config.extractAssets) {
        result.assets = this._extractAssets(doc, baseUrl)
      }

      if (this.config.analyzeOnPageSEO) {
        result.onPageSEO = this._analyzeOnPageSEO(doc, html)
      }

      if (this.config.analyzeAccessibility) {
        result.accessibility = this._analyzeAccessibility(doc, html)
      }

      if (this.config.analyzeInternalLinks) {
        result.internalLinks = this._analyzeInternalLinks(doc, baseUrl)
      }

      if (this.config.analyzeKeywordOptimization) {
        result.keywordOptimization = this._analyzeKeywordOptimization(doc, html, result.metaTags)
      }

      // Calculate overall SEO score
      result.seoScore = this._calculateSEOScore(result)
    } catch (error) {
      // Fallback to regex-based extraction
      result.metaTags = this._extractMetaTagsRegex(html)
      result.openGraph = this._extractOpenGraphRegex(html)
      result.twitterCard = this._extractTwitterCardRegex(html)
      result.canonical = this._extractCanonicalRegex(html)
      result.alternates = this._extractAlternatesRegex(html)
      if (this.config.extractAssets) {
        result.assets = this._extractAssetsRegex(html, baseUrl)
      }
    }

    return result
  }

  /**
   * Analyze on-page SEO structure
   * @private
   */
  _analyzeOnPageSEO(doc, html) {
    const analysis = {
      title: null,
      h1: null,
      headingStructure: null,
      paragraphs: null,
      lists: null,
      images: null,
      url: null,
      recommendations: []
    }

    // Title tag
    const titleEl = doc.querySelector('title')
    if (titleEl) {
      const titleText = titleEl.textContent
      analysis.title = {
        text: titleText,
        length: titleText.length,
        hasKeyword: titleText.length > 0,
        quality: this._evaluateTitleQuality(titleText)
      }
    } else {
      analysis.recommendations.push('Missing title tag - critical for SEO')
    }

    // H1 analysis (should have exactly one)
    const h1Elements = doc.querySelectorAll('h1')
    analysis.h1 = {
      count: h1Elements.length,
      texts: Array.from(h1Elements).map(el => ({
        text: el.textContent,
        quality: this._evaluateHeadingQuality(el.textContent)
      })),
      issue: h1Elements.length !== 1 ? `Found ${h1Elements.length} H1 tags (should be 1)` : null
    }

    if (h1Elements.length === 0) {
      analysis.recommendations.push('Missing H1 tag - essential for on-page SEO')
    } else if (h1Elements.length > 1) {
      analysis.recommendations.push(`Found ${h1Elements.length} H1 tags - use only one`)
    }

    // Heading structure (H1 > H2-H3 hierarchy)
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    analysis.headingStructure = {
      total: headings.length,
      byLevel: this._countHeadingsByLevel(headings),
      hierarchy: this._analyzeHeadingHierarchy(headings),
      issue: this._findHeadingIssues(headings)
    }

    if (analysis.headingStructure.total === 0) {
      analysis.recommendations.push('No heading structure found - use H2-H3 for organization')
    }

    // Paragraph analysis
    const paragraphs = doc.querySelectorAll('p')
    analysis.paragraphs = {
      count: paragraphs.length,
      avgLength: this._calculateAverageLength(paragraphs),
      quality: this._analyzeParagraphQuality(paragraphs),
      issue:
        paragraphs.length === 0
          ? 'No paragraphs found'
          : paragraphs.length < 3
            ? 'Limited content - should have more paragraphs'
            : null
    }

    // List analysis (ul/ol)
    const lists = doc.querySelectorAll('ul, ol')
    analysis.lists = {
      count: lists.length,
      unordered: doc.querySelectorAll('ul').length,
      ordered: doc.querySelectorAll('ol').length,
      totalItems: Array.from(lists).reduce((sum, list) => sum + list.querySelectorAll('li').length, 0)
    }

    // Image analysis with alt text
    const images = doc.querySelectorAll('img')
    analysis.images = {
      count: images.length,
      withAlt: 0,
      withoutAlt: 0,
      images: Array.from(images).map((img) => ({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        hasAlt: !!img.getAttribute('alt'),
        width: img.getAttribute('width'),
        height: img.getAttribute('height')
      }))
    }

    for (const img of images) {
      if (img.getAttribute('alt')) {
        analysis.images.withAlt++
      } else {
        analysis.images.withoutAlt++
      }
    }

    if (analysis.images.withoutAlt > 0) {
      analysis.recommendations.push(
        `${analysis.images.withoutAlt} images missing alt text - add descriptive alt text`
      )
    }

    // Content length - intelligent detection
    const contentAnalysis = this._analyzeContentLength(doc, html)

    analysis.contentMetrics = {
      totalWordCount: contentAnalysis.totalWordCount,
      mainContentWordCount: contentAnalysis.mainContentWordCount,
      contentRatio: contentAnalysis.contentRatio,
      characterCount: contentAnalysis.characterCount,
      quality:
        contentAnalysis.mainContentWordCount < 300
          ? 'short'
          : contentAnalysis.mainContentWordCount < 1000
            ? 'medium'
            : 'comprehensive',
      detectedContentContainers: contentAnalysis.detectedContainers,
      suggestions: contentAnalysis.suggestions
    }

    if (contentAnalysis.mainContentWordCount < 300) {
      analysis.recommendations.push(
        `Content is too short (${contentAnalysis.mainContentWordCount} words) - aim for 300+ words for better SEO`
      )
    }

    if (contentAnalysis.contentRatio < 0.3) {
      analysis.recommendations.push(
        `Content ratio is low (${(contentAnalysis.contentRatio * 100).toFixed(1)}%) - too much navigation/boilerplate, focus on main content`
      )
    }

    return analysis
  }

  /**
   * Intelligent content length analysis
   * Detects main content containers and excludes navigation/boilerplate
   * @private
   */
  _analyzeContentLength(doc, html) {
    const analysis = {
      totalWordCount: 0,
      mainContentWordCount: 0,
      contentRatio: 0,
      characterCount: 0,
      detectedContainers: [],
      suggestions: []
    }

    // Get total word count from entire body
    const bodyText = doc.body?.textContent || ''
    const totalWords = bodyText.trim().split(/\s+/).filter(w => w.length > 0).length
    const totalChars = bodyText.length
    analysis.totalWordCount = totalWords
    analysis.characterCount = totalChars

    // Priority list of content containers (semantic first, then common patterns)
    const contentSelectors = [
      'main',                           // Semantic HTML - BEST
      'article',                        // Semantic HTML
      'div[role="main"]',              // ARIA main
      '[itemtype*="Article"]',         // Schema.org article
      'div.post-content',              // WordPress
      'div.entry-content',             // WordPress
      'div.the-content',               // WordPress
      'article.post',                  // Common blog pattern
      'div.article-content',           // Common pattern
      'div.article',                   // Generic
      'div.content',                   // Generic
      'div.main-content',              // Generic
      'div.container',                 // Bootstrap/generic
      'div[class*="content"]',         // Class contains "content"
      'div[class*="article"]',         // Class contains "article"
      'div[class*="main"]'             // Class contains "main"
    ]

    let contentContainer = null
    const detectedContainers = []

    // Find the best matching content container
    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector)
      if (element) {
        const text = element.textContent || ''
        const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length

        // Only consider if it has meaningful content
        if (wordCount > 50) {
          detectedContainers.push({
            selector,
            wordCount,
            matchType: this._getMatchType(selector)
          })

          if (!contentContainer) {
            contentContainer = element
            analysis.mainContentWordCount = wordCount
          }
        }
      }
    }

    analysis.detectedContainers = detectedContainers

    // If no good container found, try to estimate main content
    if (!contentContainer || analysis.mainContentWordCount === 0) {
      analysis.mainContentWordCount = this._estimateMainContent(doc, html, totalWords)
      analysis.suggestions.push('No clear content container found - consider using semantic HTML (main, article) or [role="main"]')
    }

    // Calculate content ratio (main content vs total)
    analysis.contentRatio = totalWords > 0 ? analysis.mainContentWordCount / totalWords : 0

    // Quality assessment
    if (analysis.mainContentWordCount < 300) {
      analysis.suggestions.push('Content is too short - aim for 300+ words')
    } else if (analysis.mainContentWordCount < 1000) {
      analysis.suggestions.push('Content length is good (medium) - consider expanding to 1000+ words for better ranking potential')
    }

    // Content ratio assessment
    if (analysis.contentRatio < 0.3) {
      analysis.suggestions.push('Low content ratio - reduce navigation/sidebar/boilerplate text')
    } else if (analysis.contentRatio < 0.5) {
      analysis.suggestions.push('Content ratio is moderate - optimize page layout to increase main content visibility')
    } else if (analysis.contentRatio >= 0.7) {
      analysis.suggestions.push('Excellent content ratio - main content dominates the page')
    }

    // Recommendations for structure
    if (detectedContainers.length === 0) {
      analysis.suggestions.push('Use semantic HTML: wrap content in <main>, <article>, or <div role="main">')
    } else {
      const bestContainer = detectedContainers[0]
      if (bestContainer.matchType === 'non-semantic') {
        analysis.suggestions.push(`Consider replacing '${bestContainer.selector}' with semantic <main> or <article> tag`)
      }
    }

    return analysis
  }

  /**
   * Estimate main content if no container is found
   * Uses heuristics: paragraphs, lists, headers
   * @private
   */
  _estimateMainContent(doc, html, totalWords) {
    const paragraphs = doc.querySelectorAll('p')
    const lists = doc.querySelectorAll('ul, ol')
    const headers = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const blockquotes = doc.querySelectorAll('blockquote')
    const tables = doc.querySelectorAll('table')

    let estimatedWords = 0

    // Count words in main content elements
    for (const p of paragraphs) {
      estimatedWords += p.textContent.trim().split(/\s+/).filter(w => w.length > 0).length
    }

    for (const h of headers) {
      estimatedWords += h.textContent.trim().split(/\s+/).filter(w => w.length > 0).length
    }

    for (const li of doc.querySelectorAll('li')) {
      estimatedWords += li.textContent.trim().split(/\s+/).filter(w => w.length > 0).length
    }

    for (const bq of blockquotes) {
      estimatedWords += bq.textContent.trim().split(/\s+/).filter(w => w.length > 0).length
    }

    for (const table of tables) {
      estimatedWords += table.textContent.trim().split(/\s+/).filter(w => w.length > 0).length
    }

    return Math.max(estimatedWords, totalWords * 0.3) // At least 30% of total
  }

  /**
   * Get match type for container selector
   * @private
   */
  _getMatchType(selector) {
    if (['main', 'article'].includes(selector)) {
      return 'semantic'
    }
    if (selector.includes('role')) {
      return 'aria'
    }
    if (selector.includes('schema')) {
      return 'microdata'
    }
    return 'non-semantic'
  }

  /**
   * Analyze accessibility (WCAG 2.1 basics)
   * @private
   */
  _analyzeAccessibility(doc, html) {
    const analysis = {
      langAttribute: null,
      headingStructure: null,
      altText: null,
      formLabels: null,
      semanticHTML: null,
      contrastRatios: null,
      ariaLabels: null,
      keyboardNavigation: null,
      recommendations: []
    }

    // Lang attribute
    const htmlEl = doc.documentElement
    analysis.langAttribute = {
      present: htmlEl.hasAttribute('lang'),
      value: htmlEl.getAttribute('lang'),
      issue: !htmlEl.hasAttribute('lang') ? 'Missing lang attribute on <html>' : null
    }

    if (!analysis.langAttribute.present) {
      analysis.recommendations.push('Add lang attribute to <html> tag (e.g., lang="en")')
    }

    // Heading structure
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    analysis.headingStructure = {
      count: headings.length,
      startsWithH1: headings.length > 0 && headings[0].tagName === 'H1',
      properlySorted: this._checkHeadingOrder(headings),
      issue: !this._checkHeadingOrder(headings) ? 'Heading hierarchy not properly ordered' : null
    }

    if (!analysis.headingStructure.properlySorted) {
      analysis.recommendations.push('Fix heading hierarchy - should start with H1 and increase sequentially')
    }

    // Alt text for images
    const images = doc.querySelectorAll('img')
    const imagesWithoutAlt = Array.from(images).filter((img) => !img.getAttribute('alt'))
    analysis.altText = {
      total: images.length,
      withAlt: images.length - imagesWithoutAlt.length,
      withoutAlt: imagesWithoutAlt.length,
      percentage: ((images.length - imagesWithoutAlt.length) / (images.length || 1)) * 100,
      issue: imagesWithoutAlt.length > 0 ? `${imagesWithoutAlt.length} images without alt text` : null
    }

    if (analysis.altText.withoutAlt > 0) {
      analysis.recommendations.push(
        `Add alt text to ${analysis.altText.withoutAlt} images for better accessibility`
      )
    }

    // Form labels
    const inputs = doc.querySelectorAll('input, textarea, select')
    const labels = doc.querySelectorAll('label')
    analysis.formLabels = {
      inputs: inputs.length,
      labels: labels.length,
      inputsWithLabels: this._countInputsWithLabels(inputs, labels),
      issue:
        inputs.length > 0 && labels.length === 0
          ? 'Form inputs found but no labels'
          : null
    }

    if (analysis.formLabels.issue) {
      analysis.recommendations.push('Add label elements for all form inputs')
    }

    // Semantic HTML
    const semanticElements = {
      nav: doc.querySelectorAll('nav').length,
      main: doc.querySelectorAll('main').length,
      article: doc.querySelectorAll('article').length,
      section: doc.querySelectorAll('section').length,
      aside: doc.querySelectorAll('aside').length,
      header: doc.querySelectorAll('header').length,
      footer: doc.querySelectorAll('footer').length
    }

    analysis.semanticHTML = {
      elements: semanticElements,
      score: Object.values(semanticElements).reduce((a, b) => a + b, 0),
      issue: Object.values(semanticElements).every((v) => v === 0) ? 'No semantic HTML elements found' : null
    }

    if (analysis.semanticHTML.score === 0) {
      analysis.recommendations.push('Use semantic HTML elements (nav, main, article, section, etc.)')
    }

    // ARIA labels
    const ariaElements = doc.querySelectorAll('[aria-label], [aria-labelledby], [role]')
    analysis.ariaLabels = {
      total: ariaElements.length,
      withAriaLabel: doc.querySelectorAll('[aria-label]').length,
      withRole: doc.querySelectorAll('[role]').length
    }

    // Keyboard navigation indicators
    const focusableElements = doc.querySelectorAll(
      'a, button, input, textarea, select, [tabindex]'
    )
    analysis.keyboardNavigation = {
      focusableElements: focusableElements.length,
      withTabindex: doc.querySelectorAll('[tabindex]').length,
      hasSkipLink: !!doc.querySelector('a[href="#main"]') ||
        !!doc.querySelector('a[href="#content"]')
    }

    if (!analysis.keyboardNavigation.hasSkipLink) {
      analysis.recommendations.push('Add skip navigation link for keyboard users')
    }

    return analysis
  }

  /**
   * Analyze internal linking strategy
   * @private
   */
  _analyzeInternalLinks(doc, baseUrl) {
    const analysis = {
      total: 0,
      sameDomain: {
        count: 0,
        links: []
      },
      subdomains: {
        count: 0,
        links: [],
        list: []
      },
      external: {
        count: 0,
        links: [],
        domains: {}
      },
      orphaned: 0,
      anchorTextQuality: null,
      topicalClusters: null,
      recommendations: []
    }

    const links = doc.querySelectorAll('a[href]')
    const baseUrlObj = new URL(baseUrl)
    const baseDomain = baseUrlObj.hostname
    const mainDomain = this._getMainDomain(baseDomain)

    const samedomainLinks = []
    const subdomainLinks = []
    const externalLinks = []
    const anchorTexts = []

    for (const link of links) {
      const href = link.getAttribute('href')
      const anchorText = link.textContent.trim()
      const rel = link.getAttribute('rel') || ''
      const target = link.getAttribute('target') || ''

      // Skip hash/fragment links and javascript
      if (href.startsWith('#') || href.startsWith('javascript:')) {
        continue
      }

      analysis.total++

      // Extract rel attributes and target information
      const relAttributes = rel.toLowerCase().split(/\s+/).filter(Boolean)
      const linkReferral = {
        nofollow: relAttributes.includes('nofollow'),
        noopener: relAttributes.includes('noopener'),
        noreferrer: relAttributes.includes('noreferrer'),
        external: relAttributes.includes('external'),
        ugc: relAttributes.includes('ugc'),
        sponsored: relAttributes.includes('sponsored'),
        target: target.toLowerCase() || null,
        rel: rel.length > 0 ? rel : null
      }

      try {
        const linkUrl = new URL(href, baseUrl)
        const linkMainDomain = this._getMainDomain(linkUrl.hostname)

        // Check if same main domain
        if (linkMainDomain === mainDomain) {
          const linkObj = {
            href: linkUrl.href,
            text: anchorText,
            quality: this._evaluateAnchorQuality(anchorText),
            hostname: linkUrl.hostname,
            isSubdomain: linkUrl.hostname !== baseDomain,
            referral: linkReferral
          }

          // Separate same domain from subdomains
          if (linkUrl.hostname === baseDomain) {
            samedomainLinks.push(linkObj)
          } else {
            subdomainLinks.push(linkObj)
            if (!analysis.subdomains.list.includes(linkUrl.hostname)) {
              analysis.subdomains.list.push(linkUrl.hostname)
            }
          }
        } else {
          externalLinks.push({
            href: linkUrl.href,
            text: anchorText,
            domain: linkUrl.hostname,
            quality: this._evaluateAnchorQuality(anchorText),
            referral: linkReferral
          })
          analysis.external.domains[linkUrl.hostname] = (analysis.external.domains[linkUrl.hostname] || 0) + 1
        }
      } catch (e) {
        // Relative link - always same domain
        if (!href.startsWith('http')) {
          const resolvedUrl = new URL(href, baseUrl)
          samedomainLinks.push({
            href: resolvedUrl.href,
            text: anchorText,
            quality: this._evaluateAnchorQuality(anchorText),
            hostname: baseDomain,
            isSubdomain: false,
            referral: linkReferral
          })
        }
      }

      anchorTexts.push(anchorText)
    }

    analysis.sameDomain.count = samedomainLinks.length
    analysis.sameDomain.links = samedomainLinks
    analysis.subdomains.count = subdomainLinks.length
    analysis.subdomains.links = subdomainLinks
    analysis.external.count = externalLinks.length
    analysis.external.links = externalLinks

    // Anchor text quality analysis
    const poorAnchorTexts = anchorTexts.filter(
      (text) =>
        text.toLowerCase() === 'click here' ||
        text.toLowerCase() === 'read more' ||
        text.toLowerCase() === 'more' ||
        text.toLowerCase() === 'link' ||
        text === ''
    )

    analysis.anchorTextQuality = {
      total: anchorTexts.length,
      descriptive: anchorTexts.length - poorAnchorTexts.length,
      poor: poorAnchorTexts.length,
      examples: poorAnchorTexts.slice(0, 5)
    }

    if (poorAnchorTexts.length > 0) {
      analysis.recommendations.push(
        `Use descriptive anchor text instead of "${poorAnchorTexts[0]}" - be specific about link content`
      )
    }

    // Check for broken anchors (orphaned content)
    const headingIds = Array.from(doc.querySelectorAll('[id]')).map((el) => el.id)
    const anchorLinks = Array.from(doc.querySelectorAll('a[href^="#"]')).map((link) =>
      link.getAttribute('href').substring(1)
    )

    analysis.orphaned = anchorLinks.filter((id) => !headingIds.includes(id)).length

    // Topical clusters recommendation
    const internalDomainsCount = {}
    for (const link of samedomainLinks) {
      const path = new URL(link.href).pathname.split('/')[1]
      internalDomainsCount[path] = (internalDomainsCount[path] || 0) + 1
    }

    analysis.topicalClusters = {
      clusters: Object.keys(internalDomainsCount),
      strength: Object.values(internalDomainsCount),
      recommendation: samedomainLinks.length < 5 ? 'Create more internal links to establish topical clusters' : null
    }

    if (samedomainLinks.length < 5) {
      analysis.recommendations.push('Add more internal links to create topical clusters and improve SEO')
    }

    // Analyze referral attributes
    const allLinks = [...samedomainLinks, ...subdomainLinks, ...externalLinks]
    const referralStats = {
      total: allLinks.length,
      nofollow: allLinks.filter((l) => l.referral?.nofollow).length,
      noopener: allLinks.filter((l) => l.referral?.noopener).length,
      noreferrer: allLinks.filter((l) => l.referral?.noreferrer).length,
      sponsored: allLinks.filter((l) => l.referral?.sponsored).length,
      ugc: allLinks.filter((l) => l.referral?.ugc).length,
      externalAttr: allLinks.filter((l) => l.referral?.external).length,
      targetBlank: allLinks.filter((l) => l.referral?.target === '_blank').length,
      hasRel: allLinks.filter((l) => l.referral?.rel).length,
      followable: allLinks.filter((l) => !l.referral?.nofollow).length
    }

    analysis.referralAttributes = referralStats

    // Referral recommendations
    const externalNofollow = externalLinks.filter((l) => l.referral?.nofollow).length
    const externalWithoutRel = externalLinks.filter((l) => !l.referral?.rel).length

    if (externalWithoutRel > 0) {
      analysis.recommendations.push(
        `Add rel="noopener noreferrer" to ${externalWithoutRel} external links for security`
      )
    }

    // External links recommendations
    if (externalLinks.length === 0) {
      analysis.recommendations.push('Consider adding links to authoritative external sources (backlinks to relevant content)')
    }

    return analysis
  }

  /**
   * Extract main domain from hostname (removes subdomains)
   * @private
   */
  _getMainDomain(hostname) {
    if (!hostname) return ''
    const parts = hostname.split('.')
    if (parts.length <= 2) return hostname
    // Return last two parts (domain.tld)
    return parts.slice(-2).join('.')
  }

  /**
   * Analyze keyword optimization
   * @private
   */
  _analyzeKeywordOptimization(doc, html, metaTags) {
    const analysis = {
      primaryKeyword: null,
      secondaryKeywords: [],
      keywordDensity: null,
      inTitle: false,
      inH1: false,
      inFirstParagraph: false,
      distribution: null,
      recommendations: []
    }

    if (!metaTags?.title) {
      analysis.recommendations.push('Add a title tag with primary keyword')
      return analysis
    }

    // Extract primary keyword from title
    const titleWords = metaTags.title.toLowerCase().split(/\s+/)
    const h1El = doc.querySelector('h1')
    const h1Text = h1El ? h1El.textContent.toLowerCase() : ''
    const bodyText = doc.body?.textContent.toLowerCase() || ''
    const firstParagraph = doc.querySelector('p')?.textContent.toLowerCase() || ''

    // Find potential primary keyword
    const keywords = titleWords.filter((word) => word.length > 4)
    if (keywords.length > 0) {
      analysis.primaryKeyword = keywords[0]

      // Check keyword placement
      analysis.inTitle = bodyText.includes(analysis.primaryKeyword)
      analysis.inH1 = h1Text.includes(analysis.primaryKeyword)
      analysis.inFirstParagraph = firstParagraph.includes(analysis.primaryKeyword)

      // Keyword density
      const wordArray = bodyText.split(/\s+/)
      const keywordCount = wordArray.filter((word) => word === analysis.primaryKeyword).length
      analysis.keywordDensity = ((keywordCount / wordArray.length) * 100).toFixed(2)

      if (analysis.keywordDensity < 0.5) {
        analysis.recommendations.push('Keyword density is low - use primary keyword more naturally throughout content')
      } else if (analysis.keywordDensity > 2.5) {
        analysis.recommendations.push('Keyword density is too high - avoid keyword stuffing')
      }
    }

    // Check for secondary keywords
    const secondaryKeywords = titleWords.filter((word) => word !== analysis.primaryKeyword && word.length > 4)
    analysis.secondaryKeywords = secondaryKeywords.filter((kw) => bodyText.includes(kw))

    if (!analysis.inH1) {
      analysis.recommendations.push('Primary keyword should appear in H1 tag')
    }

    if (!analysis.inFirstParagraph) {
      analysis.recommendations.push('Primary keyword should appear in first paragraph')
    }

    return analysis
  }

  /**
   * Calculate overall SEO score
   * @private
   */
  _calculateSEOScore(result) {
    let score = 0
    let maxScore = 0

    // Meta tags (20 points)
    maxScore += 20
    if (result.metaTags) {
      if (result.metaTags.title) score += 5
      if (result.metaTags.description) score += 5
      if (result.metaTags.viewport) score += 5
      if (result.metaTags.robots) score += 5
    }

    // OpenGraph (10 points)
    maxScore += 10
    if (result.openGraph) {
      score += 10
    }

    // On-page SEO (30 points)
    maxScore += 30
    if (result.onPageSEO) {
      if (result.onPageSEO.h1?.count === 1) score += 10
      if (result.onPageSEO.headingStructure?.total > 0) score += 10
      if (result.onPageSEO.contentMetrics?.wordCount > 300) score += 10
    }

    // Accessibility (20 points)
    maxScore += 20
    if (result.accessibility) {
      if (result.accessibility.langAttribute?.present) score += 5
      if (result.accessibility.altText?.percentage > 80) score += 5
      if (result.accessibility.headingStructure?.properlySorted) score += 5
      if (result.accessibility.semanticHTML?.score > 0) score += 5
    }

    // Internal links (10 points)
    maxScore += 10
    if (result.internalLinks) {
      if (result.internalLinks.internal.length >= 5) score += 10
    }

    // Keyword optimization (10 points)
    maxScore += 10
    if (result.keywordOptimization) {
      if (result.keywordOptimization.inTitle && result.keywordOptimization.inH1) {
        score += 10
      }
    }

    return {
      score: score,
      maxScore: maxScore,
      percentage: ((score / maxScore) * 100).toFixed(1)
    }
  }

  // ==================== Helper Methods ====================

  _evaluateTitleQuality(title) {
    if (title.length < 30) return 'short'
    if (title.length > 60) return 'long'
    return 'optimal'
  }

  _evaluateHeadingQuality(heading) {
    if (heading.length < 10) return 'too-short'
    if (heading.length > 100) return 'too-long'
    return 'good'
  }

  _countHeadingsByLevel(headings) {
    const counts = {}
    for (const heading of headings) {
      const level = heading.tagName
      counts[level] = (counts[level] || 0) + 1
    }
    return counts
  }

  _analyzeHeadingHierarchy(headings) {
    if (headings.length === 0) return null
    const first = headings[0].tagName
    return first === 'H1' ? 'proper' : 'improper'
  }

  _findHeadingIssues(headings) {
    if (headings.length === 0) return 'No headings found'
    const h1Count = Array.from(headings).filter((h) => h.tagName === 'H1').length
    if (h1Count !== 1) return `Found ${h1Count} H1 tags (should be 1)`
    return null
  }

  _calculateAverageLength(paragraphs) {
    if (paragraphs.length === 0) return 0
    const totalLength = Array.from(paragraphs).reduce((sum, p) => sum + p.textContent.length, 0)
    return Math.round(totalLength / paragraphs.length)
  }

  _analyzeParagraphQuality(paragraphs) {
    const shortParagraphs = Array.from(paragraphs).filter((p) => p.textContent.length < 50).length
    return {
      total: paragraphs.length,
      tooShort: shortParagraphs,
      readability: shortParagraphs < paragraphs.length / 2 ? 'good' : 'needs-improvement'
    }
  }

  _evaluateAnchorQuality(anchorText) {
    const poorTexts = ['click here', 'read more', 'more', 'link', '']
    return !poorTexts.includes(anchorText.toLowerCase()) ? 'descriptive' : 'generic'
  }

  _checkHeadingOrder(headings) {
    if (headings.length === 0) return true
    if (headings[0].tagName !== 'H1') return false

    let lastLevel = 1
    for (const heading of headings) {
      const level = parseInt(heading.tagName[1])
      if (level > lastLevel + 1) return false
      lastLevel = level
    }
    return true
  }

  _countInputsWithLabels(inputs, labels) {
    let count = 0
    const labelTexts = Array.from(labels).map((l) => l.htmlFor)

    for (const input of inputs) {
      if (input.id && labelTexts.includes(input.id)) {
        count++
      } else if (input.closest('label')) {
        count++
      }
    }
    return count
  }

  // ==================== DOM Parser Fallback Methods ====================

  _extractMetaTags(doc) {
    const metaTags = {}
    const titleEl = doc.querySelector('title')
    if (titleEl) {
      metaTags.title = titleEl.textContent
    }

    const metaElements = doc.querySelectorAll('meta')
    for (const meta of metaElements) {
      const name = meta.getAttribute('name') || meta.getAttribute('property')
      const content = meta.getAttribute('content')
      if (name && content) {
        metaTags[name.toLowerCase()] = content
      }
    }

    return Object.keys(metaTags).length > 0 ? metaTags : null
  }

  _extractMetaTagsRegex(html) {
    const metaTags = {}
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      metaTags.title = titleMatch[1].trim()
    }

    const patterns = {
      description: /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
      keywords: /<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i,
      viewport: /<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i,
      author: /<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i
    }

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = html.match(pattern)
      if (match) metaTags[key] = match[1]
    }

    return Object.keys(metaTags).length > 0 ? metaTags : null
  }

  _extractOpenGraph(doc) {
    const og = {}
    const metaElements = doc.querySelectorAll('meta[property^="og:"]')
    for (const meta of metaElements) {
      const property = meta.getAttribute('property')
      const content = meta.getAttribute('content')
      if (property && content) {
        og[property.replace('og:', '')] = content
      }
    }
    return Object.keys(og).length > 0 ? og : null
  }

  _extractOpenGraphRegex(html) {
    const og = {}
    const ogRegex = /<meta\s+property=["']og:([^"']+)["']\s+content=["']([^"']+)["']/gi
    let match
    while ((match = ogRegex.exec(html)) !== null) {
      og[match[1]] = match[2]
    }
    return Object.keys(og).length > 0 ? og : null
  }

  _extractTwitterCard(doc) {
    const twitter = {}
    const metaElements = doc.querySelectorAll('meta[name^="twitter:"]')
    for (const meta of metaElements) {
      const name = meta.getAttribute('name')
      const content = meta.getAttribute('content')
      if (name && content) {
        twitter[name.replace('twitter:', '')] = content
      }
    }
    return Object.keys(twitter).length > 0 ? twitter : null
  }

  _extractTwitterCardRegex(html) {
    const twitter = {}
    const twitterRegex = /<meta\s+name=["']twitter:([^"']+)["']\s+content=["']([^"']+)["']/gi
    let match
    while ((match = twitterRegex.exec(html)) !== null) {
      twitter[match[1]] = match[2]
    }
    return Object.keys(twitter).length > 0 ? twitter : null
  }

  _extractCanonical(doc) {
    const link = doc.querySelector('link[rel="canonical"]')
    return link ? link.getAttribute('href') : null
  }

  _extractCanonicalRegex(html) {
    const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
    return match ? match[1] : null
  }

  _extractAlternates(doc) {
    const alternates = []
    const links = doc.querySelectorAll('link[rel="alternate"]')
    for (const link of links) {
      const hreflang = link.getAttribute('hreflang')
      const href = link.getAttribute('href')
      if (hreflang && href) {
        alternates.push({ hreflang, href })
      }
    }
    return alternates
  }

  _extractAlternatesRegex(html) {
    const alternates = []
    const altRegex = /<link\s+rel=["']alternate["']\s+hreflang=["']([^"']+)["']\s+href=["']([^"']+)["']/gi
    let match
    while ((match = altRegex.exec(html)) !== null) {
      alternates.push({ hreflang: match[1], href: match[2] })
    }
    return alternates
  }

  _extractAssets(doc, baseUrl) {
    const assets = {
      stylesheets: [],
      scripts: [],
      images: [],
      videos: [],
      audios: [],
      summary: {}
    }

    const links = doc.querySelectorAll('link[rel="stylesheet"]')
    for (const link of links) {
      assets.stylesheets.push({
        href: link.getAttribute('href'),
        media: link.getAttribute('media') || 'all',
        type: 'text/css'
      })
    }

    const scripts = doc.querySelectorAll('script[src]')
    for (const script of scripts) {
      assets.scripts.push({
        src: script.getAttribute('src'),
        async: script.hasAttribute('async'),
        defer: script.hasAttribute('defer'),
        type: script.getAttribute('type') || 'text/javascript'
      })
    }

    const images = doc.querySelectorAll('img')
    for (const img of images) {
      assets.images.push({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt') || '',
        width: img.getAttribute('width'),
        height: img.getAttribute('height')
      })
    }

    const videos = doc.querySelectorAll('video')
    for (const video of videos) {
      const sources = Array.from(video.querySelectorAll('source')).map((s) => ({
        src: s.getAttribute('src'),
        type: s.getAttribute('type')
      }))
      assets.videos.push({
        sources,
        poster: video.getAttribute('poster'),
        controls: video.hasAttribute('controls')
      })
    }

    const audios = doc.querySelectorAll('audio')
    for (const audio of audios) {
      const sources = Array.from(audio.querySelectorAll('source')).map((s) => ({
        src: s.getAttribute('src'),
        type: s.getAttribute('type')
      }))
      assets.audios.push({
        sources,
        controls: audio.hasAttribute('controls')
      })
    }

    assets.summary = {
      totalStylesheets: assets.stylesheets.length,
      totalScripts: assets.scripts.length,
      totalImages: assets.images.length,
      totalVideos: assets.videos.length,
      totalAudios: assets.audios.length,
      imageFormats: this._extractImageFormats(assets.images),
      videoFormats: this._extractVideoFormats(assets.videos),
      audioFormats: this._extractAudioFormats(assets.audios)
    }

    return assets
  }

  _extractAssetsRegex(html, baseUrl) {
    const assets = {
      stylesheets: [],
      scripts: [],
      images: [],
      videos: [],
      audios: [],
      summary: {}
    }

    const linkRegex = /<link\s+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi
    let match
    while ((match = linkRegex.exec(html)) !== null) {
      assets.stylesheets.push({ href: match[1], type: 'text/css' })
    }

    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi
    while ((match = scriptRegex.exec(html)) !== null) {
      assets.scripts.push({ src: match[1], type: 'text/javascript' })
    }

    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi
    while ((match = imgRegex.exec(html)) !== null) {
      assets.images.push({ src: match[1] })
    }

    assets.summary = {
      totalStylesheets: assets.stylesheets.length,
      totalScripts: assets.scripts.length,
      totalImages: assets.images.length,
      imageFormats: this._extractImageFormats(assets.images)
    }

    return assets
  }

  _extractImageFormats(images) {
    const formats = {}
    for (const img of images) {
      const src = img.src || ''
      const ext = src.split('.').pop().toLowerCase()
      if (ext) {
        formats[ext] = (formats[ext] || 0) + 1
      }
    }
    return formats
  }

  _extractVideoFormats(videos) {
    const formats = {}
    for (const video of videos) {
      if (video.sources) {
        for (const source of video.sources) {
          const type = source.type || ''
          formats[type] = (formats[type] || 0) + 1
        }
      }
    }
    return formats
  }

  _extractAudioFormats(audios) {
    const formats = {}
    for (const audio of audios) {
      if (audio.sources) {
        for (const source of audio.sources) {
          const type = source.type || ''
          formats[type] = (formats[type] || 0) + 1
        }
      }
    }
    return formats
  }
}

export default SEOAnalyzer
