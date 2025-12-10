import { Plugin } from './plugin.class.js';
import { PuppeteerPlugin } from './puppeteer.plugin.js';
export interface CookieFarmPluginOptions {
    logLevel?: string;
    generation?: {
        count?: number;
        proxies?: any[];
        userAgentStrategy?: 'random' | 'desktop-only' | 'mobile-only';
        viewportStrategy?: 'varied' | 'fixed' | 'desktop-only';
    };
    warmup?: {
        enabled?: boolean;
        sites?: string[];
        sitesPerPersona?: number;
        randomOrder?: boolean;
        timePerSite?: {
            min: number;
            max: number;
        };
        interactions?: {
            scroll?: boolean;
            hover?: boolean;
            click?: boolean;
        };
    };
    quality?: {
        enabled?: boolean;
        factors?: {
            age?: number;
            successRate?: number;
            requestCount?: number;
            warmupCompleted?: number;
        };
        thresholds?: {
            high?: number;
            medium?: number;
            low?: number;
        };
    };
    rotation?: {
        enabled?: boolean;
        maxAge?: number;
        maxRequests?: number;
        minQualityScore?: number;
        retireOnFailureRate?: number;
    };
    storage?: {
        resource?: string;
        encrypt?: boolean;
    };
    export?: {
        format?: 'json' | 'csv';
        includeCredentials?: boolean;
    };
    stealth?: {
        enabled?: boolean;
        timingProfile?: 'very-slow' | 'slow' | 'normal' | 'fast';
        consistentFingerprint?: boolean;
        executeJSChallenges?: boolean;
        humanBehavior?: boolean;
        requestPacing?: boolean;
        geoConsistency?: boolean;
    };
    resourceNames?: {
        personas?: string;
    };
    [key: string]: any;
}
export interface Persona {
    personaId: string;
    sessionId: string;
    proxyId: string | null;
    userAgent: string;
    viewport: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    cookies: any[];
    fingerprint: {
        proxy: string | null;
        userAgent: string;
        viewport: string;
    };
    reputation: {
        successCount: number;
        failCount: number;
        successRate: number;
        totalRequests: number;
    };
    quality: {
        score: number;
        rating: 'low' | 'medium' | 'high';
        lastCalculated: number;
    };
    metadata: {
        createdAt: number;
        lastUsed: number | null;
        expiresAt: number;
        age: number;
        warmupCompleted: boolean;
        retired: boolean;
    };
    id?: string;
}
export declare class CookieFarmPlugin extends Plugin {
    config: Required<CookieFarmPluginOptions>;
    _storageResourceDescriptor: {
        defaultName: string;
        override?: string;
    };
    puppeteerPlugin: PuppeteerPlugin | null;
    stealthManager: any | null;
    personaPool: Map<string, Persona>;
    initialized: boolean;
    constructor(options?: CookieFarmPluginOptions);
    _resolveStorageResourceName(): string;
    onNamespaceChanged(): void;
    /**
     * Install plugin and validate dependencies
     */
    onInstall(): Promise<void>;
    /**
     * Locate PuppeteerPlugin dependency respecting namespaces
     * @private
     */
    private _findPuppeteerDependency;
    /**
     * Start plugin
     */
    onStart(): Promise<void>;
    /**
     * Stop plugin
     */
    onStop(): Promise<void>;
    /**
     * Uninstall plugin
     */
    onUninstall(options?: any): Promise<void>;
    /**
     * Setup persona storage resource
     * @private
     */
    private _setupPersonaStorage;
    /**
     * Load persona pool from storage
     * @private
     */
    private _loadPersonaPool;
    /**
     * Generate new personas
     * @param count - Number of personas to generate
     * @param options - Generation options
     * @returns
     */
    generatePersonas(count?: number, options?: any): Promise<Persona[]>;
    /**
     * Create a single persona
     * @private
     * @param proxies - Available proxies
     * @returns
     */
    private _createPersona;
    /**
     * Generate user agent based on strategy
     * @private
     */
    private _generateUserAgent;
    /**
     * Generate viewport based on strategy
     * @private
     */
    private _generateViewport;
    /**
     * Warmup a persona by visiting trusted sites
     * @param personaId - Persona identifier
     * @returns
     */
    warmupPersona(personaId: string): Promise<void>;
    /**
     * Visit a site with persona
     * @private
     */
    private _visitSite;
    /**
     * Calculate quality score for persona
     * @private
     */
    private _calculateQuality;
    /**
     * Save persona to storage
     * @private
     */
    private _savePersona;
    /**
     * Get persona by criteria
     * @param criteria - Selection criteria
     * @returns
     */
    getPersona(criteria?: {
        quality?: 'low' | 'medium' | 'high';
        minQualityScore?: number;
        proxyId?: string | null;
        excludeRetired?: boolean;
    }): Promise<Persona | null>;
    /**
     * Record persona usage
     * @param personaId - Persona identifier
     * @param result - Usage result
     */
    recordUsage(personaId: string, result?: {
        success?: boolean;
    }): Promise<void>;
    /**
     * Check if persona should be retired
     * @private
     */
    private _shouldRetire;
    /**
     * Retire a persona
     * @param personaId - Persona identifier
     */
    retirePersona(personaId: string): Promise<void>;
    /**
     * Get statistics
     * @returns
     */
    getStats(): Promise<any>;
    /**
     * Export personas
     * @param options - Export options
     * @returns
     */
    exportPersonas(options?: {
        includeRetired?: boolean;
        format?: 'json' | 'csv';
    }): Promise<Persona[]>;
    /**
     * Delay helper
     * @private
     */
    private _delay;
}
export default CookieFarmPlugin;
//# sourceMappingURL=cookie-farm.plugin.d.ts.map