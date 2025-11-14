/**
 * SEO Analyzer - Extracts SEO metadata from HTML
 *
 * Extracts:
 * - Meta tags (title, description, keywords, charset, viewport, author, robots)
 * - OpenGraph tags (og:title, og:image, og:description, og:type, og:url)
 * - Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)
 * - Canonical link
 * - Alternate links (hreflang)
 * - Assets (CSS, JS, images, videos, audios)
 * - Asset metadata (counts, types, sizes where available)
 */
export class SEOAnalyzer {
  constructor(config = {}) {
    this.config = {
      extractMetaTags: config.extractMetaTags !== false,
      extractOpenGraph: config.extractOpenGraph !== false,
      extractTwitterCard: config.extractTwitterCard !== false,
      extractAssets: config.extractAssets !== false,
      assetMetadata: config.assetMetadata !== false
    }
  }

  /**
   * Analyze HTML for SEO data
   *
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL for relative links
   * @returns {Object} Analysis results
   */
  analyze(html, baseUrl) {
    const result = {
      metaTags: null,
      openGraph: null,
      twitterCard: null,
      canonical: null,
      alternates: [],
      assets: null
    }

    try {
      // Parse HTML (simple DOM-like parsing)
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
    } catch (error) {
      // If DOMParser fails, use regex fallback
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
   * Extract meta tags from document
   * @private
   */
  _extractMetaTags(doc) {
    const metaTags = {}

    // Title
    const titleEl = doc.querySelector('title')
    if (titleEl) {
      metaTags.title = titleEl.textContent
    }

    // Meta tags
    const metaElements = doc.querySelectorAll('meta')
    for (const meta of metaElements) {
      const name = meta.getAttribute('name') || meta.getAttribute('property')
      const content = meta.getAttribute('content')

      if (name && content) {
        const key = name.toLowerCase()
        if (
          key === 'description' ||
          key === 'keywords' ||
          key === 'author' ||
          key === 'charset' ||
          key === 'viewport' ||
          key === 'robots' ||
          key === 'language' ||
          key === 'revisit-after' ||
          key === 'rating'
        ) {
          metaTags[key] = content
        }
      }
    }

    return Object.keys(metaTags).length > 0 ? metaTags : null
  }

  /**
   * Extract meta tags using regex (fallback)
   * @private
   */
  _extractMetaTagsRegex(html) {
    const metaTags = {}

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      metaTags.title = titleMatch[1].trim()
    }

    // Meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    if (descMatch) {
      metaTags.description = descMatch[1]
    }

    // Meta keywords
    const keywordsMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i)
    if (keywordsMatch) {
      metaTags.keywords = keywordsMatch[1]
    }

