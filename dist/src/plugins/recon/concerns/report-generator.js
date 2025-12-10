/**
 * ReportGenerator
 *
 * Client-facing report generation:
 * - Markdown reports (human-readable)
 * - JSON reports (machine-readable)
 * - HTML reports (browser-friendly)
 * - Executive summaries
 */
export class ReportGenerator {
    static generateMarkdown(report) {
        let markdown = '';
        markdown += `# Reconnaissance Report: ${report.target.host}\n\n`;
        markdown += `**Scan Date:** ${new Date(report.timestamp).toLocaleString()}\n`;
        markdown += `**Target:** ${report.target.original}\n`;
        markdown += `**Duration:** ${report.duration}ms\n`;
        markdown += `**Status:** ${report.status}\n\n`;
        markdown += '## Executive Summary\n\n';
        markdown += this._generateExecutiveSummary(report);
        markdown += '\n\n';
        if (report.results?.dns || report.results?.certificate) {
            markdown += '## Infrastructure\n\n';
            if (report.results.dns) {
                markdown += this._generateDnsSection(report.results.dns);
            }
            if (report.results.certificate) {
                markdown += this._generateCertificateSection(report.results.certificate);
            }
            if (report.results.latency) {
                markdown += this._generateLatencySection(report.results.latency);
            }
            markdown += '\n';
        }
        if (report.results?.ports || report.results?.subdomains || report.results?.webDiscovery) {
            markdown += '## Attack Surface\n\n';
            if (report.results.ports) {
                markdown += this._generatePortsSection(report.results.ports);
            }
            if (report.results.subdomains) {
                markdown += this._generateSubdomainsSection(report.results.subdomains);
            }
            if (report.results.webDiscovery) {
                markdown += this._generateWebDiscoverySection(report.results.webDiscovery);
            }
            markdown += '\n';
        }
        if (report.results?.fingerprint || report.results?.http) {
            markdown += '## Technologies\n\n';
            if (report.results.http) {
                markdown += this._generateHttpSection(report.results.http);
            }
            if (report.results.fingerprint) {
                markdown += this._generateFingerprintSection(report.results.fingerprint);
            }
            markdown += '\n';
        }
        if (report.results?.tlsAudit || report.results?.vulnerability) {
            markdown += '## Security\n\n';
            if (report.results.tlsAudit) {
                markdown += this._generateTlsAuditSection(report.results.tlsAudit);
            }
            if (report.results.vulnerability) {
                markdown += this._generateVulnerabilitySection(report.results.vulnerability);
            }
            markdown += '\n';
        }
        if (report.results?.screenshot) {
            markdown += '## Visual Reconnaissance\n\n';
            markdown += this._generateScreenshotSection(report.results.screenshot);
            markdown += '\n';
        }
        if (report.results?.osint) {
            markdown += '## OSINT\n\n';
            markdown += this._generateOsintSection(report.results.osint);
            markdown += '\n';
        }
        return markdown;
    }
    static _generateExecutiveSummary(report) {
        const summary = [];
        const results = report.results || {};
        const openPorts = results.ports?.openPorts?.length || 0;
        const subdomains = results.subdomains?.total || 0;
        const technologies = results.fingerprint?.technologies?.length || 0;
        summary.push(`- **Open Ports:** ${openPorts}`);
        summary.push(`- **Subdomains:** ${subdomains}`);
        summary.push(`- **Technologies Detected:** ${technologies}`);
        if (results.certificate) {
            summary.push(`- **Certificate:** ${results.certificate.issuer?.O || 'Unknown'}`);
        }
        return summary.join('\n');
    }
    static _generateDnsSection(dns) {
        let section = '### DNS Records\n\n';
        if (dns.records?.A?.length) {
            section += `**IPv4 Addresses (A):**\n\`\`\`\n${dns.records.A.join('\n')}\n\`\`\`\n\n`;
        }
        if (dns.records?.AAAA?.length) {
            section += `**IPv6 Addresses (AAAA):**\n\`\`\`\n${dns.records.AAAA.join('\n')}\n\`\`\`\n\n`;
        }
        if (dns.records?.NS?.length) {
            section += `**Nameservers (NS):**\n\`\`\`\n${dns.records.NS.join('\n')}\n\`\`\`\n\n`;
        }
        if (dns.records?.MX?.length) {
            section += `**Mail Servers (MX):**\n\`\`\`\n${dns.records.MX.map(mx => `${mx.priority} ${mx.exchange}`).join('\n')}\n\`\`\`\n\n`;
        }
        if (dns.records?.TXT?.length) {
            section += `**TXT Records:**\n\`\`\`\n${dns.records.TXT.join('\n')}\n\`\`\`\n\n`;
        }
        return section;
    }
    static _generateCertificateSection(cert) {
        let section = '### TLS Certificate\n\n';
        section += `- **Subject:** ${JSON.stringify(cert.subject)}\n`;
        section += `- **Issuer:** ${JSON.stringify(cert.issuer)}\n`;
        section += `- **Valid From:** ${cert.validFrom}\n`;
        section += `- **Valid To:** ${cert.validTo}\n`;
        section += `- **Fingerprint:** \`${cert.fingerprint}\`\n`;
        if (cert.subjectAltName?.length) {
            section += `- **SANs:** ${cert.subjectAltName.join(', ')}\n`;
        }
        section += '\n';
        return section;
    }
    static _generateLatencySection(latency) {
        let section = '### Network Latency\n\n';
        if (latency.ping) {
            section += `**Ping:**\n`;
            section += `- Min: ${latency.ping.min}ms\n`;
            section += `- Avg: ${latency.ping.avg}ms\n`;
            section += `- Max: ${latency.ping.max}ms\n`;
            section += `- Packet Loss: ${latency.ping.packetLoss}%\n\n`;
        }
        if (latency.traceroute?.hops?.length) {
            section += `**Traceroute:** ${latency.traceroute.hops.length} hops\n\n`;
        }
        return section;
    }
    static _generatePortsSection(ports) {
        let section = '### Open Ports\n\n';
        if (ports.openPorts?.length) {
            section += `**Total:** ${ports.openPorts.length}\n\n`;
            section += '| Port | Protocol | Service | State |\n';
            section += '|------|----------|---------|-------|\n';
            ports.openPorts.forEach(port => {
                section += `| ${port.port} | ${port.protocol || 'tcp'} | ${port.service || '-'} | ${port.state || 'open'} |\n`;
            });
            section += '\n';
        }
        else {
            section += '*No open ports detected*\n\n';
        }
        if (ports.scanners) {
            section += `**Scanners Used:** ${Object.keys(ports.scanners).join(', ')}\n\n`;
        }
        return section;
    }
    static _generateSubdomainsSection(subdomains) {
        let section = '### Subdomains\n\n';
        section += `**Total:** ${subdomains.total}\n\n`;
        if (subdomains.list?.length) {
            const displayCount = Math.min(50, subdomains.list.length);
            section += '```\n';
            section += subdomains.list.slice(0, displayCount).join('\n');
            if (subdomains.list.length > displayCount) {
                section += `\n... (${subdomains.list.length - displayCount} more)`;
            }
            section += '\n```\n\n';
        }
        if (subdomains.sources) {
            section += `**Sources:** ${Object.keys(subdomains.sources).join(', ')}\n\n`;
        }
        return section;
    }
    static _generateWebDiscoverySection(web) {
        let section = '### Discovered Paths\n\n';
        const allPaths = new Set();
        Object.values(web.tools || {}).forEach(tool => {
            if (tool.status === 'ok' && tool.paths) {
                tool.paths.forEach(path => allPaths.add(path));
            }
        });
        if (allPaths.size > 0) {
            section += `**Total:** ${allPaths.size}\n\n`;
            const displayCount = Math.min(30, allPaths.size);
            section += '```\n';
            section += Array.from(allPaths).slice(0, displayCount).join('\n');
            if (allPaths.size > displayCount) {
                section += `\n... (${allPaths.size - displayCount} more)`;
            }
            section += '\n```\n\n';
        }
        else {
            section += '*No paths discovered*\n\n';
        }
        if (web.tools) {
            section += `**Tools Used:** ${Object.keys(web.tools).join(', ')}\n\n`;
        }
        return section;
    }
    static _generateHttpSection(http) {
        let section = '### HTTP Headers\n\n';
        if (http.headers?.server) {
            section += `- **Server:** ${http.headers.server}\n`;
        }
        if (http.headers?.['x-powered-by']) {
            section += `- **Powered By:** ${http.headers['x-powered-by']}\n`;
        }
        if (http.headers) {
            const securityHeaders = [
                'strict-transport-security',
                'content-security-policy',
                'x-frame-options',
                'x-content-type-options',
                'x-xss-protection'
            ];
            const found = securityHeaders.filter(h => http.headers[h]);
            if (found.length > 0) {
                section += `- **Security Headers:** ${found.length}/${securityHeaders.length}\n`;
            }
        }
        section += '\n';
        return section;
    }
    static _generateFingerprintSection(fingerprint) {
        let section = '### Technology Fingerprint\n\n';
        if (fingerprint.technologies?.length) {
            section += `**Detected Technologies:**\n`;
            fingerprint.technologies.forEach(tech => {
                section += `- ${tech}\n`;
            });
            section += '\n';
        }
        if (fingerprint.cms) {
            section += `**CMS:** ${fingerprint.cms}\n\n`;
        }
        if (fingerprint.frameworks?.length) {
            section += `**Frameworks:** ${fingerprint.frameworks.join(', ')}\n\n`;
        }
        return section;
    }
    static _generateTlsAuditSection(tls) {
        let section = '### TLS/SSL Audit\n\n';
        if (tls.grade) {
            section += `**Grade:** ${tls.grade}\n\n`;
        }
        if (tls.tools) {
            section += `**Tools Used:** ${Object.keys(tls.tools).join(', ')}\n\n`;
        }
        return section;
    }
    static _generateVulnerabilitySection(vuln) {
        let section = '### Vulnerabilities\n\n';
        let totalVulns = 0;
        Object.entries(vuln.tools || {}).forEach(([_tool, result]) => {
            if (result.status === 'ok' && result.vulnerabilities) {
                totalVulns += result.vulnerabilities.length;
            }
        });
        if (totalVulns > 0) {
            section += `**Total Vulnerabilities:** ${totalVulns}\n\n`;
        }
        else {
            section += '*No vulnerabilities detected*\n\n';
        }
        if (vuln.tools) {
            section += `**Scanners Used:** ${Object.keys(vuln.tools).join(', ')}\n\n`;
        }
        return section;
    }
    static _generateScreenshotSection(screenshot) {
        let section = '### Screenshots\n\n';
        Object.entries(screenshot.tools || {}).forEach(([tool, result]) => {
            if (result.status === 'ok' && result.outputDir) {
                section += `- **${tool}:** \`${result.outputDir}\`\n`;
            }
        });
        section += '\n';
        return section;
    }
    static _generateOsintSection(osint) {
        let section = '### OSINT Data\n\n';
        if (osint.tools) {
            section += `**Tools Used:** ${Object.keys(osint.tools).join(', ')}\n\n`;
        }
        return section;
    }
    static generateJSON(report) {
        return JSON.stringify(report, null, 2);
    }
    static generateHTML(report) {
        const markdown = this.generateMarkdown(report);
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recon Report: ${report.target.host}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 900px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; border-bottom: 2px solid #ecf0f1; padding-bottom: 8px; margin-top: 30px; }
    h3 { color: #7f8c8d; margin-top: 20px; }
    code { background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #3498db; color: white; }
    tr:nth-child(even) { background: #f8f9fa; }
  </style>
</head>
<body>
  <pre>${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body>
</html>
    `.trim();
        return html;
    }
    static generateExecutiveSummary(report) {
        const summary = {
            target: report.target.host,
            scanDate: report.timestamp,
            status: report.status,
            duration: report.duration,
            findings: {
                openPorts: report.results?.ports?.openPorts?.length || 0,
                subdomains: report.results?.subdomains?.total || 0,
                technologies: report.results?.fingerprint?.technologies?.length || 0,
                vulnerabilities: this._countVulnerabilities(report.results?.vulnerability)
            },
            riskLevel: this._calculateRiskLevel(report),
            recommendations: this._generateRecommendations(report)
        };
        return summary;
    }
    static _countVulnerabilities(vulnData) {
        if (!vulnData)
            return 0;
        let count = 0;
        Object.values(vulnData.tools || {}).forEach(tool => {
            if (tool.status === 'ok' && tool.vulnerabilities) {
                count += tool.vulnerabilities.length;
            }
        });
        return count;
    }
    static _calculateRiskLevel(report) {
        const openPorts = report.results?.ports?.openPorts?.length || 0;
        const vulns = this._countVulnerabilities(report.results?.vulnerability);
        if (vulns > 5 || openPorts > 20)
            return 'high';
        if (vulns > 0 || openPorts > 10)
            return 'medium';
        return 'low';
    }
    static _generateRecommendations(report) {
        const recommendations = [];
        const openPorts = report.results?.ports?.openPorts?.length || 0;
        if (openPorts > 10) {
            recommendations.push('Review and close unnecessary open ports');
        }
        const vulns = this._countVulnerabilities(report.results?.vulnerability);
        if (vulns > 0) {
            recommendations.push('Address identified vulnerabilities immediately');
        }
        const hasHSTS = report.results?.http?.headers?.['strict-transport-security'];
        if (!hasHSTS) {
            recommendations.push('Enable HSTS (HTTP Strict Transport Security)');
        }
        return recommendations;
    }
}
//# sourceMappingURL=report-generator.js.map