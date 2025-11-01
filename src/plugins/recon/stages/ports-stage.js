/**
 * PortsStage
 *
 * Port scanning with multiple tools:
 * - nmap (fast, detailed service detection)
 * - masscan (ultra-fast, full port range)
 * - Aggregates results from both scanners
 */

export class PortsStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    const scanners = {};
    const openPorts = new Map();

    if (featureConfig.nmap) {
      const result = await this.executeNmap(target, { extraArgs: featureConfig.nmapArgs });
      scanners.nmap = result;
      if (result.status === 'ok' && Array.isArray(result.summary?.openPorts)) {
        for (const entry of result.summary.openPorts) {
          openPorts.set(entry.port, entry);
        }
      }
    }

    if (featureConfig.masscan) {
      const result = await this.executeMasscan(target, featureConfig.masscan);
      scanners.masscan = result;
      if (result.status === 'ok' && Array.isArray(result.openPorts)) {
        for (const entry of result.openPorts) {
          if (!openPorts.has(entry.port)) {
            openPorts.set(entry.port, entry);
          }
        }
      }
    }

    return {
      _individual: scanners,
      _aggregated: {
        status: openPorts.size > 0 ? 'ok' : 'empty',
        openPorts: Array.from(openPorts.values()),
        scanners
      },
      status: openPorts.size > 0 ? 'ok' : 'empty',
      openPorts: Array.from(openPorts.values()),
      scanners
    };
  }

  async executeNmap(target, options = {}) {
    if (!(await this.commandRunner.isAvailable('nmap'))) {
      return {
        status: 'unavailable',
        message: 'nmap is not available on this system'
      };
    }

    const topPorts = options.topPorts ?? this.config.nmap.topPorts;
    const extraArgs = options.extraArgs ?? this.config.nmap.extraArgs;

    const args = [
      '-Pn',
      '--top-ports',
      String(topPorts),
      target.host,
      ...extraArgs
    ];

    const result = await this.commandRunner.run('nmap', args, {
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024
    });

    if (!result.ok) {
      return {
        status: 'error',
        message: result.error?.message || 'nmap scan failed',
        stderr: result.stderr
      };
    }

    return {
      status: 'ok',
      summary: this._parseNmapOutput(result.stdout),
      raw: this.config.storage.persistRawOutput ? this._truncateOutput(result.stdout) : undefined
    };
  }

  async executeMasscan(target, featureConfig = {}) {
    if (!(await this.commandRunner.isAvailable('masscan'))) {
      return {
        status: 'unavailable',
        message: 'masscan is not available on this system'
      };
    }

    const ports = featureConfig.ports ?? '1-65535';
    const rate = featureConfig.rate ?? 1000;

    const args = ['-p', ports, target.host, '--rate', String(rate), '--wait', '0'];
    const result = await this.commandRunner.run('masscan', args, {
      timeout: featureConfig.timeout ?? 30000,
      maxBuffer: 4 * 1024 * 1024
    });

    if (!result.ok) {
      return {
        status: result.error?.code === 'ENOENT' ? 'unavailable' : 'error',
        message: result.error?.message || 'masscan scan failed',
        stderr: result.stderr
      };
    }

    const openPorts = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.toLowerCase().startsWith('discovered open port'))
      .map((line) => {
        const parts = line.split(' ');
        const portProto = parts[3];
        const ip = parts[5];
        return {
          port: portProto,
          ip
        };
      });

    return {
      status: openPorts.length ? 'ok' : 'empty',
      openPorts,
      raw: this.config.storage.persistRawOutput ? this._truncateOutput(result.stdout) : undefined
    };
  }

  _parseNmapOutput(raw) {
    const lines = raw.split('\n');
    const openPorts = [];
    const detectedServices = [];

    for (const line of lines) {
      const match = line.match(/^(\d+\/[a-z]+)\s+(open|filtered|closed)\s+([^\s]+)(.*)$/);
      if (match && match[2] === 'open') {
        const port = match[1];
        const service = match[3];
        const detail = match[4]?.trim();
        openPorts.push({ port, service, detail });
        detectedServices.push(`${service}${detail ? ` ${detail}` : ''}`.trim());
      }
    }

    return {
      openPorts,
      detectedServices: Array.from(new Set(detectedServices))
    };
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
