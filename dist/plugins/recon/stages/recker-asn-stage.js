/**
 * ReckerASNStage
 *
 * ASN (Autonomous System Number) lookup using Recker
 *
 * Uses Recker's DNS client to resolve hostnames (no dig dependency)
 * Uses Recker's HTTP client for API calls
 *
 * Falls back to ASNStage if Recker is not available
 */
import { createHttpClient } from '../../../concerns/http-client.js';
export class ReckerASNStage {
    plugin;
    config;
    _httpClient = null;
    reckerAvailable = null;
    dnsClient = null;
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
            this.dnsClient = dnsModule.createDNS();
            this.reckerAvailable = true;
            return true;
        }
        catch {
            this.reckerAvailable = false;
            return false;
        }
    }
    async _getHttpClient() {
        if (!this._httpClient) {
            this._httpClient = await createHttpClient({
                headers: {
                    'User-Agent': this.config.curl?.userAgent || 'ReconPlugin/1.0'
                },
                timeout: 10000,
                retry: {
                    maxAttempts: 2,
                    delay: 500,
                    backoff: 'exponential',
                    retryAfter: true,
                    retryOn: [429, 500, 502, 503, 504]
                }
            });
        }
        return this._httpClient;
    }
    async _getFallbackStage() {
        if (!this.fallbackStage) {
            const { ASNStage } = await import('./asn-stage.js');
            this.fallbackStage = new ASNStage(this.plugin);
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
            ipAddresses: [],
            asns: [],
            networks: [],
            organizations: [],
            errors: {}
        };
        const individual = {
            recker: { status: 'ok', source: 'recker/dns' },
            iptoasn: { status: 'ok', results: [] },
            hackertarget: { status: 'ok', results: [] }
        };
        const ipAddresses = await this._resolveHostToIPs(target.host);
        result.ipAddresses = ipAddresses;
        if (ipAddresses.length === 0) {
            result.status = 'error';
            result.errors.dns = 'Could not resolve host to IP addresses';
            individual.recker.status = 'error';
            return {
                _individual: individual,
                _aggregated: result,
                ...result
            };
        }
        const organizationsSet = new Set();
        for (const ip of ipAddresses) {
            try {
                let asnData = await this._lookupASNViaIPToASN(ip);
                if (asnData) {
                    asnData._source = 'iptoasn';
                    individual.iptoasn.results.push({ ...asnData });
                    result.asns.push(asnData);
                    if (asnData.network) {
                        result.networks.push(asnData.network);
                    }
                    if (asnData.organization) {
                        organizationsSet.add(asnData.organization);
                    }
                }
                else if (options.hackertarget !== false) {
                    asnData = await this._lookupASNViaHackerTarget(ip);
                    if (asnData) {
                        asnData._source = 'hackertarget';
                        individual.hackertarget.results.push({ ...asnData });
                        result.asns.push(asnData);
                        if (asnData.network) {
                            result.networks.push(asnData.network);
                        }
                        if (asnData.organization) {
                            organizationsSet.add(asnData.organization);
                        }
                    }
                }
            }
            catch (error) {
                result.errors[ip] = error.message;
            }
        }
        result.organizations = Array.from(organizationsSet);
        result.asns = this._deduplicateASNs(result.asns);
        if (individual.iptoasn.results.length === 0) {
            individual.iptoasn.status = 'unavailable';
        }
        if (individual.hackertarget.results.length === 0 && options.hackertarget !== false) {
            individual.hackertarget.status = 'unavailable';
        }
        return {
            _individual: individual,
            _aggregated: result,
            ...result
        };
    }
    async _resolveHostToIPs(host) {
        const ips = [];
        try {
            const ipv4s = await this.dnsClient.resolve4(host);
            ips.push(...ipv4s);
        }
        catch {
            // No A records
        }
        try {
            const ipv6s = await this.dnsClient.resolve6(host);
            ips.push(...ipv6s);
        }
        catch {
            // No AAAA records
        }
        return [...new Set(ips)];
    }
    async _lookupASNViaIPToASN(ip) {
        try {
            const url = `https://api.iptoasn.com/v1/as/ip/${encodeURIComponent(ip)}`;
            const client = await this._getHttpClient();
            const response = await client.get(url);
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            if (!data.announced || !data.as_number) {
                return null;
            }
            return {
                ip,
                asn: `AS${data.as_number}`,
                asnNumber: data.as_number,
                organization: data.as_description || data.as_name,
                country: data.as_country_code,
                network: data.first_ip && data.last_ip
                    ? `${data.first_ip} - ${data.last_ip}`
                    : null,
                source: 'iptoasn.com'
            };
        }
        catch {
            return null;
        }
    }
    async _lookupASNViaHackerTarget(ip) {
        try {
            const url = `https://api.hackertarget.com/aslookup/?q=${encodeURIComponent(ip)}`;
            const client = await this._getHttpClient();
            const response = await client.get(url);
            if (!response.ok) {
                return null;
            }
            const text = await response.text();
            if (text.includes('error') || !text.includes(',')) {
                return null;
            }
            const parts = text.split(',').map(p => p.replace(/"/g, '').trim());
            if (parts.length < 3) {
                return null;
            }
            const asnNumber = parseInt(parts[0]);
            const network = parts[1] || null;
            const country = parts[2] || null;
            const organization = parts[4] || parts[3] || null;
            return {
                ip,
                asn: `AS${asnNumber}`,
                asnNumber,
                organization,
                country,
                network,
                source: 'hackertarget.com'
            };
        }
        catch {
            return null;
        }
    }
    _deduplicateASNs(asns) {
        const seen = new Map();
        for (const asn of asns) {
            const key = asn.asnNumber;
            if (!seen.has(key)) {
                seen.set(key, asn);
            }
            else {
                const existing = seen.get(key);
                if (asn.network && !existing.network) {
                    existing.network = asn.network;
                }
                if (asn.organization && !existing.organization) {
                    existing.organization = asn.organization;
                }
                if (!existing.sources) {
                    existing.sources = [existing.source];
                }
                if (!existing.sources.includes(asn.source)) {
                    existing.sources.push(asn.source);
                }
            }
        }
        return Array.from(seen.values());
    }
    async _executeFallback(target, options) {
        const fallback = await this._getFallbackStage();
        const fallbackResult = await fallback.execute(target, options);
        return {
            _individual: {
                recker: { status: 'unavailable', source: 'recker not installed' },
                iptoasn: fallbackResult._individual.iptoasn,
                hackertarget: fallbackResult._individual.hackertarget
            },
            _aggregated: {
                status: fallbackResult.status,
                host: fallbackResult.host,
                ipAddresses: fallbackResult.ipAddresses,
                asns: fallbackResult.asns,
                networks: fallbackResult.networks,
                organizations: fallbackResult.organizations,
                errors: fallbackResult.errors
            },
            status: fallbackResult.status,
            host: fallbackResult.host,
            ipAddresses: fallbackResult.ipAddresses,
            asns: fallbackResult.asns,
            networks: fallbackResult.networks,
            organizations: fallbackResult.organizations,
            errors: fallbackResult.errors
        };
    }
    isReckerEnabled() {
        return this.reckerAvailable === true;
    }
}
export default ReckerASNStage;
//# sourceMappingURL=recker-asn-stage.js.map