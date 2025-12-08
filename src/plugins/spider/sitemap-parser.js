/**
 * Sitemap Parser - Parses various sitemap formats for URL discovery
 *
 * Supported formats:
 * - XML Sitemap (standard sitemaps.org protocol)
 * - XML Sitemap Index (multiple sitemaps)
 * - Compressed sitemaps (.xml.gz)
 * - Text sitemaps (.txt - one URL per line)
 * - RSS feeds (.rss, .xml)
 * - Atom feeds (.atom, .xml)
 *
 * Features:
 * - Auto-detect format from content
 * - Extract URLs with metadata (lastmod, changefreq, priority)
 * - Recursive sitemap index processing
 * - Caching of parsed sitemaps
 * - Gzip decompression
 */

import { gunzipSync } from 'zlib'
import { createHttpClient } from '#src/concerns/http-client.js'

export class SitemapParser {
  /**
   * @param {Object} config - Parser configuration
   * @param {string} [config.userAgent='s3db-spider'] - User-Agent string
   * @param {number} [config.fetchTimeout=30000] - Request timeout in ms
   * @param {number} [config.maxSitemaps=50] - Max sitemaps to process from index
   * @param {number} [config.maxUrls=50000] - Max URLs to extract
   * @param {boolean} [config.followSitemapIndex=true] - Follow sitemap index recursively
   * @param {number} [config.cacheTimeout=3600000] - Cache timeout in ms (1 hour)
   * @param {Function} [config.fetcher] - Custom fetcher function
   * @param {CrawlContext} [config.context] - Shared crawl context for session state
   */
  constructor(config = {}) {
    this.config = {
      userAgent: config.userAgent || 's3db-spider',
      fetchTimeout: config.fetchTimeout || 30000,
      maxSitemaps: config.maxSitemaps || 50,        // Max sitemaps to process from index
      maxUrls: config.maxUrls || 50000,             // Max URLs to extract
      followSitemapIndex: config.followSitemapIndex !== false,
      cacheTimeout: config.cacheTimeout || 3600000, // 1 hour
      context: config.context || null,
      ...config
    }

    // Shared crawl context (optional)
    this._context = this.config.context

    // Cache parsed sitemaps
    this.cache = new Map()

    // Custom fetcher (for testing)
    this.fetcher = config.fetcher || null

    // HTTP client (initialized lazily)
    this._httpClient = null

    // Stats
    this.stats = {
      sitemapsParsed: 0,
      urlsExtracted: 0,
      errors: 0
    }
  }

  /**
   * Set custom fetcher function for testing
   * @param {Function} fetcher - async (url) => { content: string|Buffer, contentType?: string }
   */
  setFetcher(fetcher) {
    this.fetcher = fetcher
  }

  /**
   * Parse a sitemap URL and extract all URLs
   *
   * @param {string} sitemapUrl - URL to the sitemap
   * @param {Object} options - Parse options
   * @param {boolean} options.recursive - Follow sitemap index recursively (default: true)
   * @param {number} options.maxDepth - Max recursion depth for sitemap indexes (default: 3)
   * @returns {Promise<Array<SitemapEntry>>} Extracted URLs with metadata
   */
  async parse(sitemapUrl, options = {}) {
    const opts = {
      recursive: options.recursive !== false,
      maxDepth: options.maxDepth || 3,
      _depth: options._depth || 0
    }

    // Check cache
    const cached = this.cache.get(sitemapUrl)
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return cached.entries
    }

    // Check depth limit
    if (opts._depth > opts.maxDepth) {
      return []
    }

    // Check URL limit
    if (this.stats.urlsExtracted >= this.config.maxUrls) {
      return []
    }

