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
    messages: Array<{
        type: string;
        data: string;
        timestamp: number;
    }>;
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
export declare class SecurityAnalyzer {
    config: Required<SecurityAnalyzerConfig>;
    logger?: Logger;
    constructor(config?: SecurityAnalyzerConfig);
    analyzeSelective(page: Page, baseUrl: string, html?: string | null, activities?: string[]): Promise<SecurityAnalysisResult>;
    analyze(page: Page, baseUrl: string, html?: string | null): Promise<SecurityAnalysisResult>;
    private _analyzeSecurityHeaders;
    private _analyzeCSP;
    private _analyzeCORS;
    private _checkVulnerabilities;
    private _analyzeTLS;
    private _detectCaptcha;
    private _groupByType;
    private _captureWebSockets;
    private _calculateSecurityScore;
}
export default SecurityAnalyzer;
//# sourceMappingURL=security-analyzer.d.ts.map