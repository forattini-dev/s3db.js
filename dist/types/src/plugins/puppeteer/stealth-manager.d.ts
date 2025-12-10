import type { PuppeteerPlugin } from '../puppeteer.plugin.js';
export interface TimingProfile {
    min: number;
    max: number;
    jitter: number;
}
export interface GeoData {
    timezones: string[];
    languages: string[];
}
export interface ViewportConfig {
    width: number;
    height: number;
    deviceScaleFactor: number;
}
export interface BehavioralConfig {
    typingSpeed: {
        min: number;
        max: number;
    };
    mouseMovements: boolean;
    scrollBehavior: string;
    clickDelay: {
        min: number;
        max: number;
    };
}
export interface StealthProfile {
    userAgent: string;
    viewport: ViewportConfig;
    timezone: string;
    language: string;
    acceptLanguage: string;
    acceptEncoding: string;
    accept: string;
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number;
    timingProfile: TimingProfile;
    proxyId: string | null;
    proxyCountry: string | null;
    behavioral: BehavioralConfig;
}
export interface StealthProfileOptions {
    proxy?: {
        id?: string;
    } | null;
    country?: string | null;
    timingProfile?: keyof typeof StealthManager.prototype.timingProfiles;
    screenResolution?: ViewportConfig | null;
}
export interface ConsistencyWarning {
    type: string;
    message: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface PersonaContext {
    proxyId?: string;
    userAgent?: string;
    viewport?: ViewportConfig;
}
export interface Persona {
    personaId: string;
    proxyId?: string;
    userAgent: string;
    viewport: ViewportConfig;
    metadata: {
        lastUsed?: number;
        lastRequestTime?: number;
        recentRequests?: number;
    };
}
interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface GhostCursor {
    move(position: {
        x: number;
        y: number;
    }): Promise<void>;
}
interface Page {
    emulateTimezone(timezone: string): Promise<void>;
    evaluateOnNewDocument<T>(fn: (profile: T) => void, profile: T): Promise<void>;
    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
    waitForFunction(fn: () => boolean, options: {
        timeout: number;
    }): Promise<void>;
    evaluate<T>(fn: () => T): Promise<T>;
    evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>;
    evaluateHandle(fn: () => unknown): Promise<unknown>;
    $(selector: string): Promise<ElementHandle | null>;
    $$(selector: string): Promise<ElementHandle[]>;
    keyboard: {
        type(char: string): Promise<void>;
    };
    viewport(): Promise<ViewportConfig | null>;
    goto(url: string, options?: {
        waitUntil?: string;
    }): Promise<void>;
    goBack(): Promise<void>;
    goForward(): Promise<void>;
    _cursor?: GhostCursor;
}
interface ElementHandle {
    click(): Promise<void>;
    hover(): Promise<void>;
}
export declare class StealthManager {
    plugin: PuppeteerPlugin;
    config: Record<string, unknown>;
    timingProfiles: Record<string, TimingProfile>;
    geoData: Record<string, GeoData>;
    constructor(plugin: PuppeteerPlugin);
    get logger(): Logger;
    createStealthProfile(options?: StealthProfileOptions): Promise<StealthProfile>;
    private _selectGeoProfile;
    private _generateConsistentUserAgent;
    private _generateConsistentViewport;
    private _getPlatformFromUA;
    private _getHardwareConcurrency;
    private _getDeviceMemory;
    applyStealthProfile(page: Page, profile: StealthProfile): Promise<void>;
    executeJSChallenges(page: Page): Promise<void>;
    private _loadPageResources;
    humanDelay(profile: StealthProfile): Promise<void>;
    humanType(page: Page, selector: string, text: string, profile: StealthProfile): Promise<void>;
    paceRequests(persona: Persona): Promise<void>;
    shouldRest(persona: Persona): boolean;
    simulateHumanBehavior(page: Page, _profile: StealthProfile): Promise<void>;
    validatePersonaConsistency(persona: Persona, currentContext: PersonaContext): ConsistencyWarning[];
    generateBrowsingSession(page: Page, profile: StealthProfile, urls: string[]): Promise<void>;
    private _delay;
}
export default StealthManager;
//# sourceMappingURL=stealth-manager.d.ts.map