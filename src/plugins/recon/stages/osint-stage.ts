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

export class OsintStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: OsintFeatureConfig = {}): Promise<OsintResult> {
    const domain = this._extractBaseDomain(target.host);
    const companyName = this._extractCompanyName(domain);

    const result: OsintResult = {
      status: 'ok',
      domain,
      companyName,
      categories: {
        emails: null,
        usernames: null,
        urls: null,
        social: null
      },
      summary: {
        totalEmails: 0,
        totalProfiles: 0,
        totalUrls: 0
      },
      errors: {}
    };

    if (featureConfig.emails !== false) {
      try {
        result.categories.emails = await this._harvestEmails(domain, featureConfig);
        result.summary.totalEmails = result.categories.emails.addresses?.length || 0;
      } catch (error: any) {
        result.errors.emails = error.message;
      }
    }

    if (featureConfig.usernames !== false) {
      try {
        result.categories.usernames = await this._enumerateUsernames(companyName, featureConfig);
        result.summary.totalProfiles = result.categories.usernames.profiles?.length || 0;
      } catch (error: any) {
        result.errors.usernames = error.message;
      }
    }

    if (featureConfig.urls !== false) {
      try {
        result.categories.urls = await this._harvestUrls(domain, featureConfig);
        result.summary.totalUrls = result.categories.urls.urls?.length || 0;
      } catch (error: any) {
        result.errors.urls = error.message;
      }
    }

    if (featureConfig.social !== false) {
      try {
        result.categories.social = await this._mapSocialMedia(companyName, domain, featureConfig);
      } catch (error: any) {
        result.errors.social = error.message;
      }
    }

