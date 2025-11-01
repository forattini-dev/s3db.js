/**
 * TargetManager
 *
 * Handles dynamic target management:
 * - CRUD operations for targets
 * - Target normalization
 * - Resource persistence
 */

export class TargetManager {
  constructor(plugin) {
    this.plugin = plugin;
  }

  /**
   * Add a new target to the monitoring list
   */
  async add(targetInput, options = {}) {
    const normalized = this._normalizeTarget(targetInput);
    const targetId = normalized.host;

    // Check if target already exists
    const existing = await this.get(targetInput);
    if (existing) {
      throw new Error(`Target "${targetId}" already exists. Use updateTarget() to modify it.`);
    }

    const targetRecord = {
      id: targetId,
      target: targetInput,
      enabled: options.enabled !== false,
      behavior: options.behavior || this.plugin.config.behavior,
      features: options.features || {},
      tools: options.tools || null,
      schedule: options.schedule || null,
      metadata: options.metadata || {},
      lastScanAt: null,
      lastScanStatus: null,
      scanCount: 0,
      addedBy: options.addedBy || 'manual',
      tags: options.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const targetsResource = await this._getResource();
    await targetsResource.insert(targetRecord);

    this.plugin.emit('recon:target-added', {
      targetId,
      target: targetInput,
      enabled: targetRecord.enabled,
      behavior: targetRecord.behavior
    });

    return targetRecord;
  }

  /**
   * Remove a target from the monitoring list
   */
  async remove(targetInput) {
    const normalized = this._normalizeTarget(targetInput);
    const targetId = normalized.host;

    const targetsResource = await this._getResource();
    await targetsResource.delete(targetId);

    this.plugin.emit('recon:target-removed', {
      targetId,
      target: targetInput
    });

    return { targetId, removed: true };
  }

  /**
   * Update target configuration
   */
  async update(targetInput, updates) {
    const normalized = this._normalizeTarget(targetInput);
    const targetId = normalized.host;

    const existing = await this.get(targetInput);
    if (!existing) {
      throw new Error(`Target "${targetId}" not found. Use addTarget() to create it.`);
    }

    const updatedRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const targetsResource = await this._getResource();
    await targetsResource.update(targetId, updatedRecord);

    this.plugin.emit('recon:target-updated', {
      targetId,
      updates
    });

    return updatedRecord;
  }

  /**
   * List all configured targets
   */
  async list(options = {}) {
    const includeDisabled = options.includeDisabled !== false;
    const fromResource = options.fromResource !== false;
    const limit = options.limit || 1000;

    if (!fromResource) {
      // Fallback to config targets (legacy mode)
      return this._normalizeConfigTargets();
    }

    try {
      const targetsResource = await this._getResource();
      let targets = await targetsResource.list({ limit });

      if (!includeDisabled) {
        targets = targets.filter(t => t.enabled !== false);
      }

      return targets;
    } catch (error) {
      // Fallback to config targets if resource not available
      return this._normalizeConfigTargets();
    }
  }

  /**
   * Get details of a specific target
   */
  async get(targetInput) {
    const normalized = this._normalizeTarget(targetInput);
    const targetId = normalized.host;

    try {
      const targetsResource = await this._getResource();
      return await targetsResource.get(targetId);
    } catch (error) {
      // Check if it exists in config targets (legacy mode)
      const configTargets = this._normalizeConfigTargets();
      return configTargets.find(t => t.id === targetId) || null;
    }
  }

  /**
   * Increment scan count and update last scan metadata
   */
  async updateScanMetadata(targetId, report) {
    try {
      const target = await this.get(targetId);
      if (!target) {
        return;
      }

      await this.update(targetId, {
        lastScanAt: report.endedAt,
        lastScanStatus: report.status,
        scanCount: (target.scanCount || 0) + 1
      });
    } catch (error) {
      // Ignore errors (target might not be in resource)
    }
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  async _getResource() {
    return await this.plugin._getResource('targets');
  }

  _normalizeTarget(targetInput) {
    if (!targetInput || typeof targetInput !== 'string') {
      throw new Error('Target must be a non-empty string');
    }

    let url;
    try {
      url = new URL(targetInput.includes('://') ? targetInput : `https://${targetInput}`);
    } catch (error) {
      url = new URL(`https://${targetInput}`);
    }

    const protocol = url.protocol ? url.protocol.replace(':', '') : null;
    const host = url.hostname || targetInput;
    const port = url.port ? Number(url.port) : this._defaultPortForProtocol(protocol);

    return {
      original: targetInput,
      host,
      protocol,
      port,
      path: url.pathname === '/' ? null : url.pathname
    };
  }

  _defaultPortForProtocol(protocol) {
    switch (protocol) {
      case 'http':
        return 80;
      case 'https':
        return 443;
      case 'ftp':
        return 21;
      case 'ssh':
        return 22;
      default:
        return null;
    }
  }

  _normalizeConfigTargets() {
    const targets = this.plugin.config.targets || [];
    return targets.map((entry, index) => {
      if (typeof entry === 'string') {
        const normalized = this._normalizeTarget(entry);
        return {
          id: normalized.host,
          target: entry,
          enabled: true,
          behavior: this.plugin.config.behavior,
          features: {},
          tools: null,
          schedule: null,
          metadata: {},
          lastScanAt: null,
          lastScanStatus: null,
          scanCount: 0,
          addedBy: 'config',
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      if (entry && typeof entry === 'object') {
        const target = entry.target || entry.host || entry.domain;
        const normalized = this._normalizeTarget(target);
        return {
          id: normalized.host,
          target,
          enabled: entry.enabled !== false,
          behavior: entry.behavior || this.plugin.config.behavior,
          features: entry.features || {},
          tools: entry.tools || null,
          schedule: entry.schedule || null,
          metadata: entry.metadata || {},
          lastScanAt: null,
          lastScanStatus: null,
          scanCount: 0,
          addedBy: 'config',
          tags: entry.tags || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      throw new Error(`Invalid target configuration at index ${index}`);
    });
  }
}
