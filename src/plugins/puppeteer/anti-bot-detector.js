/**
 * Anti-Bot Detector - Detection of anti-bot services and browser fingerprinting
 *
 * Detects:
 * - Anti-bot services (Cloudflare, reCAPTCHA, hCaptcha, etc.)
 * - Browser fingerprinting attempts
 * - Bot detection signals
 * - Stealth evasion indicators
 */

/**
 * Detect anti-bot services and CAPTCHA implementations
 */
export async function detectAntiBotServices(page) {
  try {
    const services = await page.evaluate(() => {
      const detected = {
        cloudflare: false,
        recaptcha: false,
        hcaptcha: false,
        invisibleRecaptcha: false,
        cloudflareChallenge: false,
        imperva: false,
        perimeter81: false,
        akamai: false,
        datadome: false,
        perimeterx: false,
        botManagement: [],
        captchaElements: [],
        scriptIndicators: [],
        networkIndicators: []
      }

      // Check for Cloudflare anti-bot scripts
      if (window.__cf_cgiindex !== undefined || window.__cfruid !== undefined) {
        detected.cloudflare = true
        detected.botManagement.push('Cloudflare')
      }

      // Check for reCAPTCHA
      if (window.grecaptcha !== undefined) {
        detected.recaptcha = true
        detected.botManagement.push('reCAPTCHA')

        // Check if invisible
        const recaptchaElements = document.querySelectorAll('[data-sitekey]')
        if (recaptchaElements.length > 0) {
          recaptchaElements.forEach((el) => {
            detected.captchaElements.push({
              type: 'reCAPTCHA',
              sitekey: el.getAttribute('data-sitekey'),
              theme: el.getAttribute('data-theme'),
              callback: el.getAttribute('data-callback'),
              size: el.getAttribute('data-size')
            })
          })
        }

        if (window.__grecaptcha_cfg && window.__grecaptcha_cfg.clients) {
          for (const clientId in window.__grecaptcha_cfg.clients) {
            const client = window.__grecaptcha_cfg.clients[clientId]
            if (client.isReady && !client.isVisible) {
              detected.invisibleRecaptcha = true
            }
          }
        }
      }

      // Check for hCaptcha
      if (window.hcaptcha !== undefined) {
        detected.hcaptcha = true
        detected.botManagement.push('hCaptcha')

        const hcaptchaElements = document.querySelectorAll('[data-sitekey][class*="h-captcha"]')
        hcaptchaElements.forEach((el) => {
          detected.captchaElements.push({
            type: 'hCaptcha',
            sitekey: el.getAttribute('data-sitekey'),
            theme: el.getAttribute('data-theme'),
            endpoint: el.getAttribute('data-endpoint')
          })
        })
      }

      // Check for Cloudflare challenge page
      if (
        document.title.includes('Just a moment') ||
        document.body.innerHTML.includes('Ray ID') ||
        document.body.innerHTML.includes('Checking your browser')
      ) {
        detected.cloudflareChallenge = true
        detected.botManagement.push('Cloudflare Challenge')
      }

      // Check for Imperva/Incapsula
      if (
        window._IMPERVA_ASI !== undefined ||
        document.documentElement.getAttribute('data-imperva-fingerprint') ||
        document.body.innerHTML.includes('imperva') ||
        document.body.innerHTML.includes('incapsula')
      ) {
        detected.imperva = true
        detected.botManagement.push('Imperva/Incapsula')
      }

      // Check for Perimeterx
      if (window._pxAppId !== undefined || document.getElementById('pxScript')) {
        detected.perimeterx = true
        detected.botManagement.push('PerimeterX')
      }

      // Check for Akamai Bot Manager
      if (window.AKAMAI_SNIPPETS !== undefined || document.getElementById('akam-speedtest')) {
        detected.akamai = true
        detected.botManagement.push('Akamai')
      }

      // Check for DataDome
      if (
        window.__dd_request !== undefined ||
        document.documentElement.getAttribute('data-dd-cookies-accepted') ||
        window.datadome !== undefined
      ) {
        detected.datadome = true
        detected.botManagement.push('DataDome')
      }

      // Check for Google Analytics/GTM (can block bots)
      if (window.ga !== undefined || window.gtag !== undefined) {
        detected.scriptIndicators.push('Google Analytics/GTM')
      }

      // Check for Segment (can include bot detection)
      if (window.analytics !== undefined) {
        detected.scriptIndicators.push('Segment Analytics')
      }

      // Check for scripts that might implement bot detection
      const allScripts = Array.from(document.querySelectorAll('script'))
      allScripts.forEach((script) => {
        const src = script.src.toLowerCase()
        const content = script.textContent.toLowerCase()

        if (src.includes('bot') || src.includes('security') || src.includes('detection')) {
          detected.scriptIndicators.push(`Script: ${src || 'inline'}`)
        }

        if (
          content.includes('navigator.webdriver') ||
          content.includes('__nightmare') ||
          content.includes('__selenium') ||
          content.includes('webdriver')
        ) {
          detected.scriptIndicators.push('Webdriver detection')
        }
      })

      return detected
    })

    return {
      antiBotServicesDetected: services.botManagement.length > 0,
      services: {
        cloudflare: services.cloudflare,
        cloudflareChallenge: services.cloudflareChallenge,
        recaptcha: services.recaptcha,
        invisibleRecaptcha: services.invisibleRecaptcha,
        hcaptcha: services.hcaptcha,
        imperva: services.imperva,
        perimeterx: services.perimeterx,
        akamai: services.akamai,
        datadome: services.datadome
      },
      detectedServices: services.botManagement,
      captchaElements: services.captchaElements,
      scriptIndicators: services.scriptIndicators
    }
  } catch (error) {
    this.logger.error('[AntiBotDetector] Error detecting anti-bot services:', error.message)
    return {
      antiBotServicesDetected: false,
      services: {},
      detectedServices: [],
      captchaElements: [],
      scriptIndicators: [],
      error: error.message
    }
  }
}

