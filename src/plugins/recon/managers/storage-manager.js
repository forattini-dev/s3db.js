/**
 * StorageManager
 *
 * Handles all storage operations for the ReconPlugin:
 * - Report persistence to PluginStorage
 * - Resource updates (hosts, reports, diffs, stages, etc.)
 * - History pruning
 * - Diff computation and alerts
 */

export class StorageManager {
  constructor(plugin) {
    this.plugin = plugin;
  }

  /**
   * Persist report to PluginStorage with per-tool artifacts
   */
  async persistReport(target, report) {
    const storage = this.plugin.getStorage();
    const timestamp = report.endedAt.replace(/[:.]/g, '-');
    const baseKey = storage.getPluginKey(null, 'reports', target.host);
    const historyKey = `${baseKey}/${timestamp}.json`;
    const stageStorageKeys = {};
    const toolStorageKeys = {};

    for (const [stageName, stageData] of Object.entries(report.results || {})) {
      // Persist individual tools if present
      if (stageData._individual && typeof stageData._individual === 'object') {
        for (const [toolName, toolData] of Object.entries(stageData._individual)) {
          const toolKey = `${baseKey}/stages/${timestamp}/tools/${toolName}.json`;
          await storage.set(toolKey, toolData, { behavior: 'body-only' });
          toolStorageKeys[toolName] = toolKey;
        }
      }

      // Persist aggregated stage view
      const aggregatedData = stageData._aggregated || stageData;
      const stageKey = `${baseKey}/stages/${timestamp}/aggregated/${stageName}.json`;
      await storage.set(stageKey, aggregatedData, { behavior: 'body-only' });
      stageStorageKeys[stageName] = stageKey;
    }

    report.stageStorageKeys = stageStorageKeys;
    report.toolStorageKeys = toolStorageKeys;
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
      toolKeys: toolStorageKeys,
      summary: {
        latencyMs: report.fingerprint.latencyMs ?? null,
        openPorts: report.fingerprint.openPorts?.length ?? 0,
        subdomains: report.fingerprint.subdomainCount ?? 0,
        primaryIp: report.fingerprint.primaryIp ?? null
      }
    });

    let pruned = [];
    if (existing.history.length > this.plugin.config.storage.historyLimit) {
      pruned = existing.history.splice(this.plugin.config.storage.historyLimit);
    }

    await storage.set(indexKey, existing, { behavior: 'body-only' });

    if (pruned.length) {
      await this.pruneHistory(target, pruned);
    }
  }

  /**
   * Persist report data to database resources
   */
  async persistToResources(report) {
    if (!this.plugin.database || !this.plugin.config.resources.persist) {
      return;
    }

    const hostId = report.target.host;
    const hostsResource = await this.plugin._getResource('hosts');
    const stagesResource = await this.plugin._getResource('stages');
    const reportsResource = await this.plugin._getResource('reports');
    const subdomainsResource = await this.plugin._getResource('subdomains');
    const pathsResource = await this.plugin._getResource('paths');

    // Update hosts resource
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

      // Compute and save diffs
      const diffs = this._computeDiffs(existing, report);
      if (diffs.length) {
        await this.saveDiffs(hostId, report.endedAt, diffs);
        await this._emitDiffAlerts(hostId, report, diffs);
      }
    }

    // Update subdomains resource
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

    // Update paths resource
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

    // Update reports resource
    if (reportsResource) {
      const reportRecord = {
        id: `${hostId}|${report.endedAt}`,
        host: hostId,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        status: report.status,
        storageKey: report.storageKey || null,
        stageKeys: report.stageStorageKeys || {},
        toolKeys: report.toolStorageKeys || {}
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

    // Update stages resource
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

  /**
   * Prune old history entries
   */
  async pruneHistory(target, pruned) {
    const storage = this.plugin.getStorage();
    for (const entry of pruned) {
      try {
        await storage.delete(entry.reportKey);
        for (const stageKey of Object.values(entry.stageKeys || {})) {
          await storage.delete(stageKey);
        }
        for (const toolKey of Object.values(entry.toolKeys || {})) {
          await storage.delete(toolKey);
        }
      } catch (error) {
        // Ignore deletion errors
      }
    }
  }

  /**
   * Load latest report from storage
   */
  async loadLatestReport(hostId) {
    const storage = this.plugin.getStorage();
    const baseKey = storage.getPluginKey(null, 'reports', hostId);
    try {
      return await storage.get(`${baseKey}/latest.json`);
    } catch (error) {
      return null;
    }
  }

  /**
   * Load host summary from database or build from report
   */
  async loadHostSummary(hostId, report) {
    if (!this.plugin.database || !this.plugin.config.resources.persist) {
      return this._buildHostRecord(report);
    }

    try {
      const hostsResource = await this.plugin._getResource('hosts');
      if (!hostsResource) {
        return this._buildHostRecord(report);
      }
      return await hostsResource.get(hostId);
    } catch (error) {
      return this._buildHostRecord(report);
    }
  }

  /**
   * Save diffs to database
   */
  async saveDiffs(hostId, timestamp, diffs) {
    if (!this.plugin.database || !this.plugin.config.resources.persist) {
      return;
    }

    try {
      const diffsResource = await this.plugin._getResource('diffs');
      if (!diffsResource) {
        return;
      }

      const diffRecord = {
        id: `${hostId}|${timestamp}`,
        host: hostId,
        timestamp,
        changes: diffs
      };

      try {
        await diffsResource.insert(diffRecord);
      } catch (error) {
        try {
          await diffsResource.update(diffRecord.id, diffRecord);
        } catch (err) {
          if (typeof diffsResource.replace === 'function') {
            await diffsResource.replace(diffRecord.id, diffRecord);
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Load recent diffs for a host
   */
  async loadRecentDiffs(hostId, limit = 10) {
    if (!this.plugin.database || !this.plugin.config.resources.persist) {
      return [];
    }

    try {
      const diffsResource = await this.plugin._getResource('diffs');
      if (!diffsResource) {
        return [];
      }

      const allDiffs = await diffsResource.query({ host: hostId });
      const sorted = allDiffs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      const flattened = [];
      for (const entry of sorted) {
        if (Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            flattened.push({
              ...change,
              timestamp: entry.timestamp,
              host: entry.host
            });
          }
        }
      }

      return flattened.slice(0, limit);
    } catch (error) {
      // Try plugin storage as fallback
      try {
        const storage = this.plugin.getStorage();
        const baseKey = storage.getPluginKey(null, 'reports', hostId);
        const indexKey = `${baseKey}/index.json`;
        const index = await storage.get(indexKey);

        if (index?.history) {
          const diffs = [];
          for (const entry of index.history.slice(0, limit)) {
            const report = await storage.get(entry.reportKey);
            if (report?.diffs) {
              diffs.push(...report.diffs.map(d => ({
                ...d,
                timestamp: entry.timestamp,
                host: hostId
              })));
            }
          }
          return diffs.slice(0, limit);
        }
      } catch (err) {
        // Ignore
      }

      return [];
    }
  }

  // ========================================
  // Private Helper Methods
  // ========================================

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

    // Subdomain diffs
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

    // Port diffs
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

    // Technology diffs
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

    // Primitive field diffs
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
          description: `${field} alterado de ${previous || 'desconhecido'} para ${current || 'desconhecido'}`
        }, { severity, critical }));
      }
    }

    return diffs;
  }

  _createDiff(type, data, meta = {}) {
    return {
      type,
      ...data,
      severity: meta.severity || 'info',
      critical: meta.critical === true,
      detectedAt: new Date().toISOString()
    };
  }

  async _emitDiffAlerts(hostId, report, diffs) {
    for (const diff of diffs) {
      this.plugin.emit('recon:alert', {
        host: hostId,
        stage: diff.type?.split(':')[0] || 'unknown',
        severity: diff.severity,
        critical: diff.critical,
        description: diff.description,
        values: diff.values,
        timestamp: report.endedAt
      });
    }
  }

  _summarizeStage(stageName, stageData) {
    const summary = {};

    if (stageData.status) {
      summary.status = stageData.status;
    }

    switch (stageName) {
      case 'dns':
        if (stageData.records) {
          summary.recordTypes = Object.keys(stageData.records).filter(k => k !== 'reverse');
        }
        break;
      case 'ports':
        if (stageData.openPorts) {
          summary.openPortCount = stageData.openPorts.length;
        }
        break;
      case 'subdomains':
        if (stageData.total !== undefined) {
          summary.totalSubdomains = stageData.total;
        }
        break;
      case 'webDiscovery':
        if (stageData.paths) {
          summary.pathCount = stageData.paths.length;
        }
        break;
      default:
        if (stageData.tools) {
          summary.toolStatuses = Object.fromEntries(
            Object.entries(stageData.tools).map(([tool, data]) => [tool, data.status])
          );
        }
    }

    return summary;
  }

  _stripRawFields(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        const { raw, ...rest } = value;
        cleaned[key] = rest;
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  async _upsertResourceRecord(resource, record) {
    if (!resource) {
      return;
    }

    try {
      await resource.insert(record);
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
}
