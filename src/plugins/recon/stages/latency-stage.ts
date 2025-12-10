/**
 * LatencyStage
 *
 * Network latency measurement using RedBlue:
 * - ICMP ping with statistics
 * - Traceroute support (when available)
 */

import type { CommandRunner } from '../concerns/command-runner.js';

export interface ReconPlugin {
  commandRunner: CommandRunner;
  config: {
    ping?: {
      count?: number;
      timeout?: number;
    };
  };
}

export interface Target {
  host: string;
  protocol?: string;
  port?: number;
  path?: string;
}

export interface LatencyFeatureConfig {
  timeout?: number;
  count?: number;
  interval?: number;
  ping?: boolean;
  traceroute?: boolean;
  traceTimeout?: number;
}

export interface PingMetrics {
  packetsTransmitted: number | null;
  packetsReceived: number | null;
  packetLoss: number | null;
  min: number | null;
  avg: number | null;
  max: number | null;
  stdDev: number | null;
}

export interface PingResult {
  status: 'ok' | 'unavailable' | 'error';
  message?: string;
  metrics?: PingMetrics;
  metadata?: Record<string, any>;
}

export interface TracerouteResult {
  status: 'ok' | 'unavailable' | 'error';
  message?: string;
  hops?: any[];
  metadata?: Record<string, any>;
}

export interface LatencyResult {
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  ping?: PingResult;
  traceroute?: TracerouteResult;
}

export class LatencyStage {
  private plugin: ReconPlugin;
  private commandRunner: CommandRunner;
  private config: ReconPlugin['config'];

  constructor(plugin: ReconPlugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target: Target, featureConfig: LatencyFeatureConfig = {}): Promise<LatencyResult> {
    const results: { ping?: PingResult; traceroute?: TracerouteResult } = {};

    if (featureConfig.ping !== false) {
      results.ping = await this._executePing(target, featureConfig);
    }

    if (featureConfig.traceroute) {
      results.traceroute = await this._executeTrace(target, featureConfig);
    }

    const hasSuccess = Object.values(results).some(r => r?.status === 'ok');

    return {
      status: hasSuccess ? 'ok' : 'empty',
      ...results
    };
  }

  private async _executePing(target: Target, config: LatencyFeatureConfig): Promise<PingResult> {
    const count = config.count || this.config.ping?.count || 4;
    const timeout = config.timeout || this.config.ping?.timeout || 10000;

    const flags: string[] = [
      '--count', String(count),
      ...(config.interval ? ['--interval', String(config.interval)] : [])
    ];

    const result = await this.commandRunner.runRedBlue(
      'network',
      'host',
      'ping',
      target.host,
      {
        timeout,
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

    const metrics = this._normalizeMetrics(result.data);

    return {
      status: 'ok',
      metrics,
      metadata: result.metadata
    };
  }

  private async _executeTrace(target: Target, config: LatencyFeatureConfig): Promise<TracerouteResult> {
    const result = await this.commandRunner.runRedBlue(
      'network',
      'trace',
      'route',
      target.host,
      {
        timeout: config.traceTimeout || 30000
      }
    );

    if (result.status !== 'ok') {
      return result as TracerouteResult;
    }

    return {
      status: 'ok',
      hops: result.data?.hops || result.data,
      metadata: result.metadata
    };
  }

  private _normalizeMetrics(data: any): PingMetrics {
    if (!data || typeof data !== 'object') {
      return this._defaultMetrics();
    }

    if (data.raw) {
      return this._parseRawPing(data.raw);
    }

    return {
      packetsTransmitted: data.packets_transmitted || data.packetsTransmitted || data.sent || null,
      packetsReceived: data.packets_received || data.packetsReceived || data.received || null,
      packetLoss: data.packet_loss || data.packetLoss || data.loss || null,
      min: data.min || data.rtt_min || null,
      avg: data.avg || data.rtt_avg || data.average || null,
      max: data.max || data.rtt_max || null,
      stdDev: data.stddev || data.std_dev || data.mdev || null
    };
  }

  private _parseRawPing(raw: string): PingMetrics {
    const metrics = this._defaultMetrics();

    const packetMatch = raw.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+received,.*?([\d.]+)%\s+packet loss/i);
    if (packetMatch) {
      metrics.packetsTransmitted = parseInt(packetMatch[1]!);
      metrics.packetsReceived = parseInt(packetMatch[2]!);
      metrics.packetLoss = parseFloat(packetMatch[3]!);
    }

    const rttMatch = raw.match(/=\s*([\d.]+)\/([\d.]+)\/([\d.]+)(?:\/([\d.]+))?/);
    if (rttMatch) {
      metrics.min = parseFloat(rttMatch[1]!);
      metrics.avg = parseFloat(rttMatch[2]!);
      metrics.max = parseFloat(rttMatch[3]!);
      if (rttMatch[4]) {
        metrics.stdDev = parseFloat(rttMatch[4]!);
      }
    }

    return metrics;
  }

  private _defaultMetrics(): PingMetrics {
    return {
      packetsTransmitted: null,
      packetsReceived: null,
      packetLoss: null,
      min: null,
      avg: null,
      max: null,
      stdDev: null
    };
  }
}