/**
 * Detect browser fingerprinting attempts and collect fingerprint data
 */
export async function detectFingerprinting(page) {
  try {
    const fingerprint = await page.evaluate(() => {
      const data = {
        fingerprintingIndicators: [],
        browserProperties: {},
        capabilities: {},
        anomalies: []
      }

      // Check navigator.webdriver (Puppeteer/Selenium detection)
      if (navigator.webdriver) {
        data.anomalies.push('navigator.webdriver is true (likely detected as automated)')
      }

      // Browser properties commonly used for fingerprinting
      data.browserProperties = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: Array.from(navigator.languages || []),
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        maxTouchPoints: navigator.maxTouchPoints,
        vendor: navigator.vendor,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        plugins: Array.from(navigator.plugins || []).map((p) => ({
          name: p.name,
          description: p.description,
          version: p.version
        })),
        timezoneOffset: new Date().getTimezoneOffset(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }

      // Check for common fingerprinting APIs
      if (typeof window.OffscreenCanvas !== 'undefined') {
        data.fingerprintingIndicators.push('Canvas fingerprinting capability (OffscreenCanvas)')
      }

      if (typeof window.WebGL !== 'undefined') {
        data.fingerprintingIndicators.push('WebGL fingerprinting capability')
        try {
          const canvas = document.createElement('canvas')
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
          if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
            if (debugInfo) {
              data.capabilities.webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
              data.capabilities.webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            }
          }
        } catch (e) {
          // WebGL not available
        }
      }

      // Canvas fingerprinting
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 280
        canvas.height = 60
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.textBaseline = 'top'
          ctx.font = '14px Arial'
          ctx.textBaseline = 'alphabetic'
          ctx.fillStyle = '#f60'
          ctx.fillRect(125, 1, 62, 20)
          ctx.fillStyle = '#069'
          ctx.fillText('Browser fingerprint', 2, 15)

          data.capabilities.canvasFingerprint = canvas.toDataURL().substring(0, 50) + '...'
          data.fingerprintingIndicators.push('Canvas API available for fingerprinting')
        }
      } catch (e) {
        // Canvas not available
      }

      // Audio fingerprinting
      if (typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined') {
        data.fingerprintingIndicators.push('Web Audio API available (for audio fingerprinting)')
      }

      // LocalStorage fingerprinting
      try {
        if (window.localStorage && window.localStorage.length > 0) {
          data.fingerprintingIndicators.push('localStorage contains data (can be used for fingerprinting)')
        }
      } catch (e) {
        // LocalStorage not available
      }

      // IndexedDB fingerprinting
      try {
        if (window.indexedDB) {
          data.fingerprintingIndicators.push('IndexedDB available (can be used for fingerprinting)')
        }
      } catch (e) {
        // IndexedDB not available
      }

      // Check for headless detection
      if (
        /headless/i.test(navigator.userAgent) ||
        window.document.documentElement.getAttribute('webdriver')
      ) {
        data.anomalies.push('Potential headless browser signature detected')
      }

      // Check for common automation tool strings
      const automationTools = ['puppeteer', 'phantom', 'nightmare', 'webdriver', 'selenium', 'watir']
      automationTools.forEach((tool) => {
        if (navigator.userAgent.toLowerCase().includes(tool)) {
          data.anomalies.push(`Automation tool "${tool}" detected in user agent`)
        }
      })

      // Screen fingerprinting
      data.capabilities.screenResolution = `${window.screen.width}x${window.screen.height}`
      data.capabilities.screenColorDepth = window.screen.colorDepth
      data.capabilities.screenPixelDepth = window.screen.pixelDepth
      data.capabilities.screenDevicePixelRatio = window.devicePixelRatio

      // Battery Status API (if available)
      if (navigator.getBattery) {
        data.fingerprintingIndicators.push('Battery Status API available')
      }

      // Sensor data (if available)
      if (typeof window.Sensor !== 'undefined') {
        data.fingerprintingIndicators.push('Sensor API available (gyroscope, accelerometer, etc.)')
      }

      // MIDI API
      if (typeof window.navigator.requestMIDIAccess !== 'undefined') {
        data.fingerprintingIndicators.push('Web MIDI API available')
      }

      return data
    })

    return {
      browserFingerprint: fingerprint.browserProperties,
      fingerprinting: {
        indicators: fingerprint.fingerprintingIndicators,
        capabilities: fingerprint.capabilities,
        anomalies: fingerprint.anomalies
      },
      detectedAutomationSignatures: fingerprint.anomalies
    }
  } catch (error) {
    this.logger.error('[AntiBotDetector] Error detecting fingerprinting:', error.message)
    return {
      browserFingerprint: {},
      fingerprinting: {
        indicators: [],
        capabilities: {},
        anomalies: []
      },
      detectedAutomationSignatures: [],
      error: error.message
    }
  }
}