    return result;
  }

  private async _harvestEmails(domain: string, config: OsintFeatureConfig): Promise<EmailsResult> {
    const rbResult = await this.commandRunner.runRedBlue(
      'recon',
      'domain',
      'harvest',
      domain,
      {
        timeout: config.timeout || 60000,
        flags: ['--type', 'emails']
      }
    );

    if (rbResult.status === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'RedBlue (rb) is not available',
        addresses: []
      };
    }

    if (rbResult.status === 'error') {
      return {
        status: 'error',
        message: rbResult.error,
        addresses: []
      };
    }

    const data = rbResult.data || {};
    const addresses = this._normalizeEmails(data);

    return {
      status: addresses.length > 0 ? 'ok' : 'empty',
      domain,
      addresses,
      count: addresses.length,
      metadata: rbResult.metadata
    };
  }

  private async _enumerateUsernames(username: string, config: OsintFeatureConfig): Promise<UsernamesResult> {
    const flags: string[] = config.maxSites ? ['--max-sites', String(config.maxSites)] : [];

    const rbResult = await this.commandRunner.runRedBlue(
      'recon',
      'username',
      'search',
      username,
      {
        timeout: config.timeout || 120000,
        flags
      }
    );

    if (rbResult.status === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'RedBlue (rb) is not available',
        profiles: []
      };
    }

    if (rbResult.status === 'error') {
      return {
        status: 'error',
        message: rbResult.error,
        profiles: []
      };
    }

    const data = rbResult.data || {};
    const profiles = this._normalizeProfiles(data, username);

    return {
      status: profiles.length > 0 ? 'ok' : 'empty',
      searchTerm: username,
      profiles,
      count: profiles.length,
      metadata: rbResult.metadata
    };
  }

  private async _harvestUrls(domain: string, config: OsintFeatureConfig): Promise<UrlsResult> {
    const flags: string[] = config.wayback ? ['--wayback'] : [];

    const rbResult = await this.commandRunner.runRedBlue(
      'recon',
      'domain',
      'urls',
      domain,
      {
        timeout: config.timeout || 60000,
        flags
      }
    );

    if (rbResult.status === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'RedBlue (rb) is not available',
        urls: []
      };
    }

    if (rbResult.status === 'error') {
      return {
        status: 'error',
        message: rbResult.error,
        urls: []
      };
    }

    const data = rbResult.data || {};
    const urls = this._normalizeUrls(data);

    return {
      status: urls.length > 0 ? 'ok' : 'empty',
      domain,
      urls,
      count: urls.length,
      metadata: rbResult.metadata
    };
  }

  private async _mapSocialMedia(companyName: string, domain: string, config: OsintFeatureConfig): Promise<SocialResult> {
    const rbResult = await this.commandRunner.runRedBlue(
      'recon',
      'domain',
      'social',
      domain,
      {
        timeout: config.timeout || 30000
      }
    );

    if (rbResult.status === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'RedBlue (rb) is not available',
        platforms: {}
      };
    }

    if (rbResult.status === 'error') {
      return {
        status: 'error',
        message: rbResult.error,
        platforms: {}
      };
    }

    const data = rbResult.data || {};
    const platforms = this._normalizeSocialMedia(data);

    return {
      status: Object.keys(platforms).length > 0 ? 'ok' : 'empty',
      companyName,
      domain,
      platforms,
      metadata: rbResult.metadata
    };
  }

  private _normalizeEmails(data: any): string[] {
    if (!data) return [];

    if (data.raw) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = (data.raw as string).match(emailRegex) || [];
      return [...new Set(matches)].sort();
    }

    if (Array.isArray(data.emails)) {
      return [...new Set(data.emails as string[])].sort();
    }

    if (Array.isArray(data.addresses)) {
      return [...new Set(data.addresses as string[])].sort();
    }

    if (Array.isArray(data)) {
      return [...new Set(data.filter((e: any) => typeof e === 'string') as string[])].sort();
    }

    return [];
  }

  private _normalizeProfiles(data: any, username: string): Profile[] {
    if (!data) return [];

    if (data.raw) {
      return this._parseRawProfiles(data.raw, username);
    }

    const profiles: Profile[] = [];

    if (Array.isArray(data.profiles)) {
      profiles.push(...data.profiles.map((p: any) => this._normalizeProfile(p, username)).filter(Boolean));
    } else if (Array.isArray(data.results)) {
      profiles.push(...data.results.map((p: any) => this._normalizeProfile(p, username)).filter(Boolean));
    } else if (Array.isArray(data)) {
      profiles.push(...data.map((p: any) => this._normalizeProfile(p, username)).filter((p): p is Profile => p !== null));
    }

    return this._deduplicateProfiles(profiles.filter((p): p is Profile => p !== null));
  }

  private _normalizeProfile(profile: any, username: string): Profile | null {
    if (!profile) return null;

    if (typeof profile === 'string') {
      return {
        platform: 'unknown',
        url: profile,
        username
      };
    }

    return {
      platform: profile.platform || profile.site || profile.name || 'unknown',
      url: profile.url || profile.link || profile.href,
      username: profile.username || username,
      category: profile.category || profile.type || null
    };
  }

  private _normalizeUrls(data: any): string[] {
    if (!data) return [];

    if (data.raw) {
      const urlRegex = /https?:\/\/[^\s<>"]+/g;
      const matches = (data.raw as string).match(urlRegex) || [];
      return [...new Set(matches)];
    }

    if (Array.isArray(data.urls)) {
      return [...new Set(data.urls as string[])];
    }

    if (Array.isArray(data)) {
      return [...new Set(data.filter((u: any) => typeof u === 'string') as string[])];
    }

    return [];
  }

  private _normalizeSocialMedia(data: any): Record<string, SocialPlatform> {
    if (!data) return {};

    const platforms: Record<string, SocialPlatform> = {};

    if (data.platforms && typeof data.platforms === 'object') {
      return data.platforms;
    }

    const socialPlatforms = ['twitter', 'linkedin', 'facebook', 'instagram', 'github', 'youtube'];

    for (const platform of socialPlatforms) {
      if (data[platform]) {
        platforms[platform] = {
          url: data[platform].url || data[platform],
          found: true
        };
      }
    }

    return platforms;
  }

  private _parseRawProfiles(raw: string, username: string): Profile[] {
    const profiles: Profile[] = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        const url = urlMatch[1]!;
        const platform = this._extractPlatformFromUrl(url);
        profiles.push({
          platform: platform!,
          url,
          username: username!
        });
      }
    }

    return profiles;
  }

  private _extractPlatformFromUrl(url: string): string {
    const platformPatterns: Record<string, RegExp> = {
      twitter: /twitter\.com|x\.com/i,
      linkedin: /linkedin\.com/i,
      facebook: /facebook\.com/i,
      instagram: /instagram\.com/i,
      github: /github\.com/i,
      youtube: /youtube\.com/i,
      tiktok: /tiktok\.com/i,
      reddit: /reddit\.com/i
    };

    for (const [platform, pattern] of Object.entries(platformPatterns)) {
      if (pattern.test(url)) {
        return platform;
      }
    }

    return 'unknown';
  }

  private _deduplicateProfiles(profiles: Profile[]): Profile[] {
    const seen = new Set<string>();
    return profiles.filter(profile => {
      if (seen.has(profile.url)) {
        return false;
      }
      seen.add(profile.url);
      return true;
    });
  }

  private _extractBaseDomain(host: string): string {
    const parts = host.split('.');
    if (parts.length > 2) {
      const specialTLDs = ['co.uk', 'com.br', 'co.jp', 'co.za', 'com.mx', 'com.ar'];
      const lastTwo = parts.slice(-2).join('.');
      if (specialTLDs.includes(lastTwo)) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    return host;
  }

  private _extractCompanyName(domain: string): string {
    return domain.split('.')[0]!;
  }
}
