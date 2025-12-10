# Best Practices & FAQ

> **In this guide:** Performance optimization, polite crawling, troubleshooting, and comprehensive FAQ.

**Navigation:** [← Back to Spider Plugin](/plugins/spider/README.md) | [Configuration](/plugins/spider/guides/configuration.md)

---

## Best Practices

### 1. Always Respect robots.txt

```javascript
const discoverer = new LinkDiscoverer({
  respectRobotsTxt: true,
  robotsUserAgent: 'my-company-bot/1.0'  // Descriptive user-agent
})

// Or standalone
const parser = new RobotsParser({
  userAgent: 'my-company-bot/1.0'
})

const result = await parser.isAllowed(url)
if (!result.allowed) {
  console.log('Skipping disallowed URL')
  return
}
```

### 2. Use Appropriate Crawl Delays

```javascript
const parser = new RobotsParser()

async function politelyCrawl(url) {
  const domain = new URL(url).hostname

  // Get crawl delay from robots.txt
  const delay = await parser.getCrawlDelay(domain)

  // Use delay or default to 1 second
  const actualDelay = delay || 1000

  await sleep(actualDelay)
  return fetch(url)
}
```

### 3. Use Descriptive User-Agents

```javascript
// Good: Descriptive and includes contact
const spider = new SpiderPlugin({
  discovery: {
    robotsUserAgent: 'MyCompany-SEOBot/1.0 (+https://example.com/bot)'
  }
})

// Bad: Generic or misleading
const spider = new SpiderPlugin({
  discovery: {
    robotsUserAgent: 'Mozilla/5.0'  // Don't impersonate browsers!
  }
})
```

### 4. Limit Concurrency

```javascript
const spider = new SpiderPlugin({
  queue: {
    concurrency: 3  // Don't overwhelm servers
  },
  discovery: {
    maxUrls: 1000,  // Set reasonable limits
    maxDepth: 3
  }
})
```

### 5. Cache Robots.txt and Sitemaps

```javascript
// Pre-cache robots.txt before crawling
const parser = new RobotsParser()
await parser.preload('example.com')

// Now all isAllowed() calls use cache
for (const url of urls) {
  const allowed = await parser.isAllowed(url)  // Instant - uses cache
}
```

### 6. Use Sitemaps for Discovery

```javascript
// Sitemaps are more efficient than crawling
const discoverer = new LinkDiscoverer({ useSitemaps: true })

const links = await discoverer.discoverFromSitemaps('https://example.com', {
  autoDiscover: true  // Find sitemaps in robots.txt
})

// Much faster than following links through HTML
```

### 7. Handle Errors Gracefully

```javascript
async function safeCrawl(url) {
  try {
    const result = await spider.enqueueTarget({ url, activities: ['scrape'] })
    return result
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      console.log('DNS resolution failed')
    } else if (error.code === 'ETIMEDOUT') {
      console.log('Request timed out')
    } else if (error.status === 429) {
      console.log('Rate limited - slow down!')
      await sleep(60000)  // Wait 1 minute
    }
    return null
  }
}
```

### 8. Monitor Your Crawler

```javascript
const discoverer = new LinkDiscoverer()

// Check stats periodically
setInterval(() => {
  const stats = discoverer.getStats()
  console.log(`Discovered: ${stats.urlsFound}`)
  console.log(`Errors: ${stats.errors}`)

  if (stats.errors > 100) {
    console.warn('Too many errors - check configuration')
  }
}, 60000)
```

---

## Troubleshooting

### URLs Not Being Discovered

**Cause:** Pattern not matching or robots.txt blocking

**Solution:**

```javascript
// Debug pattern matching
const match = spider.matchUrl(url)
if (!match) {
  console.log('No pattern matches this URL')
}

// Check robots.txt
const parser = new RobotsParser()
const result = await parser.isAllowed(url)
console.log('Allowed:', result.allowed)
console.log('Matching rule:', result.matchingRule)
```

### Sitemap Not Found

**Cause:** Non-standard sitemap location

**Solution:**

```javascript
const parser = new SitemapParser()

// Try common locations
const locations = await parser.probeCommonLocations('https://example.com')
console.log('Found sitemaps:', locations)

// Or check robots.txt
const parser2 = new RobotsParser()
const sitemaps = await parser2.getSitemaps('example.com')
console.log('Sitemaps in robots.txt:', sitemaps)
```

### Getting Rate Limited (429)

**Cause:** Crawling too fast

**Solution:**

```javascript
const spider = new SpiderPlugin({
  queue: {
    concurrency: 1,      // Reduce concurrency
    retryDelay: 5000     // Wait longer between retries
  }
})

// Or respect crawl-delay
const delay = await parser.getCrawlDelay(domain)
await sleep(delay || 2000)  // At least 2 seconds
```

