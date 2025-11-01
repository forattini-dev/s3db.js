import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import dns from 'node:dns/promises';

import { ReconPlugin } from '#src/plugins/recon.plugin.js';

describe('ReconPlugin', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('aggregates diagnostics results with custom command runner', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    jest.spyOn(dns, 'resolve4').mockResolvedValue(['93.184.216.34']);
    jest.spyOn(dns, 'resolve6').mockResolvedValue([]);
    jest.spyOn(dns, 'resolveNs').mockResolvedValue(['ns1.example.net', 'ns2.example.net']);
    jest.spyOn(dns, 'resolveMx').mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]);
    jest.spyOn(dns, 'resolveTxt').mockResolvedValue([['v=spf1 include:_spf.example.com ~all']]);
    jest.spyOn(dns, 'reverse').mockResolvedValue(['example.com']);

    const availability = {
      ping: true,
      mtr: false,
      traceroute: true,
      curl: true,
      nmap: true,
      amass: true
    };

    const commandRunner = {
      isAvailable: jest.fn((cmd) => Promise.resolve(availability[cmd] ?? true)),
      run: jest.fn((cmd) => {
        switch (cmd) {
          case 'amass':
            return Promise.resolve({
              ok: true,
              stdout: ['sub1.example.com', 'sub2.example.com'].join('\n'),
              stderr: ''
            });
          case 'ping':
            return Promise.resolve({
              ok: true,
              stdout: [
                '4 packets transmitted, 4 received, 0% packet loss, time 3003ms',
                'rtt min/avg/max/mdev = 10.000/20.500/30.000/5.000 ms'
              ].join('\n'),
              stderr: ''
            });
          case 'traceroute':
            return Promise.resolve({
              ok: true,
              stdout: 'traceroute to example.com (93.184.216.34), 30 hops max',
              stderr: ''
            });
          case 'curl':
            return Promise.resolve({
              ok: true,
              stdout: [
                'HTTP/2 200',
                'server: ECS (nyb/1D2F)',
                'x-powered-by: Express',
                'cf-cache-status: HIT',
                ''
              ].join('\n'),
              stderr: ''
            });
          case 'nmap':
            return Promise.resolve({
              ok: true,
              stdout: [
                'Starting Nmap 7.93 ( https://nmap.org )',
                'PORT     STATE SERVICE VERSION',
                '22/tcp   open  ssh     OpenSSH 8.2',
                '80/tcp   open  http    nginx 1.18',
                '443/tcp  open  https   nginx 1.18',
                ''
              ].join('\n'),
              stderr: ''
            });
          default:
            return Promise.resolve({ ok: false, error: new Error(`Unhandled command ${cmd}`) });
        }
      })
    };

    const plugin = new ReconPlugin({
      commandRunner,
      storage: { persist: false },
      resources: { persist: false },
      features: {
        dns: true,
        certificate: false,
        http: { curl: true },
        latency: { ping: true, traceroute: true },
        subdomains: { amass: true, subfinder: false, assetfinder: false, crtsh: false },
        ports: { nmap: true, masscan: false },
        tlsAudit: { openssl: false, sslyze: false, testssl: false },
        fingerprint: { whatweb: false },
        web: { ffuf: false, feroxbuster: false, gobuster: false },
        vulnerability: { nikto: false, wpscan: false, droopescan: false },
        screenshots: { aquatone: false, eyewitness: false },
        osint: { theHarvester: false, reconNg: false }
      }
    });
    plugin._gatherCertificate = jest.fn().mockResolvedValue({ status: 'skipped' });

    const report = await plugin.runDiagnostics('example.com', {
      tools: ['dns', 'ping', 'traceroute', 'curl', 'ports', 'certificate', 'subdomains']
    });

    expect(report.target.host).toBe('example.com');
    expect(report.results.ping.metrics.avg).toBe(20.5);
    expect(report.results.ports.scanners.nmap.summary.openPorts).toHaveLength(3);
    expect(report.results.subdomains.list).toEqual(['sub1.example.com', 'sub2.example.com']);
    expect(report.fingerprint.cdn).toBe('Cloudflare');
    expect(report.fingerprint.technologies).toEqual(
      expect.arrayContaining([
        'ECS (nyb/1D2F)',
        'Express',
        'ssh OpenSSH 8.2',
        'http nginx 1.18',
        'https nginx 1.18'
      ])
    );
    expect(report.fingerprint.subdomainCount).toBe(2);
    expect(report.fingerprint.relatedHosts).toEqual(['example.com']);
    expect(report.toolsAttempted).toEqual([
      'dns',
      'ping',
      'traceroute',
      'curl',
      'subdomains',
      'ports'
    ]);
  });

  test('marks tools as unavailable when command is missing', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    jest.spyOn(dns, 'resolve4').mockResolvedValue(['127.0.0.1']);
    jest.spyOn(dns, 'resolve6').mockResolvedValue([]);
    jest.spyOn(dns, 'resolveNs').mockResolvedValue([]);
    jest.spyOn(dns, 'resolveMx').mockResolvedValue([]);
    jest.spyOn(dns, 'resolveTxt').mockResolvedValue([]);
    jest.spyOn(dns, 'reverse').mockResolvedValue([]);

    const commandRunner = {
      isAvailable: jest.fn(() => Promise.resolve(false)),
      run: jest.fn((cmd) =>
        Promise.resolve({
          ok: false,
          error: Object.assign(new Error(`${cmd} not available`), { code: 'ENOENT' }),
          stderr: ''
        })
      )
    };

    const plugin = new ReconPlugin({
      commandRunner,
      storage: { persist: false },
      resources: { persist: false },
      features: {
        dns: true,
        certificate: false,
        http: { curl: false },
        latency: { ping: true, traceroute: false },
        subdomains: { amass: false, subfinder: false, assetfinder: false, crtsh: false },
        ports: { nmap: true, masscan: false },
        tlsAudit: { openssl: false },
        fingerprint: { whatweb: false },
        web: { ffuf: false },
        vulnerability: { nikto: false },
        screenshots: { aquatone: false },
        osint: { theHarvester: false }
      }
    });
    plugin._gatherCertificate = jest.fn().mockResolvedValue({ status: 'skipped' });

    const report = await plugin.runDiagnostics('localhost', {
      tools: ['dns', 'ping', 'ports']
    });

    expect(report.results.ping.status).toBe('unavailable');
    expect(report.results.ports.scanners.nmap.status).toBe('unavailable');
  });

  test('prefers mtr JSON output when available', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    jest.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
    jest.spyOn(dns, 'resolve6').mockResolvedValue([]);
    jest.spyOn(dns, 'resolveNs').mockResolvedValue([]);
    jest.spyOn(dns, 'resolveMx').mockResolvedValue([]);
    jest.spyOn(dns, 'resolveTxt').mockResolvedValue([]);
    jest.spyOn(dns, 'reverse').mockResolvedValue([]);

    const commandRunner = {
      isAvailable: jest.fn((cmd) => Promise.resolve(cmd === 'mtr')),
      run: jest.fn(() =>
        Promise.resolve({
          ok: true,
          stdout: JSON.stringify({
            report: {
              hubs: [
                { count: 1, Host: 'router', Best: 1, Avg: 1, Wrst: 1, Loss: 0 }
              ]
            }
          })
        })
      )
    };

    const plugin = new ReconPlugin({
      commandRunner,
      storage: { persist: false },
      resources: { persist: false },
      features: {
        dns: true,
        certificate: false,
        http: { curl: false },
        latency: { ping: false, traceroute: true },
        subdomains: { amass: false, subfinder: false, assetfinder: false, crtsh: false },
        ports: { nmap: false, masscan: false },
        tlsAudit: { openssl: false },
        fingerprint: { whatweb: false },
        web: { ffuf: false },
        vulnerability: { nikto: false },
        screenshots: { aquatone: false },
        osint: { theHarvester: false }
      }
    });
    plugin._gatherCertificate = jest.fn().mockResolvedValue({ status: 'skipped' });

    const report = await plugin.runDiagnostics('8.8.8.8', {
      tools: ['traceroute', 'dns']
    });

    expect(report.results.traceroute.type).toBe('mtr');
    expect(report.results.traceroute.report.report.hubs).toHaveLength(1);
  });

  test('generateClientReport produces markdown and json summaries', async () => {
    const plugin = new ReconPlugin({
      commandRunner: {},
      storage: { persist: true },
      resources: { persist: false }
    });

    const latestReport = {
      target: { original: 'https://example.com', host: 'example.com', protocol: 'https', port: 443 },
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: '2025-01-01T00:05:00.000Z',
      status: 'ok',
      fingerprint: {
        primaryIp: '93.184.216.34',
        ipAddresses: ['93.184.216.34'],
        cdn: 'Cloudflare',
        server: 'nginx',
        latencyMs: 18.5,
        subdomains: ['app.example.com'],
        openPorts: [{ port: '443/tcp', service: 'https', detail: 'nginx 1.18' }],
        technologies: ['nginx 1.18', 'Express']
      },
      storageKey: 'plugin=recon/reports/example.com/2025-01-01T00-05-00.000Z.json',
      stageStorageKeys: {},
      results: {
        dns: { status: 'ok' },
        subdomains: { status: 'ok', list: ['app.example.com'] },
        ports: { status: 'ok', openPorts: [{ port: '443/tcp', service: 'https', detail: 'nginx 1.18' }] }
      }
    };

    const mockStorage = {
      getPluginKey: jest.fn((resourceName, ...parts) => {
        const slug = 'recon';
        if (resourceName) {
          return `resource=${resourceName}/plugin=${slug}/${parts.join('/')}`;
        }
        return `plugin=${slug}/${parts.join('/')}`;
      }),
      get: jest.fn(async (key) => {
        if (key.endsWith('latest.json')) return latestReport;
        return null;
      })
    };

    plugin.getStorage = () => mockStorage;
    plugin._getResource = jest.fn().mockResolvedValue(null);

    const markdown = await plugin.generateClientReport('example.com');
    expect(markdown).toContain('# Recon Report – https://example.com');
    expect(markdown).toContain('Portas abertas');
    expect(markdown).toContain('app.example.com');

    const json = await plugin.generateClientReport('example.com', { format: 'json' });
    expect(json.host.target).toBe('https://example.com');
    expect(json.report.status).toBe('ok');
    expect(json.stages).toHaveLength(3);
  });

  test('emits alert events for critical diffs', async () => {
    const plugin = new ReconPlugin({
      commandRunner: {},
      storage: { persist: false },
      resources: { persist: false }
    });

    const emitSpy = jest.spyOn(plugin, 'emit');
    const report = {
      endedAt: '2025-01-01T00:05:00.000Z',
      storageKey: 'plugin=recon/reports/example.com/2025-01-01.json'
    };
    const diffs = [
      {
        type: 'port:add',
        severity: 'high',
        critical: true,
        values: ['8443/tcp'],
        description: 'Novas portas expostas: 8443/tcp'
      },
      {
        type: 'subdomain:add',
        severity: 'medium',
        critical: false,
        values: ['dev.example.com'],
        description: 'Novos subdomínios: dev.example.com'
      }
    ];

    await plugin._emitDiffAlerts('example.com', report, diffs);

    expect(emitSpy).toHaveBeenCalledWith('recon:alert', expect.objectContaining({
      host: 'example.com',
      stage: 'port:add',
      severity: 'high',
      values: ['8443/tcp']
    }));

    const alertCalls = emitSpy.mock.calls.filter(([event]) => event === 'recon:alert');
    expect(alertCalls).toHaveLength(1);
  });

  test('web discovery aggregates paths from tools', async () => {
    const commandRunner = {
      run: jest.fn(async () => ({
        ok: true,
        stdout: ['/admin', '/login'].join('\n'),
        stderr: ''
      }))
    };

    const plugin = new ReconPlugin({
      commandRunner,
      storage: { persist: false },
      resources: { persist: false }
    });

    const result = await plugin._runWebDiscovery(
      { host: 'example.com', protocol: 'https', port: 443, original: 'https://example.com' },
      { ffuf: true, wordlist: '/tmp/wordlist.txt' }
    );

    expect(result.status).toBe('ok');
    expect(result.paths).toEqual(['/admin', '/login']);
    expect(result.total).toBe(2);
    expect(result.tools.ffuf).toEqual(expect.objectContaining({ status: 'ok', count: 2 }));
  });

  test('persists subdomains and paths to resources', async () => {
    const plugin = new ReconPlugin({
      commandRunner: {},
      storage: { persist: false },
      resources: { persist: true }
    });

    plugin.database = { resources: {} };

    const subdomainsResource = {
      insert: jest.fn().mockResolvedValue(),
      update: jest.fn().mockResolvedValue(),
      replace: jest.fn().mockResolvedValue()
    };
    const pathsResource = {
      insert: jest.fn().mockResolvedValue(),
      update: jest.fn().mockResolvedValue(),
      replace: jest.fn().mockResolvedValue()
    };

    jest.spyOn(plugin, '_getResource').mockImplementation(async (key) => {
      if (key === 'subdomains') return subdomainsResource;
      if (key === 'paths') return pathsResource;
      return null;
    });

    const report = {
      target: { host: 'example.com', original: 'https://example.com' },
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: '2025-01-01T00:05:00.000Z',
      status: 'ok',
      results: {
        subdomains: {
          status: 'ok',
          list: ['api.example.com', 'cdn.example.com'],
          sources: {
            amass: { status: 'ok', count: 2, sample: ['api.example.com', 'cdn.example.com'] }
          }
        },
        webDiscovery: {
          status: 'ok',
          paths: ['/admin', '/login'],
          tools: {
            ffuf: { status: 'ok', count: 2, sample: ['/admin', '/login'] }
          }
        }
      },
      fingerprint: {
        subdomains: ['api.example.com', 'cdn.example.com'],
        openPorts: [],
        technologies: [],
        ipAddresses: [],
        latencyMs: null
      },
      stageStorageKeys: {}
    };

    await plugin._persistToResources(report);

    expect(subdomainsResource.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'example.com',
      subdomains: ['api.example.com', 'cdn.example.com'],
      total: 2
    }));
    expect(pathsResource.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'example.com',
      paths: ['/admin', '/login'],
      total: 2
    }));
  });

  test('registers legacy database.plugins.network alias', () => {
    const plugin = new ReconPlugin({
      commandRunner: {},
      storage: { persist: false },
      resources: { persist: false }
    });

    const database = { plugins: {} };
    plugin.database = database;

    plugin.afterInstall();
    expect(database.plugins.network).toBe(plugin);

    plugin.afterUninstall();
    expect(database.plugins.network).toBeUndefined();
  });
});
