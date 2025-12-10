import { BaseCloudDriver, CloudResource, BaseCloudDriverOptions, ListResourcesOptions } from './base-driver.js';
import { PluginError } from '../../../errors.js';
import { createHttpClient } from '../../../concerns/http-client.js';

interface HttpClient {
  get(endpoint: string): Promise<Response>;
  post(endpoint: string, options?: { body?: string }): Promise<Response>;
  put(endpoint: string, options?: { body?: string }): Promise<Response>;
  delete(endpoint: string): Promise<Response>;
}

interface MongoDBAtlasDriverConfig {
  organizationId?: string;
  services?: string[];
  projectIds?: string[] | null;
}

interface AtlasProject {
  id: string;
  name?: string;
  orgId?: string;
  clusterCount?: number;
}

export class MongoDBAtlasInventoryDriver extends BaseCloudDriver {
  private _publicKey: string | null = null;
  private _privateKey: string | null = null;
  private _baseUrl = 'https://cloud.mongodb.com/api/atlas/v2';
  private _organizationId: string | null;
  private _httpClient: HttpClient | null = null;
  private _services: string[];
  private _projectIds: string[] | null;

  constructor(options: BaseCloudDriverOptions = { driver: 'mongodb-atlas' }) {
    super({ ...options, driver: options.driver || 'mongodb-atlas' });

    const config = this.config as MongoDBAtlasDriverConfig;
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

  async _initializeCredentials(): Promise<void> {
    if (this._publicKey) return;

    const credentials = this.credentials || {};
    this._publicKey = (credentials.publicKey as string) || process.env.MONGODB_ATLAS_PUBLIC_KEY || null;
    this._privateKey = (credentials.privateKey as string) || process.env.MONGODB_ATLAS_PRIVATE_KEY || null;
    this._organizationId = (credentials.organizationId as string) || this._organizationId;

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

  async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      this._httpClient = await createHttpClient({
        baseUrl: this._baseUrl,
        headers: {
          'Accept': 'application/vnd.atlas.2025-03-12+json',
          'Content-Type': 'application/json'
        },
        auth: {
          type: 'basic',
          username: this._publicKey!,
          password: this._privateKey!
        },
        timeout: 30000,
        retry: {
          maxAttempts: 3,
          delay: 1000,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      }) as HttpClient;
    }
    return this._httpClient;
  }

  async _makeRequest(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const client = await this._getHttpClient();
    const method = (options.method || 'GET').toLowerCase();

    let response: Response;
    if (method === 'get') {
      response = await client.get(endpoint);
    } else if (method === 'post') {
      response = await client.post(endpoint, {
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } else if (method === 'put') {
      response = await client.put(endpoint, {
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } else if (method === 'delete') {
      response = await client.delete(endpoint);
    } else {
      response = await client.get(endpoint);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Atlas API error ${response.status}: ${text}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  override async *listResources(_options: ListResourcesOptions = {}): AsyncGenerator<CloudResource> {
    await this._initializeCredentials();

    const serviceCollectors: Record<string, () => AsyncGenerator<CloudResource>> = {
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
      } catch (err) {
        const error = err as Error;
        this.logger('error', `MongoDB Atlas service collection failed, skipping to next service`, {
          service,
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });
      }
    }
  }

  async _getProjects(): Promise<AtlasProject[]> {
    if (this._projectIds) {
      return this._projectIds.map(id => ({ id }));
    }

    try {
      const response = await this._makeRequest('/groups') as { results?: AtlasProject[] };
      return response.results || [];
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to fetch projects list', { error: error.message });
      return [];
    }
  }

  async *_collectProjects(): AsyncGenerator<CloudResource> {
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
        } as CloudResource;
      }

      this.logger('info', `Collected ${projects.length} MongoDB Atlas projects`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas projects', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectClusters(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/clusters`) as { results?: Record<string, unknown>[] };
          const clusters = response.results || [];

          for (const cluster of clusters) {
            const providerSettings = cluster.providerSettings as Record<string, unknown> | undefined;
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: (providerSettings?.regionName as string) || null,
              service: 'clusters',
              resourceType: 'mongodb-atlas.cluster',
              resourceId: (cluster.id as string) || (cluster.name as string),
              name: cluster.name as string,
              tags: (cluster.tags as Record<string, string>) || {},
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
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('warn', `Failed to collect clusters for project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas clusters`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas clusters', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectServerless(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/serverless`) as { results?: Record<string, unknown>[] };
          const instances = response.results || [];

          for (const instance of instances) {
            const providerSettings = instance.providerSettings as Record<string, unknown> | undefined;
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: (providerSettings?.regionName as string) || null,
              service: 'serverless',
              resourceType: 'mongodb-atlas.serverless',
              resourceId: (instance.id as string) || (instance.name as string),
              name: instance.name as string,
              tags: (instance.tags as Record<string, string>) || {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                provider: providerSettings?.providerName,
                state: instance.stateName
              },
              configuration: this._sanitize(instance)
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('debug', `No serverless instances in project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas serverless instances`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas serverless', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectUsers(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/databaseUsers`) as { results?: Record<string, unknown>[] };
          const users = response.results || [];

          for (const user of users) {
            const roles = user.roles as Array<{ roleName: string }> | undefined;
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: null,
              service: 'users',
              resourceType: 'mongodb-atlas.user',
              resourceId: `${project.id}/${user.username}`,
              name: user.username as string,
              tags: {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                databaseName: user.databaseName,
                roles: roles?.map(r => r.roleName)
              },
              configuration: this._sanitize(user)
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('warn', `Failed to collect users for project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas database users`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas users', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectAccessLists(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/accessList`) as { results?: Record<string, unknown>[] };
          const entries = response.results || [];

          for (const entry of entries) {
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: null,
              service: 'accesslists',
              resourceType: 'mongodb-atlas.accesslist',
              resourceId: `${project.id}/${entry.ipAddress || entry.cidrBlock}`,
              name: (entry.comment as string) || (entry.ipAddress as string) || (entry.cidrBlock as string),
              tags: {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                ipAddress: entry.ipAddress,
                cidrBlock: entry.cidrBlock
              },
              configuration: this._sanitize(entry)
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('warn', `Failed to collect access lists for project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas IP access lists`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas access lists', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectBackups(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const clustersResponse = await this._makeRequest(`/groups/${project.id}/clusters`) as { results?: Record<string, unknown>[] };
          const clusters = clustersResponse.results || [];

          for (const cluster of clusters) {
            try {
              const response = await this._makeRequest(
                `/groups/${project.id}/clusters/${cluster.name}/backup/snapshots`
              ) as { results?: Record<string, unknown>[] };
              const snapshots = response.results || [];
              const providerSettings = cluster.providerSettings as Record<string, unknown> | undefined;

              for (const snapshot of snapshots) {
                yield {
                  provider: 'mongodb-atlas',
                  accountId: this._organizationId || project.orgId,
                  region: (providerSettings?.regionName as string) || null,
                  service: 'backups',
                  resourceType: 'mongodb-atlas.backup',
                  resourceId: snapshot.id as string,
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
                } as CloudResource;
              }
            } catch (clusterErr) {
              const error = clusterErr as Error;
              this.logger('debug', `No backups for cluster ${cluster.name}`, {
                clusterName: cluster.name,
                error: error.message
              });
            }
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('warn', `Failed to collect backups for project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas backups`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas backups', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectAlerts(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/alertConfigs`) as { results?: Record<string, unknown>[] };
          const alerts = response.results || [];

          for (const alert of alerts) {
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: null,
              service: 'alerts',
              resourceType: 'mongodb-atlas.alert',
              resourceId: alert.id as string,
              name: alert.eventTypeName as string,
              tags: {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                enabled: alert.enabled,
                eventTypeName: alert.eventTypeName
              },
              configuration: this._sanitize(alert)
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('warn', `Failed to collect alerts for project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas alerts`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas alerts', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectDataLakes(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/dataLakes`) as Record<string, unknown>[];
          const dataLakes = response || [];

          for (const lake of dataLakes) {
            const cloudProviderConfig = lake.cloudProviderConfig as { aws?: { roleId?: string } } | undefined;
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: cloudProviderConfig?.aws?.roleId ? 'aws' : null,
              service: 'datalakes',
              resourceType: 'mongodb-atlas.datalake',
              resourceId: lake.name as string,
              name: lake.name as string,
              tags: {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                state: lake.state
              },
              configuration: this._sanitize(lake)
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('debug', `No data lakes in project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas data lakes`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas data lakes', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectSearchIndexes(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const clustersResponse = await this._makeRequest(`/groups/${project.id}/clusters`) as { results?: Record<string, unknown>[] };
          const clusters = clustersResponse.results || [];

          for (const cluster of clusters) {
            try {
              const response = await this._makeRequest(
                `/groups/${project.id}/clusters/${cluster.name}/fts/indexes`
              ) as Record<string, unknown>[];
              const indexes = response || [];
              const providerSettings = cluster.providerSettings as Record<string, unknown> | undefined;

              for (const index of indexes) {
                yield {
                  provider: 'mongodb-atlas',
                  accountId: this._organizationId || project.orgId,
                  region: (providerSettings?.regionName as string) || null,
                  service: 'search',
                  resourceType: 'mongodb-atlas.search.index',
                  resourceId: index.indexID as string,
                  name: index.name as string,
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
                } as CloudResource;
              }
            } catch (clusterErr) {
              const error = clusterErr as Error;
              this.logger('debug', `No search indexes for cluster ${cluster.name}`, {
                clusterName: cluster.name,
                error: error.message
              });
            }
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('warn', `Failed to collect search indexes for project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas search indexes`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas search indexes', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectCustomRoles(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/customDBRoles/roles`) as Record<string, unknown>[];
          const roles = response || [];

          for (const role of roles) {
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: null,
              service: 'customroles',
              resourceType: 'mongodb-atlas.customrole',
              resourceId: `${project.id}/${role.roleName}`,
              name: role.roleName as string,
              tags: {},
              metadata: {
                projectId: project.id,
                projectName: project.name
              },
              configuration: this._sanitize(role)
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('debug', `No custom roles in project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas custom roles`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas custom roles', {
        error: error.message,
        stack: error.stack
      });
      throw err;
    }
  }

  async *_collectEvents(): AsyncGenerator<CloudResource> {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const minDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const response = await this._makeRequest(
            `/groups/${project.id}/events?minDate=${minDate}&itemsPerPage=100`
          ) as { results?: Record<string, unknown>[] };
          const events = response.results || [];

          for (const event of events) {
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: null,
              service: 'events',
              resourceType: 'mongodb-atlas.event',
              resourceId: event.id as string,
              name: event.eventTypeName as string,
              tags: {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                eventTypeName: event.eventTypeName,
                created: event.created
              },
              configuration: this._sanitize(event)
            } as CloudResource;
          }
        } catch (projectErr) {
          const error = projectErr as Error;
          this.logger('debug', `No recent events in project ${project.id}`, {
            projectId: project.id,
            error: error.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas events`);
    } catch (err) {
      const error = err as Error;
      this.logger('error', 'Failed to collect MongoDB Atlas events', {
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
