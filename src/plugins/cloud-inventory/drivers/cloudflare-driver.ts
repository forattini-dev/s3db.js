import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
import { PluginError } from '../../../errors.js';

interface CloudflareClient {
  workers: { scripts: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  r2: { buckets: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  pages: { projects: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  d1: { database: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  kv: { namespaces: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  durableObjects: { namespaces: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  zones: { list: () => Promise<unknown[]> };
  dns: { records: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  loadBalancers: { list: (params: Record<string, unknown>) => Promise<unknown[]> };
  ssl: { certificatePacks: { list: (params: Record<string, unknown>) => Promise<unknown[]> } };
  rulesets: { list: (params: Record<string, unknown>) => Promise<unknown[]> };
  access: {
    applications: { list: (params: Record<string, unknown>) => Promise<unknown[]> };
    policies: { list: (params: Record<string, unknown>) => Promise<unknown[]> };
  };
}

interface CloudflareDriverConfig {
  accountId?: string;
  services?: string[];
}

export class CloudflareInventoryDriver extends BaseCloudDriver {
  private _apiToken: string | null = null;
  private _accountId: string | null = null;
  private _client: CloudflareClient | null = null;
  private _services: string[];

  constructor(options: BaseCloudDriverOptions = { driver: 'cloudflare' }) {
    super({ ...options, driver: options.driver || 'cloudflare' });

    const config = this.config as CloudflareDriverConfig;
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

  async _initializeClient(): Promise<void> {
    if (this._client) return;

    const credentials = this.credentials || {};
    this._apiToken = (credentials.apiToken as string) || (credentials.token as string) || process.env.CLOUDFLARE_API_TOKEN || null;
    this._accountId = (credentials.accountId as string) || (this.config as CloudflareDriverConfig)?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || null;

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
    }) as unknown as CloudflareClient;

    this.logger('info', 'Cloudflare API client initialized', {
      accountId: this._accountId,
      services: this._services.length
    });
  }

  override async *listResources(_options: ListResourcesOptions = {}): AsyncGenerator<CloudResource> {
    await this._initializeClient();

    const serviceCollectors: Record<string, () => AsyncGenerator<CloudResource>> = {
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
      } catch (err) {
        const error = err as Error;
        this.logger('error', `Cloudflare service collection failed, skipping to next service`, {
          service,
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });
      }
    }
  }

  async *_collectWorkers(): AsyncGenerator<CloudResource> {
    try {
      if (!this._accountId) {
        this.logger('warn', 'Account ID required for Workers collection, skipping');
        return;
      }

      const scripts = await this._client!.workers.scripts.list({ account_id: this._accountId }) as Record<string, unknown>[];

      for (const script of scripts) {
        yield {
          provider: 'cloudflare',
          accountId: this._accountId,
          region: 'global',
          service: 'workers',
          resourceType: 'cloudflare.workers.script',
          resourceId: script.id as string,
          name: script.id as string,
          tags: (script.tags as string[]) || [],
          configuration: this._sanitize(script)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${scripts.length || 0} Cloudflare Workers scripts`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare Workers', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectR2(): AsyncGenerator<CloudResource> {
    try {
      if (!this._accountId) {
        this.logger('warn', 'Account ID required for R2 collection, skipping');
        return;
      }

      const buckets = await this._client!.r2.buckets.list({ account_id: this._accountId }) as Record<string, unknown>[];

      for (const bucket of buckets) {
        yield {
          provider: 'cloudflare',
          accountId: this._accountId,
          region: (bucket.location as string) || 'global',
          service: 'r2',
          resourceType: 'cloudflare.r2.bucket',
          resourceId: bucket.name as string,
          name: bucket.name as string,
          tags: [],
          configuration: this._sanitize(bucket)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${buckets.length || 0} Cloudflare R2 buckets`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare R2', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectPages(): AsyncGenerator<CloudResource> {
    try {
      if (!this._accountId) {
        this.logger('warn', 'Account ID required for Pages collection, skipping');
        return;
      }

      const projects = await this._client!.pages.projects.list({ account_id: this._accountId }) as Record<string, unknown>[];

      for (const project of projects) {
        yield {
          provider: 'cloudflare',
          accountId: this._accountId,
          region: 'global',
          service: 'pages',
          resourceType: 'cloudflare.pages.project',
          resourceId: (project.id as string) || (project.name as string),
          name: project.name as string,
          tags: [],
          configuration: this._sanitize(project)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${projects.length || 0} Cloudflare Pages projects`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare Pages', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectD1(): AsyncGenerator<CloudResource> {
    try {
      if (!this._accountId) {
        this.logger('warn', 'Account ID required for D1 collection, skipping');
        return;
      }

      const databases = await this._client!.d1.database.list({ account_id: this._accountId }) as Record<string, unknown>[];

      for (const database of databases) {
        yield {
          provider: 'cloudflare',
          accountId: this._accountId,
          region: 'global',
          service: 'd1',
          resourceType: 'cloudflare.d1.database',
          resourceId: database.uuid as string,
          name: database.name as string,
          tags: [],
          configuration: this._sanitize(database)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${databases.length || 0} Cloudflare D1 databases`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare D1', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectKV(): AsyncGenerator<CloudResource> {
    try {
      if (!this._accountId) {
        this.logger('warn', 'Account ID required for KV collection, skipping');
        return;
      }

      const namespaces = await this._client!.kv.namespaces.list({ account_id: this._accountId }) as Record<string, unknown>[];

      for (const namespace of namespaces) {
        yield {
          provider: 'cloudflare',
          accountId: this._accountId,
          region: 'global',
          service: 'kv',
          resourceType: 'cloudflare.kv.namespace',
          resourceId: namespace.id as string,
          name: namespace.title as string,
          tags: [],
          configuration: this._sanitize(namespace)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${namespaces.length || 0} Cloudflare KV namespaces`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare KV', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectDurableObjects(): AsyncGenerator<CloudResource> {
    try {
      if (!this._accountId) {
        this.logger('warn', 'Account ID required for Durable Objects collection, skipping');
        return;
      }

      const namespaces = await this._client!.durableObjects.namespaces.list({ account_id: this._accountId }) as Record<string, unknown>[];

      for (const namespace of namespaces) {
        yield {
          provider: 'cloudflare',
          accountId: this._accountId,
          region: 'global',
          service: 'durable-objects',
          resourceType: 'cloudflare.durableobjects.namespace',
          resourceId: namespace.id as string,
          name: namespace.name as string,
          tags: [],
          configuration: this._sanitize(namespace)
        } as unknown as CloudResource;
      }

      this.logger('info', `Collected ${namespaces.length || 0} Cloudflare Durable Objects namespaces`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare Durable Objects', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectZones(): AsyncGenerator<CloudResource> {
    try {
      const zones = await this._client!.zones.list() as Record<string, unknown>[];

      for (const zone of zones) {
        const account = zone.account as Record<string, unknown> | undefined;
        yield {
          provider: 'cloudflare',
          accountId: this._accountId || (account?.id as string),
          region: 'global',
          service: 'zones',
          resourceType: 'cloudflare.zone',
          resourceId: zone.id as string,
          name: zone.name as string,
          tags: [],
          configuration: this._sanitize(zone)
        } as unknown as CloudResource;

        try {
          const records = await this._client!.dns.records.list({ zone_id: zone.id }) as Record<string, unknown>[];

          for (const record of records) {
            yield {
              provider: 'cloudflare',
              accountId: this._accountId || (account?.id as string),
              region: 'global',
              service: 'zones',
              resourceType: 'cloudflare.dns.record',
              resourceId: record.id as string,
              name: `${record.name} (${record.type})`,
              tags: (record.tags as string[]) || [],
              metadata: { zoneId: zone.id, zoneName: zone.name },
              configuration: this._sanitize(record)
            } as unknown as CloudResource;
          }
        } catch (recordErr) {
          const error = recordErr as Error;
          this.logger('warn', `Failed to collect DNS records for zone ${zone.name}`, {
            zoneId: zone.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected ${zones.length || 0} Cloudflare zones`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare zones', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectLoadBalancers(): AsyncGenerator<CloudResource> {
    try {
      const zones = await this._client!.zones.list() as Record<string, unknown>[];

      for (const zone of zones) {
        const account = zone.account as Record<string, unknown> | undefined;
        try {
          const loadBalancers = await this._client!.loadBalancers.list({ zone_id: zone.id }) as Record<string, unknown>[];

          for (const lb of loadBalancers) {
            yield {
              provider: 'cloudflare',
              accountId: this._accountId || (account?.id as string),
              region: 'global',
              service: 'loadbalancers',
              resourceType: 'cloudflare.loadbalancer',
              resourceId: lb.id as string,
              name: lb.name as string,
              tags: [],
              metadata: { zoneId: zone.id, zoneName: zone.name },
              configuration: this._sanitize(lb)
            } as unknown as CloudResource;
          }
        } catch (lbErr) {
          const error = lbErr as Error;
          this.logger('debug', `No load balancers in zone ${zone.name}`, {
            zoneId: zone.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected Cloudflare load balancers`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare load balancers', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectCertificates(): AsyncGenerator<CloudResource> {
    try {
      const zones = await this._client!.zones.list() as Record<string, unknown>[];

      for (const zone of zones) {
        const account = zone.account as Record<string, unknown> | undefined;
        try {
          const certificates = await this._client!.ssl.certificatePacks.list({ zone_id: zone.id }) as Record<string, unknown>[];

          for (const cert of certificates) {
            yield {
              provider: 'cloudflare',
              accountId: this._accountId || (account?.id as string),
              region: 'global',
              service: 'certificates',
              resourceType: 'cloudflare.ssl.certificate',
              resourceId: cert.id as string,
              name: `${zone.name} - ${cert.type}`,
              tags: [],
              metadata: {
                zoneId: zone.id,
                zoneName: zone.name,
                type: cert.type,
                status: cert.status
              },
              configuration: this._sanitize(cert)
            } as unknown as CloudResource;
          }
        } catch (certErr) {
          const error = certErr as Error;
          this.logger('debug', `No certificates in zone ${zone.name}`, {
            zoneId: zone.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected Cloudflare certificates`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare certificates', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectWAF(): AsyncGenerator<CloudResource> {
    try {
      const zones = await this._client!.zones.list() as Record<string, unknown>[];

      for (const zone of zones) {
        const account = zone.account as Record<string, unknown> | undefined;
        try {
          const rulesets = await this._client!.rulesets.list({ zone_id: zone.id }) as Record<string, unknown>[];

          for (const ruleset of rulesets) {
            const phase = ruleset.phase as string;
            if (phase && (phase.includes('http_') || phase.includes('firewall'))) {
              yield {
                provider: 'cloudflare',
                accountId: this._accountId || (account?.id as string),
                region: 'global',
                service: 'waf',
                resourceType: 'cloudflare.waf.ruleset',
                resourceId: ruleset.id as string,
                name: ruleset.name as string,
                tags: [],
                metadata: {
                  zoneId: zone.id,
                  zoneName: zone.name,
                  phase: ruleset.phase,
                  kind: ruleset.kind
                },
                configuration: this._sanitize(ruleset)
              } as unknown as CloudResource;
            }
          }
        } catch (wafErr) {
          const error = wafErr as Error;
          this.logger('debug', `No WAF rulesets in zone ${zone.name}`, {
            zoneId: zone.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected Cloudflare WAF rulesets`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare WAF', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectAccess(): AsyncGenerator<CloudResource> {
    try {
      if (!this._accountId) {
        this.logger('warn', 'Account ID required for Access collection, skipping');
        return;
      }

      const applications = await this._client!.access.applications.list({ account_id: this._accountId }) as Record<string, unknown>[];

      for (const app of applications) {
        yield {
          provider: 'cloudflare',
          accountId: this._accountId,
          region: 'global',
          service: 'access',
          resourceType: 'cloudflare.access.application',
          resourceId: app.id as string,
          name: app.name as string,
          tags: [],
          metadata: {
            domain: app.domain,
            type: app.type
          },
          configuration: this._sanitize(app)
        } as unknown as CloudResource;

        try {
          const policies = await this._client!.access.policies.list({
            account_id: this._accountId,
            application_id: app.id
          }) as Record<string, unknown>[];

          for (const policy of policies) {
            yield {
              provider: 'cloudflare',
              accountId: this._accountId,
              region: 'global',
              service: 'access',
              resourceType: 'cloudflare.access.policy',
              resourceId: policy.id as string,
              name: policy.name as string,
              tags: [],
              metadata: {
                applicationId: app.id,
                applicationName: app.name,
                decision: policy.decision
              },
              configuration: this._sanitize(policy)
            } as unknown as CloudResource;
          }
        } catch (policyErr) {
          const error = policyErr as Error;
          this.logger('warn', `Failed to collect policies for Access application ${app.name}`, {
            applicationId: app.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected Cloudflare Access applications`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect Cloudflare Access', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  _sanitize(config: unknown): Record<string, unknown> {
    if (!config || typeof config !== 'object') return config as Record<string, unknown>;

    const sanitized = { ...config } as Record<string, unknown>;
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
