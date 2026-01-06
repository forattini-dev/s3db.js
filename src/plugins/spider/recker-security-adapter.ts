import type {
  SecurityAnalyzerConfig,
  SecurityAnalysisResult,
  SecurityHeaderAnalysis,
  CSPAnalysis,
  CORSAnalysis,
  ConsoleLogAnalysis,
  TLSAnalysis,
  CaptchaAnalysis,
  WebSocketAnalysis,
  Vulnerability
} from './security-analyzer.js';

type ReckerSecurityReport = {
  grade: string;
  score: number;
  details: Array<{
    header: string;
    value?: string;
    status: 'pass' | 'warn' | 'fail';
    score: number;
    message: string;
    recommendation?: string;
  }>;
  csp?: {
    raw: string;
    directives: Array<{
      name: string;
      values: string[];
      issues: string[];
      severity: 'safe' | 'warn' | 'dangerous';
    }>;
    issues: string[];
    score: number;
    hasUnsafeInline: boolean;
    hasUnsafeEval: boolean;
    hasWildcard: boolean;
    missingDirectives: string[];
  };
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
};

type ReckerAnalyzeSecurityHeaders = (headers: Headers | Record<string, string>) => ReckerSecurityReport;

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

const ACTIVITY_TO_ANALYSIS: Record<string, string[]> = {
  'security_headers': ['securityHeaders'],
  'security_csp': ['csp'],
  'security_cors': ['cors'],
  'security_tls': ['tls'],
  'security_console_logs': ['consoleLogs'],
  'security_websockets': ['websockets'],
  'security_captcha': ['captcha'],
  'security_vulnerabilities': ['vulnerabilities']
};

export class ReckerSecurityAdapter {
  private config: Required<SecurityAnalyzerConfig>;
  private reckerAvailable: boolean | null = null;
  private analyzeSecurityHeaders: ReckerAnalyzeSecurityHeaders | null = null;
  private fallbackAnalyzer: import('./security-analyzer.js').SecurityAnalyzer | null = null;
  private reckerGrade: string | null = null;
  private reckerScore: number | null = null;

  constructor(config: SecurityAnalyzerConfig = {}) {
    this.config = {
      analyzeSecurityHeaders: config.analyzeSecurityHeaders !== false,
      analyzeCSP: config.analyzeCSP !== false,
      analyzeCORS: config.analyzeCORS !== false,
      captureConsoleLogs: config.captureConsoleLogs !== false,
      consoleLogLevels: config.consoleLogLevels || ['error', 'warning'],
      maxConsoleLogLines: config.maxConsoleLogLines || 50,
      analyzeTLS: config.analyzeTLS !== false,
      captureWebSockets: config.captureWebSockets !== false,
      maxWebSocketMessages: config.maxWebSocketMessages || 20,
      checkVulnerabilities: config.checkVulnerabilities !== false
    };
  }

  private async _checkReckerAvailability(): Promise<boolean> {
    if (this.reckerAvailable !== null) {
      return this.reckerAvailable;
    }

    try {
      const recker = await import('recker');
      if (recker.analyzeSecurityHeaders) {
        this.analyzeSecurityHeaders = recker.analyzeSecurityHeaders as unknown as ReckerAnalyzeSecurityHeaders;
        this.reckerAvailable = true;
        return true;
      }
    } catch {
      // Recker not available
    }
    this.reckerAvailable = false;
    return false;
  }

  private async _getFallbackAnalyzer(): Promise<import('./security-analyzer.js').SecurityAnalyzer> {
    if (!this.fallbackAnalyzer) {
      const { SecurityAnalyzer } = await import('./security-analyzer.js');
      this.fallbackAnalyzer = new SecurityAnalyzer(this.config);
    }
    return this.fallbackAnalyzer;
  }

  async analyze(
    page: Page,
    baseUrl: string,
    html?: string,
    responseHeaders?: Record<string, string>
  ): Promise<SecurityAnalysisResult> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (isReckerAvailable && this.analyzeSecurityHeaders && responseHeaders) {
      return this._analyzeWithReckerAndPuppeteer(page, baseUrl, html, responseHeaders);
    }

