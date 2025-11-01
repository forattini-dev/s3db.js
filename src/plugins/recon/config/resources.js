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

export const RESOURCE_CONFIGS = {
  /**
   * Host Profiles Resource
   * Stores complete fingerprint and metadata for each scanned host
   */
  hosts: {
    name: 'plg_recon_hosts',
    attributes: {
      // Host identification
      host: 'string|required',

      // Infrastructure
      ips: {
        ipv4: 'array|items:ip4|optional',
        ipv6: 'array|items:ip6|optional'
      },
      nameservers: 'array|items:string|optional',
      mailServers: 'array|items:string|optional',
      txtRecords: 'array|items:string|optional',

      // Certificate info
      certificate: {
        issuer: 'object|optional',
        subject: 'object|optional',
        validFrom: 'string|optional',
        validTo: 'string|optional',
        fingerprint: 'string|optional',
        sans: 'array|items:string|optional'
      },

      // Attack surface
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

      // Technologies
      technologies: {
        server: 'string|optional',
        poweredBy: 'string|optional',
        detected: 'array|items:string|optional',
        cms: 'string|optional',
        frameworks: 'array|items:string|optional'
      },

      // Security posture
      security: {
        tls: 'object|optional',
        vulnerabilities: 'object|optional',
        headers: 'object|optional'
      },

      // Metadata
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

  /**
   * Reports Resource
   * Stores complete scan reports with all stage results
   */
  reports: {
    name: 'plg_recon_reports',
    attributes: {
      // Report identification
      reportId: 'string|required',
      target: {
        original: 'string|required',
        host: 'string|required',
        protocol: 'string|optional',
        port: 'number|optional',
        path: 'string|optional'
      },

      // Scan metadata
      timestamp: 'string|required',
      timestampDay: 'string|required',  // "2025-01-01" for efficient partitioning
      duration: 'number|required',
      status: 'string|enum:completed,failed,partial|required',

      // Stage results (stored in body due to size)
      results: 'object|required',

      // Consolidated fingerprint
      fingerprint: 'object|required',

      // Summary statistics (queryable fields in metadata)
      summary: {
        totalIPs: 'number|default:0',
        totalPorts: 'number|default:0',
        totalSubdomains: 'number|default:0',
        totalPaths: 'number|default:0',
        detectedTechnologies: 'number|default:0',
        riskLevel: 'string|optional'
      },

      // Uptime status at scan time (synergy with uptime behavior)
      uptime: {
        status: 'string|optional',              // 'up', 'down', 'unknown'
        uptimePercentage: 'string|optional',    // "99.85"
        lastCheck: 'string|optional',           // ISO timestamp
        isDown: 'boolean|optional',             // Threshold reached
        consecutiveFails: 'number|optional'     // Failure count
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
          timestampDay: 'string'  // Partition by day for efficient time-series queries
        }
      }
    },
    behavior: 'body-overflow', // Use overflow instead of body-only for queryable metadata
    timestamps: true
  },

  /**
   * Stages Resource
   * Stores per-stage execution metadata and performance metrics
   */
  stages: {
    name: 'plg_recon_stages',
    attributes: {
      // Stage identification
      reportId: 'string|required',
      stageName: 'string|required',
      host: 'string|required',

      // Execution metadata
      timestamp: 'string|required',
      timestampDay: 'string|required',  // "2025-01-01" for efficient partitioning
      duration: 'number|required',
      status: 'string|enum:ok,error,skipped,empty,unavailable|required',

      // Tool usage
      toolsUsed: 'array|items:string|optional',
      toolsSucceeded: 'array|items:string|optional',
      toolsFailed: 'array|items:string|optional',

      // Results summary
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
          timestampDay: 'string'  // Partition by day for time-series analysis
        }
      }
    },
    behavior: 'enforce-limits',
    timestamps: true
  },

  /**
   * Diffs Resource
   * Stores change detection results between scans
   */
  diffs: {
    name: 'plg_recon_diffs',
    attributes: {
      // Diff identification
      host: 'string|required',
      timestamp: 'string|required',
      previousScan: 'string|required',
      currentScan: 'string|required',

      // Changes by category
      changes: {
        dns: 'object|optional',
        certificate: 'object|optional',
        ports: 'object|optional',
        subdomains: 'object|optional',
        paths: 'object|optional',
        technologies: 'object|optional',
        security: 'object|optional'
      },

      // Summary
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

  /**
   * Subdomains Resource
   * Stores consolidated subdomain lists per host (one record per host)
   */
  subdomains: {
    name: 'plg_recon_subdomains',
    attributes: {
      // Host identification
      host: 'string|required',

      // Subdomain list (all subdomains for this host)
      subdomains: 'array|items:string|required',
      total: 'number|required',

      // Discovery metadata
      sources: 'object|optional',  // { amass: {...}, subfinder: {...}, ... }

      // Scan metadata
      lastScanAt: 'string|required'
    },
    partitions: {
      byHost: {
        fields: {
          host: 'string'
        }
      }
    },
    behavior: 'body-overflow',  // Subdomain lists can be large
    timestamps: true
  },

  /**
   * Paths Resource
   * Stores discovered web paths/endpoints per host (one record per host)
   */
  paths: {
    name: 'plg_recon_paths',
    attributes: {
      // Host identification
      host: 'string|required',

      // Path list (all paths for this host)
      paths: 'array|items:string|required',
      total: 'number|required',

      // Discovery metadata
      sources: 'object|optional',  // { ffuf: {...}, feroxbuster: {...}, ... }

      // Scan metadata
      lastScanAt: 'string|required'
    },
    partitions: {
      byHost: {
        fields: {
          host: 'string'
        }
      }
    },
    behavior: 'body-overflow',  // Path lists can be large
    timestamps: true
  },

  /**
   * Targets Resource
   * Stores dynamic targets for scheduled scanning
   */
  targets: {
    name: 'plg_recon_targets',
    attributes: {
      // Target identification
      target: 'string|required',

      // Normalized fields
      host: 'string|required',
      protocol: 'string|optional',
      port: 'number|optional',
      path: 'string|optional',

      // Scheduling
      schedule: 'string|optional', // Cron expression
      enabled: 'boolean|default:true',

      // Scan configuration
      scanConfig: 'object|optional',

      // Metadata
      lastScan: 'string|optional',
      nextScan: 'string|optional',
      scanCount: 'number|default:0',

      // Tags for organization
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

/**
 * Get resource config by name
 */
export function getResourceConfig(resourceName) {
  return RESOURCE_CONFIGS[resourceName];
}

/**
 * Get all resource names
 */
export function getResourceNames() {
  return Object.keys(RESOURCE_CONFIGS);
}

/**
 * Get all resource configs as array
 */
export function getAllResourceConfigs() {
  return Object.values(RESOURCE_CONFIGS);
}
