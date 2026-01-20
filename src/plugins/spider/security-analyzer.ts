export interface SecurityAnalyzerConfig {
  analyzeSecurityHeaders?: boolean;
  analyzeCSP?: boolean;
  analyzeCORS?: boolean;
  captureConsoleLogs?: boolean;
  consoleLogLevels?: string[];
  maxConsoleLogLines?: number;
  analyzeTLS?: boolean;
  captureWebSockets?: boolean;
  maxWebSocketMessages?: number;
  checkVulnerabilities?: boolean;
}

export interface SecurityHeaderInfo {
  name: string;
  importance: string;
  recommended: string;
  description: string;
}

export interface SecurityHeaderAnalysis {
  present: string[];
  missing: Array<{
    header: string;
    importance: string;
    recommended: string;
    description: string;
  }>;
  details: Record<string, {
    value: string;
    importance: string;
    description: string;
  }>;
}

export interface CSPAnalysis {
  present: boolean;
  value: string | null;
  directives: Record<string, string>;
  issues: string[];
  strength: 'none' | 'weak' | 'moderate' | 'strong';
}

export interface CORSAnalysis {
  corsEnabled: boolean;
  allowOrigin: string | null;
  allowMethods: string | null;
  allowHeaders: string | null;
  exposeHeaders: string | null;
  maxAge: string | null;
  credentials: boolean;
  issues: string[];
}

export interface ConsoleLog {
  type: string;
  text: string;
  location: unknown;
  args: number;
}

export interface ConsoleLogAnalysis {
  total: number;
  byType: Record<string, ConsoleLog[]>;
  logs: ConsoleLog[];
}

export interface TLSAnalysis {
  isHTTPS: boolean;
  hasHSTS: boolean;
  hstsValue: string | null;
  issues: string[];
}

export interface CaptchaDetail {
  provider: string;
  type: string;
  version: number | null;
  method: string;
  description: string;
}

export interface CaptchaAnalysis {
  present: boolean;
  providers: string[];
  details: CaptchaDetail[];
}

export interface WebSocketInfo {
  url: string;
  protocols: string[];
  messageCount: number;
  readyState: number;
  messages: Array<{ type: string; data: string; timestamp: number }>;
  timestamp: number;
}

export interface WebSocketAnalysis {
  present: boolean;
  count: number;
  connections: WebSocketInfo[];
}

export interface Vulnerability {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  recommendation: string;
}

export interface SecurityAnalysisResult {
  securityHeaders: SecurityHeaderAnalysis | null;
  csp: CSPAnalysis | null;
  cors: CORSAnalysis | null;
  consoleLogs: ConsoleLogAnalysis | null;
  tls: TLSAnalysis | null;
  captcha: CaptchaAnalysis | null;
  websockets: WebSocketAnalysis | null;
  vulnerabilities: Vulnerability[];
  securityScore: number;
}

interface Page {
  on(event: 'response', handler: (response: PageResponse) => void): void;
  on(event: 'console', handler: (msg: ConsoleMessage) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
  content(): Promise<string>;
  evaluateOnNewDocument(fn: string): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
}

interface PageResponse {
  url(): string;
  headers(): Record<string, string>;
}

interface ConsoleMessage {
  type(): string;
  text(): string;
  location(): unknown;
  args(): unknown[];
}

interface Logger {
  error(message: string, ...args: unknown[]): void;
}

export class SecurityAnalyzer {
  config: Required<SecurityAnalyzerConfig>;
  logger?: Logger;

  constructor(config: SecurityAnalyzerConfig = {}) {
    this.config = {
      analyzeSecurityHeaders: config.analyzeSecurityHeaders !== false,
      analyzeCSP: config.analyzeCSP !== false,
      analyzeCORS: config.analyzeCORS !== false,
      captureConsoleLogs: config.captureConsoleLogs !== false,
      consoleLogLevels: config.consoleLogLevels || ['error', 'warn', 'log'],
      maxConsoleLogLines: config.maxConsoleLogLines || 100,
      analyzeTLS: config.analyzeTLS !== false,
      captureWebSockets: config.captureWebSockets !== false,
      maxWebSocketMessages: config.maxWebSocketMessages || 50,
      checkVulnerabilities: config.checkVulnerabilities !== false
    };
  }

