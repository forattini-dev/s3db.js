/**
 * Example 105: Deep Discovery - Comprehensive Website Intelligence
 *
 * Demonstrates automated deep discovery of website resources:
 * - Google News sitemaps (last 2 days)
 * - Google Images sitemaps
 * - Google Videos sitemaps + mRSS
 * - Sitemap indexes
 * - API endpoints (REST, GraphQL, WordPress)
 * - RSS/Atom/JSON feeds
 * - Platform detection (Shopify, WordPress, Next.js)
 * - Static config files
 * - robots.txt analysis
 */

import { DeepDiscovery } from '../../src/plugins/spider/deep-discovery.js'

async function demonstrateDeepDiscovery() {
  console.log('🔍 Deep Discovery - Comprehensive Website Intelligence\n')

  // Initialize discoverer
  const discoverer = new DeepDiscovery({
    userAgent: 's3db-deep-discovery/1.0',
    timeout: 10000,
    maxConcurrent: 10,
    checkSubdomains: true
  })

  // Example 1: E-commerce site (Shopify)
  console.log('📦 Example 1: E-commerce Site Discovery')
  console.log('━'.repeat(60))

  const ecommerceReport = await discoverer.discover('https://www.shopify.com', {
    analyzeTobots: true,
    includeSitemaps: true,
    includeFeeds: true,
    includeAPIs: true,
    includeStatic: true,
    detectPlatform: true,
    includeSubdomains: true
  })

  console.log(`Domain: ${ecommerceReport.domain}`)
  console.log(`Timestamp: ${ecommerceReport.timestamp}`)
  console.log('\n📊 Summary:')
  console.log(`  ✓ Sitemaps found: ${ecommerceReport.summary.sitemapCount}`)
  console.log(`  ✓ APIs found: ${ecommerceReport.summary.apiCount}`)
  console.log(`  ✓ Feeds found: ${ecommerceReport.summary.feedCount}`)
  console.log(`  ✓ Platforms detected: ${ecommerceReport.summary.platformCount}`)
  console.log(`  ✓ Static files: ${ecommerceReport.summary.staticFileCount}`)
  console.log(`  ✓ Subdomains: ${ecommerceReport.summary.subdomainCount}`)
  console.log(`  ✓ Success rate: ${ecommerceReport.summary.successRate}`)

  if (ecommerceReport.discovered.sitemaps.length > 0) {
    console.log('\n🗺️  Sitemaps (sorted by priority):')
    ecommerceReport.discovered.sitemaps.slice(0, 5).forEach(sitemap => {
      const typeIcon = {
        'sitemap-index': '📑',
        'google-news': '📰',
        'google-images': '🖼️',
        'google-videos': '🎥',
        'products': '🛍️',
        'standard': '📄'
      }[sitemap.type] || '📄'

      console.log(`  ${typeIcon} [P${sitemap.priority}] ${sitemap.type}: ${sitemap.url}`)
    })
  }

  if (ecommerceReport.discovered.platforms.length > 0) {
    console.log('\n🏪 Platforms Detected:')
    ecommerceReport.discovered.platforms.forEach(platform => {
      const confidence = (platform.confidence * 100).toFixed(0)
      console.log(`  ✓ ${platform.platform} (${platform.type}) - ${confidence}% confidence`)
      console.log(`    Found: ${platform.paths.slice(0, 2).join(', ')}`)
    })
  }

  // Example 2: News portal
  console.log('\n\n📰 Example 2: News Portal Discovery')
  console.log('━'.repeat(60))

  const newsReport = await discoverer.discover('https://www.bbc.com', {
    analyzeRobots: true,
    includeSitemaps: true,
    includeFeeds: true,
    includeAPIs: false,
    includeStatic: false,
    detectPlatform: false
  })

  console.log(`Domain: ${newsReport.domain}`)
  console.log('\n📊 News-Specific Discovery:')
  console.log(`  ✓ Total sitemaps: ${newsReport.summary.sitemapCount}`)
  console.log(`  ✓ RSS/Atom feeds: ${newsReport.summary.feedCount}`)

  const newsSitemaps = newsReport.discovered.sitemaps.filter(s => s.type === 'google-news')
  if (newsSitemaps.length > 0) {
    console.log('\n📰 Google News Sitemaps (last 2 days):')
    newsSitemaps.forEach(sitemap => {
      console.log(`  ✓ ${sitemap.url}`)
    })
  }

  if (newsReport.discovered.feeds.length > 0) {
    console.log('\n📡 Feeds Discovered:')
    newsReport.discovered.feeds.slice(0, 5).forEach(feed => {
      const icon = { rss: '📻', atom: '⚛️', json: '📋', mrss: '🎬' }[feed.type] || '📡'
      console.log(`  ${icon} ${feed.type.toUpperCase()}: ${feed.url}`)
    })
  }

  // Example 3: robots.txt analysis
  console.log('\n\n🤖 Example 3: robots.txt Intelligence Gathering')
  console.log('━'.repeat(60))

  const robotsReport = await discoverer.discover('https://github.com', {
    analyzeRobots: true,
    includeSitemaps: false,
    includeFeeds: false,
    includeAPIs: false,
    includeStatic: false,
    detectPlatform: false
  })

  if (robotsReport.discovered.exposedPaths.length > 0) {
    console.log('🔓 Exposed Paths from robots.txt:')
    robotsReport.discovered.exposedPaths.slice(0, 10).forEach(path => {
      const icon = path.type === 'api' ? '🔌' : '📁'
      console.log(`  ${icon} ${path.type.toUpperCase()}: ${path.path}`)
    })
  }

  if (robotsReport.discovered.sitemaps.length > 0) {
    console.log('\n🗺️  Sitemaps from robots.txt:')
    robotsReport.discovered.sitemaps.forEach(sitemap => {
      console.log(`  ✓ ${sitemap.url}`)
    })
  }

  // Example 4: API discovery
  console.log('\n\n🔌 Example 4: API Endpoint Discovery')
  console.log('━'.repeat(60))

  const apiReport = await discoverer.discover('https://api.github.com', {
    analyzeRobots: false,
    includeSitemaps: false,
    includeFeeds: false,
    includeAPIs: true,
    includeStatic: true,
    detectPlatform: false
  })

  if (apiReport.discovered.apis.length > 0) {
    console.log('🔌 API Endpoints Discovered:')
    apiReport.discovered.apis.slice(0, 10).forEach(api => {
      const icon = {
        'graphql': '🔷',
        'wordpress-rest': '📝',
        'rest': '🔌'
      }[api.type] || '🔌'

      console.log(`  ${icon} ${api.type.toUpperCase()}: ${api.url}`)
    })
  }

  if (apiReport.discovered.staticFiles.length > 0) {
    console.log('\n📋 Static Config Files:')
    apiReport.discovered.staticFiles.slice(0, 5).forEach(file => {
      console.log(`  ✓ ${file.url}`)
    })
  }

  // Example 5: Full scan with all options
  console.log('\n\n🎯 Example 5: Complete Deep Scan')
  console.log('━'.repeat(60))

  const fullReport = await discoverer.discover('https://www.example.com', {
    analyzeRobots: true,
    includeSitemaps: true,
    includeFeeds: true,
    includeAPIs: true,
    includeStatic: true,
    detectPlatform: true,
    includeSubdomains: true
  })

  console.log('📊 Complete Discovery Report:')
  console.log(JSON.stringify(fullReport.summary, null, 2))

  // Statistics
  const stats = discoverer.getStats()
  console.log('\n📈 Discovery Statistics:')
  console.log(`  ✓ URLs probed: ${stats.urlsProbed}`)
  console.log(`  ✓ URLs found: ${stats.urlsFound}`)
  console.log(`  ✓ Errors: ${stats.errors}`)

  // Example 6: Sitemap type breakdown
  console.log('\n\n📑 Example 6: Sitemap Type Analysis')
  console.log('━'.repeat(60))

  const sitemapsByType = fullReport.discovered.sitemaps.reduce((acc, sitemap) => {
    acc[sitemap.type] = (acc[sitemap.type] || 0) + 1
    return acc
  }, {})

  console.log('Sitemap Types Found:')
  Object.entries(sitemapsByType).forEach(([type, count]) => {
    const icon = {
      'sitemap-index': '📑',
      'google-news': '📰',
      'google-images': '🖼️',
      'google-videos': '🎥',
      'products': '🛍️',
      'categories': '📂',
      'posts': '📝',
      'localized': '🌍',
      'standard': '📄'
    }[type] || '📄'

    console.log(`  ${icon} ${type}: ${count}`)
  })

  // Example 7: Platform detection details
  if (fullReport.discovered.platforms.length > 0) {
    console.log('\n\n🏗️  Example 7: Platform Architecture Analysis')
    console.log('━'.repeat(60))

    fullReport.discovered.platforms.forEach(platform => {
      const confidence = (platform.confidence * 100).toFixed(1)
      console.log(`\n${platform.platform.toUpperCase()} (${platform.type})`)
      console.log(`  Confidence: ${confidence}%`)
      console.log(`  Detected paths:`)
      platform.paths.forEach(path => {
        console.log(`    ✓ ${path}`)
      })
    })
  }

  // Example 8: Crawler Compatibility Scoring (NEW!)
  console.log('\n\n🔍 Example 8: Crawler Compatibility Analysis')
  console.log('━'.repeat(60))

  const crawlers = ['google', 'bing', 'yandex', 'baidu', 'duckduckgo']
  const icons = {
    google: '🔍',
    bing: '🦋',
    yandex: '🇷🇺',
    baidu: '🇨🇳',
    duckduckgo: '🦆'
  }

  crawlers.forEach(crawler => {
    const compat = fullReport.crawlerCompatibility[crawler]
    const icon = icons[crawler]
    const scoreBar = '█'.repeat(Math.round(compat.score)) + '░'.repeat(10 - Math.round(compat.score))

    console.log(`\n${icon} ${crawler.toUpperCase()}`)
    console.log(`  Score: ${scoreBar} ${compat.score.toFixed(1)}/10`)

    if (compat.strengths.length > 0) {
      console.log(`  ✅ Strengths:`)
      compat.strengths.slice(0, 3).forEach(s => console.log(`     • ${s}`))
    }

    if (compat.warnings.length > 0) {
      console.log(`  ⚠️  Warnings:`)
      compat.warnings.slice(0, 3).forEach(w => console.log(`     • ${w}`))
    }
  })

  // Example 9: robots.txt Directives
  if (fullReport.discovered.robotsDirectives) {
    console.log('\n\n🤖 Example 9: robots.txt Advanced Directives')
    console.log('━'.repeat(60))

    const directives = fullReport.discovered.robotsDirectives

    if (directives.crawlDelay) {
      console.log(`  ⏱️  Crawl-delay: ${directives.crawlDelay}s`)
      console.log(`     └─ Respeitado por: Bing, Yandex`)
      console.log(`     └─ Ignorado por: Google, Baidu`)
    }

    if (directives.yandexHost) {
      console.log(`  🇷🇺 Host (Yandex): ${directives.yandexHost}`)
    }

    if (directives.noindex) {
      console.log(`  🚫 Noindex directive presente (deprecated)`)
    }
  }

  // Example 10: Crawl Budget Analysis
  if (fullReport.crawlBudget) {
    console.log('\n\n⏱️  Example 10: Crawl Budget & Time Estimation')
    console.log('━'.repeat(60))

    const budget = fullReport.crawlBudget
    console.log(`  📊 Estimated page count: ${budget.estimatedPageCount}`)
    console.log(`  ⏱️  Crawl delay: ${budget.crawlDelay}s`)
    console.log(`\n  🕒 Estimated crawl time by search engine:`)
    console.log(`     🔍 Google:     ${budget.estimatedCrawlTime.google}`)
    console.log(`     🦋 Bing:       ${budget.estimatedCrawlTime.bing}`)
    console.log(`     🇷🇺 Yandex:     ${budget.estimatedCrawlTime.yandex}`)
    console.log(`     🇨🇳 Baidu:      ${budget.estimatedCrawlTime.baidu}`)
    console.log(`     🦆 DuckDuckGo: ${budget.estimatedCrawlTime.duckduckgo}`)
  }

  // Example 11: AMP Pages Detection
  if (fullReport.discovered.ampPages && fullReport.discovered.ampPages.length > 0) {
    console.log('\n\n⚡ Example 11: AMP Pages Detected')
    console.log('━'.repeat(60))

    console.log(`  Found ${fullReport.discovered.ampPages.length} AMP pages`)
    fullReport.discovered.ampPages.slice(0, 5).forEach(amp => {
      console.log(`  ⚡ ${amp.url}`)
      console.log(`     └─ Source: ${amp.source}`)
    })

    if (fullReport.discovered.ampPages.length > 5) {
      console.log(`  ... and ${fullReport.discovered.ampPages.length - 5} more`)
    }
  }

  console.log('\n✨ Deep Discovery Complete!\n')
  console.log('📋 Full Report Structure:')
  console.log('   • crawlerCompatibility (scores for 5 search engines)')
  console.log('   • crawlBudget (time estimates per crawler)')
  console.log('   • discovered.robotsDirectives (crawl-delay, Host, etc.)')
  console.log('   • discovered.ampPages (AMP URL detection)')
  console.log('   • discovered.sitemaps (with hasPriority, hasChangefreq)')
  console.log('')
}

