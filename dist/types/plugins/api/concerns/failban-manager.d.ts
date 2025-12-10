import { S3DBLogger } from '../../../concerns/logger.js';
import type { Database } from '../../../database.class.js';
export interface GeoOptions {
    enabled?: boolean;
    databasePath?: string | null;
    allowedCountries?: string[];
    blockedCountries?: string[];
    blockUnknown?: boolean;
    cacheResults?: boolean;
}
export interface FailbanOptions {
    enabled?: boolean;
    database?: Database;
    maxViolations?: number;
    violationWindow?: number;
    banDuration?: number;
    whitelist?: string[];
    blacklist?: string[];
    persistViolations?: boolean;
    logLevel?: string;
    logger?: S3DBLogger;
    namespace?: string | null;
    resourceNames?: ResourceOverrides;
    resources?: ResourceOverrides;
    geo?: GeoOptions;
}
export interface ResourceOverrides {
    bans?: string;
    violations?: string;
}
export interface ResourceDescriptor {
    defaultName: string;
    override?: string;
}
export interface ResolvedResourceNames {
    bans: string;
    violations: string;
}
export interface CachedBan {
    expiresAt: number;
    reason: string;
    violations: number;
}
export interface BanRecord {
    id: string;
    ip: string;
    reason: string;
    violations: number;
    bannedAt: string;
    expiresAt: string;
    metadata: {
        userAgent?: string;
        path?: string;
        lastViolation?: string;
    };
}
export interface ViolationMetadata {
    path?: string;
    userAgent?: string;
    violationCount?: number;
    [key: string]: unknown;
}
export interface CountryBlockResult {
    blocked: boolean;
    reason: string;
    country: string;
    ip: string;
}
export interface FailbanStats {
    enabled: boolean;
    activeBans: number;
    cachedBans: number;
    totalViolations: number;
    whitelistedIPs: number;
    blacklistedIPs: number;
    geo: {
        enabled: boolean;
        allowedCountries: number;
        blockedCountries: number;
        blockUnknown: boolean;
    };
    config: {
        maxViolations: number;
        violationWindow: number;
        banDuration: number;
    };
}
interface NormalizedOptions {
    enabled: boolean;
    database?: Database;
    maxViolations: number;
    violationWindow: number;
    banDuration: number;
    whitelist: string[];
    blacklist: string[];
    persistViolations: boolean;
    logLevel: string;
    geo: Required<GeoOptions>;
    resources: ResolvedResourceNames;
}
export declare class FailbanManager {
    private logger;
    private namespace;
    private _resourceDescriptors;
    resourceNames: ResolvedResourceNames;
    options: NormalizedOptions;
    private database?;
    private bansResource;
    private violationsResource;
    private memoryCache;
    private geoCache;
    private geoReader;
    private cleanupTask;
    constructor(options?: FailbanOptions);
    private _resolveResourceNames;
    setNamespace(namespace: string | null): void;
    initialize(): Promise<void>;
    private _createBansResource;
    private _createViolationsResource;
    private _loadBansIntoCache;
    private _setupCleanupTimer;
    private _initializeGeoIP;
    getCountryCode(ip: string): string | null;
    isCountryBlocked(countryCode: string | null): boolean;
    checkCountryBlock(ip: string): CountryBlockResult | null;
    isWhitelisted(ip: string): boolean;
    isBlacklisted(ip: string): boolean;
    isBanned(ip: string): boolean;
    getBan(ip: string): Promise<BanRecord | {
        ip: string;
        reason: string;
        permanent: boolean;
    } | null>;
    recordViolation(ip: string, type?: string, metadata?: ViolationMetadata): Promise<void>;
    private _checkAndBan;
    ban(ip: string, reason: string, metadata?: ViolationMetadata): Promise<void>;
    unban(ip: string): Promise<boolean>;
    listBans(): Promise<BanRecord[]>;
    getStats(): Promise<FailbanStats>;
    cleanup(): Promise<void>;
}
export default FailbanManager;
//# sourceMappingURL=failban-manager.d.ts.map