  async analyzeSelective(page: Page, baseUrl: string, html: string | null = null, activities: string[] = []): Promise<SecurityAnalysisResult> {
    if (!activities || activities.length === 0) {
      return this.analyze(page, baseUrl, html);
    }

    const result: SecurityAnalysisResult = {
      securityHeaders: null,
      csp: null,
      cors: null,
      consoleLogs: null,
      tls: null,
      captcha: null,
      websockets: null,
      vulnerabilities: [],
      securityScore: 0
    };

    let responseHeaders: Record<string, string> = {};
    let captureHeaders: ((response: PageResponse) => void) | null = null;
    let consoleListener: ((msg: ConsoleMessage) => void) | null = null;
    const consoleLogs: ConsoleLog[] = [];

    try {
      captureHeaders = (response: PageResponse): void => {
        if (response.url() === baseUrl || response.url().startsWith(baseUrl)) {
          const headers = response.headers();
          responseHeaders = { ...headers };
        }
      };

      page.on('response', captureHeaders);

      if (activities.includes('security_console_logs')) {
        consoleListener = (msg: ConsoleMessage) => {
          consoleLogs.push({
            type: msg.type(),
            text: msg.text(),
            location: msg.location(),
            args: msg.args().length
          });
        };
        page.on('console', consoleListener);
      }

      if (activities.includes('security_headers')) {
        result.securityHeaders = this._analyzeSecurityHeaders(responseHeaders);
      }

      if (activities.includes('security_csp')) {
        result.csp = this._analyzeCSP(responseHeaders);
      }

      if (activities.includes('security_cors')) {
        result.cors = this._analyzeCORS(responseHeaders, baseUrl);
      }

      if (activities.includes('security_console_logs') && consoleLogs.length > 0) {
        result.consoleLogs = {
          total: consoleLogs.length,
          byType: this._groupByType(consoleLogs),
          logs: consoleLogs.slice(0, this.config.maxConsoleLogLines)
        };
      }

      if (activities.includes('security_tls')) {
        result.tls = this._analyzeTLS(baseUrl, responseHeaders);
      }

      if (activities.includes('security_websockets')) {
        result.websockets = await this._captureWebSockets(page);
      }

      if (activities.includes('security_captcha')) {
        const pageContent = html || (await page.content());
        result.captcha = this._detectCaptcha(pageContent);
      }

      if (activities.includes('security_vulnerabilities')) {
        result.vulnerabilities = this._checkVulnerabilities(responseHeaders, result);
      }

      result.securityScore = this._calculateSecurityScore(result);

      return result;
    } catch {
      return result;
    } finally {
      if (captureHeaders) {
        page.removeListener('response', captureHeaders as (...args: unknown[]) => void);
      }
      if (consoleListener) {
        page.removeListener('console', consoleListener as (...args: unknown[]) => void);
      }
    }
  }

