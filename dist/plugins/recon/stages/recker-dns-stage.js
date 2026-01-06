/**
 * ReckerDNSStage
 *
 * DNS Intelligence using Recker's DNS toolkit
 *
 * Discovers:
 * - DNS records (A, AAAA, MX, TXT, NS)
 * - Security records (SPF, DMARC, DKIM, CAA)
 * - DNS health score
 *
 * Uses Recker's native DNS resolution (no external dependencies like dig)
 * Falls back to DNSDumpsterStage if Recker is not available
 */
export class ReckerDNSStage {
    plugin;
    config;
    reckerAvailable = null;
    dnsClient = null;
    checkDnsHealth = null;
    checkDkim = null;
    fallbackStage = null;
    constructor(plugin) {
        this.plugin = plugin;
        this.config = plugin.config;
    }
    async _checkReckerAvailability() {
        if (this.reckerAvailable !== null) {
            return this.reckerAvailable;
        }
        try {
            const dnsModule = await import('recker/dns');
            const toolkitModule = await import('recker/dns-toolkit');
            this.dnsClient = dnsModule.createDNS();
            this.checkDnsHealth = toolkitModule.checkDnsHealth;
            this.checkDkim = toolkitModule.checkDkim;
            this.reckerAvailable = true;
            return true;
        }
        catch {
            this.reckerAvailable = false;
            return false;
        }
    }
    async _getFallbackStage() {
        if (!this.fallbackStage) {
            const { DNSDumpsterStage } = await import('./dnsdumpster-stage.js');
            this.fallbackStage = new DNSDumpsterStage(this.plugin);
        }
        return this.fallbackStage;
    }
    async execute(target, options = {}) {
        const isReckerAvailable = await this._checkReckerAvailability();
        if (!isReckerAvailable) {
            return this._executeFallback(target, options);
        }
        const result = {
            status: 'ok',
            host: target.host,
            dnsRecords: {
                A: [],
                AAAA: [],
                MX: [],
                TXT: [],
                NS: []
            },
            securityRecords: null,
            healthCheck: null,
            errors: {}
        };
        try {
            const [aRecords, aaaaRecords, mxRecords, txtRecords, nsRecords] = await Promise.all([
                this._resolveA(target.host),
                this._resolveAAAA(target.host),
                this._resolveMX(target.host),
                this._resolveTXT(target.host),
                this._resolveNS(target.host)
            ]);
            result.dnsRecords.A = aRecords;
            result.dnsRecords.AAAA = aaaaRecords;
            result.dnsRecords.MX = mxRecords;
            result.dnsRecords.TXT = txtRecords;
            result.dnsRecords.NS = nsRecords;
            if (options.includeSecurityRecords !== false) {
                result.securityRecords = await this._getSecurityRecords(target.host);
            }
            if (options.includeHealthCheck) {
                result.healthCheck = await this._getHealthCheck(target.host);
            }
        }
        catch (error) {
            result.status = 'error';
            result.errors.general = error.message;
        }
        return {
            _individual: {
                recker: { status: 'ok', source: 'recker/dns' },
                fallback: null
            },
            _aggregated: result,
            ...result
        };
    }
    async _resolveA(host) {
        try {
            const ips = await this.dnsClient.resolve4(host);
            return ips.map(ip => ({ hostname: host, ip }));
        }
        catch {
            return [];
        }
    }
    async _resolveAAAA(host) {
        try {
            const ips = await this.dnsClient.resolve6(host);
            return ips.map(ip => ({ hostname: host, ip }));
        }
        catch {
            return [];
        }
    }
    async _resolveMX(host) {
        try {
            const records = await this.dnsClient.resolveMx(host);
            return records.map(r => ({
                priority: String(r.priority),
                hostname: r.exchange,
                ip: ''
            }));
        }
        catch {
            return [];
        }
    }
    async _resolveTXT(host) {
        try {
            const records = await this.dnsClient.resolveTxt(host);
            return records.map(content => ({ content }));
        }
        catch {
            return [];
        }
    }
    async _resolveNS(host) {
        try {
            const records = await this.dnsClient.resolveNs(host);
            return records.map(hostname => ({ hostname, ip: null }));
        }
        catch {
            return [];
        }
    }
    async _getSecurityRecords(host) {
        try {
            const security = await this.dnsClient.getSecurityRecords(host);
            let dkim = null;
            if (this.checkDkim) {
                try {
                    dkim = await this.checkDkim(host, 'default');
                }
                catch {
                    dkim = { found: false };
                }
            }
            return {
                spf: security.spf || [],
                dmarc: security.dmarc || null,
                dkim,
                caa: security.caa || null
            };
        }
        catch {
            return {
                spf: [],
                dmarc: null,
                dkim: null,
                caa: null
            };
        }
    }
    async _getHealthCheck(host) {
        if (!this.checkDnsHealth)
            return null;
        try {
            const health = await this.checkDnsHealth(host);
            return {
                score: health.score,
                grade: health.grade,
                checks: health.checks
            };
        }
        catch {
            return null;
        }
    }
    async _executeFallback(target, options) {
        const fallback = await this._getFallbackStage();
        const fallbackResult = await fallback.execute(target, {
            timeout: options.timeout,
            fallbackToDig: true
        });
        return {
            _individual: {
                recker: { status: 'unavailable', source: 'recker not installed' },
                fallback: { status: 'ok', source: 'dnsdumpster' }
            },
            _aggregated: {
                status: fallbackResult.status,
                host: fallbackResult.host,
                dnsRecords: fallbackResult.dnsRecords,
                securityRecords: null,
                healthCheck: null,
                errors: fallbackResult.errors
            },
            status: fallbackResult.status,
            host: fallbackResult.host,
            dnsRecords: fallbackResult.dnsRecords,
            securityRecords: null,
            healthCheck: null,
            errors: fallbackResult.errors
        };
    }
    isReckerEnabled() {
        return this.reckerAvailable === true;
    }
}
export default ReckerDNSStage;
//# sourceMappingURL=recker-dns-stage.js.map