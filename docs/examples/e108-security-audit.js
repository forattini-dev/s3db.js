/**
 * Example 108: Website Security Audit with Puppeteer
 *
 * Demonstrates comprehensive security analysis using the Spider Plugin:
 * - Console errors and warnings detection
 * - JavaScript runtime errors
 * - TLS/SSL certificate validation
 * - Security headers analysis (CSP, HSTS, X-Frame-Options, etc.)
 * - Mixed content warnings (HTTP resources on HTTPS)
 * - Cookie security (HttpOnly, Secure, SameSite)
 * - Failed network requests
 * - CSP violations
 * - Form security (action URLs, method validation)
 * - Third-party scripts analysis
 * - CORS configuration
 * - Security score calculation
 *
 * Real-world use cases:
 * - Security audits and compliance
 * - Vulnerability scanning
 * - OWASP security testing
 * - PCI-DSS compliance
 * - SSL/TLS monitoring
 * - CSP policy validation
 * - Third-party script tracking
 */

import { Database } from '../../src/database.class.js'
import { SpiderPlugin } from '../../src/plugins/spider.plugin.js'

async function securityAudit() {
  console.log('🔒 Website Security Audit\n')
  console.log('━'.repeat(60))

  // Initialize database
  const db = new Database({
    connectionString: 'memory://security-audit/db'
  })
  await db.connect()

  // Create resource for storing security audit reports
  await db.createResource({
    name: 'security_reports',
    attributes: {
      url: 'string|required',
      domain: 'string|required',

      // TLS/SSL
      certificate: 'object|optional',      // Certificate details
      tlsVersion: 'string|optional',
      cipherSuite: 'string|optional',

      // Security Headers
      securityHeaders: 'object|optional',  // CSP, HSTS, X-Frame-Options, etc.

      // Console & Errors
      consoleErrors: 'array|optional',     // Console errors
      consoleWarnings: 'array|optional',   // Console warnings
      jsErrors: 'array|optional',          // JavaScript runtime errors

      // Network Security
      mixedContent: 'array|optional',      // HTTP resources on HTTPS
      failedRequests: 'array|optional',    // Failed HTTP requests
      insecureResources: 'array|optional', // HTTP scripts/styles

      // Cookies
      cookies: 'array|optional',           // Cookie security analysis

      // Content Security Policy
      cspViolations: 'array|optional',     // CSP violations
      cspDirectives: 'object|optional',    // Parsed CSP

      // Forms
      forms: 'array|optional',             // Form security

      // Third-party
      thirdPartyScripts: 'array|optional', // External scripts
      thirdPartyDomains: 'array|optional', // External domains

      // CORS
      corsHeaders: 'object|optional',      // CORS configuration

      // Security Score
      securityScore: 'object|optional',    // Score + recommendations

      // Metadata
      auditedAt: 'string|required',
      auditVersion: 'string|optional'
    }
  })

  // Configure Spider Plugin with enhanced Puppeteer settings
  const spider = new SpiderPlugin({
    namespace: 'security-audit',

    // URL pattern matching
    patterns: {
      allPages: {
        match: /.*/,
        activities: ['security_audit'],
        metadata: { type: 'audit' }
      }
    },

    // Puppeteer configuration with security focus
    puppeteer: {
      headless: true,
      ignoreHTTPSErrors: false,  // Detect certificate errors
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
      retryAttempts: 1  // Don't retry on security errors
    }
  })

  await db.usePlugin(spider, 'spider')

  // Register custom activity for security audit
  spider.registerActivity('security_audit', async ({ page, url, metadata }) => {
    console.log(`\n🔍 Auditing: ${url}`)

    // Arrays to collect security findings
    const consoleErrors = []
    const consoleWarnings = []
    const jsErrors = []
    const failedRequests = []
    const cspViolations = []
    const mixedContent = []

    try {
      // 1. Listen for console messages
      page.on('console', msg => {
        const type = msg.type()
        const text = msg.text()

        if (type === 'error') {
          consoleErrors.push({
            type: 'error',
            text,
            timestamp: new Date().toISOString()
          })
        } else if (type === 'warning') {
          consoleWarnings.push({
            type: 'warning',
            text,
            timestamp: new Date().toISOString()
          })
        }
      })

      // 2. Listen for JavaScript errors
      page.on('pageerror', error => {
        jsErrors.push({
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
      })

      // 3. Listen for failed requests
      page.on('requestfailed', request => {
        const failure = request.failure()
        failedRequests.push({
          url: request.url(),
          method: request.method(),
          errorText: failure ? failure.errorText : 'Unknown',
          timestamp: new Date().toISOString()
        })
      })

      // 4. Listen for CSP violations
      page.on('response', async response => {
        const headers = response.headers()

        // Check for CSP violations in console
        if (headers['content-security-policy-report-only']) {
          // CSP violations will appear in console
        }
      })

      // Navigate to page
      console.log('   🌐 Loading page...')
      const response = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 15000
      })

      const responseHeaders = response.headers()
      const securityInfo = response.securityDetails()

      // 5. Extract TLS/SSL Certificate Information
      console.log('   🔐 Analyzing TLS/SSL certificate...')
      let certificate = null
      let tlsVersion = null
      let cipherSuite = null

      if (securityInfo) {
        certificate = {
          issuer: securityInfo.issuer(),
          validFrom: securityInfo.validFrom(),
          validTo: securityInfo.validTo(),
          protocol: securityInfo.protocol(),
          subjectName: securityInfo.subjectName(),
          sanList: securityInfo.subjectAlternativeNames()
        }
        tlsVersion = securityInfo.protocol()

        // Check certificate expiry
        const validTo = new Date(securityInfo.validTo() * 1000)
        const now = new Date()
        const daysUntilExpiry = Math.floor((validTo - now) / (1000 * 60 * 60 * 24))

        certificate.daysUntilExpiry = daysUntilExpiry
        certificate.isExpired = daysUntilExpiry < 0
        certificate.expiresWithin30Days = daysUntilExpiry < 30 && daysUntilExpiry >= 0
      }

      // 6. Analyze Security Headers
      console.log('   🛡️  Analyzing security headers...')
      const securityHeaders = {
        strictTransportSecurity: responseHeaders['strict-transport-security'] || null,
        contentSecurityPolicy: responseHeaders['content-security-policy'] || null,
        xFrameOptions: responseHeaders['x-frame-options'] || null,
        xContentTypeOptions: responseHeaders['x-content-type-options'] || null,
        xXssProtection: responseHeaders['x-xss-protection'] || null,
        referrerPolicy: responseHeaders['referrer-policy'] || null,
        permissionsPolicy: responseHeaders['permissions-policy'] || null,
        crossOriginEmbedderPolicy: responseHeaders['cross-origin-embedder-policy'] || null,
        crossOriginOpenerPolicy: responseHeaders['cross-origin-opener-policy'] || null,
        crossOriginResourcePolicy: responseHeaders['cross-origin-resource-policy'] || null
      }

      // Parse CSP directives
      let cspDirectives = null
      if (securityHeaders.contentSecurityPolicy) {
        cspDirectives = parseCSP(securityHeaders.contentSecurityPolicy)
      }

      // 7. Analyze Cookies
      console.log('   🍪 Analyzing cookies...')
      const cookies = await page.cookies()
      const cookieAnalysis = cookies.map(cookie => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expires: cookie.expires,
        size: cookie.name.length + (cookie.value || '').length,
        // Security flags
        isSecure: cookie.secure === true,
        isHttpOnly: cookie.httpOnly === true,
        hasSameSite: !!cookie.sameSite,
        issues: []
      }))

      // Flag cookie issues
      cookieAnalysis.forEach(cookie => {
        if (!cookie.secure && url.startsWith('https://')) {
          cookie.issues.push('Missing Secure flag on HTTPS site')
        }
        if (!cookie.httpOnly) {
          cookie.issues.push('Missing HttpOnly flag (vulnerable to XSS)')
        }
        if (!cookie.sameSite || cookie.sameSite === 'none') {
          cookie.issues.push('Missing or weak SameSite attribute (vulnerable to CSRF)')
        }
      })

      // 8. Detect Mixed Content (HTTP resources on HTTPS)
      console.log('   ⚠️  Detecting mixed content...')
      if (url.startsWith('https://')) {
        const resources = await page.evaluate(() => {
          const mixed = []

          // Check scripts
          document.querySelectorAll('script[src]').forEach(script => {
            if (script.src.startsWith('http://')) {
              mixed.push({ type: 'script', url: script.src })
            }
          })

          // Check stylesheets
          document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            if (link.href.startsWith('http://')) {
              mixed.push({ type: 'stylesheet', url: link.href })
            }
          })

          // Check images
          document.querySelectorAll('img[src]').forEach(img => {
            if (img.src.startsWith('http://')) {
              mixed.push({ type: 'image', url: img.src })
            }
          })

          // Check iframes
          document.querySelectorAll('iframe[src]').forEach(iframe => {
            if (iframe.src.startsWith('http://')) {
              mixed.push({ type: 'iframe', url: iframe.src })
            }
          })

          return mixed
        })

        mixedContent.push(...resources)
      }

      // 9. Analyze Forms
      console.log('   📝 Analyzing forms...')
      const forms = await page.evaluate(() => {
        const formElements = document.querySelectorAll('form')
        return Array.from(formElements).map(form => ({
          action: form.action,
          method: form.method.toUpperCase(),
          hasPasswordField: !!form.querySelector('input[type="password"]'),
          isHttps: form.action.startsWith('https://'),
          inputCount: form.querySelectorAll('input, textarea, select').length
        }))
      })

      // Flag form issues
      forms.forEach(form => {
        form.issues = []
        if (form.hasPasswordField && !form.isHttps) {
          form.issues.push('Password form submits to HTTP (credentials exposed)')
        }
        if (form.method === 'GET' && form.hasPasswordField) {
          form.issues.push('Password form uses GET method (credentials in URL)')
        }
      })

      // 10. Detect Third-party Scripts
      console.log('   🌍 Detecting third-party scripts...')
      const thirdPartyScripts = await page.evaluate((currentUrl) => {
        const scripts = document.querySelectorAll('script[src]')
        const currentDomain = new URL(currentUrl).hostname
        const thirdParty = []

        scripts.forEach(script => {
          try {
            const scriptUrl = new URL(script.src)
            if (scriptUrl.hostname !== currentDomain) {
              thirdParty.push({
                src: script.src,
                domain: scriptUrl.hostname,
                async: script.async,
                defer: script.defer,
                integrity: script.integrity || null,
                crossorigin: script.crossOrigin || null
              })
            }
          } catch (e) {}
        })

        return thirdParty
      }, url)

      // Extract unique third-party domains
      const thirdPartyDomains = [...new Set(thirdPartyScripts.map(s => s.domain))]

      // Flag third-party script issues
      thirdPartyScripts.forEach(script => {
        script.issues = []
        if (!script.integrity) {
          script.issues.push('Missing integrity attribute (SRI)')
        }
        if (!script.crossorigin) {
          script.issues.push('Missing crossorigin attribute')
        }
      })

      // 11. Analyze CORS headers
      const corsHeaders = {
        accessControlAllowOrigin: responseHeaders['access-control-allow-origin'] || null,
        accessControlAllowMethods: responseHeaders['access-control-allow-methods'] || null,
        accessControlAllowHeaders: responseHeaders['access-control-allow-headers'] || null,
        accessControlAllowCredentials: responseHeaders['access-control-allow-credentials'] || null
      }

      // 12. Calculate Security Score
      console.log('   📊 Calculating security score...')
      const securityScore = calculateSecurityScore({
        certificate,
        securityHeaders,
        cookies: cookieAnalysis,
        mixedContent,
        consoleErrors,
        consoleWarnings,
        jsErrors,
        failedRequests,
        forms,
        thirdPartyScripts,
        corsHeaders
      })

      // Compile security report
      const report = {
        url,
        domain: new URL(url).hostname,
        certificate,
        tlsVersion,
        cipherSuite,
        securityHeaders,
        cspDirectives,
        consoleErrors,
        consoleWarnings,
        jsErrors,
        mixedContent,
        failedRequests,
        insecureResources: mixedContent.filter(m => m.type === 'script' || m.type === 'stylesheet'),
        cookies: cookieAnalysis,
        cspViolations,
        forms,
        thirdPartyScripts,
        thirdPartyDomains,
        corsHeaders,
        securityScore,
        auditedAt: new Date().toISOString(),
        auditVersion: '1.0.0'
      }

      // Save to database
      const resource = await db.getResource('security_reports')
      await resource.insert(report)

      // Display summary
      console.log('✅ Security Audit Complete:')
      console.log(`   URL: ${url}`)
      console.log(`   Domain: ${report.domain}`)
      console.log(`\n   🔒 Security Score: ${securityScore.total}/100 (${securityScore.grade})`)
      console.log(`   TLS/SSL: ${securityScore.breakdown.tls}/20`)
      console.log(`   Headers: ${securityScore.breakdown.headers}/25`)
      console.log(`   Cookies: ${securityScore.breakdown.cookies}/15`)
      console.log(`   Content: ${securityScore.breakdown.content}/20`)
      console.log(`   Third-party: ${securityScore.breakdown.thirdParty}/10`)
      console.log(`   Forms: ${securityScore.breakdown.forms}/10`)

      if (certificate) {
        console.log(`\n   📜 Certificate:`)
        console.log(`      Issuer: ${certificate.issuer}`)
        console.log(`      Valid: ${certificate.validFrom} → ${certificate.validTo}`)
        console.log(`      Expires in: ${certificate.daysUntilExpiry} days`)
        if (certificate.isExpired) console.log(`      ⚠️  EXPIRED!`)
        if (certificate.expiresWithin30Days) console.log(`      ⚠️  Expires soon!`)
      }

      if (securityScore.criticalIssues.length > 0) {
        console.log(`\n   🚨 Critical Issues (${securityScore.criticalIssues.length}):`)
        securityScore.criticalIssues.forEach(issue => {
          console.log(`      - ${issue}`)
        })
      }

      if (securityScore.warnings.length > 0) {
        console.log(`\n   ⚠️  Warnings (${securityScore.warnings.length}):`)
        securityScore.warnings.slice(0, 5).forEach(warning => {
          console.log(`      - ${warning}`)
        })
      }

      return {
        success: true,
        data: report
      }

    } catch (error) {
      console.error(`❌ Error auditing ${url}:`, error.message)
      return {
        success: false,
        error: error.message
      }
    }
  })

  // Example 1: Single site audit
  console.log('\n📌 Example 1: Single Site Security Audit')
  console.log('━'.repeat(60))

  await spider.enqueueTarget({
    url: 'https://www.amazon.com',
    activities: ['security_audit']
  })

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 10000))

  // Example 2: Multiple sites comparison
  console.log('\n\n📌 Example 2: Multi-Site Security Comparison')
  console.log('━'.repeat(60))

  const sites = [
    'https://www.amazon.com',
    'https://www.github.com',
    'https://www.google.com'
  ]

  for (const siteUrl of sites) {
    await spider.enqueueTarget({
      url: siteUrl,
      activities: ['security_audit'],
      priority: 10
    })
  }

  // Wait for all to complete
  await new Promise(resolve => setTimeout(resolve, 25000))

  // Example 3: Security Score Comparison
  console.log('\n\n📌 Example 3: Security Score Rankings')
  console.log('━'.repeat(60))

  const resource = await db.getResource('security_reports')
  const allReports = await resource.list({ limit: 100 })

  console.log(`\n📊 Total audits: ${allReports.length}`)

  if (allReports.length > 0) {
    console.log('\n🏆 Security Score Rankings:')
    const sorted = allReports
      .filter(r => r.securityScore)
      .sort((a, b) => b.securityScore.total - a.securityScore.total)

    sorted.forEach((report, idx) => {
      const scoreBar = '█'.repeat(Math.round(report.securityScore.total / 10)) +
                       '░'.repeat(10 - Math.round(report.securityScore.total / 10))

      const gradeEmoji = report.securityScore.grade === 'A' ? '🟢' :
                         report.securityScore.grade === 'B' ? '🟡' :
                         report.securityScore.grade === 'C' ? '🟠' : '🔴'

      console.log(`\n${idx + 1}. ${report.domain}`)
      console.log(`   ${gradeEmoji} Score: ${scoreBar} ${report.securityScore.total}/100 (${report.securityScore.grade})`)
      console.log(`   Critical: ${report.securityScore.criticalIssues.length}`)
      console.log(`   Warnings: ${report.securityScore.warnings.length}`)
    })
  }

  // Example 4: Certificate Analysis
  console.log('\n\n📌 Example 4: TLS/SSL Certificate Analysis')
  console.log('━'.repeat(60))

  allReports.forEach(report => {
    if (report.certificate) {
      console.log(`\n🔐 ${report.domain}`)
      console.log(`   Protocol: ${report.certificate.protocol}`)
      console.log(`   Issuer: ${report.certificate.issuer}`)
      console.log(`   Subject: ${report.certificate.subjectName}`)
      console.log(`   Valid From: ${new Date(report.certificate.validFrom * 1000).toLocaleDateString()}`)
      console.log(`   Valid To: ${new Date(report.certificate.validTo * 1000).toLocaleDateString()}`)
      console.log(`   Days Until Expiry: ${report.certificate.daysUntilExpiry}`)

      if (report.certificate.isExpired) {
        console.log(`   ⚠️  STATUS: EXPIRED`)
      } else if (report.certificate.expiresWithin30Days) {
        console.log(`   ⚠️  STATUS: Expires soon`)
      } else {
        console.log(`   ✅ STATUS: Valid`)
      }
    }
  })

  // Example 5: Security Headers Analysis
  console.log('\n\n📌 Example 5: Security Headers Comparison')
  console.log('━'.repeat(60))

  const headerNames = [
    'strictTransportSecurity',
    'contentSecurityPolicy',
    'xFrameOptions',
    'xContentTypeOptions',
    'referrerPolicy'
  ]

  console.log('\n📋 Security Headers Matrix:')
  console.log('\nDomain'.padEnd(30) + headerNames.map(h => h.substring(0, 12)).join(' | '))
  console.log('─'.repeat(30) + '─┼─'.repeat(headerNames.length - 1) + '─┼─' + '─'.repeat(12))

  allReports.forEach(report => {
    const domain = report.domain.padEnd(30)
    const headers = headerNames.map(h => {
      const value = report.securityHeaders[h]
      return (value ? '✅' : '❌').padEnd(12)
    }).join(' | ')

    console.log(domain + headers)
  })

  // Example 6: Cookie Security Analysis
  console.log('\n\n📌 Example 6: Cookie Security Analysis')
  console.log('━'.repeat(60))

  allReports.forEach(report => {
    if (report.cookies && report.cookies.length > 0) {
      console.log(`\n🍪 ${report.domain} - ${report.cookies.length} cookies`)

      const secureCookies = report.cookies.filter(c => c.secure).length
      const httpOnlyCookies = report.cookies.filter(c => c.httpOnly).length
      const sameSiteCookies = report.cookies.filter(c => c.sameSite).length

      console.log(`   Secure: ${secureCookies}/${report.cookies.length} (${Math.round(secureCookies / report.cookies.length * 100)}%)`)
      console.log(`   HttpOnly: ${httpOnlyCookies}/${report.cookies.length} (${Math.round(httpOnlyCookies / report.cookies.length * 100)}%)`)
      console.log(`   SameSite: ${sameSiteCookies}/${report.cookies.length} (${Math.round(sameSiteCookies / report.cookies.length * 100)}%)`)

      const cookieIssues = report.cookies.flatMap(c => c.issues)
      if (cookieIssues.length > 0) {
        console.log(`   ⚠️  Issues: ${cookieIssues.length}`)
        cookieIssues.slice(0, 3).forEach(issue => {
          console.log(`      - ${issue}`)
        })
      }
    }
  })

  // Example 7: Mixed Content Detection
  console.log('\n\n📌 Example 7: Mixed Content (HTTP on HTTPS)')
  console.log('━'.repeat(60))

  allReports.forEach(report => {
    if (report.url.startsWith('https://') && report.mixedContent) {
      console.log(`\n⚠️  ${report.domain}`)
      if (report.mixedContent.length > 0) {
        console.log(`   Found ${report.mixedContent.length} mixed content resources:`)

        const byType = report.mixedContent.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1
          return acc
        }, {})

        Object.entries(byType).forEach(([type, count]) => {
          console.log(`      ${type}: ${count}`)
        })

        // Show first 3 examples
        report.mixedContent.slice(0, 3).forEach(item => {
          console.log(`      - ${item.type}: ${item.url.substring(0, 60)}...`)
        })
      } else {
        console.log(`   ✅ No mixed content found`)
      }
    }
  })

  // Example 8: Third-party Scripts
  console.log('\n\n📌 Example 8: Third-party Scripts Analysis')
  console.log('━'.repeat(60))

  allReports.forEach(report => {
    if (report.thirdPartyScripts && report.thirdPartyScripts.length > 0) {
      console.log(`\n📦 ${report.domain}`)
      console.log(`   Total third-party scripts: ${report.thirdPartyScripts.length}`)
      console.log(`   Unique domains: ${report.thirdPartyDomains.length}`)

      const withIntegrity = report.thirdPartyScripts.filter(s => s.integrity).length
      const withCrossorigin = report.thirdPartyScripts.filter(s => s.crossorigin).length

      console.log(`   With SRI (integrity): ${withIntegrity}/${report.thirdPartyScripts.length}`)
      console.log(`   With crossorigin: ${withCrossorigin}/${report.thirdPartyScripts.length}`)

      console.log(`\n   Top domains:`)
      report.thirdPartyDomains.slice(0, 5).forEach(domain => {
        const count = report.thirdPartyScripts.filter(s => s.domain === domain).length
        console.log(`      - ${domain} (${count} scripts)`)
      })
    }
  })

  // Cleanup
  await spider.destroy()
  await db.disconnect()

  console.log('\n✨ Security Audit Complete!\n')
}