  async analyze(page: Page, baseUrl: string, html: string | null = null): Promise<SecurityAnalysisResult> {
    const result: SecurityAnalysisResult = {
      securityHeaders: null,
      csp: null,
      cors: null,
      consoleLogs: null,
      tls: null,
      captcha: null,
      websockets: null,
      vulnerabilities: [],
      securityScore: 0
    };

    let responseHeaders: Record<string, string> = {};
    let captureHeaders: ((response: PageResponse) => void) | null = null;
    let consoleListener: ((msg: ConsoleMessage) => void) | null = null;
    const consoleLogs: ConsoleLog[] = [];

    try {
      captureHeaders = (response: PageResponse): void => {
        if (response.url() === baseUrl || response.url().startsWith(baseUrl)) {
          const headers = response.headers();
          responseHeaders = { ...headers };
        }
      };

      page.on('response', captureHeaders);

      if (this.config.captureConsoleLogs) {
        consoleListener = (msg: ConsoleMessage) => {
          consoleLogs.push({
            type: msg.type(),
            text: msg.text(),
            location: msg.location(),
            args: msg.args().length
          });
        };
        page.on('console', consoleListener);
      }

      if (this.config.analyzeSecurityHeaders) {
        result.securityHeaders = this._analyzeSecurityHeaders(responseHeaders);
      }

      if (this.config.analyzeCSP) {
        result.csp = this._analyzeCSP(responseHeaders);
      }

      if (this.config.analyzeCORS) {
        result.cors = this._analyzeCORS(responseHeaders, baseUrl);
      }

      if (this.config.captureConsoleLogs && consoleLogs.length > 0) {
        result.consoleLogs = {
          total: consoleLogs.length,
          byType: this._groupByType(consoleLogs),
          logs: consoleLogs.slice(0, this.config.maxConsoleLogLines)
        };
      }

      if (this.config.analyzeTLS) {
        result.tls = this._analyzeTLS(baseUrl, responseHeaders);
      }

      if (this.config.captureWebSockets) {
        result.websockets = await this._captureWebSockets(page);
      }

      const pageContent = html || (await page.content());
      result.captcha = this._detectCaptcha(pageContent);

      if (this.config.checkVulnerabilities) {
        result.vulnerabilities = this._checkVulnerabilities(responseHeaders, result);
      }

      result.securityScore = this._calculateSecurityScore(result);

      return result;
    } catch (error) {
      this.logger?.error('[SecurityAnalyzer] Error during analysis:', error);
      return result;
    } finally {
      if (captureHeaders) {
        page.removeListener('response', captureHeaders as (...args: unknown[]) => void);
      }
      if (consoleListener) {
        page.removeListener('console', consoleListener as (...args: unknown[]) => void);
      }
    }
  }

  private _analyzeSecurityHeaders(headers: Record<string, string>): SecurityHeaderAnalysis {
    const analysis: SecurityHeaderAnalysis = {
      present: [],
      missing: [],
      details: {}
    };

    const securityHeaders: Record<string, SecurityHeaderInfo> = {
      'x-frame-options': {
        name: 'X-Frame-Options',
        importance: 'critical',
        recommended: 'DENY or SAMEORIGIN',
        description: 'Prevents clickjacking attacks'
      },
      'x-content-type-options': {
        name: 'X-Content-Type-Options',
        importance: 'critical',
        recommended: 'nosniff',
        description: 'Prevents MIME sniffing attacks'
      },
      'strict-transport-security': {
        name: 'Strict-Transport-Security',
        importance: 'critical',
        recommended: 'max-age=31536000; includeSubDomains',
        description: 'Forces HTTPS connections'
      },
      'x-xss-protection': {
        name: 'X-XSS-Protection',
        importance: 'high',
        recommended: '1; mode=block',
        description: 'Protects against XSS attacks'
      },
      'referrer-policy': {
        name: 'Referrer-Policy',
        importance: 'medium',
        recommended: 'strict-no-referrer or no-referrer',
        description: 'Controls referrer information'
      },
      'permissions-policy': {
        name: 'Permissions-Policy',
        importance: 'medium',
        recommended: 'geolocation=(), microphone=(), camera=()',
        description: 'Controls browser feature access'
      }
    };

    for (const [headerKey, headerInfo] of Object.entries(securityHeaders)) {
      const value = headers[headerKey];

      if (value) {
        analysis.present.push(headerInfo.name);
        analysis.details[headerInfo.name.toLowerCase()] = {
          value,
          importance: headerInfo.importance,
          description: headerInfo.description
        };
      } else {
        analysis.missing.push({
          header: headerInfo.name,
          importance: headerInfo.importance,
          recommended: headerInfo.recommended,
          description: headerInfo.description
        });
      }
    }

    return analysis;
  }

