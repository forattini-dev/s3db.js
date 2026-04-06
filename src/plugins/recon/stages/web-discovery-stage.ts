/**
 * WebDiscoveryStage
 *
 * Web path discovery via two modes:
 * - Fuzzing: RedBlue `rb web asset fuzz` (wordlist-based brute force)
 * - Spider: recker Spider crawl (link-following, sitemap, robots.txt)
 *
 * Use `spider: true` in featureConfig to enable crawl-based discovery.
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
  spider?: boolean | {
    maxPages?: number;
    maxDepth?: number;
    respectRobotsTxt?: boolean;
    useSitemap?: boolean;
  };
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

    if (featureConfig.spider) {
      return this._executeSpiderDiscovery(target, featureConfig);
    }

    const url = this._buildUrl(target);
    const wordlist = featureConfig.wordlist;

    const flags: Record<string, any> = {};
    if (wordlist) flags.wordlist = wordlist;
    flags.threads = featureConfig.threads ?? 50;
    if (featureConfig.statusCodes) flags['status-codes'] = featureConfig.statusCodes;
    if (featureConfig.extensions) flags.extensions = featureConfig.extensions;
    if (featureConfig.recursive) flags.recursive = true;

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

  private async _executeSpiderDiscovery(
    target: Target,
    featureConfig: WebDiscoveryFeatureConfig
  ): Promise<WebDiscoveryResult> {
    const url = this._buildUrl(target);
    const spiderOpts = typeof featureConfig.spider === 'object' ? featureConfig.spider : {};

    try {
      const { Spider } = await import('recker/scrape') as any;

      const spider = new Spider({
        maxPages: spiderOpts.maxPages ?? 50,
        maxDepth: spiderOpts.maxDepth ?? 3,
        sameDomain: true,
        concurrency: featureConfig.threads ?? 5,
        timeout: featureConfig.timeout || 30000,
        respectRobotsTxt: spiderOpts.respectRobotsTxt ?? true,
        useSitemap: spiderOpts.useSitemap ?? true,
        rotateUserAgent: true,
        randomizeHeaders: true,
      });

      const result = await spider.crawl(url);

      const paths: DiscoveredPath[] = [];
      const seen = new Set<string>();

      for (const page of result.pages || []) {
        const pagePath = this._extractPath(page.url, target.host);
        if (pagePath && !seen.has(pagePath)) {
          seen.add(pagePath);
          paths.push({
            path: pagePath,
            status: page.status || null,
            size: page.metrics?.htmlSize || null,
            type: pagePath.endsWith('/') ? 'directory' : 'file',
          });
        }

        for (const link of page.links || []) {
          if (link.type !== 'internal') continue;
          const linkPath = this._extractPath(link.href, target.host);
          if (linkPath && !seen.has(linkPath)) {
            seen.add(linkPath);
            paths.push({
              path: linkPath,
              status: null,
              size: null,
              type: linkPath.endsWith('/') ? 'directory' : 'file',
            });
          }
        }
      }

      return {
        status: paths.length > 0 ? 'ok' : 'empty',
        url,
        paths,
        total: paths.length,
        directories: paths.filter(p => p.type === 'directory').length,
        files: paths.filter(p => p.type === 'file').length,
        metadata: {
          source: 'recker-spider',
          pagesVisited: result.pages?.length ?? 0,
          duration: result.duration,
        },
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: `Spider discovery failed: ${error.message}`,
        url,
      };
    }
  }

  private _extractPath(fullUrl: string, host: string): string | null {
    try {
      const parsed = new URL(fullUrl);
      if (!parsed.hostname.includes(host)) return null;
      return parsed.pathname + (parsed.search || '');
    } catch {
      return null;
    }
  }
}
