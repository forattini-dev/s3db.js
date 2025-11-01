#!/usr/bin/env node
/**
 * Generate real reconnaissance examples using github.com as target
 *
 * Usage: node generate-examples.js
 *
 * This script runs actual scans against github.com and saves the results
 * as example files for documentation purposes.
 */

import { Database } from '../../../../src/index.js';
import { ReconPlugin } from '../../../../src/plugins/recon/index.js';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to remove circular references and clean data
function cleanForJson(obj) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (key === 'raw' && typeof value === 'object' && value !== null) {
      // Skip circular references in raw certificate data
      if (value.issuerCertificate) {
        const { issuerCertificate, ...rest } = value;
        return rest;
      }
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  }));
}

async function generateExamples() {
  console.log('🔍 Generating ReconPlugin examples using github.com...\n');

  // Initialize database without connecting (we only need the plugin, not storage)
  const db = new Database({
    connectionString: 's3://test:test@localhost:9000/recon-examples',
    passphrase: 'example-passphrase'
  });

  // Skip connection - we don't need storage for this example
  // await db.connect();

  // Initialize ReconPlugin with basic features (no external tools)
  const plugin = new ReconPlugin({
    namespace: 'examples',
    features: {
      dns: true,
      certificate: true,
      whois: true,
      http: { curl: true },
      latency: { ping: true, traceroute: false },
      ports: { nmap: false, masscan: false },
      subdomains: { amass: false, subfinder: false, assetfinder: false, crtsh: true },
      web: false,
      vulnerability: false,
      tlsAudit: { openssl: false, sslyze: false, testssl: false },
      fingerprint: false,
      screenshots: false,
      osint: false
    },
    storage: { enabled: false },
    resources: { persist: false }
  });

  // Manually attach plugin to database
  plugin.database = db;
  plugin.initialize();

  // Example 1: Full scan report
  console.log('📋 Example 1: Full scan report...');
  const fullReport = await plugin.scan('github.com');
  await writeFile(
    join(__dirname, '01-full-report.json'),
    JSON.stringify(cleanForJson(fullReport), null, 2)
  );
  console.log('   ✅ Saved: 01-full-report.json\n');

  // Example 2: DNS results only
  console.log('📋 Example 2: DNS stage results...');
  await writeFile(
    join(__dirname, '02-dns-stage.json'),
    JSON.stringify(cleanForJson(fullReport.results.dns), null, 2)
  );
  console.log('   ✅ Saved: 02-dns-stage.json\n');

  // Example 3: Certificate results
  console.log('📋 Example 3: Certificate stage results...');
  await writeFile(
    join(__dirname, '03-certificate-stage.json'),
    JSON.stringify(cleanForJson(fullReport.results.certificate), null, 2)
  );
  console.log('   ✅ Saved: 03-certificate-stage.json\n');

  // Example 4: WHOIS results
  console.log('📋 Example 4: WHOIS stage results...');
  await writeFile(
    join(__dirname, '04-whois-stage.json'),
    JSON.stringify(cleanForJson(fullReport.results.whois), null, 2)
  );
  console.log('   ✅ Saved: 04-whois-stage.json\n');

  // Example 5: HTTP results
  console.log('📋 Example 5: HTTP stage results...');
  await writeFile(
    join(__dirname, '05-http-stage.json'),
    JSON.stringify(cleanForJson(fullReport.results.http), null, 2)
  );
  console.log('   ✅ Saved: 05-http-stage.json\n');

  // Example 6: Latency results
  console.log('📋 Example 6: Latency stage results...');
  await writeFile(
    join(__dirname, '06-latency-stage.json'),
    JSON.stringify(cleanForJson(fullReport.results.latency), null, 2)
  );
  console.log('   ✅ Saved: 06-latency-stage.json\n');

  // Example 7: Subdomain results (crt.sh)
  console.log('📋 Example 7: Subdomain stage results...');
  await writeFile(
    join(__dirname, '07-subdomains-stage.json'),
    JSON.stringify(cleanForJson(fullReport.results.subdomains), null, 2)
  );
  console.log('   ✅ Saved: 07-subdomains-stage.json\n');

  // Example 8: Fingerprint (consolidated)
  console.log('📋 Example 8: Fingerprint (consolidated view)...');
  await writeFile(
    join(__dirname, '08-fingerprint.json'),
    JSON.stringify(cleanForJson(fullReport.fingerprint), null, 2)
  );
  console.log('   ✅ Saved: 08-fingerprint.json\n');

  // await db.disconnect(); // Skip since we didn't connect

  console.log('✅ All examples generated successfully!\n');
  console.log('📁 Location: docs/plugins/recon/examples/\n');
  console.log('Target: github.com');
  console.log(`Generated at: ${new Date().toISOString()}`);
}

generateExamples().catch(console.error);