// Run demonstration
demonstrateDeepDiscovery().catch(console.error)

/**
 * Expected Output Structure:
 *
 * {
 *   domain: "https://example.com",
 *   timestamp: "2024-11-24T12:00:00.000Z",
 *   stats: {
 *     urlsProbed: 150,
 *     urlsFound: 23,
 *     errors: 2
 *   },
 *   discovered: {
 *     sitemaps: [
 *       {
 *         url: "https://example.com/sitemap_index.xml",
 *         type: "sitemap-index",
 *         contentType: "application/xml",
 *         source: "probe",
 *         priority: 10,
 *         hasPriority: false,         // NEW: <priority> tag present?
 *         hasChangefreq: false,       // NEW: <changefreq> tag present?
 *         hasLastmod: true,           // NEW: <lastmod> tag present?
 *         urlCount: 5000              // NEW: URLs in sitemap
 *       },
 *       {
 *         url: "https://example.com/news-sitemap.xml",
 *         type: "google-news",
 *         contentType: "application/xml",
 *         source: "robots.txt",
 *         priority: 9,
 *         hasPriority: false,
 *         hasChangefreq: false,
 *         hasLastmod: true,
 *         urlCount: 150
 *       },
 *       {
 *         url: "https://example.com/image-sitemap.xml",
 *         type: "google-images",
 *         contentType: "application/xml",
 *         source: "probe",
 *         priority: 8,
 *         hasPriority: false,
 *         hasChangefreq: false,
 *         hasLastmod: false,
 *         urlCount: 3000
 *       }
 *     ],
 *     feeds: [
 *       {
 *         url: "https://example.com/feed",
 *         type: "rss",
 *         contentType: "application/rss+xml",
 *         source: "probe"
 *       }
 *     ],
 *     apis: [
 *       {
 *         url: "https://example.com/graphql",
 *         type: "graphql",
 *         contentType: "application/json",
 *         source: "probe"
 *       }
 *     ],
 *     staticFiles: [
 *       {
 *         url: "https://example.com/manifest.json",
 *         contentType: "application/json",
 *         source: "probe"
 *       }
 *     ],
 *     platforms: [
 *       {
 *         type: "ecommerce",
 *         platform: "shopify",
 *         confidence: 0.67,
 *         paths: [
 *           "https://example.com/products.json",
 *           "https://example.com/cart.json"
 *         ]
 *       }
 *     ],
 *     subdomains: [
 *       {
 *         subdomain: "blog.example.com",
 *         url: "https://blog.example.com/sitemap.xml",
 *         source: "subdomain-probe"
 *       }
 *     ],
 *     exposedPaths: [
 *       {
 *         path: "/api/v1/",
 *         type: "api",
 *         source: "robots.txt"
 *       }
 *     ],
 *     ampPages: [{ url: "...", source: "sitemap" }],
 *     robotsDirectives: { crawlDelay: 2, yandexHost: "www.example.com" }
 *   },
 *   crawlerCompatibility: {
 *     google: { score: 8.5, strengths: [...], warnings: [...] },
 *     bing: { score: 7.0, strengths: [...], warnings: [...] },
 *     yandex: { score: 6.5, strengths: [...], warnings: [...] },
 *     baidu: { score: 4.0, strengths: [], warnings: [...] },
 *     duckduckgo: { score: 7.0, strengths: [...], warnings: [...] }
 *   },
 *   crawlBudget: {
 *     estimatedPageCount: 5150,
 *     crawlDelay: 2,
 *     estimatedCrawlTime: {
 *       google: "43min", bing: "2.6h", yandex: "3.4h", baidu: "2.1h", duckduckgo: "2.6h"
 *     }
 *   },
 *   summary: {
 *     sitemapCount: 15,
 *     feedCount: 3,
 *     apiCount: 5,
 *     staticFileCount: 4,
 *     platformCount: 2,
 *     subdomainCount: 3,
 *     exposedPathCount: 12,
 *     ampPageCount: 12,
 *     totalFound: 23,
 *     totalProbed: 150,
 *     successRate: "15.33%"
 *   }
 * }
 */
