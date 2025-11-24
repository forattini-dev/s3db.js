/**
 * Example 107: Amazon Product SEO Quality Analysis
 *
 * Demonstrates comprehensive SEO analysis using the Spider Plugin:
 * - OpenGraph metadata extraction and validation
 * - Meta tags analysis (title, description, keywords)
 * - Twitter Cards implementation
 * - Structured data extraction (JSON-LD, Schema.org)
 * - Heading structure analysis (H1-H6 hierarchy)
 * - Image alt text validation
 * - Internal/external link analysis
 * - Canonical URL detection
 * - hreflang internationalization tags
 * - Mobile-friendliness indicators
 * - Page performance metrics
 * - SEO score calculation with recommendations
 *
 * Real-world use cases:
 * - SEO audits and monitoring
 * - Content quality analysis
 * - Competitor SEO comparison
 * - OpenGraph preview validation
 * - Structured data testing
 * - Accessibility compliance
 */

import { Database } from '../../src/database.class.js'
import { SpiderPlugin } from '../../src/plugins/spider.plugin.js'

async function analyzeSEO() {
  console.log('🔍 Amazon Product SEO Quality Analysis\n')
  console.log('━'.repeat(60))

  // Initialize database
  const db = new Database({
    connectionString: 'memory://seo-analyzer/db'
  })
  await db.connect()

  // Create resource for storing SEO analysis data
  await db.createResource({
    name: 'seo_reports',
    attributes: {
      url: 'string|required',
      asin: 'string|optional',

      // OpenGraph metadata
      openGraph: 'object|optional',        // og:* tags

      // Meta tags
      metaTags: 'object|optional',         // title, description, keywords, robots

      // Twitter Cards
      twitterCard: 'object|optional',      // twitter:* tags

      // Structured data
      structuredData: 'array|optional',    // JSON-LD scripts

      // Content structure
      headings: 'object|optional',         // H1-H6 hierarchy
      images: 'array|optional',            // Image analysis
      links: 'object|optional',            // Internal/external links

      // Internationalization
      hreflang: 'array|optional',          // Language alternates
      canonical: 'string|optional',

      // Performance
      performance: 'object|optional',      // Load times, metrics

      // SEO Score
      seoScore: 'object|optional',         // Score + recommendations

      // Metadata
      analyzedAt: 'string|required',
      analysisVersion: 'string|optional'
    }
  })

  // Configure Spider Plugin with Puppeteer
  const spider = new SpiderPlugin({
    namespace: 'seo-analyzer',

    // URL pattern matching
    patterns: {
      productPage: {
        match: /amazon\\.com\\/.*\\/dp\\/([A-Z0-9]{10})/,
        activities: ['analyze_seo'],
        metadata: { type: 'product' }
      }
    },

    // Puppeteer configuration
    puppeteer: {
      headless: true,
      defaultViewport: { width: 1920, height: 1080 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    },

    // Queue settings
    queue: {
      autoStart: true,
      concurrency: 2,
      retryAttempts: 2
    }
  })

  await db.usePlugin(spider, 'spider')

  // Register custom activity for SEO analysis
  spider.registerActivity('analyze_seo', async ({ page, url, metadata }) => {
    console.log(`\n🔎 Analyzing SEO: ${url}`)

    try {
      // Wait for page load
      await page.waitForSelector('#productTitle', { timeout: 10000 })

      // Extract ASIN from URL
      const asinMatch = url.match(/\\/dp\\/([A-Z0-9]{10})/)
      const asin = asinMatch ? asinMatch[1] : null

      // 1. Extract OpenGraph metadata
      console.log('   📊 Extracting OpenGraph metadata...')
      const openGraph = await page.evaluate(() => {
        const og = {}
        const ogTags = document.querySelectorAll('meta[property^="og:"]')

        ogTags.forEach(tag => {
          const property = tag.getAttribute('property').replace('og:', '')
          const content = tag.getAttribute('content')
          og[property] = content
        })

        return og
      })

      // 2. Extract Meta Tags
      console.log('   🏷️  Extracting meta tags...')
      const metaTags = await page.evaluate(() => {
        return {
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || null,
          keywords: document.querySelector('meta[name="keywords"]')?.content || null,
          robots: document.querySelector('meta[name="robots"]')?.content || null,
          viewport: document.querySelector('meta[name="viewport"]')?.content || null,
          author: document.querySelector('meta[name="author"]')?.content || null,
          charset: document.characterSet,
          language: document.documentElement.lang
        }
      })

      // 3. Extract Twitter Cards
      console.log('   🐦 Extracting Twitter Card data...')
      const twitterCard = await page.evaluate(() => {
        const twitter = {}
        const twitterTags = document.querySelectorAll('meta[name^="twitter:"], meta[property^="twitter:"]')

        twitterTags.forEach(tag => {
          const name = (tag.getAttribute('name') || tag.getAttribute('property')).replace('twitter:', '')
          const content = tag.getAttribute('content')
          twitter[name] = content
        })

        return twitter
      })

      // 4. Extract Structured Data (JSON-LD)
      console.log('   📋 Extracting structured data...')
      const structuredData = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]')
        const data = []

        scripts.forEach(script => {
          try {
            const parsed = JSON.parse(script.textContent)
            data.push(parsed)
          } catch (e) {
            // Ignore invalid JSON-LD
          }
        })

        return data
      })

      // 5. Analyze Heading Structure
      console.log('   📝 Analyzing heading structure...')
      const headings = await page.evaluate(() => {
        const structure = {
          h1: [],
          h2: [],
          h3: [],
          h4: [],
          h5: [],
          h6: []
        }

        for (let level = 1; level <= 6; level++) {
          const tags = document.querySelectorAll(`h${level}`)
          structure[`h${level}`] = Array.from(tags).map(tag => ({
            text: tag.textContent.trim().substring(0, 100),
            length: tag.textContent.trim().length
          }))
        }

        return structure
      })

      // 6. Analyze Images (alt text, lazy loading)
      console.log('   🖼️  Analyzing images...')
      const images = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img')
        const analysis = []

        imgs.forEach(img => {
          analysis.push({
            src: img.src.substring(0, 100),
            alt: img.alt || null,
            hasAlt: !!img.alt,
            loading: img.loading || 'eager',
            width: img.width,
            height: img.height,
            isLazy: img.loading === 'lazy' || img.classList.contains('lazy')
          })
        })

        // Limit to first 50 images
        return analysis.slice(0, 50)
      })

      // 7. Analyze Links (internal/external)
      console.log('   🔗 Analyzing links...')
      const links = await page.evaluate(() => {
        const allLinks = document.querySelectorAll('a[href]')
        const hostname = window.location.hostname

        let internal = 0
        let external = 0
        let nofollow = 0
        const externalDomains = []

        allLinks.forEach(link => {
          const href = link.href
          const rel = link.rel || ''

          if (href.includes(hostname)) {
            internal++
          } else if (href.startsWith('http')) {
            external++
            try {
              const domain = new URL(href).hostname
              if (!externalDomains.includes(domain)) {
                externalDomains.push(domain)
              }
            } catch (e) {}
          }

          if (rel.includes('nofollow')) {
            nofollow++
          }
        })

        return {
          total: allLinks.length,
          internal,
          external,
          nofollow,
          externalDomains: externalDomains.slice(0, 20) // Top 20
        }
      })

      // 8. Extract Canonical URL
      console.log('   🔗 Extracting canonical URL...')
      const canonical = await page.evaluate(() => {
        const canonicalTag = document.querySelector('link[rel="canonical"]')
        return canonicalTag ? canonicalTag.href : null
      })

      // 9. Extract hreflang tags
      console.log('   🌐 Extracting hreflang tags...')
      const hreflang = await page.evaluate(() => {
        const tags = document.querySelectorAll('link[rel="alternate"][hreflang]')
        return Array.from(tags).map(tag => ({
          hreflang: tag.hreflang,
          href: tag.href
        }))
      })

      // 10. Extract Performance Metrics
      console.log('   ⚡ Collecting performance metrics...')
      const performance = await page.evaluate(() => {
        const perf = window.performance
        const timing = perf.timing
        const navigation = perf.getEntriesByType('navigation')[0]

        return {
          // Load times
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          loadComplete: timing.loadEventEnd - timing.navigationStart,

          // Navigation timing
          dns: timing.domainLookupEnd - timing.domainLookupStart,
          tcp: timing.connectEnd - timing.connectStart,
          ttfb: timing.responseStart - timing.navigationStart,
          download: timing.responseEnd - timing.responseStart,
          domInteractive: timing.domInteractive - timing.navigationStart,

          // Resource counts
          resourceCount: perf.getEntriesByType('resource').length,

          // Memory (if available)
          memory: performance.memory ? {
            usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
            totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
          } : null
        }
      })

      // 11. Calculate SEO Score
      console.log('   📊 Calculating SEO score...')
      const seoScore = calculateSEOScore({
        openGraph,
        metaTags,
        twitterCard,
        structuredData,
        headings,
        images,
        links,
        canonical,
        hreflang,
        performance
      })

      // Compile SEO report
      const report = {
        url,
        asin,
        openGraph,
        metaTags,
        twitterCard,
        structuredData,
        headings,
        images,
        links,
        canonical,
        hreflang,
        performance,
        seoScore,
        analyzedAt: new Date().toISOString(),
        analysisVersion: '1.0.0'
      }

      // Save to database
      const resource = await db.getResource('seo_reports')
      await resource.insert(report)

      // Display summary
      console.log('✅ SEO Analysis Complete:')
      console.log(`   URL: ${url}`)
      console.log(`   ASIN: ${asin}`)
      console.log(`\n   📊 SEO Score: ${seoScore.total}/100`)
      console.log(`   OpenGraph: ${seoScore.breakdown.openGraph}/15`)
      console.log(`   Meta Tags: ${seoScore.breakdown.metaTags}/15`)
      console.log(`   Structured Data: ${seoScore.breakdown.structuredData}/15`)
      console.log(`   Content: ${seoScore.breakdown.content}/20`)
      console.log(`   Technical: ${seoScore.breakdown.technical}/20`)
      console.log(`   Performance: ${seoScore.breakdown.performance}/15`)

      if (seoScore.recommendations.length > 0) {
        console.log(`\n   ⚠️  Recommendations (${seoScore.recommendations.length}):`)
        seoScore.recommendations.slice(0, 5).forEach(rec => {
          console.log(`      - ${rec}`)
        })
      }

      return {
        success: true,
        data: report
      }

    } catch (error) {
      console.error(`❌ Error analyzing ${url}:`, error.message)
      return {
        success: false,
        error: error.message
      }
    }
  })

  // Example 1: Single product SEO analysis
  console.log('\n📌 Example 1: Single Product SEO Analysis')
  console.log('━'.repeat(60))

  await spider.enqueueTarget({
    url: 'https://www.amazon.com/dp/B0BSHF7WHW',  // Example: Echo Dot
    activities: ['analyze_seo']
  })

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 8000))

  // Example 2: Multiple products comparison
  console.log('\n\n📌 Example 2: SEO Comparison Across Products')
  console.log('━'.repeat(60))

  const products = [
    'https://www.amazon.com/dp/B0BSHF7WHW',  // Echo Dot
    'https://www.amazon.com/dp/B09B8V1LZ3',  // Echo Show
    'https://www.amazon.com/dp/B08MQLDG7D'   // Echo 4th Gen
  ]

  for (const url of products) {
    await spider.enqueueTarget({
      url,
      activities: ['analyze_seo'],
      priority: 10
    })
  }

  // Wait for all to complete
  await new Promise(resolve => setTimeout(resolve, 20000))

  // Example 3: Query and compare SEO scores
  console.log('\n\n📌 Example 3: SEO Score Comparison')
  console.log('━'.repeat(60))

  const resource = await db.getResource('seo_reports')
  const allReports = await resource.list({ limit: 100 })

  console.log(`\n📊 Total reports: ${allReports.length}`)

  if (allReports.length > 0) {
    console.log('\n🏆 SEO Score Rankings:')
    const sorted = allReports
      .filter(r => r.seoScore)
      .sort((a, b) => b.seoScore.total - a.seoScore.total)

    sorted.forEach((report, idx) => {
      const scoreBar = '█'.repeat(Math.round(report.seoScore.total / 10)) +
                       '░'.repeat(10 - Math.round(report.seoScore.total / 10))

      console.log(`\n${idx + 1}. ${report.metaTags.title?.substring(0, 50)}...`)
      console.log(`   Score: ${scoreBar} ${report.seoScore.total}/100`)
      console.log(`   ASIN: ${report.asin}`)
      console.log(`   Issues: ${report.seoScore.recommendations.length}`)
    })
  }

  // Example 4: OpenGraph validation
  console.log('\n\n📌 Example 4: OpenGraph Validation')
  console.log('━'.repeat(60))

  const ogReport = allReports.find(r => r.openGraph && Object.keys(r.openGraph).length > 0)

  if (ogReport) {
    console.log('\n📊 OpenGraph Tags:')
    console.log(`   og:title: ${ogReport.openGraph.title || '❌ Missing'}`)
    console.log(`   og:description: ${ogReport.openGraph.description?.substring(0, 60) || '❌ Missing'}...`)
    console.log(`   og:image: ${ogReport.openGraph.image ? '✅ Present' : '❌ Missing'}`)
    console.log(`   og:url: ${ogReport.openGraph.url || '❌ Missing'}`)
    console.log(`   og:type: ${ogReport.openGraph.type || '❌ Missing'}`)
    console.log(`   og:site_name: ${ogReport.openGraph.site_name || '❌ Missing'}`)

    // Social media preview
    console.log('\n📱 Social Media Preview:')
    console.log(`   ${ogReport.openGraph.title || 'Untitled'}`)
    console.log(`   ${ogReport.openGraph.description?.substring(0, 150) || 'No description'}...`)
    if (ogReport.openGraph.image) {
      console.log(`   🖼️  Image: ${ogReport.openGraph.image.substring(0, 60)}...`)
    }
  }

  // Example 5: Structured Data Analysis
  console.log('\n\n📌 Example 5: Structured Data (Schema.org) Analysis')
  console.log('━'.repeat(60))

  const structuredReport = allReports.find(r => r.structuredData && r.structuredData.length > 0)

  if (structuredReport) {
    console.log(`\n📋 Found ${structuredReport.structuredData.length} structured data blocks:`)

    structuredReport.structuredData.forEach((data, idx) => {
      const type = data['@type'] || (Array.isArray(data['@graph']) ? 'Graph' : 'Unknown')
      console.log(`\n${idx + 1}. Type: ${type}`)

      if (type === 'Product') {
        console.log(`   ✅ Product Schema`)
        console.log(`      Name: ${data.name || 'N/A'}`)
        console.log(`      Brand: ${data.brand?.name || 'N/A'}`)
        console.log(`      SKU: ${data.sku || 'N/A'}`)

        if (data.offers) {
          console.log(`      Price: ${data.offers.price || 'N/A'} ${data.offers.priceCurrency || ''}`)
          console.log(`      Availability: ${data.offers.availability || 'N/A'}`)
        }

        if (data.aggregateRating) {
          console.log(`      Rating: ${data.aggregateRating.ratingValue}/5 (${data.aggregateRating.reviewCount} reviews)`)
        }
      } else if (type === 'Organization') {
        console.log(`   ✅ Organization Schema`)
        console.log(`      Name: ${data.name || 'N/A'}`)
        console.log(`      URL: ${data.url || 'N/A'}`)
      } else if (type === 'BreadcrumbList') {
        console.log(`   ✅ Breadcrumb Schema`)
        console.log(`      Items: ${data.itemListElement?.length || 0}`)
      }
    })
  } else {
    console.log('\n⚠️  No structured data found')
  }

  // Example 6: Content Quality Analysis
  console.log('\n\n📌 Example 6: Content Quality & Structure')
  console.log('━'.repeat(60))

  const contentReport = allReports[0]

  if (contentReport) {
    console.log('\n📝 Heading Structure:')
    Object.entries(contentReport.headings).forEach(([level, headings]) => {
      if (headings.length > 0) {
        console.log(`   ${level.toUpperCase()}: ${headings.length} found`)
        headings.slice(0, 3).forEach(h => {
          console.log(`      - ${h.text.substring(0, 60)}${h.text.length > 60 ? '...' : ''}`)
        })
      }
    })

    console.log('\n🖼️  Image Analysis:')
    const totalImages = contentReport.images.length
    const withAlt = contentReport.images.filter(img => img.hasAlt).length
    const lazyLoaded = contentReport.images.filter(img => img.isLazy).length

    console.log(`   Total: ${totalImages}`)
    console.log(`   With alt text: ${withAlt} (${Math.round(withAlt / totalImages * 100)}%)`)
    console.log(`   Lazy loaded: ${lazyLoaded} (${Math.round(lazyLoaded / totalImages * 100)}%)`)

    console.log('\n🔗 Link Analysis:')
    console.log(`   Total: ${contentReport.links.total}`)
    console.log(`   Internal: ${contentReport.links.internal}`)
    console.log(`   External: ${contentReport.links.external}`)
    console.log(`   Nofollow: ${contentReport.links.nofollow}`)
    if (contentReport.links.externalDomains.length > 0) {
      console.log(`   External domains: ${contentReport.links.externalDomains.slice(0, 5).join(', ')}`)
    }
  }

  // Example 7: Performance Metrics
  console.log('\n\n📌 Example 7: Performance Metrics')
  console.log('━'.repeat(60))

  const perfReport = allReports[0]

  if (perfReport && perfReport.performance) {
    const perf = perfReport.performance

    console.log('\n⚡ Load Times:')
    console.log(`   DOM Content Loaded: ${perf.domContentLoaded}ms`)
    console.log(`   Page Load Complete: ${perf.loadComplete}ms`)
    console.log(`   Time to First Byte: ${perf.ttfb}ms`)
    console.log(`   DOM Interactive: ${perf.domInteractive}ms`)

    console.log('\n🌐 Network:')
    console.log(`   DNS Lookup: ${perf.dns}ms`)
    console.log(`   TCP Connection: ${perf.tcp}ms`)
    console.log(`   Download: ${perf.download}ms`)

    console.log('\n📦 Resources:')
    console.log(`   Total Resources: ${perf.resourceCount}`)

    if (perf.memory) {
      console.log('\n💾 Memory:')
      console.log(`   Used JS Heap: ${perf.memory.usedJSHeapSize}MB`)
      console.log(`   Total JS Heap: ${perf.memory.totalJSHeapSize}MB`)
    }
  }

  // Cleanup
  await spider.destroy()
  await db.disconnect()

  console.log('\n✨ SEO Analysis Complete!\n')
}

