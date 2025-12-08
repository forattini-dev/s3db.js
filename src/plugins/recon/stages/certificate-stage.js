/**
 * CertificateStage
 *
 * TLS certificate inspection using RedBlue:
 * - Subject and issuer details
 * - Validity period
 * - Fingerprint
 * - Subject Alternative Names (SANs)
 */

export class CertificateStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
  }

  async execute(target, featureConfig = {}) {
    const shouldCheckTls =
      target.protocol === 'https' ||
      (!target.protocol && (target.port === 443 || !target.host.includes(':')));

    if (!shouldCheckTls) {
      return {
        status: 'skipped',
        message: 'TLS inspection skipped for non-HTTPS target'
      };
    }

    const port = target.port || 443;
    const hostPort = `${target.host}:${port}`;

    const result = await this.commandRunner.runRedBlue(
      'web',
      'asset',
      'cert',
      hostPort,
      {
        timeout: featureConfig.timeout || 15000
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

    const certData = this._normalizeCertificate(result.data);

    return {
      status: 'ok',
      ...certData,
      metadata: result.metadata
    };
  }

  _normalizeCertificate(data) {
    if (!data || typeof data !== 'object') {
      return { subject: null, issuer: null, validFrom: null, validTo: null };
    }

    if (data.raw) {
      return this._parseRawCert(data.raw);
    }

    return {
      subject: data.subject || data.subjectDN || null,
      issuer: data.issuer || data.issuerDN || null,
      validFrom: data.validFrom || data.valid_from || data.notBefore || null,
      validTo: data.validTo || data.valid_to || data.notAfter || null,
      fingerprint: data.fingerprint || data.fingerprint256 || null,
      subjectAltName: this._normalizeAltNames(data.subjectAltName || data.san || data.altNames),
      serialNumber: data.serialNumber || data.serial || null,
      version: data.version || null,
      signatureAlgorithm: data.signatureAlgorithm || data.sigAlg || null,
      chain: data.chain || data.certificateChain || []
    };
  }

  _normalizeAltNames(altNames) {
    if (!altNames) return [];

    if (Array.isArray(altNames)) {
      return altNames.map(name =>
        typeof name === 'string' ? name.trim() : name
      );
    }

    if (typeof altNames === 'string') {
      return altNames.split(',').map(entry => entry.trim());
    }

    return [];
  }

  _parseRawCert(raw) {
    const result = {
      subject: null,
      issuer: null,
      validFrom: null,
      validTo: null,
      fingerprint: null,
      subjectAltName: [],
      serialNumber: null
    };

    const patterns = {
      subject: /Subject:\s*(.+)/i,
      issuer: /Issuer:\s*(.+)/i,
      validFrom: /Not Before:\s*(.+)/i,
      validTo: /Not After\s*:\s*(.+)/i,
      fingerprint: /SHA256 Fingerprint:\s*(.+)/i,
      serial: /Serial Number:\s*(.+)/i
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = raw.match(pattern);
      if (match) {
        if (key === 'serial') {
          result.serialNumber = match[1].trim();
        } else {
          result[key] = match[1].trim();
        }
      }
    }

    const sanMatch = raw.match(/Subject Alternative Name[:\s]+([^\n]+)/i);
    if (sanMatch) {
      result.subjectAltName = sanMatch[1]
        .split(',')
        .map(s => s.replace(/DNS:/gi, '').trim())
        .filter(Boolean);
    }

    return result;
  }
}
