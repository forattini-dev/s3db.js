/**
 * TlsAuditStage
 *
 * TLS/SSL security auditing using RedBlue:
 * - Protocol version detection
 * - Cipher suite enumeration
 * - Security vulnerability detection
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
  config: Record<string, any>;
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface TlsAuditFeatureConfig {
  timeout?: number;
}

export interface TlsProtocol {
  name: string;
  supported: boolean;
  deprecated?: boolean;
}

export interface TlsCipher {
  name: string;
  strength: string;
  keyExchange?: string | null;
  authentication?: string | null;
}

export interface TlsVulnerability {
  name: string;
  severity: string;
}

export interface TlsAuditData {
  protocols: TlsProtocol[];
  ciphers: TlsCipher[];
  vulnerabilities: TlsVulnerability[];
  certificate?: any | null;
  grade?: string | null;
  warnings?: string[];
}

export interface TlsAuditResult {
  status: 'ok' | 'unavailable' | 'error';
  message?: string;
  protocols?: TlsProtocol[];
  ciphers?: TlsCipher[];
  vulnerabilities?: TlsVulnerability[];
  certificate?: any | null;
  grade?: string | null;
  warnings?: string[];
  metadata?: Record<string, any>;
}

export class TlsAuditStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: TlsAuditFeatureConfig = {}): Promise<TlsAuditResult> {
    const port = target.port || 443;
    const hostPort = `${target.host}:${port}`;

    const result = await this.commandRunner.runRedBlue(
      'tls',
      'intel',
      'audit',
      hostPort,
      {
        timeout: featureConfig.timeout || 60000
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

    const audit = this._normalizeAudit(result.data);

    return {
      status: 'ok',
      ...audit,
      metadata: result.metadata
    };
  }

  private _normalizeAudit(data: any): TlsAuditData {
    if (!data || typeof data !== 'object') {
      return { protocols: [], ciphers: [], vulnerabilities: [] };
    }

    if (data.raw) {
      return this._parseRawAudit(data.raw);
    }

    return {
      protocols: this._normalizeProtocols(data.protocols || data.supported_protocols),
      ciphers: this._normalizeCiphers(data.ciphers || data.cipher_suites),
      vulnerabilities: data.vulnerabilities || data.issues || [],
      certificate: data.certificate || null,
      grade: data.grade || data.rating || null,
      warnings: data.warnings || []
    };
  }

  private _normalizeProtocols(protocols: any): TlsProtocol[] {
    if (!protocols) return [];

    if (Array.isArray(protocols)) {
      return protocols.map(p => {
        if (typeof p === 'string') {
          return { name: p, supported: true };
        }
        return {
          name: p.name || p.protocol || p.version,
          supported: p.supported !== false,
          deprecated: p.deprecated || this._isDeprecated(p.name || p.protocol)
        };
      });
    }

    return [];
  }

  private _normalizeCiphers(ciphers: any): TlsCipher[] {
    if (!ciphers) return [];

    if (Array.isArray(ciphers)) {
      return ciphers.map(c => {
        if (typeof c === 'string') {
          return { name: c, strength: this._cipherStrength(c) };
        }
        return {
          name: c.name || c.cipher,
          strength: c.strength || c.bits || this._cipherStrength(c.name),
          keyExchange: c.keyExchange || c.kx || null,
          authentication: c.authentication || c.auth || null
        };
      });
    }

    return [];
  }

  private _isDeprecated(protocol: string | undefined): boolean {
    if (!protocol) return false;
    const deprecated = ['ssl', 'sslv2', 'sslv3', 'tls1.0', 'tlsv1', 'tls1.1', 'tlsv1.1'];
    return deprecated.some(d => protocol.toLowerCase().includes(d));
  }

  private _cipherStrength(cipher: string | undefined): string {
    if (!cipher) return 'unknown';
    const c = cipher.toLowerCase();
    if (c.includes('256') || c.includes('chacha20')) return 'strong';
    if (c.includes('128')) return 'medium';
    if (c.includes('rc4') || c.includes('des') || c.includes('null')) return 'weak';
    return 'unknown';
  }

  private _parseRawAudit(raw: string): TlsAuditData {
    const result: TlsAuditData = {
      protocols: [],
      ciphers: [],
      vulnerabilities: [],
      warnings: []
    };

    const protocolMatches = raw.matchAll(/(SSLv[23]|TLSv?1\.?[0-3]?)\s*:\s*(yes|no|enabled|disabled)/gi);
    for (const match of protocolMatches) {
      result.protocols.push({
        name: match[1]!,
        supported: match[2]!.toLowerCase() === 'yes' || match[2]!.toLowerCase() === 'enabled',
        deprecated: this._isDeprecated(match[1]!)
      });
    }

    const cipherMatches = raw.matchAll(/(?:Cipher|Suite)[:\s]+(\S+)/gi);
    for (const match of cipherMatches) {
      result.ciphers.push({
        name: match[1]!,
        strength: this._cipherStrength(match[1]!)
      });
    }

    const vulnPatterns = [
      /POODLE/i, /BEAST/i, /CRIME/i, /BREACH/i, /Heartbleed/i,
      /DROWN/i, /FREAK/i, /Logjam/i, /ROBOT/i, /Lucky13/i
    ];

    for (const pattern of vulnPatterns) {
      if (pattern.test(raw)) {
        result.vulnerabilities.push({
          name: pattern.source.replace(/\\/g, ''),
          severity: 'high'
        });
      }
    }

    return result;
  }
}