// SEO Score Calculation Function
function calculateSEOScore(data) {
  const scores = {
    openGraph: 0,
    metaTags: 0,
    structuredData: 0,
    content: 0,
    technical: 0,
    performance: 0
  }
  const recommendations = []

  // OpenGraph (15 points)
  if (data.openGraph.title) scores.openGraph += 3
  else recommendations.push('Add og:title for better social sharing')

  if (data.openGraph.description) scores.openGraph += 3
  else recommendations.push('Add og:description for social previews')

  if (data.openGraph.image) scores.openGraph += 4
  else recommendations.push('Add og:image for visual social cards')

  if (data.openGraph.url) scores.openGraph += 2
  if (data.openGraph.type) scores.openGraph += 2
  if (data.openGraph.site_name) scores.openGraph += 1

  // Meta Tags (15 points)
  if (data.metaTags.title && data.metaTags.title.length > 0) scores.metaTags += 4
  else recommendations.push('Add page title')

  if (data.metaTags.title && data.metaTags.title.length >= 30 && data.metaTags.title.length <= 60) {
    scores.metaTags += 2
  } else if (data.metaTags.title) {
    recommendations.push(`Title length: ${data.metaTags.title.length} (optimal: 30-60 chars)`)
  }

  if (data.metaTags.description && data.metaTags.description.length > 0) scores.metaTags += 4
  else recommendations.push('Add meta description')

  if (data.metaTags.description && data.metaTags.description.length >= 120 && data.metaTags.description.length <= 160) {
    scores.metaTags += 2
  } else if (data.metaTags.description) {
    recommendations.push(`Description length: ${data.metaTags.description.length} (optimal: 120-160 chars)`)
  }

  if (data.metaTags.viewport) scores.metaTags += 2
  else recommendations.push('Add viewport meta tag for mobile')

  if (data.metaTags.charset) scores.metaTags += 1

  // Structured Data (15 points)
  if (data.structuredData.length > 0) {
    scores.structuredData += 5

    const hasProduct = data.structuredData.some(d => d['@type'] === 'Product')
    const hasOrg = data.structuredData.some(d => d['@type'] === 'Organization')
    const hasBreadcrumb = data.structuredData.some(d => d['@type'] === 'BreadcrumbList')

    if (hasProduct) scores.structuredData += 5
    else recommendations.push('Add Product structured data')

    if (hasOrg) scores.structuredData += 3
    if (hasBreadcrumb) scores.structuredData += 2
  } else {
    recommendations.push('Add Schema.org structured data (JSON-LD)')
  }

  // Content (20 points)
  const h1Count = data.headings.h1.length
  if (h1Count === 1) scores.content += 5
  else if (h1Count === 0) recommendations.push('Add exactly one H1 heading')
  else recommendations.push(`Multiple H1 tags found (${h1Count}), use only one`)

  if (data.headings.h2.length > 0) scores.content += 3
  if (data.headings.h3.length > 0) scores.content += 2

  const imageWithAlt = data.images.filter(img => img.hasAlt).length
  const altPercentage = data.images.length > 0 ? imageWithAlt / data.images.length : 0

  if (altPercentage >= 0.9) scores.content += 5
  else if (altPercentage >= 0.7) scores.content += 3
  else recommendations.push(`${Math.round((1 - altPercentage) * 100)}% of images missing alt text`)

  if (data.links.internal > data.links.external) scores.content += 3
  if (data.links.total > 10) scores.content += 2

  // Technical (20 points)
  if (data.canonical) scores.technical += 5
  else recommendations.push('Add canonical URL')

  if (data.hreflang.length > 0) scores.technical += 5

  if (data.twitterCard.card) scores.technical += 3
  else recommendations.push('Add Twitter Card metadata')

  if (data.twitterCard.title && data.twitterCard.description) scores.technical += 3
  if (data.twitterCard.image) scores.technical += 2

  if (data.metaTags.robots !== 'noindex') scores.technical += 2
  else recommendations.push('Page is set to noindex')

  // Performance (15 points)
  if (data.performance.loadComplete < 3000) scores.performance += 5
  else if (data.performance.loadComplete < 5000) scores.performance += 3
  else recommendations.push(`Slow page load: ${data.performance.loadComplete}ms (target: <3000ms)`)

  if (data.performance.ttfb < 600) scores.performance += 5
  else if (data.performance.ttfb < 1000) scores.performance += 3
  else recommendations.push(`Slow TTFB: ${data.performance.ttfb}ms (target: <600ms)`)

  const lazyImages = data.images.filter(img => img.isLazy).length
  const lazyPercentage = data.images.length > 0 ? lazyImages / data.images.length : 0

  if (lazyPercentage >= 0.5) scores.performance += 3
  if (data.performance.resourceCount < 100) scores.performance += 2

  // Calculate total
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0)

  return {
    total,
    breakdown: scores,
    recommendations,
    grade: total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F'
  }
}

