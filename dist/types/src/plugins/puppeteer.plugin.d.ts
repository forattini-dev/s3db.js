import { Plugin } from './plugin.class.js';
import type { CookieManager, CookieStats } from './puppeteer/cookie-manager.js';
import type { ProxyManager, ProxyConfig, ProxyStatResult, SessionBinding, HealthCheckResult } from './puppeteer/proxy-manager.js';
import type { PerformanceManager } from './puppeteer/performance-manager.js';
import type { NetworkMonitor } from './puppeteer/network-monitor.js';
import type { ConsoleMonitor } from './puppeteer/console-monitor.js';
import type { captureLocalStorage as CaptureLocalStorageFn, captureSessionStorage as CaptureSessionStorageFn, captureIndexedDB as CaptureIndexedDBFn, captureAllStorage as CaptureAllStorageFn, StorageData, IndexedDBResult, AllStorageResult } from './puppeteer/storage-manager.js';
import type { detectAntiBotServices as DetectAntiBotServicesFn, detectFingerprinting as DetectFingerprintingFn, detectBlockingSignals as DetectBlockingSignalsFn, detectAntiBotsAndFingerprinting as DetectAntiBotsAndFingerprintingFn, AntiBotDetectionResult, FingerprintingResult, AntiBotAndFingerprintingResult } from './puppeteer/anti-bot-detector.js';
import type { detectWebRTC as DetectWebRTCFn, detectMediaStreams as DetectMediaStreamsFn, detectStreamingProtocols as DetectStreamingProtocolsFn, detectWebRTCAndStreams as DetectWebRTCAndStreamsFn, WebRTCDetectionResult, MediaStreamsDetectionResult, StreamingProtocolsDetectionResult, WebRTCAndStreamsResult } from './puppeteer/webrtc-streams-detector.js';
export interface PoolConfig {
    enabled: boolean;
    maxBrowsers: number;
    maxTabsPerBrowser: number;
    reuseTab: boolean;
    closeOnIdle: boolean;
    idleTimeout: number;
}
export interface LaunchConfig {
    headless: boolean;
    args: string[];
    ignoreHTTPSErrors: boolean;
}
export interface ViewportConfig {
    width: number;
    height: number;
    deviceScaleFactor: number;
    randomize: boolean;
    presets: string[];
}
export interface UserAgentFilters {
    deviceCategory: string;
}
export interface UserAgentConfig {
    enabled: boolean;
    random: boolean;
    filters: UserAgentFilters;
    custom: string | null;
}
export interface StealthConfig {
    enabled: boolean;
    enableEvasions: boolean;
}
export interface MouseConfig {
    enabled: boolean;
    bezierCurves: boolean;
    overshoot: boolean;
    jitter: boolean;
    pathThroughElements: boolean;
}
export interface TypingConfig {
    enabled: boolean;
    mistakes: boolean;
    corrections: boolean;
    pauseAfterWord: boolean;
    speedVariation: boolean;
    delayRange: [number, number];
}
export interface ScrollingConfig {
    enabled: boolean;
    randomStops: boolean;
    backScroll: boolean;
    horizontalJitter: boolean;
}
export interface HumanBehaviorConfig {
    enabled: boolean;
    mouse: MouseConfig;
    typing: TypingConfig;
    scrolling: ScrollingConfig;
}
export interface CookieStorageConfig {
    resource: string;
    autoSave: boolean;
    autoLoad: boolean;
    encrypt: boolean;
}
export interface CookieWarmupConfig {
    enabled: boolean;
    pages: string[];
    randomOrder: boolean;
    timePerPage: {
        min: number;
        max: number;
    };
    interactions: {
        scroll: boolean;
        click: boolean;
        hover: boolean;
    };
}
export interface CookieRotationConfig {
    enabled: boolean;
    requestsPerCookie: number;
    maxAge: number;
    poolSize: number;
}
export interface CookieReputationConfig {
    enabled: boolean;
    trackSuccess: boolean;
    retireThreshold: number;
    ageBoost: boolean;
}
export interface CookieFarmingConfig {
    enabled: boolean;
    warmup: CookieWarmupConfig;
    rotation: CookieRotationConfig;
    reputation: CookieReputationConfig;
}
export interface CookiesConfig {
    enabled: boolean;
    storage: CookieStorageConfig;
    farming: CookieFarmingConfig;
}
export interface BlockResourcesConfig {
    enabled: boolean;
    types: string[];
}
export interface PerformanceConfig {
    blockResources: BlockResourcesConfig;
    cacheEnabled: boolean;
    javascriptEnabled: boolean;
}
export interface NetworkFiltersConfig {
    types: string[] | null;
    statuses: number[] | null;
    minSize: number | null;
    maxSize: number | null;
    saveErrors: boolean;
    saveLargeAssets: boolean;
}
export interface NetworkCompressionConfig {
    enabled: boolean;
    threshold: number;
}
export interface NetworkMonitorConfig {
    enabled: boolean;
    persist: boolean;
    filters: NetworkFiltersConfig;
    compression: NetworkCompressionConfig;
}
export interface ConsoleFiltersConfig {
    levels: string[] | null;
    excludePatterns: string[];
    includeStackTraces: boolean;
    includeSourceLocation: boolean;
    captureNetwork: boolean;
}
export interface ConsoleMonitorConfig {
    enabled: boolean;
    persist: boolean;
    filters: ConsoleFiltersConfig;
}
export interface ScreenshotConfig {
    fullPage: boolean;
    type: 'png' | 'jpeg' | 'webp';
}
export interface ProxyHealthCheckConfig {
    enabled: boolean;
    interval: number;
    testUrl: string;
    timeout: number;
    successRateThreshold: number;
}
export interface ProxyPluginConfig {
    enabled: boolean;
    list: (string | Partial<ProxyConfig>)[];
    selectionStrategy: 'round-robin' | 'random' | 'least-used' | 'best-performance';
    bypassList: string[];
    healthCheck: ProxyHealthCheckConfig;
    server: string | null;
    username: string | null;
    password: string | null;
}
export interface RetriesConfig {
    enabled: boolean;
    maxAttempts: number;
    backoff: 'exponential' | 'linear' | 'fixed';
    initialDelay: number;
}
export interface DebugConfig {
    enabled: boolean;
    screenshots: boolean;
    console: boolean;
    network: boolean;
}
export interface PuppeteerPluginConfig {
    logLevel: string;
    pool: PoolConfig;
    launch: LaunchConfig;
    viewport: ViewportConfig;
    userAgent: UserAgentConfig;
    stealth: StealthConfig;
    humanBehavior: HumanBehaviorConfig;
    cookies: CookiesConfig;
    performance: PerformanceConfig;
    networkMonitor: NetworkMonitorConfig;
    consoleMonitor: ConsoleMonitorConfig;
    screenshot: ScreenshotConfig;
    proxy: ProxyPluginConfig;
    retries: RetriesConfig;
    debug: DebugConfig;
}
export interface PuppeteerPluginOptions extends Partial<PuppeteerPluginConfig> {
    resourceNames?: {
        cookies?: string;
        consoleSessions?: string;
        consoleMessages?: string;
        consoleErrors?: string;
        networkSessions?: string;
        networkRequests?: string;
        networkErrors?: string;
    };
}
export interface ResourceDescriptor {
    defaultName: string;
    override?: string;
}
export interface ResourceNames {
    cookies: string;
    consoleSessions: string;
    consoleMessages: string;
    consoleErrors: string;
    networkSessions: string;
    networkRequests: string;
    networkErrors: string;
}
export interface NavigateOptions {
    useSession?: string | null;
    screenshot?: boolean;
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    timeout?: number;
}
export interface WithSessionOptions extends NavigateOptions {
    url: string;
}
export interface ViewportResult {
    width: number;
    height: number;
    deviceScaleFactor: number;
}
interface GhostCursor {
    moveTo(selector: string): Promise<void>;
    move(position: {
        x: number;
        y: number;
    }): Promise<void>;
    click(): Promise<void>;
}
interface ElementHandle {
    click(): Promise<void>;
    hover(): Promise<void>;
}
interface PageKeyboard {
    type(text: string, options?: {
        delay?: number;
    }): Promise<void>;
    press(key: string): Promise<void>;
}
interface Page {
    setViewport(viewport: ViewportResult): Promise<void>;
    setUserAgent(userAgent: string): Promise<void>;
    setRequestInterception(enabled: boolean): Promise<void>;
    on(event: string, handler: (arg: unknown) => void): void;
    once(event: string, handler: () => void): void;
    goto(url: string, options?: {
        waitUntil?: string;
        timeout?: number;
    }): Promise<void>;
    screenshot(options?: Record<string, unknown>): Promise<Buffer>;
    close(...args: unknown[]): Promise<void>;
    isClosed(): boolean;
    $(selector: string): Promise<ElementHandle | null>;
    type(selector: string, text: string, options?: {
        delay?: number;
    }): Promise<void>;
    evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
    keyboard: PageKeyboard;
    _cursor?: GhostCursor;
    _userAgent?: string;
    _viewport?: ViewportResult;
    _proxyId?: string | null;
    _sessionId?: string | null;
    _navigationSuccess?: boolean;
    _sessionSaved?: boolean;
    _screenshot?: Buffer;
    humanClick?(selector: string, options?: Record<string, unknown>): Promise<void>;
    humanMoveTo?(selector: string, options?: Record<string, unknown>): Promise<void>;
    humanType?(selector: string, text: string, options?: Record<string, unknown>): Promise<void>;
    humanScroll?(options?: {
        distance?: number | null;
        direction?: 'up' | 'down';
    }): Promise<void>;
}
interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    on(event: string, handler: () => void): void;
    once(event: string, handler: () => void): void;
}
interface PuppeteerInstance {
    launch(options: Record<string, unknown>): Promise<Browser>;
    use(plugin: unknown): void;
}
interface UserAgentClass {
    new (filters?: Record<string, unknown>): {
        toString(): string;
    };
}
type CreateCursorFn = (page: Page) => GhostCursor;
interface StorageManagerInstance {
    captureLocalStorage: typeof CaptureLocalStorageFn;
    captureSessionStorage: typeof CaptureSessionStorageFn;
    captureIndexedDB: typeof CaptureIndexedDBFn;
    captureAllStorage: typeof CaptureAllStorageFn;
}
interface AntiBotDetectorInstance {
    detectAntiBotServices: typeof DetectAntiBotServicesFn;
    detectFingerprinting: typeof DetectFingerprintingFn;
    detectBlockingSignals: typeof DetectBlockingSignalsFn;
    detectAntiBotsAndFingerprinting: typeof DetectAntiBotsAndFingerprintingFn;
}
interface WebRTCStreamsDetectorInstance {
    detectWebRTC: typeof DetectWebRTCFn;
    detectMediaStreams: typeof DetectMediaStreamsFn;
    detectStreamingProtocols: typeof DetectStreamingProtocolsFn;
    detectWebRTCAndStreams: typeof DetectWebRTCAndStreamsFn;
}
export declare class PuppeteerPlugin extends Plugin {
    namespace: string;
    config: PuppeteerPluginConfig;
    _resourceDescriptors: Record<string, ResourceDescriptor>;
    resourceNames: ResourceNames;
    browserPool: Browser[];
    tabPool: Map<Browser, Set<Page>>;
    browserIdleTimers: Map<Browser, ReturnType<typeof setTimeout>>;
    dedicatedBrowsers: Set<Browser>;
    puppeteer: PuppeteerInstance;
    UserAgent: UserAgentClass | null;
    createGhostCursor: CreateCursorFn;
    cookieManager: CookieManager | null;
    proxyManager: ProxyManager | null;
    performanceManager: PerformanceManager | null;
    networkMonitor: NetworkMonitor | null;
    consoleMonitor: ConsoleMonitor | null;
    storageManager: StorageManagerInstance | null;
    antiBotDetector: AntiBotDetectorInstance | null;
    webrtcStreamsDetector: WebRTCStreamsDetectorInstance | null;
    initialized: boolean;
    constructor(options?: PuppeteerPluginOptions);
    _resolveResourceNames(): ResourceNames;
    onNamespaceChanged(): void;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(_options?: import('./plugin.class.js').UninstallOptions): Promise<void>;
    private _importDependencies;
    private _setupCookieStorage;
    private _initializeProxyManager;
    private _initializeCookieManager;
    private _initializePerformanceManager;
    private _initializeNetworkMonitor;
    private _initializeConsoleMonitor;
    private _warmupBrowserPool;
    private _createBrowser;
    private _getBrowser;
    private _closeBrowserPool;
    private _clearIdleTimer;
    private _scheduleIdleCloseIfNeeded;
    private _retireIdleBrowser;
    private _closeDedicatedBrowsers;
    private _generateUserAgent;
    private _generateViewport;
    navigate(url: string, options?: NavigateOptions): Promise<Page>;
    withSession<T>(sessionId: string, handler: (page: Page, plugin: PuppeteerPlugin) => Promise<T>, options: WithSessionOptions): Promise<T>;
    private _attachHumanBehaviorMethods;
    private _typeWithMistakes;
    private _scrollWithStops;
    private _randomDelay;
    farmCookies(sessionId: string): Promise<void>;
    getCookieStats(): Promise<CookieStats>;
    getProxyStats(): ProxyStatResult[];
    getSessionProxyBindings(): SessionBinding[];
    checkProxyHealth(): Promise<HealthCheckResult>;
    captureAllStorage(page: Page): Promise<AllStorageResult>;
    captureLocalStorage(page: Page): Promise<StorageData>;
    captureSessionStorage(page: Page): Promise<StorageData>;
    captureIndexedDB(page: Page): Promise<IndexedDBResult>;
    detectAntiBotServices(page: Page): Promise<AntiBotDetectionResult>;
    detectFingerprinting(page: Page): Promise<FingerprintingResult>;
    detectAntiBotsAndFingerprinting(page: Page): Promise<AntiBotAndFingerprintingResult>;
    detectWebRTC(page: Page): Promise<WebRTCDetectionResult>;
    detectMediaStreams(page: Page): Promise<MediaStreamsDetectionResult>;
    detectStreamingProtocols(page: Page): Promise<StreamingProtocolsDetectionResult>;
    detectWebRTCAndStreams(page: Page): Promise<WebRTCAndStreamsResult>;
}
export default PuppeteerPlugin;
//# sourceMappingURL=puppeteer.plugin.d.ts.map