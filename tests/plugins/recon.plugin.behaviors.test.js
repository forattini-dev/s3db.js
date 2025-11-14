import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

import { ReconPlugin } from '#src/plugins/recon.plugin.js';

describe('ReconPlugin - Behavior Modes', () => {
  let emitSpy;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    if (emitSpy) {
      emitSpy.mockRestore();
    }
  });

  describe('Passive Mode', () => {
    test('applies passive preset with correct features', () => {
      const plugin = new ReconPlugin({
      verbose: false,behavior: 'passive',
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.behavior).toBe('passive');
      expect(plugin.config.concurrency).toBe(2);
      expect(plugin.config.features.dns).toBe(true);
      expect(plugin.config.features.certificate).toBe(false);
      expect(plugin.config.features.http.curl).toBe(false);
      expect(plugin.config.features.latency.ping).toBe(false);
      expect(plugin.config.features.latency.traceroute).toBe(false);
      expect(plugin.config.features.subdomains.crtsh).toBe(true);
      expect(plugin.config.features.subdomains.amass).toBe(false);
      expect(plugin.config.features.subdomains.subfinder).toBe(false);
      expect(plugin.config.features.ports.nmap).toBe(false);
      expect(plugin.config.features.ports.masscan).toBe(false);
      expect(plugin.config.features.osint.theHarvester).toBe(true);
      expect(plugin.config.rateLimit.enabled).toBe(false);
    });

    test('emits behavior-applied event', async () => {
      emitSpy = jest.spyOn(ReconPlugin.prototype, 'emit');

      new ReconPlugin({
      verbose: false,behavior: 'passive',
        storage: { persist: false },
        resources: { persist: false }
      });

      // Wait for setTimeout to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(emitSpy).toHaveBeenCalledWith('recon:behavior-applied', expect.objectContaining({
        mode: 'passive',
        preset: expect.any(Object),
        overrides: expect.any(Object),
        final: expect.any(Object)
      }));
    });

    test('allows behaviorOverrides to enable specific features', () => {
      const plugin = new ReconPlugin({
      verbose: false,behavior: 'passive',
        behaviorOverrides: {
          features: {
            certificate: true // override passive default
          }
        },
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.features.certificate).toBe(true);
      expect(plugin.config.features.http.curl).toBe(false); // still passive
    });
  });

  describe('Stealth Mode', () => {
    test('applies stealth preset with rate limiting', () => {
      const plugin = new ReconPlugin({
      verbose: false,behavior: 'stealth',
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.behavior).toBe('stealth');
      expect(plugin.config.concurrency).toBe(1);
      expect(plugin.config.features.dns).toBe(true);
      expect(plugin.config.features.certificate).toBe(true);
      expect(plugin.config.features.http.curl).toBe(true);
      expect(plugin.config.features.latency.ping).toBe(true);
      expect(plugin.config.features.latency.traceroute).toBe(false); // noisy
      expect(plugin.config.features.subdomains.subfinder).toBe(true);
      expect(plugin.config.features.subdomains.amass).toBe(false); // too noisy
      expect(plugin.config.features.ports.nmap).toBe(true);
      expect(plugin.config.features.ports.masscan).toBe(false);
      expect(plugin.config.features.vulnerability.nikto).toBe(false);
      expect(plugin.config.rateLimit.enabled).toBe(true);
      expect(plugin.config.rateLimit.requestsPerMinute).toBe(10);
      expect(plugin.config.rateLimit.delayBetweenStages).toBe(5000);
      expect(plugin.config.nmap.extraArgs).toContain('-T2');
      expect(plugin.config.curl.userAgent).toContain('Mozilla');
    });

    test('has rate limiting configuration enabled', () => {
      const plugin = new ReconPlugin({
        verbose: false,
        behavior: 'stealth',
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.rateLimit).toBeDefined();
      expect(plugin.config.rateLimit.enabled).toBe(true);
      expect(plugin.config.rateLimit.delayBetweenStages).toBe(5000);
    });
  });

  describe('Aggressive Mode', () => {
    test('applies aggressive preset with all tools enabled', () => {
      const plugin = new ReconPlugin({
      verbose: false,behavior: 'aggressive',
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.behavior).toBe('aggressive');
      expect(plugin.config.concurrency).toBe(8);
      expect(plugin.config.features.dns).toBe(true);
      expect(plugin.config.features.certificate).toBe(true);
      expect(plugin.config.features.http.curl).toBe(true);
      expect(plugin.config.features.latency.ping).toBe(true);
      expect(plugin.config.features.latency.traceroute).toBe(true);
      expect(plugin.config.features.subdomains.amass).toBe(true);
      expect(plugin.config.features.subdomains.subfinder).toBe(true);
      expect(plugin.config.features.subdomains.assetfinder).toBe(true);
      expect(plugin.config.features.ports.nmap).toBe(true);
      expect(plugin.config.features.ports.masscan).toBe(true);
      expect(plugin.config.features.web.ffuf).toBe(true);
      expect(plugin.config.features.web.feroxbuster).toBe(true);
      expect(plugin.config.features.web.gobuster).toBe(true);
      expect(plugin.config.features.web.threads).toBe(100);
      expect(plugin.config.features.vulnerability.nikto).toBe(true);
      expect(plugin.config.features.vulnerability.wpscan).toBe(true);
      expect(plugin.config.features.tlsAudit.sslyze).toBe(true);
      expect(plugin.config.features.tlsAudit.testssl).toBe(true);
      expect(plugin.config.features.fingerprint.whatweb).toBe(true);
      expect(plugin.config.features.screenshots.aquatone).toBe(true);
      expect(plugin.config.rateLimit.enabled).toBe(false);
      expect(plugin.config.nmap.topPorts).toBe(100);
      expect(plugin.config.nmap.extraArgs).toContain('-T4');
      expect(plugin.config.masscan.ports).toBe('1-65535');
      expect(plugin.config.masscan.rate).toBe(5000);
    });

    test('has rate limiting disabled', () => {
      const plugin = new ReconPlugin({
        verbose: false,
        behavior: 'aggressive',
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.rateLimit).toBeDefined();
      expect(plugin.config.rateLimit.enabled).toBe(false);
    });
  });

  describe('Default Mode (no behavior)', () => {
    test('uses default features when no behavior is set', () => {
      const plugin = new ReconPlugin({
      verbose: false,storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.behavior).toBe('default');
      expect(plugin.config.concurrency).toBe(4);
      expect(plugin.config.features.dns).toBe(true);
      expect(plugin.config.features.subdomains.amass).toBe(true);
      expect(plugin.config.features.ports.nmap).toBe(true);
    });
  });

  describe('Manual Overrides', () => {
    test('manual config overrides behavior preset', () => {
      const plugin = new ReconPlugin({
      verbose: false,behavior: 'passive',
        concurrency: 10, // override passive default (2)
        ping: { count: 10, timeout: 20000 },
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.concurrency).toBe(10);
      expect(plugin.config.ping.count).toBe(10);
      expect(plugin.config.ping.timeout).toBe(20000);
    });

    test('features param overrides behavior features', () => {
      const plugin = new ReconPlugin({
      verbose: false,behavior: 'stealth',
        features: {
          latency: { traceroute: true } // enable traceroute in stealth mode
        },
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.features.latency.traceroute).toBe(true);
      expect(plugin.config.features.latency.ping).toBe(true); // still stealth default
    });
  });

  describe('Invalid Behavior', () => {
    test('ignores invalid behavior mode', () => {
      const plugin = new ReconPlugin({
      verbose: false,behavior: 'invalid-mode',
        storage: { persist: false },
        resources: { persist: false }
      });

      expect(plugin.config.behavior).toBe('invalid-mode');
      expect(plugin.config.concurrency).toBe(4); // falls back to default
    });
  });
});
