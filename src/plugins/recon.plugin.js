import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { promisify } from 'node:util';
import { URL } from 'node:url';
import { PromisePool } from '@supercharge/promise-pool';

import { Plugin } from './plugin.class.js';
import { resolveResourceName } from './concerns/resource-names.js';

const execFileAsync = promisify(execFile);

class CommandRunner {
  constructor(options = {}) {
    this.execFile = options.execFile || execFileAsync;
    this.availabilityCache = new Map();
  }

  async isAvailable(command, overridePath) {
    if (overridePath) {
      return true;
    }

    if (this.availabilityCache.has(command)) {
      return this.availabilityCache.get(command);
    }

    try {
      await this.execFile('which', [command], { timeout: 1500 });
      this.availabilityCache.set(command, true);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        // command binary not found, mark skip
        this.availabilityCache.set(command, false);
        return false;
      }
      this.availabilityCache.set(command, false);
      return false;
    }
  }

  async run(command, args = [], options = {}) {
    const resolvedCommand = options?.path || command;

    if (!(await this.isAvailable(command, options?.path))) {
      const error = new Error(`Command "${command}" is not available on this system`);
      error.code = 'ENOENT';
      return { ok: false, error, stdout: '', stderr: '' };
    }

    try {
      const result = await this.execFile(resolvedCommand, args, {
        timeout: options.timeout ?? 10000,
        maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024
      });
      return {
        ok: true,
        stdout: result.stdout?.toString() ?? '',
        stderr: result.stderr?.toString() ?? ''
      };
    } catch (error) {
      return {
        ok: false,
        error,
        stdout: error?.stdout?.toString() ?? '',
        stderr: error?.stderr?.toString() ?? ''
      };
    }
  }
}

const DEFAULT_FEATURES = {
  dns: true,
  certificate: true,
  http: {
    curl: true
  },
  latency: {
    ping: true,
    traceroute: true
  },
  subdomains: {
    amass: true,
    subfinder: true,
    assetfinder: false,
    crtsh: true
  },
  ports: {
    nmap: true,
    masscan: false
  },
  web: {
    ffuf: false,
    feroxbuster: false,
    gobuster: false,
    wordlist: null,
    threads: 50
  },
  vulnerability: {
    nikto: false,
    wpscan: false,
    droopescan: false
  },
  tlsAudit: {
    sslyze: false,
    testssl: false,
    openssl: true
  },
  fingerprint: {
    whatweb: false
  },
  screenshots: {
    aquatone: false,
    eyewitness: false
  },
  osint: {
    theHarvester: false,
    reconNg: false
  }
};