    try {
      // Fetch sitemap
      const { content, contentType } = await this._fetch(sitemapUrl)

      // Detect format and parse
      const format = this._detectFormat(sitemapUrl, content, contentType)
      let entries = []

      switch (format) {
        case 'xml-sitemap':
          entries = this._parseXmlSitemap(content)
          break
        case 'xml-index':
          entries = await this._parseXmlIndex(content, opts)
          break
        case 'text':
          entries = this._parseTextSitemap(content)
          break
        case 'rss':
          entries = this._parseRssFeed(content)
          break
        case 'atom':
          entries = this._parseAtomFeed(content)
          break
        default:
          throw new Error(`Unknown sitemap format: ${format}`)
      }

      // Update stats
      this.stats.sitemapsParsed++
      this.stats.urlsExtracted += entries.length

      // Cache results
      this.cache.set(sitemapUrl, { entries, timestamp: Date.now(), format })

      return entries

    } catch (error) {
      this.stats.errors++
      throw error
    }
  }

  /**
   * Get or create HTTP client
   * Uses shared CrawlContext if available for consistent session state
   * @private
   */
  async _getHttpClient() {
    if (!this._httpClient) {
      const baseConfig = this._context
        ? this._context.getHttpClientConfig('https://example.com')
        : {
            headers: {
              'User-Agent': this.config.userAgent
            }
          }

      this._httpClient = await createHttpClient({
        ...baseConfig,
        timeout: this.config.fetchTimeout,
        retry: {
          maxAttempts: 2,
          delay: 1000,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      })
    }
    return this._httpClient
  }

  /**
   * Fetch sitemap content
   * @private
   */
  async _fetch(url) {
    let content, contentType

    if (this.fetcher) {
      const result = await this.fetcher(url)
      content = result.content || result
      contentType = result.contentType || ''
    } else {
      const client = await this._getHttpClient()
      const response = await client.get(url)

      if (this._context) {
        this._context.processResponse(response, url)
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      contentType = response.headers.get('content-type') || ''

      // Check if gzipped
      if (url.endsWith('.gz') || contentType.includes('gzip')) {
        const buffer = await response.arrayBuffer()
        content = this._decompress(Buffer.from(buffer))
      } else {
        content = await response.text()
      }
    }

    // Handle Buffer content
    if (Buffer.isBuffer(content)) {
      // Check if it's gzipped
      if (content[0] === 0x1f && content[1] === 0x8b) {
        content = this._decompress(content)
      } else {
        content = content.toString('utf-8')
      }
    }

    return { content, contentType }
  }

  /**
   * Decompress gzipped content
   * @private
   */
  _decompress(buffer) {
    try {
      return gunzipSync(buffer).toString('utf-8')
    } catch (error) {
      throw new Error(`Failed to decompress gzip: ${error.message}`)
    }
  }

  /**
   * Detect sitemap format
   * @private
   */
  _detectFormat(url, content, contentType = '') {
    const contentLower = content.trim().toLowerCase()
    const urlLower = url.toLowerCase()

    // Check for XML sitemap index
    if (contentLower.includes('<sitemapindex')) {
      return 'xml-index'
    }

    // Check for XML sitemap
    if (contentLower.includes('<urlset')) {
      return 'xml-sitemap'
    }

    // Check for RSS feed
    if (contentLower.includes('<rss') || contentLower.includes('<channel>')) {
      return 'rss'
    }

    // Check for Atom feed
    if (contentLower.includes('<feed') && contentLower.includes('xmlns="http://www.w3.org/2005/atom"')) {
      return 'atom'
    }
    if (contentLower.includes('<feed') && contentLower.includes('atom')) {
      return 'atom'
    }

    // Check by extension
    if (urlLower.endsWith('.txt')) {
      return 'text'
    }
    if (urlLower.endsWith('.rss')) {
      return 'rss'
    }
    if (urlLower.endsWith('.atom')) {
      return 'atom'
    }

    // Check content-type
    if (contentType.includes('rss')) {
      return 'rss'
    }
    if (contentType.includes('atom')) {
      return 'atom'
    }

    // Default: try text (one URL per line)
    if (this._looksLikeTextSitemap(content)) {
      return 'text'
    }

    // Unknown
    return 'unknown'
  }

  /**
   * Check if content looks like a text sitemap
   * @private
   */
  _looksLikeTextSitemap(content) {
    const lines = content.trim().split(/\r?\n/).slice(0, 10)
    const urlCount = lines.filter(line => {
      const trimmed = line.trim()
      return trimmed.startsWith('http://') || trimmed.startsWith('https://')
    }).length

    return urlCount >= lines.length * 0.5 // At least 50% are URLs
  }

  /**
   * Parse XML sitemap (urlset)
   * @private
   */
  _parseXmlSitemap(content) {
    const entries = []

    // Extract <url> blocks
    const urlRegex = /<url>([\s\S]*?)<\/url>/gi
    let match

    while ((match = urlRegex.exec(content)) !== null) {
      const urlBlock = match[1]
      const entry = this._parseUrlBlock(urlBlock)

      if (entry && entry.url) {
        entries.push(entry)

        if (entries.length >= this.config.maxUrls) break
      }
    }

    return entries
  }

  /**
   * Parse a single <url> block
   * @private
   */
  _parseUrlBlock(block) {
    const entry = {
      url: this._extractTag(block, 'loc'),
      lastmod: this._extractTag(block, 'lastmod'),
      changefreq: this._extractTag(block, 'changefreq'),
      priority: null,
      source: 'sitemap'
    }

    const priorityStr = this._extractTag(block, 'priority')
    if (priorityStr) {
      entry.priority = parseFloat(priorityStr)
    }

    // Extract image URLs if present
    const images = this._extractImages(block)
    if (images.length > 0) {
      entry.images = images
    }

    // Extract video info if present
    const videos = this._extractVideos(block)
    if (videos.length > 0) {
      entry.videos = videos
    }

    return entry
  }

  /**
   * Extract tag content from XML
   * @private
   */
  _extractTag(xml, tagName) {
    // Handle namespaced tags (e.g., image:loc, video:content_loc)
    const patterns = [
      new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i'),
      new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([^\\]]*?)\\]\\]></${tagName}>`, 'i'),
      new RegExp(`<[^:]+:${tagName}>([^<]*)</[^:]+:${tagName}>`, 'i')
    ]

    for (const pattern of patterns) {
      const match = xml.match(pattern)
      if (match) {
        return this._decodeXmlEntities(match[1].trim())
      }
    }

    return null
  }

  /**
   * Extract image information from URL block
   * @private
   */
  _extractImages(block) {
    const images = []
    const imageRegex = /<image:image>([\s\S]*?)<\/image:image>/gi
    let match

    while ((match = imageRegex.exec(block)) !== null) {
      const imageBlock = match[1]
      const image = {
        url: this._extractTag(imageBlock, 'loc') || this._extractTag(imageBlock, 'image:loc'),
        title: this._extractTag(imageBlock, 'title') || this._extractTag(imageBlock, 'image:title'),
        caption: this._extractTag(imageBlock, 'caption') || this._extractTag(imageBlock, 'image:caption')
      }

      if (image.url) {
        images.push(image)
      }
    }

    return images
  }

  /**
   * Extract video information from URL block
   * @private
   */
  _extractVideos(block) {
    const videos = []
    const videoRegex = /<video:video>([\s\S]*?)<\/video:video>/gi
    let match

    while ((match = videoRegex.exec(block)) !== null) {
      const videoBlock = match[1]
      const video = {
        url: this._extractTag(videoBlock, 'content_loc') || this._extractTag(videoBlock, 'video:content_loc'),
        thumbnailUrl: this._extractTag(videoBlock, 'thumbnail_loc') || this._extractTag(videoBlock, 'video:thumbnail_loc'),
        title: this._extractTag(videoBlock, 'title') || this._extractTag(videoBlock, 'video:title'),
        description: this._extractTag(videoBlock, 'description') || this._extractTag(videoBlock, 'video:description')
      }

      if (video.url || video.thumbnailUrl) {
        videos.push(video)
      }
    }

    return videos
  }

  /**
   * Parse XML sitemap index
   * @private
   */
  async _parseXmlIndex(content, opts) {
    const sitemapUrls = []

    // Extract <sitemap> blocks
    const sitemapRegex = /<sitemap>([\s\S]*?)<\/sitemap>/gi
    let match

    while ((match = sitemapRegex.exec(content)) !== null) {
      const sitemapBlock = match[1]
      const loc = this._extractTag(sitemapBlock, 'loc')
      const lastmod = this._extractTag(sitemapBlock, 'lastmod')

      if (loc) {
        sitemapUrls.push({ url: loc, lastmod })
      }

      if (sitemapUrls.length >= this.config.maxSitemaps) break
    }

    // If not recursive, just return the sitemap URLs as entries
    if (!opts.recursive) {
      return sitemapUrls.map(s => ({
        url: s.url,
        lastmod: s.lastmod,
        source: 'sitemap-index',
        type: 'sitemap'
      }))
    }

    // Recursively fetch and parse each sitemap
    const allEntries = []

    for (const sitemap of sitemapUrls) {
      if (this.stats.urlsExtracted >= this.config.maxUrls) break

      try {
        const entries = await this.parse(sitemap.url, {
          ...opts,
          _depth: opts._depth + 1
        })
        allEntries.push(...entries)
      } catch (error) {
        // Log error but continue with other sitemaps
        this.stats.errors++
      }
    }

    return allEntries
  }

  /**
   * Parse text sitemap (one URL per line)
   * @private
   */
  _parseTextSitemap(content) {
    const entries = []
    const lines = content.split(/\r?\n/)

    for (const line of lines) {
      const url = line.trim()

      // Skip empty lines and comments
      if (!url || url.startsWith('#')) continue

      // Validate URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        entries.push({
          url,
          source: 'sitemap-txt'
        })

        if (entries.length >= this.config.maxUrls) break
      }
    }

    return entries
  }

  /**
   * Parse RSS feed
   * @private
   */
  _parseRssFeed(content) {
    const entries = []

    // Extract <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    let match

    while ((match = itemRegex.exec(content)) !== null) {
      const itemBlock = match[1]

      const url = this._extractTag(itemBlock, 'link')
      const title = this._extractTag(itemBlock, 'title')
      const pubDate = this._extractTag(itemBlock, 'pubDate')
      const description = this._extractTag(itemBlock, 'description')

      if (url) {
        entries.push({
          url,
          title,
          lastmod: pubDate ? this._parseDate(pubDate) : null,
          description: description ? description.slice(0, 200) : null,
          source: 'rss'
        })

        if (entries.length >= this.config.maxUrls) break
      }
    }

    return entries
  }

  /**
   * Parse Atom feed
   * @private
   */
  _parseAtomFeed(content) {
    const entries = []

    // Extract <entry> blocks
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi
    let match

    while ((match = entryRegex.exec(content)) !== null) {
      const entryBlock = match[1]

      // Atom uses <link href="..."/> format
      const linkMatch = entryBlock.match(/<link[^>]+href=["']([^"']+)["'][^>]*(?:rel=["']alternate["'][^>]*)?(?:\/>|>)/i)
      const url = linkMatch ? linkMatch[1] : null

      const title = this._extractTag(entryBlock, 'title')
      const updated = this._extractTag(entryBlock, 'updated')
      const published = this._extractTag(entryBlock, 'published')
      const summary = this._extractTag(entryBlock, 'summary')

      if (url) {
        entries.push({
          url: this._decodeXmlEntities(url),
          title,
          lastmod: updated || published || null,
          description: summary ? summary.slice(0, 200) : null,
          source: 'atom'
        })

        if (entries.length >= this.config.maxUrls) break
      }
    }

    return entries
  }

  /**
   * Decode XML entities
   * @private
   */
  _decodeXmlEntities(str) {
    if (!str) return str

    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
  }

  /**
   * Parse date string to ISO format
   * @private
   */
  _parseDate(dateStr) {
    if (!dateStr) return null

    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toISOString()
    } catch {
      return dateStr
    }
  }

  /**
   * Get parser statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size
    }
  }

  /**
   * Clear cache
   * @param {string} [url] - Specific URL to clear, or all if not specified
   */
  clearCache(url) {
    if (url) {
      this.cache.delete(url)
    } else {
      this.cache.clear()
    }
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      sitemapsParsed: 0,
      urlsExtracted: 0,
      errors: 0
    }
  }

  /**
   * Discover sitemaps from robots.txt
   *
   * @param {string} robotsTxtUrl - URL to robots.txt
   * @returns {Promise<string[]>} Array of sitemap URLs
   */
  async discoverFromRobotsTxt(robotsTxtUrl) {
    try {
      const { content } = await this._fetch(robotsTxtUrl)
      const sitemaps = []

      const lines = content.split(/\r?\n/)
      for (const line of lines) {
        const match = line.match(/^\s*sitemap:\s*(.+)/i)
        if (match) {
          sitemaps.push(match[1].trim())
        }
      }

      return sitemaps
    } catch {
      return []
    }
  }

  /**
   * Try common sitemap locations for a domain
   *
   * @param {string} baseUrl - Base URL (e.g., 'https://example.com')
   * @returns {Promise<Array<{url: string, exists: boolean, format?: string}>>}
   */
  async probeCommonLocations(baseUrl) {
    const commonPaths = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap.xml.gz',
      '/sitemaps/sitemap.xml',
      '/sitemap.txt',
      '/feed.xml',
      '/rss.xml',
      '/atom.xml',
      '/feed',
      '/rss'
    ]

    const results = []

    for (const path of commonPaths) {
      const url = baseUrl.replace(/\/$/, '') + path

      try {
        const { content, contentType } = await this._fetch(url)
        const format = this._detectFormat(url, content, contentType)

        results.push({
          url,
          exists: true,
          format
        })
      } catch {
        results.push({
          url,
          exists: false
        })
      }
    }

    return results
  }
}

/**
 * @typedef {Object} SitemapEntry
 * @property {string} url - The URL
 * @property {string} [lastmod] - Last modification date
 * @property {string} [changefreq] - Change frequency (always, hourly, daily, etc.)
 * @property {number} [priority] - Priority (0.0 to 1.0)
 * @property {string} [title] - Title (from RSS/Atom)
 * @property {string} [description] - Description (from RSS/Atom)
 * @property {string} source - Source type (sitemap, sitemap-txt, rss, atom)
 * @property {Array} [images] - Image information (from XML sitemap)
 * @property {Array} [videos] - Video information (from XML sitemap)
 */

export default SitemapParser
