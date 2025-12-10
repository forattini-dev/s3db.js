/**
 * DnsStage
 *
 * DNS enumeration using RedBlue:
 * - A, AAAA, NS, MX, TXT, CNAME, SOA records
 * - Uses `rb dns record all` for comprehensive lookup
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface DnsFeatureConfig {
  timeout?: number;
  server?: string;
  intel?: boolean;
}

export interface MxRecord {
  priority: number;
  exchange: string;
}

export interface DnsRecords {
  a: string[];
  aaaa: string[];
  ns: string[];
  mx: MxRecord[];
  txt: string[];
  cname: string[];
  soa: string | null;
}

export interface NormalizedRecords {
  hasRecords: boolean;
  data: DnsRecords;
  errors: Record<string, string>;
}

export interface DnsResult {
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  message?: string;
  records?: DnsRecords;
  errors?: Record<string, string>;
  metadata?: Record<string, any>;
}

export class DnsStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
  }

  async execute(target: Target, featureConfig: DnsFeatureConfig = {}): Promise<DnsResult> {
    const result = await this.commandRunner.runRedBlue(
      'dns',
      'record',
      'all',
      target.host,
      {
        timeout: featureConfig.timeout || 30000,
        flags: this._buildFlags(featureConfig)
      }
    );

    if (result.status === 'unavailable') {
      return {
        status: 'unavailable',
        message: 'RedBlue (rb) is not available',
        metadata: result.metadata
      };
    }

    if (result.status === 'error') {
      return {
        status: 'error',
        message: result.error,
        metadata: result.metadata
      };
    }

    const records = this._normalizeRecords(result.data);

    return {
      status: records.hasRecords ? 'ok' : 'empty',
      records: records.data,
      errors: records.errors,
      metadata: result.metadata
    };
  }

  private _buildFlags(config: DnsFeatureConfig): string[] {
    const flags: string[] = [];

    if (config.server) {
      flags.push('--server', config.server);
    }

    if (config.intel) {
      flags.push('--intel');
    }

    return flags;
  }

  private _normalizeRecords(data: any): NormalizedRecords {
    if (!data || typeof data !== 'object') {
      return { hasRecords: false, data: this._emptyRecords(), errors: {} };
    }

    if (data.raw) {
      return this._parseRawOutput(data.raw);
    }

    const records: DnsRecords = {
      a: data.a || data.A || [],
      aaaa: data.aaaa || data.AAAA || [],
      ns: data.ns || data.NS || [],
      mx: data.mx || data.MX || [],
      txt: data.txt || data.TXT || [],
      cname: data.cname || data.CNAME || [],
      soa: data.soa || data.SOA || null
    };

    const hasRecords = Object.values(records).some(v =>
      Array.isArray(v) ? v.length > 0 : v !== null
    );

    return { hasRecords, data: records, errors: {} };
  }

  private _parseRawOutput(raw: string): NormalizedRecords {
    const lines = raw.split('\n').filter(Boolean);
    const records: DnsRecords = this._emptyRecords();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;

      const type = parts[3]?.toUpperCase() ?? '';
      const value = parts.slice(4).join(' ');

      switch (type) {
        case 'A':
          records.a.push(value);
          break;
        case 'AAAA':
          records.aaaa.push(value);
          break;
        case 'NS':
          records.ns.push(value);
          break;
        case 'MX':
          records.mx.push({ priority: parseInt(parts[4] ?? '0') || 0, exchange: parts[5] ?? value });
          break;
        case 'TXT':
          records.txt.push(value.replace(/^"|"$/g, ''));
          break;
        case 'CNAME':
          records.cname.push(value);
          break;
        case 'SOA':
          records.soa = value;
          break;
      }
    }

    const hasRecords = Object.values(records).some(v =>
      Array.isArray(v) ? v.length > 0 : v !== null
    );

    return { hasRecords, data: records, errors: {} };
  }

  private _emptyRecords(): DnsRecords {
    return {
      a: [],
      aaaa: [],
      ns: [],
      mx: [],
      txt: [],
      cname: [],
      soa: null
    };
  }
}