  private _analyzeCSP(headers: Record<string, string>): CSPAnalysis {
    const analysis: CSPAnalysis = {
      present: false,
      value: null,
      directives: {},
      issues: [],
      strength: 'none'
    };

    const cspHeader = headers['content-security-policy'];
    if (!cspHeader) {
      analysis.issues.push('No Content Security Policy defined');
      return analysis;
    }

    analysis.present = true;
    analysis.value = cspHeader;

    const directives = cspHeader.split(';').map((d) => d.trim()).filter(Boolean);

    for (const directive of directives) {
      const [key, ...values] = directive.split(/\s+/);
      analysis.directives[key!] = values.join(' ');
    }

    const unsafePatterns = ['unsafe-inline', 'unsafe-eval'];
    for (const [key, value] of Object.entries(analysis.directives)) {
      for (const unsafe of unsafePatterns) {
        if (value.includes(unsafe)) {
          analysis.issues.push(`${key} contains ${unsafe} - reduces security`);
        }
      }
    }

    if (cspHeader.includes('*')) {
      analysis.issues.push('CSP contains wildcard (*) - may allow untrusted sources');
    }

    if (analysis.issues.length === 0) {
      analysis.strength = 'strong';
    } else if (analysis.issues.length <= 2) {
      analysis.strength = 'moderate';
    } else {
      analysis.strength = 'weak';
    }

    return analysis;
  }

  private _analyzeCORS(headers: Record<string, string>, _baseUrl: string): CORSAnalysis {
    const analysis: CORSAnalysis = {
      corsEnabled: false,
      allowOrigin: null,
      allowMethods: null,
      allowHeaders: null,
      exposeHeaders: null,
      maxAge: null,
      credentials: false,
      issues: []
    };

    const allowOrigin = headers['access-control-allow-origin'];
    if (!allowOrigin) {
      analysis.issues.push('No CORS policy configured');
      return analysis;
    }

    analysis.corsEnabled = true;
    analysis.allowOrigin = allowOrigin;
    analysis.allowMethods = headers['access-control-allow-methods'] || null;
    analysis.allowHeaders = headers['access-control-allow-headers'] || null;
    analysis.exposeHeaders = headers['access-control-expose-headers'] || null;
    analysis.credentials = headers['access-control-allow-credentials'] === 'true';
    analysis.maxAge = headers['access-control-max-age'] || null;

    if (allowOrigin === '*') {
      analysis.issues.push('Allow-Origin is * - allows any origin (security risk)');
    }

    if (allowOrigin === '*' && analysis.credentials) {
      analysis.issues.push('Allow-Origin is * with credentials - invalid and insecure');
    }

    if (!analysis.allowMethods) {
      analysis.issues.push('No Access-Control-Allow-Methods specified');
    }

    if (analysis.allowMethods && analysis.allowMethods.includes('*')) {
      analysis.issues.push('Allow-Methods contains * - allows all HTTP methods');
    }

    return analysis;
  }

  private _checkVulnerabilities(headers: Record<string, string>, analysis: SecurityAnalysisResult): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    if (!headers['x-frame-options']) {
      vulnerabilities.push({
        type: 'clickjacking',
        severity: 'high',
        message: 'Missing X-Frame-Options header - vulnerable to clickjacking attacks',
        recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN'
      });
    }

    if (!headers['x-content-type-options']) {
      vulnerabilities.push({
        type: 'mime-sniffing',
        severity: 'high',
        message: 'Missing X-Content-Type-Options header - vulnerable to MIME sniffing',
        recommendation: 'Add X-Content-Type-Options: nosniff'
      });
    }

    if (!headers['strict-transport-security']) {
      vulnerabilities.push({
        type: 'ssl-downgrade',
        severity: 'high',
        message: 'Missing HSTS header - vulnerable to SSL/TLS downgrade attacks',
        recommendation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains'
      });
    }

    if (analysis.csp && analysis.csp.issues.length > 0) {
      vulnerabilities.push({
        type: 'csp-weak',
        severity: 'medium',
        message: `Weak Content Security Policy: ${analysis.csp.issues[0]}`,
        recommendation: 'Strengthen CSP with specific directives and remove unsafe-*'
      });
    }

    if (analysis.cors && analysis.cors.issues.length > 0) {
      vulnerabilities.push({
        type: 'cors-misconfiguration',
        severity: 'medium',
        message: `CORS misconfiguration: ${analysis.cors.issues[0]}`,
        recommendation: 'Restrict CORS to specific trusted origins'
      });
    }

    if (analysis.consoleLogs) {
      const errors = analysis.consoleLogs.byType['error'] || [];
      if (errors.length > 5) {
        vulnerabilities.push({
          type: 'console-errors',
          severity: 'low',
          message: `${errors.length} console errors detected - possible runtime issues`,
          recommendation: 'Review and fix console errors for better stability'
        });
      }
    }

