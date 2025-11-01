/**
 * TlsAuditStage
 *
 * TLS/SSL security auditing:
 * - openssl (basic TLS info)
 * - sslyze (comprehensive TLS scanner)
 * - testssl.sh (detailed SSL/TLS testing)
 * - sslscan (fast SSL/TLS scanner)
 */

export class TlsAuditStage {
  constructor(plugin) {
    this.plugin = plugin;
    this.commandRunner = plugin.commandRunner;
    this.config = plugin.config;
  }

  async execute(target, featureConfig = {}) {
    const tools = {};
    const port = target.port || 443;

    const executeAudit = async (name, command, args) => {
      const run = await this.commandRunner.run(command, args, {
        timeout: featureConfig.timeout ?? 20000,
        maxBuffer: 4 * 1024 * 1024
      });
      if (!run.ok) {
        tools[name] = {
          status: run.error?.code === 'ENOENT' ? 'unavailable' : 'error',
          message: run.error?.message || `${command} failed`,
          stderr: run.stderr
        };
        return;
      }
      tools[name] = {
        status: 'ok'
      };
      if (this.config.storage.persistRawOutput) {
        tools[name].raw = this._truncateOutput(run.stdout);
      }
    };

    if (featureConfig.openssl) {
      await executeAudit('openssl', 'openssl', ['s_client', '-servername', target.host, '-connect', `${target.host}:${port}`, '-brief']);
    }

    if (featureConfig.sslyze) {
      await executeAudit('sslyze', 'sslyze', [target.host]);
    }

    if (featureConfig.testssl) {
      await executeAudit('testssl', 'testssl.sh', ['--quiet', `${target.host}:${port}`]);
    }

    if (featureConfig.sslscan) {
      await executeAudit('sslscan', 'sslscan', [`${target.host}:${port}`]);
    }

    if (Object.keys(tools).length === 0) {
      return { status: 'skipped' };
    }

    return {
      _individual: tools,
      _aggregated: {
        status: Object.values(tools).some((tool) => tool.status === 'ok') ? 'ok' : 'empty',
        tools
      },
      status: Object.values(tools).some((tool) => tool.status === 'ok') ? 'ok' : 'empty',
      tools
    };
  }

  _truncateOutput(text, maxLength = 10000) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n... (truncated)';
  }
}
