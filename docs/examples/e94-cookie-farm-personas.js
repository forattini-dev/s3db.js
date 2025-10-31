/**
 * Example 94: CookieFarmPlugin - Persona Factory
 *
 * This example demonstrates how to generate, manage, and use personas
 * for professional web scraping at scale.
 *
 * A "Persona" is a complete browser identity:
 * - Cookies (farmed and aged)
 * - Proxy binding (immutable)
 * - User agent
 * - Viewport configuration
 * - Reputation score
 * - Quality rating
 */

import { Database, PuppeteerPlugin, CookieFarmPlugin } from '../../src/index.js';

async function example() {
  console.log('👥 Example 94: CookieFarmPlugin - Persona Factory\n');

  // Create database
  const db = new Database({
    connectionString: 'http://test:test@localhost:4566/bucket'
  });

  await db.connect();

  // 1. Install PuppeteerPlugin (required dependency)
  const puppeteer = new PuppeteerPlugin({
    proxy: {
      enabled: true,
      list: [
        'http://proxy1.example.com:8080',
        'http://proxy2.example.com:8080',
        'http://proxy3.example.com:8080'
      ],
      selectionStrategy: 'round-robin'
    },
    cookies: {
      enabled: true
    },
    humanBehavior: {
      enabled: true
    }
  });

  await db.installPlugin(puppeteer);

  // 2. Install CookieFarmPlugin
  const cookieFarm = new CookieFarmPlugin({
    generation: {
      count: 5, // Generate 5 personas on start
      proxies: puppeteer.config.proxy.list,
      userAgentStrategy: 'random',
      viewportStrategy: 'varied'
    },
    warmup: {
      enabled: true,
      sites: [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://www.wikipedia.org'
      ],
      sitesPerPersona: 3,
      timePerSite: { min: 5000, max: 10000 }
    },
    quality: {
      enabled: true,
      thresholds: {
        high: 0.8,
        medium: 0.5,
        low: 0
      }
    },
    rotation: {
      enabled: true,
      maxAge: 86400000, // 24 hours
      maxRequests: 100,
      retireOnFailureRate: 0.3
    }
  });

  await db.installPlugin(cookieFarm);

  // 3. Start database (auto-generates initial personas)
  await db.start();

  console.log('✅ Plugins installed and started\n');

  // Listen to events
  cookieFarm.on('cookieFarm.personaCreated', (data) => {
    console.log(`  🆕 Persona created: ${data.personaId} (proxy: ${data.proxyId || 'none'})`);
  });

  cookieFarm.on('cookieFarm.warmupCompleted', (data) => {
    console.log(`  ✅ Warmup completed: ${data.personaId}`);
  });

  cookieFarm.on('cookieFarm.personaRetired', (data) => {
    console.log(`  ♻️  Persona retired: ${data.personaId}`);
  });

  // Wait for initial generation
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Strategy 1: Get statistics
  console.log('\n📊 Strategy 1: Persona Pool Statistics');
  const stats = await cookieFarm.getStats();
  console.log(`  Total Personas: ${stats.total}`);
  console.log(`  Active: ${stats.active}`);
  console.log(`  Retired: ${stats.retired}`);
  console.log(`  Quality Distribution:`);
  console.log(`    High: ${stats.byQuality.high}`);
  console.log(`    Medium: ${stats.byQuality.medium}`);
  console.log(`    Low: ${stats.byQuality.low}`);
  console.log(`  Warmup Completed: ${stats.warmupCompleted}`);
  console.log(`  Average Quality Score: ${(stats.averageQualityScore * 100).toFixed(1)}%`);
  console.log(`  Average Success Rate: ${(stats.averageSuccessRate * 100).toFixed(1)}%`);
  console.log(`  Total Requests: ${stats.totalRequests}\n`);

  // Strategy 2: Get best persona
  console.log('📄 Strategy 2: Select Best Persona');
  const bestPersona = await cookieFarm.getPersona({
    quality: 'high',
    excludeRetired: true
  });

  if (bestPersona) {
    console.log(`  Persona ID: ${bestPersona.personaId}`);
    console.log(`  Quality Score: ${(bestPersona.quality.score * 100).toFixed(1)}%`);
    console.log(`  Quality Rating: ${bestPersona.quality.rating}`);
    console.log(`  Success Rate: ${(bestPersona.reputation.successRate * 100).toFixed(1)}%`);
    console.log(`  Total Requests: ${bestPersona.reputation.totalRequests}`);
    console.log(`  Proxy ID: ${bestPersona.proxyId || 'none'}`);
    console.log(`  Warmup: ${bestPersona.metadata.warmupCompleted ? '✅' : '❌'}\n`);
  } else {
    console.log('  No high-quality personas available yet\n');
  }

  // Strategy 3: Use persona for scraping
  console.log('📄 Strategy 3: Scrape with Persona');

  const persona = await cookieFarm.getPersona({ excludeRetired: true });

  if (persona) {
    console.log(`  Using persona: ${persona.personaId}`);

    try {
      // Navigate using persona's session (automatically uses bound proxy)
      const page = await puppeteer.navigate('https://www.example.com', {
        useSession: persona.sessionId
      });

      const title = await page.title();
      console.log(`  Page Title: ${title}`);

      // Record successful usage
      await cookieFarm.recordUsage(persona.personaId, { success: true });
      console.log(`  ✅ Usage recorded (success)\n`);

      await page.close();
    } catch (err) {
      // Record failed usage
      await cookieFarm.recordUsage(persona.personaId, { success: false });
      console.log(`  ❌ Usage recorded (failure): ${err.message}\n`);
    }
  }

  // Strategy 4: Generate more personas on demand
  console.log('📄 Strategy 4: Generate Additional Personas');
  console.log('  Generating 3 more personas...');

  const newPersonas = await cookieFarm.generatePersonas(3, {
    proxies: puppeteer.config.proxy.list,
    warmup: true
  });

  console.log(`  ✅ Generated ${newPersonas.length} new personas\n`);

  // Strategy 5: Manual warmup
  console.log('📄 Strategy 5: Manual Warmup');

  const unwarmPersona = Array.from(cookieFarm.personaPool.values())
    .find(p => !p.metadata.warmupCompleted && !p.metadata.retired);

  if (unwarmPersona) {
    console.log(`  Warming up: ${unwarmPersona.personaId}`);
    await cookieFarm.warmupPersona(unwarmPersona.personaId);
    console.log(`  ✅ Warmup completed\n`);
  } else {
    console.log(`  All personas are already warmed up\n`);
  }

  // Strategy 6: Export personas
  console.log('📄 Strategy 6: Export Personas');

  const exportedPersonas = await cookieFarm.exportPersonas({
    includeRetired: false,
    format: 'json'
  });

  console.log(`  Exported ${exportedPersonas.length} active personas`);
  console.log(`  First persona sample:`);
  console.log(`    ID: ${exportedPersonas[0].personaId}`);
  console.log(`    Quality: ${exportedPersonas[0].quality.rating}`);
  console.log(`    Requests: ${exportedPersonas[0].reputation.totalRequests}\n`);

  // Strategy 7: Retirement simulation
  console.log('📄 Strategy 7: Persona Retirement');

  const personaToRetire = Array.from(cookieFarm.personaPool.values())
    .find(p => !p.metadata.retired);

  if (personaToRetire) {
    console.log(`  Retiring persona: ${personaToRetire.personaId}`);
    await cookieFarm.retirePersona(personaToRetire.personaId);
    console.log(`  ✅ Persona retired\n`);
  }

  // Final statistics
  console.log('📊 Final Statistics');
  const finalStats = await cookieFarm.getStats();
  console.log(`  Active Personas: ${finalStats.active}`);
  console.log(`  Retired Personas: ${finalStats.retired}`);
  console.log(`  Total Requests: ${finalStats.totalRequests}\n`);

  // Cleanup
  await db.stop();
  await db.disconnect();

  console.log('✅ Example completed!\n');
  console.log('🔑 Key Concepts:');
  console.log('  1. Persona = Complete Browser Identity');
  console.log('  2. Auto-generation on plugin start');
  console.log('  3. Quality scoring (age, success rate, requests, warmup)');
  console.log('  4. Automatic retirement (age, requests, failure rate)');
  console.log('  5. Immutable proxy binding (via PuppeteerPlugin)');
  console.log('  6. Export/import for scaling');
  console.log('\n💡 Use Cases:');
  console.log('  • Large-scale web scraping');
  console.log('  • A/B testing with different fingerprints');
  console.log('  • Distributed crawling');
  console.log('  • SEO analysis');
  console.log('  • Price monitoring');
}

// Run example
example().catch(console.error);
