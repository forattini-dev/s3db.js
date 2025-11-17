import { BaseCloudDriver } from './base-driver.js';
import { PluginError } from '../../../errors.js';

/**
 * Production-ready Hetzner Cloud inventory driver using hcloud-js library.
 *
 * Covers 12+ services with 15+ resource types:
 * - Compute (servers/VPS, placement groups)
 * - Storage (volumes)
 * - Networking (networks, load balancers, firewalls, floating IPs, primary IPs)
 * - SSH Keys, Images, Certificates, ISOs
 *
 * @see https://docs.hetzner.cloud/
 * @see https://github.com/dennisbruner/hcloud-js
 */
export class HetznerInventoryDriver extends BaseCloudDriver {
  constructor(options = {}) {
    super({ ...options, driver: options.driver || 'hetzner' });

    this._apiToken = null;
    this._client = null;
    this._accountId = this.config?.accountId || 'hetzner';

    // Services to collect (can be filtered via config.services)
    this._services = this.config?.services || [
      'servers',
      'volumes',
      'networks',
      'loadbalancers',
      'firewalls',
      'floatingips',
      'sshkeys',
      'images',
      'certificates',
      'primaryips',
      'placementgroups',
      'isos'
    ];
  }

  /**
   * Initialize Hetzner Cloud API client.
   */
  async _initializeClient() {
    if (this._client) return;

    const credentials = this.credentials || {};
    this._apiToken = credentials.token || credentials.apiToken || process.env.HETZNER_TOKEN;

    if (!this._apiToken) {
      throw new PluginError('Hetzner API token is required. Provide via credentials.token or HETZNER_TOKEN env var.', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'hetzner:initClient',
        statusCode: 400,
        retriable: false,
        suggestion: 'Set credentials.token or HETZNER_TOKEN prior to initializing the Hetzner driver.'
      });
    }

    // Lazy import to keep core package lightweight
    const hcloud = await import('hcloud-js');
    this._client = new hcloud.Client(this._apiToken);

