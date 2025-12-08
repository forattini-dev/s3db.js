/**
 * TlsAuditStage
 *
 * TLS/SSL security auditing using RedBlue:
 * - Protocol version detection
 * - Cipher suite enumeration
 * - Security vulnerability detection
 */

export class TlsAuditStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
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

  _normalizeAudit(data) {
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

  _normalizeProtocols(protocols) {
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

  _normalizeCiphers(ciphers) {
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

  _isDeprecated(protocol) {
    if (!protocol) return false;
    const deprecated = ['ssl', 'sslv2', 'sslv3', 'tls1.0', 'tlsv1', 'tls1.1', 'tlsv1.1'];
    return deprecated.some(d => protocol.toLowerCase().includes(d));
  }

  _cipherStrength(cipher) {
    if (!cipher) return 'unknown';
    const c = cipher.toLowerCase();
    if (c.includes('256') || c.includes('chacha20')) return 'strong';
    if (c.includes('128')) return 'medium';
    if (c.includes('rc4') || c.includes('des') || c.includes('null')) return 'weak';
    return 'unknown';
  }

  _parseRawAudit(raw) {
    const result = {
      protocols: [],
      ciphers: [],
      vulnerabilities: [],
      warnings: []
    };

    const protocolMatches = raw.matchAll(/(SSLv[23]|TLSv?1\.?[0-3]?)\s*:\s*(yes|no|enabled|disabled)/gi);
    for (const match of protocolMatches) {
      result.protocols.push({
        name: match[1],
        supported: match[2].toLowerCase() === 'yes' || match[2].toLowerCase() === 'enabled',
        deprecated: this._isDeprecated(match[1])
      });
    }

    const cipherMatches = raw.matchAll(/(?:Cipher|Suite)[:\s]+(\S+)/gi);
    for (const match of cipherMatches) {
      result.ciphers.push({
        name: match[1],
        strength: this._cipherStrength(match[1])
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
