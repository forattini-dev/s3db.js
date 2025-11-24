/**
 * Example: Spider Plugin with URL Pattern Matching and Auto-Discovery
 *
 * Demonstrates:
 * - Express-style URL pattern matching
 * - Automatic parameter extraction from URLs
 * - Auto-discovery to follow links
 * - Pattern-based activity assignment
 *
 * Note: This example uses MemoryClient for testing.
 * For real crawling, use S3 storage.
 */

import { Database } from '../../src/database.class.js'
import { SpiderPlugin } from '../../src/plugins/spider.plugin.js'

async function main() {
  // Create database with memory client for testing
  const db = new Database({
    connectionString: 'memory://test/spider-patterns'
  })

  // Configure spider with URL patterns
  const spider = new SpiderPlugin({
    namespace: 'pattern-demo',
    logLevel: 'info',

    // ============================================
    // URL PATTERNS
    // ============================================
    patterns: {
      // Product pages - extract product ID
      product: {
        match: '/products/:productId',
        activities: ['seo_meta_tags', 'seo_opengraph', 'screenshot_viewport'],
        metadata: { type: 'product', category: 'ecommerce' },
        priority: 10
      },

      // Category pages - extract category name
      category: {
        match: '/category/:categoryName',
        activities: ['seo_links_analysis', 'seo_content_analysis'],
        metadata: { type: 'category' },
        priority: 5
      },

      // Blog posts - extract year, month, slug
      blogPost: {
        match: '/blog/:year/:month/:slug',
        activities: ['seo_meta_tags', 'seo_content_analysis', 'seo_heading_structure'],
        metadata: { type: 'blog' },
        priority: 8
      },

      // Search pages - extract query from URL params
      search: {
        match: '/search',
        activities: ['seo_links_analysis'],
        metadata: { type: 'search' },
        extract: { query: 'q', page: 'page' },  // Extract ?q= and ?page=
        priority: 3
      },

      // API docs with regex for version
      apiDocs: {
        match: /\/docs\/api\/v(\d+)\/(.*)/,
        activities: ['seo_content_analysis'],
        metadata: { type: 'api-docs' },
        priority: 7
      },

      // Default for unmatched URLs
      default: {
        activities: ['seo_meta_tags'],
        metadata: { type: 'other' }
      }
    },

    // ============================================
    // AUTO-DISCOVERY
    // ============================================
    discovery: {
      enabled: true,
      maxDepth: 2,           // Follow links up to 2 levels deep
      maxUrls: 50,           // Discover max 50 URLs
      sameDomainOnly: true,  // Stay on same domain
      followPatterns: ['product', 'category', 'blogPost']  // Only follow these patterns
    },

    // ============================================
    // QUEUE (disabled for demo)
    // ============================================
    queue: {
      autoStart: false,  // Manual control for demo
      concurrency: 1
    },

    // Disable puppeteer for this demo (pattern matching doesn't need browser)
    puppeteer: {
      pool: { enabled: false }
    }
  })

  await db.usePlugin(spider)
  await db.connect()

  console.log('\n=== URL Pattern Matching Demo ===\n')

  // ============================================
  // TEST PATTERN MATCHING
  // ============================================

  const testUrls = [
    'https://shop.example.com/products/12345',
    'https://shop.example.com/products/abc-widget',
    'https://shop.example.com/category/electronics',
    'https://shop.example.com/category/books',
    'https://shop.example.com/blog/2024/01/new-year-sale',
    'https://shop.example.com/search?q=laptops&page=2',
    'https://shop.example.com/docs/api/v2/users',
    'https://shop.example.com/about',
    'https://shop.example.com/contact'
  ]

  console.log('Testing URL Pattern Matching:\n')

  for (const url of testUrls) {
    const match = spider.matchUrl(url)

    if (match) {
      console.log(`URL: ${url}`)
      console.log(`  Pattern: ${match.pattern}`)
      console.log(`  Params: ${JSON.stringify(match.params)}`)
      console.log(`  Activities: ${match.activities.join(', ')}`)
      console.log(`  Metadata: ${JSON.stringify(match.metadata)}`)
      console.log()
    }
  }

  // ============================================
  // TEST PATTERN API
  // ============================================

  console.log('=== Pattern API Demo ===\n')

  // Get all pattern names
  console.log('Configured patterns:', spider.getPatternNames().join(', '))

  // Quick check if URL matches any pattern
  console.log('\nQuick match checks:')
  console.log(`  /products/123 matches: ${spider.urlMatchesPattern('https://example.com/products/123')}`)
  console.log(`  /cart matches: ${spider.urlMatchesPattern('https://example.com/cart')}`)

  // Filter URLs by pattern
  console.log('\nFiltering URLs by pattern:')
  const filtered = spider.filterUrlsByPattern(testUrls, ['product'])
  console.log(`  Found ${filtered.length} product URLs:`)
  for (const item of filtered) {
    console.log(`    - ${item.url} (productId: ${item.match.params.productId})`)
  }

  // ============================================
  // ADD PATTERN AT RUNTIME
  // ============================================

  console.log('\n=== Runtime Pattern Management ===\n')

  // Add new pattern
  spider.addPattern('promo', {
    match: '/promo/:code',
    activities: ['seo_meta_tags', 'screenshot_full'],
    metadata: { type: 'promotion' }
  })

  console.log('Added "promo" pattern')
  console.log('New pattern list:', spider.getPatternNames().join(', '))

  // Test new pattern
  const promoMatch = spider.matchUrl('https://example.com/promo/SUMMER2024')
  console.log(`\nPromo URL match:`)
  console.log(`  Pattern: ${promoMatch.pattern}`)
  console.log(`  Code: ${promoMatch.params.code}`)

  // Remove pattern
  spider.removePattern('promo')
  console.log('\nRemoved "promo" pattern')
  console.log('Pattern list:', spider.getPatternNames().join(', '))

  // ============================================
  // TEST AUTO-DISCOVERY
  // ============================================

  console.log('\n=== Auto-Discovery Demo ===\n')

  // Get discovery stats
  let stats = spider.getDiscoveryStats()
  console.log('Initial discovery stats:', stats)

  // Simulate adding URLs (normally done by queue processor)
  await spider.enqueueTarget({
    url: 'https://shop.example.com',
    metadata: { seed: true }
  })

  stats = spider.getDiscoveryStats()
  console.log('After enqueue:', stats)

  // Reset discovery
  spider.resetDiscovery()
  stats = spider.getDiscoveryStats()
  console.log('After reset:', stats)

  // ============================================
  // CLEANUP
  // ============================================

  await spider.destroy()
  await db.disconnect()

  console.log('\n=== Demo Complete ===\n')
}

main().catch(console.error)
