/**
 * Example 51: Complete ReconPlugin Scan with All New Features
 *
 * Demonstrates:
 * - Infrastructure tools (ASN, DNSDumpster, massdns)
 * - OSINT expansion (SaaS detection, WhatsMyName, Scylla, Google Dorks)
 * - Security audit checklist
 * - Artifact persistence (3-layer storage)
 * - Aggregated reports
 *
 * Target: github.com (public reconnaissance)
 */

import { ReconPlugin } from '../../src/plugins/recon/index.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🔍 ReconPlugin - Complete Scan Example');
  console.log('Target: github.com');
  console.log('Behavior: Stealth (rate-limited, respectful)\n');

  // Initialize ReconPlugin WITHOUT database (standalone mode)
  // This allows running without MinIO/S3
  const reconPlugin = new ReconPlugin({
    behavior: 'stealth',

    // Enable all new features
    features: {
      // Infrastructure
      asn: {
        iptoasn: true,
        hackertarget: true
      },
      dnsdumpster: {
        enabled: true,
        fallbackToDig: true
      },

      // Note: massdns requires wordlist - disabled for this example
      // massdns: {
      //   enabled: true,
      //   wordlist: '/usr/share/wordlists/subdomains.txt',
      //   rate: 1000,
      //   maxSubdomains: 1000
      // },

      // OSINT
      osint: {
        usernames: false, // Skip username enumeration for GitHub itself
        whatsmyname: false,
        emails: true,
        leaks: true,
        hibp: true,
        scylla: false, // Disabled to avoid rate limits
        github: false, // Skip GitHub search for GitHub.com
        saas: true // SaaS footprint detection
      },

      // Google Dorks
      googleDorks: {
        enabled: true,
        maxResults: 5, // Limited for stealth
        categories: ['documents', 'subdomains', 'loginPages']
      },

      // Standard reconnaissance
      dns: true,
      certificate: true,
      whois: true,
      http: true,
      latency: { ping: true },
      subdomains: {
        subfinder: true,
        crtsh: true,
        amass: false // Too slow for example
      },
      ports: {
        nmap: true,
        topPorts: 10 // Limited for stealth
      },
      tlsAudit: {
        openssl: true,
        sslscan: false, // Disabled for speed
        sslyze: false
      }
    },

    // Storage configuration (disabled - no database)
    storage: {
      persist: false,
      persistRawOutput: true, // Save raw CLI output in memory
      historyLimit: 5
    }
  });

  await reconPlugin.initialize();

  console.log('⏳ Starting comprehensive scan...\n');
  const startTime = Date.now();

  try {
    // Run complete scan
    const report = await reconPlugin.scan('github.com', {
      persist: true // Save to all 3 storage layers
    });

    const duration = Date.now() - startTime;

    console.log('\n✅ Scan completed successfully!');
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s\n`);

    // Display summary
    console.log('📊 SCAN SUMMARY');
    console.log('─'.repeat(50));
    console.log(`Target: ${report.target.host}`);
    console.log(`Status: ${report.status}`);
    console.log(`Started: ${report.startedAt}`);
    console.log(`Ended: ${report.endedAt}`);
    console.log(`Duration: ${report.duration}ms\n`);

    // Fingerprint
    console.log('🔎 FINGERPRINT');
    console.log('─'.repeat(50));
    console.log(`Primary IP: ${report.fingerprint.primaryIp || 'N/A'}`);
    console.log(`CDN/WAF: ${report.fingerprint.cdn || 'None detected'}`);
    console.log(`Server: ${report.fingerprint.server || 'Unknown'}`);
    console.log(`Open Ports: ${report.fingerprint.openPorts?.length || 0}`);
    console.log(`Subdomains: ${report.fingerprint.subdomainCount || 0}`);
    console.log(`Technologies: ${report.fingerprint.technologies?.join(', ') || 'None detected'}\n`);

    // Results breakdown
    console.log('📋 RESULTS BREAKDOWN');
    console.log('─'.repeat(50));

    for (const [stage, data] of Object.entries(report.results || {})) {
      if (data && data.status) {
        console.log(`${stage.padEnd(20)} ${data.status}`);
      }
    }
    console.log();

    // Infrastructure results
    if (report.results.asn) {
      console.log('🌐 ASN INFORMATION');
      console.log('─'.repeat(50));
      console.log(`IPs Found: ${report.results.asn.ipAddresses?.length || 0}`);
      console.log(`ASNs Found: ${report.results.asn.asns?.length || 0}`);
      console.log(`Organizations: ${report.results.asn.organizations?.join(', ') || 'N/A'}\n`);
    }

    if (report.results.dnsdumpster) {
      console.log('📡 DNS RECORDS (DNSDumpster)');
      console.log('─'.repeat(50));
      console.log(`A Records: ${report.results.dnsdumpster.dnsRecords?.A?.length || 0}`);
      console.log(`AAAA Records: ${report.results.dnsdumpster.dnsRecords?.AAAA?.length || 0}`);
      console.log(`MX Records: ${report.results.dnsdumpster.dnsRecords?.MX?.length || 0}`);
      console.log(`TXT Records: ${report.results.dnsdumpster.dnsRecords?.TXT?.length || 0}`);
      console.log(`NS Records: ${report.results.dnsdumpster.dnsRecords?.NS?.length || 0}`);
      console.log(`Subdomains: ${report.results.dnsdumpster.subdomains?.length || 0}\n`);
    }

    // OSINT results
    if (report.results.osint) {
      console.log('🕵️  OSINT INTELLIGENCE');
      console.log('─'.repeat(50));

      if (report.results.osint.categories?.saas) {
        const saas = report.results.osint.categories.saas.services;
        console.log(`SaaS Services Detected:`);
        console.log(`  Analytics: ${saas.analytics?.length || 0}`);
        console.log(`  Chat: ${saas.chat?.length || 0}`);
        console.log(`  Monitoring: ${saas.monitoring?.length || 0}`);
        console.log(`  Email Provider: ${saas.email?.provider || 'Unknown'}`);
        console.log(`  CDN: ${saas.cdn?.provider || 'Unknown'}`);
      }

      if (report.results.osint.categories?.leaks) {
        const leaks = report.results.osint.categories.leaks;
        console.log(`\nLeak Detection:`);
        console.log(`  HIBP Breaches: ${leaks.sources?.hibp?.length || 0}`);
      }
      console.log();
    }

    // Google Dorks results
    if (report.results.googleDorks) {
      console.log('🔍 GOOGLE DORKS INTELLIGENCE');
      console.log('─'.repeat(50));
      console.log(`Total Results: ${report.results.googleDorks.summary?.totalResults || 0}`);
      console.log(`Categories Searched: ${report.results.googleDorks.summary?.totalCategories || 0}`);

      for (const [category, data] of Object.entries(report.results.googleDorks.categories || {})) {
        if (data && data.status === 'ok') {
          console.log(`  ${category}: ${data.results?.length || 0} results`);
        }
      }
      console.log();
    }

    // Generate security audit
    console.log('🛡️  SECURITY AUDIT');
    console.log('─'.repeat(50));
    const audit = reconPlugin.generateSecurityAudit(report);
    console.log(`Security Score: ${audit.summary.score}/100 (Grade: ${audit.summary.grade})`);
    console.log(`Total Checks: ${audit.summary.total}`);
    console.log(`Passed: ${audit.summary.passed}`);
    console.log(`Failed: ${audit.summary.failed}`);
    console.log(`Critical Issues: ${audit.summary.critical}`);
    console.log(`High Issues: ${audit.summary.high}`);
    console.log(`Medium Issues: ${audit.summary.medium}`);
    console.log(`Low Issues: ${audit.summary.low}\n`);

    // Save artifacts to examples directory
    const examplesDir = path.join(process.cwd(), 'docs/examples/recon-artifacts');

    if (!fs.existsSync(examplesDir)) {
      fs.mkdirSync(examplesDir, { recursive: true });
    }

    console.log('💾 SAVING ARTIFACTS');
    console.log('─'.repeat(50));

    // Save full report
    const reportPath = path.join(examplesDir, 'github-full-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`✓ Full report: ${reportPath}`);

    // Save fingerprint
    const fingerprintPath = path.join(examplesDir, 'github-fingerprint.json');
    fs.writeFileSync(fingerprintPath, JSON.stringify(report.fingerprint, null, 2));
    console.log(`✓ Fingerprint: ${fingerprintPath}`);

    // Save individual stage results
    for (const [stage, data] of Object.entries(report.results || {})) {
      if (data && typeof data === 'object') {
        const stagePath = path.join(examplesDir, `github-${stage}.json`);
        fs.writeFileSync(stagePath, JSON.stringify(data, null, 2));
        console.log(`✓ ${stage}: ${stagePath}`);
      }
    }

    // Save security audit
    const auditPath = path.join(examplesDir, 'github-security-audit.json');
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
    console.log(`✓ Security audit: ${auditPath}`);

    // Save security audit markdown
    const auditMdPath = path.join(examplesDir, 'github-security-audit.md');
    const auditMd = reconPlugin.generateSecurityAuditMarkdown(report);
    fs.writeFileSync(auditMdPath, auditMd);
    console.log(`✓ Security audit (MD): ${auditMdPath}`);

    // Save individual tool artifacts (if available)
    if (report.results.asn?._individual) {
      const asnIndividualPath = path.join(examplesDir, 'github-asn-individual.json');
      fs.writeFileSync(asnIndividualPath, JSON.stringify(report.results.asn._individual, null, 2));
      console.log(`✓ ASN individual tools: ${asnIndividualPath}`);
    }

    if (report.results.dnsdumpster?._individual) {
      const dnsIndividualPath = path.join(examplesDir, 'github-dnsdumpster-individual.json');
      fs.writeFileSync(dnsIndividualPath, JSON.stringify(report.results.dnsdumpster._individual, null, 2));
      console.log(`✓ DNSDumpster individual tools: ${dnsIndividualPath}`);
    }

    if (report.results.googleDorks?._individual) {
      const dorksIndividualPath = path.join(examplesDir, 'github-googledorks-individual.json');
      fs.writeFileSync(dorksIndividualPath, JSON.stringify(report.results.googleDorks._individual, null, 2));
      console.log(`✓ Google Dorks individual categories: ${dorksIndividualPath}`);
    }

    console.log('\n✅ All artifacts saved to: docs/examples/recon-artifacts/\n');

  } catch (error) {
    console.error('\n❌ Error during scan:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main().catch(console.error);
