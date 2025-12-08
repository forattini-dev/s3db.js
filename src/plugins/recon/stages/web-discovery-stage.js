/**
 * WebDiscoveryStage
 *
 * Directory and endpoint fuzzing using RedBlue:
 * - Path/directory discovery
 * - Endpoint enumeration
 * - Custom wordlist support
 */

export class WebDiscoveryStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    if (!featureConfig) {
      return { status: 'disabled' };
    }

    const url = this._buildUrl(target);
    const wordlist = featureConfig.wordlist;
    const threads = featureConfig.threads ?? 50;

    const flags = [];

    if (wordlist) {
      flags.push('--wordlist', wordlist);
    }

    if (threads) {
      flags.push('--threads', String(threads));
    }

    if (featureConfig.statusCodes) {
      flags.push('--status-codes', featureConfig.statusCodes);
    }

    if (featureConfig.extensions) {
      flags.push('--extensions', featureConfig.extensions);
    }

    if (featureConfig.recursive) {
      flags.push('--recursive');
    }

    const result = await this.commandRunner.runRedBlue(
      'web',
      'asset',
      'fuzz',
      url,
      {
        timeout: featureConfig.timeout || 120000,
        flags
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

    const discovery = this._normalizeDiscovery(result.data);

    if (discovery.paths.length === 0) {
      return {
        status: wordlist ? 'empty' : 'skipped',
        message: wordlist ? 'No endpoints discovered' : 'Wordlist not provided',
        url,
        ...discovery,
        metadata: result.metadata
      };
    }

    return {
      status: 'ok',
      url,
      ...discovery,
      metadata: result.metadata
    };
  }

  _buildUrl(target) {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== this._defaultPortForProtocol(protocol)
      ? `:${target.port}`
      : '';
    const path = target.path || '';
    return `${protocol}://${target.host}${port}${path}`;
  }

  _defaultPortForProtocol(protocol) {
    return protocol === 'http' ? 80 : protocol === 'https' ? 443 : null;
  }

  _normalizeDiscovery(data) {
    if (!data || typeof data !== 'object') {
      return { paths: [], total: 0 };
    }

    if (data.raw) {
      return this._parseRawDiscovery(data.raw);
    }

    const paths = [];

    if (Array.isArray(data.paths)) {
      paths.push(...data.paths.map(p => this._normalizePath(p)));
    } else if (Array.isArray(data.results)) {
      paths.push(...data.results.map(p => this._normalizePath(p)));
    } else if (Array.isArray(data)) {
      paths.push(...data.map(p => this._normalizePath(p)));
    }

    return {
      paths: paths.filter(Boolean),
      total: paths.length,
      directories: data.directories || paths.filter(p => p.type === 'directory').length,
      files: data.files || paths.filter(p => p.type === 'file').length
    };
  }

  _normalizePath(path) {
    if (!path) return null;

    if (typeof path === 'string') {
      return {
        path: path,
        status: null,
        size: null,
        type: path.endsWith('/') ? 'directory' : 'file'
      };
    }

    return {
      path: path.path || path.url || path.endpoint,
      status: path.status || path.statusCode || path.code || null,
      size: path.size || path.contentLength || path.length || null,
      type: path.type || (path.path?.endsWith('/') ? 'directory' : 'file'),
      redirect: path.redirect || path.location || null
    };
  }

  _parseRawDiscovery(raw) {
    const paths = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const statusMatch = line.match(/\[(\d{3})\]\s+(.+)/);
      if (statusMatch) {
        paths.push({
          path: statusMatch[2].trim(),
          status: parseInt(statusMatch[1]),
          type: statusMatch[2].endsWith('/') ? 'directory' : 'file'
        });
        continue;
      }

      const pathMatch = line.match(/^(\/\S+)/);
      if (pathMatch) {
        paths.push({
          path: pathMatch[1],
          status: null,
          type: pathMatch[1].endsWith('/') ? 'directory' : 'file'
        });
      }
    }

    return {
      paths,
      total: paths.length,
      directories: paths.filter(p => p.type === 'directory').length,
      files: paths.filter(p => p.type === 'file').length
    };
  }
}
