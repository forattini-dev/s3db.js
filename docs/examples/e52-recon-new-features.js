/**
 * Example 52: ReconPlugin New Features Demo
 *
 * Demonstrates ONLY the new features added in v2.0:
 * - ASN Lookup (iptoasn + hackertarget)
 * - DNSDumpster (DNS intelligence)
 * - Google Dorks (search engine intelligence)
 * - Security Audit Checklist
 * - Artifact persistence
 *
 * Target: github.com (public reconnaissance)
 * No external tools required (dig, curl, fetch only)
 */

import { ReconPlugin } from '../../src/plugins/recon/index.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🔍 ReconPlugin - New Features Demo');
  console.log('Target: github.com');
  console.log('Features: ASN + DNSDumpster + Google Dorks + Security Audit\n');

  // Initialize ReconPlugin with filesystem storage (no database required)
  const storagePath = path.join(process.cwd(), 'docs/examples/recon-storage');

  const reconPlugin = new ReconPlugin({
    behavior: 'passive', // Minimal, non-intrusive

    // Enable ONLY new features for demonstration
    features: {
      // NEW: ASN Lookup
      asn: {
        iptoasn: true,
        hackertarget: true
      },

      // NEW: DNSDumpster
      dnsdumpster: {
        enabled: true,
        fallbackToDig: true
      },

      // NEW: Google Dorks
      googleDorks: {
        enabled: true,
        maxResults: 3, // Limited for demo
        categories: ['subdomains', 'documents']
      },

      // Minimal base requirements (need for security audit)
      dns: true,
      certificate: true,
      http: true,
      latency: { ping: false }
    },

    storage: {
      // NEW: Use filesystem driver for artifact persistence
      driver: 'filesystem',
      config: {
        basePath: storagePath
      },
      enabled: true,
      persistRawOutput: true // Keep raw output
    }
  });

  await reconPlugin.initialize();

  console.log('⏳ Starting scan...\n');
  const startTime = Date.now();

  try {
    const report = await reconPlugin.scan('github.com', {
      persist: true // Enable filesystem persistence
    });
    const duration = Date.now() - startTime;

    console.log(`\n✅ Scan completed in ${(duration / 1000).toFixed(2)}s\n`);

    // ========================================
    // ASN RESULTS
    // ========================================
    console.log('🌐 ASN LOOKUP RESULTS');
    console.log('─'.repeat(60));

    if (report.results.asn) {
      const asn = report.results.asn;
      console.log(`Status: ${asn.status}`);
      console.log(`IPs Resolved: ${asn.ipAddresses?.length || 0}`);

      if (asn.ipAddresses?.length > 0) {
        console.log(`\nIP Addresses:`);
        asn.ipAddresses.forEach(ip => console.log(`  - ${ip}`));
      }

      console.log(`\nASNs Discovered: ${asn.asns?.length || 0}`);
      if (asn.asns?.length > 0) {
        asn.asns.forEach(asnData => {
          console.log(`\n  ASN ${asnData.asn}:`);
          console.log(`    Organization: ${asnData.organization || 'Unknown'}`);
          console.log(`    Country: ${asnData.country || 'Unknown'}`);
          console.log(`    Network: ${asnData.network || 'Unknown'}`);
          console.log(`    Source: ${asnData._source || 'Unknown'}`);
        });
      }

      console.log(`\nOrganizations: ${asn.organizations?.join(', ') || 'None'}`);

      // Individual tool results
      if (asn._individual) {
        console.log(`\nIndividual Tool Results:`);
        console.log(`  iptoasn: ${asn._individual.iptoasn?.status} (${asn._individual.iptoasn?.results?.length || 0} results)`);
        console.log(`  hackertarget: ${asn._individual.hackertarget?.status} (${asn._individual.hackertarget?.results?.length || 0} results)`);
        console.log(`  dig: ${asn._individual.dig?.status} (IPv4: ${asn._individual.dig?.ipv4?.length || 0}, IPv6: ${asn._individual.dig?.ipv6?.length || 0})`);
      }
    } else {
      console.log('NOT EXECUTED');
    }

    // ========================================
    // DNSDUMPSTER RESULTS
    // ========================================
    console.log('\n\n📡 DNSDUMPSTER RESULTS');
    console.log('─'.repeat(60));

    if (report.results.dnsdumpster) {
      const dns = report.results.dnsdumpster;
      console.log(`Status: ${dns.status}`);

      if (dns.dnsRecords) {
        console.log(`\nDNS Records:`);
        console.log(`  A (IPv4): ${dns.dnsRecords.A?.length || 0}`);
        console.log(`  AAAA (IPv6): ${dns.dnsRecords.AAAA?.length || 0}`);
        console.log(`  MX (Mail): ${dns.dnsRecords.MX?.length || 0}`);
        console.log(`  TXT (Text): ${dns.dnsRecords.TXT?.length || 0}`);
        console.log(`  NS (Nameserver): ${dns.dnsRecords.NS?.length || 0}`);

        if (dns.dnsRecords.MX?.length > 0) {
          console.log(`\nMail Servers:`);
          dns.dnsRecords.MX.slice(0, 3).forEach(mx => {
            console.log(`  - ${mx.hostname} (priority: ${mx.priority})`);
          });
        }

        if (dns.dnsRecords.NS?.length > 0) {
          console.log(`\nNameservers:`);
          dns.dnsRecords.NS.forEach(ns => {
            console.log(`  - ${ns.hostname}`);
          });
        }
      }

      console.log(`\nSubdomains Found: ${dns.subdomains?.length || 0}`);
      if (dns.subdomains?.length > 0) {
        console.log(`Sample subdomains:`);
        dns.subdomains.slice(0, 5).forEach(sub => {
          console.log(`  - ${sub}`);
        });
        if (dns.subdomains.length > 5) {
          console.log(`  ... and ${dns.subdomains.length - 5} more`);
        }
      }

      // Individual tool results
      if (dns._individual) {
        console.log(`\nIndividual Tool Results:`);
        console.log(`  dnsdumpster: ${dns._individual.dnsdumpster?.status}`);
        console.log(`  dig (fallback): ${dns._individual.dig?.status}`);
      }
    } else {
      console.log('NOT EXECUTED');
    }

    // ========================================
    // GOOGLE DORKS RESULTS
    // ========================================
    console.log('\n\n🔍 GOOGLE DORKS RESULTS');
    console.log('─'.repeat(60));

    if (report.results.googleDorks) {
      const dorks = report.results.googleDorks;
      console.log(`Status: ${dorks.status}`);
      console.log(`Domain: ${dorks.domain}`);
      console.log(`Company: ${dorks.companyName || 'N/A'}`);
      console.log(`\nTotal Results: ${dorks.summary?.totalResults || 0}`);
      console.log(`Categories Searched: ${dorks.summary?.totalCategories || 0}`);

      if (dorks.categories) {
        console.log(`\nCategory Breakdown:`);
        for (const [category, data] of Object.entries(dorks.categories)) {
          if (data && data.status === 'ok') {
            console.log(`\n  ${category}:`);
            console.log(`    Status: ${data.status}`);
            console.log(`    Results: ${data.results?.length || 0}`);

            if (data.results?.length > 0) {
              console.log(`    Sample URLs:`);
              data.results.slice(0, 2).forEach(result => {
                console.log(`      - ${result.url}`);
                console.log(`        Query: ${result.query}`);
              });
            }
          }
        }
      }

      // Individual category results
      if (dorks._individual) {
        console.log(`\nIndividual Categories:`);
        for (const [category, data] of Object.entries(dorks._individual)) {
          console.log(`  ${category}: ${data.status} (${data.results?.length || 0} results)`);
        }
      }
    } else {
      console.log('NOT EXECUTED');
    }

    // ========================================
    // SECURITY AUDIT
    // ========================================
    console.log('\n\n🛡️  SECURITY AUDIT');
    console.log('─'.repeat(60));

    const audit = reconPlugin.generateSecurityAudit(report);

    console.log(`Score: ${audit.summary.score}/100`);
    console.log(`Grade: ${audit.summary.grade}`);
    console.log(`\nChecks:`);
    console.log(`  Total: ${audit.summary.total}`);
    console.log(`  Passed: ${audit.summary.passed}`);
    console.log(`  Failed: ${audit.summary.failed}`);
    console.log(`\nIssues:`);
    console.log(`  Critical: ${audit.summary.critical}`);
    console.log(`  High: ${audit.summary.high}`);
    console.log(`  Medium: ${audit.summary.medium}`);
    console.log(`  Low: ${audit.summary.low}`);

    if (audit.recommendations?.length > 0) {
      console.log(`\nTop Recommendations:`);
      audit.recommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`\n  ${i + 1}. [${rec.severity}] ${rec.item}`);
        console.log(`     ${rec.action}`);
      });
    }

    // ========================================
    // SAVE ARTIFACTS
    // ========================================
    console.log('\n\n💾 SAVING ARTIFACTS');
    console.log('─'.repeat(60));

    const artifactsDir = path.join(process.cwd(), 'docs/examples/recon-artifacts');

    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true});
    }

    // JSON replacer to handle circular references (e.g., in certificates)
    const seen = new WeakSet();
    const jsonReplacer = (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };

    // Save full report
    fs.writeFileSync(
      path.join(artifactsDir, 'github-full-report.json'),
      JSON.stringify(report, jsonReplacer, 2)
    );
    console.log('✓ Full report saved');

    // Save ASN results
    if (report.results.asn) {
      fs.writeFileSync(
        path.join(artifactsDir, 'github-asn-aggregated.json'),
        JSON.stringify(report.results.asn._aggregated || report.results.asn, null, 2)
      );
      console.log('✓ ASN aggregated results saved');

      if (report.results.asn._individual) {
        fs.writeFileSync(
          path.join(artifactsDir, 'github-asn-individual.json'),
          JSON.stringify(report.results.asn._individual, null, 2)
        );
        console.log('✓ ASN individual tools saved');
      }
    }

    // Save DNSDumpster results
    if (report.results.dnsdumpster) {
      fs.writeFileSync(
        path.join(artifactsDir, 'github-dnsdumpster-aggregated.json'),
        JSON.stringify(report.results.dnsdumpster._aggregated || report.results.dnsdumpster, null, 2)
      );
      console.log('✓ DNSDumpster aggregated results saved');

      if (report.results.dnsdumpster._individual) {
        fs.writeFileSync(
          path.join(artifactsDir, 'github-dnsdumpster-individual.json'),
          JSON.stringify(report.results.dnsdumpster._individual, null, 2)
        );
        console.log('✓ DNSDumpster individual tools saved');
      }
    }

    // Save Google Dorks results
    if (report.results.googleDorks) {
      fs.writeFileSync(
        path.join(artifactsDir, 'github-googledorks-aggregated.json'),
        JSON.stringify(report.results.googleDorks._aggregated || report.results.googleDorks, null, 2)
      );
      console.log('✓ Google Dorks aggregated results saved');

      if (report.results.googleDorks._individual) {
        fs.writeFileSync(
          path.join(artifactsDir, 'github-googledorks-individual.json'),
          JSON.stringify(report.results.googleDorks._individual, null, 2)
        );
        console.log('✓ Google Dorks individual categories saved');
      }
    }

    // Save security audit
    fs.writeFileSync(
      path.join(artifactsDir, 'github-security-audit.json'),
      JSON.stringify(audit, null, 2)
    );
    console.log('✓ Security audit (JSON) saved');

    const auditMd = reconPlugin.generateSecurityAuditMarkdown(report);
    fs.writeFileSync(
      path.join(artifactsDir, 'github-security-audit.md'),
      auditMd
    );
    console.log('✓ Security audit (Markdown) saved');

    console.log(`\n✅ All artifacts saved to: ${artifactsDir}/\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