    this.logger('info', 'Hetzner Cloud API client initialized', {
      accountId: this._accountId,
      services: this._services.length
    });
  }

  /**
   * Main entry point - lists all resources from configured services.
   */
  async *listResources(options = {}) {
    await this._initializeClient();

    const serviceCollectors = {
      servers: () => this._collectServers(),
      volumes: () => this._collectVolumes(),
      networks: () => this._collectNetworks(),
      loadbalancers: () => this._collectLoadBalancers(),
      firewalls: () => this._collectFirewalls(),
      floatingips: () => this._collectFloatingIPs(),
      sshkeys: () => this._collectSSHKeys(),
      images: () => this._collectImages(),
      certificates: () => this._collectCertificates(),
      primaryips: () => this._collectPrimaryIPs(),
      placementgroups: () => this._collectPlacementGroups(),
      isos: () => this._collectISOs()
    };

    for (const service of this._services) {
      const collector = serviceCollectors[service];
      if (!collector) {
        this.logger('warn', `Unknown Hetzner service: ${service}`, { service });
        continue;
      }

      try {
        this.logger('info', `Collecting Hetzner ${service} resources`, { service });
        yield* collector();
      } catch (err) {
        // Continue with next service instead of failing entire sync
        this.logger('error', `Hetzner service collection failed, skipping to next service`, {
          service,
          error: err.message,
          errorName: err.name,
          stack: err.stack
        });
      }
    }
  }

  /**
   * Collect Servers (VPS).
   */
  async *_collectServers() {
    try {
      const response = await this._client.servers.list();
      const servers = response.servers || [];

      for (const server of servers) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: server.datacenter?.location?.name || null,
          service: 'servers',
          resourceType: 'hetzner.server',
          resourceId: server.id?.toString(),
          name: server.name,
          tags: this._extractLabels(server.labels),
          configuration: this._sanitize(server)
        };
      }

      this.logger('info', `Collected ${servers.length} Hetzner servers`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner servers', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Volumes (block storage).
   */
  async *_collectVolumes() {
    try {
      const response = await this._client.volumes.list();
      const volumes = response.volumes || [];

      for (const volume of volumes) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: volume.location?.name || null,
          service: 'volumes',
          resourceType: 'hetzner.volume',
          resourceId: volume.id?.toString(),
          name: volume.name,
          tags: this._extractLabels(volume.labels),
          configuration: this._sanitize(volume)
        };
      }

      this.logger('info', `Collected ${volumes.length} Hetzner volumes`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner volumes', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Networks (private networks/VPC).
   */
  async *_collectNetworks() {
    try {
      const response = await this._client.networks.list();
      const networks = response.networks || [];

      for (const network of networks) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: null, // Networks span multiple locations
          service: 'networks',
          resourceType: 'hetzner.network',
          resourceId: network.id?.toString(),
          name: network.name,
          tags: this._extractLabels(network.labels),
          configuration: this._sanitize(network)
        };

        // Subnets are embedded in network
        if (network.subnets && Array.isArray(network.subnets)) {
          for (const subnet of network.subnets) {
            yield {
              provider: 'hetzner',
              accountId: this._accountId,
              region: subnet.network_zone,
              service: 'networks',
              resourceType: 'hetzner.network.subnet',
              resourceId: `${network.id}/subnet/${subnet.ip_range}`,
              name: `${network.name}-${subnet.type}`,
              tags: {},
              metadata: { networkId: network.id, networkName: network.name },
              configuration: this._sanitize(subnet)
            };
          }
        }
      }

      this.logger('info', `Collected ${networks.length} Hetzner networks`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner networks', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Load Balancers.
   */
  async *_collectLoadBalancers() {
    try {
      const response = await this._client.loadBalancers.list();
      const loadBalancers = response.load_balancers || [];

      for (const lb of loadBalancers) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: lb.location?.name || null,
          service: 'loadbalancers',
          resourceType: 'hetzner.loadbalancer',
          resourceId: lb.id?.toString(),
          name: lb.name,
          tags: this._extractLabels(lb.labels),
          configuration: this._sanitize(lb)
        };
      }

      this.logger('info', `Collected ${loadBalancers.length} Hetzner load balancers`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner load balancers', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Firewalls.
   */
  async *_collectFirewalls() {
    try {
      const response = await this._client.firewalls.list();
      const firewalls = response.firewalls || [];

      for (const firewall of firewalls) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: null, // Firewalls are global
          service: 'firewalls',
          resourceType: 'hetzner.firewall',
          resourceId: firewall.id?.toString(),
          name: firewall.name,
          tags: this._extractLabels(firewall.labels),
          configuration: this._sanitize(firewall)
        };
      }

      this.logger('info', `Collected ${firewalls.length} Hetzner firewalls`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner firewalls', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Floating IPs.
   */
  async *_collectFloatingIPs() {
    try {
      const response = await this._client.floatingIPs.list();
      const floatingIPs = response.floating_ips || [];

      for (const fip of floatingIPs) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: fip.home_location?.name || null,
          service: 'floatingips',
          resourceType: 'hetzner.floatingip',
          resourceId: fip.id?.toString(),
          name: fip.name || fip.ip,
          tags: this._extractLabels(fip.labels),
          configuration: this._sanitize(fip)
        };
      }

      this.logger('info', `Collected ${floatingIPs.length} Hetzner floating IPs`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner floating IPs', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect SSH Keys.
   */
  async *_collectSSHKeys() {
    try {
      const response = await this._client.sshKeys.list();
      const sshKeys = response.ssh_keys || [];

      for (const key of sshKeys) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: null, // SSH keys are global
          service: 'sshkeys',
          resourceType: 'hetzner.sshkey',
          resourceId: key.id?.toString(),
          name: key.name,
          tags: this._extractLabels(key.labels),
          configuration: this._sanitize(key)
        };
      }

      this.logger('info', `Collected ${sshKeys.length} Hetzner SSH keys`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner SSH keys', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect custom Images.
   */
  async *_collectImages() {
    try {
      const response = await this._client.images.list();
      const images = response.images || [];

      // Filter to only custom images (type = 'snapshot' or 'backup')
      const customImages = images.filter(img => img.type === 'snapshot' || img.type === 'backup');

      for (const image of customImages) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: null, // Images are global
          service: 'images',
          resourceType: 'hetzner.image',
          resourceId: image.id?.toString(),
          name: image.description || image.name || image.id?.toString(),
          tags: this._extractLabels(image.labels),
          configuration: this._sanitize(image)
        };
      }

      this.logger('info', `Collected ${customImages.length} custom Hetzner images`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner images', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect SSL Certificates.
   */
  async *_collectCertificates() {
    try {
      const response = await this._client.certificates.list();
      const certificates = response.certificates || [];

      for (const cert of certificates) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: null, // Certificates are global
          service: 'certificates',
          resourceType: 'hetzner.certificate',
          resourceId: cert.id?.toString(),
          name: cert.name,
          tags: this._extractLabels(cert.labels),
          configuration: this._sanitize(cert)
        };
      }

      this.logger('info', `Collected ${certificates.length} Hetzner certificates`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner certificates', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Primary IPs (independent public IPs).
   */
  async *_collectPrimaryIPs() {
    try {
      const response = await this._client.primaryIPs.list();
      const primaryIPs = response.primary_ips || [];

      for (const ip of primaryIPs) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: ip.datacenter?.location?.name || null,
          service: 'primaryips',
          resourceType: 'hetzner.primaryip',
          resourceId: ip.id?.toString(),
          name: ip.name || ip.ip,
          tags: this._extractLabels(ip.labels),
          metadata: {
            type: ip.type, // ipv4 or ipv6
            assignedToId: ip.assignee_id
          },
          configuration: this._sanitize(ip)
        };
      }

      this.logger('info', `Collected ${primaryIPs.length} Hetzner primary IPs`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner primary IPs', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect Placement Groups (server anti-affinity).
   */
  async *_collectPlacementGroups() {
    try {
      const response = await this._client.placementGroups.list();
      const placementGroups = response.placement_groups || [];

      for (const pg of placementGroups) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: null, // Placement groups are global
          service: 'placementgroups',
          resourceType: 'hetzner.placementgroup',
          resourceId: pg.id?.toString(),
          name: pg.name,
          tags: this._extractLabels(pg.labels),
          metadata: {
            type: pg.type,
            servers: pg.servers || []
          },
          configuration: this._sanitize(pg)
        };
      }

      this.logger('info', `Collected ${placementGroups.length} Hetzner placement groups`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner placement groups', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Collect ISOs (custom installation images).
   */
  async *_collectISOs() {
    try {
      const response = await this._client.isos.list();
      const isos = response.isos || [];

      for (const iso of isos) {
        yield {
          provider: 'hetzner',
          accountId: this._accountId,
          region: null, // ISOs are global
          service: 'isos',
          resourceType: 'hetzner.iso',
          resourceId: iso.id?.toString(),
          name: iso.name,
          tags: {},
          metadata: {
            type: iso.type,
            deprecated: iso.deprecated,
            deprecation: iso.deprecation
          },
          configuration: this._sanitize(iso)
        };
      }

      this.logger('info', `Collected ${isos.length} Hetzner ISOs`);
    } catch (err) {
      this.logger('error', 'Failed to collect Hetzner ISOs', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Extract labels from Hetzner labels object.
   */
  _extractLabels(labels) {
    if (!labels || typeof labels !== 'object') return {};
    return { ...labels };
  }

  /**
   * Sanitize configuration by removing sensitive data.
   */
  _sanitize(config) {
    if (!config || typeof config !== 'object') return config;

    const sanitized = { ...config };
    const sensitiveFields = [
      'root_password',
      'password',
      'token',
      'secret',
      'api_key',
      'private_key',
      'public_key',
      'certificate',
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
