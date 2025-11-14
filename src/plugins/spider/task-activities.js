/**
 * Task Activities - Configurable crawl tasks for SpiderPlugin
 *
 * Defines all available activities that can be executed on a URL.
 * Activities are composable and can be mixed and matched per target.
 */

export const AVAILABLE_ACTIVITIES = {
  // ============================================
  // SCREENSHOT ACTIVITIES
  // ============================================
  screenshot_full: {
    name: 'screenshot_full',
    label: 'Full Page Screenshot',
    description: 'Capture entire scrollable page as image',
    category: 'visual',
    enabled: true
  },

  screenshot_viewport: {
    name: 'screenshot_viewport',
    label: 'Viewport Screenshot',
    description: 'Capture visible viewport (1920x1080)',
    category: 'visual',
    enabled: true
  },

  // ============================================
  // SECURITY ACTIVITIES
  // ============================================
  security_headers: {
    name: 'security_headers',
    label: 'Security Headers Analysis',
    description: 'Analyze HTTP security headers (HSTS, X-Frame-Options, etc.)',
    category: 'security',
    enabled: true
  },

  security_csp: {
    name: 'security_csp',
    label: 'CSP Analysis',
    description: 'Analyze Content Security Policy directives',
    category: 'security',
    enabled: true
  },

  security_cors: {
    name: 'security_cors',
    label: 'CORS Analysis',
    description: 'Analyze CORS configuration',
    category: 'security',
    enabled: true
  },

  security_tls: {
    name: 'security_tls',
    label: 'TLS/SSL Verification',
    description: 'Verify HTTPS and HSTS configuration',
    category: 'security',
    enabled: true
  },

  security_console_logs: {
    name: 'security_console_logs',
    label: 'Console Logs Capture',
    description: 'Capture browser console errors and warnings',
    category: 'security',
    enabled: true
  },

  security_websockets: {
    name: 'security_websockets',
    label: 'WebSocket Detection',
    description: 'Detect and capture WebSocket connections',
    category: 'security',
    enabled: true
  },

  security_captcha: {
    name: 'security_captcha',
    label: 'CAPTCHA Detection',
    description: 'Detect CAPTCHA implementations (reCAPTCHA, hCaptcha, etc.)',
    category: 'security',
    enabled: true
  },

  security_vulnerabilities: {
    name: 'security_vulnerabilities',
    label: 'Vulnerability Scan',
    description: 'Scan for security vulnerabilities and misconfigurations',
    category: 'security',
    enabled: true
  },

  // ============================================
  // SEO ACTIVITIES
  // ============================================
  seo_meta_tags: {
    name: 'seo_meta_tags',
    label: 'Meta Tags Extraction',
    description: 'Extract title, description, keywords, meta tags',
    category: 'seo',
    enabled: true
  },

  seo_opengraph: {
    name: 'seo_opengraph',
    label: 'OpenGraph Analysis',
    description: 'Extract OpenGraph tags for social sharing',
    category: 'seo',
    enabled: true
  },

  seo_twitter_card: {
    name: 'seo_twitter_card',
    label: 'Twitter Card Analysis',
    description: 'Extract Twitter Card tags',
    category: 'seo',
    enabled: true
  },

  seo_links_analysis: {
    name: 'seo_links_analysis',
    label: 'Links Analysis',
    description: 'Analyze internal, external, and referral links',
    category: 'seo',
    enabled: true
  },

  seo_content_analysis: {
    name: 'seo_content_analysis',
    label: 'Content Analysis',
    description: 'Analyze main content, word count, structure',
    category: 'seo',
    enabled: true
  },

  seo_accessibility: {
    name: 'seo_accessibility',
    label: 'Accessibility Analysis',
    description: 'Check WCAG 2.1 accessibility standards',
    category: 'seo',
    enabled: true
  },

  seo_heading_structure: {
    name: 'seo_heading_structure',
    label: 'Heading Structure',
    description: 'Analyze H1, H2, H3 tags and hierarchy',
    category: 'seo',
    enabled: true
  },

  // ============================================
  // TECHNOLOGY ACTIVITIES
  // ============================================
  tech_frameworks: {
    name: 'tech_frameworks',
    label: 'Framework Detection',
    description: 'Detect frontend frameworks (React, Vue, Angular, etc.)',
    category: 'technology',
    enabled: true
  },

  tech_analytics: {
    name: 'tech_analytics',
    label: 'Analytics Detection',
    description: 'Detect analytics platforms (GA, Amplitude, Mixpanel, etc.)',
    category: 'technology',
    enabled: true
  },

  tech_marketing: {
    name: 'tech_marketing',
    label: 'Marketing Pixels',
    description: 'Detect marketing pixels (Facebook, LinkedIn, Google Ads, etc.)',
    category: 'technology',
    enabled: true
  },

  tech_cdn: {
    name: 'tech_cdn',
    label: 'CDN Detection',
    description: 'Detect CDN providers (Cloudflare, CloudFront, etc.)',
    category: 'technology',
    enabled: true
  },

  tech_web_server: {
    name: 'tech_web_server',
    label: 'Web Server Detection',
    description: 'Detect web servers (Nginx, Apache, IIS, etc.)',
    category: 'technology',
    enabled: true
  },

  tech_cms: {
    name: 'tech_cms',
    label: 'CMS Detection',
    description: 'Detect CMS platforms (WordPress, Shopify, Drupal, etc.)',
    category: 'technology',
    enabled: true
  },

  tech_libraries: {
    name: 'tech_libraries',
    label: 'Libraries Detection',
    description: 'Detect JavaScript libraries (jQuery, Bootstrap, etc.)',
    category: 'technology',
    enabled: true
  },

  // ============================================
  // PERFORMANCE ACTIVITIES
  // ============================================
  performance_core_web_vitals: {
    name: 'performance_core_web_vitals',
    label: 'Core Web Vitals',
    description: 'Collect LCP, FID, CLS metrics',
    category: 'performance',
    enabled: true
  },

  performance_navigation_timing: {
    name: 'performance_navigation_timing',
    label: 'Navigation Timing',
    description: 'Collect page load timing metrics',
    category: 'performance',
    enabled: true
  },

  performance_resource_timing: {
    name: 'performance_resource_timing',
    label: 'Resource Timing',
    description: 'Collect individual resource timing',
    category: 'performance',
    enabled: true
  },

  performance_memory: {
    name: 'performance_memory',
    label: 'Memory Usage',
    description: 'Collect memory usage metrics',
    category: 'performance',
    enabled: true
  },

  // ============================================
  // ASSET ACTIVITIES
  // ============================================
  assets_css: {
    name: 'assets_css',
    label: 'CSS Analysis',
    description: 'Extract and analyze CSS assets',
    category: 'assets',
    enabled: true
  },

  assets_javascript: {
    name: 'assets_javascript',
    label: 'JavaScript Analysis',
    description: 'Extract and analyze JavaScript assets',
    category: 'assets',
    enabled: true
  },

  assets_images: {
    name: 'assets_images',
    label: 'Images Analysis',
    description: 'Extract and analyze image assets',
    category: 'assets',
    enabled: true
  },

  assets_videos: {
    name: 'assets_videos',
    label: 'Videos Analysis',
    description: 'Extract and analyze video assets',
    category: 'assets',
    enabled: true
  },

  assets_audios: {
    name: 'assets_audios',
    label: 'Audio Analysis',
    description: 'Extract and analyze audio assets',
    category: 'assets',
    enabled: true
  }
}

