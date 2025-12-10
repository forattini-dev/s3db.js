/**
 * OsintStage
 *
 * Open Source Intelligence using RedBlue:
 * - Email harvesting
 * - Username enumeration
 * - Domain intelligence
 * - Social media mapping
 *
 * LEGAL DISCLAIMER:
 * - Only collect publicly available information
 * - Do NOT use social engineering, exploits, or unauthorized access
 * - Respect rate limits and terms of service
 * - Use for defensive security and authorized testing only
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface OsintFeatureConfig {
    timeout?: number;
    emails?: boolean;
    usernames?: boolean;
    urls?: boolean;
    social?: boolean;
    maxSites?: number;
    wayback?: boolean;
}
export interface EmailsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    domain?: string;
    addresses: string[];
    count?: number;
    metadata?: Record<string, any>;
}
export interface Profile {
    platform: string;
    url: string;
    username: string;
    category?: string | null;
}
export interface UsernamesResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    searchTerm?: string;
    profiles: Profile[];
    count?: number;
    metadata?: Record<string, any>;
}
export interface UrlsResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    domain?: string;
    urls: string[];
    count?: number;
    metadata?: Record<string, any>;
}
export interface SocialPlatform {
    url: string;
    found: boolean;
}
export interface SocialResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    companyName?: string;
    domain?: string;
    platforms: Record<string, SocialPlatform>;
    metadata?: Record<string, any>;
}
export interface OsintCategories {
    emails: EmailsResult | null;
    usernames: UsernamesResult | null;
    urls: UrlsResult | null;
    social: SocialResult | null;
}
export interface OsintResult {
    status: string;
    domain: string;
    companyName: string;
    categories: OsintCategories;
    summary: {
        totalEmails: number;
        totalProfiles: number;
        totalUrls: number;
    };
    errors: Record<string, string>;
}
export declare class OsintStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: OsintFeatureConfig): Promise<OsintResult>;
    private _harvestEmails;
    private _enumerateUsernames;
    private _harvestUrls;
    private _mapSocialMedia;
    private _normalizeEmails;
    private _normalizeProfiles;
    private _normalizeProfile;
    private _normalizeUrls;
    private _normalizeSocialMedia;
    private _parseRawProfiles;
    private _extractPlatformFromUrl;
    private _deduplicateProfiles;
    private _extractBaseDomain;
    private _extractCompanyName;
}
//# sourceMappingURL=osint-stage.d.ts.map