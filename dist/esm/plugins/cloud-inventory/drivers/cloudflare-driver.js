import { BaseCloudDriver } from './base-driver.js';
import { PluginError } from '../../../errors.js';
export class CloudflareInventoryDriver extends BaseCloudDriver {
    _apiToken = null;
    _accountId = null;
    _client = null;
    _services;
    constructor(options = { driver: 'cloudflare' }) {
        super({ ...options, driver: options.driver || 'cloudflare' });
        const config = this.config;
        this._services = config?.services || [
            'workers',
            'r2',
            'pages',
            'd1',
            'kv',
            'durable-objects',
            'zones',
            'loadbalancers',
            'certificates',
            'waf',
            'access'
        ];
    }
    async _initializeClient() {
        if (this._client)
            return;
        const credentials = this.credentials || {};
        this._apiToken = credentials.apiToken || credentials.token || process.env.CLOUDFLARE_API_TOKEN || null;
        this._accountId = credentials.accountId || this.config?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || null;
        if (!this._apiToken) {
            throw new PluginError('Cloudflare API token is required. Provide via credentials.apiToken or CLOUDFLARE_API_TOKEN env var.', {
                pluginName: 'CloudInventoryPlugin',
                operation: 'cloudflare:initClient',
                statusCode: 400,
                retriable: false,
                suggestion: 'Populate credentials.apiToken or set the CLOUDFLARE_API_TOKEN environment variable before initializing the Cloudflare driver.'
            });
        }
        const Cloudflare = await import('cloudflare');
        this._client = new Cloudflare.default({
            apiToken: this._apiToken
        });
        this.logger('info', 'Cloudflare API client initialized', {
            accountId: this._accountId,
            services: this._services.length
        });
    }
    async *listResources(_options = {}) {
        await this._initializeClient();
        const serviceCollectors = {
            workers: () => this._collectWorkers(),
            r2: () => this._collectR2(),
            pages: () => this._collectPages(),
            'd1': () => this._collectD1(),
            kv: () => this._collectKV(),
            'durable-objects': () => this._collectDurableObjects(),
            zones: () => this._collectZones(),
            loadbalancers: () => this._collectLoadBalancers(),
            certificates: () => this._collectCertificates(),
            waf: () => this._collectWAF(),
            access: () => this._collectAccess()
        };
        for (const service of this._services) {
            const collector = serviceCollectors[service];
            if (!collector) {
                this.logger('warn', `Unknown Cloudflare service: ${service}`, { service });
                continue;
            }
            try {
                this.logger('info', `Collecting Cloudflare ${service} resources`, { service });
                yield* collector();
            }
            catch (err) {
                const error = err;
                this.logger('error', `Cloudflare service collection failed, skipping to next service`, {
                    service,
                    error: error.message,
                    errorName: error.name,
                    stack: error.stack
                });
            }
        }
    }
    async *_collectWorkers() {
        try {
            if (!this._accountId) {
                this.logger('warn', 'Account ID required for Workers collection, skipping');
                return;
            }
            const scripts = await this._client.workers.scripts.list({ account_id: this._accountId });
            for (const script of scripts) {
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId,
                    region: 'global',
                    service: 'workers',
                    resourceType: 'cloudflare.workers.script',
                    resourceId: script.id,
                    name: script.id,
                    tags: script.tags || [],
                    configuration: this._sanitize(script)
                };
            }
            this.logger('info', `Collected ${scripts.length || 0} Cloudflare Workers scripts`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare Workers', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectR2() {
        try {
            if (!this._accountId) {
                this.logger('warn', 'Account ID required for R2 collection, skipping');
                return;
            }
            const buckets = await this._client.r2.buckets.list({ account_id: this._accountId });
            for (const bucket of buckets) {
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId,
                    region: bucket.location || 'global',
                    service: 'r2',
                    resourceType: 'cloudflare.r2.bucket',
                    resourceId: bucket.name,
                    name: bucket.name,
                    tags: [],
                    configuration: this._sanitize(bucket)
                };
            }
            this.logger('info', `Collected ${buckets.length || 0} Cloudflare R2 buckets`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare R2', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectPages() {
        try {
            if (!this._accountId) {
                this.logger('warn', 'Account ID required for Pages collection, skipping');
                return;
            }
            const projects = await this._client.pages.projects.list({ account_id: this._accountId });
            for (const project of projects) {
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId,
                    region: 'global',
                    service: 'pages',
                    resourceType: 'cloudflare.pages.project',
                    resourceId: project.id || project.name,
                    name: project.name,
                    tags: [],
                    configuration: this._sanitize(project)
                };
            }
            this.logger('info', `Collected ${projects.length || 0} Cloudflare Pages projects`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare Pages', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectD1() {
        try {
            if (!this._accountId) {
                this.logger('warn', 'Account ID required for D1 collection, skipping');
                return;
            }
            const databases = await this._client.d1.database.list({ account_id: this._accountId });
            for (const database of databases) {
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId,
                    region: 'global',
                    service: 'd1',
                    resourceType: 'cloudflare.d1.database',
                    resourceId: database.uuid,
                    name: database.name,
                    tags: [],
                    configuration: this._sanitize(database)
                };
            }
            this.logger('info', `Collected ${databases.length || 0} Cloudflare D1 databases`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare D1', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectKV() {
        try {
            if (!this._accountId) {
                this.logger('warn', 'Account ID required for KV collection, skipping');
                return;
            }
            const namespaces = await this._client.kv.namespaces.list({ account_id: this._accountId });
            for (const namespace of namespaces) {
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId,
                    region: 'global',
                    service: 'kv',
                    resourceType: 'cloudflare.kv.namespace',
                    resourceId: namespace.id,
                    name: namespace.title,
                    tags: [],
                    configuration: this._sanitize(namespace)
                };
            }
            this.logger('info', `Collected ${namespaces.length || 0} Cloudflare KV namespaces`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare KV', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectDurableObjects() {
        try {
            if (!this._accountId) {
                this.logger('warn', 'Account ID required for Durable Objects collection, skipping');
                return;
            }
            const namespaces = await this._client.durableObjects.namespaces.list({ account_id: this._accountId });
            for (const namespace of namespaces) {
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId,
                    region: 'global',
                    service: 'durable-objects',
                    resourceType: 'cloudflare.durableobjects.namespace',
                    resourceId: namespace.id,
                    name: namespace.name,
                    tags: [],
                    configuration: this._sanitize(namespace)
                };
            }
            this.logger('info', `Collected ${namespaces.length || 0} Cloudflare Durable Objects namespaces`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare Durable Objects', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectZones() {
        try {
            const zones = await this._client.zones.list();
            for (const zone of zones) {
                const account = zone.account;
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId || account?.id,
                    region: 'global',
                    service: 'zones',
                    resourceType: 'cloudflare.zone',
                    resourceId: zone.id,
                    name: zone.name,
                    tags: [],
                    configuration: this._sanitize(zone)
                };
                try {
                    const records = await this._client.dns.records.list({ zone_id: zone.id });
                    for (const record of records) {
                        yield {
                            provider: 'cloudflare',
                            accountId: this._accountId || account?.id,
                            region: 'global',
                            service: 'zones',
                            resourceType: 'cloudflare.dns.record',
                            resourceId: record.id,
                            name: `${record.name} (${record.type})`,
                            tags: record.tags || [],
                            metadata: { zoneId: zone.id, zoneName: zone.name },
                            configuration: this._sanitize(record)
                        };
                    }
                }
                catch (recordErr) {
                    const error = recordErr;
                    this.logger('warn', `Failed to collect DNS records for zone ${zone.name}`, {
                        zoneId: zone.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected ${zones.length || 0} Cloudflare zones`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare zones', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectLoadBalancers() {
        try {
            const zones = await this._client.zones.list();
            for (const zone of zones) {
                const account = zone.account;
                try {
                    const loadBalancers = await this._client.loadBalancers.list({ zone_id: zone.id });
                    for (const lb of loadBalancers) {
                        yield {
                            provider: 'cloudflare',
                            accountId: this._accountId || account?.id,
                            region: 'global',
                            service: 'loadbalancers',
                            resourceType: 'cloudflare.loadbalancer',
                            resourceId: lb.id,
                            name: lb.name,
                            tags: [],
                            metadata: { zoneId: zone.id, zoneName: zone.name },
                            configuration: this._sanitize(lb)
                        };
                    }
                }
                catch (lbErr) {
                    const error = lbErr;
                    this.logger('debug', `No load balancers in zone ${zone.name}`, {
                        zoneId: zone.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected Cloudflare load balancers`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare load balancers', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectCertificates() {
        try {
            const zones = await this._client.zones.list();
            for (const zone of zones) {
                const account = zone.account;
                try {
                    const certificates = await this._client.ssl.certificatePacks.list({ zone_id: zone.id });
                    for (const cert of certificates) {
                        yield {
                            provider: 'cloudflare',
                            accountId: this._accountId || account?.id,
                            region: 'global',
                            service: 'certificates',
                            resourceType: 'cloudflare.ssl.certificate',
                            resourceId: cert.id,
                            name: `${zone.name} - ${cert.type}`,
                            tags: [],
                            metadata: {
                                zoneId: zone.id,
                                zoneName: zone.name,
                                type: cert.type,
                                status: cert.status
                            },
                            configuration: this._sanitize(cert)
                        };
                    }
                }
                catch (certErr) {
                    const error = certErr;
                    this.logger('debug', `No certificates in zone ${zone.name}`, {
                        zoneId: zone.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected Cloudflare certificates`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare certificates', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectWAF() {
        try {
            const zones = await this._client.zones.list();
            for (const zone of zones) {
                const account = zone.account;
                try {
                    const rulesets = await this._client.rulesets.list({ zone_id: zone.id });
                    for (const ruleset of rulesets) {
                        const phase = ruleset.phase;
                        if (phase && (phase.includes('http_') || phase.includes('firewall'))) {
                            yield {
                                provider: 'cloudflare',
                                accountId: this._accountId || account?.id,
                                region: 'global',
                                service: 'waf',
                                resourceType: 'cloudflare.waf.ruleset',
                                resourceId: ruleset.id,
                                name: ruleset.name,
                                tags: [],
                                metadata: {
                                    zoneId: zone.id,
                                    zoneName: zone.name,
                                    phase: ruleset.phase,
                                    kind: ruleset.kind
                                },
                                configuration: this._sanitize(ruleset)
                            };
                        }
                    }
                }
                catch (wafErr) {
                    const error = wafErr;
                    this.logger('debug', `No WAF rulesets in zone ${zone.name}`, {
                        zoneId: zone.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected Cloudflare WAF rulesets`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare WAF', {
                error: error.message,
                stack: error.stack
            });
            throw err;
        }
    }
    async *_collectAccess() {
        try {
            if (!this._accountId) {
                this.logger('warn', 'Account ID required for Access collection, skipping');
                return;
            }
            const applications = await this._client.access.applications.list({ account_id: this._accountId });
            for (const app of applications) {
                yield {
                    provider: 'cloudflare',
                    accountId: this._accountId,
                    region: 'global',
                    service: 'access',
                    resourceType: 'cloudflare.access.application',
                    resourceId: app.id,
                    name: app.name,
                    tags: [],
                    metadata: {
                        domain: app.domain,
                        type: app.type
                    },
                    configuration: this._sanitize(app)
                };
                try {
                    const policies = await this._client.access.policies.list({
                        account_id: this._accountId,
                        application_id: app.id
                    });
                    for (const policy of policies) {
                        yield {
                            provider: 'cloudflare',
                            accountId: this._accountId,
                            region: 'global',
                            service: 'access',
                            resourceType: 'cloudflare.access.policy',
                            resourceId: policy.id,
                            name: policy.name,
                            tags: [],
                            metadata: {
                                applicationId: app.id,
                                applicationName: app.name,
                                decision: policy.decision
                            },
                            configuration: this._sanitize(policy)
                        };
                    }
                }
                catch (policyErr) {
                    const error = policyErr;
                    this.logger('warn', `Failed to collect policies for Access application ${app.name}`, {
                        applicationId: app.id,
                        error: error.message
                    });
                }
            }
            this.logger('info', `Collected Cloudflare Access applications`);
        }
        catch (err) {
            const error = err;
            this.logger('error', 'Failed to collect Cloudflare Access', {
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
            'api_token',
            'api_key',
            'token',
            'secret',
            'password',
            'private_key'
        ];
        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '***REDACTED***';
            }
        }
        return sanitized;
    }
}
//# sourceMappingURL=cloudflare-driver.js.map