    // Meta author
    const authorMatch = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)
    if (authorMatch) {
      metaTags.author = authorMatch[1]
    }

    // Meta viewport
    const viewportMatch = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i)
    if (viewportMatch) {
      metaTags.viewport = viewportMatch[1]
    }

    // Meta robots
    const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)
    if (robotsMatch) {
      metaTags.robots = robotsMatch[1]
    }

    return Object.keys(metaTags).length > 0 ? metaTags : null
  }

  /**
   * Extract OpenGraph tags from document
   * @private
   */
  _extractOpenGraph(doc) {
    const og = {}

    const metaElements = doc.querySelectorAll('meta[property^="og:"]')
    for (const meta of metaElements) {
      const property = meta.getAttribute('property')
      const content = meta.getAttribute('content')

      if (property && content) {
        const key = property.replace('og:', '')
        og[key] = content
      }
    }

    return Object.keys(og).length > 0 ? og : null
  }

  /**
   * Extract OpenGraph tags using regex (fallback)
   * @private
   */
  _extractOpenGraphRegex(html) {
    const og = {}

    const ogRegex = /<meta\s+property=["']og:([^"']+)["']\s+content=["']([^"']+)["']/gi
    let match

    while ((match = ogRegex.exec(html)) !== null) {
      og[match[1]] = match[2]
    }

    return Object.keys(og).length > 0 ? og : null
  }

  /**
   * Extract Twitter Card tags from document
   * @private
   */
  _extractTwitterCard(doc) {
    const twitter = {}

    const metaElements = doc.querySelectorAll('meta[name^="twitter:"]')
    for (const meta of metaElements) {
      const name = meta.getAttribute('name')
      const content = meta.getAttribute('content')

      if (name && content) {
        const key = name.replace('twitter:', '')
        twitter[key] = content
      }
    }

    return Object.keys(twitter).length > 0 ? twitter : null
  }

  /**
   * Extract Twitter Card tags using regex (fallback)
   * @private
   */
  _extractTwitterCardRegex(html) {
    const twitter = {}

    const twitterRegex = /<meta\s+name=["']twitter:([^"']+)["']\s+content=["']([^"']+)["']/gi
    let match

    while ((match = twitterRegex.exec(html)) !== null) {
      twitter[match[1]] = match[2]
    }

    return Object.keys(twitter).length > 0 ? twitter : null
  }

  /**
   * Extract canonical link from document
   * @private
   */
  _extractCanonical(doc) {
    const link = doc.querySelector('link[rel="canonical"]')
    return link ? link.getAttribute('href') : null
  }

  /**
   * Extract canonical link using regex (fallback)
   * @private
   */
  _extractCanonicalRegex(html) {
    const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
    return match ? match[1] : null
  }

  /**
   * Extract alternate links (hreflang) from document
   * @private
   */
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

    return alternates.length > 0 ? alternates : []
  }

  /**
   * Extract alternate links using regex (fallback)
   * @private
   */
  _extractAlternatesRegex(html) {
    const alternates = []

    const altRegex = /<link\s+rel=["']alternate["']\s+hreflang=["']([^"']+)["']\s+href=["']([^"']+)["']/gi
    let match

    while ((match = altRegex.exec(html)) !== null) {
      alternates.push({ hreflang: match[1], href: match[2] })
    }

    return alternates
  }

  /**
   * Extract assets from document
   * @private
   */
  _extractAssets(doc, baseUrl) {
    const assets = {
      stylesheets: [],
      scripts: [],
      images: [],
      videos: [],
      audios: [],
      summary: {}
    }

    // Stylesheets
    const links = doc.querySelectorAll('link[rel="stylesheet"]')
    for (const link of links) {
      assets.stylesheets.push({
        href: link.getAttribute('href'),
        media: link.getAttribute('media') || 'all',
        type: 'text/css'
      })
    }

    // Scripts
    const scripts = doc.querySelectorAll('script[src]')
    for (const script of scripts) {
      assets.scripts.push({
        src: script.getAttribute('src'),
        async: script.hasAttribute('async'),
        defer: script.hasAttribute('defer'),
        type: script.getAttribute('type') || 'text/javascript'
      })
    }

    // Images
    const images = doc.querySelectorAll('img')
    for (const img of images) {
      assets.images.push({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt') || '',
        width: img.getAttribute('width'),
        height: img.getAttribute('height')
      })
    }

    // Videos
    const videos = doc.querySelectorAll('video')
    for (const video of videos) {
      const sources = Array.from(video.querySelectorAll('source')).map(s => ({
        src: s.getAttribute('src'),
        type: s.getAttribute('type')
      }))
      assets.videos.push({
        sources,
        poster: video.getAttribute('poster'),
        controls: video.hasAttribute('controls'),
        autoplay: video.hasAttribute('autoplay')
      })
    }

    // Audios
    const audios = doc.querySelectorAll('audio')
    for (const audio of audios) {
      const sources = Array.from(audio.querySelectorAll('source')).map(s => ({
        src: s.getAttribute('src'),
        type: s.getAttribute('type')
      }))
      assets.audios.push({
        sources,
        controls: audio.hasAttribute('controls'),
        autoplay: audio.hasAttribute('autoplay')
      })
    }

    // Summary
    if (this.config.assetMetadata) {
      assets.summary = {
        totalStylesheets: assets.stylesheets.length,
        totalScripts: assets.scripts.length,
        totalImages: assets.images.length,
        totalVideos: assets.videos.length,
        totalAudios: assets.audios.length,
        scriptTypes: this._countTypes(assets.scripts, 'type'),
        imageFormats: this._extractImageFormats(assets.images),
        videoFormats: this._extractVideoFormats(assets.videos),
        audioFormats: this._extractAudioFormats(assets.audios)
      }
    }

    return assets
  }

  /**
   * Extract assets using regex (fallback)
   * @private
   */
  _extractAssetsRegex(html, baseUrl) {
    const assets = {
      stylesheets: [],
      scripts: [],
      images: [],
      videos: [],
      audios: [],
      summary: {}
    }

    // Stylesheets
    const linkRegex = /<link\s+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi
    let match
    while ((match = linkRegex.exec(html)) !== null) {
      assets.stylesheets.push({
        href: match[1],
        type: 'text/css'
      })
    }

    // Scripts
    const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi
    while ((match = scriptRegex.exec(html)) !== null) {
      assets.scripts.push({
        src: match[1],
        type: 'text/javascript'
      })
    }

    // Images
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi
    while ((match = imgRegex.exec(html)) !== null) {
      assets.images.push({
        src: match[1]
      })
    }

    // Summary
    if (this.config.assetMetadata) {
      assets.summary = {
        totalStylesheets: assets.stylesheets.length,
        totalScripts: assets.scripts.length,
        totalImages: assets.images.length,
        totalVideos: assets.videos.length,
        totalAudios: assets.audios.length,
        imageFormats: this._extractImageFormats(assets.images)
      }
    }

    return assets
  }

  /**
   * Count types in array of objects
   * @private
   */
  _countTypes(items, field) {
    const counts = {}
    for (const item of items) {
      const type = item[field] || 'unknown'
      counts[type] = (counts[type] || 0) + 1
    }
    return counts
  }

  /**
   * Extract image formats from image list
   * @private
   */
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

  /**
   * Extract video formats from video list
   * @private
   */
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

  /**
   * Extract audio formats from audio list
   * @private
   */
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