### Memory Issues with Large Sitemaps

**Cause:** Loading entire sitemap into memory

**Solution:**

```javascript
const parser = new SitemapParser({
  maxUrls: 10000  // Limit URLs per sitemap
})

// Process in batches
const entries = await parser.parse(sitemapUrl)
const batches = chunk(entries, 100)

for (const batch of batches) {
  await processBatch(batch)
}
```

### Robots.txt Cache Stale

**Cause:** Cache not refreshing

**Solution:**

```javascript
const parser = new RobotsParser({
  cacheTimeout: 1800000  // 30 minutes instead of 1 hour
})

// Or manually clear
parser.clearCache('example.com')
```

---

## FAQ

### General

**Q: What formats does the sitemap parser support?**

A: XML, XML index, gzipped XML, text (.txt), RSS 2.0, and Atom feeds.

**Q: Does it respect robots.txt?**

A: Yes, when `respectRobotsTxt: true` (default). Supports all standard directives including wildcards.

**Q: How do I avoid getting blocked?**

A:
1. Respect robots.txt
2. Use crawl delays
3. Limit concurrency
4. Use descriptive user-agent
5. Don't impersonate browsers

**Q: Can I use custom user-agents?**

A: Yes, set `robotsUserAgent` and/or `sitemapUserAgent` in config.

### Pattern Matching

**Q: How does pattern priority work?**

A: Higher priority values match first. Same priority = more specific patterns win.

**Q: Can I combine pattern matching with regex?**

A: Yes, patterns support both Express-style and pure regex.

**Q: How do I extract query parameters?**

A:
```javascript
patterns: {
  search: {
    match: '/search',
    extract: { query: 'q', page: 'page' }
  }
}
```

### Robots.txt

**Q: What wildcards are supported?**

A:
- `*` - Matches any sequence of characters
- `$` - End anchor (e.g., `/*.php$` matches only `.php` endings)

**Q: Does it support Crawl-delay?**

A: Yes. Use `getCrawlDelay(domain)` to get the delay in milliseconds.

**Q: How is caching handled?**

A: Robots.txt is cached for 1 hour by default. Configurable via `cacheTimeout`.

### Sitemaps

**Q: How do I handle large sitemaps?**

A: Set `maxUrls` limits and use sitemap indexes to split data.

**Q: Can I parse gzipped sitemaps?**

A: Yes, `.xml.gz` files are automatically decompressed.

**Q: Are RSS/Atom feeds supported?**

A: Yes, the parser extracts URLs from RSS 2.0 and Atom feeds.

### Deep Discovery

**Q: What's the difference between Spider and DeepDiscovery?**

A:
- **SpiderPlugin**: URL queue processing with pattern matching
- **DeepDiscovery**: Website intelligence and crawler compatibility analysis

**Q: How accurate is the crawl budget estimation?**

A: It's an estimate based on known crawler speeds and your crawl-delay settings. Real crawl time varies based on server response time and network latency.

**Q: Does it detect JavaScript frameworks?**

A: Yes - React, Next.js, Nuxt.js, Angular, Vue.js are detected with warnings about crawler compatibility.

### Performance

**Q: What's the performance?**

A:
- Pattern matching: 1-5ms/URL
- Sitemap parsing: 1K-10K URLs/sec
- Robots.txt: cached for 1hr

**Q: Can I test without making HTTP requests?**

A: Yes, use custom fetchers:
```javascript
new RobotsParser({ fetcher: async () => 'User-agent: *\nDisallow:' })
new SitemapParser({ fetcher: async () => ({ content: '<urlset>...</urlset>' }) })
```

**Q: How many concurrent requests should I use?**

A: Start with 3-5 and adjust based on target server capacity. Never exceed what robots.txt allows.

### Integration

**Q: Can I use this with Puppeteer?**

A: Yes, use SpiderPlugin for URL management and Puppeteer for JavaScript rendering:
```javascript
const target = await spider.dequeueTarget()
const page = await browser.newPage()
await page.goto(target.url)
const html = await page.content()
```

**Q: Can I save crawl results to the database?**

A: Yes, SpiderPlugin integrates with s3db.js resources:
```javascript
await spider.completeTarget(target.id, {
  result: 'success',
  data: { title, description, links }
})
```

---

## See Also

- [Configuration](/plugins/spider/guides/configuration.md) - All options and API reference
- [Usage Patterns](/plugins/spider/guides/usage-patterns.md) - Crawling patterns, real-world examples
- [Deep Discovery](/plugins/spider/deep-discovery.md) - Advanced crawler compatibility analysis

