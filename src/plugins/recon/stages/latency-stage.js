/**
 * LatencyStage
 *
 * Network latency measurement:
 * - Ping (ICMP echo) with metrics
 * - Traceroute (mtr or traceroute)
 * - Hop analysis
 */

export class LatencyStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async executePing(target) {
    const args = ['-n', '-c', String(this.config.ping.count), target.host];
    const run = await this.commandRunner.run('ping', args, {
      timeout: this.config.ping.timeout
    });

    if (!run.ok) {
      return {
        status: 'unavailable',
        message: run.error?.message || 'Ping failed',
        stderr: run.stderr
      };
    }

    const metrics = this._parsePingOutput(run.stdout);

    return {
      status: 'ok',
      stdout: run.stdout,
      metrics
    };
  }

  async executeTraceroute(target) {
    if (await this.commandRunner.isAvailable('mtr')) {
      const args = [
        '--report',
        '--report-cycles',
        String(this.config.traceroute.cycles),
        '--json',
        target.host
      ];
      const mtrResult = await this.commandRunner.run('mtr', args, {
        timeout: this.config.traceroute.timeout,
        maxBuffer: 4 * 1024 * 1024
      });

      if (mtrResult.ok) {
        try {
          const parsed = JSON.parse(mtrResult.stdout);
          return {
            status: 'ok',
            type: 'mtr',
            report: parsed
          };
        } catch (error) {
          // Fallback to plain text interpretation
          return {
            status: 'ok',
            type: 'mtr',
            stdout: mtrResult.stdout
          };
        }
      }
    }

    if (await this.commandRunner.isAvailable('traceroute')) {
      const tracerouteResult = await this.commandRunner.run(
        'traceroute',
        ['-n', target.host],
        {
          timeout: this.config.traceroute.timeout
        }
      );

      if (tracerouteResult.ok) {
        return {
          status: 'ok',
          type: 'traceroute',
          stdout: tracerouteResult.stdout
        };
      }
    }

    return {
      status: 'unavailable',
      message: 'Neither mtr nor traceroute is available'
    };
  }

  _parsePingOutput(text) {
    const metrics = {
      packetsTransmitted: null,
      packetsReceived: null,
      packetLoss: null,
      min: null,
      avg: null,
      max: null,
      stdDev: null
    };

    const packetLine = text.split('\n').find((line) => line.includes('packets transmitted'));
    if (packetLine) {
      const match = packetLine.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+received,.*?([\d.]+)% packet loss/);
      if (match) {
        metrics.packetsTransmitted = Number(match[1]);
        metrics.packetsReceived = Number(match[2]);
        metrics.packetLoss = Number(match[3]);
      }
    }

    const statsLine = text.split('\n').find((line) => line.includes('min/avg/max'));
    if (statsLine) {
      const match = statsLine.match(/=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      if (match) {
        metrics.min = Number(match[1]);
        metrics.avg = Number(match[2]);
        metrics.max = Number(match[3]);
        metrics.stdDev = Number(match[4]);
      }
    }

    return metrics;
  }
}
