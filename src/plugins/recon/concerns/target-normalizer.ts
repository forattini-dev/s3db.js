/**
 * TargetNormalizer
 *
 * Normalizes target URLs/domains into structured format:
 * - Parses URLs
 * - Extracts host, protocol, port
 * - Handles edge cases
 */

export interface NormalizedTarget {
  original: string;
  host: string;
  protocol: string | null;
  port: number | null;
  path: string | null;
}

export class TargetNormalizer {
  static normalize(target: string): NormalizedTarget {
    if (!target || typeof target !== 'string') {
      throw new Error('Target must be a non-empty string');
    }

    let url: URL;
    try {
      url = new URL(target.includes('://') ? target : `https://${target}`);
    } catch (error) {
      url = new URL(`https://${target}`);
    }

    const protocol = url.protocol ? url.protocol.replace(':', '') : null;
    const host = url.hostname || target;
    const port = url.port ? Number(url.port) : this.defaultPortForProtocol(protocol);

    return {
      original: target,
      host,
      protocol,
      port,
      path: url.pathname === '/' ? null : url.pathname
    };
  }

  static defaultPortForProtocol(protocol: string | null): number | null {
    switch (protocol) {
      case 'http':
        return 80;
      case 'https':
        return 443;
      case 'ftp':
        return 21;
      case 'ssh':
        return 22;
      default:
        return null;
    }
  }

  static buildUrl(target: NormalizedTarget): string {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== this.defaultPortForProtocol(protocol)
      ? `:${target.port}`
      : '';
    const path = target.path || '';
    return `${protocol}://${target.host}${port}${path}`;
  }
}
