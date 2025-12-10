/**
 * StorageManager
 *
 * Handles all storage operations for the ReconPlugin:
 * - Report persistence to PluginStorage
 * - Resource updates (hosts, reports, diffs, stages, etc.)
 * - History pruning
 * - Diff computation and alerts
 */
import { getAllResourceConfigs } from '../config/resources.js';
import { getNamespacedResourceName, listPluginNamespaces } from '../../namespace.js';
import { createLogger } from '../../../concerns/logger.js';
export class StorageManager {
    plugin;
    resources;
    logger;
    constructor(plugin) {
        this.plugin = plugin;
        this.resources = {};
        this.logger = createLogger({ name: 'recon-storage-manager' });
    }
    async listNamespaces() {
        return await listPluginNamespaces(this.plugin.getStorage(), 'recon');
    }
    async initialize() {
        if (!this.plugin.database) {
            return;
        }
        const namespace = this.plugin.namespace || '';
        const resourceConfigs = getAllResourceConfigs();
        for (const config of resourceConfigs) {
            try {
                const namespacedName = getNamespacedResourceName(config.name, namespace, 'plg_recon');
                const namespacedConfig = {
                    ...config,
                    name: namespacedName
                };
                let resource = null;
                try {
                    resource = await this.plugin.database.getResource(namespacedConfig.name);
                }
                catch {
                    // Resource doesn't exist, create it
                }
                if (!resource) {
                    resource = await this.plugin.database.createResource(namespacedConfig);
                }
                this.resources[config.name] = resource;
            }
            catch (error) {
                this.logger.error(`Failed to initialize resource ${config.name}: ${error.message}`);
            }
        }
    }
    getResource(name) {
        return this.resources[name];
    }
    _extractTimestampDay(isoTimestamp) {
        if (!isoTimestamp)
            return null;
        return isoTimestamp.split('T')[0] ?? null;
    }
    async persistReport(target, report) {
        const storage = this.plugin.getStorage();
        const timestamp = report.endedAt.replace(/[:.]/g, '-');
        const namespace = this.plugin.namespace || '';
        const baseKey = storage.getPluginKey(null, namespace, 'reports', target.host);
        const historyKey = `${baseKey}/${timestamp}.json`;
        const stageStorageKeys = {};
        const toolStorageKeys = {};
        for (const [stageName, stageData] of Object.entries(report.results || {})) {
            if (stageData._individual && typeof stageData._individual === 'object') {
                for (const [toolName, toolData] of Object.entries(stageData._individual)) {
                    const toolKey = `${baseKey}/stages/${timestamp}/tools/${toolName}.json`;
                    await storage.set(toolKey, toolData, { behavior: 'body-only' });
                    toolStorageKeys[toolName] = toolKey;
                }
            }
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
        if (hostsResource) {
            let existing = null;
            try {
                existing = await hostsResource.get(hostId);
            }
            catch {
                existing = null;
            }
            const hostRecord = this._buildHostRecord(report);
            if (existing) {
                try {
                    await hostsResource.update(hostId, hostRecord);
                }
                catch {
                    if (typeof hostsResource.replace === 'function') {
                        await hostsResource.replace(hostId, hostRecord);
                    }
                }
            }
            else {
                try {
                    await hostsResource.insert(hostRecord);
                }
                catch {
                    if (typeof hostsResource.replace === 'function') {
                        await hostsResource.replace(hostRecord.id, hostRecord);
                    }
                }
            }
            const diffs = this._computeDiffs(existing, report);
            if (diffs.length) {
                await this.saveDiffs(hostId, report.endedAt, diffs);
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
                sources: this._stripRawFields(report.results?.subdomains?.tools || {}),
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
                sources: this._stripRawFields(pathStage.tools || {}),
                lastScanAt: report.endedAt
            };
            await this._upsertResourceRecord(pathsResource, pathRecord);
        }
        if (reportsResource) {
            const timestamp = report.timestamp || report.endedAt || new Date().toISOString();
            const reportRecord = {
                id: report.id || `${hostId}|${timestamp}`,
                reportId: report.id || `rpt_${Date.now()}`,
                target: report.target || { host: hostId, original: hostId },
                timestamp,
                timestampDay: this._extractTimestampDay(timestamp),
                duration: report.duration || 0,
                status: report.status || 'completed',
                results: report.results || {},
                fingerprint: report.fingerprint || {},
                summary: {
                    totalIPs: report.fingerprint?.infrastructure?.ips?.ipv4?.length || 0,
                    totalPorts: report.fingerprint?.attackSurface?.openPorts?.length || 0,
                    totalSubdomains: report.fingerprint?.attackSurface?.subdomains?.total || 0,
                    totalPaths: report.fingerprint?.attackSurface?.discoveredPaths?.total || 0,
                    detectedTechnologies: Array.isArray(report.fingerprint?.technologies)
                        ? report.fingerprint.technologies.length
                        : report.fingerprint?.technologies?.detected?.length || 0,
                    riskLevel: report.riskLevel || 'low'
                },
                uptime: report.uptime || null
            };
            try {
                await reportsResource.insert(reportRecord);
            }
            catch {
                try {
                    await reportsResource.update(reportRecord.id, reportRecord);
                }
                catch {
                    if (typeof reportsResource.replace === 'function') {
                        await reportsResource.replace(reportRecord.id, reportRecord);
                    }
                }
            }
        }
        if (stagesResource && report.results) {
            const reportTimestamp = report.timestamp || report.endedAt || new Date().toISOString();
            for (const [stageName, stageData] of Object.entries(report.results || {})) {
                const stageRecord = {
                    id: `${hostId}|${stageName}|${reportTimestamp}`,
                    reportId: report.id || `rpt_${Date.now()}`,
                    stageName,
                    host: hostId,
                    timestamp: reportTimestamp,
                    timestampDay: this._extractTimestampDay(reportTimestamp),
                    duration: stageData?.duration || 0,
                    status: stageData?.status || 'unknown',
                    toolsUsed: this._extractToolNames(stageData, 'all'),
                    toolsSucceeded: this._extractToolNames(stageData, 'succeeded'),
                    toolsFailed: this._extractToolNames(stageData, 'failed'),
                    resultCount: this._countResults(stageData),
                    errorMessage: stageData?.error || null
                };
                try {
                    await stagesResource.insert(stageRecord);
                }
                catch {
                    try {
                        await stagesResource.update(stageRecord.id, stageRecord);
                    }
                    catch {
                        if (typeof stagesResource.replace === 'function') {
                            await stagesResource.replace(stageRecord.id, stageRecord);
                        }
                    }
                }
            }
        }
    }
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
            }
            catch {
                // Ignore deletion errors
            }
        }
    }
    async loadLatestReport(hostId) {
        const storage = this.plugin.getStorage();
        const baseKey = storage.getPluginKey(null, 'reports', hostId);
        try {
            return await storage.get(`${baseKey}/latest.json`);
        }
        catch {
            return null;
        }
    }
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
        }
        catch {
            return this._buildHostRecord(report);
        }
    }
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
            }
            catch {
                try {
                    await diffsResource.update(diffRecord.id, diffRecord);
                }
                catch {
                    if (typeof diffsResource.replace === 'function') {
                        await diffsResource.replace(diffRecord.id, diffRecord);
                    }
                }
            }
        }
        catch {
            // Ignore errors
        }
    }
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
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
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
        }
        catch {
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
                            diffs.push(...report.diffs.map((d) => ({
                                ...d,
                                timestamp: entry.timestamp,
                                host: hostId
                            })));
                        }
                    }
                    return diffs.slice(0, limit);
                }
            }
            catch {
                // Ignore
            }
            return [];
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
            if (!entry)
                return String(entry);
            if (typeof entry === 'string')
                return entry;
            return String(entry.port || `${entry.service || 'unknown'}`);
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
        const prevTechArray = Array.isArray(prevFingerprint.technologies)
            ? prevFingerprint.technologies
            : prevFingerprint.technologies?.detected || [];
        const currTechArray = Array.isArray(currFingerprint.technologies)
            ? currFingerprint.technologies
            : currFingerprint.technologies?.detected || [];
        const prevTech = new Set(prevTechArray.map((tech) => tech.toLowerCase()));
        const currTech = new Set(currTechArray.map((tech) => tech.toLowerCase()));
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
            detectedAt: new Date().toISOString(),
            description: data.description || ''
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
                    summary.toolStatuses = Object.fromEntries(Object.entries(stageData.tools).map(([tool, data]) => [tool, data.status]));
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
            }
            else {
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
            return;
        }
        catch {
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
            }
            catch {
                // try next
            }
        }
    }
    _extractToolNames(stageData, filter = 'all') {
        if (!stageData)
            return [];
        const tools = [];
        if (stageData._individual && typeof stageData._individual === 'object') {
            for (const [toolName, toolData] of Object.entries(stageData._individual)) {
                const status = toolData?.status;
                if (filter === 'all') {
                    tools.push(toolName);
                }
                else if (filter === 'succeeded' && status === 'ok') {
                    tools.push(toolName);
                }
                else if (filter === 'failed' && status !== 'ok' && status) {
                    tools.push(toolName);
                }
            }
        }
        if (stageData.tools && typeof stageData.tools === 'object') {
            for (const [toolName, toolData] of Object.entries(stageData.tools)) {
                const status = toolData?.status;
                if (filter === 'all' && !tools.includes(toolName)) {
                    tools.push(toolName);
                }
                else if (filter === 'succeeded' && status === 'ok' && !tools.includes(toolName)) {
                    tools.push(toolName);
                }
                else if (filter === 'failed' && status !== 'ok' && status && !tools.includes(toolName)) {
                    tools.push(toolName);
                }
            }
        }
        return tools;
    }
    _countResults(stageData) {
        if (!stageData)
            return 0;
        if (stageData.openPorts?.length)
            return stageData.openPorts.length;
        if (stageData.list?.length)
            return stageData.list.length;
        if (stageData.paths?.length)
            return stageData.paths.length;
        if (stageData.records && typeof stageData.records === 'object') {
            return Object.values(stageData.records).flat().length;
        }
        if (stageData._aggregated) {
            const agg = stageData._aggregated;
            if (agg.openPorts?.length)
                return agg.openPorts.length;
            if (agg.list?.length)
                return agg.list.length;
            if (agg.paths?.length)
                return agg.paths.length;
        }
        return 0;
    }
}
//# sourceMappingURL=storage-manager.js.map