import tryFn, { tryFnSync } from '../concerns/try-fn.js';
import { streamToString } from '../stream/index.js';
export class DatabaseRecovery {
    database;
    constructor(database) {
        this.database = database;
    }
    async attemptJsonRecovery(content, healingLog) {
        if (!content || typeof content !== 'string') {
            healingLog.push('Content is empty or not a string');
            return null;
        }
        const fixes = [
            () => content.replace(/,(\s*[}\]])/g, '$1'),
            () => content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":'),
            () => {
                let openBraces = 0;
                let openBrackets = 0;
                let inString = false;
                let escaped = false;
                for (let i = 0; i < content.length; i++) {
                    const char = content[i];
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (char === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    if (!inString) {
                        if (char === '{')
                            openBraces++;
                        else if (char === '}')
                            openBraces--;
                        else if (char === '[')
                            openBrackets++;
                        else if (char === ']')
                            openBrackets--;
                    }
                }
                let fixed = content;
                while (openBrackets > 0) {
                    fixed += ']';
                    openBrackets--;
                }
                while (openBraces > 0) {
                    fixed += '}';
                    openBraces--;
                }
                return fixed;
            }
        ];
        for (const [index, fix] of fixes.entries()) {
            const [ok, , parsed] = tryFnSync(() => {
                const fixedContent = fix();
                return JSON.parse(fixedContent);
            });
            if (ok) {
                healingLog.push(`JSON recovery successful using fix #${index + 1}`);
                return parsed;
            }
        }
        healingLog.push('All JSON recovery attempts failed');
        return null;
    }
    async validateAndHealMetadata(metadata, healingLog) {
        if (!metadata || typeof metadata !== 'object') {
            healingLog.push('Metadata is not an object - using blank structure');
            return this.database.blankMetadataStructure();
        }
        let healed = { ...metadata };
        let changed = false;
        if (!healed.version || typeof healed.version !== 'string') {
            if (healed.version && typeof healed.version === 'number') {
                healed.version = String(healed.version);
                healingLog.push('Converted version from number to string');
                changed = true;
            }
            else {
                healed.version = '1';
                healingLog.push('Added missing or invalid version field');
                changed = true;
            }
        }
        if (!healed.s3dbVersion || typeof healed.s3dbVersion !== 'string') {
            if (healed.s3dbVersion && typeof healed.s3dbVersion !== 'string') {
                healed.s3dbVersion = String(healed.s3dbVersion);
                healingLog.push('Converted s3dbVersion to string');
                changed = true;
            }
            else {
                healed.s3dbVersion = this.database.s3dbVersion;
                healingLog.push('Added missing s3dbVersion field');
                changed = true;
            }
        }
        if (!healed.resources || typeof healed.resources !== 'object' || Array.isArray(healed.resources)) {
            healed.resources = {};
            healingLog.push('Fixed invalid resources field');
            changed = true;
        }
        if (!healed.lastUpdated) {
            healed.lastUpdated = new Date().toISOString();
            healingLog.push('Added missing lastUpdated field');
            changed = true;
        }
        const validResources = {};
        for (const [name, resource] of Object.entries(healed.resources)) {
            const healedResource = this._healResourceStructure(name, resource, healingLog);
            if (healedResource) {
                validResources[name] = healedResource;
                if (healedResource !== resource) {
                    changed = true;
                }
            }
            else {
                healingLog.push(`Removed invalid resource: ${name}`);
                changed = true;
            }
        }
        healed.resources = validResources;
        return changed ? healed : metadata;
    }
    _healResourceStructure(name, resource, healingLog) {
        if (!resource || typeof resource !== 'object') {
            healingLog.push(`Resource ${name}: invalid structure`);
            return null;
        }
        let healed = { ...resource };
        let changed = false;
        if (!healed.currentVersion) {
            healed.currentVersion = 'v1';
            healingLog.push(`Resource ${name}: added missing currentVersion`);
            changed = true;
        }
        if (!healed.versions || typeof healed.versions !== 'object' || Array.isArray(healed.versions)) {
            healed.versions = {};
            healingLog.push(`Resource ${name}: fixed invalid versions object`);
            changed = true;
        }
        if (!healed.partitions || typeof healed.partitions !== 'object' || Array.isArray(healed.partitions)) {
            healed.partitions = {};
            healingLog.push(`Resource ${name}: fixed invalid partitions object`);
            changed = true;
        }
        const currentVersion = healed.currentVersion;
        if (!healed.versions[currentVersion]) {
            const availableVersions = Object.keys(healed.versions);
            if (availableVersions.length > 0) {
                healed.currentVersion = availableVersions[0];
                healingLog.push(`Resource ${name}: changed currentVersion from ${currentVersion} to ${healed.currentVersion}`);
                changed = true;
            }
            else {
                healingLog.push(`Resource ${name}: no valid versions found - removing resource`);
                return null;
            }
        }
        const versionData = healed.versions[healed.currentVersion];
        if (!versionData || typeof versionData !== 'object') {
            healingLog.push(`Resource ${name}: invalid version data - removing resource`);
            return null;
        }
        if (!versionData.attributes || typeof versionData.attributes !== 'object') {
            healingLog.push(`Resource ${name}: missing or invalid attributes - removing resource`);
            return null;
        }
        if (versionData.hooks) {
            const healedHooks = this._healHooksStructure(versionData.hooks, name, healingLog);
            if (healedHooks !== versionData.hooks) {
                healed.versions[healed.currentVersion].hooks = healedHooks;
                changed = true;
            }
        }
        return changed ? healed : resource;
    }
    _healHooksStructure(hooks, resourceName, healingLog) {
        if (!hooks || typeof hooks !== 'object') {
            healingLog.push(`Resource ${resourceName}: invalid hooks structure - using empty hooks`);
            return {};
        }
        const healed = {};
        let changed = false;
        for (const [event, hookData] of Object.entries(hooks)) {
            if (hookData && typeof hookData === 'object' && Array.isArray(hookData.handlers)) {
                const validHandlers = hookData.handlers.filter((handler) => handler !== null &&
                    handler !== undefined &&
                    handler !== '');
                healed[event] = {
                    count: validHandlers.length,
                    handlers: validHandlers
                };
                if (validHandlers.length !== hookData.handlers.length) {
                    healingLog.push(`Resource ${resourceName}: cleaned invalid hooks for event ${event}`);
                    changed = true;
                }
            }
            else {
                healingLog.push(`Resource ${resourceName}: hooks for event ${event} is invalid - removing`);
                changed = true;
            }
        }
        return changed ? healed : hooks;
    }
    async createCorruptedBackup(content = null) {
        const [ok] = await tryFn(async () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupKey = `s3db.json.corrupted.${timestamp}.backup`;
            if (!content) {
                const [readOk, , readData] = await tryFn(async () => {
                    const request = await this.database.client.getObject('s3db.json');
                    return await streamToString(request?.Body);
                });
                content = readOk ? readData : 'Unable to read corrupted file content';
            }
            await this.database.client.putObject({
                key: backupKey,
                body: content,
                contentType: 'application/json'
            });
            this.database.logger.info({ backupKey }, `created backup of corrupted s3db.json as ${backupKey}`);
        });
        if (!ok) {
            this.database.logger.warn({}, 'failed to create backup');
        }
    }
    async uploadHealedMetadata(metadata, healingLog) {
        const [ok, err] = await tryFn(async () => {
            if (healingLog.length > 0) {
                this.database.logger.warn({ healingOperations: healingLog }, 'S3DB self-healing operations');
                healingLog.forEach(log => this.database.logger.warn(`  - ${log}`));
            }
            metadata.lastUpdated = new Date().toISOString();
            await this.database.client.putObject({
                key: 's3db.json',
                body: JSON.stringify(metadata, null, 2),
                contentType: 'application/json'
            });
            this.database.emit('db:metadata-healed', { healingLog, metadata });
            this.database.logger.info('successfully uploaded healed metadata');
        });
        if (!ok) {
            this.database.logger.error({ error: err?.message }, 'failed to upload healed metadata');
            throw err;
        }
    }
}
//# sourceMappingURL=database-recovery.class.js.map