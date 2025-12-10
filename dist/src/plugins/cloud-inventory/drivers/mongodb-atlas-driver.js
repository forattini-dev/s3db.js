import { BaseCloudDriver } from './base-driver.js';
import { PluginError } from '../../../errors.js';
import { createHttpClient } from '../../../concerns/http-client.js';
export class MongoDBAtlasInventoryDriver extends BaseCloudDriver {
    _publicKey = null;
    _privateKey = null;
    _baseUrl = 'https://cloud.mongodb.com/api/atlas/v2';
    _organizationId;
    _httpClient = null;
    _services;
    _projectIds;
    constructor(options = { driver: 'mongodb-atlas' }) {
        super({ ...options, driver: options.driver || 'mongodb-atlas' });
        const config = this.config;
        this._organizationId = config?.organizationId || null;
        this._services = config?.services || [
            'projects',
            'clusters',
            'serverless',
            'users',
            'accesslists',
            'backups',
            'alerts',
            'datalakes',
            'search',
            'customroles',
            'events'
        ];
        this._projectIds = config?.projectIds || null;
    }
    async _initializeCredentials() {
        if (this._publicKey)
            return;
        const credentials = this.credentials || {};
        this._publicKey = credentials.publicKey || process.env.MONGODB_ATLAS_PUBLIC_KEY || null;
        this._privateKey = credentials.privateKey || process.env.MONGODB_ATLAS_PRIVATE_KEY || null;
        this._organizationId = credentials.organizationId || this._organizationId;
        if (!this._publicKey || !this._privateKey) {
            throw new PluginError('MongoDB Atlas API keys are required. Provide via credentials.publicKey/privateKey or env vars.', {
                pluginName: 'CloudInventoryPlugin',
                operation: 'mongodbAtlas:initClient',
                statusCode: 400,
                retriable: false,
                suggestion: 'Set credentials.publicKey/privateKey or env variables MONGODB_ATLAS_PUBLIC_KEY / MONGODB_ATLAS_PRIVATE_KEY.'
            });
        }
        this.logger('info', 'MongoDB Atlas credentials initialized', {
            organizationId: this._organizationId || 'auto-discover',
            services: this._services.length
        });
    }
    async _getHttpClient() {
        if (!this._httpClient) {
            this._httpClient = await createHttpClient({
                baseUrl: this._baseUrl,
                headers: {
                    'Accept': 'application/vnd.atlas.2025-03-12+json',
                    'Content-Type': 'application/json'
                },
                auth: {
                    type: 'basic',
                    username: this._publicKey,
                    password: this._privateKey
                },
                timeout: 30000,
                retry: {
                    maxAttempts: 3,
                    delay: 1000,
                    backoff: 'exponential',
                    retryAfter: true,
                    retryOn: [429, 500, 502, 503, 504]
                }
            });
        }
        return this._httpClient;
    }
    async _makeRequest(endpoint, options = {}) {
        const client = await this._getHttpClient();
        const method = (options.method || 'GET').toLowerCase();
        let response;
        if (method === 'get') {
            response = await client.get(endpoint);
        }
        else if (method === 'post') {
            response = await client.post(endpoint, {
                body: options.body ? JSON.stringify(options.body) : undefined
            });
        }
        else if (method === 'put') {
            response = await client.put(endpoint, {
                body: options.body ? JSON.stringify(options.body) : undefined
            });
        }
        else if (method === 'delete') {
            response = await client.delete(endpoint);
        }
        else {
            response = await client.get(endpoint);
        }
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Atlas API error ${response.status}: ${text}`);
        }
        const text = await response.text();
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    }
    async *listResources(_options = {}) {
        await this._initializeCredentials();
        const serviceCollectors = {
            projects: () => this._collectProjects(),
            clusters: () => this._collectClusters(),
            serverless: () => this._collectServerless(),
            users: () => this._collectUsers(),
            accesslists: () => this._collectAccessLists(),
            backups: () => this._collectBackups(),
            alerts: () => this._collectAlerts(),
            datalakes: () => this._collectDataLakes(),
            search: () => this._collectSearchIndexes(),
            customroles: () => this._collectCustomRoles(),
            events: () => this._collectEvents()
        };
        for (const service of this._services) {
            const collector = serviceCollectors[service];
            if (!collector) {
                this.logger('warn', `Unknown MongoDB Atlas service: ${service}`, { service });
                continue;
            }
            try {
                this.logger('info', `Collecting MongoDB Atlas ${service} resources`, { service });
                yield* collector();
            }
            catch (err) {
                const error = err;
                this.logger('error', `MongoDB Atlas service collection failed, skipping to next service`, {
                    service,
                    error: error.message,
                    errorName: error.name,
                    stack: error.stack
                });
            }
        }
    }
    async _getProjects() {
        if (this._projectIds) {
            return this._projectIds.map(id => ({ id }));
        }
        try {
            const response = await this._makeRequest('/groups');
            return response.results || [];
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to fetch projects list', { error: error.message });
            return [];
        }
    }
    async *_collectProjects() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                yield {
                    provider: 'mongodb-atlas',
                    accountId: this._organizationId || project.orgId,
                    region: null,
                    service: 'projects',
                    resourceType: 'mongodb-atlas.project',
                    resourceId: project.id,
                    name: project.name,
                    tags: {},
                    metadata: {
                        orgId: project.orgId,
                        clusterCount: project.clusterCount
                    },
                    configuration: this._sanitize(project)
                };
            }
            this.logger('info', `Collected ${projects.length} MongoDB Atlas projects`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas projects', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectClusters() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const response = await this._makeRequest(`/groups/${project.id}/clusters`);
                    const clusters = response.results || [];
                    for (const cluster of clusters) {
                        const providerSettings = cluster.providerSettings;
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: providerSettings?.regionName || null,
                            service: 'clusters',
                            resourceType: 'mongodb-atlas.cluster',
                            resourceId: cluster.id || cluster.name,
                            name: cluster.name,
                            tags: cluster.tags || {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name,
                                tier: providerSettings?.instanceSizeName,
                                provider: providerSettings?.providerName,
                                mongoDBVersion: cluster.mongoDBVersion,
                                clusterType: cluster.clusterType,
                                state: cluster.stateName
                            },
                            configuration: this._sanitize(cluster)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('warn', `Failed to collect clusters for project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas clusters`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas clusters', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectServerless() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const response = await this._makeRequest(`/groups/${project.id}/serverless`);
                    const instances = response.results || [];
                    for (const instance of instances) {
                        const providerSettings = instance.providerSettings;
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: providerSettings?.regionName || null,
                            service: 'serverless',
                            resourceType: 'mongodb-atlas.serverless',
                            resourceId: instance.id || instance.name,
                            name: instance.name,
                            tags: instance.tags || {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name,
                                provider: providerSettings?.providerName,
                                state: instance.stateName
                            },
                            configuration: this._sanitize(instance)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('debug', `No serverless instances in project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas serverless instances`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas serverless', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectUsers() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const response = await this._makeRequest(`/groups/${project.id}/databaseUsers`);
                    const users = response.results || [];
                    for (const user of users) {
                        const roles = user.roles;
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: null,
                            service: 'users',
                            resourceType: 'mongodb-atlas.user',
                            resourceId: `${project.id}/${user.username}`,
                            name: user.username,
                            tags: {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name,
                                databaseName: user.databaseName,
                                roles: roles?.map(r => r.roleName)
                            },
                            configuration: this._sanitize(user)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('warn', `Failed to collect users for project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas database users`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas users', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectAccessLists() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const response = await this._makeRequest(`/groups/${project.id}/accessList`);
                    const entries = response.results || [];
                    for (const entry of entries) {
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: null,
                            service: 'accesslists',
                            resourceType: 'mongodb-atlas.accesslist',
                            resourceId: `${project.id}/${entry.ipAddress || entry.cidrBlock}`,
                            name: entry.comment || entry.ipAddress || entry.cidrBlock,
                            tags: {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name,
                                ipAddress: entry.ipAddress,
                                cidrBlock: entry.cidrBlock
                            },
                            configuration: this._sanitize(entry)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('warn', `Failed to collect access lists for project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas IP access lists`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas access lists', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectBackups() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const clustersResponse = await this._makeRequest(`/groups/${project.id}/clusters`);
                    const clusters = clustersResponse.results || [];
                    for (const cluster of clusters) {
                        try {
                            const response = await this._makeRequest(`/groups/${project.id}/clusters/${cluster.name}/backup/snapshots`);
                            const snapshots = response.results || [];
                            const providerSettings = cluster.providerSettings;
                            for (const snapshot of snapshots) {
                                yield {
                                    provider: 'mongodb-atlas',
                                    accountId: this._organizationId || project.orgId,
                                    region: providerSettings?.regionName || null,
                                    service: 'backups',
                                    resourceType: 'mongodb-atlas.backup',
                                    resourceId: snapshot.id,
                                    name: `${cluster.name}-${snapshot.id}`,
                                    tags: {},
                                    metadata: {
                                        projectId: project.id,
                                        projectName: project.name,
                                        clusterName: cluster.name,
                                        type: snapshot.type,
                                        status: snapshot.status
                                    },
                                    configuration: this._sanitize(snapshot)
                                };
                            }
                        }
                        catch (clusterErr) {
                            const error = clusterErr;
                            this.logger('debug', `No backups for cluster ${cluster.name}`, {
                                clusterName: cluster.name,
                                error: error.message
                            });
                        }
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('warn', `Failed to collect backups for project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas backups`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas backups', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectAlerts() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const response = await this._makeRequest(`/groups/${project.id}/alertConfigs`);
                    const alerts = response.results || [];
                    for (const alert of alerts) {
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: null,
                            service: 'alerts',
                            resourceType: 'mongodb-atlas.alert',
                            resourceId: alert.id,
                            name: alert.eventTypeName,
                            tags: {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name,
                                enabled: alert.enabled,
                                eventTypeName: alert.eventTypeName
                            },
                            configuration: this._sanitize(alert)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('warn', `Failed to collect alerts for project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas alerts`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas alerts', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectDataLakes() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const response = await this._makeRequest(`/groups/${project.id}/dataLakes`);
                    const dataLakes = response || [];
                    for (const lake of dataLakes) {
                        const cloudProviderConfig = lake.cloudProviderConfig;
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: cloudProviderConfig?.aws?.roleId ? 'aws' : null,
                            service: 'datalakes',
                            resourceType: 'mongodb-atlas.datalake',
                            resourceId: lake.name,
                            name: lake.name,
                            tags: {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name,
                                state: lake.state
                            },
                            configuration: this._sanitize(lake)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('debug', `No data lakes in project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas data lakes`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas data lakes', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectSearchIndexes() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const clustersResponse = await this._makeRequest(`/groups/${project.id}/clusters`);
                    const clusters = clustersResponse.results || [];
                    for (const cluster of clusters) {
                        try {
                            const response = await this._makeRequest(`/groups/${project.id}/clusters/${cluster.name}/fts/indexes`);
                            const indexes = response || [];
                            const providerSettings = cluster.providerSettings;
                            for (const index of indexes) {
                                yield {
                                    provider: 'mongodb-atlas',
                                    accountId: this._organizationId || project.orgId,
                                    region: providerSettings?.regionName || null,
                                    service: 'search',
                                    resourceType: 'mongodb-atlas.search.index',
                                    resourceId: index.indexID,
                                    name: index.name,
                                    tags: {},
                                    metadata: {
                                        projectId: project.id,
                                        projectName: project.name,
                                        clusterName: cluster.name,
                                        collectionName: index.collectionName,
                                        database: index.database,
                                        status: index.status
                                    },
                                    configuration: this._sanitize(index)
                                };
                            }
                        }
                        catch (clusterErr) {
                            const error = clusterErr;
                            this.logger('debug', `No search indexes for cluster ${cluster.name}`, {
                                clusterName: cluster.name,
                                error: error.message
                            });
                        }
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('warn', `Failed to collect search indexes for project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas search indexes`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas search indexes', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectCustomRoles() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const response = await this._makeRequest(`/groups/${project.id}/customDBRoles/roles`);
                    const roles = response || [];
                    for (const role of roles) {
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: null,
                            service: 'customroles',
                            resourceType: 'mongodb-atlas.customrole',
                            resourceId: `${project.id}/${role.roleName}`,
                            name: role.roleName,
                            tags: {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name
                            },
                            configuration: this._sanitize(role)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('debug', `No custom roles in project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas custom roles`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas custom roles', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectEvents() {
        try {
            const projects = await this._getProjects();
            for (const project of projects) {
                try {
                    const minDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    const response = await this._makeRequest(`/groups/${project.id}/events?minDate=${minDate}&itemsPerPage=100`);
                    const events = response.results || [];
                    for (const event of events) {
                        yield {
                            provider: 'mongodb-atlas',
                            accountId: this._organizationId || project.orgId,
                            region: null,
                            service: 'events',
                            resourceType: 'mongodb-atlas.event',
                            resourceId: event.id,
                            name: event.eventTypeName,
                            tags: {},
                            metadata: {
                                projectId: project.id,
                                projectName: project.name,
                                eventTypeName: event.eventTypeName,
                                created: event.created
                            },
                            configuration: this._sanitize(event)
                        };
                    }
                }
                catch (projectErr) {
                    const error = projectErr;
                    this.logger('debug', `No recent events in project ${project.id}`, {
                        projectId: project.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected MongoDB Atlas events`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect MongoDB Atlas events', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    _sanitize(config) {
        if (!config || typeof config !== 'object')
            return config;
        const sanitized = { ...config };
        const sensitiveFields = [
            'password',
            'privateKey',
            'apiKey',
            'connectionStrings',
            'mongoURI',
            'mongoURIUpdated',
            'mongoURIWithOptions'
        ];
        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '***REDACTED***';
            }
        }
        return sanitized;
    }
}
//# sourceMappingURL=mongodb-atlas-driver.js.map