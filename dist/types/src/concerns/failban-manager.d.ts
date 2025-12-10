import { CronTask } from './cron-manager.js';
import { S3DBLogger, LogLevel } from './logger.js';
export interface GeoOptions {
    enabled?: boolean;
    databasePath?: string | null;
    allowedCountries?: string[];
    blockedCountries?: string[];
    blockUnknown?: boolean;
    cacheResults?: boolean;
}
export interface FailbanManagerOptions {
    namespace?: string | null;
    resourceNames?: {
        bans?: string;
        violations?: string;
    };
    resources?: {
        bans?: string;
        violations?: string;
    };
    enabled?: boolean;
    database?: DatabaseLike;
    maxViolations?: number;
    violationWindow?: number;
    banDuration?: number;
    whitelist?: string[];
    blacklist?: string[];
    persistViolations?: boolean;
    logLevel?: LogLevel;
    geo?: GeoOptions;
    logger?: S3DBLogger;
}
export interface FailbanOptions {
    enabled: boolean;
    database?: DatabaseLike;
    maxViolations: number;
    violationWindow: number;
    banDuration: number;
    whitelist: string[];
    blacklist: string[];
    persistViolations: boolean;
    logLevel: LogLevel;
    geo: Required<GeoOptions>;
    resources: ResourceNames;
}
export interface ResourceNames {
    bans: string;
    violations: string;
}
export interface ResourceDescriptor {
    defaultName: string;
    override?: string;
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
        lastViolation: string;
    };
}
export interface CachedBan {
    expiresAt: number;
    reason: string;
    violations: number;
}
export interface CountryBlockResult {
    blocked: boolean;
    reason: string;
    country: string;
    ip: string;
}
export interface ViolationMetadata {
    path?: string;
    userAgent?: string;
    violationCount?: number;
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
interface ResourceLike {
    get(id: string): Promise<BanRecord | null>;
    insert(data: Record<string, unknown>): Promise<BanRecord>;
    delete(id: string): Promise<void>;
    list(options?: {
        limit?: number;
    }): Promise<BanRecord[]>;
    query(filters: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
}
interface DatabaseLike {
    getResource(name: string): Promise<ResourceLike>;
    createResource(config: Record<string, unknown>): Promise<ResourceLike>;
    resources?: Record<string, ResourceLike>;
    pluginRegistry?: {
        ttl?: {
            options: {
                resources?: Record<string, {
                    enabled: boolean;
                    field: string;
                }>;
            };
        };
        TTLPlugin?: {
            options: {
                resources?: Record<string, {
                    enabled: boolean;
                    field: string;
                }>;
            };
        };
    };
    emit?(event: string, data: Record<string, unknown>): void;
}
interface GeoReader {
    country(ip: string): {
        country?: {
            isoCode?: string;
        };
    };
}
export declare class FailbanManager {
    logger: S3DBLogger;
    namespace: string | null;
    resourceNames: ResourceNames;
    options: FailbanOptions;
    database?: DatabaseLike;
    bansResource: ResourceLike | null;
    violationsResource: ResourceLike | null;
    memoryCache: Map<string, CachedBan>;
    geoCache: Map<string, string | null>;
    geoReader: GeoReader | null;
    cleanupJobName: CronTask | null;
    private _resourceDescriptors;
    constructor(options?: FailbanManagerOptions);
    private _resolveResourceNames;
    setNamespace(namespace: string): void;
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
export {};
//# sourceMappingURL=failban-manager.d.ts.map