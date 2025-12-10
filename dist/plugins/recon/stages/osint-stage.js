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
export class OsintStage {
    plugin;
    commandRunner;
    config;
    constructor(plugin) {
        this.plugin = plugin;
        this.commandRunner = plugin.commandRunner;
        this.config = plugin.config;
    }
    async execute(target, featureConfig = {}) {
        const domain = this._extractBaseDomain(target.host);
        const companyName = this._extractCompanyName(domain);
        const result = {
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
            }
            catch (error) {
                result.errors.emails = error.message;
            }
        }
        if (featureConfig.usernames !== false) {
            try {
                result.categories.usernames = await this._enumerateUsernames(companyName, featureConfig);
                result.summary.totalProfiles = result.categories.usernames.profiles?.length || 0;
            }
            catch (error) {
                result.errors.usernames = error.message;
            }
        }
        if (featureConfig.urls !== false) {
            try {
                result.categories.urls = await this._harvestUrls(domain, featureConfig);
                result.summary.totalUrls = result.categories.urls.urls?.length || 0;
            }
            catch (error) {
                result.errors.urls = error.message;
            }
        }
        if (featureConfig.social !== false) {
            try {
                result.categories.social = await this._mapSocialMedia(companyName, domain, featureConfig);
            }
            catch (error) {
                result.errors.social = error.message;
            }
        }
        return result;
    }
    async _harvestEmails(domain, config) {
        const rbResult = await this.commandRunner.runRedBlue('recon', 'domain', 'harvest', domain, {
            timeout: config.timeout || 60000,
            flags: ['--type', 'emails']
        });
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
    async _enumerateUsernames(username, config) {
        const flags = config.maxSites ? ['--max-sites', String(config.maxSites)] : [];
        const rbResult = await this.commandRunner.runRedBlue('recon', 'username', 'search', username, {
            timeout: config.timeout || 120000,
            flags
        });
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
    async _harvestUrls(domain, config) {
        const flags = config.wayback ? ['--wayback'] : [];
        const rbResult = await this.commandRunner.runRedBlue('recon', 'domain', 'urls', domain, {
            timeout: config.timeout || 60000,
            flags
        });
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
    async _mapSocialMedia(companyName, domain, config) {
        const rbResult = await this.commandRunner.runRedBlue('recon', 'domain', 'social', domain, {
            timeout: config.timeout || 30000
        });
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
    _normalizeEmails(data) {
        if (!data)
            return [];
        if (data.raw) {
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const matches = data.raw.match(emailRegex) || [];
            return [...new Set(matches)].sort();
        }
        if (Array.isArray(data.emails)) {
            return [...new Set(data.emails)].sort();
        }
        if (Array.isArray(data.addresses)) {
            return [...new Set(data.addresses)].sort();
        }
        if (Array.isArray(data)) {
            return [...new Set(data.filter((e) => typeof e === 'string'))].sort();
        }
        return [];
    }
    _normalizeProfiles(data, username) {
        if (!data)
            return [];
        if (data.raw) {
            return this._parseRawProfiles(data.raw, username);
        }
        const profiles = [];
        if (Array.isArray(data.profiles)) {
            profiles.push(...data.profiles.map((p) => this._normalizeProfile(p, username)).filter(Boolean));
        }
        else if (Array.isArray(data.results)) {
            profiles.push(...data.results.map((p) => this._normalizeProfile(p, username)).filter(Boolean));
        }
        else if (Array.isArray(data)) {
            profiles.push(...data.map((p) => this._normalizeProfile(p, username)).filter((p) => p !== null));
        }
        return this._deduplicateProfiles(profiles.filter((p) => p !== null));
    }
    _normalizeProfile(profile, username) {
        if (!profile)
            return null;
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
    _normalizeUrls(data) {
        if (!data)
            return [];
        if (data.raw) {
            const urlRegex = /https?:\/\/[^\s<>"]+/g;
            const matches = data.raw.match(urlRegex) || [];
            return [...new Set(matches)];
        }
        if (Array.isArray(data.urls)) {
            return [...new Set(data.urls)];
        }
        if (Array.isArray(data)) {
            return [...new Set(data.filter((u) => typeof u === 'string'))];
        }
        return [];
    }
    _normalizeSocialMedia(data) {
        if (!data)
            return {};
        const platforms = {};
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
    _parseRawProfiles(raw, username) {
        const profiles = [];
        const lines = raw.split('\n').filter(Boolean);
        for (const line of lines) {
            const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
                const url = urlMatch[1];
                const platform = this._extractPlatformFromUrl(url);
                profiles.push({
                    platform: platform,
                    url,
                    username: username
                });
            }
        }
        return profiles;
    }
    _extractPlatformFromUrl(url) {
        const platformPatterns = {
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
    _deduplicateProfiles(profiles) {
        const seen = new Set();
        return profiles.filter(profile => {
            if (seen.has(profile.url)) {
                return false;
            }
            seen.add(profile.url);
            return true;
        });
    }
    _extractBaseDomain(host) {
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
    _extractCompanyName(domain) {
        return domain.split('.')[0];
    }
}
//# sourceMappingURL=osint-stage.js.map