// Run demonstration
analyzeSEO().catch(console.error)

/**
 * Expected Console Output:
 *
 * 🔍 Amazon Product SEO Quality Analysis
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📌 Example 1: Single Product SEO Analysis
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 🔎 Analyzing SEO: https://www.amazon.com/dp/B0BSHF7WHW
 *    📊 Extracting OpenGraph metadata...
 *    🏷️  Extracting meta tags...
 *    🐦 Extracting Twitter Card data...
 *    📋 Extracting structured data...
 *    📝 Analyzing heading structure...
 *    🖼️  Analyzing images...
 *    🔗 Analyzing links...
 *    🔗 Extracting canonical URL...
 *    🌐 Extracting hreflang tags...
 *    ⚡ Collecting performance metrics...
 *    📊 Calculating SEO score...
 * ✅ SEO Analysis Complete:
 *    URL: https://www.amazon.com/dp/B0BSHF7WHW
 *    ASIN: B0BSHF7WHW
 *
 *    📊 SEO Score: 87/100
 *    OpenGraph: 15/15
 *    Meta Tags: 13/15
 *    Structured Data: 15/15
 *    Content: 18/20
 *    Technical: 15/20
 *    Performance: 11/15
 *
 *    ⚠️  Recommendations (5):
 *       - Description length: 168 (optimal: 120-160 chars)
 *       - Add hreflang tags for international SEO
 *       - 5% of images missing alt text
 *       - Slow TTFB: 850ms (target: <600ms)
 *       - Enable lazy loading for more images
 *
 * 📌 Example 2: SEO Comparison Across Products
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ...
 *
 * 📌 Example 3: SEO Score Comparison
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📊 Total reports: 3
 *
 * 🏆 SEO Score Rankings:
 *
 * 1. Echo Dot (5th Gen, 2022 release) | With bigger...
 *    Score: ████████░░ 87/100
 *    ASIN: B0BSHF7WHW
 *    Issues: 5
 *
 * 2. Echo Show 8 (2nd Gen, 2021 release) | HD smar...
 *    Score: ████████░░ 84/100
 *    ASIN: B09B8V1LZ3
 *    Issues: 7
 *
 * 3. Echo (4th Gen) | With premium sound, smart hom...
 *    Score: ███████░░░ 79/100
 *    ASIN: B08MQLDG7D
 *    Issues: 9
 *
 * 📌 Example 4: OpenGraph Validation
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📊 OpenGraph Tags:
 *    og:title: Echo Dot (5th Gen) - Smart speaker with Alexa
 *    og:description: Echo Dot is our most popular smart speaker with a sle...
 *    og:image: ✅ Present
 *    og:url: https://www.amazon.com/dp/B0BSHF7WHW
 *    og:type: product
 *    og:site_name: Amazon.com
 *
 * 📱 Social Media Preview:
 *    Echo Dot (5th Gen) - Smart speaker with Alexa
 *    Echo Dot is our most popular smart speaker with a sleek, compact design...
 *    🖼️  Image: https://m.media-amazon.com/images/I/61lhzOl89JL._AC_SL150...
 *
 * 📌 Example 5: Structured Data (Schema.org) Analysis
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📋 Found 3 structured data blocks:
 *
 * 1. Type: Product
 *    ✅ Product Schema
 *       Name: Echo Dot (5th Gen, 2022 release)
 *       Brand: Amazon
 *       SKU: B0BSHF7WHW
 *       Price: 49.99 USD
 *       Availability: https://schema.org/InStock
 *       Rating: 4.7/5 (45234 reviews)
 *
 * 2. Type: Organization
 *    ✅ Organization Schema
 *       Name: Amazon.com
 *       URL: https://www.amazon.com
 *
 * 3. Type: BreadcrumbList
 *    ✅ Breadcrumb Schema
 *       Items: 4
 *
 * ✨ SEO Analysis Complete!
 */