    return vulnerabilities;
  }

  private _analyzeTLS(baseUrl: string, headers: Record<string, string>): TLSAnalysis {
    const url = new URL(baseUrl);
    const isHTTPS = url.protocol === 'https:';

    return {
      isHTTPS,
      hasHSTS: !!headers['strict-transport-security'],
      hstsValue: headers['strict-transport-security'] || null,
      issues: !isHTTPS ? ['Site is not using HTTPS'] : []
    };
  }

  private _detectCaptcha(html: string): CaptchaAnalysis {
    const analysis: CaptchaAnalysis = {
      present: false,
      providers: [],
      details: []
    };

    if (!html) {
      return analysis;
    }

    const htmlLower = html.toLowerCase();

    if (htmlLower.includes('recaptcha') || htmlLower.includes('google.com/recaptcha')) {
      if (htmlLower.includes('recaptcha.net') || htmlLower.includes('recaptcha.net/')) {
        analysis.providers.push('reCAPTCHA v3');
        analysis.details.push({
          provider: 'Google',
          type: 'reCAPTCHA v3',
          version: 3,
          method: 'invisible',
          description: 'Google reCAPTCHA v3 - invisible verification'
        });
      } else if (htmlLower.includes('grecaptcha')) {
        analysis.providers.push('reCAPTCHA v2');
        analysis.details.push({
          provider: 'Google',
          type: 'reCAPTCHA v2',
          version: 2,
          method: 'checkbox',
          description: "Google reCAPTCHA v2 - \"I'm not a robot\" checkbox"
        });
      }
      analysis.present = true;
    }

    if (htmlLower.includes('hcaptcha') || htmlLower.includes('hcaptcha.com')) {
      analysis.providers.push('hCaptcha');
      analysis.details.push({
        provider: 'hCaptcha',
        type: 'hCaptcha',
        version: 1,
        method: 'interactive',
        description: 'hCaptcha - Privacy-focused CAPTCHA alternative'
      });
      analysis.present = true;
    }

    if (htmlLower.includes('turnstile') || htmlLower.includes('challenges.cloudflare.com')) {
      analysis.providers.push('Cloudflare Turnstile');
      analysis.details.push({
        provider: 'Cloudflare',
        type: 'Turnstile',
        version: 1,
        method: 'interactive/invisible',
        description: 'Cloudflare Turnstile - CAPTCHA alternative'
      });
      analysis.present = true;
    }

    if (htmlLower.includes('awswaf') || htmlLower.includes('akamai')) {
      analysis.providers.push('AWS WAF');
      analysis.details.push({
        provider: 'AWS',
        type: 'WAF CAPTCHA',
        version: 1,
        method: 'challenge',
        description: 'AWS WAF - Web Application Firewall CAPTCHA'
      });
      analysis.present = true;
    }

    if (htmlLower.includes('akam') || htmlLower.includes('akamai')) {
      if (!analysis.providers.includes('AWS WAF')) {
        analysis.providers.push('Akamai');
        analysis.details.push({
          provider: 'Akamai',
          type: 'Bot Manager',
          version: 1,
          method: 'behavioral',
          description: 'Akamai Bot Manager - Behavioral analysis'
        });
        analysis.present = true;
      }
    }

    const customPatterns = [
      { pattern: /data-sitekey|g-recaptcha-response|grecaptcha/i, name: 'Generic reCAPTCHA marker' },
      { pattern: /captcha|verification|challenge/i, name: 'Generic CAPTCHA indicator' },
      { pattern: /<iframe[^>]*captcha|<div[^>]*id="captcha"/i, name: 'Embedded CAPTCHA iframe' }
    ];

    for (const { pattern, name } of customPatterns) {
      if (pattern.test(html) && !analysis.present) {
        analysis.present = true;
        if (!analysis.details.some((d) => d.description.toLowerCase().includes('captcha'))) {
          analysis.details.push({
            provider: 'Unknown',
            type: 'Generic CAPTCHA',
            version: null,
            method: 'unknown',
            description: name
          });
        }
      }
    }

    return analysis;
  }