const BEHAVIOR_PRESETS = {
  passive: {
    features: {
      dns: true,
      certificate: false,
      http: { curl: false },
      latency: { ping: false, traceroute: false },
      subdomains: { amass: false, subfinder: false, assetfinder: false, crtsh: true },
      ports: { nmap: false, masscan: false },
      web: { ffuf: false, feroxbuster: false, gobuster: false },
      vulnerability: { nikto: false, wpscan: false, droopescan: false },
      tlsAudit: { openssl: false, sslyze: false, testssl: false },
      fingerprint: { whatweb: false },
      screenshots: { aquatone: false, eyewitness: false },
      osint: { theHarvester: true, reconNg: false }
    },
    concurrency: 2,
    ping: { count: 3, timeout: 5000 },
    curl: { timeout: 10000 },
    nmap: { topPorts: 0 },
    rateLimit: { enabled: false, delayBetweenStages: 0 }
  },
  stealth: {
    features: {
      dns: true,
      certificate: true,
      http: { curl: true },
      latency: { ping: true, traceroute: false },
      subdomains: { amass: false, subfinder: true, assetfinder: false, crtsh: true },
      ports: { nmap: true, masscan: false },
      web: { ffuf: false, feroxbuster: false, gobuster: false },
      vulnerability: { nikto: false, wpscan: false, droopescan: false },
      tlsAudit: { openssl: true, sslyze: false, testssl: false },
      fingerprint: { whatweb: false },
      screenshots: { aquatone: false, eyewitness: false },
      osint: { theHarvester: false, reconNg: false }
    },
    concurrency: 1,
    ping: { count: 3, timeout: 10000 },
    traceroute: { cycles: 3, timeout: 15000 },
    curl: {
      timeout: 15000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    nmap: { topPorts: 10, extraArgs: ['-T2', '--max-retries', '1'] },
    rateLimit: { enabled: true, requestsPerMinute: 10, delayBetweenStages: 5000 }
  },
  aggressive: {
    features: {
      dns: true,
      certificate: true,
      http: { curl: true },
      latency: { ping: true, traceroute: true },
      subdomains: { amass: true, subfinder: true, assetfinder: true, crtsh: true },
      ports: { nmap: true, masscan: true },
      web: { ffuf: true, feroxbuster: true, gobuster: true, threads: 100 },
      vulnerability: { nikto: true, wpscan: true, droopescan: true },
      tlsAudit: { openssl: true, sslyze: true, testssl: true },
      fingerprint: { whatweb: true },
      screenshots: { aquatone: true, eyewitness: false },
      osint: { theHarvester: true, reconNg: false }
    },
    concurrency: 8,
    ping: { count: 4, timeout: 5000 },
    traceroute: { cycles: 3, timeout: 10000 },
    curl: { timeout: 8000 },
    nmap: { topPorts: 100, extraArgs: ['-T4', '-sV', '--version-intensity', '5'] },
    masscan: { ports: '1-65535', rate: 5000 },
    rateLimit: { enabled: false, delayBetweenStages: 0 }
  }
};

export class ReconPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    const {
      behavior = null,
      behaviorOverrides = {},
      tools,
      concurrency,
      ping = {},
      traceroute = {},
      curl = {},
      nmap = {},
      masscan = {},
      commandRunner = null,
      features = {},
      storage = {},
      schedule = {},
      resources: resourceConfig = {},
      targets = [],
      rateLimit = {}
    } = options;

    const behaviorPreset = this._resolveBehaviorPreset(behavior, behaviorOverrides);

    this.config = {
      behavior: behavior || 'default',
      defaultTools: tools || behaviorPreset.tools || ['dns', 'certificate', 'ping', 'traceroute', 'curl', 'ports', 'subdomains'],
      concurrency: concurrency ?? behaviorPreset.concurrency ?? 4,
      ping: {
        count: ping.count ?? behaviorPreset.ping?.count ?? 4,
        timeout: ping.timeout ?? behaviorPreset.ping?.timeout ?? 7000
      },
      traceroute: {
        cycles: traceroute.cycles ?? behaviorPreset.traceroute?.cycles ?? 4,
        timeout: traceroute.timeout ?? behaviorPreset.traceroute?.timeout ?? 12000
      },
      curl: {
        timeout: curl.timeout ?? behaviorPreset.curl?.timeout ?? 8000,
        userAgent:
          curl.userAgent ??
          behaviorPreset.curl?.userAgent ??
          'Mozilla/5.0 (compatible; s3db-recon/1.0; +https://github.com/forattini-dev/s3db.js)'
      },
      nmap: {
        topPorts: nmap.topPorts ?? behaviorPreset.nmap?.topPorts ?? 10,
        extraArgs: nmap.extraArgs ?? behaviorPreset.nmap?.extraArgs ?? []
      },
      masscan: {
        ports: masscan.ports ?? behaviorPreset.masscan?.ports ?? '1-1000',
        rate: masscan.rate ?? behaviorPreset.masscan?.rate ?? 1000,
        timeout: masscan.timeout ?? behaviorPreset.masscan?.timeout ?? 30000
      },
      features: this._mergeFeatures(behaviorPreset.features || DEFAULT_FEATURES, features),
      storage: {
        persist: storage.persist !== false,
        persistRawOutput: storage.persistRawOutput ?? true,
        historyLimit: storage.historyLimit ?? 20
      },
      schedule: {
        enabled: schedule.enabled ?? false,
        cron: schedule.cron ?? null,
        runOnStart: schedule.runOnStart ?? false
      },
      resources: {
        persist: resourceConfig.persist !== false,
        autoCreate: resourceConfig.autoCreate !== false
      },
      targets: Array.isArray(targets) ? targets : [],
      rateLimit: {
        enabled: rateLimit.enabled ?? behaviorPreset.rateLimit?.enabled ?? false,
        requestsPerMinute: rateLimit.requestsPerMinute ?? behaviorPreset.rateLimit?.requestsPerMinute ?? 60,
        delayBetweenStages: rateLimit.delayBetweenStages ?? behaviorPreset.rateLimit?.delayBetweenStages ?? 0
      }
    };

    this.commandRunner = commandRunner || new CommandRunner();
    this._cronJob = null;
    this._cronModule = null;
    this._resourceCache = new Map();
    const resourceNamesOption = options.resourceNames || {};
    this._resourceDescriptors = {
      hosts: { defaultName: 'plg_recon_hosts', override: resourceNamesOption.hosts },
      reports: { defaultName: 'plg_recon_reports', override: resourceNamesOption.reports },
      diffs: { defaultName: 'plg_recon_diffs', override: resourceNamesOption.diffs },
      stages: { defaultName: 'plg_recon_stage_results', override: resourceNamesOption.stages },
      subdomains: { defaultName: 'plg_recon_subdomains', override: resourceNamesOption.subdomains },
      paths: { defaultName: 'plg_recon_paths', override: resourceNamesOption.paths }
    };
    this._resourceNames = {};
    this._refreshResourceNames();
  }

  async onInstall() {
    if (this.database && this.config.resources.persist && this.config.resources.autoCreate) {
      await this._ensureResources();
    }
    return undefined;
  }

  async onStart() {
    await this._startScheduler();
    if (this.config.schedule.enabled && this.config.schedule.runOnStart) {
      await this._triggerScheduledSweep('startup');
    }
  }

  async onStop() {
    if (this._cronJob) {
      this._cronJob.stop();
      this._cronJob = null;
    }
    this._resourceCache.clear();
  }

  async runDiagnostics(target, options = {}) {
    const normalizedTarget = this._normalizeTarget(target);
    const features = this._mergeFeatures(this.config.features, options.features || {});
    const stagePlan = this._resolveStagePlan(normalizedTarget, features, options.tools);
    const results = {};
    const stageErrors = {};
    const startedAt = new Date().toISOString();

    const pool = await PromisePool.withConcurrency(options.concurrency ?? this.config.concurrency)
      .for(stagePlan)
      .process(async (stage) => {
        if (!stage.enabled) {
          results[stage.name] = { status: 'disabled' };
          return;
        }

        await this._applyRateLimit(stage.name);

        try {
          const output = await stage.execute();
          results[stage.name] = output;
        } catch (error) {
          stageErrors[stage.name] = error;
          results[stage.name] = {
            status: 'error',
            message: error?.message || 'Stage execution failed'
          };
        }
      });

    if (pool.errors.length > 0) {
      this.emit('diagnostics:error', {
        target: normalizedTarget.host,
        errors: pool.errors.map(({ item, error }) => ({ stage: item?.name || item, message: error.message }))
      });
    }

    const fingerprint = this._buildFingerprint(normalizedTarget, results);
    const endedAt = new Date().toISOString();
    const status = Object.values(stageErrors).length === 0 ? 'ok' : 'partial';

    const report = {
      target: normalizedTarget,
      startedAt,
      endedAt,
      status,
      results,
      stages: results,
      fingerprint,
      toolsAttempted: stagePlan.filter(stage => stage.enabled).map(stage => stage.name)
    };

    const persist = options.persist ?? this.config.storage.persist;
    if (persist) {
      await this._persistReport(normalizedTarget, report);
    }

    if (this.database && this.config.resources.persist) {
      await this._persistToResources(report);
    }

    return report;
  }

  _resolveStagePlan(normalizedTarget, features, requestedTools) {
    const requestedSet = requestedTools
      ? new Set(requestedTools.map((tool) => this._normalizeToolName(tool)))
      : null;
    const plan = [];
    const include = (name, enabled, execute) => {
      const allowed = requestedSet ? requestedSet.has(name) : true;
      plan.push({ name, enabled: !!enabled && allowed, execute });
    };

    include('dns', features.dns !== false, () => this._gatherDns(normalizedTarget));
    include('certificate', features.certificate !== false, () => this._gatherCertificate(normalizedTarget));
    include('ping', features.latency?.ping !== false, () => this._runPing(normalizedTarget));
    include('traceroute', features.latency?.traceroute !== false, () => this._runTraceroute(normalizedTarget));
    include('curl', features.http?.curl !== false, () => this._runCurl(normalizedTarget));
    include('subdomains', this._isAnyEnabled(features.subdomains), () => this._runSubdomainRecon(normalizedTarget, features.subdomains));
    include('ports', this._isAnyEnabled(features.ports), () => this._runPortScans(normalizedTarget, features.ports));
    include('tlsAudit', this._isAnyEnabled(features.tlsAudit), () => this._runTlsExtras(normalizedTarget, features.tlsAudit));
    include('fingerprintTools', this._isAnyEnabled(features.fingerprint), () => this._runFingerprintTools(normalizedTarget, features.fingerprint));
    include('webDiscovery', this._isAnyEnabled(features.web), () => this._runWebDiscovery(normalizedTarget, features.web));
    include('vulnerabilityScan', this._isAnyEnabled(features.vulnerability), () => this._runVulnerabilityScans(normalizedTarget, features.vulnerability));
    include('screenshots', this._isAnyEnabled(features.screenshots), () => this._runScreenshotCapture(normalizedTarget, features.screenshots));
    include('osint', this._isAnyEnabled(features.osint), () => this._runOsintRecon(normalizedTarget, features.osint));

    return plan;
  }

  _normalizeToolName(name) {
    if (!name) return name;
    const lower = String(name).toLowerCase();
    if (['nmap', 'masscan', 'ports', 'port', 'portscan'].includes(lower)) {
      return 'ports';
    }
    if (['subdomain', 'subdomains', 'subdomainscan'].includes(lower)) {
      return 'subdomains';
    }
    if (lower === 'mtr') {
      return 'traceroute';
    }
    if (lower === 'latency') {
      return 'ping';
    }
    if (['fingerprint', 'whatweb'].includes(lower)) {
      return 'fingerprintTools';
    }
    if (['vulnerability', 'nikto', 'wpscan', 'droopescan'].includes(lower)) {
      return 'vulnerabilityScan';
    }
    if (['web', 'ffuf', 'feroxbuster', 'gobuster'].includes(lower)) {
      return 'webDiscovery';
    }
    if (['screenshots', 'aquatone', 'eyewitness'].includes(lower)) {
      return 'screenshots';
    }
    if (['osint', 'theharvester', 'recon-ng'].includes(lower)) {
      return 'osint';
    }
    return lower;
  }

  _refreshResourceNames() {
    const namespace = this.namespace;
    this._resourceNames = {
      hosts: resolveResourceName('recon-hosts', this._resourceDescriptors.hosts, { namespace }),
      reports: resolveResourceName('recon-reports', this._resourceDescriptors.reports, { namespace }),
      diffs: resolveResourceName('recon-diffs', this._resourceDescriptors.diffs, { namespace }),
      stages: resolveResourceName('recon-stage-results', this._resourceDescriptors.stages, { namespace }),
      subdomains: resolveResourceName('recon-subdomains', this._resourceDescriptors.subdomains, { namespace }),
      paths: resolveResourceName('recon-paths', this._resourceDescriptors.paths, { namespace })
    };
    if (this._resourceCache) {
      this._resourceCache.clear();
    }
  }

  onNamespaceChanged() {
    this._refreshResourceNames();
  }

  afterInstall() {
    super.afterInstall();
    if (this.database?.plugins) {
      this.database.plugins.network = this;
    }
  }

  afterUninstall() {
    if (this.database?.plugins?.network === this) {
      delete this.database.plugins.network;
    }
    super.afterUninstall();
  }

  async _ensureResources() {
    if (!this.database) return;
    const definitions = [
      {
        key: 'hosts',
        config: {
          primaryKey: 'id',
          attributes: {
            id: 'string|required',
            target: 'string',
            summary: 'object',
            fingerprint: 'object',
            lastScanAt: 'string',
            storageKey: 'string'
          },
          timestamps: true,
          behavior: 'user-managed'
        }
      },
      {
        key: 'reports',
        config: {
          primaryKey: 'id',
          attributes: {
            id: 'string|required',
            host: 'string|required',
            startedAt: 'string',
            endedAt: 'string',
            status: 'string',
            storageKey: 'string',
            stageKeys: 'object'
          },
          timestamps: true,
          behavior: 'truncate-data'
        }
      },
      {
        key: 'diffs',
        config: {
          primaryKey: 'id',
          attributes: {
            id: 'string|required',
            host: 'string|required',
            timestamp: 'string|required',
            changes: 'object'
          },
          timestamps: true,
          behavior: 'truncate-data'
        }
      },
      {
        key: 'stages',
        config: {
          primaryKey: 'id',
          attributes: {
            id: 'string|required',
            host: 'string|required',
            stage: 'string|required',
            status: 'string',
            storageKey: 'string',
            summary: 'object',
            collectedAt: 'string'
          },
          timestamps: true,
          behavior: 'truncate-data'
        }
      },
      {
        key: 'subdomains',
        config: {
          primaryKey: 'id',
          attributes: {
            id: 'string|required',
            host: 'string|required',
            subdomains: 'array',
            total: 'number',
            sources: 'object',
            lastScanAt: 'string'
          },
          timestamps: true,
          behavior: 'replace'
        }
      },
      {
        key: 'paths',
        config: {
          primaryKey: 'id',
          attributes: {
            id: 'string|required',
            host: 'string|required',
            paths: 'array',
            total: 'number',
            sources: 'object',
            lastScanAt: 'string'
          },
          timestamps: true,
          behavior: 'replace'
        }
      }
    ];

    for (const def of definitions) {
      const name = this._resourceNames[def.key];
      if (!name) continue;
      const existing = this.database.resources?.[name];
      if (existing) continue;
      try {
        await this.database.createResource({ name, ...def.config });
      } catch (error) {
        // Ignore if resource already exists
      }
    }
    if (this.database.resources) {
      this._resourceCache.clear();
    }
  }

  async _getResource(key) {
    if (!this.database || !this.config.resources.persist) {
      return null;
    }
    if (this._resourceCache.has(key)) {
      return this._resourceCache.get(key);
    }
    const name = this._resourceNames[key];
    if (!name) return null;
    let resource = this.database.resources?.[name] || null;
    if (!resource && typeof this.database.getResource === 'function') {
      try {
        resource = await this.database.getResource(name);
      } catch (error) {
        resource = null;
      }
    }
    if (resource) {
      this._resourceCache.set(key, resource);
    }
    return resource;
  }

  _resolveBehaviorPreset(behavior, overrides = {}) {
    if (!behavior || !BEHAVIOR_PRESETS[behavior]) {
      return overrides;
    }

    const preset = BEHAVIOR_PRESETS[behavior];
    const merged = {
      features: this._mergeFeatures(preset.features || {}, overrides.features || {}),
      concurrency: overrides.concurrency ?? preset.concurrency,
      ping: { ...(preset.ping || {}), ...(overrides.ping || {}) },
      traceroute: { ...(preset.traceroute || {}), ...(overrides.traceroute || {}) },
      curl: { ...(preset.curl || {}), ...(overrides.curl || {}) },
      nmap: { ...(preset.nmap || {}), ...(overrides.nmap || {}) },
      masscan: { ...(preset.masscan || {}), ...(overrides.masscan || {}) },
      rateLimit: { ...(preset.rateLimit || {}), ...(overrides.rateLimit || {}) },
      tools: overrides.tools ?? preset.tools
    };

    this.emit('recon:behavior-applied', {
      mode: behavior,
      preset: preset,
      overrides: overrides,
      final: merged
    });

    return merged;
  }

  async _applyRateLimit(stageName) {
    if (!this.config.rateLimit.enabled) {
      return;
    }

    const delayMs = this.config.rateLimit.delayBetweenStages;
    if (delayMs > 0) {
      this.emit('recon:rate-limit-delay', {
        stage: stageName,
        delayMs
      });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  _isAnyEnabled(featureGroup) {
    if (!featureGroup || typeof featureGroup !== 'object') {
      return false;
    }
    return Object.values(featureGroup).some((value) => value === true || (typeof value === 'object' && this._isAnyEnabled(value)));
  }

  _mergeFeatures(base, overrides) {
    if (!overrides || typeof overrides !== 'object') {
      return JSON.parse(JSON.stringify(base));
    }

    const result = Array.isArray(base) ? [] : {};
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(overrides)]);

    for (const key of keys) {
      const baseValue = base ? base[key] : undefined;
      const overrideValue = overrides[key];

      if (
        baseValue &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue) &&
        overrideValue &&
        typeof overrideValue === 'object' &&
        !Array.isArray(overrideValue)
      ) {
        result[key] = this._mergeFeatures(baseValue, overrideValue);
      } else if (overrideValue !== undefined) {
        result[key] = overrideValue;
      } else {
        result[key] = baseValue;
      }
    }

    return result;
  }

  async _startScheduler() {
    if (!this.config.schedule.enabled || !this.config.schedule.cron) {
      return;
    }

    try {
      if (!this._cronModule) {
        this._cronModule = await import('node-cron');
      }
      if (this._cronJob) {
        this._cronJob.stop();
      }
      this._cronJob = this._cronModule.schedule(this.config.schedule.cron, () => {
        this._triggerScheduledSweep('cron').catch((error) => {
          this.emit('recon:schedule-error', {
            message: error?.message || 'Scheduled sweep failed',
            error
          });
        });
      });
    } catch (error) {
      this.emit('recon:schedule-error', {
        message: error?.message || 'Failed to start cron scheduler',
        error
      });
    }
  }

  async _triggerScheduledSweep(reason = 'manual') {
    const targets = this.config.targets || [];
    if (!targets.length) return;

    await PromisePool.withConcurrency(this.config.concurrency)
      .for(targets)
      .process(async (targetConfig) => {
        const targetEntry = this._normalizeTargetConfig(targetConfig);
        try {
          const report = await this.runDiagnostics(targetEntry.target, {
            features: targetEntry.features,
            tools: targetEntry.tools,
            persist: targetEntry.persist ?? true
          });
          this.emit('recon:completed', {
            reason,
            target: report.target.host,
            status: report.status,
            endedAt: report.endedAt
          });
        } catch (error) {
          this.emit('recon:target-error', {
            reason,
            target: targetEntry.target,
            message: error?.message || 'Recon execution failed',
            error
          });
        }
      });
  }

  _normalizeTargetConfig(entry) {
    if (typeof entry === 'string') {
      return { target: entry };
    }
    if (entry && typeof entry === 'object') {
      return {
        target: entry.target || entry.host || entry.domain,
        features: entry.features,
        tools: entry.tools,
        persist: entry.persist
      };
    }
    throw new Error('Invalid target configuration for ReconPlugin');
  }

  async _persistReport(target, report) {
    const storage = this.getStorage();
    const timestamp = report.endedAt.replace(/[:.]/g, '-');
    const baseKey = storage.getPluginKey(null, 'reports', target.host);
    const historyKey = `${baseKey}/${timestamp}.json`;
    const stageStorageKeys = {};
    for (const [stageName, stageData] of Object.entries(report.results || {})) {
      const stageKey = `${baseKey}/stages/${timestamp}/${stageName}.json`;
      await storage.set(stageKey, stageData, { behavior: 'body-only' });
      stageStorageKeys[stageName] = stageKey;
    }

    report.stageStorageKeys = stageStorageKeys;
    report.storageKey = historyKey;

    await storage.set(historyKey, report, { behavior: 'body-only' });
    await storage.set(`${baseKey}/latest.json`, report, { behavior: 'body-only' });

    const indexKey = `${baseKey}/index.json`;
    const existing = (await storage.get(indexKey)) || { target: target.host, history: [] };

    existing.history.unshift({
      timestamp: report.endedAt,
      status: report.status,
      reportKey: historyKey,
      stageKeys: stageStorageKeys,
      summary: {
        latencyMs: report.fingerprint.latencyMs ?? null,
        openPorts: report.fingerprint.openPorts?.length ?? 0,
        subdomains: report.fingerprint.subdomainCount ?? 0,
        primaryIp: report.fingerprint.primaryIp ?? null
      }
    });

    let pruned = [];
    if (existing.history.length > this.config.storage.historyLimit) {
      pruned = existing.history.splice(this.config.storage.historyLimit);
    }

    await storage.set(indexKey, existing, { behavior: 'body-only' });

    if (pruned.length) {
      await this._pruneHistory(target, pruned);
    }
  }

  async _persistToResources(report) {
    if (!this.database || !this.config.resources.persist) {
      return;
    }
    const hostId = report.target.host;
    const hostsResource = await this._getResource('hosts');
    const stagesResource = await this._getResource('stages');
    const reportsResource = await this._getResource('reports');
    const subdomainsResource = await this._getResource('subdomains');
    const pathsResource = await this._getResource('paths');

    if (hostsResource) {
      let existing = null;
      try {
        existing = await hostsResource.get(hostId);
      } catch (error) {
        existing = null;
      }

      const hostRecord = this._buildHostRecord(report);

      if (existing) {
        try {
          await hostsResource.update(hostId, hostRecord);
        } catch (error) {
          if (typeof hostsResource.replace === 'function') {
            await hostsResource.replace(hostId, hostRecord);
          }
        }
      } else {
        try {
          await hostsResource.insert(hostRecord);
        } catch (error) {
          if (typeof hostsResource.replace === 'function') {
            await hostsResource.replace(hostRecord.id, hostRecord);
          }
        }
      }

      const diffs = this._computeDiffs(existing, report);
      if (diffs.length) {
        await this._saveDiffs(hostId, report.endedAt, diffs);
        await this._emitDiffAlerts(hostId, report, diffs);
      }
    }

    if (subdomainsResource) {
      const list = Array.isArray(report.results?.subdomains?.list) ? report.results.subdomains.list : [];
      const subdomainRecord = {
        id: hostId,
        host: hostId,
        subdomains: list,
        total: list.length,
        sources: this._stripRawFields(report.results?.subdomains?.sources || {}),
        lastScanAt: report.endedAt
      };
      await this._upsertResourceRecord(subdomainsResource, subdomainRecord);
    }

    if (pathsResource) {
      const pathStage = report.results?.webDiscovery || {};
      const paths = Array.isArray(pathStage.paths) ? pathStage.paths : [];
      const pathRecord = {
        id: hostId,
        host: hostId,
        paths,
        total: paths.length,
        sources: this._stripRawFields(pathStage.tools || pathStage.sources || {}),
        lastScanAt: report.endedAt
      };
      await this._upsertResourceRecord(pathsResource, pathRecord);
    }

    if (reportsResource) {
      const reportRecord = {
        id: `${hostId}|${report.endedAt}`,
        host: hostId,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        status: report.status,
        storageKey: report.storageKey || null,
        stageKeys: report.stageStorageKeys || {}
      };
      try {
        await reportsResource.insert(reportRecord);
      } catch (error) {
        try {
          await reportsResource.update(reportRecord.id, reportRecord);
        } catch (err) {
          if (typeof reportsResource.replace === 'function') {
            await reportsResource.replace(reportRecord.id, reportRecord);
          }
        }
      }
    }

    if (stagesResource && report.stageStorageKeys) {
      for (const [stageName, stageData] of Object.entries(report.results || {})) {
        const storageKey = report.stageStorageKeys[stageName] || null;
        const summary = this._summarizeStage(stageName, stageData);
        const stageRecord = {
          id: `${hostId}|${stageName}|${report.endedAt}`,
          host: hostId,
          stage: stageName,
          status: stageData?.status || 'unknown',
          storageKey,
          summary,
          collectedAt: report.endedAt
        };
        try {
          await stagesResource.insert(stageRecord);
        } catch (error) {
          try {
            await stagesResource.update(stageRecord.id, stageRecord);
          } catch (err) {
            if (typeof stagesResource.replace === 'function') {
              await stagesResource.replace(stageRecord.id, stageRecord);
            }
          }
        }
      }
    }
  }

  async _pruneHistory(target, prunedEntries) {
    const storage = this.getStorage();
    const hostId = typeof target === 'string' ? target : target?.host || target?.target || target;
    const reportsResource = await this._getResource('reports');
    const stagesResource = await this._getResource('stages');
    const diffsResource = await this._getResource('diffs');

    for (const entry of prunedEntries) {
      if (entry?.reportKey) {
        await storage.delete(entry.reportKey).catch(() => {});
      }
      if (entry?.stageKeys) {
        for (const key of Object.values(entry.stageKeys)) {
          if (key) {
            await storage.delete(key).catch(() => {});
          }
        }
      }

      if (reportsResource) {
        await this._deleteResourceRecord(reportsResource, `${hostId}|${entry.timestamp}`);
      }
      if (stagesResource && entry?.stageKeys) {
        for (const stageName of Object.keys(entry.stageKeys)) {
          await this._deleteResourceRecord(stagesResource, `${hostId}|${stageName}|${entry.timestamp}`);
        }
      }
      if (diffsResource) {
        await this._deleteResourceRecord(diffsResource, `${hostId}|${entry.timestamp}`);
      }
    }
  }

  async _loadLatestReport(hostId) {
    try {
      const storage = this.getStorage();
      const baseKey = storage.getPluginKey(null, 'reports', hostId);
      const latestKey = `${baseKey}/latest.json`;
      return await storage.get(latestKey);
    } catch (error) {
      return null;
    }
  }

  async _loadHostSummary(hostId, fallbackReport) {
    const hostsResource = await this._getResource('hosts');
    if (hostsResource) {
      try {
        const record = await hostsResource.get(hostId);
        if (record) {
          return record;
        }
      } catch (error) {
        // ignore and fallback
      }
    }
    if (fallbackReport) {
      return this._buildHostRecord(fallbackReport);
    }
    return null;
  }

  async _loadRecentDiffs(hostId, limit = 10) {
    const diffsResource = await this._getResource('diffs');
    if (diffsResource && typeof diffsResource.query === 'function') {
      try {
        const result = await diffsResource.query({ host: hostId }, { limit, sort: '-timestamp' });
        if (Array.isArray(result)) {
          return result.slice(0, limit).map((entry) => this._normalizeDiffEntry(entry));
        }
        if (result?.items) {
          return result.items.slice(0, limit).map((entry) => this._normalizeDiffEntry(entry));
        }
      } catch (error) {
        // ignore and fallback to storage index
      }
    }

    try {
      const storage = this.getStorage();
      const baseKey = storage.getPluginKey(null, 'reports', hostId);
      const index = await storage.get(`${baseKey}/index.json`);
      if (index?.history?.length > 1) {
        const [latest, previous] = index.history;
        if (previous) {
          const diffs = [];
          const deltaSubdomains = (latest.summary?.subdomains ?? 0) - (previous.summary?.subdomains ?? 0);
          if (deltaSubdomains !== 0) {
            diffs.push(this._normalizeDiffEntry({
              type: 'summary:subdomains',
              delta: deltaSubdomains,
              previous: previous.summary?.subdomains ?? 0,
              current: latest.summary?.subdomains ?? 0,
              timestamp: latest.timestamp,
              severity: Math.abs(deltaSubdomains) >= 5 ? 'medium' : 'info'
            }));
          }
          const deltaPorts = (latest.summary?.openPorts ?? 0) - (previous.summary?.openPorts ?? 0);
          if (deltaPorts !== 0) {
            diffs.push(this._normalizeDiffEntry({
              type: 'summary:openPorts',
              delta: deltaPorts,
              previous: previous.summary?.openPorts ?? 0,
              current: latest.summary?.openPorts ?? 0,
              timestamp: latest.timestamp,
              severity: deltaPorts > 0 ? 'high' : 'info',
              critical: deltaPorts > 0
            }));
          }
          if (latest.summary?.primaryIp && latest.summary?.primaryIp !== previous.summary?.primaryIp) {
            diffs.push(this._normalizeDiffEntry({
              type: 'field:primaryIp',
              previous: previous.summary?.primaryIp ?? null,
              current: latest.summary?.primaryIp,
              timestamp: latest.timestamp,
              severity: 'high',
              critical: true
            }));
          }
          return diffs.slice(0, limit);
        }
      }
    } catch (error) {
      // ignore
    }

    return [];
  }

  _normalizeDiffEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return { type: 'unknown', severity: 'info', critical: false };
    }
    const normalized = { ...entry };
    normalized.severity = (entry.severity || 'info').toLowerCase();
    normalized.critical = entry.critical === true;
    if (!normalized.description && entry.type && entry.values) {
      normalized.description = `${entry.type}: ${Array.isArray(entry.values) ? entry.values.join(', ') : entry.values}`;
    }
    return normalized;
  }

  _collectStageSummaries(report) {
    const summaries = [];
    for (const [stageName, stageData] of Object.entries(report.results || {})) {
      const summary = this._summarizeStage(stageName, stageData);
      summaries.push({
        stage: stageName,
        status: stageData?.status || 'unknown',
        summary
      });
    }
    return summaries;
  }

  async generateClientReport(targetInput, options = {}) {
    const format = (options.format || 'markdown').toLowerCase();
    const diffLimit = options.diffLimit ?? 10;
    const normalized = this._normalizeTarget(
      typeof targetInput === 'string'
        ? targetInput
        : targetInput?.target || targetInput?.host || targetInput
    );
    const hostId = normalized.host;

    const report = options.report || (await this._loadLatestReport(hostId));
    if (!report) {
      throw new Error(`No recon report found for host "${hostId}"`);
    }

    const hostSummary = await this._loadHostSummary(hostId, report);
    const diffs = await this._loadRecentDiffs(hostId, diffLimit);
    const stages = this._collectStageSummaries(report);

    if (format === 'json') {
      return {
        host: hostSummary,
        report,
        diffs,
        stages
      };
    }

    return this._buildMarkdownReport(hostSummary, report, stages, diffs, options);
  }

  _buildMarkdownReport(hostSummary, report, stages, diffs, options) {
    const lines = [];
    const summary = hostSummary?.summary || this._buildHostRecord(report).summary;
    const fingerprint = hostSummary?.fingerprint || report.fingerprint || {};
    const target = hostSummary?.target || report.target.original;

    lines.push(`# Recon Report – ${target}`);
    lines.push('');
    lines.push(`- **Última execução:** ${report.endedAt}`);
    lines.push(`- **Status geral:** ${report.status || 'desconhecido'}`);
    if (summary.primaryIp) {
      lines.push(`- **IP primário:** ${summary.primaryIp}`);
    }
    if ((summary.ipAddresses || []).length > 1) {
      lines.push(`- **IPs adicionais:** ${summary.ipAddresses.slice(1).join(', ')}`);
    }
    if (summary.cdn) {
      lines.push(`- **CDN/WAF:** ${summary.cdn}`);
    }
    if (summary.server) {
      lines.push(`- **Servidor:** ${summary.server}`);
    }
    if (summary.latencyMs !== null && summary.latencyMs !== undefined) {
      lines.push(`- **Latência média:** ${summary.latencyMs.toFixed ? summary.latencyMs.toFixed(1) : summary.latencyMs} ms`);
    }
    if ((summary.technologies || []).length) {
      lines.push(`- **Tecnologias:** ${summary.technologies.join(', ')}`);
    }

    lines.push('');
    if ((summary.openPorts || []).length) {
      lines.push('## Portas abertas');
      lines.push('');
      lines.push('| Porta | Serviço | Detalhe |');
      lines.push('|-------|---------|---------|');
      for (const port of summary.openPorts) {
        const portLabel = port.port || port;
        const service = port.service || '';
        const detail = port.detail || port.version || '';
        lines.push(`| ${portLabel} | ${service} | ${detail} |`);
      }
      lines.push('');
    }

    if ((summary.subdomains || []).length) {
      lines.push('## Principais subdomínios');
      lines.push('');
      for (const sub of summary.subdomains.slice(0, 20)) {
        lines.push(`- ${sub}`);
      }
      if (summary.subdomainCount > 20) {
        lines.push(`- ... (+${summary.subdomainCount - 20} extras)`);
      }
      lines.push('');
    }

    if (stages.length) {
      lines.push('## Resumo por estágio');
      lines.push('');
      lines.push('| Estágio | Status | Observações |');
      lines.push('|---------|--------|-------------|');
      for (const stage of stages) {
        const status = stage.status || 'desconhecido';
        const notes = stage.summary && Object.keys(stage.summary).length
          ? Object.entries(stage.summary)
              .slice(0, 3)
              .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.length : value}`)
              .join('; ')
          : '';
        lines.push(`| ${stage.stage} | ${status} | ${notes} |`);
      }
      lines.push('');
    }

    if (diffs.length) {
      lines.push('## Mudanças recentes');
      lines.push('');
      for (const diff of diffs.slice(0, options.diffLimit ?? 10)) {
        lines.push(`- ${this._formatDiffEntry(diff)}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('_Gerado automaticamente pelo ReconPlugin._');
    lines.push('');

    return lines.join('\n');
  }

  _formatDiffEntry(diff) {
    if (!diff) return 'Mudança não especificada';
    const prefix = diff.severity === 'high' ? '🚨 ' : diff.severity === 'medium' ? '⚠️ ' : '';
    if (diff.description) {
      return `${prefix}${diff.description}`;
    }
    const type = diff.type || 'desconhecido';
    switch (type) {
      case 'subdomain:add':
        return `${prefix}Novos subdomínios: ${(diff.values || []).join(', ')}`;
      case 'subdomain:remove':
        return `${prefix}Subdomínios removidos: ${(diff.values || []).join(', ')}`;
      case 'port:add':
        return `${prefix}Novas portas expostas: ${(diff.values || []).join(', ')}`;
      case 'port:remove':
        return `${prefix}Portas fechadas: ${(diff.values || []).join(', ')}`;
      case 'technology:add':
        return `${prefix}Tecnologias adicionadas: ${(diff.values || []).join(', ')}`;
      case 'technology:remove':
        return `${prefix}Tecnologias removidas: ${(diff.values || []).join(', ')}`;
      case 'field:primaryIp':
        return `${prefix}IP primário alterado de ${diff.previous || 'desconhecido'} para ${diff.current || 'desconhecido'}`;
      case 'field:cdn':
        return `${prefix}CDN/WAF alterado de ${diff.previous || 'desconhecido'} para ${diff.current || 'desconhecido'}`;
      case 'field:server':
        return `${prefix}Servidor alterado de ${diff.previous || 'desconhecido'} para ${diff.current || 'desconhecido'}`;
      case 'summary:subdomains':
        return `${prefix}Contagem de subdomínios mudou de ${diff.previous} para ${diff.current}`;
      case 'summary:openPorts':
        return `${prefix}Contagem de portas abertas mudou de ${diff.previous} para ${diff.current}`;
      default:
        return `${prefix}${type}: ${diff.values ? diff.values.join(', ') : ''}`;
    }
  }

  _buildHostRecord(report) {
    const fingerprint = report.fingerprint || {};
    const summary = {
      target: report.target.original,
      primaryIp: fingerprint.primaryIp || null,
      ipAddresses: fingerprint.ipAddresses || [],
      cdn: fingerprint.cdn || null,
      server: fingerprint.server || null,
      latencyMs: fingerprint.latencyMs ?? null,
      subdomains: fingerprint.subdomains || [],
      subdomainCount: (fingerprint.subdomains || []).length,
      openPorts: fingerprint.openPorts || [],
      openPortCount: (fingerprint.openPorts || []).length,
      technologies: fingerprint.technologies || []
    };

    return {
      id: report.target.host,
      target: report.target.original,
      summary,
      fingerprint,
      lastScanAt: report.endedAt,
      storageKey: report.storageKey || null
    };
  }

  _computeDiffs(existingRecord, report) {
    const diffs = [];
    const prevFingerprint = existingRecord?.fingerprint || {};
    const currFingerprint = report.fingerprint || {};

    const prevSubs = new Set(prevFingerprint.subdomains || []);
    const currSubs = new Set(currFingerprint.subdomains || (report.results?.subdomains?.list || []));
    const addedSubs = [...currSubs].filter((value) => !prevSubs.has(value));
    const removedSubs = [...prevSubs].filter((value) => !currSubs.has(value));
    if (addedSubs.length) {
      diffs.push(this._createDiff('subdomain:add', {
        values: addedSubs,
        description: `Novos subdomínios: ${addedSubs.join(', ')}`
      }, { severity: 'medium', critical: false }));
    }
    if (removedSubs.length) {
      diffs.push(this._createDiff('subdomain:remove', {
        values: removedSubs,
        description: `Subdomínios removidos: ${removedSubs.join(', ')}`
      }, { severity: 'low', critical: false }));
    }

    const normalizePort = (entry) => {
      if (!entry) return entry;
      if (typeof entry === 'string') return entry;
      return entry.port || `${entry.service || 'unknown'}`;
    };
    const prevPorts = new Set((prevFingerprint.openPorts || []).map(normalizePort));
    const currPorts = new Set((currFingerprint.openPorts || []).map(normalizePort));
    const addedPorts = [...currPorts].filter((value) => !prevPorts.has(value));
    const removedPorts = [...prevPorts].filter((value) => !currPorts.has(value));
    if (addedPorts.length) {
      diffs.push(this._createDiff('port:add', {
        values: addedPorts,
        description: `Novas portas expostas: ${addedPorts.join(', ')}`
      }, { severity: 'high', critical: true }));
    }
    if (removedPorts.length) {
      diffs.push(this._createDiff('port:remove', {
        values: removedPorts,
        description: `Portas fechadas: ${removedPorts.join(', ')}`
      }, { severity: 'low', critical: false }));
    }

    const prevTech = new Set((prevFingerprint.technologies || []).map((tech) => tech.toLowerCase()));
    const currTech = new Set((currFingerprint.technologies || []).map((tech) => tech.toLowerCase()));
    const addedTech = [...currTech].filter((value) => !prevTech.has(value));
    const removedTech = [...prevTech].filter((value) => !currTech.has(value));
    if (addedTech.length) {
      diffs.push(this._createDiff('technology:add', {
        values: addedTech,
        description: `Tecnologias adicionadas: ${addedTech.join(', ')}`
      }, { severity: 'medium', critical: false }));
    }
    if (removedTech.length) {
      diffs.push(this._createDiff('technology:remove', {
        values: removedTech,
        description: `Tecnologias removidas: ${removedTech.join(', ')}`
      }, { severity: 'low', critical: false }));
    }

    const primitiveFields = ['primaryIp', 'cdn', 'server'];
    for (const field of primitiveFields) {
      const previous = prevFingerprint[field] ?? null;
      const current = currFingerprint[field] ?? null;
      if (previous !== current) {
        const severity = field === 'primaryIp' ? 'high' : 'medium';
        const critical = field === 'primaryIp';
        diffs.push(this._createDiff(`field:${field}`, {
          previous,
          current,
          description: `${field} alterado de ${previous ?? 'desconhecido'} para ${current ?? 'desconhecido'}`
        }, { severity, critical }));
      }
    }

    return diffs;
  }

  _createDiff(type, payload = {}, meta = {}) {
    const { severity = 'info', critical = false } = meta;
    return {
      type,
      severity,
      critical,
      ...payload
    };
  }

  async _saveDiffs(hostId, timestamp, diffs) {
    const diffsResource = await this._getResource('diffs');
    if (!diffsResource) return;
    const record = {
      id: `${hostId}|${timestamp}`,
      host: hostId,
      timestamp,
      changes: diffs,
      alerts: diffs.filter((diff) => diff.critical)
    };
    try {
      await diffsResource.insert(record);
    } catch (error) {
      try {
        await diffsResource.update(record.id, record);
      } catch (err) {
        if (typeof diffsResource.replace === 'function') {
          await diffsResource.replace(record.id, record);
        }
      }
    }
  }

  _summarizeStage(stageName, stageResult) {
    if (!stageResult) return null;
    const clone = this._deepClone(stageResult);
    const sanitized = this._stripRawFields(clone);

    if (stageName === 'subdomains' && Array.isArray(sanitized.list)) {
      sanitized.total = sanitized.list.length;
      sanitized.sample = sanitized.list.slice(0, 20);
      delete sanitized.list;
    }

    if (stageName === 'ports' && Array.isArray(sanitized.openPorts)) {
      sanitized.total = sanitized.openPorts.length;
      sanitized.sample = sanitized.openPorts.slice(0, 10);
    }

    if (stageName === 'webDiscovery' && Array.isArray(sanitized.paths)) {
      sanitized.total = sanitized.paths.length;
      sanitized.sample = sanitized.paths.slice(0, 20);
      delete sanitized.paths;
    }

    return sanitized;
  }

  _deepClone(value) {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (error) {
        // fallback
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  _stripRawFields(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => this._stripRawFields(entry));
    }
    if (value && typeof value === 'object') {
      const result = {};
      for (const [key, nested] of Object.entries(value)) {
        if (['raw', 'stderr', 'stdout'].includes(key)) {
          continue;
        }
        result[key] = this._stripRawFields(nested);
      }
      return result;
    }
    return value;
  }

  async _emitDiffAlerts(hostId, report, diffs) {
    const criticalDiffs = diffs.filter((diff) => diff.critical);
    if (!criticalDiffs.length) {
      return;
    }
    const alerts = criticalDiffs.map((diff) => ({
      host: hostId,
      stage: diff.type,
      severity: diff.severity || 'info',
      description: diff.description,
      values: diff.values || null,
      previous: diff.previous,
      current: diff.current,
      timestamp: report.endedAt,
      reportKey: report.storageKey || null
    }));

    for (const alert of alerts) {
      this.emit('recon:alert', alert);
    }
  }

  async _deleteResourceRecord(resource, id) {
    if (!resource || !id) return;
    const methods = ['delete', 'remove', 'del'];
    for (const method of methods) {
      if (typeof resource[method] === 'function') {
        try {
          await resource[method](id);
        } catch (error) {
          // ignore
        }
        return;
      }
    }
  }

  async _upsertResourceRecord(resource, record) {
    if (!resource || !record?.id) return;
    try {
      await resource.insert(record);
      return;
    } catch (error) {
      // fallthrough to update/replace
    }

    const methods = ['update', 'replace'];
    for (const method of methods) {
      if (typeof resource[method] !== 'function') {
        continue;
      }
      try {
        await resource[method](record.id, record);
        return;
      } catch (error) {
        // try next
      }
    }
  }

  async getHostSummary(targetInput, options = {}) {
    const normalized = this._normalizeTarget(
      typeof targetInput === 'string'
        ? targetInput
        : targetInput?.target || targetInput?.host || targetInput
    );
    const hostId = normalized.host;
    const report = options.report || (await this._loadLatestReport(hostId));
    if (!report) {
      return null;
    }
    const hostRecord = await this._loadHostSummary(hostId, report);
    if (!hostRecord) {
      return null;
    }
    if (options.includeDiffs) {
      hostRecord.diffs = await this._loadRecentDiffs(hostId, options.diffLimit ?? 10);
    }
    return hostRecord;
  }

  async getRecentAlerts(targetInput, options = {}) {
    const normalized = this._normalizeTarget(
      typeof targetInput === 'string'
        ? targetInput
        : targetInput?.target || targetInput?.host || targetInput
    );
    const hostId = normalized.host;
    const limit = options.limit ?? 5;
    const diffs = await this._loadRecentDiffs(hostId, limit * 2);
    return diffs.filter((diff) => diff.critical).slice(0, limit);
  }

  getApiRoutes(options = {}) {
    const normalizeBasePath = (value) => {
      if (value === undefined || value === null) {
        return '/recon';
      }
      const text = String(value).trim();
      if (!text || text === '/') {
        return '';
      }
      return `/${text.replace(/^\/+|\/+$/g, '')}`;
    };

    const buildPath = (base, suffix) => {
      const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
      const normalizedBase = base === '/' ? '' : base;
      const fullPath = `${normalizedBase ?? ''}${normalizedSuffix}`;
      return fullPath || '/';
    };

    const parseBoolean = (value, fallback) => {
      if (value === undefined || value === null) return fallback;
      if (typeof value === 'boolean') return value;
      const normalized = String(value).trim().toLowerCase();
      if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
      return fallback;
    };

    const parseLimit = (value, fallback, maxCap) => {
      if (value === undefined || value === null || value === '') {
        return fallback;
      }
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        return fallback;
      }
      if (typeof maxCap === 'number' && parsed > maxCap) {
        return maxCap;
      }
      return parsed;
    };

    const basePath = normalizeBasePath(options.basePath);
    const includeDiffsDefault = options.includeDiffs ?? true;
    const includeReportDefault = options.includeReport ?? true;
    const includeStagesDefault = options.includeStages ?? true;
    const includeAlertsDefault = options.includeAlerts ?? true;
    const includePathsDefault = options.includePaths ?? false;
    const diffLimitDefault = options.diffLimit ?? 10;
    const alertLimitDefault = options.alertLimit ?? 5;
    const maxDiffLimit = options.maxDiffLimit ?? 50;
    const maxAlertLimit = options.maxAlertLimit ?? 25;
    const plugin = this;

    return {
      [`GET ${buildPath(basePath, '/hosts/:hostId/summary')}`]: async (c, ctx) => {
        const hostId = ctx.param('hostId');
        if (!hostId) {
          return ctx.error('hostId param is required', 400);
        }

        if (!plugin.database) {
          return ctx.error('ReconPlugin is not installed in this database', 500);
        }

        const includeDiffs = parseBoolean(ctx.query('includeDiffs'), includeDiffsDefault);
        const includeReport = parseBoolean(ctx.query('includeReport'), includeReportDefault);
        const includeStages = parseBoolean(ctx.query('includeStages'), includeStagesDefault);
        const includeAlerts = parseBoolean(ctx.query('includeAlerts'), includeAlertsDefault);
        const includePaths = parseBoolean(ctx.query('includePaths'), includePathsDefault);
        const diffLimit = parseLimit(ctx.query('diffLimit'), diffLimitDefault, maxDiffLimit);
        const alertLimit = parseLimit(ctx.query('alertLimit'), alertLimitDefault, maxAlertLimit);

        try {
          const hostSummary = await plugin.getHostSummary(hostId, {
            includeDiffs,
            diffLimit
          });

          if (!hostSummary) {
            return ctx.notFound(`No recon report found for "${hostId}"`);
          }

          const host = plugin._deepClone(hostSummary);
          let diffs = [];

          if (includeDiffs) {
            if (Array.isArray(host.diffs)) {
              diffs = host.diffs.slice(0, diffLimit);
            } else {
              diffs = await plugin._loadRecentDiffs(hostId, diffLimit);
            }
          }

          delete host.diffs;

          const latestReport = await plugin._loadLatestReport(hostId);
          const report =
            includeReport && latestReport
              ? plugin._stripRawFields(plugin._deepClone(latestReport))
              : null;

          const stages =
            includeStages && latestReport
              ? plugin._collectStageSummaries(latestReport)
              : [];

          const alerts =
            includeAlerts && alertLimit > 0
              ? await plugin.getRecentAlerts(hostId, { limit: alertLimit })
              : [];

          const webDiscoveryStage = report.results?.webDiscovery || {};
          const pathsPayload = includePaths
            ? {
                items: Array.isArray(webDiscoveryStage.paths) ? webDiscoveryStage.paths : [],
                total: Array.isArray(webDiscoveryStage.paths) ? webDiscoveryStage.paths.length : 0,
                sources: plugin._stripRawFields(webDiscoveryStage.tools || webDiscoveryStage.sources || {})
              }
            : undefined;

          return ctx.success({
            host,
            report,
            stages,
            diffs,
            alerts,
            paths: pathsPayload
          });
        } catch (error) {
          plugin.emit('recon:api-error', {
            host: hostId,
            message: error?.message || 'Failed to load recon summary',
            stack: error?.stack
          });
          return ctx.error('Failed to load recon summary', 500);
        }
      }
    };
  }

  async _gatherDns(target) {
    const result = {
      status: 'ok',
      records: {},
      errors: {}
    };

    try {
      const lookups = await Promise.allSettled([
        dns.lookup(target.host, { all: true }),
        dns.resolve4(target.host),
        dns.resolve6(target.host).catch(() => []),
        dns.resolveNs(target.host).catch(() => []),
        dns.resolveMx(target.host).catch(() => []),
        dns.resolveTxt(target.host).catch(() => [])
      ]);

      const [lookupAll, aRecords, aaaaRecords, nsRecords, mxRecords, txtRecords] = lookups;

      if (lookupAll.status === 'fulfilled') {
        result.records.lookup = lookupAll.value;
      } else {
        result.errors.lookup = lookupAll.reason?.message;
      }

      result.records.a = aRecords.status === 'fulfilled' ? aRecords.value : [];
      if (aRecords.status === 'rejected') {
        result.errors.a = aRecords.reason?.message;
      }

      result.records.aaaa = aaaaRecords.status === 'fulfilled' ? aaaaRecords.value : [];
      if (aaaaRecords.status === 'rejected') {
        result.errors.aaaa = aaaaRecords.reason?.message;
      }

      result.records.ns = nsRecords.status === 'fulfilled' ? nsRecords.value : [];
      if (nsRecords.status === 'rejected') {
        result.errors.ns = nsRecords.reason?.message;
      }

      result.records.mx = mxRecords.status === 'fulfilled' ? mxRecords.value : [];
      if (mxRecords.status === 'rejected') {
        result.errors.mx = mxRecords.reason?.message;
      }

      result.records.txt = txtRecords.status === 'fulfilled' ? txtRecords.value : [];
      if (txtRecords.status === 'rejected') {
        result.errors.txt = txtRecords.reason?.message;
      }

      const allIps = [
        ...(result.records.a || []),
        ...(result.records.aaaa || [])
      ];

      if (allIps.length > 0) {
        const reverseLookups = await Promise.allSettled(
          allIps.map(async (ip) => {
            try {
              const hosts = await dns.reverse(ip);
              return { ip, hosts };
            } catch (error) {
              return { ip, hosts: [], error };
            }
          })
        );

        result.records.reverse = {};
        for (const entry of reverseLookups) {
          if (entry.status === 'fulfilled') {
            const { ip, hosts, error } = entry.value;
            result.records.reverse[ip] = hosts;
            if (error) {
              result.errors[`reverse:${ip}`] = error?.message;
            }
          } else if (entry.reason?.ip) {
            result.records.reverse[entry.reason.ip] = [];
            result.errors[`reverse:${entry.reason.ip}`] = entry.reason.error?.message;
          }
        }
      } else {
        result.records.reverse = {};
      }
    } catch (error) {
      result.status = 'error';
      result.message = error?.message || 'DNS lookup failed';
    }

    return result;
  }

  async _gatherCertificate(target) {
    const shouldCheckTls =
      target.protocol === 'https' ||
      (!target.protocol && (target.port === 443 || target.host.includes(':') === false));

    if (!shouldCheckTls) {
      return {
        status: 'skipped',
        message: 'TLS inspection skipped for non-HTTPS target'
      };
    }

    const port = target.port || 443;

    return new Promise((resolve) => {
      const socket = tls.connect(
        {
          host: target.host,
          port,
          servername: target.host,
          rejectUnauthorized: false,
          timeout: 5000
        },
        () => {
          const certificate = socket.getPeerCertificate(true);
          socket.end();
          if (!certificate || Object.keys(certificate).length === 0) {
            resolve({
              status: 'error',
              message: 'No certificate information available'
            });
            return;
          }

          resolve({
            status: 'ok',
            subject: certificate.subject,
            issuer: certificate.issuer,
            validFrom: certificate.valid_from,
            validTo: certificate.valid_to,
            fingerprint: certificate.fingerprint256 || certificate.fingerprint,
            subjectAltName: certificate.subjectaltname
              ? certificate.subjectaltname.split(',').map((entry) => entry.trim())
              : [],
            raw: certificate
          });
        }
      );

      socket.on('error', (error) => {
        resolve({
          status: 'error',
          message: error?.message || 'Unable to retrieve certificate'
        });
      });

      socket.setTimeout(6000, () => {
        socket.destroy();
        resolve({
          status: 'timeout',
          message: 'TLS handshake timed out'
        });
      });
    });
  }

  async _runPing(target) {
    const args = ['-n', '-c', String(this.config.ping.count), target.host];
    const run = await this.commandRunner.run('ping', args, {
      timeout: this.config.ping.timeout
    });

    if (!run.ok) {
      return {
        status: 'unavailable',
        message: run.error?.message || 'Ping failed',
        stderr: run.stderr
      };
    }

    const metrics = this._parsePingOutput(run.stdout);

    return {
      status: 'ok',
      stdout: run.stdout,
      metrics
    };
  }

  async _runTraceroute(target) {
    if (await this.commandRunner.isAvailable('mtr')) {
      const args = [
        '--report',
        '--report-cycles',
        String(this.config.traceroute.cycles),
        '--json',
        target.host
      ];
      const mtrResult = await this.commandRunner.run('mtr', args, {
        timeout: this.config.traceroute.timeout,
        maxBuffer: 4 * 1024 * 1024
      });

      if (mtrResult.ok) {
        try {
          const parsed = JSON.parse(mtrResult.stdout);
          return {
            status: 'ok',
            type: 'mtr',
            report: parsed
          };
        } catch (error) {
          // Fallback to plain text interpretation
          return {
            status: 'ok',
            type: 'mtr',
            stdout: mtrResult.stdout
          };
        }
      }
    }

    if (await this.commandRunner.isAvailable('traceroute')) {
      const tracerouteResult = await this.commandRunner.run(
        'traceroute',
        ['-n', target.host],
        {
          timeout: this.config.traceroute.timeout
        }
      );

      if (tracerouteResult.ok) {
        return {
          status: 'ok',
          type: 'traceroute',
          stdout: tracerouteResult.stdout
        };
      }
      return {
        status: 'error',
        message: tracerouteResult.error?.message || 'Traceroute failed',
        stderr: tracerouteResult.stderr
      };
    }

    return {
      status: 'unavailable',
      message: 'mtr/traceroute commands not available'
    };
  }

  async _runSubdomainRecon(target, featureConfig = {}) {
    const aggregated = new Set();
    const sources = {};

    const executeCliCollector = async (name, command, args, parser) => {
      if (!featureConfig[name]) {
        return;
      }
      const run = await this.commandRunner.run(command, args, { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      if (!run.ok) {
        sources[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      const items = parser(run.stdout, run.stderr);
      items.forEach((item) => aggregated.add(item));
      sources[name] = {
        status: 'ok',
        count: items.length,
        sample: items.slice(0, 10)
      };
      if (this.config.storage.persistRawOutput) {
        sources[name].raw = this._truncateOutput(run.stdout);
      }
    };

    await executeCliCollector('amass', 'amass', ['enum', '-d', target.host, '-o', '-'], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    await executeCliCollector('subfinder', 'subfinder', ['-d', target.host, '-silent'], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    await executeCliCollector('assetfinder', 'assetfinder', ['--subs-only', target.host], (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );

    if (featureConfig.crtsh) {
      try {
        const response = await fetch(`https://crt.sh/?q=%25.${target.host}&output=json`, {
          headers: { 'User-Agent': this.config.curl.userAgent },
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });
        if (response.ok) {
          const data = await response.json();
          const entries = Array.isArray(data) ? data : [];
          const hostnames = entries
            .map((entry) => entry.name_value)
            .filter(Boolean)
            .flatMap((value) => value.split('\n'))
            .map((value) => value.trim())
            .filter(Boolean);
          hostnames.forEach((hostname) => aggregated.add(hostname));
          sources.crtsh = {
            status: 'ok',
            count: hostnames.length,
            sample: hostnames.slice(0, 10)
          };
        } else {
          sources.crtsh = {
            status: 'error',
            message: `crt.sh responded with status ${response.status}`
          };
        }
      } catch (error) {
        sources.crtsh = {
          status: 'error',
          message: error?.message || 'crt.sh lookup failed'
        };
      }
    }

    const list = Array.from(aggregated).sort();

    return {
      status: list.length > 0 ? 'ok' : 'empty',
      total: list.length,
      list,
      sources
    };
  }

  async _runPortScans(target, featureConfig = {}) {
    const scanners = {};
    const openPorts = new Map();

    if (featureConfig.nmap) {
      const result = await this._runNmap(target, { extraArgs: featureConfig.nmapArgs });
      scanners.nmap = result;
      if (result.status === 'ok' && Array.isArray(result.summary?.openPorts)) {
        for (const entry of result.summary.openPorts) {
          openPorts.set(entry.port, entry);
        }
      }
    }

    if (featureConfig.masscan) {
      const result = await this._runMasscan(target, featureConfig.masscan);
      scanners.masscan = result;
      if (result.status === 'ok' && Array.isArray(result.openPorts)) {
        for (const entry of result.openPorts) {
          if (!openPorts.has(entry.port)) {
            openPorts.set(entry.port, entry);
          }
        }
      }
    }

    return {
      status: openPorts.size > 0 ? 'ok' : 'empty',
      openPorts: Array.from(openPorts.values()),
      scanners
    };
  }

  async _runCurl(target) {
    const url = this._buildUrl(target);
    const args = [
      '-I',
      '-sS',
      '-L',
      '--max-time',
      String(Math.ceil(this.config.curl.timeout / 1000)),
      '--user-agent',
      this.config.curl.userAgent,
      url
    ];

    const result = await this.commandRunner.run('curl', args, {
      timeout: this.config.curl.timeout
    });

    if (!result.ok) {
      return {
        status: 'unavailable',
        message: result.error?.message || 'curl failed',
        stderr: result.stderr
      };
    }

    const headers = this._parseCurlHeaders(result.stdout);

    return {
      status: 'ok',
      url,
      headers,
      raw: this.config.storage.persistRawOutput ? this._truncateOutput(result.stdout) : undefined
    };
  }

  async _runNmap(target, options = {}) {
    if (!(await this.commandRunner.isAvailable('nmap'))) {
      return {
        status: 'unavailable',
        message: 'nmap is not available on this system'
      };
    }

    const topPorts = options.topPorts ?? this.config.nmap.topPorts;
    const extraArgs = options.extraArgs ?? this.config.nmap.extraArgs;

    const args = [
      '-Pn',
      '--top-ports',
      String(topPorts),
      target.host,
      ...extraArgs
    ];

    const result = await this.commandRunner.run('nmap', args, {
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024
    });

    if (!result.ok) {
      return {
        status: 'error',
        message: result.error?.message || 'nmap scan failed',
        stderr: result.stderr
      };
    }

    return {
      status: 'ok',
      summary: this._parseNmapOutput(result.stdout),
      raw: this.config.storage.persistRawOutput ? this._truncateOutput(result.stdout) : undefined
    };
  }

  async _runMasscan(target, featureConfig = {}) {
    if (!(await this.commandRunner.isAvailable('masscan'))) {
      return {
        status: 'unavailable',
        message: 'masscan is not available on this system'
      };
    }

    const ports = featureConfig.ports ?? '1-65535';
    const rate = featureConfig.rate ?? 1000;

    const args = ['-p', ports, target.host, '--rate', String(rate), '--wait', '0'];
    const result = await this.commandRunner.run('masscan', args, {
      timeout: featureConfig.timeout ?? 30000,
      maxBuffer: 4 * 1024 * 1024
    });

    if (!result.ok) {
      return {
        status: result.error?.code === 'ENOENT' ? 'unavailable' : 'error',
        message: result.error?.message || 'masscan scan failed',
        stderr: result.stderr
      };
    }

    const openPorts = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.toLowerCase().startsWith('discovered open port'))
      .map((line) => {
        const parts = line.split(' ');
        const portProto = parts[3];
        const ip = parts[5];
        return {
          port: portProto,
          ip
        };
      });

    return {
      status: openPorts.length ? 'ok' : 'empty',
      openPorts,
      raw: this.config.storage.persistRawOutput ? this._truncateOutput(result.stdout) : undefined
    };
  }

  async _runWebDiscovery(target, featureConfig = {}) {
    if (!featureConfig) {
      return { status: 'disabled' };
    }

    const tools = {};
    const discovered = {};
    const allPaths = new Set();
    const wordlist = featureConfig.wordlist;
    const threads = featureConfig.threads ?? 50;

    const runDirBuster = async (name, command, args) => {
      const run = await this.commandRunner.run(command, args, {
        timeout: featureConfig.timeout ?? 60000,
        maxBuffer: 8 * 1024 * 1024
      });
      if (!run.ok) {
        tools[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      const findings = run.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      discovered[name] = findings;
      findings.forEach((item) => allPaths.add(item));
      tools[name] = {
        status: 'ok',
        count: findings.length,
        sample: findings.slice(0, 10)
      };
      if (this.config.storage.persistRawOutput) {
        tools[name].raw = this._truncateOutput(run.stdout);
      }
    };

    if (featureConfig.ffuf && wordlist) {
      await runDirBuster('ffuf', 'ffuf', ['-u', `${this._buildUrl(target)}/FUZZ`, '-w', wordlist, '-t', String(threads), '-mc', '200,204,301,302,307,401,403']);
    }

    if (featureConfig.feroxbuster && wordlist) {
      await runDirBuster('feroxbuster', 'feroxbuster', ['-u', this._buildUrl(target), '-w', wordlist, '--threads', String(threads), '--silent']);
    }

    if (featureConfig.gobuster && wordlist) {
      await runDirBuster('gobuster', 'gobuster', ['dir', '-u', this._buildUrl(target), '-w', wordlist, '-t', String(threads)]);
    }

    const total = Object.values(discovered).reduce((acc, list) => acc + list.length, 0);

    if (!total) {
      return {
        status: wordlist ? 'empty' : 'skipped',
        message: wordlist ? 'No endpoints discovered' : 'Wordlist not provided',
        tools
      };
    }

    const paths = Array.from(allPaths);

    return {
      status: 'ok',
      total,
      tools,
      paths
    };
  }

  async _runVulnerabilityScans(target, featureConfig = {}) {
    const tools = {};

    const execute = async (name, command, args) => {
      const run = await this.commandRunner.run(command, args, {
        timeout: featureConfig.timeout ?? 60000,
        maxBuffer: 8 * 1024 * 1024
      });
      if (!run.ok) {
        tools[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      tools[name] = {
        status: 'ok'
      };
      if (this.config.storage.persistRawOutput) {
        tools[name].raw = this._truncateOutput(run.stdout);
      }
    };

    if (featureConfig.nikto) {
      await execute('nikto', 'nikto', ['-h', this._buildUrl(target), '-ask', 'no']);
    }

    if (featureConfig.wpscan) {
      await execute('wpscan', 'wpscan', ['--url', this._buildUrl(target), '--random-user-agent']);
    }

    if (featureConfig.droopescan) {
      await execute('droopescan', 'droopescan', ['scan', 'drupal', '-u', this._buildUrl(target)]);
    }

    if (Object.keys(tools).length === 0) {
      return { status: 'skipped' };
    }

    return {
      status: Object.values(tools).some((tool) => tool.status === 'ok') ? 'ok' : 'empty',
      tools
    };
  }

  async _runTlsExtras(target, featureConfig = {}) {
    const tools = {};
    const port = target.port || 443;

    const execute = async (name, command, args) => {
      const run = await this.commandRunner.run(command, args, {
        timeout: featureConfig.timeout ?? 20000,
        maxBuffer: 4 * 1024 * 1024
      });
      if (!run.ok) {
        tools[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      tools[name] = {
        status: 'ok'
      };
      if (this.config.storage.persistRawOutput) {
        tools[name].raw = this._truncateOutput(run.stdout);
      }
    };

    if (featureConfig.openssl) {
      await execute('openssl', 'openssl', ['s_client', '-servername', target.host, '-connect', `${target.host}:${port}`, '-brief']);
    }

    if (featureConfig.sslyze) {
      await execute('sslyze', 'sslyze', [target.host]);
    }

    if (featureConfig.testssl) {
      await execute('testssl', 'testssl.sh', ['--quiet', `${target.host}:${port}`]);
    }

    if (Object.keys(tools).length === 0) {
      return { status: 'skipped' };
    }

    return {
      status: Object.values(tools).some((tool) => tool.status === 'ok') ? 'ok' : 'empty',
      tools
    };
  }

  async _runFingerprintTools(target, featureConfig = {}) {
    const technologies = new Set();
    const tools = {};

    if (featureConfig.whatweb) {
      const run = await this.commandRunner.run('whatweb', ['-q', this._buildUrl(target)], {
        timeout: featureConfig.timeout ?? 20000,
        maxBuffer: 2 * 1024 * 1024
      });
      if (run.ok) {
        const parsed = run.stdout
          .split(/[\r\n]+/)
          .flatMap((line) => line.split(' '))
          .map((token) => token.trim())
          .filter((token) => token.includes('[') && token.includes(']'))
          .map((token) => token.substring(0, token.indexOf('[')));
        parsed.forEach((tech) => technologies.add(tech));
        tools.whatweb = { status: 'ok', technologies: parsed.slice(0, 20) };
        if (this.config.storage.persistRawOutput) {
          tools.whatweb.raw = this._truncateOutput(run.stdout);
        }
      } else {
        tools.whatweb = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || 'whatweb failed'
        };
      }
    }

    if (technologies.size === 0 && Object.keys(tools).length === 0) {
      return { status: 'skipped' };
    }

    return {
      status: technologies.size ? 'ok' : 'empty',
      technologies: Array.from(technologies),
      tools
    };
  }

  async _runScreenshotCapture(target, featureConfig = {}) {
    if (!featureConfig.aquatone && !featureConfig.eyewitness) {
      return { status: 'skipped' };
    }

    const screenshots = {};
    const hostsFile = await this._writeTempHostsFile([this._buildUrl(target)]);

    const execute = async (name, command, args) => {
      const run = await this.commandRunner.run(command, args, {
        timeout: featureConfig.timeout ?? 60000,
        maxBuffer: 4 * 1024 * 1024
      });
      if (!run.ok) {
        screenshots[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`
        };
        return;
      }
      screenshots[name] = { status: 'ok' };
    };

    if (featureConfig.aquatone) {
      const outputDir = featureConfig.outputDir || path.join(os.tmpdir(), `aquatone-${randomUUID()}`);
      await fs.mkdir(outputDir, { recursive: true });
      await execute('aquatone', 'aquatone', ['-scan-timeout', '20000', '-out', outputDir, '-list', hostsFile]);
      screenshots.aquatone.outputDir = outputDir;
    }

    if (featureConfig.eyewitness) {
      const outputDir = featureConfig.outputDir || path.join(os.tmpdir(), `eyewitness-${randomUUID()}`);
      await fs.mkdir(outputDir, { recursive: true });
      await execute('eyewitness', 'EyeWitness', ['--web', '--timeout', '20', '--threads', '5', '--headless', '-f', hostsFile, '-d', outputDir]);
      screenshots.eyewitness = { status: 'ok', outputDir };
    }

    await fs.rm(hostsFile, { force: true });

    if (Object.values(screenshots).some((entry) => entry.status === 'ok')) {
      return {
        status: 'ok',
        tools: screenshots
      };
    }

    return {
      status: 'empty',
      tools: screenshots
    };
  }

  async _runOsintRecon(target, featureConfig = {}) {
    const tools = {};

    if (featureConfig.theHarvester) {
      const run = await this.commandRunner.run('theHarvester', ['-d', target.host, '-b', 'all'], {
        timeout: featureConfig.timeout ?? 60000,
        maxBuffer: 4 * 1024 * 1024
      });
      if (run.ok) {
        tools.theHarvester = {
          status: 'ok'
        };
        if (this.config.storage.persistRawOutput) {
          tools.theHarvester.raw = this._truncateOutput(run.stdout);
        }
      } else {
        tools.theHarvester = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || 'theHarvester failed'
        };
      }
    }

    if (featureConfig.reconNg) {
      tools.reconNg = {
        status: 'manual',
        message: 'recon-ng requires interactive scripting; run via custom scripts'
      };
    }

    if (Object.keys(tools).length === 0) {
      return { status: 'skipped' };
    }

    return {
      status: Object.values(tools).some((entry) => entry.status === 'ok') ? 'ok' : 'empty',
      tools
    };
  }

  async _writeTempHostsFile(hosts) {
    const filePath = path.join(os.tmpdir(), `recon-plugin-${randomUUID()}.txt`);
    await fs.writeFile(filePath, hosts.join('\n'), { encoding: 'utf8' });
    return filePath;
  }

  _truncateOutput(text, limit = 32768) {
    if (typeof text !== 'string') {
      return text;
    }
    if (text.length <= limit) {
      return text;
    }
    return `${text.slice(0, limit)}\n… truncated ${text.length - limit} characters`;
  }

  _buildFingerprint(target, results) {
    const summary = {
      target: target.host,
      primaryIp: null,
      ipAddresses: [],
      cdn: null,
      server: null,
      technologies: [],
      openPorts: [],
      latencyMs: null,
      certificate: null,
      notes: [],
      pathCount: 0,
      pathsSample: []
    };

    const dnsInfo = results.dns;
    const curlInfo = results.curl;
    const pingInfo = results.ping;
    const portsInfo = results.ports;
    const certificateInfo = results.certificate;
    const subdomainInfo = results.subdomains;
    const fingerprintTools = results.fingerprintTools;
    const webDiscoveryInfo = results.webDiscovery;

    if (dnsInfo?.records?.a?.length) {
      summary.ipAddresses.push(...dnsInfo.records.a);
      summary.primaryIp = dnsInfo.records.a[0];
    } else if (dnsInfo?.records?.lookup?.length) {
      summary.ipAddresses.push(...dnsInfo.records.lookup.map((entry) => entry.address));
      summary.primaryIp = summary.ipAddresses[0] || null;
    }

    if (pingInfo?.metrics?.avg !== undefined) {
      summary.latencyMs = pingInfo.metrics.avg;
    }

    if (certificateInfo?.status === 'ok') {
      summary.certificate = {
        subject: certificateInfo.subject,
        issuer: certificateInfo.issuer,
        validFrom: certificateInfo.validFrom,
        validTo: certificateInfo.validTo
      };
    }

    if (curlInfo?.headers) {
      if (curlInfo.headers.server) {
        summary.server = curlInfo.headers.server;
        summary.technologies.push(curlInfo.headers.server);
      }
      if (curlInfo.headers['x-powered-by']) {
        summary.technologies.push(curlInfo.headers['x-powered-by']);
      }
      if (curlInfo.headers['cf-cache-status'] || curlInfo.headers['cf-ray']) {
        summary.cdn = 'Cloudflare';
      }
      if (!summary.cdn && curlInfo.headers.via?.includes('cloudfront.net')) {
        summary.cdn = 'AWS CloudFront';
      }
      if (!summary.cdn && curlInfo.headers['x-akamai-request-id']) {
        summary.cdn = 'Akamai';
      }
      if (curlInfo.headers['x-cache']) {
        summary.notes.push(`Cache hint: ${curlInfo.headers['x-cache']}`);
      }
    }

    if (portsInfo?.openPorts?.length) {
      summary.openPorts = portsInfo.openPorts;
      if (portsInfo.scanners?.nmap?.summary?.detectedServices) {
        summary.technologies.push(...portsInfo.scanners.nmap.summary.detectedServices);
      }
    }

    if (subdomainInfo?.list) {
      summary.subdomains = subdomainInfo.list;
      summary.subdomainCount = subdomainInfo.list.length;
      summary.subdomainsSample = subdomainInfo.list.slice(0, 20);
    } else {
      summary.subdomains = [];
      summary.subdomainCount = 0;
      summary.subdomainsSample = [];
    }

    if (Array.isArray(webDiscoveryInfo?.paths)) {
      summary.pathCount = webDiscoveryInfo.paths.length;
      summary.pathsSample = webDiscoveryInfo.paths.slice(0, 20);
    } else {
      summary.pathCount = 0;
      summary.pathsSample = [];
    }

    if (fingerprintTools?.technologies) {
      summary.technologies.push(...fingerprintTools.technologies);
    }

    const reverseRecords = dnsInfo?.records?.reverse || {};
    const relatedDomains = Object.values(reverseRecords)
      .flat()
      .filter(Boolean);

    if (relatedDomains.length > 0) {
      summary.relatedHosts = Array.from(new Set(relatedDomains));
    } else {
      summary.relatedHosts = [];
    }

    summary.technologies = Array.from(
      new Set(
        summary.technologies
          .filter(Boolean)
          .flatMap((value) => value.split(',').map((v) => v.trim()).filter(Boolean))
      )
    );

    summary.ipAddresses = Array.from(new Set(summary.ipAddresses));
    summary.openPorts = summary.openPorts || [];

    return summary;
  }

  _parsePingOutput(text) {
    const metrics = {
      packetsTransmitted: null,
      packetsReceived: null,
      packetLoss: null,
      min: null,
      avg: null,
      max: null,
      stdDev: null
    };

    const packetLine = text.split('\n').find((line) => line.includes('packets transmitted'));
    if (packetLine) {
      const match = packetLine.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+received,.*?([\d.]+)% packet loss/);
      if (match) {
        metrics.packetsTransmitted = Number(match[1]);
        metrics.packetsReceived = Number(match[2]);
        metrics.packetLoss = Number(match[3]);
      }
    }

    const statsLine = text.split('\n').find((line) => line.includes('min/avg/max'));
    if (statsLine) {
      const match = statsLine.match(/=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      if (match) {
        metrics.min = Number(match[1]);
        metrics.avg = Number(match[2]);
        metrics.max = Number(match[3]);
        metrics.stdDev = Number(match[4]);
      }
    }

    return metrics;
  }

  _parseCurlHeaders(raw) {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const headers = {};
    for (const line of lines) {
      if (!line.includes(':')) continue;
      const [key, ...rest] = line.split(':');
      headers[key.trim().toLowerCase()] = rest.join(':').trim();
    }
    return headers;
  }

  _parseNmapOutput(raw) {
    const lines = raw.split('\n');
    const openPorts = [];
    const detectedServices = [];

    for (const line of lines) {
      const match = line.match(/^(\d+\/[a-z]+)\s+(open|filtered|closed)\s+([^\s]+)(.*)$/);
      if (match && match[2] === 'open') {
        const port = match[1];
        const service = match[3];
        const detail = match[4]?.trim();
        openPorts.push({ port, service, detail });
        detectedServices.push(`${service}${detail ? ` ${detail}` : ''}`.trim());
      }
    }

    return {
      openPorts,
      detectedServices: Array.from(new Set(detectedServices))
    };
  }

  _normalizeTarget(target) {
    if (!target || typeof target !== 'string') {
      throw new Error('Target must be a non-empty string');
    }

    let url;
    try {
      url = new URL(target.includes('://') ? target : `https://${target}`);
    } catch (error) {
      url = new URL(`https://${target}`);
    }

    const protocol = url.protocol ? url.protocol.replace(':', '') : null;
    const host = url.hostname || target;
    const port = url.port ? Number(url.port) : this._defaultPortForProtocol(protocol);

    return {
      original: target,
      host,
      protocol,
      port,
      path: url.pathname === '/' ? null : url.pathname
    };
  }

  _buildUrl(target) {
    const protocol = target.protocol || (target.port === 443 ? 'https' : 'http');
    const portPart =
      target.port && ![80, 443].includes(target.port) ? `:${target.port}` : '';
    return `${protocol}://${target.host}${portPart}${target.path ?? ''}`;
  }

  _defaultPortForProtocol(protocol) {
    switch (protocol) {
      case 'https':
        return 443;
      case 'http':
        return 80;
      default:
        return null;
    }
  }
}

export { ReconPlugin as NetworkPlugin };
export default ReconPlugin;