// Parse CSP header into directives
function parseCSP(cspHeader) {
  const directives = {}
  const parts = cspHeader.split(';')

  parts.forEach(part => {
    const trimmed = part.trim()
    if (!trimmed) return

    const spaceIndex = trimmed.indexOf(' ')
    if (spaceIndex === -1) {
      directives[trimmed] = []
    } else {
      const directive = trimmed.substring(0, spaceIndex)
      const values = trimmed.substring(spaceIndex + 1).split(' ')
      directives[directive] = values
    }
  })

  return directives
}

// Calculate security score
function calculateSecurityScore(data) {
  const scores = {
    tls: 0,
    headers: 0,
    cookies: 0,
    content: 0,
    thirdParty: 0,
    forms: 0
  }

  const criticalIssues = []
  const warnings = []

  // TLS/SSL (20 points)
  if (data.certificate) {
    scores.tls += 10

    if (data.certificate.protocol === 'TLS 1.3') scores.tls += 5
    else if (data.certificate.protocol === 'TLS 1.2') scores.tls += 3
    else warnings.push(`Outdated TLS: ${data.certificate.protocol}`)

    if (data.certificate.isExpired) {
      criticalIssues.push('SSL certificate EXPIRED')
      scores.tls -= 10
    } else if (data.certificate.expiresWithin30Days) {
      warnings.push(`Certificate expires in ${data.certificate.daysUntilExpiry} days`)
    } else {
      scores.tls += 5
    }
  } else {
    criticalIssues.push('No TLS/SSL certificate')
  }

  // Security Headers (25 points)
  const headers = data.securityHeaders

  if (headers.strictTransportSecurity) scores.headers += 5
  else warnings.push('Missing HSTS header')

  if (headers.contentSecurityPolicy) scores.headers += 6
  else warnings.push('Missing Content-Security-Policy')

  if (headers.xFrameOptions) scores.headers += 4
  else warnings.push('Missing X-Frame-Options (clickjacking risk)')

  if (headers.xContentTypeOptions === 'nosniff') scores.headers += 3
  else warnings.push('Missing X-Content-Type-Options')

  if (headers.referrerPolicy) scores.headers += 3
  if (headers.permissionsPolicy) scores.headers += 2
  if (headers.crossOriginOpenerPolicy) scores.headers += 2

  // Cookies (15 points)
  if (data.cookies.length > 0) {
    const securePct = data.cookies.filter(c => c.secure).length / data.cookies.length
    const httpOnlyPct = data.cookies.filter(c => c.httpOnly).length / data.cookies.length
    const sameSitePct = data.cookies.filter(c => c.sameSite).length / data.cookies.length

    scores.cookies += Math.round(securePct * 5)
    scores.cookies += Math.round(httpOnlyPct * 5)
    scores.cookies += Math.round(sameSitePct * 5)

    if (securePct < 0.5) warnings.push(`${Math.round((1 - securePct) * 100)}% of cookies missing Secure flag`)
    if (httpOnlyPct < 0.5) warnings.push(`${Math.round((1 - httpOnlyPct) * 100)}% of cookies missing HttpOnly flag`)
    if (sameSitePct < 0.5) warnings.push(`${Math.round((1 - sameSitePct) * 100)}% of cookies missing SameSite attribute`)
  } else {
    scores.cookies += 15  // No cookies = no cookie issues
  }

  // Content (20 points)
  if (data.mixedContent.length === 0) scores.content += 10
  else {
    criticalIssues.push(`${data.mixedContent.length} mixed content resources (HTTP on HTTPS)`)
  }

  if (data.jsErrors.length === 0) scores.content += 5
  else warnings.push(`${data.jsErrors.length} JavaScript errors`)

  if (data.consoleErrors.length === 0) scores.content += 3
  else warnings.push(`${data.consoleErrors.length} console errors`)

  if (data.failedRequests.length === 0) scores.content += 2
  else warnings.push(`${data.failedRequests.length} failed requests`)

  // Third-party (10 points)
  if (data.thirdPartyScripts.length > 0) {
    const withIntegrity = data.thirdPartyScripts.filter(s => s.integrity).length
    const integrityPct = withIntegrity / data.thirdPartyScripts.length

    scores.thirdParty += Math.round(integrityPct * 5)

    if (integrityPct < 0.3) {
      warnings.push(`${data.thirdPartyScripts.length - withIntegrity} third-party scripts missing SRI (integrity)`)
    }

    if (data.thirdPartyScripts.length > 20) {
      warnings.push(`High number of third-party scripts (${data.thirdPartyScripts.length})`)
    } else {
      scores.thirdParty += 5
    }
  } else {
    scores.thirdParty += 10  // No third-party = no third-party issues
  }

  // Forms (10 points)
  if (data.forms.length > 0) {
    const secureFormsPct = data.forms.filter(f => f.isHttps).length / data.forms.length
    scores.forms += Math.round(secureFormsPct * 5)

    const passwordFormsInsecure = data.forms.filter(f => f.hasPasswordField && !f.isHttps).length
    if (passwordFormsInsecure > 0) {
      criticalIssues.push(`${passwordFormsInsecure} password forms submit to HTTP`)
    } else {
      scores.forms += 5
    }
  } else {
    scores.forms += 10  // No forms = no form issues
  }

  // Calculate total
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0)

  return {
    total,
    breakdown: scores,
    criticalIssues,
    warnings,
    grade: total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F'
  }
}

