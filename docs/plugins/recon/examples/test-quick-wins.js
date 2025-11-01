/**
 * Test Quick Wins Implementation
 *
 * Tests:
 * - Secrets Stage (Gitleaks + regex patterns)
 * - Subdomain Takeover Detection
 */

import { Database } from '../../../../src/database.class.js';
import { ReconPlugin } from '../../../../src/plugins/recon/index.js';

async function testSecretsStage() {
  console.log('\n🔍 Testing Secrets Stage...\n');

  const db = new Database({
    connectionString: 's3://test:test@localhost:9000/test-recon',
    passphrase: 'test-passphrase'
  });

  const plugin = new ReconPlugin({
    storage: { enabled: false },
    features: {
      dns: false,
      certificate: false,
      whois: false,
      http: false,
      latency: false,
      subdomains: false,
      ports: false,
      secrets: {
        gitleaks: true,
        patterns: true,
        maxUrls: 5
      }
    }
  });

  plugin.database = db;
  await plugin.initialize();

  const target = {
    host: 'github.com',
    protocol: 'https'
  };

  try {
    const result = await plugin.stages.secrets.execute(target, {
      gitleaks: true,
      patterns: true,
      maxUrls: 5
    });

    console.log('✅ Secrets Stage Result:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Total Findings: ${result.summary.total}`);
    console.log(`   High Severity: ${result.summary.highSeverity}`);
    console.log(`   Medium Severity: ${result.summary.mediumSeverity}`);
    console.log(`   Low Severity: ${result.summary.lowSeverity}`);
    console.log(`   Scanners Used: ${Object.keys(result.scanners).join(', ')}`);

    if (result.findings.length > 0) {
      console.log('\n   Sample Finding:');
      const sample = result.findings[0];
      console.log(`   - Type: ${sample.type}`);
      console.log(`   - Severity: ${sample.severity}`);
      console.log(`   - Location: ${sample.location}`);
      console.log(`   - Scanner: ${sample.scanner}`);
    }

    return result;
  } catch (error) {
    console.error('❌ Secrets Stage Failed:', error.message);
    throw error;
  }
}

async function testSubdomainTakeover() {
  console.log('\n🔍 Testing Subdomain Takeover Detection...\n');

  const db = new Database({
    connectionString: 's3://test:test@localhost:9000/test-recon',
    passphrase: 'test-passphrase'
  });

  const plugin = new ReconPlugin({
    storage: { enabled: false },
    features: {
      dns: false,
      certificate: false,
      whois: false,
      http: false,
      latency: false,
      subdomains: {
        amass: false,
        subfinder: false,
        assetfinder: false,
        crtsh: true,
        checkTakeover: true,
        maxSubdomains: 20
      },
      ports: false,
      secrets: false
    }
  });

  plugin.database = db;
  await plugin.initialize();

  const target = {
    host: 'github.com',
    protocol: 'https'
  };

  try {
    const result = await plugin.stages.subdomains.execute(target, {
      amass: false,
      subfinder: false,
      assetfinder: false,
      crtsh: true,
      checkTakeover: true,
      maxSubdomains: 10
    });

    console.log('✅ Subdomain Takeover Result:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Total Subdomains: ${result.total}`);

    if (result.takeover) {
      console.log(`   Takeover Status: ${result.takeover.status}`);
      console.log(`   Subdomains Checked: ${result.takeover.checked}`);
      console.log(`   Vulnerable: ${result.takeover.vulnerable.length}`);

      if (result.takeover.vulnerable.length > 0) {
        console.log('\n   ⚠️  Vulnerable Subdomains:');
        result.takeover.vulnerable.forEach((vuln, i) => {
          console.log(`   ${i + 1}. ${vuln.subdomain}`);
          console.log(`      Provider: ${vuln.provider}`);
          console.log(`      CNAME: ${vuln.cname}`);
          console.log(`      Severity: ${vuln.severity}`);
          console.log(`      Evidence: ${vuln.evidence}`);
        });
      }

      if (result.takeover.errors.length > 0) {
        console.log(`\n   Errors: ${result.takeover.errors.length}`);
      }
    }

    // Show sample subdomains
    if (result.list.length > 0) {
      console.log(`\n   Sample Subdomains (first 5):`);
      result.list.slice(0, 5).forEach((sub, i) => {
        console.log(`   ${i + 1}. ${sub}`);
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Subdomain Takeover Failed:', error.message);
    throw error;
  }
}

async function testBehaviorPresets() {
  console.log('\n🔍 Testing Behavior Presets Configuration...\n');

  const db = new Database({
    connectionString: 's3://test:test@localhost:9000/test-recon',
    passphrase: 'test-passphrase'
  });

  const presets = ['passive', 'stealth', 'aggressive'];

  for (const preset of presets) {
    const plugin = new ReconPlugin({
      storage: { enabled: false },
      behavior: preset
    });

    plugin.database = db;
    await plugin.initialize();

    const secretsConfig = plugin.config.features.secrets;
    const subdomainsConfig = plugin.config.features.subdomains;

    console.log(`✅ ${preset.toUpperCase()} Preset:`);
    console.log(`   Secrets - gitleaks: ${secretsConfig.gitleaks}, patterns: ${secretsConfig.patterns}, maxUrls: ${secretsConfig.maxUrls}`);
    console.log(`   Subdomains - checkTakeover: ${subdomainsConfig.checkTakeover}, maxSubdomains: ${subdomainsConfig.maxSubdomains}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTING QUICK WINS IMPLEMENTATION');
  console.log('='.repeat(60));

  try {
    // Test 1: Secrets Stage
    await testSecretsStage();

    // Test 2: Subdomain Takeover Detection
    await testSubdomainTakeover();

    // Test 3: Behavior Presets
    await testBehaviorPresets();

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ TESTS FAILED');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

main();
