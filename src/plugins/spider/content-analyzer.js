/**
 * Content Analyzer - IFrame and Tracking Pixel Detection
 *
 * Analyzes page content for embedded iframes and tracking pixels.
 * Detects common tracking services and embeds.
 */

/**
 * Common tracking pixel patterns
 */
const TRACKING_PIXEL_PATTERNS = {
  // Google Analytics
  google_analytics: /googleadservices|google-analytics|analytics\.google|gtag/i,

  // Meta/Facebook
  facebook_pixel: /facebook\.com|fbcdn\.net/i,

  // Twitter
  twitter: /twitter\.com|twimg\.com/i,

  // LinkedIn
  linkedin: /linkedin\.com|licdn\.com/i,

  // Reddit
  reddit: /reddit\.com|redditmedia\.com/i,

  // TikTok
  tiktok: /tiktok\.com|tiktokcdn\.com/i,

  // Snapchat
  snapchat: /snapchat\.com|sc-static\.net/i,

  // Pinterest
  pinterest: /pinterest\.com|pinimg\.com/i,

  // HubSpot
  hubspot: /hubspot\.com|hs-script\.com/i,

  // Mixpanel
  mixpanel: /mixpanel\.com/i,

  // Amplitude
  amplitude: /amplitude\.com/i,

  // Segment
  segment: /segment\.com|cdn\.segment\.com/i,

  // Hotjar
  hotjar: /hotjar\.com|hjcdn\.com/i,

  // Crazy Egg
  crazy_egg: /crazyegg\.com/i,

  // Mouseflow
  mouseflow: /mouseflow\.com/i,

  // FullStory
  fullstory: /fullstory\.com/i,

  // Drift
  drift: /drift\.com|driftt\.com/i,

  // Intercom
  intercom: /intercom\.io|intercomcdn\.com/i,

  // Zendesk
  zendesk: /zendesk\.com|zopim\.com/i,

  // Qualtrics
  qualtrics: /qualtrics\.com/i,

  // Surveysparrow
  surveysparrow: /surveysparrow\.com/i,

  // Google AdSense
  google_adsense: /google.*ad|adsense\.google|pagead|googleadmanager/i,

  // Google Tag Manager
  google_tag_manager: /gtm\.js|googletagmanager\.com/i,

  // AppNexus/Xandr
  appnexus: /appnexus\.com|ams\.xandr\.com/i,

  // Criteo
  criteo: /criteo\.com|criteocdn\.com/i,

  // DoubleClick/DFP
  doubleclick: /doubleclick\.net|googlesyndication\.com/i,

  // Rubicon
  rubicon: /rubiconproject\.com|rpxl\.io/i,

  // OpenX
  openx: /openx\.com|openxcdn\.com/i,

  // Pubmatic
  pubmatic: /pubmatic\.com/i,

  // Flurry
  flurry: /flurry\.com/i,

  // Chartbeat
  chartbeat: /chartbeat\.net/i,

  // Comscore
  comscore: /comscore\.com/i,

  // Quantcast
  quantcast: /quantcast\.com|quantserve\.com/i,

  // Urchin
  urchin: /urchin\.js|analytics\.google|stats\./i
}

/**
 * Detect tracking service from URL
 */
function detectTrackingService(url) {
  for (const [service, pattern] of Object.entries(TRACKING_PIXEL_PATTERNS)) {
    if (pattern.test(url)) {
      return service
    }
  }
  return null
}

/**
 * Analyze IFrames on page
 *
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} IFrame analysis results
 */
export async function analyzeIFrames(page) {
  try {
    const iframes = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('iframe'))
      return frames.map((frame) => ({
        src: frame.src || null,
        title: frame.title || null,
        name: frame.name || null,
        id: frame.id || null,
        className: frame.className || null,
        width: frame.width || null,
        height: frame.height || null,
        sandbox: frame.sandbox?.toString() || null,
        frameBorder: frame.frameBorder || null,
        loading: frame.loading || null,
        referrerPolicy: frame.referrerPolicy || null,
        allow: frame.allow || null,
        credentialless: frame.credentialless || false,
        visible: {
          offsetParent: frame.offsetParent !== null,
          clientHeight: frame.clientHeight,
          clientWidth: frame.clientWidth
        }
      }))
    })

    // Categorize iframes
    const categorized = {
      advertising: [],
      analytics: [],
      social: [],
      embedded_content: [],
      unknown: []
    }

    iframes.forEach((iframe) => {
      if (!iframe.src || iframe.src === '') {
        categorized.unknown.push(iframe)
        return
      }

      const src = iframe.src.toLowerCase()

      if (
        /doubleclick|google.*ad|adsense|criteo|appnexus|rubicon|openx|pubmatic|xandr/i.test(src)
      ) {
        categorized.advertising.push(iframe)
      } else if (/google.*analytics|gtag|mixpanel|amplitude|segment|hotjar|fullstory/i.test(src)) {
        categorized.analytics.push(iframe)
      } else if (/facebook|twitter|linkedin|reddit|youtube|instagram|tiktok/i.test(src)) {
        categorized.social.push(iframe)
      } else if (/youtube|vimeo|dailymotion|soundcloud|spotify|disqus|typeform|typeform|zendesk/i.test(src)) {
        categorized.embedded_content.push(iframe)
      } else {
        categorized.unknown.push(iframe)
      }
    })

    return {
      present: iframes.length > 0,
      count: iframes.length,
      iframes,
      categorized
    }
  } catch (error) {
    this.logger.error('[ContentAnalyzer] Error analyzing iframes:', error)
    return {
      present: false,
      count: 0,
      iframes: [],
      categorized: {
        advertising: [],
        analytics: [],
        social: [],
        embedded_content: [],
        unknown: []
      },
      error: error.message
    }
  }
}

