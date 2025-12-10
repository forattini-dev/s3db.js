/**
 * FingerprintBuilder
 *
 * Aggregates data from multiple stage results to build a consolidated fingerprint:
 * - DNS records (IPs, nameservers, mail servers)
 * - Open ports and services
 * - Subdomains
 * - Technology stack
 * - TLS/SSL configuration
 * - HTTP headers and server info
 */
export class FingerprintBuilder {
    static build(stageResults) {
        const fingerprint = {
            infrastructure: this._buildInfrastructure(stageResults),
            attackSurface: this._buildAttackSurface(stageResults),
            technologies: this._buildTechnologies(stageResults),
            security: this._buildSecurity(stageResults)
        };
        return fingerprint;
    }
    static _buildInfrastructure(stageResults) {
        const infrastructure = {};
        if (stageResults.dns?.status === 'ok') {
            infrastructure.ips = {
                ipv4: stageResults.dns.records.A || [],
                ipv6: stageResults.dns.records.AAAA || []
            };
            infrastructure.nameservers = stageResults.dns.records.NS || [];
            infrastructure.mailServers = (stageResults.dns.records.MX || []).map(mx => typeof mx === 'object' ? mx.exchange : String(mx));
            infrastructure.txtRecords = stageResults.dns.records.TXT || [];
        }
        if (stageResults.certificate?.status === 'ok') {
            infrastructure.certificate = {
                issuer: stageResults.certificate.issuer,
                subject: stageResults.certificate.subject,
                validFrom: stageResults.certificate.validFrom,
                validTo: stageResults.certificate.validTo,
                fingerprint: stageResults.certificate.fingerprint,
                sans: stageResults.certificate.subjectAltName || []
            };
        }
        if (stageResults.latency?.status === 'ok') {
            infrastructure.latency = {
                ping: stageResults.latency.ping,
                traceroute: stageResults.latency.traceroute
            };
        }
        return infrastructure;
    }
    static _buildAttackSurface(stageResults) {
        const attackSurface = {};
        if (stageResults.ports?.status === 'ok') {
            attackSurface.openPorts = stageResults.ports.openPorts || [];
            attackSurface.portScanners = Object.keys(stageResults.ports.scanners || {});
        }
        if (stageResults.subdomains?.status === 'ok') {
            attackSurface.subdomains = {
                total: stageResults.subdomains.total || 0,
                list: stageResults.subdomains.list || [],
                sources: Object.keys(stageResults.subdomains.sources || {})
            };
        }
        if (stageResults.webDiscovery?.status === 'ok') {
            const paths = new Set();
            Object.values(stageResults.webDiscovery.tools || {}).forEach(tool => {
                if (tool.status === 'ok' && tool.paths) {
                    tool.paths.forEach(path => paths.add(path));
                }
            });
            attackSurface.discoveredPaths = {
                total: paths.size,
                list: Array.from(paths).sort()
            };
        }
        return attackSurface;
    }
    static _buildTechnologies(stageResults) {
        const technologies = {};
        if (stageResults.http?.status === 'ok') {
            technologies.server = stageResults.http.headers?.server;
            technologies.poweredBy = stageResults.http.headers?.['x-powered-by'];
            technologies.httpHeaders = stageResults.http.headers;
        }
        if (stageResults.fingerprint?.status === 'ok') {
            technologies.detected = stageResults.fingerprint.technologies || [];
            technologies.cms = stageResults.fingerprint.cms;
            technologies.frameworks = stageResults.fingerprint.frameworks || [];
        }
        if (stageResults.osint?.status === 'ok') {
            const osintData = {};
            Object.entries(stageResults.osint.tools || {}).forEach(([tool, result]) => {
                if (result.status === 'ok') {
                    osintData[tool] = result;
                }
            });
            if (Object.keys(osintData).length > 0) {
                technologies.osint = osintData;
            }
        }
        return technologies;
    }
    static _buildSecurity(stageResults) {
        const security = {};
        if (stageResults.tlsAudit?.status === 'ok') {
            const tlsData = {};
            Object.entries(stageResults.tlsAudit.tools || {}).forEach(([tool, result]) => {
                if (result.status === 'ok') {
                    tlsData[tool] = result;
                }
            });
            if (Object.keys(tlsData).length > 0) {
                security.tls = tlsData;
            }
        }
        if (stageResults.vulnerability?.status === 'ok') {
            const vulns = {};
            Object.entries(stageResults.vulnerability.tools || {}).forEach(([tool, result]) => {
                if (result.status === 'ok') {
                    vulns[tool] = result;
                }
            });
            if (Object.keys(vulns).length > 0) {
                security.vulnerabilities = vulns;
            }
        }
        if (stageResults.http?.status === 'ok') {
            const headers = stageResults.http.headers || {};
            security.headers = {
                hsts: headers['strict-transport-security'],
                csp: headers['content-security-policy'],
                xFrameOptions: headers['x-frame-options'],
                xContentTypeOptions: headers['x-content-type-options'],
                xXssProtection: headers['x-xss-protection'],
                referrerPolicy: headers['referrer-policy']
            };
        }
        return security;
    }
    static buildSummary(fingerprint) {
        return {
            totalIPs: (fingerprint.infrastructure?.ips?.ipv4?.length || 0) +
                (fingerprint.infrastructure?.ips?.ipv6?.length || 0),
            totalPorts: fingerprint.attackSurface?.openPorts?.length || 0,
            totalSubdomains: fingerprint.attackSurface?.subdomains?.total || 0,
            totalPaths: fingerprint.attackSurface?.discoveredPaths?.total || 0,
            hasCertificate: !!fingerprint.infrastructure?.certificate,
            hasTLSAudit: !!fingerprint.security?.tls,
            hasVulnerabilities: !!fingerprint.security?.vulnerabilities,
            detectedTechnologies: fingerprint.technologies?.detected?.length || 0
        };
    }
    static diff(oldFingerprint, newFingerprint) {
        const changes = {
            infrastructure: this._diffInfrastructure(oldFingerprint.infrastructure, newFingerprint.infrastructure),
            attackSurface: this._diffAttackSurface(oldFingerprint.attackSurface, newFingerprint.attackSurface),
            technologies: this._diffTechnologies(oldFingerprint.technologies, newFingerprint.technologies),
            security: this._diffSecurity(oldFingerprint.security, newFingerprint.security)
        };
        return changes;
    }
    static _diffInfrastructure(oldInfra, newInfra) {
        const diff = {};
        const oldIPv4 = new Set(oldInfra?.ips?.ipv4 || []);
        const newIPv4 = new Set(newInfra?.ips?.ipv4 || []);
        const addedIPv4 = [...newIPv4].filter(ip => !oldIPv4.has(ip));
        const removedIPv4 = [...oldIPv4].filter(ip => !newIPv4.has(ip));
        if (addedIPv4.length > 0 || removedIPv4.length > 0) {
            diff.ipv4 = { added: addedIPv4, removed: removedIPv4 };
        }
        if (oldInfra?.certificate?.fingerprint !== newInfra?.certificate?.fingerprint) {
            diff.certificateChanged = true;
        }
        return Object.keys(diff).length > 0 ? diff : null;
    }
    static _diffAttackSurface(oldSurface, newSurface) {
        const diff = {};
        const oldPorts = new Set((oldSurface?.openPorts || []).map(p => p.port));
        const newPorts = new Set((newSurface?.openPorts || []).map(p => p.port));
        const addedPorts = [...newPorts].filter(p => !oldPorts.has(p));
        const removedPorts = [...oldPorts].filter(p => !newPorts.has(p));
        if (addedPorts.length > 0 || removedPorts.length > 0) {
            diff.ports = { added: addedPorts, removed: removedPorts };
        }
        const oldSubs = new Set(oldSurface?.subdomains?.list || []);
        const newSubs = new Set(newSurface?.subdomains?.list || []);
        const addedSubs = [...newSubs].filter(s => !oldSubs.has(s));
        const removedSubs = [...oldSubs].filter(s => !newSubs.has(s));
        if (addedSubs.length > 0 || removedSubs.length > 0) {
            diff.subdomains = { added: addedSubs, removed: removedSubs };
        }
        const oldPaths = new Set(oldSurface?.discoveredPaths?.list || []);
        const newPaths = new Set(newSurface?.discoveredPaths?.list || []);
        const addedPaths = [...newPaths].filter(p => !oldPaths.has(p));
        const removedPaths = [...oldPaths].filter(p => !newPaths.has(p));
        if (addedPaths.length > 0 || removedPaths.length > 0) {
            diff.paths = { added: addedPaths, removed: removedPaths };
        }
        return Object.keys(diff).length > 0 ? diff : null;
    }
    static _diffTechnologies(oldTech, newTech) {
        const diff = {};
        const oldDetected = new Set(oldTech?.detected || []);
        const newDetected = new Set(newTech?.detected || []);
        const addedTech = [...newDetected].filter(t => !oldDetected.has(t));
        const removedTech = [...oldDetected].filter(t => !newDetected.has(t));
        if (addedTech.length > 0 || removedTech.length > 0) {
            diff.detected = { added: addedTech, removed: removedTech };
        }
        return Object.keys(diff).length > 0 ? diff : null;
    }
    static _diffSecurity(oldSec, newSec) {
        const diff = {};
        const oldTLS = Object.keys(oldSec?.tls || {});
        const newTLS = Object.keys(newSec?.tls || {});
        if (JSON.stringify(oldTLS.sort()) !== JSON.stringify(newTLS.sort())) {
            diff.tlsChanged = true;
        }
        const oldVulns = Object.keys(oldSec?.vulnerabilities || {});
        const newVulns = Object.keys(newSec?.vulnerabilities || {});
        if (JSON.stringify(oldVulns.sort()) !== JSON.stringify(newVulns.sort())) {
            diff.vulnerabilitiesChanged = true;
        }
        return Object.keys(diff).length > 0 ? diff : null;
    }
}
//# sourceMappingURL=fingerprint-builder.js.map