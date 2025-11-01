/**
 * DiffDetector
 *
 * Change detection between scan runs:
 * - Compares fingerprints
 * - Identifies infrastructure changes
 * - Tracks attack surface evolution
 * - Detects security posture changes
 */

export class DiffDetector {
  /**
   * Detect changes between two reports
   */
  static detect(previousReport, currentReport) {
    if (!previousReport || !currentReport) {
      return null;
    }

    const diff = {
      timestamp: new Date().toISOString(),
      previousScan: previousReport.timestamp,
      currentScan: currentReport.timestamp,
      changes: {},
      summary: {
        totalChanges: 0,
        severity: 'low'
      }
    };

    // Detect changes in each stage
    diff.changes.dns = this._detectDnsChanges(previousReport.results?.dns, currentReport.results?.dns);
    diff.changes.certificate = this._detectCertificateChanges(
      previousReport.results?.certificate,
      currentReport.results?.certificate
    );
    diff.changes.ports = this._detectPortChanges(previousReport.results?.ports, currentReport.results?.ports);
    diff.changes.subdomains = this._detectSubdomainChanges(
      previousReport.results?.subdomains,
      currentReport.results?.subdomains
    );
    diff.changes.paths = this._detectPathChanges(
      previousReport.results?.webDiscovery,
      currentReport.results?.webDiscovery
    );
    diff.changes.technologies = this._detectTechnologyChanges(
      previousReport.results?.fingerprint,
      currentReport.results?.fingerprint
    );
    diff.changes.security = this._detectSecurityChanges(
      previousReport.results?.tlsAudit,
      currentReport.results?.tlsAudit,
      previousReport.results?.vulnerability,
      currentReport.results?.vulnerability
    );

    // Calculate summary
    diff.summary = this._calculateSummary(diff.changes);

    return diff;
  }