/**
 * Detect blocking signals from HTTP responses
 */
export async function detectBlockingSignals(response) {
  const indicators = {
    blocked: false,
    signals: [],
    statusCode: response?.status?.() || null,
    headers: {}
  }

  if (!response) {
    return indicators
  }

  const statusCode = response.status()

  // Check for blocking status codes
  if (statusCode === 403) {
    indicators.blocked = true
    indicators.signals.push('403 Forbidden - likely blocked')
  } else if (statusCode === 429) {
    indicators.blocked = true
    indicators.signals.push('429 Too Many Requests - rate limited')
  } else if (statusCode === 503) {
    indicators.signals.push('503 Service Unavailable - potential blocking')
  } else if (statusCode === 401) {
    indicators.signals.push('401 Unauthorized')
  }

  // Check response headers for anti-bot indicators
  try {
    const headers = response.headers()
    indicators.headers = headers

    if (headers['cf-ray']) {
      indicators.signals.push('Cloudflare detected (cf-ray header)')
    }

    if (headers['server']) {
      indicators.headers.server = headers['server']
    }

    if (headers['x-cdn'] || headers['via']) {
      indicators.signals.push('CDN detected in headers')
    }

    if (headers['x-cache'] === 'HIT') {
      indicators.signals.push('Page served from cache (potential bot bypass)')
    }
  } catch (e) {
    // Headers not accessible
  }

  return indicators
}

/**
 * Comprehensive anti-bot and fingerprinting detection
 */
export async function detectAntiBotsAndFingerprinting(page) {
  const [antiBots, fingerprinting] = await Promise.all([
    detectAntiBotServices(page),
    detectFingerprinting(page)
  ])

  return {
    antiBots,
    fingerprinting,
    riskLevel: antiBots.antiBotServicesDetected ? 'HIGH' : 'NORMAL',
    summary: {
      antiBotServicesCount: antiBots.detectedServices.length,
      fingerprintingIndicatorsCount: fingerprinting.fingerprinting.indicators.length,
      automationSignalsCount: fingerprinting.detectedAutomationSignatures.length,
      captchaElementsCount: antiBots.captchaElements.length
    }
  }
}
