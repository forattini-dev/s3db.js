/**
 * FingerprintStage
 *
 * Web technology fingerprinting using RedBlue:
 * - Framework/CMS detection
 * - Server technology identification
 * - JavaScript library detection
 * - Version detection
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

export interface FingerprintFeatureConfig {
  timeout?: number;
  intel?: boolean;
}

export interface Technology {
  name: string;
  version?: string | null;
  category: string;
  confidence?: number | null;
}

export interface FingerprintData {
  technologies: Technology[];
  server: string | null;
  framework: string | null;
  cms?: string | null;
  headers?: Record<string, string>;
  cookies?: string[];
}

export interface FingerprintResult {
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  message?: string;
  url?: string;
  technologies?: Technology[];
  server?: string | null;
  framework?: string | null;
  cms?: string | null;
  headers?: Record<string, string>;
  cookies?: string[];
  metadata?: Record<string, any>;
}

export class FingerprintStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: FingerprintFeatureConfig = {}): Promise<FingerprintResult> {
    const url = this._buildUrl(target);

    const result = await this.commandRunner.runRedBlue(
      'web',
      'asset',
      'fingerprint',
      url,
      {
        timeout: featureConfig.timeout || 30000,
        flags: featureConfig.intel ? ['--intel'] : []
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

    const fingerprint = this._normalizeFingerprint(result.data);

    return {
      status: fingerprint.technologies.length > 0 ? 'ok' : 'empty',
      url,
      ...fingerprint,
      metadata: result.metadata
    };
  }

  private _buildUrl(target: Target): string {
    const protocol = target.protocol || 'https';
    const port = target.port && target.port !== (protocol === 'http' ? 80 : 443)
      ? `:${target.port}`
      : '';
    return `${protocol}://${target.host}${port}${target.path || ''}`;
  }

  private _normalizeFingerprint(data: any): FingerprintData {
    if (!data || typeof data !== 'object') {
      return { technologies: [], server: null, framework: null };
    }

    if (data.raw) {
      return this._parseRawFingerprint(data.raw);
    }

    const technologies: Technology[] = [];

    if (Array.isArray(data.technologies)) {
      technologies.push(...data.technologies.map((t: any) => this._normalizeTech(t)).filter((t: Technology | null): t is Technology => t !== null));
    } else if (Array.isArray(data)) {
      technologies.push(...data.map((t: any) => this._normalizeTech(t)).filter((t): t is Technology => t !== null));
    }

    if (data.server && !technologies.some(t => t.category === 'server')) {
      technologies.push({ name: data.server, category: 'server' });
    }

    if (data.framework && !technologies.some(t => t.category === 'framework')) {
      technologies.push({ name: data.framework, category: 'framework' });
    }

    if (data.cms && !technologies.some(t => t.category === 'cms')) {
      technologies.push({ name: data.cms, category: 'cms' });
    }

    return {
      technologies: technologies.filter((t): t is Technology => t !== null),
      server: data.server || null,
      framework: data.framework || null,
      cms: data.cms || null,
      headers: data.headers || {},
      cookies: data.cookies || []
    };
  }

  private _normalizeTech(tech: any): Technology | null {
    if (!tech) return null;

    if (typeof tech === 'string') {
      return { name: tech, category: 'unknown', version: null };
    }

    return {
      name: tech.name || tech.technology || 'Unknown',
      version: tech.version || null,
      category: tech.category || tech.type || 'unknown',
      confidence: tech.confidence || null
    };
  }

  private _parseRawFingerprint(raw: string): FingerprintData {
    const technologies: Technology[] = [];
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^\s*(.+?)(?:\s+\[(.+?)\])?(?:\s+v?([\d.]+))?$/);
      if (match) {
        technologies.push({
          name: match[1]!.trim(),
          category: match[2] || 'unknown',
          version: match[3] || null
        });
      }
    }

    return {
      technologies,
      server: null,
      framework: null,
      cms: null,
      headers: {},
      cookies: []
    };
  }
}