  /**
   * Detect DNS changes (IPs, nameservers, mail servers)
   */
  static _detectDnsChanges(oldDns, newDns) {
    if (!oldDns || !newDns) return null;

    const changes = {};

    // IPv4 changes
    const oldIPv4 = new Set(oldDns.records?.A || []);
    const newIPv4 = new Set(newDns.records?.A || []);
    const addedIPv4 = [...newIPv4].filter(ip => !oldIPv4.has(ip));
    const removedIPv4 = [...oldIPv4].filter(ip => !newIPv4.has(ip));
    if (addedIPv4.length > 0 || removedIPv4.length > 0) {
      changes.ipv4 = { added: addedIPv4, removed: removedIPv4 };
    }

    // IPv6 changes
    const oldIPv6 = new Set(oldDns.records?.AAAA || []);
    const newIPv6 = new Set(newDns.records?.AAAA || []);
    const addedIPv6 = [...newIPv6].filter(ip => !oldIPv6.has(ip));
    const removedIPv6 = [...oldIPv6].filter(ip => !newIPv6.has(ip));
    if (addedIPv6.length > 0 || removedIPv6.length > 0) {
      changes.ipv6 = { added: addedIPv6, removed: removedIPv6 };
    }

    // Nameserver changes
    const oldNS = new Set(oldDns.records?.NS || []);
    const newNS = new Set(newDns.records?.NS || []);
    const addedNS = [...newNS].filter(ns => !oldNS.has(ns));
    const removedNS = [...oldNS].filter(ns => !newNS.has(ns));
    if (addedNS.length > 0 || removedNS.length > 0) {
      changes.nameservers = { added: addedNS, removed: removedNS };
    }

    // Mail server changes
    const oldMX = new Set((oldDns.records?.MX || []).map(mx => mx.exchange));
    const newMX = new Set((newDns.records?.MX || []).map(mx => mx.exchange));
    const addedMX = [...newMX].filter(mx => !oldMX.has(mx));
    const removedMX = [...oldMX].filter(mx => !newMX.has(mx));
    if (addedMX.length > 0 || removedMX.length > 0) {
      changes.mailServers = { added: addedMX, removed: removedMX };
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * Detect certificate changes
   */
  static _detectCertificateChanges(oldCert, newCert) {
    if (!oldCert || !newCert) return null;

    const changes = {};

    // Fingerprint change (certificate rotation)
    if (oldCert.fingerprint !== newCert.fingerprint) {
      changes.rotated = true;
      changes.old = {
        issuer: oldCert.issuer,
        validFrom: oldCert.validFrom,
        validTo: oldCert.validTo,
        fingerprint: oldCert.fingerprint
      };
      changes.new = {
        issuer: newCert.issuer,
        validFrom: newCert.validFrom,
        validTo: newCert.validTo,
        fingerprint: newCert.fingerprint
      };
    }

    // SAN changes
    const oldSANs = new Set(oldCert.subjectAltName || []);
    const newSANs = new Set(newCert.subjectAltName || []);
    const addedSANs = [...newSANs].filter(san => !oldSANs.has(san));
    const removedSANs = [...oldSANs].filter(san => !newSANs.has(san));
    if (addedSANs.length > 0 || removedSANs.length > 0) {
      changes.sans = { added: addedSANs, removed: removedSANs };
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * Detect port changes
   */
  static _detectPortChanges(oldPorts, newPorts) {
    if (!oldPorts || !newPorts) return null;

    const oldPortSet = new Set((oldPorts.openPorts || []).map(p => p.port));
    const newPortSet = new Set((newPorts.openPorts || []).map(p => p.port));

    const added = [...newPortSet].filter(p => !oldPortSet.has(p));
    const removed = [...oldPortSet].filter(p => !newPortSet.has(p));

    if (added.length === 0 && removed.length === 0) {
      return null;
    }

    return {
      added: added.map(port => {
        const portInfo = (newPorts.openPorts || []).find(p => p.port === port);
        return portInfo || { port };
      }),
      removed: removed.map(port => {
        const portInfo = (oldPorts.openPorts || []).find(p => p.port === port);
        return portInfo || { port };
      }),
      total: {
        added: added.length,
        removed: removed.length
      }
    };
  }

  /**
   * Detect subdomain changes
   */
  static _detectSubdomainChanges(oldSubs, newSubs) {
    if (!oldSubs || !newSubs) return null;

    const oldSet = new Set(oldSubs.list || []);
    const newSet = new Set(newSubs.list || []);

    const added = [...newSet].filter(s => !oldSet.has(s));
    const removed = [...oldSet].filter(s => !newSet.has(s));

    if (added.length === 0 && removed.length === 0) {
      return null;
    }

    return {
      added,
      removed,
      total: {
        added: added.length,
        removed: removed.length,
        previous: oldSubs.total || 0,
        current: newSubs.total || 0
      }
    };
  }

  /**
   * Detect discovered path changes
   */
  static _detectPathChanges(oldWeb, newWeb) {
    if (!oldWeb || !newWeb) return null;

    // Extract paths from tools
    const extractPaths = (webData) => {
      const paths = new Set();
      Object.values(webData.tools || {}).forEach(tool => {
        if (tool.status === 'ok' && tool.paths) {
          tool.paths.forEach(path => paths.add(path));
        }
      });
      return paths;
    };

    const oldPaths = extractPaths(oldWeb);
    const newPaths = extractPaths(newWeb);

    const added = [...newPaths].filter(p => !oldPaths.has(p));
    const removed = [...oldPaths].filter(p => !newPaths.has(p));

    if (added.length === 0 && removed.length === 0) {
      return null;
    }

    return {
      added,
      removed,
      total: {
        added: added.length,
        removed: removed.length,
        previous: oldPaths.size,
        current: newPaths.size
      }
    };
  }

  /**
   * Detect technology changes
   */
  static _detectTechnologyChanges(oldFP, newFP) {
    if (!oldFP || !newFP) return null;

    const oldTech = new Set(oldFP.technologies || []);
    const newTech = new Set(newFP.technologies || []);

    const added = [...newTech].filter(t => !oldTech.has(t));
    const removed = [...oldTech].filter(t => !newTech.has(t));

    if (added.length === 0 && removed.length === 0) {
      return null;
    }

    return {
      added,
      removed,
      total: {
        added: added.length,
        removed: removed.length
      }
    };
  }

  /**
   * Detect security changes (TLS, vulnerabilities)
   */
  static _detectSecurityChanges(oldTLS, newTLS, oldVuln, newVuln) {
    const changes = {};

    // TLS changes
    if (oldTLS && newTLS) {
      const oldGrade = oldTLS.grade || 'unknown';
      const newGrade = newTLS.grade || 'unknown';
      if (oldGrade !== newGrade) {
        changes.tlsGrade = { old: oldGrade, new: newGrade };
      }
    }

    // Vulnerability changes
    if (oldVuln && newVuln) {
      const oldVulnCount = this._countVulnerabilities(oldVuln);
      const newVulnCount = this._countVulnerabilities(newVuln);
      if (oldVulnCount !== newVulnCount) {
        changes.vulnerabilities = {
          old: oldVulnCount,
          new: newVulnCount,
          delta: newVulnCount - oldVulnCount
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  /**
   * Count vulnerabilities from scan results
   */
  static _countVulnerabilities(vulnData) {
    let count = 0;
    Object.values(vulnData.tools || {}).forEach(tool => {
      if (tool.status === 'ok' && tool.vulnerabilities) {
        count += tool.vulnerabilities.length;
      }
    });
    return count;
  }

  /**
   * Calculate summary of changes
   */
  static _calculateSummary(changes) {
    let totalChanges = 0;
    let severity = 'low';

    // Count changes
    if (changes.dns) {
      totalChanges += (changes.dns.ipv4?.added?.length || 0) + (changes.dns.ipv4?.removed?.length || 0);
      totalChanges += (changes.dns.ipv6?.added?.length || 0) + (changes.dns.ipv6?.removed?.length || 0);
      totalChanges += (changes.dns.nameservers?.added?.length || 0) + (changes.dns.nameservers?.removed?.length || 0);
      totalChanges += (changes.dns.mailServers?.added?.length || 0) + (changes.dns.mailServers?.removed?.length || 0);
    }

    if (changes.certificate?.rotated) {
      totalChanges += 1;
      severity = 'medium'; // Certificate rotation is notable
    }

    if (changes.ports) {
      const portChanges = (changes.ports.added?.length || 0) + (changes.ports.removed?.length || 0);
      totalChanges += portChanges;
      if (changes.ports.added?.length > 0) {
        severity = 'high'; // New open ports are critical
      }
    }

    if (changes.subdomains) {
      totalChanges += (changes.subdomains.added?.length || 0) + (changes.subdomains.removed?.length || 0);
      if (changes.subdomains.added?.length > 10) {
        severity = 'medium'; // Many new subdomains
      }
    }

    if (changes.paths) {
      totalChanges += (changes.paths.added?.length || 0) + (changes.paths.removed?.length || 0);
    }

    if (changes.technologies) {
      totalChanges += (changes.technologies.added?.length || 0) + (changes.technologies.removed?.length || 0);
    }

    if (changes.security?.vulnerabilities?.delta > 0) {
      severity = 'critical'; // New vulnerabilities are critical
      totalChanges += changes.security.vulnerabilities.delta;
    }

    return {
      totalChanges,
      severity,
      hasInfrastructureChanges: !!(changes.dns || changes.certificate),
      hasAttackSurfaceChanges: !!(changes.ports || changes.subdomains || changes.paths),
      hasSecurityChanges: !!changes.security
    };
  }
}
