/**
 * ASNStage
 *
 * ASN (Autonomous System Number) and Network Intelligence
 *
 * Discovers:
 * - ASN ownership and organization
 * - IP ranges (CIDR blocks)
 * - Network provider information
 * - BGP routing data
 *
 * Uses 100% free APIs:
 * - iptoasn.com (unlimited, free)
 * - hackertarget.com (100 queries/day free)
 */
import { createHttpClient } from '../../../concerns/http-client.js';
export class ASNStage {
    plugin;
    commandRunner;
    config;
    _httpClient;
    constructor(plugin) {
        this.plugin = plugin;
        this.commandRunner = plugin.commandRunner;
        this.config = plugin.config;
        this._httpClient = null;
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
    async execute(target, options = {}) {
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
            iptoasn: { status: 'ok', results: [] },
            hackertarget: { status: 'ok', results: [] },
            dig: { status: 'ok', ipv4: [], ipv6: [] }
        };
        const ipAddresses = await this.resolveHostToIPs(target.host, individual.dig);
        result.ipAddresses = ipAddresses;
        if (ipAddresses.length === 0) {
            result.status = 'error';
            result.errors.dns = 'Could not resolve host to IP addresses';
            individual.dig.status = 'error';
            return {
                _individual: individual,
                _aggregated: result,
                ...result
            };
        }
        const organizationsSet = new Set();
        for (const ip of ipAddresses) {
            try {
                let asnData = await this.lookupASNViaIPToASN(ip, options);
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
                    asnData = await this.lookupASNViaHackerTarget(ip, options);
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
        result.asns = this.deduplicateASNs(result.asns);
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
    async resolveHostToIPs(host, digResults = null) {
        const ips = [];
        const aRun = await this.commandRunner.runSimple('dig', ['+short', 'A', host], { timeout: 5000 });
        if (aRun.status === 'ok' && aRun.raw) {
            const ipv4s = aRun.raw
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => /^\d+\.\d+\.\d+\.\d+$/.test(line));
            ips.push(...ipv4s);
            if (digResults) {
                digResults.ipv4 = ipv4s;
                if (this.config?.storage?.persistRawOutput) {
                    digResults.raw_ipv4 = aRun.raw;
                }
            }
        }
        const aaaaRun = await this.commandRunner.runSimple('dig', ['+short', 'AAAA', host], { timeout: 5000 });
        if (aaaaRun.status === 'ok' && aaaaRun.raw) {
            const ipv6s = aaaaRun.raw
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => /^[0-9a-f:]+$/i.test(line) && line.includes(':'));
            ips.push(...ipv6s);
            if (digResults) {
                digResults.ipv6 = ipv6s;
                if (this.config?.storage?.persistRawOutput) {
                    digResults.raw_ipv6 = aaaaRun.raw;
                }
            }
        }
        return [...new Set(ips)];
    }
    async lookupASNViaIPToASN(ip, options = {}) {
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
    async lookupASNViaHackerTarget(ip, options = {}) {
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
    deduplicateASNs(asns) {
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
}
//# sourceMappingURL=asn-stage.js.map