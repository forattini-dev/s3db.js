/**
 * Example 106: Amazon Product Price Scraping
 *
 * Demonstrates automated price extraction from Amazon product pages:
 * - Product title and ASIN
 * - Current price, original price, discount
 * - Availability status
 * - Rating and review count
 * - Product images
 * - Seller information
 * - Product variations (size, color)
 * - Deal badges (Limited time deal, Best seller, etc.)
 * - Historical price tracking
 *
 * Real-world use cases:
 * - Price monitoring and alerts
 * - Competitive analysis
 * - Market research
 * - Price history tracking
 */

import { Database } from '../../src/database.class.js'
import { SpiderPlugin } from '../../src/plugins/spider.plugin.js'

async function scrapeAmazonPrices() {
  console.log('🛒 Amazon Product Price Scraping\n')
  console.log('━'.repeat(60))

  // Initialize database
  const db = new Database({
    connectionString: 'memory://amazon-scraper/db'
  })
  await db.connect()

  // Create resource for storing product data
  await db.createResource({
    name: 'amazon_products',
    attributes: {
      asin: 'string|required',              // Amazon Standard Identification Number
      url: 'string|required',
      title: 'string|required',

      // Pricing
      currentPrice: 'number|optional',
      originalPrice: 'number|optional',
      discount: 'number|optional',          // Percentage
      currency: 'string|optional',
      priceHistory: 'array|optional',       // Historical prices

      // Availability
      inStock: 'boolean|optional',
      stockQuantity: 'string|optional',     // "Only 3 left"
      availabilityText: 'string|optional',

      // Reviews
      rating: 'number|optional',            // 4.5
      reviewCount: 'number|optional',

      // Product info
      images: 'array|optional',
      seller: 'string|optional',
      soldBy: 'string|optional',
      shippedBy: 'string|optional',

      // Badges
      isBestseller: 'boolean|optional',
      isAmazonChoice: 'boolean|optional',
      hasLimitedDeal: 'boolean|optional',
      dealBadge: 'string|optional',

      // Variations
      variations: 'array|optional',         // Size, color options

      // Metadata
      scrapedAt: 'string|required',
      lastUpdated: 'string|optional'
    }
  })

  // Configure Spider Plugin
  const spider = new SpiderPlugin({
    namespace: 'amazon-scraper',

    // URL pattern matching for Amazon products
    patterns: {
      productPage: {
        match: /amazon\.com\/.*\/dp\/([A-Z0-9]{10})/,
        activities: ['extract_price'],
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
      concurrency: 3,           // Max 3 concurrent browser instances
      retryAttempts: 3
    }
  })

  await db.usePlugin(spider, 'spider')

  // Register custom activity for price extraction
  spider.registerActivity('extract_price', async ({ page, url, metadata }) => {
    console.log(`\n📦 Scraping: ${url}`)

    try {
      // Wait for page load
      await page.waitForSelector('#productTitle', { timeout: 10000 })

      // Extract ASIN from URL
      const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/)
      const asin = asinMatch ? asinMatch[1] : null

      // Extract product title
      const title = await page.$eval('#productTitle', el => el.textContent.trim())
        .catch(() => null)

      // Extract pricing information
      const priceData = await page.evaluate(() => {
        const data = {
          currentPrice: null,
          originalPrice: null,
          discount: null,
          currency: 'USD'
        }

        // Current price (multiple selectors for different layouts)
        const priceSelectors = [
          '.a-price .a-offscreen',
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '.a-price-whole'
        ]

        for (const selector of priceSelectors) {
          const priceEl = document.querySelector(selector)
          if (priceEl) {
            const priceText = priceEl.textContent.replace(/[^0-9.]/g, '')
            data.currentPrice = parseFloat(priceText)
            break
          }
        }

        // Original price (strikethrough)
        const originalPriceEl = document.querySelector('.a-price.a-text-price .a-offscreen')
        if (originalPriceEl) {
          const priceText = originalPriceEl.textContent.replace(/[^0-9.]/g, '')
          data.originalPrice = parseFloat(priceText)
        }

        // Discount percentage
        const discountEl = document.querySelector('.savingsPercentage')
        if (discountEl) {
          const discountText = discountEl.textContent.replace(/[^0-9]/g, '')
          data.discount = parseInt(discountText, 10)
        }

        return data
      })

      // Extract availability
      const availability = await page.evaluate(() => {
        const availEl = document.querySelector('#availability span')
        const availText = availEl ? availEl.textContent.trim() : ''

        return {
          inStock: availText.toLowerCase().includes('in stock'),
          stockQuantity: availText.match(/only (\d+) left/i)?.[0] || null,
          availabilityText: availText
        }
      })

      // Extract rating and reviews
      const reviews = await page.evaluate(() => {
        const ratingEl = document.querySelector('[data-hook="rating-out-of-text"]')
        const reviewCountEl = document.querySelector('#acrCustomerReviewText')

        return {
          rating: ratingEl ? parseFloat(ratingEl.textContent.split(' ')[0]) : null,
          reviewCount: reviewCountEl ?
            parseInt(reviewCountEl.textContent.replace(/[^0-9]/g, ''), 10) : null
        }
      })

      // Extract images
      const images = await page.evaluate(() => {
        const imgElements = document.querySelectorAll('#altImages img')
        return Array.from(imgElements)
          .map(img => img.src)
          .filter(src => src && !src.includes('pixel'))
          .slice(0, 10)  // Limit to 10 images
      })

      // Extract seller information
      const seller = await page.evaluate(() => {
        const sellerEl = document.querySelector('#sellerProfileTriggerId')
        const soldByEl = document.querySelector('#merchant-info')

        return {
          seller: sellerEl ? sellerEl.textContent.trim() : null,
          soldBy: soldByEl ? soldByEl.textContent.match(/Sold by\s+(.+)/)?.[1] : null,
          shippedBy: soldByEl ? soldByEl.textContent.match(/Shipped by\s+(.+)/)?.[1] : null
        }
      })

      // Extract deal badges
      const badges = await page.evaluate(() => {
        return {
          isBestseller: !!document.querySelector('#zeitgeistBadge'),
          isAmazonChoice: !!document.querySelector('[data-a-badge-color="sx-glow"]'),
          hasLimitedDeal: !!document.querySelector('.dealBadge'),
          dealBadge: document.querySelector('.dealBadge')?.textContent.trim() || null
        }
      })

      // Extract variations (size, color)
      const variations = await page.evaluate(() => {
        const variationButtons = document.querySelectorAll('#variation_size_name li, #variation_color_name li')
        return Array.from(variationButtons).map(btn => ({
          type: btn.closest('ul')?.id.includes('size') ? 'size' : 'color',
          value: btn.textContent.trim(),
          available: !btn.classList.contains('unselectable')
        }))
      })

      // Compile product data
      const productData = {
        asin,
        url,
        title,
        ...priceData,
        ...availability,
        ...reviews,
        images,
        ...seller,
        ...badges,
        variations,
        scrapedAt: new Date().toISOString()
      }

      // Save to database
      const resource = await db.getResource('amazon_products')
      await resource.insert(productData)

      console.log('✅ Product scraped successfully:')
      console.log(`   ASIN: ${asin}`)
      console.log(`   Title: ${title?.substring(0, 60)}...`)
      console.log(`   Price: $${priceData.currentPrice}`)
      if (priceData.originalPrice) {
        console.log(`   Original: $${priceData.originalPrice} (${priceData.discount}% off)`)
      }
      console.log(`   Rating: ${reviews.rating}⭐ (${reviews.reviewCount?.toLocaleString()} reviews)`)
      console.log(`   Stock: ${availability.availabilityText}`)
      if (badges.isBestseller) console.log(`   🏆 Bestseller`)
      if (badges.isAmazonChoice) console.log(`   ✨ Amazon's Choice`)

      return {
        success: true,
        data: productData
      }

    } catch (error) {
      console.error(`❌ Error scraping ${url}:`, error.message)
      return {
        success: false,
        error: error.message
      }
    }
  })

  // Example 1: Scrape single product
  console.log('\n📌 Example 1: Single Product Scraping')
  console.log('━'.repeat(60))

  await spider.enqueueTarget({
    url: 'https://www.amazon.com/dp/B0BSHF7WHW',  // Example: Amazon Echo Dot
    activities: ['extract_price']
  })

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 5000))

  // Example 2: Scrape multiple products
  console.log('\n\n📌 Example 2: Multiple Products (Price Comparison)')
  console.log('━'.repeat(60))

  const products = [
    'https://www.amazon.com/dp/B0BSHF7WHW',  // Echo Dot
    'https://www.amazon.com/dp/B09B8V1LZ3',  // Echo Show
    'https://www.amazon.com/dp/B08MQLDG7D'   // Echo 4th Gen
  ]

  for (const url of products) {
    await spider.enqueueTarget({
      url,
      activities: ['extract_price'],
      priority: 10
    })
  }

  // Wait for all to complete
  await new Promise(resolve => setTimeout(resolve, 15000))

  // Example 3: Query scraped data
  console.log('\n\n📌 Example 3: Querying Scraped Data')
  console.log('━'.repeat(60))

  const resource = await db.getResource('amazon_products')
  const allProducts = await resource.list({ limit: 100 })

  console.log(`\n📊 Total products scraped: ${allProducts.length}`)

  // Price comparison
  if (allProducts.length > 1) {
    console.log('\n💰 Price Comparison:')
    const sorted = allProducts
      .filter(p => p.currentPrice)
      .sort((a, b) => a.currentPrice - b.currentPrice)

    sorted.forEach((product, idx) => {
      console.log(`\n${idx + 1}. ${product.title?.substring(0, 50)}...`)
      console.log(`   Price: $${product.currentPrice}`)
      if (product.discount) {
        console.log(`   Discount: ${product.discount}% off`)
      }
      console.log(`   Rating: ${product.rating}⭐`)
    })
  }

  // Example 4: Find best deals
  console.log('\n\n📌 Example 4: Finding Best Deals')
  console.log('━'.repeat(60))

  const deals = allProducts.filter(p =>
    (p.discount && p.discount > 20) ||
    p.hasLimitedDeal ||
    p.isBestseller
  )

  if (deals.length > 0) {
    console.log(`\n🔥 Found ${deals.length} deals:`)
    deals.forEach(deal => {
      console.log(`\n📦 ${deal.title?.substring(0, 50)}...`)
      console.log(`   Price: $${deal.currentPrice}`)
      if (deal.discount) console.log(`   💸 ${deal.discount}% OFF`)
      if (deal.hasLimitedDeal) console.log(`   ⏰ Limited Time Deal`)
      if (deal.isBestseller) console.log(`   🏆 Bestseller`)
      if (deal.isAmazonChoice) console.log(`   ✨ Amazon's Choice`)
    })
  } else {
    console.log('No special deals found')
  }

  // Example 5: Price monitoring simulation
  console.log('\n\n📌 Example 5: Price History Tracking')
  console.log('━'.repeat(60))

  // Simulate price tracking over time
  console.log('\n📈 Price Monitoring Setup:')
  console.log('   ✓ Products stored in database')
  console.log('   ✓ Can re-scrape periodically')
  console.log('   ✓ Compare prices over time')
  console.log('   ✓ Send alerts on price drops')

  console.log('\n💡 Usage Pattern:')
  console.log(`
  // Schedule daily price checks
  setInterval(async () => {
    const products = await resource.list()

    for (const product of products) {
      await spider.enqueueTarget({
        url: product.url,
        activities: ['extract_price']
      })
    }
  }, 24 * 60 * 60 * 1000)  // Every 24 hours
  `)

  // Cleanup
  await spider.destroy()
  await db.disconnect()

  console.log('\n✨ Amazon Price Scraping Complete!\n')
}