/**
 * Detect tracking pixels and beacons
 *
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Object>} Tracking pixel analysis results
 */
export async function detectTrackingPixels(page) {
  try {
    const trackingElements = await page.evaluate(() => {
      const pixels = []

      // Analyze img tags for tracking pixels
      Array.from(document.querySelectorAll('img')).forEach((img) => {
        const src = img.src || ''
        // Tracking pixels are typically 1x1 or very small
        const isTrackingPixel =
          src.includes('gif') ||
          src.includes('pixel') ||
          src.includes('beacon') ||
          src.includes('track') ||
          (img.width === 1 && img.height === 1) ||
          (parseInt(img.width) <= 10 && parseInt(img.height) <= 10)

        if (isTrackingPixel && src.length > 0) {
          pixels.push({
            type: 'img',
            src,
            width: img.width,
            height: img.height,
            alt: img.alt || null
          })
        }
      })

      // Analyze inline scripts for tracking calls
      const scripts = Array.from(document.querySelectorAll('script'))
      scripts.forEach((script) => {
        const content = script.textContent || ''

        if (
          /gtag|ga\(|_gaq|_gat|analytics\.push|amplitude\.getInstance|mixpanel\.track|intercom|drift|zendesk|fbq|twq\.track|rdt|_fbp|_fbc/i.test(
            content
          )
        ) {
          pixels.push({
            type: 'script_tracking',
            service: 'inline_tracking_script',
            snippet: content.substring(0, 200)
          })
        }
      })

      // Detect tracking attributes
      const trackingAttrs = []
      document.querySelectorAll('[data-track], [data-analytics], [data-event]').forEach((el) => {
        trackingAttrs.push({
          tag: el.tagName.toLowerCase(),
          attributes: Object.fromEntries(
            Array.from(el.attributes)
              .filter((attr) =>
                /track|analytics|event|ga|gtag|amplitude|mixpanel|segment|hotjar/i.test(attr.name)
              )
              .map((attr) => [attr.name, attr.value])
          )
        })
      })

      return {
        pixels,
        trackingScripts: pixels.filter((p) => p.type === 'script_tracking').length,
        trackingAttributes: trackingAttrs
      }
    })

    // Detect tracking from network requests (if network monitoring is active)
    const networkPixels = []

    // Get list from CDP if available
    if (page.client && page.client.send) {
      try {
        // This would need network monitoring setup
      } catch (e) {
        // Network monitoring not available in this context
      }
    }

    // Categorize detected tracking
    const services = {}
    trackingElements.pixels.forEach((pixel) => {
      if (pixel.src) {
        const service = detectTrackingService(pixel.src)
        if (service) {
          if (!services[service]) {
            services[service] = []
          }
          services[service].push(pixel)
        }
      }
    })

    return {
      present: trackingElements.pixels.length > 0 || trackingElements.trackingScripts > 0,
      detectedServices: Object.keys(services),
      pixelCount: trackingElements.pixels.filter((p) => p.type === 'img').length,
      trackingScriptCount: trackingElements.trackingScripts,
      trackingAttributeCount: trackingElements.trackingAttributes.length,
      pixels: trackingElements.pixels,
      services,
      trackingAttributes: trackingElements.trackingAttributes
    }
  } catch (error) {
    this.logger.error('[ContentAnalyzer] Error detecting tracking pixels:', error)
    return {
      present: false,
      detectedServices: [],
      pixelCount: 0,
      trackingScriptCount: 0,
      trackingAttributeCount: 0,
      pixels: [],
      services: {},
      trackingAttributes: [],
      error: error.message
    }
  }
}