  private _groupByType(logs: ConsoleLog[]): Record<string, ConsoleLog[]> {
    const grouped: Record<string, ConsoleLog[]> = {};

    for (const log of logs) {
      if (!grouped[log.type]) {
        grouped[log.type] = [];
      }
      grouped[log.type]!.push(log);
    }

    return grouped;
  }

  private async _captureWebSockets(page: Page): Promise<WebSocketAnalysis | null> {
    const websockets: WebSocketInfo[] = [];

    try {
      const wsDetectionCode = `
        (function() {
          const wsConnections = [];
          const originalWebSocket = window.WebSocket;

          window.WebSocket = class extends originalWebSocket {
            constructor(url, protocols) {
              super(url, protocols);
              const wsInfo = {
                url: url,
                protocols: Array.isArray(protocols) ? protocols : protocols ? [protocols] : [],
                messages: [],
                readyState: this.readyState,
                timestamp: Date.now()
              };
              wsConnections.push(wsInfo);

              const originalSend = this.send.bind(this);
              this.send = function(data) {
                wsInfo.messages.push({
                  type: 'sent',
                  data: typeof data === 'string' ? data : '[binary data]',
                  timestamp: Date.now()
                });
                return originalSend(data);
              };

              this.addEventListener('message', (event) => {
                wsInfo.messages.push({
                  type: 'received',
                  data: typeof event.data === 'string' ? event.data : '[binary data]',
                  timestamp: Date.now()
                });
              });

              this.addEventListener('open', () => {
                wsInfo.readyState = 1;
              });
              this.addEventListener('close', () => {
                wsInfo.readyState = 3;
              });
            }
          };

          window.__wsConnections = wsConnections;
        })();
      `;

      await page.evaluateOnNewDocument(wsDetectionCode);
      await page.waitForTimeout(100);

      const wsData = await page.evaluate(() => {
        return (window as unknown as { __wsConnections?: WebSocketInfo[] }).__wsConnections || [];
      }).catch(() => [] as WebSocketInfo[]);

      for (const wsInfo of wsData) {
        const limitedMessages = wsInfo.messages.slice(0, this.config.maxWebSocketMessages);
        websockets.push({
          url: wsInfo.url,
          protocols: wsInfo.protocols,
          messageCount: wsInfo.messages.length,
          readyState: wsInfo.readyState,
          messages: limitedMessages,
          timestamp: wsInfo.timestamp
        });
      }

      return websockets.length > 0 ? {
        present: true,
        count: websockets.length,
        connections: websockets
      } : null;
    } catch (error) {
      this.logger?.error('[SecurityAnalyzer] Error capturing WebSockets:', error);
      return null;
    }
  }

  private _calculateSecurityScore(analysis: SecurityAnalysisResult): number {
    let score = 50;

    if (analysis.securityHeaders) {
      const present = analysis.securityHeaders.present.length;
      const total = present + analysis.securityHeaders.missing.length;
      score += (present / total) * 30;
    }

    if (analysis.csp) {
      if (analysis.csp.strength === 'strong') {
        score += 20;
      } else if (analysis.csp.strength === 'moderate') {
        score += 10;
      }
    }

    if (analysis.cors) {
      if (analysis.cors.corsEnabled && analysis.cors.issues.length === 0) {
        score += 20;
      } else if (analysis.cors.corsEnabled && analysis.cors.issues.length <= 1) {
        score += 10;
      }
    }

    if (analysis.tls) {
      if (analysis.tls.isHTTPS && analysis.tls.hasHSTS) {
        score += 15;
      } else if (analysis.tls.isHTTPS) {
        score += 10;
      }
    }

    if (analysis.vulnerabilities && analysis.vulnerabilities.length > 0) {
      const highSeverity = analysis.vulnerabilities.filter((v) => v.severity === 'high').length;
      const mediumSeverity = analysis.vulnerabilities.filter((v) => v.severity === 'medium').length;

      score -= highSeverity * 10;
      score -= mediumSeverity * 3;
    }

    if (analysis.consoleLogs && analysis.consoleLogs.byType['error']) {
      const errorCount = analysis.consoleLogs.byType['error'].length;
      score -= Math.min(errorCount * 0.5, 5);
    }

    return Math.max(0, Math.min(100, score));
  }
}

export default SecurityAnalyzer;
