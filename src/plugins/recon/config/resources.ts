/**
 * ReconPlugin Database Resources Configuration
 *
 * Defines 7 database resources for storing reconnaissance data:
 * 1. plg_recon_hosts - Full host profiles with fingerprints
 * 2. plg_recon_reports - Historical scan reports
 * 3. plg_recon_stages - Per-stage execution metadata
 * 4. plg_recon_diffs - Change detection between scans
 * 5. plg_recon_subdomains - Consolidated subdomain lists
 * 6. plg_recon_paths - Discovered web paths/endpoints
 * 7. plg_recon_targets - Dynamic target management
 */

export interface ResourceAttribute {
  [key: string]: string | ResourceAttribute;
}

export interface PartitionFieldConfig {
  [field: string]: string;
}

export interface PartitionConfig {
  fields: PartitionFieldConfig;
}

export interface ResourceConfig {
  name: string;
  attributes: Record<string, any>;
  partitions?: Record<string, PartitionConfig>;
  behavior: 'body-overflow' | 'body-only' | 'enforce-limits' | 'truncate-data' | 'user-managed';
  timestamps: boolean;
}

export type ResourceName = 'hosts' | 'reports' | 'stages' | 'diffs' | 'subdomains' | 'paths' | 'targets';

export const RESOURCE_CONFIGS: Record<ResourceName, ResourceConfig> = {
  hosts: {
    name: 'plg_recon_hosts',
    attributes: {
      host: 'string|required',
      ips: {
        ipv4: 'array|items:ip4|optional',
        ipv6: 'array|items:ip6|optional'
      },
      nameservers: 'array|items:string|optional',
      mailServers: 'array|items:string|optional',
      txtRecords: 'array|items:string|optional',
      certificate: {
        issuer: 'object|optional',
        subject: 'object|optional',
        validFrom: 'string|optional',
        validTo: 'string|optional',
        fingerprint: 'string|optional',
        sans: 'array|items:string|optional'
      },
      openPorts: 'array|items:object|optional',
      subdomains: {
        total: 'number|optional',
        list: 'array|items:string|optional',
        sources: 'array|items:string|optional'
      },
      discoveredPaths: {
        total: 'number|optional',
        list: 'array|items:string|optional'
      },
      technologies: {
        server: 'string|optional',
        poweredBy: 'string|optional',
        detected: 'array|items:string|optional',
        cms: 'string|optional',
        frameworks: 'array|items:string|optional'
      },
      security: {
        tls: 'object|optional',
        vulnerabilities: 'object|optional',
        headers: 'object|optional'
      },
      lastScan: 'string|required',
      scanCount: 'number|default:1',
      firstSeen: 'string|required',
      riskLevel: 'string|enum:low,medium,high,critical|default:low'
    },
    partitions: {
      byHost: {
        fields: {
          host: 'string'
        }
      }
    },
    behavior: 'body-overflow',
    timestamps: true
  },

  reports: {
    name: 'plg_recon_reports',
    attributes: {
      reportId: 'string|required',
      target: {
        original: 'string|required',
        host: 'string|required',
        protocol: 'string|optional',
        port: 'number|optional',
        path: 'string|optional'
      },
      timestamp: 'string|required',
      timestampDay: 'string|required',
      duration: 'number|required',
      status: 'string|enum:completed,failed,partial|required',
      results: 'object|required',
      fingerprint: 'object|required',
      summary: {
        totalIPs: 'number|default:0',
        totalPorts: 'number|default:0',
        totalSubdomains: 'number|default:0',
        totalPaths: 'number|default:0',
        detectedTechnologies: 'number|default:0',
        riskLevel: 'string|optional'
      },
      uptime: {
        status: 'string|optional',
        uptimePercentage: 'string|optional',
        lastCheck: 'string|optional',
        isDown: 'boolean|optional',
        consecutiveFails: 'number|optional'
      }
    },
    partitions: {
      byHost: {
        fields: {
          'target.host': 'string'
        }
      },
      byDay: {
        fields: {
          timestampDay: 'string'
        }
      }
    },
    behavior: 'body-overflow',
    timestamps: true
  },

  stages: {
    name: 'plg_recon_stages',
    attributes: {
      reportId: 'string|required',
      stageName: 'string|required',
      host: 'string|required',
      timestamp: 'string|required',
      timestampDay: 'string|required',
      duration: 'number|required',
      status: 'string|enum:ok,error,skipped,empty,unavailable|required',
      toolsUsed: 'array|items:string|optional',
      toolsSucceeded: 'array|items:string|optional',
      toolsFailed: 'array|items:string|optional',
      resultCount: 'number|default:0',
      errorMessage: 'string|optional'
    },
    partitions: {
      byStage: {
        fields: {
          stageName: 'string'
        }
      },
      byDay: {
        fields: {
          timestampDay: 'string'
        }
      }
    },
    behavior: 'enforce-limits',
    timestamps: true
  },

  diffs: {
    name: 'plg_recon_diffs',
    attributes: {
      host: 'string|required',
      timestamp: 'string|required',
      previousScan: 'string|required',
      currentScan: 'string|required',
      changes: {
        dns: 'object|optional',
        certificate: 'object|optional',
        ports: 'object|optional',
        subdomains: 'object|optional',
        paths: 'object|optional',
        technologies: 'object|optional',
        security: 'object|optional'
      },
      summary: {
        totalChanges: 'number|required',
        severity: 'string|enum:low,medium,high,critical|required',
        hasInfrastructureChanges: 'boolean|default:false',
        hasAttackSurfaceChanges: 'boolean|default:false',
        hasSecurityChanges: 'boolean|default:false'
      }
    },
    partitions: {
      byHost: {
        fields: {
          host: 'string'
        }
      },
      bySeverity: {
        fields: {
          'summary.severity': 'string'
        }
      }
    },
    behavior: 'body-overflow',
    timestamps: true
  },

  subdomains: {
    name: 'plg_recon_subdomains',
    attributes: {
      host: 'string|required',
      subdomains: 'array|items:string|required',
      total: 'number|required',
      sources: 'object|optional',
      lastScanAt: 'string|required'
    },
    partitions: {
      byHost: {
        fields: {
          host: 'string'
        }
      }
    },
    behavior: 'body-overflow',
    timestamps: true
  },

  paths: {
    name: 'plg_recon_paths',
    attributes: {
      host: 'string|required',
      paths: 'array|items:string|required',
      total: 'number|required',
      sources: 'object|optional',
      lastScanAt: 'string|required'
    },
    partitions: {
      byHost: {
        fields: {
          host: 'string'
        }
      }
    },
    behavior: 'body-overflow',
    timestamps: true
  },

  targets: {
    name: 'plg_recon_targets',
    attributes: {
      target: 'string|required',
      host: 'string|required',
      protocol: 'string|optional',
      port: 'number|optional',
      path: 'string|optional',
      schedule: 'string|optional',
      enabled: 'boolean|default:true',
      scanConfig: 'object|optional',
      lastScan: 'string|optional',
      nextScan: 'string|optional',
      scanCount: 'number|default:0',
      tags: 'array|items:string|optional',
      description: 'string|optional'
    },
    partitions: {
      byHost: {
        fields: {
          host: 'string'
        }
      }
    },
    behavior: 'enforce-limits',
    timestamps: true
  }
};

export function getResourceConfig(resourceName: ResourceName): ResourceConfig {
  return RESOURCE_CONFIGS[resourceName];
}

export function getResourceNames(): ResourceName[] {
  return Object.keys(RESOURCE_CONFIGS) as ResourceName[];
}

export function getAllResourceConfigs(): ResourceConfig[] {
  return Object.values(RESOURCE_CONFIGS);
}