    const fallback = await this._getFallbackAnalyzer();
    return fallback.analyze(page, baseUrl, html);
  }

  async analyzeSelective(
    page: Page,
    baseUrl: string,
    html?: string,
    activities: string[] = [],
    responseHeaders?: Record<string, string>
  ): Promise<SecurityAnalysisResult> {
    if (!activities || activities.length === 0) {
      return this.analyze(page, baseUrl, html, responseHeaders);
    }

    const isReckerAvailable = await this._checkReckerAvailability();

    if (isReckerAvailable && this.analyzeSecurityHeaders && responseHeaders) {
      return this._analyzeSelectiveWithRecker(page, baseUrl, html, activities, responseHeaders);
    }

    const fallback = await this._getFallbackAnalyzer();
    return fallback.analyzeSelective(page, baseUrl, html, activities);
  }

  private async _analyzeWithReckerAndPuppeteer(
    page: Page,
    baseUrl: string,
    html: string | undefined,
    responseHeaders: Record<string, string>
  ): Promise<SecurityAnalysisResult> {
    const fallback = await this._getFallbackAnalyzer();
    const [reckerReport, puppeteerAnalysis] = await Promise.all([
      this._analyzeHeadersWithRecker(responseHeaders),
      fallback.analyze(page, baseUrl, html)
    ]);

    return this._mergeResults(reckerReport, puppeteerAnalysis);
  }

  private async _analyzeSelectiveWithRecker(
    page: Page,
    baseUrl: string,
    html: string | undefined,
    activities: string[],
    responseHeaders: Record<string, string>
  ): Promise<SecurityAnalysisResult> {
    const needsRecker = activities.some(a =>
      ['security_headers', 'security_csp', 'security_cors', 'security_tls'].includes(a)
    );
    const needsPuppeteer = activities.some(a =>
      ['security_console_logs', 'security_websockets', 'security_captcha', 'security_vulnerabilities'].includes(a)
    );

    type ReckerAnalysisResult = ReturnType<typeof this._analyzeHeadersWithRecker>;

    let reckerResult: ReckerAnalysisResult | null = null;
    let puppeteerResult: SecurityAnalysisResult | null = null;

    if (needsRecker) {
      reckerResult = this._analyzeHeadersWithRecker(responseHeaders);
    }

    if (needsPuppeteer) {
      const fallback = await this._getFallbackAnalyzer();
      puppeteerResult = await fallback.analyzeSelective(page, baseUrl, html, activities);
    }

    if (reckerResult && puppeteerResult) {
      return this._mergeResults(reckerResult, puppeteerResult);
    } else if (reckerResult) {
      return this._mapReckerToSecurityResult(reckerResult);
    } else if (puppeteerResult) {
      return puppeteerResult;
    }

    return {
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
  }

  private _analyzeHeadersWithRecker(headers: Record<string, string>): {
    report: ReckerSecurityReport;
    securityHeaders: SecurityHeaderAnalysis;
    csp: CSPAnalysis;
    cors: CORSAnalysis;
    tls: TLSAnalysis;
    score: number;
  } {
    if (!this.analyzeSecurityHeaders) {
      throw new Error('Recker analyzeSecurityHeaders not available');
    }

    const headersObj = new Headers(headers);
    const report = this.analyzeSecurityHeaders(headersObj);

    this.reckerGrade = report.grade;
    this.reckerScore = report.score;

    const securityHeaders = this._mapReckerHeaders(report);
    const csp = this._mapReckerCSP(report, headers);
    const cors = this._mapCORS(headers);
    const tls = this._mapTLS(headers);

    return {
      report,
      securityHeaders,
      csp,
      cors,
      tls,
      score: report.score
    };
  }

  private _mapReckerToSecurityResult(
    reckerAnalysis: ReturnType<typeof this._analyzeHeadersWithRecker>
  ): SecurityAnalysisResult {
    return {
      securityHeaders: reckerAnalysis.securityHeaders,
      csp: reckerAnalysis.csp,
      cors: reckerAnalysis.cors,
      consoleLogs: null,
      tls: reckerAnalysis.tls,
      captcha: null,
      websockets: null,
      vulnerabilities: [],
      securityScore: reckerAnalysis.score
    };
  }

  private _mergeResults(
    reckerAnalysis: ReturnType<typeof this._analyzeHeadersWithRecker>,
    puppeteerAnalysis: SecurityAnalysisResult
  ): SecurityAnalysisResult {
    return {
      securityHeaders: reckerAnalysis.securityHeaders,
      csp: reckerAnalysis.csp,
      cors: reckerAnalysis.cors,
      consoleLogs: puppeteerAnalysis.consoleLogs,
      tls: reckerAnalysis.tls,
      captcha: puppeteerAnalysis.captcha,
      websockets: puppeteerAnalysis.websockets,
      vulnerabilities: puppeteerAnalysis.vulnerabilities,
      securityScore: reckerAnalysis.score
    };
  }

  private _mapReckerHeaders(report: ReckerSecurityReport): SecurityHeaderAnalysis {
    const present: string[] = [];
    const missing: Array<{
      header: string;
      importance: string;
      recommended: string;
      description: string;
    }> = [];
    const details: Record<string, {
      value: string;
      importance: string;
      description: string;
    }> = {};

    for (const detail of report.details) {
      if (detail.status === 'pass') {
        present.push(detail.header);
        details[detail.header] = {
          value: detail.value || '',
          importance: 'high',
          description: detail.message
        };
      } else if (detail.status === 'fail') {
        missing.push({
          header: detail.header,
          importance: 'high',
          recommended: detail.recommendation || '',
          description: detail.message
        });
      } else if (detail.status === 'warn') {
        present.push(detail.header);
        details[detail.header] = {
          value: detail.value || '',
          importance: 'medium',
          description: detail.message
        };
      }
    }

    return { present, missing, details };
  }

  private _mapReckerCSP(report: ReckerSecurityReport, headers: Record<string, string>): CSPAnalysis {
    const cspValue = headers['content-security-policy'] ||
                     headers['Content-Security-Policy'] ||
                     null;

    if (!report.csp) {
      return {
        present: !!cspValue,
        value: cspValue,
        directives: {},
        issues: cspValue ? [] : ['Content-Security-Policy header is missing'],
        strength: cspValue ? 'moderate' : 'none'
      };
    }

    const directives: Record<string, string> = {};
    for (const d of report.csp.directives) {
      directives[d.name] = d.values.join(' ');
    }

    let strength: 'none' | 'weak' | 'moderate' | 'strong' = 'none';
    if (report.csp.score >= 80) strength = 'strong';
    else if (report.csp.score >= 50) strength = 'moderate';
    else if (report.csp.score > 0) strength = 'weak';

    const issues: string[] = [...report.csp.issues];
    if (report.csp.hasUnsafeInline) {
      issues.push("CSP contains 'unsafe-inline' which weakens protection");
    }
    if (report.csp.hasUnsafeEval) {
      issues.push("CSP contains 'unsafe-eval' which allows script injection");
    }
    if (report.csp.hasWildcard) {
      issues.push("CSP contains '*' wildcard which is too permissive");
    }
    for (const directive of report.csp.missingDirectives) {
      issues.push(`Missing recommended directive: ${directive}`);
    }

    return {
      present: true,
      value: report.csp.raw,
      directives,
      issues,
      strength
    };
  }

  private _mapCORS(headers: Record<string, string>): CORSAnalysis {
    const allowOrigin = headers['access-control-allow-origin'] ||
                       headers['Access-Control-Allow-Origin'] ||
                       null;
    const allowMethods = headers['access-control-allow-methods'] ||
                        headers['Access-Control-Allow-Methods'] ||
                        null;
    const allowHeaders = headers['access-control-allow-headers'] ||
                        headers['Access-Control-Allow-Headers'] ||
                        null;
    const exposeHeaders = headers['access-control-expose-headers'] ||
                         headers['Access-Control-Expose-Headers'] ||
                         null;
    const maxAge = headers['access-control-max-age'] ||
                  headers['Access-Control-Max-Age'] ||
                  null;
    const credentials = headers['access-control-allow-credentials'] === 'true' ||
                       headers['Access-Control-Allow-Credentials'] === 'true';

    const issues: string[] = [];

    if (allowOrigin === '*') {
      issues.push('CORS allows any origin (*) - consider restricting to specific domains');
    }
    if (allowOrigin === '*' && credentials) {
      issues.push('CORS allows any origin with credentials - this is a security risk');
    }
    if (allowMethods?.includes('*')) {
      issues.push('CORS allows all methods (*) - consider restricting to specific methods');
    }

    return {
      corsEnabled: !!allowOrigin,
      allowOrigin,
      allowMethods,
      allowHeaders,
      exposeHeaders,
      maxAge,
      credentials,
      issues
    };
  }

  private _mapTLS(headers: Record<string, string>): TLSAnalysis {
    const hstsValue = headers['strict-transport-security'] ||
                     headers['Strict-Transport-Security'] ||
                     null;

    const issues: string[] = [];

    if (!hstsValue) {
      issues.push('HSTS header is missing - site can be accessed via HTTP');
    } else {
      const maxAge = hstsValue.match(/max-age=(\d+)/)?.[1];
      if (maxAge && parseInt(maxAge) < 31536000) {
        issues.push(`HSTS max-age is less than 1 year (${maxAge}s) - consider increasing`);
      }
      if (!hstsValue.includes('includeSubDomains')) {
        issues.push('HSTS does not include subdomains - add includeSubDomains directive');
      }
    }

    return {
      isHTTPS: true,
      hasHSTS: !!hstsValue,
      hstsValue,
      issues
    };
  }

  getReckerGrade(): string | null {
    return this.reckerGrade;
  }

  getReckerScore(): number | null {
    return this.reckerScore;
  }

  async analyzeHeadersOnly(headers: Record<string, string>): Promise<{
    grade: string;
    score: number;
    report: ReckerSecurityReport;
  } | null> {
    const isReckerAvailable = await this._checkReckerAvailability();

    if (!isReckerAvailable || !this.analyzeSecurityHeaders) {
      return null;
    }

    const headersObj = new Headers(headers);
    const report = this.analyzeSecurityHeaders(headersObj);

    return {
      grade: report.grade,
      score: report.score,
      report
    };
  }
}

export default ReckerSecurityAdapter;