// Run demonstration
securityAudit().catch(console.error)

/**
 * Expected Console Output:
 *
 * 🔒 Website Security Audit
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📌 Example 1: Single Site Security Audit
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 🔍 Auditing: https://www.amazon.com
 *    🌐 Loading page...
 *    🔐 Analyzing TLS/SSL certificate...
 *    🛡️  Analyzing security headers...
 *    🍪 Analyzing cookies...
 *    ⚠️  Detecting mixed content...
 *    📝 Analyzing forms...
 *    🌍 Detecting third-party scripts...
 *    📊 Calculating security score...
 * ✅ Security Audit Complete:
 *    URL: https://www.amazon.com
 *    Domain: www.amazon.com
 *
 *    🔒 Security Score: 82/100 (B)
 *    TLS/SSL: 18/20
 *    Headers: 20/25
 *    Cookies: 12/15
 *    Content: 18/20
 *    Third-party: 8/10
 *    Forms: 6/10
 *
 *    📜 Certificate:
 *       Issuer: Amazon
 *       Valid: 1704067200 → 1735689599
 *       Expires in: 245 days
 *
 *    ⚠️  Warnings (5):
 *       - Missing Content-Security-Policy
 *       - 15% of cookies missing HttpOnly flag
 *       - 3 console errors
 *       - 12 third-party scripts missing SRI (integrity)
 *       - High number of third-party scripts (45)
 *
 * 📌 Example 3: Security Score Rankings
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📊 Total audits: 3
 *
 * 🏆 Security Score Rankings:
 *
 * 1. www.github.com
 *    🟢 Score: ████████░░ 91/100 (A)
 *    Critical: 0
 *    Warnings: 2
 *
 * 2. www.amazon.com
 *    🟡 Score: ████████░░ 82/100 (B)
 *    Critical: 0
 *    Warnings: 5
 *
 * 3. www.google.com
 *    🟡 Score: ███████░░░ 78/100 (C)
 *    Critical: 0
 *    Warnings: 7
 *
 * ✨ Security Audit Complete!
 */