// Run demonstration
scrapeAmazonPrices().catch(console.error)

/**
 * Expected Console Output:
 *
 * 🛒 Amazon Product Price Scraping
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📌 Example 1: Single Product Scraping
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📦 Scraping: https://www.amazon.com/dp/B0BSHF7WHW
 * ✅ Product scraped successfully:
 *    ASIN: B0BSHF7WHW
 *    Title: Echo Dot (5th Gen, 2022 release) | With bigger vibrant...
 *    Price: $49.99
 *    Original: $59.99 (17% off)
 *    Rating: 4.7⭐ (45,234 reviews)
 *    Stock: In Stock
 *    ✨ Amazon's Choice
 *
 * 📌 Example 2: Multiple Products (Price Comparison)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ...
 *
 * 📌 Example 3: Querying Scraped Data
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📊 Total products scraped: 3
 *
 * 💰 Price Comparison:
 *
 * 1. Echo Dot (5th Gen) - Smart speaker with Alexa...
 *    Price: $49.99
 *    Discount: 17% off
 *    Rating: 4.7⭐
 *
 * 2. Echo (4th Gen) - Premium sound powered by Dolby...
 *    Price: $99.99
 *    Discount: 29% off
 *    Rating: 4.7⭐
 *
 * 3. Echo Show 8 (2nd Gen) - HD smart display with Alexa...
 *    Price: $129.99
 *    Discount: 24% off
 *    Rating: 4.6⭐
 *
 * 📌 Example 4: Finding Best Deals
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 🔥 Found 2 deals:
 *
 * 📦 Echo (4th Gen) - Premium sound powered by Dolby...
 *    Price: $99.99
 *    💸 29% OFF
 *    🏆 Bestseller
 *
 * 📦 Echo Show 8 (2nd Gen) - HD smart display with...
 *    Price: $129.99
 *    💸 24% OFF
 *    ✨ Amazon's Choice
 *
 * ✨ Amazon Price Scraping Complete!
 */