export const ACTIVITY_CATEGORIES = {
  visual: {
    name: 'visual',
    label: 'Visual Capture',
    description: 'Screenshot and visual analysis'
  },
  security: {
    name: 'security',
    label: 'Security Analysis',
    description: 'Security headers, vulnerabilities, and monitoring'
  },
  seo: {
    name: 'seo',
    label: 'SEO Analysis',
    description: 'SEO metrics and content optimization'
  },
  technology: {
    name: 'technology',
    label: 'Technology Detection',
    description: 'Framework and technology fingerprinting'
  },
  performance: {
    name: 'performance',
    label: 'Performance Metrics',
    description: 'Performance and speed metrics'
  },
  assets: {
    name: 'assets',
    label: 'Asset Analysis',
    description: 'CSS, JS, images, and media assets'
  }
}

/**
 * Get list of all activities by category
 */
export function getActivitiesByCategory(category) {
  return Object.values(AVAILABLE_ACTIVITIES).filter(
    (activity) => activity.category === category && activity.enabled
  )
}

/**
 * Get all available activities
 */
export function getAllActivities() {
  return Object.values(AVAILABLE_ACTIVITIES).filter((activity) => activity.enabled)
}

/**
 * Get all categories with their activities
 */
export function getCategoriesWithActivities() {
  const result = {}
  for (const [categoryName, categoryInfo] of Object.entries(ACTIVITY_CATEGORIES)) {
    result[categoryName] = {
      ...categoryInfo,
      activities: getActivitiesByCategory(categoryName)
    }
  }
  return result
}

/**
 * Validate activity list
 */
export function validateActivities(activityNames) {
  const validActivities = Object.keys(AVAILABLE_ACTIVITIES)
  const invalid = activityNames.filter((name) => !validActivities.includes(name))

  if (invalid.length > 0) {
    return {
      valid: false,
      message: `Invalid activities: ${invalid.join(', ')}`,
      invalid
    }
  }

  return { valid: true, invalid: [] }
}

/**
 * Get preset activity combinations
 */
export const ACTIVITY_PRESETS = {
  minimal: {
    name: 'minimal',
    label: 'Minimal Crawl',
    description: 'Only basic data - fast and lightweight',
    activities: ['screenshot_viewport', 'tech_frameworks', 'seo_meta_tags']
  },

  basic: {
    name: 'basic',
    label: 'Basic Crawl',
    description: 'Standard crawl with SEO and tech detection',
    activities: [
      'screenshot_full',
      'seo_meta_tags',
      'seo_opengraph',
      'seo_twitter_card',
      'tech_frameworks',
      'tech_analytics',
      'tech_cdn'
    ]
  },

  security: {
    name: 'security',
    label: 'Security Audit',
    description: 'Focused on security analysis',
    activities: [
      'security_headers',
      'security_csp',
      'security_cors',
      'security_tls',
      'security_console_logs',
      'security_websockets',
      'security_captcha',
      'security_vulnerabilities'
    ]
  },

  seo_complete: {
    name: 'seo_complete',
    label: 'Complete SEO Analysis',
    description: 'All SEO-related activities',
    activities: [
      'seo_meta_tags',
      'seo_opengraph',
      'seo_twitter_card',
      'seo_links_analysis',
      'seo_content_analysis',
      'seo_accessibility',
      'seo_heading_structure'
    ]
  },

  performance: {
    name: 'performance',
    label: 'Performance Analysis',
    description: 'Focused on performance metrics',
    activities: [
      'performance_core_web_vitals',
      'performance_navigation_timing',
      'performance_resource_timing',
      'performance_memory'
    ]
  },

  full: {
    name: 'full',
    label: 'Complete Analysis',
    description: 'All activities - comprehensive crawl',
    activities: getAllActivities().map((a) => a.name)
  }
}

/**
 * Get preset by name
 */
export function getPreset(presetName) {
  return ACTIVITY_PRESETS[presetName] || null
}
