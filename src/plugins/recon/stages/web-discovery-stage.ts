/**
 * WebDiscoveryStage
 *
 * Directory and endpoint fuzzing using RedBlue:
 * - Path/directory discovery
 * - Endpoint enumeration
 * - Custom wordlist support
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

export interface WebDiscoveryFeatureConfig {
  timeout?: number;
  wordlist?: string;
  threads?: number;
  statusCodes?: string;
  extensions?: string;
  recursive?: boolean;
}

export interface DiscoveredPath {
  path: string;
  status: number | null;
  size: number | null;
  type: 'directory' | 'file';
  redirect?: string | null;
}

export interface DiscoveryData {
  paths: DiscoveredPath[];
  total: number;
  directories?: number;
  files?: number;
}

export interface WebDiscoveryResult {
  status: 'ok' | 'empty' | 'skipped' | 'unavailable' | 'error';
  message?: string;
  url?: string;
  paths?: DiscoveredPath[];
  total?: number;
  directories?: number;
  files?: number;
  metadata?: Record<string, any>;
}

export class WebDiscoveryStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: WebDiscoveryFeatureConfig = {}): Promise<WebDiscoveryResult> {
    if (!featureConfig) {
      return { status: 'disabled' as 'skipped' };
    }

    const url = this._buildUrl(target);
    const wordlist = featureConfig.wordlist;
    const threads = featureConfig.threads ?? 50;

    const flags: string[] = [];

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

  private _buildUrl(target: Target): string {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== this._defaultPortForProtocol(protocol)
      ? `:${target.port}`
      : '';
    const path = target.path || '';
    return `${protocol}://${target.host}${port}${path}`;
  }

  private _defaultPortForProtocol(protocol: string): number | null {
    return protocol === 'http' ? 80 : protocol === 'https' ? 443 : null;
  }

  private _normalizeDiscovery(data: any): DiscoveryData {
    if (!data || typeof data !== 'object') {
      return { paths: [], total: 0 };
    }

    if (data.raw) {
      return this._parseRawDiscovery(data.raw);
    }

    const paths: DiscoveredPath[] = [];

    if (Array.isArray(data.paths)) {
      paths.push(...data.paths.map((p: any) => this._normalizePath(p)).filter(Boolean));
    } else if (Array.isArray(data.results)) {
      paths.push(...data.results.map((p: any) => this._normalizePath(p)).filter(Boolean));
    } else if (Array.isArray(data)) {
      paths.push(...data.map((p: any) => this._normalizePath(p)).filter((p): p is DiscoveredPath => p !== null));
    }

    return {
      paths: paths.filter((p): p is DiscoveredPath => p !== null),
      total: paths.length,
      directories: data.directories || paths.filter(p => p.type === 'directory').length,
      files: data.files || paths.filter(p => p.type === 'file').length
    };
  }

  private _normalizePath(path: any): DiscoveredPath | null {
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

  private _parseRawDiscovery(raw: string): DiscoveryData {
    const paths: DiscoveredPath[] = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const statusMatch = line.match(/\[(\d{3})\]\s+(.+)/);
      if (statusMatch) {
        paths.push({
          path: statusMatch[2]!.trim(),
          status: parseInt(statusMatch[1]!),
          size: null,
          type: statusMatch[2]!.endsWith('/') ? 'directory' : 'file'
        });
        continue;
      }

      const pathMatch = line.match(/^(\/\S+)/);
      if (pathMatch) {
        paths.push({
          path: pathMatch[1]!,
          status: null,
          size: null,
          type: pathMatch[1]!.endsWith('/') ? 'directory' : 'file'
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
