/**
 * CertificateStage
 *
 * TLS certificate inspection:
 * - Subject and issuer details
 * - Validity period
 * - Fingerprint
 * - Subject Alternative Names (SANs)
 */

import tls from 'tls';

export class CertificateStage {
  constructor(plugin) {
    this.plugin = plugin;
  }

  async execute(target) {
    const shouldCheckTls =
      target.protocol === 'https' ||
      (!target.protocol && (target.port === 443 || target.host.includes(':') === false));

    if (!shouldCheckTls) {
      return {
        status: 'skipped',
        message: 'TLS inspection skipped for non-HTTPS target'
      };
    }

    const port = target.port || 443;

    return new Promise((resolve) => {
      const socket = tls.connect(
        {
          host: target.host,
          port,
          servername: target.host,
          rejectUnauthorized: false,
          timeout: 5000
        },
        () => {
          const certificate = socket.getPeerCertificate(true);
          socket.end();

          if (!certificate || Object.keys(certificate).length === 0) {
            resolve({
              status: 'error',
              message: 'No certificate information available'
            });
            return;
          }

          resolve({
            status: 'ok',
            subject: certificate.subject,
            issuer: certificate.issuer,
            validFrom: certificate.valid_from,
            validTo: certificate.valid_to,
            fingerprint: certificate.fingerprint256 || certificate.fingerprint,
            subjectAltName: certificate.subjectaltname
              ? certificate.subjectaltname.split(',').map((entry) => entry.trim())
              : [],
            raw: certificate
          });
        }
      );

      socket.on('error', (error) => {
        resolve({
          status: 'error',
          message: error?.message || 'Unable to retrieve certificate'
        });
      });

      socket.setTimeout(6000, () => {
        socket.destroy();
        resolve({
          status: 'timeout',
          message: 'TLS handshake timed out'
        });
      });
    });
  }
}
