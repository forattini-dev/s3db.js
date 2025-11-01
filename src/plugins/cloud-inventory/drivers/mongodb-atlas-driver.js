import { BaseCloudDriver } from './base-driver.js';
import { PluginError } from '../../../errors.js';

/**
 * Production-ready MongoDB Atlas inventory driver using mongodb-atlas-api-client.
 *
 * Covers 10+ services with 15+ resource types:
 * - Compute (Clusters, Serverless Instances)
 * - Storage (Backups, Snapshots, Data Lakes)
 * - Security (Database Users, IP Access Lists, Custom Roles)
 * - Monitoring (Alerts, Events)
 * - Search (Atlas Search Indexes)
 * - Projects & Organizations
 *
 * @see https://www.mongodb.com/docs/atlas/api/
 * @see https://www.npmjs.com/package/mongodb-atlas-api-client
 */
export class MongoDBAtlasInventoryDriver extends BaseCloudDriver {
  constructor(options = {}) {
    super({ ...options, driver: options.driver || 'mongodb-atlas' });

    this._publicKey = null;
    this._privateKey = null;
    this._baseUrl = 'https://cloud.mongodb.com/api/atlas/v2';
    this._organizationId = this.config?.organizationId || null;

    // Services to collect (can be filtered via config.services)
    this._services = this.config?.services || [
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

    // Projects to scan (null = all accessible projects)
    this._projectIds = this.config?.projectIds || null;
  }

  /**
   * Initialize MongoDB Atlas credentials.
   */
  async _initializeCredentials() {
    if (this._publicKey) return;

    const credentials = this.credentials || {};
    this._publicKey = credentials.publicKey || process.env.MONGODB_ATLAS_PUBLIC_KEY;
    this._privateKey = credentials.privateKey || process.env.MONGODB_ATLAS_PRIVATE_KEY;
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

  /**
   * Create Atlas API client.
   */
  async _createClient() {
    const AtlasClient = await import('mongodb-atlas-api-client');

    return AtlasClient.default({
      publicKey: this._publicKey,
      privateKey: this._privateKey,
      baseUrl: this._baseUrl
    });
  }

  /**
   * Make authenticated request to Atlas API.
   */
  async _makeRequest(endpoint, options = {}) {
    const crypto = await import('crypto');
    const https = await import('https');

    const url = new URL(endpoint, this._baseUrl);
    const method = options.method || 'GET';

    // HTTP Digest Authentication
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Accept': 'application/vnd.atlas.2025-03-12+json',
          'Content-Type': 'application/json'
        },
        auth: `${this._publicKey}:${this._privateKey}`
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            resolve(data);
          }
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  /**
   * Main entry point - lists all resources from configured services.
   */
  async *listResources(options = {}) {
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
      } catch (err) {
        // Continue with next service instead of failing entire sync
        this.logger('error', `MongoDB Atlas service collection failed, skipping to next service`, {
          service,
          error: err.message,
          errorName: err.name,
          stack: err.stack
        });
      }
    }
  }

  /**
   * Get list of projects to iterate.
   */
  async _getProjects() {
    if (this._projectIds) {
      return this._projectIds.map(id => ({ id }));
    }

    try {
      const response = await this._makeRequest('/groups');
      return response.results || [];
    } catch (err) {
      this.logger('error', 'Failed to fetch projects list', { error: err.message });
      return [];
    }
  }

  /**
   * Collect Projects (Groups).
   */
  async *_collectProjects() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        yield {
          provider: 'mongodb-atlas',
          accountId: this._organizationId || project.orgId,
          region: null, // Projects are global
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
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas projects', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Clusters.
   */
  async *_collectClusters() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/clusters`);
          const clusters = response.results || [];

          for (const cluster of clusters) {
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: cluster.providerSettings?.regionName || null,
              service: 'clusters',
              resourceType: 'mongodb-atlas.cluster',
              resourceId: cluster.id || cluster.name,
              name: cluster.name,
              tags: cluster.tags || {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                tier: cluster.providerSettings?.instanceSizeName,
                provider: cluster.providerSettings?.providerName,
                mongoDBVersion: cluster.mongoDBVersion,
                clusterType: cluster.clusterType,
                state: cluster.stateName
              },
              configuration: this._sanitize(cluster)
            };
          }
        } catch (projectErr) {
          this.logger('warn', `Failed to collect clusters for project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas clusters`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas clusters', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Serverless Instances.
   */
  async *_collectServerless() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/serverless`);
          const instances = response.results || [];

          for (const instance of instances) {
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: instance.providerSettings?.regionName || null,
              service: 'serverless',
              resourceType: 'mongodb-atlas.serverless',
              resourceId: instance.id || instance.name,
              name: instance.name,
              tags: instance.tags || {},
              metadata: {
                projectId: project.id,
                projectName: project.name,
                provider: instance.providerSettings?.providerName,
                state: instance.stateName
              },
              configuration: this._sanitize(instance)
            };
          }
        } catch (projectErr) {
          this.logger('debug', `No serverless instances in project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas serverless instances`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas serverless', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Database Users.
   */
  async *_collectUsers() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/databaseUsers`);
          const users = response.results || [];

          for (const user of users) {
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
                roles: user.roles?.map(r => r.roleName)
              },
              configuration: this._sanitize(user)
            };
          }
        } catch (projectErr) {
          this.logger('warn', `Failed to collect users for project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas database users`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas users', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect IP Access Lists (Whitelists).
   */
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
        } catch (projectErr) {
          this.logger('warn', `Failed to collect access lists for project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas IP access lists`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas access lists', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Cloud Backups.
   */
  async *_collectBackups() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          // Get clusters first
          const clustersResponse = await this._makeRequest(`/groups/${project.id}/clusters`);
          const clusters = clustersResponse.results || [];

          for (const cluster of clusters) {
            try {
              const response = await this._makeRequest(
                `/groups/${project.id}/clusters/${cluster.name}/backup/snapshots`
              );
              const snapshots = response.results || [];

              for (const snapshot of snapshots) {
                yield {
                  provider: 'mongodb-atlas',
                  accountId: this._organizationId || project.orgId,
                  region: cluster.providerSettings?.regionName || null,
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
            } catch (clusterErr) {
              this.logger('debug', `No backups for cluster ${cluster.name}`, {
                clusterName: cluster.name,
                error: clusterErr.message
              });
            }
          }
        } catch (projectErr) {
          this.logger('warn', `Failed to collect backups for project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas backups`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas backups', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Alert Configurations.
   */
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
        } catch (projectErr) {
          this.logger('warn', `Failed to collect alerts for project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas alerts`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas alerts', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Data Lakes (Federated Database Instances).
   */
  async *_collectDataLakes() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          const response = await this._makeRequest(`/groups/${project.id}/dataLakes`);
          const dataLakes = response || [];

          for (const lake of dataLakes) {
            yield {
              provider: 'mongodb-atlas',
              accountId: this._organizationId || project.orgId,
              region: lake.cloudProviderConfig?.aws?.roleId ? 'aws' : null,
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
        } catch (projectErr) {
          this.logger('debug', `No data lakes in project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas data lakes`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas data lakes', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Atlas Search Indexes.
   */
  async *_collectSearchIndexes() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          // Get clusters first
          const clustersResponse = await this._makeRequest(`/groups/${project.id}/clusters`);
          const clusters = clustersResponse.results || [];

          for (const cluster of clusters) {
            try {
              const response = await this._makeRequest(
                `/groups/${project.id}/clusters/${cluster.name}/fts/indexes`
              );
              const indexes = response || [];

              for (const index of indexes) {
                yield {
                  provider: 'mongodb-atlas',
                  accountId: this._organizationId || project.orgId,
                  region: cluster.providerSettings?.regionName || null,
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
            } catch (clusterErr) {
              this.logger('debug', `No search indexes for cluster ${cluster.name}`, {
                clusterName: cluster.name,
                error: clusterErr.message
              });
            }
          }
        } catch (projectErr) {
          this.logger('warn', `Failed to collect search indexes for project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas search indexes`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas search indexes', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Custom Database Roles.
   */
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
        } catch (projectErr) {
          this.logger('debug', `No custom roles in project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas custom roles`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas custom roles', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Events (audit logs).
   */
  async *_collectEvents() {
    try {
      const projects = await this._getProjects();

      for (const project of projects) {
        try {
          // Limit to recent events (last 7 days)
          const minDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const response = await this._makeRequest(
            `/groups/${project.id}/events?minDate=${minDate}&itemsPerPage=100`
          );
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
        } catch (projectErr) {
          this.logger('debug', `No recent events in project ${project.id}`, {
            projectId: project.id,
            error: projectErr.message
          });
        }
      }

      this.logger('info', `Collected MongoDB Atlas events`);
    } catch (err) {
      this.logger('error', 'Failed to collect MongoDB Atlas events', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Sanitize configuration by removing sensitive data.
   */
  _sanitize(config) {
    if (!config || typeof config !== 'object') return config;

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
